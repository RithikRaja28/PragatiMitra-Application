"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { writeAuditLog } = require("../utils/audit");
const { translateRow, resolveTranslationMode, enrichSchemaLabels } = require("../services/translationService");
const { getAcademicYearLockBlockForReq } = require("../services/academicYearService");
const { getEffectiveState, messageFor, canWrite } = require("../services/stateResolver");
const { SOURCE_LANGUAGE, isDerivedRow } = require("../services/translationOwnership");
const { assertEquivalent } = require("../services/equivalenceGuard");

/* Latest active schema year for a form+institution — used to resolve which
   academic year a record operation belongs to (for academic-year lock checks). */
async function getFormActiveYear(pool, formName, institutionId) {
  const { rows } = await pool.query(
    `SELECT year FROM custom_field_schemas
     WHERE form_name = $1 AND institution_id = $2 AND is_active = true
     ORDER BY year DESC LIMIT 1`,
    [formName, institutionId]
  );
  return rows[0]?.year ?? null;
}

const router = express.Router();
router.use(verifyToken);

// Session-level cache: prevents repeated ALTER TABLE calls for source_row_id column
const ensuredSourceRowIdTables = new Set();

async function ensureSourceRowIdColumn(pool, tableName) {
  if (ensuredSourceRowIdTables.has(tableName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS source_row_id UUID`);
  ensuredSourceRowIdTables.add(tableName);
}

function validateFormName(name) {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

/* Form-level Hindi translation toggle (table_list.translate_to_hindi).
   When FALSE, the entire Hindi pipeline is skipped: no Google Translate /
   transliteration call and no Hindi mirror row. Defaults to TRUE when the
   row/column is missing so existing forms behave exactly as before. */
async function isHindiTranslationEnabled(pool, formName) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(translate_to_hindi, true) AS enabled FROM table_list WHERE form_name = $1`,
      [formName]
    );
    return rows.length ? rows[0].enabled !== false : true;
  } catch {
    return true; // never block a submission because a metadata read failed
  }
}

function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}

/* ════════════════════════════════════════════════════════════════════
   resolveUserContext
   - institute_admin → departmentId = null  (sees ALL dept records)
   - department_admin → departmentId = theirs (sees ONLY their dept)
   - super_admin     → reads from body/query
════════════════════════════════════════════════════════════════════ */
async function resolveUserContext(pool, req) {
  const roles = req.user.roles || [];
  const isSuperAdmin = roles.includes("super_admin");

  if (isSuperAdmin) {
    return {
      institutionId: req.body?.institution_id || req.query?.institution_id || null,
      departmentId:  req.body?.department_id  || req.query?.department_id  || null,
      role: "super_admin",
    };
  }

  const { rows } = await pool.query(
    "SELECT institution_id, department_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  const user = rows[0] || {};

  const isDeptAdmin = roles.includes("department_admin") || roles.includes("nodal_officer");

  return {
    institutionId: user.institution_id || null,
    departmentId:  isDeptAdmin ? (user.department_id || null) : null,
    role: isDeptAdmin ? "department_admin" : "institute_admin",
  };
}

async function getActiveSchema(pool, formName, institutionId, year) {
  // Primary: institution-specific row (private forms always resolve here;
  // shared-form creator resolves here too).
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year) { q += ` AND year = $3`; params.push(year); }
  q += ` ORDER BY year DESC LIMIT 1`;
  const { rows } = await pool.query(q, params);
  if (rows[0]) return rows[0];

  // Fallback: shared forms have one canonical schema row (the creator's).
  // Non-creator institutions use it directly — no per-institution copy needed.
  // The share_table guard ensures private forms are never affected.
  const fbParams = [formName];
  let fq = `SELECT cfs.* FROM custom_field_schemas cfs
            JOIN table_list tl ON tl.form_name = cfs.form_name
            WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true`;
  if (year) { fq += ` AND cfs.year = $2`; fbParams.push(year); }
  fq += ` ORDER BY cfs.year DESC LIMIT 1`;
  const { rows: fb } = await pool.query(fq, fbParams);
  return fb[0] || null;
}

