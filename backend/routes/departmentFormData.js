"use strict";

/**
 * routes/departmentFormData.js  →  mounted at /api/department-form-data
 * ─────────────────────────────────────────────────────────────────────────
 * Records CRUD for department forms. Mirrors routes/formData.js (EN row +
 * async Hindi mirror via source_row_id, language-aware reads, lock/deadline
 * enforcement) but operates ONLY on dept_form_<slug> tables scoped by
 * department_id + academic_year. Reads the department_* metadata tables; never
 * touches table_list / custom_field_schemas / form_lock_config / *_records.
 *
 * Path param :id is the department_table_list.id (the form), so two
 * departments with the same slug never collide.
 */

const express = require("express");
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { translateRow, resolveTranslationMode, enrichSchemaLabels } = require("../services/translationService");
const { resolveDeptContext, deptRecordsTable } = require("../services/departmentFormService");
const { getEffectiveState, STATE } = require("../services/stateResolver");
const { resolveActiveAcademicYear } = require("../services/academicYearService");
const { SOURCE_LANGUAGE, isDerivedRow } = require("../services/translationOwnership");

const router = express.Router();
router.use(verifyToken);

/* OWNERSHIP: institution owns the academic year; department inherits it. When a
   request carries no explicit year, resolve the institution's active year so the
   fallback inherits it (not the calendar year). Lookup runs only on the no-year
   path, so normal flows (always ?year) cost nothing. See departmentForms.js. */
function hasExplicitYear(req) {
  return Number.isInteger(Number(req.query.year))
    || Number.isInteger(Number(req.get("X-Academic-Year")))
    || Number.isInteger(Number(req.body?.year));
}
router.use(async (req, _res, next) => {
  try {
    if (!hasExplicitYear(req)) {
      const pool = req.app.locals.pool;
      const { institutionId } = await resolveDeptContext(pool, req);
      req.institutionAcademicYear = await resolveActiveAcademicYear(pool, institutionId);
    }
  } catch {
    /* leave undefined → calendar-year fallback */
  }
  next();
});

