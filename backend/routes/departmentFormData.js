"use strict";

/**
 * routes/departmentFormData.js  →  mounted at /api/department-form-data
 * ─────────────────────────────────────────────────────────────────────────
 * Records CRUD for department forms. Department forms are SINGLE-LANGUAGE
 * (English) — there is no translation: no Hindi mirror rows, no language-aware
 * reads. Operates ONLY on dept_form_<slug> tables scoped by department_id +
 * academic_year. Reads the department_* metadata tables; never touches
 * table_list / custom_field_schemas / form_lock_config / *_records.
 * (Legacy rows keep a `language` column; reads filter to 'en'/NULL, and deletes
 * still clean up any old source_row_id-linked Hindi mirror.)
 *
 * Path param :id is the department_table_list.id (the form), so two
 * departments with the same slug never collide.
 */

const express = require("express");
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { resolveDeptContext, deptRecordsTable, quoteIdent } = require("../services/departmentFormService");
const { getEffectiveState, STATE } = require("../services/stateResolver");
const { resolveActiveAcademicYear } = require("../services/academicYearService");
const { assertEquivalent } = require("../services/equivalenceGuard");

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

/* Data entry (create / edit / delete records) is restricted to CONTRIBUTORS.
   Department Admins and Nodal Officers configure forms but cannot enter data —
   they may only view/export records. Returns true if the caller may write;
   otherwise sends a 403 and returns false. */
// TEMP (testing): the contributor role is not provisioned yet, so department_admin
// is allowed to enter data for now. Remove "department_admin" below once real
// contributors exist, to restore contributor-only data entry.
const DATA_ENTRY_ROLES = ["contributor", "department_admin"];
function requireContributor(req, res) {
  if ((req.user.roles || []).some((r) => DATA_ENTRY_ROLES.includes(r))) return true;
  res.status(403).json({ success: false, message: "Only contributors can enter or modify department form data." });
  return false;
}

function resolveYear(req) {
  const q = Number(req.query.year); if (Number.isInteger(q)) return q;
  const h = Number(req.get("X-Academic-Year")); if (Number.isInteger(h)) return h;
  const b = Number(req.body?.year); if (Number.isInteger(b)) return b;
  // Phase-1 shadow: legacy fallback (calendar year) is authoritative; the
  // institution-active year is the candidate — logged if it would differ, never used.
  const legacy = new Date().getFullYear();
  const candidate = Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : legacy;
  return assertEquivalent("departmentFormData.resolveYear.fallback", legacy, candidate);
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
  // Deadline is year-scoped: a deadline set for one academic year never affects
  // another. Keyed per (form, year) in department_form_deadline_config.
  const { rows: lc } = await pool.query(
    "SELECT is_locked, auto_locked, deadline_at AS deadline FROM department_form_deadline_config WHERE department_form_id = $1 AND academic_year = $2",
    [form.id, year]
  );
  const row = lc[0] || {};
  const deadlineExpired = !!(row.deadline && new Date(row.deadline).getTime() <= Date.now());

  // LEGACY (authoritative): any blocking source locks; deadline/auto → deadline msg.
  const anyLock = ym[0]?.is_locked === true || row.is_locked === true || deadlineExpired;
  let legacy;
  if (!anyLock) {
    legacy = { locked: false, message: null };
  } else {
    legacy = {
      locked: true,
      message: (deadlineExpired || row.auto_locked)
        ? "This form's deadline has expired for your department — it is now view-only."
        : "This form is locked for your department. You can only view records.",
    };
  }

  // CANDIDATE (shadow — shared resolver picks precedence; dept keeps its wording).
  const state = getEffectiveState({
    locked: anyLock,
    autoLocked: !!row.auto_locked,
    deadlineAt: row.deadline ?? null,
  });
  const candidate = state === STATE.ACTIVE
    ? { locked: false, message: null }
    : {
        locked: true,
        message: state === STATE.DEADLINE_EXPIRED
          ? "This form's deadline has expired for your department — it is now view-only."
          : "This form is locked for your department. You can only view records.",
      };

  return assertEquivalent("departmentFormData.deptLockBlock", legacy, candidate);
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/records?year=
   Department forms are single-language (English) — no translation.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/records", async (req, res) => {
  const pool = req.app.locals.pool;
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
      return res.json({ success: true, records: [], schema: { schema: form.schema, year, form_name: form.form_name }, lock: { is_locked: lk.locked, message: lk.message } });
    }

    // Only original (English) rows — any legacy Hindi mirror rows are ignored.
    // entered_by = the full name of the user who created the row (resolved from
    // created_by), so admins can see who entered each record.
    const { rows: records } = await pool.query(
      `SELECT t.*, u.full_name AS entered_by
       FROM ${table} t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.department_id = $1 AND t.academic_year = $2 AND (t.language = 'en' OR t.language IS NULL)
       ORDER BY t.created_at DESC`,
      [departmentId, year]
    );
    const lock = await deptLockBlock(pool, form, year);

    return res.json({
      success: true,
      records,
      schema: { schema: form.schema, year, form_name: form.form_name },
      lock: { is_locked: lock.locked, message: lock.message },
    });
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/records", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-form-data/:id/records   { data }
   The submitter is recorded automatically via created_by (from the JWT); no
   role is asked for. "Who entered this" is shown by resolving created_by → name.