function activeFields(schemaRow) {
  const excluded = new Set(schemaRow.schema?.excluded_fixed_columns || []);
  const seen = new Set();
  return (schemaRow.schema?.fields || []).filter((f) => {
    const col = dbCol(f.column_name);
    if (excluded.has(col) || excluded.has(f.column_name)) return false;
    if (seen.has(col)) return false;
    seen.add(col);
    return true;
  });
}

/* Returns { locked, message } — chooses the deadline-expired message when the
   lock is the result of an expired deadline, otherwise the manual-lock message.

   Output-equivalence harness (Phase 1): the original inline logic is authoritative
   (`legacy`); the stateResolver version runs as a shadow `candidate`. They are
   compared and any divergence is logged — legacy output always wins. */
async function getLockBlock(pool, formName, institutionId) {
  const { rows } = await pool.query(
    `SELECT flc.is_locked, flc.auto_locked, flc.deadline_at
     FROM form_lock_config flc
     WHERE flc.form_name = $1 AND flc.institution_id = $2`,
    [formName, institutionId]
  );
  const row = rows[0];

  // LEGACY (authoritative).
  let legacy;
  if (!row?.is_locked) {
    legacy = { locked: false, message: null };
  } else {
    const expired =
      row.auto_locked ||
      (row.deadline_at && new Date(row.deadline_at).getTime() <= Date.now());
    legacy = {
      locked: true,
      message: expired
        ? "This form deadline has expired for your institution. The form is automatically locked."
        : "This form is currently locked by the institution admin. You can only view the records.",
    };
  }

  // CANDIDATE (shadow — stateResolver precedence). Archive isn't a concept here.
  const state = getEffectiveState({
    archived: false,
    locked: !!row?.is_locked,
    autoLocked: !!row?.auto_locked,
    deadlineAt: row?.deadline_at ?? null,
  });
  const candidate = canWrite(state)
    ? { locked: false, message: null }
    : { locked: true, message: messageFor(state) };

  return assertEquivalent("formData.getLockBlock", legacy, candidate);
}

/* Map each field's DB column → its resolved translation mode
   (transliterate | translate | none). Drives translateRow(). */