const ensuredSourceRowIdTables = new Set();
async function ensureSourceRowIdColumn(pool, tableName) {
  if (ensuredSourceRowIdTables.has(tableName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS source_row_id UUID`);
  ensuredSourceRowIdTables.add(tableName);
}

function dbCol(col) { return col.trim().toLowerCase().replace(/\s+/g, "_"); }
function validSlug(s) { return /^[a-z][a-z0-9_]*$/.test(s); }

function resolveYear(req) {
  const q = Number(req.query.year); if (Number.isInteger(q)) return q;
  const h = Number(req.get("X-Academic-Year")); if (Number.isInteger(h)) return h;
  const b = Number(req.body?.year); if (Number.isInteger(b)) return b;
  if (Number.isInteger(req.institutionAcademicYear)) return req.institutionAcademicYear;
  return new Date().getFullYear();
}

function activeFields(schema) {
  const excluded = new Set(schema?.excluded_fixed_columns || []);
  const seen = new Set();
  return (schema?.fields || []).filter((f) => {
    const col = dbCol(f.column_name);
    if (excluded.has(col) || excluded.has(f.column_name) || seen.has(col)) return false;
    seen.add(col); return true;
  });
}
function buildFieldModes(fields) {
  const modes = {};
  for (const f of fields) modes[dbCol(f.column_name)] = resolveTranslationMode(f);
  return modes;
}

/* Load a department form owned by the caller's department, enforcing role
   access: managers (department_admin / super_admin) always pass; otherwise the
   form must either have no role restriction or list one of the user's roles. */
async function loadForm(pool, req, id) {
  const { departmentId, institutionId } = await resolveDeptContext(pool, req);
  if (!departmentId) return { error: "No department is associated with your account." };
  // Access hierarchy: SAME institution AND SAME department.
  const { rows } = await pool.query(
    "SELECT * FROM department_table_list WHERE id = $1 AND department_id = $2 AND (institution_id = $3 OR institution_id IS NULL)",
    [id, departmentId, institutionId]
  );
  if (!rows.length) return { error: "Form not found in your department." };
  if (!validSlug(rows[0].form_name)) return { error: "Invalid form." };

  const userRoles = req.user.roles || [];
  const isManager = userRoles.includes("department_admin") || userRoles.includes("super_admin");
  if (!isManager) {
    const { rows: rr } = await pool.query(
      "SELECT role_name FROM department_form_roles WHERE department_form_id = $1",
      [id]
    );
    const allowed = rr.map((r) => r.role_name);
    if (allowed.length > 0 && !userRoles.some((r) => allowed.includes(r))) {
      return { error: "You don't have access to this form." };
    }
  }

  return { form: rows[0], departmentId, institutionId };
}

/* Effective lock for (form, year): per-year lock OR manual/auto/deadline lock. */
async function deptLockBlock(pool, form, year) {
  const { rows: ym } = await pool.query(
    "SELECT is_locked FROM department_form_year_mapping WHERE department_form_id = $1 AND academic_year = $2",
    [form.id, year]
  );
  const { rows: lc } = await pool.query(
    "SELECT is_locked, auto_locked, deadline FROM department_form_lock_config WHERE department_form_id = $1",
    [form.id]
  );
  const row = lc[0] || {};
  const deadlineExpired = !!(row.deadline && new Date(row.deadline).getTime() <= Date.now());
  // anyLock folds every blocking source (per-year lock, manual lock, expired
  // deadline) so the shared resolver can pick the precedence + which message
  // applies. Dept keeps its own wording (departments ≠ institutions).
  const anyLock = ym[0]?.is_locked === true || row.is_locked === true || deadlineExpired;
  const state = getEffectiveState({
    locked: anyLock,
    autoLocked: !!row.auto_locked,
    deadlineAt: row.deadline ?? null,
  });
  if (state === STATE.ACTIVE) return { locked: false, message: null };
  const message = state === STATE.DEADLINE_EXPIRED
    ? "This form's deadline has expired for your department — it is now view-only."
    : "This form is locked for your department. You can only view records.";
  return { locked: true, message };
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/records?language=&year=
───────────────────────────────────────────────────────────────────── */
router.get("/:id/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { language = SOURCE_LANGUAGE } = req.query;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    if (!validSlug(form.form_name)) return res.status(400).json({ success: false, message: "Invalid form." });

    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    // Tolerate a missing physical table (e.g. legacy/partial state) — return empty.
    const { rows: ex } = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
      [table]
    );
    if (!ex.length) {
      const lk = await deptLockBlock(pool, form, year);
      return res.json({ success: true, records: [], schema: { schema: form.schema, year, form_name: form.form_name }, translate_enabled: form.translate_enabled, lock: { is_locked: lk.locked, message: lk.message } });
    }
    await ensureSourceRowIdColumn(pool, table);

    const params = [departmentId, year];
    let recordsQuery;
    if (language === "en") {
      recordsQuery = `SELECT * FROM ${table}
                      WHERE department_id = $1 AND academic_year = $2 AND (language = 'en' OR language IS NULL)
                      ORDER BY role_name NULLS LAST, created_at DESC`;
    } else {
      params.push(language);
      const lp = `$${params.length}`;
      recordsQuery = `
        WITH has_translation AS (
          SELECT source_row_id FROM ${table}
          WHERE language = ${lp} AND source_row_id IS NOT NULL AND department_id = $1 AND academic_year = $2
        )
        SELECT * FROM ${table}
        WHERE department_id = $1 AND academic_year = $2
          AND ( language = ${lp}
             OR ((language = 'en' OR language IS NULL) AND id NOT IN (SELECT source_row_id FROM has_translation)) )
        ORDER BY role_name NULLS LAST, created_at DESC`;
    }

    const { rows: records } = await pool.query(recordsQuery, params);
    const lock = await deptLockBlock(pool, form, year);
    const displaySchema = language !== "en"
      ? await enrichSchemaLabels({ schema: form.schema }, language).then((s) => s.schema || form.schema).catch(() => form.schema)
      : form.schema;

    return res.json({
      success: true,
      records,
      schema: { schema: displaySchema, year, form_name: form.form_name },
      translate_enabled: form.translate_enabled,
      lock: { is_locked: lock.locked, message: lock.message },
    });
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/records", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* GET counterpart (read-only reference for the edit dialog). */
router.get("/:id/records/:recordId/counterpart", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    await ensureSourceRowIdColumn(pool, table);

    const { rows: selfRows } = await pool.query(
      `SELECT * FROM ${table} WHERE id = $1 AND department_id = $2`,
      [req.params.recordId, departmentId]
    );
    if (!selfRows.length) return res.status(404).json({ success: false, message: "Record not found." });
    const self = selfRows[0];
    let counterpart = null;
    if (isDerivedRow(self)) {
      // Derived (Hindi) row → its counterpart is the English source it points to.
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND department_id = $2`, [self.source_row_id, departmentId]);
      counterpart = rows[0] || null;
    } else {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE source_row_id = $1 AND department_id = $2 LIMIT 1`, [self.id, departmentId]);
      counterpart = rows[0] || null;
    }
    return res.json({ success: true, record: counterpart });
  } catch (err) {
    logger.error("GET /api/department-form-data counterpart", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch counterpart." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-form-data/:id/records   { data, role_name?, language? }
───────────────────────────────────────────────────────────────────── */
router.post("/:id/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { data, role_name = null, language = SOURCE_LANGUAGE } = req.body;
  if (!data || typeof data !== "object")
    return res.status(400).json({ success: false, message: "data is required." });
  try {
    const { form, departmentId, institutionId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    const fields = activeFields(form.schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const fieldModes = buildFieldModes(fields);
    const createdBy = req.user.userId || null;

    const stdCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id", "language", "created_by"];
    const stdVals = [form.form_name, departmentId, institutionId, year, role_name, form.id, language, createdBy];
    const allCols = [...stdCols, ...fieldCols];
    const allVals = [...stdVals, ...fieldCols.map((c) => data[c] ?? null)];
    const ph = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${ph}) RETURNING *`,
      allVals
    );
    const enRow = rows[0];

    if (language === "en" && form.translate_enabled !== false) {
      setImmediate(async () => {
        try {
          await ensureSourceRowIdColumn(pool, table);
          const hiData = await translateRow(data, fieldModes);
          const hiCols = [...stdCols, ...fieldCols, "source_row_id"];
          const hiVals = [form.form_name, departmentId, institutionId, year, role_name, form.id, "hi", createdBy,
                          ...fieldCols.map((c) => hiData[c] ?? null), enRow.id];
          const hiPh = hiVals.map((_, i) => `$${i + 1}`).join(", ");
          await pool.query(`INSERT INTO ${table} (${hiCols.join(", ")}) VALUES (${hiPh})`, hiVals);
        } catch (e) {
          logger.error(`Dept Hindi row insert failed for ${table}`, { stack: e.stack });
        }
      });
    }

    return res.json({ success: true, record: enRow, message: "Record created successfully." });
  } catch (err) {
    logger.error("POST /api/department-form-data/:id/records", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/department-form-data/:id/records/:recordId   { data }
───────────────────────────────────────────────────────────────────── */
router.put("/:id/records/:recordId", async (req, res) => {
  const pool = req.app.locals.pool;
  const { data } = req.body;
  if (!data || typeof data !== "object")
    return res.status(400).json({ success: false, message: "data is required." });
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    const fields = activeFields(form.schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const fieldModes = buildFieldModes(fields);

    const { rows: target } = await pool.query(
      `SELECT language FROM ${table} WHERE id = $1 AND department_id = $2`,
      [req.params.recordId, departmentId]
    );
    if (!target.length) return res.status(404).json({ success: false, message: "Record not found." });
    const editedLanguage = target[0].language === "hi" ? "hi" : "en";

    let idx = 1;
    const setClauses = [...fieldCols.map((c) => `${c} = $${idx++}`), "updated_at = now()"];
    const whereClause = `department_id = $${idx++} AND id = $${idx++}`;
    const vals = [...fieldCols.map((c) => data[c] ?? null), departmentId, req.params.recordId];

    const { rows } = await pool.query(
      `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Record not found." });

    if (editedLanguage === "en" && form.translate_enabled !== false) {
      setImmediate(async () => {
        try {
          await ensureSourceRowIdColumn(pool, table);
          const hiData = await translateRow(data, fieldModes);
          let hidx = 1;
          const hiSet = [...fieldCols.map((c) => `${c} = $${hidx++}`), "updated_at = now()"];
          const hiVals = [...fieldCols.map((c) => hiData[c] ?? null), req.params.recordId];
          await pool.query(`UPDATE ${table} SET ${hiSet.join(", ")} WHERE source_row_id = $${hidx}`, hiVals);
        } catch (e) {
          logger.error(`Dept Hindi row update failed for ${table}`, { stack: e.stack });
        }
      });
    }

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error("PUT /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* DELETE bulk — MUST be before the single-delete route. */
router.delete("/:id/records/bulk-delete", async (req, res) => {
  const pool = req.app.locals.pool;
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: "ids must be a non-empty array." });
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (ids.some((x) => !UUID_RE.test(x)))
    return res.status(400).json({ success: false, message: "Invalid ID(s) in request." });
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);
    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    await ensureSourceRowIdColumn(pool, table);
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE (id = ANY($1::uuid[]) OR source_row_id = ANY($1::uuid[])) AND department_id = $2`,
      [ids, departmentId]
    );
    const deleted = rowCount ?? 0;
    return res.json({ success: true, deleted, failed: Math.max(0, ids.length - deleted), message: `${deleted} record(s) deleted.` });
  } catch (err) {
    logger.error("DELETE /api/department-form-data bulk-delete", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Bulk delete failed." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/export?format=csv|xlsx&language=
   Exports the department's records for the selected year/language.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/export", async (req, res) => {
  const pool = req.app.locals.pool;
  const { format = "csv", language = SOURCE_LANGUAGE } = req.query;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);
    await ensureSourceRowIdColumn(pool, table);

    const fields = activeFields(form.schema);
    const cols = fields.map((f) => dbCol(f.column_name));
    const headers = fields.map((f) => f.label?.[language] || f.label?.en || f.column_name.replace(/_/g, " "));

    const params = [departmentId, year];
    let q;
    if (language === "en") {
      q = `SELECT * FROM ${table} WHERE department_id = $1 AND academic_year = $2 AND (language = 'en' OR language IS NULL) ORDER BY role_name NULLS LAST, created_at DESC`;
    } else {
      params.push(language);
      const lp = `$${params.length}`;
      q = `WITH has_translation AS (SELECT source_row_id FROM ${table} WHERE language = ${lp} AND source_row_id IS NOT NULL AND department_id = $1 AND academic_year = $2)
           SELECT * FROM ${table} WHERE department_id = $1 AND academic_year = $2
             AND (language = ${lp} OR ((language = 'en' OR language IS NULL) AND id NOT IN (SELECT source_row_id FROM has_translation)))
           ORDER BY role_name NULLS LAST, created_at DESC`;
    }
    const { rows } = await pool.query(q, params);

    const allHeaders = ["#", "Role", ...headers, "Created"];
    const dataRows = rows.map((r, i) => [
      i + 1,
      r.role_name || "",
      ...cols.map((c) => {
        const v = r[c];
        if (v == null) return "";
        if (v === true) return "Yes";
        if (v === false) return "No";
        return String(v);
      }),
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
    ]);

    const langTag = language !== "en" ? `_${language}` : "";
    const baseName = `${form.form_name}${langTag}_${year}`;

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Records");
      ws.addRow(allHeaders);
      ws.getRow(1).font = { bold: true };
      dataRows.forEach((row) => ws.addRow(row));
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      await wb.xlsx.write(res);
      return res.end();
    }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csvLines = [allHeaders.map(esc).join(","), ...dataRows.map((row) => row.map(esc).join(","))];
    const csv = "﻿" + csvLines.join("\r\n");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/export", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to export records." });
  }
});

/* DELETE single — deletes the row and its Hindi mirror. */
router.delete("/:id/records/:recordId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);
    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    await ensureSourceRowIdColumn(pool, table);
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE (id = $1 OR source_row_id = $1) AND department_id = $2`,
      [req.params.recordId, departmentId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: "Record not found." });
    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    logger.error("DELETE /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

module.exports = router;