───────────────────────────────────────────────────────────────────── */
router.post("/:id/records", async (req, res) => {
  const pool = req.app.locals.pool;
  if (!requireContributor(req, res)) return;
  const { data } = req.body;
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
    const createdBy = req.user.userId || null;

    // role_name is no longer collected from the user — kept null for column compat.
    const stdCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id", "language", "created_by"];
    const stdVals = [form.form_name, departmentId, institutionId, year, null, form.id, "en", createdBy];
    const allCols = [...stdCols, ...fieldCols.map(quoteIdent)];
    const allVals = [...stdVals, ...fieldCols.map((c) => data[c] ?? null)];
    const ph = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${ph}) RETURNING *`,
      allVals
    );

    return res.json({ success: true, record: rows[0], message: "Record created successfully." });
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
  if (!requireContributor(req, res)) return;
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

    let idx = 1;
    const setClauses = [...fieldCols.map((c) => `${quoteIdent(c)} = $${idx++}`), "updated_at = now()"];
    const whereClause = `department_id = $${idx++} AND id = $${idx++}`;
    const vals = [...fieldCols.map((c) => data[c] ?? null), departmentId, req.params.recordId];

    const { rows } = await pool.query(
      `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Record not found." });

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error("PUT /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* DELETE bulk — MUST be before the single-delete route. */
router.delete("/:id/records/bulk-delete", async (req, res) => {
  const pool = req.app.locals.pool;
  if (!requireContributor(req, res)) return;
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
   GET /api/department-form-data/:id/export?format=csv|xlsx
   Exports the department's records for the selected year (English only).
───────────────────────────────────────────────────────────────────── */
router.get("/:id/export", async (req, res) => {
  const pool = req.app.locals.pool;
  const { format = "csv" } = req.query;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    const fields = activeFields(form.schema);
    const cols = fields.map((f) => dbCol(f.column_name));
    const headers = fields.map((f) => f.label?.en || f.column_name.replace(/_/g, " "));

    const { rows } = await pool.query(
      `SELECT t.*, u.full_name AS entered_by
       FROM ${table} t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.department_id = $1 AND t.academic_year = $2 AND (t.language = 'en' OR t.language IS NULL)
       ORDER BY t.created_at DESC`,
      [departmentId, year]
    );

    const allHeaders = ["#", "Added By", ...headers, "Created"];
    const dataRows = rows.map((r, i) => [
      i + 1,
      r.entered_by || "",
      ...cols.map((c) => {
        const v = r[c];
        if (v == null) return "";
        if (v === true) return "Yes";
        if (v === false) return "No";
        return String(v);
      }),
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
    ]);

    const baseName = `${form.form_name}_${year}`;

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
  if (!requireContributor(req, res)) return;
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