function buildFieldModes(fields) {
  const modes = {};
  for (const f of fields) {
    modes[dbCol(f.column_name)] = resolveTranslationMode(f);
  }
  return modes;
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/form-data/:formName/records
   SCOPING:
   - dept admin  → institution_id + language filter + dept scope
   - inst/super  → institution_id + language filter (all departments)
   Returns lock info alongside records.
─────────────────────────────────────────────────────────────────────── */
router.get("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year, language = SOURCE_LANGUAGE } = req.query;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, year);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found for this form." });

    const queryParams = [ctx.institutionId];
    const deptClause  = (ctx.role === "department_admin" && ctx.departmentId)
      ? (() => { queryParams.push(ctx.departmentId); return `AND (department_id = $${queryParams.length} OR department_id IS NULL)`; })()
      : "";

    let recordsQuery;
    if (language === "en") {
      recordsQuery = `SELECT * FROM ${formName}_records
                      WHERE institution_id = $1 AND (language = 'en' OR language IS NULL)
                      ${deptClause}
                      ORDER BY created_at DESC`;
    } else {
      /* For non-English: return translated rows where they exist, PLUS English
         rows that have no translated mirror (imported records, translation-disabled
         forms). This prevents the blank-screen when Hindi rows are absent. */
      queryParams.push(language);
      const langParam = `$${queryParams.length}`;
      recordsQuery = `
        WITH has_translation AS (
          SELECT source_row_id
          FROM   ${formName}_records
          WHERE  language = ${langParam}
            AND  source_row_id IS NOT NULL
            AND  institution_id = $1
        )
        SELECT * FROM ${formName}_records
        WHERE institution_id = $1
          ${deptClause}
          AND (
            language = ${langParam}
            OR (
              (language = 'en' OR language IS NULL)
              AND id NOT IN (SELECT source_row_id FROM has_translation)
            )
          )
        ORDER BY created_at DESC`;
    }

    const { rows: records } = await pool.query(recordsQuery, queryParams);

    const { rows: lockRows } = await pool.query(
      `SELECT is_locked, locked_by, locked_at, deadline_at, COALESCE(auto_locked, false) AS auto_locked
       FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, ctx.institutionId]
    );
    const lock = lockRows[0] || { is_locked: false, locked_by: null, locked_at: null, deadline_at: null, auto_locked: false };

    /* Enrich schema labels for non-English responses so the frontend can show
       translated headers without a separate translation request. */
    const displaySchema = language !== "en"
      ? await enrichSchemaLabels(schema, language)
      : schema;

    return res.json({ success: true, records, schema: displaySchema, lock });
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/form-data/:formName/records/:id/counterpart
   Returns the linked row in the OTHER language for the read-only reference pane
   of the edit dialog:
     - editing a Hindi row → returns its English source row (source_row_id)
     - editing an English row → returns its Hindi mirror (if any)
   Never used to edit. Scoped to the caller's institution (and department).
   ⚠️  Registered before PUT/DELETE /:formName/records/:id — distinct method/path.
─────────────────────────────────────────────────────────────────────── */
router.get("/:formName/records/:id/counterpart", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    let selfWhere = "id = $1 AND institution_id = $2";
    const selfVals = [id, ctx.institutionId];
    if (ctx.role === "department_admin" && ctx.departmentId) {
      selfWhere += ` AND (department_id = $3 OR department_id IS NULL)`;
      selfVals.push(ctx.departmentId);
    }

    const { rows: selfRows } = await pool.query(
      `SELECT * FROM ${formName}_records WHERE ${selfWhere}`,
      selfVals
    );
    if (!selfRows.length)
      return res.status(404).json({ success: false, message: "Record not found." });

    const self = selfRows[0];
    let counterpart = null;

    // Shadow-equivalence: legacy boolean is authoritative; isDerivedRow is the candidate.
    const selfIsDerivedLegacy = self.language === "hi" && !!self.source_row_id;
    const selfIsDerived = assertEquivalent(
      "formData.isDerivedRow", selfIsDerivedLegacy, isDerivedRow(self)
    );
    if (selfIsDerived) {
      // Derived (Hindi) row → its counterpart is the English source it points to.
      const { rows } = await pool.query(
        `SELECT * FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
        [self.source_row_id, ctx.institutionId]
      );
      counterpart = rows[0] || null;
    } else {
      const { rows } = await pool.query(
        `SELECT * FROM ${formName}_records WHERE source_row_id = $1 AND institution_id = $2 LIMIT 1`,
        [self.id, ctx.institutionId]
      );
      counterpart = rows[0] || null;
    }

    return res.json({ success: true, record: counterpart });
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records/${id}/counterpart`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch counterpart record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/form-data/:formName/records
   Lock-checked. Inserts English row then synchronously awaits the Hindi
   mirror before responding, so the Hindi row is always present when the
   client re-fetches records immediately after save.
   Tags department_id from user context.
─────────────────────────────────────────────────────────────────────── */
router.post("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { data, year, language = SOURCE_LANGUAGE } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!data || typeof data !== "object")
    return res.status(400).json({ success: false, message: "data is required." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId);
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, year);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const fieldModes = buildFieldModes(fields);
    const formYear  = Number(year) || schema.year;
    const createdBy = req.user.userId || null;

    // Academic-year lock — checks the SELECTED year (X-Academic-Year header),
    // falling back to the schema year. View-only when locked.
    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, formYear);
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "created_by"];
    const stdVals = [formName, ctx.institutionId, ctx.departmentId, formYear, schema.id, language, createdBy];
    const fieldVals = fieldCols.map((col) => data[col] ?? null);

    const allCols = [...stdCols, ...fieldCols];
    const allVals = [...stdVals, ...fieldVals];
    const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${formName}_records (${allCols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      allVals
    );
    const enRow = rows[0];

    await writeAuditLog(req, {
      actionType: "FORM_DATA_CREATED",
      entityType: "form_data",
      entityId: enRow.id,
      newValue: { form_name: formName, institution_id: ctx.institutionId, department_id: ctx.departmentId },
      message: `Form Data Added - "${formName}"`,
    });

    // Synchronously generate the Hindi mirror row before responding so the
    // client re-fetching records immediately after save always sees it.
    // Only generated for English submissions when this form has the Hindi
    // translation toggle enabled — when disabled we store only the English
    // row (no translation/transliteration API call). Translation failure is
    // logged but does not fail the response — the English row is already
    // committed.
    if (language === "en" && await isHindiTranslationEnabled(pool, formName)) {
      const tableName = `${formName}_records`;
      try {
        await ensureSourceRowIdColumn(pool, tableName);

        const hiData = await translateRow(data, fieldModes);
        const hiStdVals = [formName, ctx.institutionId, ctx.departmentId, formYear, schema.id, "hi", createdBy];
        const hiFieldVals = fieldCols.map((col) => hiData[col] ?? null);
        const hiAllCols = [...stdCols, ...fieldCols, "source_row_id"];
        const hiAllVals = [...hiStdVals, ...hiFieldVals, enRow.id];
        const hiPlaceholders = hiAllVals.map((_, i) => `$${i + 1}`).join(", ");

        await pool.query(
          `INSERT INTO ${tableName} (${hiAllCols.join(", ")}) VALUES (${hiPlaceholders})`,
          hiAllVals
        );
      } catch (err) {
        logger.error(`Hindi row insert failed for ${formName}`, { stack: err.stack });
      }
    }

    return res.json({ success: true, record: enRow, message: "Record created successfully." });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/form-data/:formName/records/:id
   Lock-checked. Updates English row then synchronously awaits the Hindi
   mirror update before responding.
   Dept admin can only update records in their own department.
─────────────────────────────────────────────────────────────────────── */
router.put("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;
  const { data } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!data || typeof data !== "object")
    return res.status(400).json({ success: false, message: "data is required." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId);
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, null);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });

    // Academic-year lock — checks the SELECTED year (header), falling back to
    // the schema year. View-only when locked.
    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, schema.year);
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const fieldModes = buildFieldModes(fields);

    /* Determine which language row is being edited so we apply the right rule:
         en → update the English row AND regenerate its linked Hindi mirror
         hi → update ONLY this Hindi row (English untouched, no reverse translation)
       The language is read from the DB (not trusted from the client). */
    const { rows: targetRows } = await pool.query(
      `SELECT language FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
      [id, ctx.institutionId]
    );
    if (!targetRows.length)
      return res.status(404).json({ success: false, message: "Record not found." });
    const editedLanguage = targetRows[0].language === "hi" ? "hi" : "en";

    let idx = 1;
    const setClauses = [...fieldCols.map((col) => `${col} = $${idx++}`), `updated_at = now()`];

    let whereClause = `institution_id = $${idx++} AND id = $${idx++}`;
    const whereVals = [ctx.institutionId, id];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $${idx++} OR department_id IS NULL)`;
      whereVals.push(ctx.departmentId);
    }

    const vals = [...fieldCols.map((col) => data[col] ?? null), ...whereVals];

    const { rows } = await pool.query(
      `UPDATE ${formName}_records SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`,
      vals
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "Record not found." });

    await writeAuditLog(req, {
      actionType: "FORM_DATA_UPDATED",
      entityType: "form_data",
      entityId: id,
      newValue: { form_name: formName, institution_id: ctx.institutionId },
      message: `Form Data Updated - "${formName}"`,
    });

    // Synchronously update the linked Hindi row before responding. Same
    // contract as POST: failure is logged but does not surface to the client.
    // Only runs when an English row was edited AND this form has Hindi
    // translation enabled. When editedLanguage === "hi", the UPDATE above
    // already saved the Hindi row directly; no translation pipeline runs
    // and the English row is left untouched.
    if (editedLanguage === "en" && await isHindiTranslationEnabled(pool, formName)) {
      const tableName = `${formName}_records`;
      try {
        await ensureSourceRowIdColumn(pool, tableName);

        const hiData = await translateRow(data, fieldModes);
        let hidx = 1;
        const hiSetClauses = fieldCols.map((col) => `${col} = $${hidx++}`);
        hiSetClauses.push(`updated_at = now()`);
        const hiVals = [...fieldCols.map((col) => hiData[col] ?? null), id];

        await pool.query(
          `UPDATE ${tableName} SET ${hiSetClauses.join(", ")}
           WHERE source_row_id = $${hidx}`,
          hiVals
        );
      } catch (err) {
        logger.error(`Hindi row update failed for ${formName}/${id}`, { stack: err.stack });
      }
    }

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error(`PUT /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/bulk-delete
   Body: { ids: string[] }  — up to 5 000 UUIDs

   ⚠️  REGISTERED BEFORE /:formName/records/:id  — critical ordering.
       If the single-delete route came first, Express would match
       "bulk-delete" as the :id param and this route would never run.
