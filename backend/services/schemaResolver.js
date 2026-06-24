"use strict";

/**
 * schemaResolver.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for "what is the schema of a shared form".
 *
 * A shared form (one row in table_list with multiple institutions in
 * institute_access) has one canonical schema STRUCTURE. Historically each
 * institution gets its own physical custom_field_schemas row (cloned by
 * schemaPropagationService) — convenient, but it means the canonical structure
 * is implicit and could drift between institutions.
 *
 * This module names the canonical schema and provides a COMPATIBILITY RESOLVER
 * so every reader resolves the same structure:
 *
 *   form
 *    ├── master schema  (canonical structure — getCanonicalSchema)
 *    └── institution rows = references that carry only institution STATE
 *        (lock / archive / deadline / year / visibility) — and those live in
 *        form_lock_config / academic_year_form_config, NEVER in the schema JSON.
 *
 * IMPORTANT — this is read-side and NON-MUTATING. It performs no migration, no
 * regeneration, creates no tables, and never rewrites an existing schema row.
 * An institution that already has its own active schema row keeps using it
 * (behavior unchanged); only a MISSING row falls back to the canonical schema,
 * which is exactly what schemaPropagationService would have cloned anyway.
 * ───────────────────────────────────────────────────────────────────────── */

/* The canonical schema for a form = its creator/earliest active schema row.
   This is the SAME selection schemaPropagationService has always used as the
   clone template, extracted here so there is one definition of "canonical".
   Returns the full row (schema, year, used_column_names, created_by, …) or null. */
async function getCanonicalSchema(pool, formName) {
  if (!formName || !/^[a-z][a-z0-9_]*$/.test(formName)) return null;
  const { rows } = await pool.query(
    `SELECT * FROM custom_field_schemas
      WHERE form_name = $1 AND is_active = true
      ORDER BY created_at ASC NULLS LAST, year ASC
      LIMIT 1`,
    [formName]
  );
  return rows[0] || null;
}

/* Resolve the schema row a given institution should use for a form.
   • If the institution has its own active row → return it (unchanged behavior).
   • Otherwise → fall back to the canonical schema (compatibility: old/missing
     rows keep working). Returns the row or null. */
async function resolveInstitutionSchema(pool, formName, institutionId) {
  if (!formName || !/^[a-z][a-z0-9_]*$/.test(formName)) return null;

  if (institutionId) {
    const { rows } = await pool.query(
      `SELECT * FROM custom_field_schemas
        WHERE form_name = $1 AND institution_id = $2 AND is_active = true
        ORDER BY year DESC
        LIMIT 1`,
      [formName, institutionId]
    );
    if (rows[0]) return rows[0];
  }

  return getCanonicalSchema(pool, formName);
}

/* Returns the first-created active schema row — the "base" row whose fields
   have real physical columns in *_records. Sorted by created_at ASC (not year)
   because a form activated for an earlier year later has a smaller year but a
   later created_at; year ASC would incorrectly treat that empty row as the base. */
async function getBaseSchemaRow(pool, formName, institutionId) {
  const { rows } = await pool.query(
    `SELECT * FROM custom_field_schemas
     WHERE form_name = $1 AND institution_id = $2 AND is_active = true
     ORDER BY created_at ASC NULLS LAST LIMIT 1`,
    [formName, institutionId]
  );
  if (rows[0]) return rows[0];
  // Shared-form fallback: use the creator's earliest row.
  const { rows: fb } = await pool.query(
    `SELECT cfs.* FROM custom_field_schemas cfs
     JOIN table_list tl ON tl.form_name = cfs.form_name
     WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true
     ORDER BY cfs.created_at ASC NULLS LAST LIMIT 1`,
    [formName]
  );
  return fb[0] || null;
}

/**
 * Resolve the active schema for (formName, institutionId, year) using the same
 * multi-step fallback logic as formData.js / forms.js institution-records:
 *   1. Institution row for the exact year (or latest active if year omitted)
 *   2. Shared-form canonical row (same year preference)
 *   3. Merge base fields + extra fields for legacy extra-only rows
 */
async function getActiveSchema(pool, formName, institutionId, year) {
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year != null) { q += ` AND year = $3`; params.push(Number(year)); }
  q += ` ORDER BY year DESC LIMIT 1`;
  const { rows } = await pool.query(q, params);
  let row = rows[0] || null;

  // Fallback: shared forms have a canonical schema row owned by the creator.
  if (!row) {
    const fbParams = [formName];
    let fq = `SELECT cfs.* FROM custom_field_schemas cfs
              JOIN table_list tl ON tl.form_name = cfs.form_name
              WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true`;
    if (year != null) { fq += ` AND cfs.year = $2`; fbParams.push(Number(year)); }
    fq += ` ORDER BY cfs.year DESC LIMIT 1`;
    const { rows: fb } = await pool.query(fq, fbParams);
    row = fb[0] || null;
  }
  if (!row) return null;

  // Merge legacy extra-only rows with the base row so all fields are visible.
  const baseRow = await getBaseSchemaRow(pool, formName, row.institution_id || institutionId);
  if (!baseRow || baseRow.id === row.id) return row;

  const baseFields     = baseRow.schema?.fields || [];
  const rowFields      = row.schema?.fields || [];
  const baseFieldNames = new Set(baseFields.map(f => f.column_name));
  const hasBaseFields  = rowFields.some(f => baseFieldNames.has(f.column_name));
  if (hasBaseFields) return row; // complete snapshot — no merge needed

  const uniqueExtra = rowFields.filter(f => !baseFieldNames.has(f.column_name));
  return {
    ...row,
    schema: { ...row.schema, fields: [...baseFields, ...uniqueExtra] },
    used_column_names: [
      ...(baseRow.used_column_names || []),
      ...(row.used_column_names || []).filter(n => !baseFieldNames.has(n)),
    ],
  };
}

module.exports = { getCanonicalSchema, resolveInstitutionSchema, getBaseSchemaRow, getActiveSchema };
