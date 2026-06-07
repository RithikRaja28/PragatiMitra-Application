"use strict";

/**
 * schemaPropagationService.js
 * ─────────────────────────────────────────────────────────────────────────
 * SAFE, INSERT-ONLY fix for shared forms that an institution can access
 * (it's in table_list.institute_access) but for which it has no active
 * custom_field_schemas row — which made the form 404 with
 * "No active schema found for this form."
 *
 * This module ONLY INSERTS missing schema rows by cloning the form's existing
 * active schema (the shared template). It NEVER updates/deletes/replaces an
 * existing schema, never touches records, translation, deadlines, academic
 * years, locks, exports, reports, permissions, or institution mappings.
 *
 * Idempotent: re-running skips institutions that already have a schema, so it
 * doubles as the one-time repair AND the "ensure on future events" hook.
 * ───────────────────────────────────────────────────────────────────────── */

const logger = require("../utils/logger");
const { getCanonicalSchema } = require("./schemaResolver");
const { assertEquivalent } = require("./equivalenceGuard");

/* Provenance columns (Rule 8) on custom_field_schemas — additive, idempotent.
   A row created BY its institution leaves these NULL (it IS the source). A row
   distributed TO a consumer records where it came from. Reference only — never
   used to sync/overwrite the consumer's schema. */
async function ensureSchemaProvenanceColumns(pool) {
  await pool.query(`ALTER TABLE custom_field_schemas ADD COLUMN IF NOT EXISTS source_form_id        uuid`);
  await pool.query(`ALTER TABLE custom_field_schemas ADD COLUMN IF NOT EXISTS source_institution_id uuid`);
  await pool.query(`ALTER TABLE custom_field_schemas ADD COLUMN IF NOT EXISTS published_at          timestamptz`);
}

/* Audit log of inserted schema rows (created only; never modified). */
async function ensureSchemaPropagationLog(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_propagation_log (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_name      TEXT NOT NULL,
      institution_id UUID NOT NULL,
      academic_year  INT,
      action         TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/* Ensure every institution in a form's institute_access has an active schema.
   INSERT-ONLY: clones the form's existing active schema for any institution
   that is missing one. Returns { created }. Wrapped in a transaction. */
async function ensureSchemaExists(pool, formName) {
  if (!formName || !/^[a-z][a-z0-9_]*$/.test(formName)) return { created: 0 };

  // 1. Form + its access list.
  const { rows: tl } = await pool.query(
    `SELECT id, COALESCE(institute_access, '{}') AS institute_access, share_table
       FROM table_list WHERE form_name = $1`,
    [formName]
  );
  if (!tl.length) return { created: 0 };
  const sourceFormId = tl[0].id;                     // provenance: source_form_id
  const access = (tl[0].institute_access || []).map(String).filter(Boolean);
  if (access.length === 0) return { created: 0 };

  // 2. Template = the form's CANONICAL schema (single source of truth — the
  //    creator/earliest active row). Resolved via schemaResolver so "canonical"
  //    has one definition shared with every reader.
  //    Phase-1 shadow: assert the resolver picks the SAME row the legacy inline
  //    query did (identical SELECT → never fires); legacy id is authoritative.
  const { rows: legacyTmpl } = await pool.query(
    `SELECT * FROM custom_field_schemas
      WHERE form_name = $1 AND is_active = true
      ORDER BY created_at ASC NULLS LAST, year ASC
      LIMIT 1`,
    [formName]
  );
  const t = legacyTmpl[0] || null;
  const canonical = await getCanonicalSchema(pool, formName);
  assertEquivalent(
    "schemaPropagation.canonicalTemplate",
    t ? String(t.id) : null,
    canonical ? String(canonical.id) : null
  );
  if (!t) return { created: 0 }; // nothing to clone from — leave untouched

  // 3. Institutions that ALREADY have any active schema for this form.
  const { rows: have } = await pool.query(
    `SELECT DISTINCT institution_id FROM custom_field_schemas
      WHERE form_name = $1 AND is_active = true`,
    [formName]
  );
  const haveSet = new Set(have.map((r) => String(r.institution_id)));

  const missing = access.filter((id) => !haveSet.has(id));
  if (missing.length === 0) return { created: 0 };

  // 4. Insert ONLY the missing rows (clone structure), with a per-row dedupe
  //    guard on (form_name, institution_id, year). Transactional.
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query("BEGIN");
    for (const inst of missing) {
      const { rows: dup } = await client.query(
        `SELECT 1 FROM custom_field_schemas
          WHERE form_name = $1 AND institution_id = $2 AND year = $3 LIMIT 1`,
        [formName, inst, t.year]
      );
      if (dup.length) continue; // never create a duplicate

      // Snapshot distribution (Rule 8): record provenance on the consumer clone —
      // source_form_id (the shared form), source_institution_id (the creator =
      // canonical row's institution), published_at (now). Reference only; no sync.
      await client.query(
        `INSERT INTO custom_field_schemas
           (form_name, institution_id, year, schema, is_active, created_by, used_column_names,
            source_form_id, source_institution_id, published_at)
         VALUES ($1, $2, $3, $4::jsonb, true, $5, $6, $7, $8, now())`,
        [formName, inst, t.year, JSON.stringify(t.schema), t.created_by ?? null, t.used_column_names ?? null,
         sourceFormId ?? null, t.institution_id ?? null]
      );
      await client.query(
        `INSERT INTO schema_propagation_log (form_name, institution_id, academic_year, action)
         VALUES ($1, $2, $3, 'inserted_missing_schema')`,
        [formName, inst, t.year]
      );
      created += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (created) logger.info(`schema propagation: inserted ${created} missing schema row(s) for "${formName}"`);
  return { created };
}

/* One-time / on-boot repair across all forms that have multiple institutions in
   institute_access. Idempotent — skips anything already present. */
async function propagateAllSharedSchemas(pool) {
  try {
    await ensureSchemaPropagationLog(pool);
    await ensureSchemaProvenanceColumns(pool); // clones below write provenance
    const { rows } = await pool.query(
      `SELECT form_name FROM table_list
        WHERE COALESCE(array_length(institute_access, 1), 0) > 1
        ORDER BY form_name`
    );
    let total = 0;
    for (const r of rows) {
      try {
        const { created } = await ensureSchemaExists(pool, r.form_name);
        total += created;
      } catch (e) {
        logger.error(`schema propagation failed for "${r.form_name}"`, { stack: e.stack });
      }
    }
    logger.info(`schema propagation repair complete — ${total} schema row(s) inserted across ${rows.length} multi-institution form(s)`);
    return total;
  } catch (e) {
    logger.error("propagateAllSharedSchemas failed", { stack: e.stack });
    return 0;
  }
}

module.exports = { ensureSchemaPropagationLog, ensureSchemaProvenanceColumns, ensureSchemaExists, propagateAllSharedSchemas };