─────────────────────────────────────────────────────────────────────── */
router.delete("/:formName/records/bulk-delete", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { ids } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });

  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: "ids must be a non-empty array." });

  if (ids.length > 5000)
    return res.status(400).json({
      success: false,
      message: "Cannot bulk-delete more than 5 000 records at once. Split into smaller batches.",
    });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const badIds  = ids.filter((id) => !UUID_RE.test(id));
  if (badIds.length > 0)
    return res.status(400).json({ success: false, message: `${badIds.length} invalid ID(s) in request.` });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId);
    if (lockBlock.locked)
      return res.status(403).json({ success: false, message: lockBlock.message });

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    let whereClause   = "id = ANY($1::uuid[]) AND institution_id = $2";
    const queryParams = [ids, ctx.institutionId];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += " AND (department_id = $3 OR department_id IS NULL)";
      queryParams.push(ctx.departmentId);
    }

    const { rows: deletedRows, rowCount } = await pool.query(
      `DELETE FROM ${formName}_records WHERE ${whereClause} RETURNING id`,
      queryParams
    );

    if (deletedRows.length > 0) {
      await pool.query(
        `DELETE FROM ${formName}_records
         WHERE source_row_id = ANY($1::uuid[]) AND institution_id = $2`,
        [deletedRows.map((r) => r.id), ctx.institutionId]
      );
    }

    const deleted = rowCount ?? 0;
    const failed  = ids.length - deleted;

    if (deleted > 0) {
      await writeAuditLog(req, {
        actionType: "FORM_DATA_BULK_DELETED",
        entityType: "form_data",
        entityId: null,
        newValue: { form_name: formName, institution_id: ctx.institutionId, deleted_count: deleted, requested_count: ids.length },
        message: `Form Data Deleted - "${formName}" (${deleted} record${deleted !== 1 ? "s" : ""})`,
      });
    }

    logger.info(`Bulk delete ${formName}: ${deleted} deleted, ${failed} not matched`, {
      institutionId: ctx.institutionId,
      departmentId:  ctx.departmentId,
      requested:     ids.length,
    });

    return res.json({
      success: true,
      deleted,
      failed,
      message: failed === 0
        ? `${deleted} record${deleted !== 1 ? "s" : ""} deleted successfully.`
        : `${deleted} deleted, ${failed} could not be deleted (not found or no permission).`,
    });
  } catch (err) {
    logger.error(`DELETE /api/form-data/${formName}/records/bulk-delete`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Bulk delete failed." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/:id   (single record)
   Lock-checked. Deletes the English row and its linked Hindi row.
   ⚠️  Must stay AFTER the bulk-delete route above.
─────────────────────────────────────────────────────────────────────── */
router.delete("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId);
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    let whereClause = "(id = $1 OR source_row_id = $1) AND institution_id = $2";
    const whereVals = [id, ctx.institutionId];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $3 OR department_id IS NULL)`;
      whereVals.push(ctx.departmentId);
    }

    const { rowCount } = await pool.query(
      `DELETE FROM ${formName}_records WHERE ${whereClause}`,
      whereVals
    );

    if (!rowCount)
      return res.status(404).json({ success: false, message: "Record not found." });

    await writeAuditLog(req, {
      actionType: "FORM_DATA_DELETED",
      entityType: "form_data",
      entityId: id,
      newValue: { form_name: formName, institution_id: ctx.institutionId },
      message: `Form Data Deleted - "${formName}"`,
    });

    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    logger.error(`DELETE /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

module.exports = router;
