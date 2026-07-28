"use strict";

/**
 * routes/departmentFormData.js  →  mounted at /api/department-form-data
 * ─────────────────────────────────────────────────────────────────────────
 * Records CRUD for department forms. Field labels are multilingual (en/hi):
 * schema labels are enriched on-the-fly via enrichSchemaLabels when a non-English
 * language is requested. Operates ONLY on dept_form_<slug> tables scoped by department_id +
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
const multer  = require("multer");
const XLSX    = require("xlsx");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { writeAuditLog } = require("../utils/audit");
const { resolveDeptContext, deptRecordsTable, quoteIdent } = require("../services/departmentFormService");
const { translateRow, resolveTranslationMode, enrichSchemaLabels } = require("../services/translationService");
const { extractUploadKeys, deleteFile } = require("../utils/localStorage");
const { getEffectiveState, STATE } = require("../services/stateResolver");
const { resolveOperatingYear } = require("../services/academicYearService");
const { assertEquivalent } = require("../services/equivalenceGuard");
const { assertDomainOwnerAccess } = require("../services/domainService");
const LOCK_TTL_MINUTES = 15;
async function acquireLock(pool, { recordId, formType, formId, userId, userName, ttlMinutes = LOCK_TTL_MINUTES }) {
  const { rowCount } = await pool.query(
    `WITH cleanup AS (
       DELETE FROM record_edit_locks
         WHERE record_id = $1 AND expires_at < now()
     )
     INSERT INTO record_edit_locks
       (record_id, form_type, form_id, locked_by, locked_by_name, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + (INTERVAL '1 minute' * $6::int))
     ON CONFLICT (record_id) DO NOTHING`,
    [recordId, formType, formId, userId, userName || "Another user", ttlMinutes]
  );
  if (rowCount > 0) return { acquired: true };
  const { rows } = await pool.query(
    `SELECT locked_by, locked_by_name, expires_at FROM record_edit_locks WHERE record_id = $1`,
    [recordId]
  );
  if (!rows.length) return acquireLock(pool, { recordId, formType, formId, userId, userName, ttlMinutes });
  if (rows[0].locked_by === userId) {
    await pool.query(
      `UPDATE record_edit_locks SET expires_at = now() + (INTERVAL '1 minute' * $1::int), locked_at = now() WHERE record_id = $2`,
      [ttlMinutes, recordId]
    );
    return { acquired: true };
  }
  return { acquired: false, lockedByName: rows[0].locked_by_name || "Another user", expiresAt: rows[0].expires_at };
}
async function releaseLock(pool, { recordId, userId }) {
  await pool.query(
    `DELETE FROM record_edit_locks WHERE record_id = $1 AND locked_by = $2`,
    [recordId, userId]
  );
}

const router = express.Router();
router.use(verifyToken);

/* OWNERSHIP: institution owns the academic year; department inherits it. When a
   request carries no explicit year, resolve the institution's active year so the
   fallback inherits it (not the calendar year). Lookup runs only on the no-year
   path, so normal flows (always ?year) cost nothing. See departmentForms.js. */
// A year counts as explicit only when positive (body.year may be null → 0).
const validYear = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
function hasExplicitYear(req) {
  return validYear(req.query.year) || validYear(req.get("X-Academic-Year")) || validYear(req.body?.year);
}
router.use(async (req, _res, next) => {
  try {
    if (!hasExplicitYear(req)) {
      const pool = req.app.locals.pool;
      const { institutionId } = await resolveDeptContext(pool, req);
      // M-2 — active → latest real academic year (no calendar drift when year-aware).
      req.institutionAcademicYear = await resolveOperatingYear(pool, institutionId);
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

/* Load the merged schema for (form, year): creation year → base schema;
   subsequent years → base fields + year-specific extra fields. Falls back to
   form.schema when no department_form_schemas row exists (migration path). */
async function loadEffectiveSchema(pool, form, year) {
  const creationYear = form.academic_year;
  if (year === creationYear) return form.schema;
  const { rows } = await pool.query(
    `SELECT academic_year, schema, is_base FROM department_form_schemas
     WHERE department_form_id = $1 AND (is_base = true OR academic_year = $2)`,
    [form.id, year]
  );
  const baseRow = rows.find((r) => r.is_base);
  const yearRow = rows.find((r) => r.academic_year === year && !r.is_base);
  const baseSchema = baseRow?.schema || form.schema || { fields: [] };
  const baseFields = baseSchema?.fields || [];
  const baseColSet = new Set(baseFields.map((f) => f.column_name));
  const extraFields = (yearRow?.schema?.fields || []).filter((f) => !baseColSet.has(f.column_name));
  return { ...baseSchema, fields: [...baseFields, ...extraFields] };
}

/* Which columns physically exist in the records table. Used to split fields
   between physical columns (creation-year) and custom_fields JSONB (extra). */
async function getPhysicalCols(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
}

function dbCol(col) { return col.trim().toLowerCase().replace(/\s+/g, "_"); }
function validSlug(s) { return /^[a-z][a-z0-9_]*$/.test(s); }

const handleImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV and Excel files are allowed."), ok);
  },
}).single("file");

/* Data entry (create / edit / delete records) is restricted to CONTRIBUTORS.
   Department Admins and Nodal Officers configure forms but cannot enter data —
   they may only view/export records. Returns true if the caller may write;
   otherwise sends a 403 and returns false. */
// TEMP (testing): the contributor role is not provisioned yet, so department_admin
// is allowed to enter data for now. Remove "department_admin" below once real
// contributors exist, to restore contributor-only data entry.
const DATA_ENTRY_ROLES = ["contributor", "department_admin", "pg_student"];
function requireContributor(req, res) {
  if ((req.user.roles || []).some((r) => DATA_ENTRY_ROLES.includes(r))) return true;
  res.status(403).json({ success: false, message: "Only contributors can enter or modify department form data." });
  return false;
}

function resolveYear(req) {
  if (validYear(req.query.year)) return Number(req.query.year);
  if (validYear(req.get("X-Academic-Year"))) return Number(req.get("X-Academic-Year"));
  if (validYear(req.body?.year)) return Number(req.body?.year);
  // Bug 16 — inherit the institution's ACTIVE academic year (computed by the
  // middleware above) before falling back to the calendar year as a LAST resort.
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
  for (const f of (fields || [])) {
    modes[dbCol(f.column_name)] = resolveTranslationMode(f);
  }
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

  // L-3 — domain isolation: a department form's domain is its creator's domain
  // (no domain column on department_table_list). A Hospital/Finance user can never
  // reach an Academic department form and vice-versa; cross-domain admins pass.
  const dom = await assertDomainOwnerAccess(pool, req, rows[0].created_by);
  if (!dom.allowed) return { error: dom.message };

  const userRoles = req.user.roles || [];
  const isManager = userRoles.includes("department_admin") || userRoles.includes("super_admin");
  if (!isManager) {
    // PG students access dept forms via explicit form_assignments, not via department_form_roles.
    // If a dept admin assigned this PG student to the form, allow access regardless of role restrictions.
    if (userRoles.includes("pg_student")) {
      const { rows: ar } = await pool.query(
        "SELECT 1 FROM form_assignments WHERE form_id = $1 AND assigned_to = $2 AND role = 'pg_student' AND is_active = true",
        [id, req.user.userId]
      );
      if (!ar.length) return { error: "You don't have access to this form." };
    } else {
      const { rows: rr } = await pool.query(
        "SELECT role_name FROM department_form_roles WHERE department_form_id = $1",
        [id]
      );
      const allowed = rr.map((r) => r.role_name);
      if (allowed.length > 0 && !userRoles.some((r) => allowed.includes(r))) {
        return { error: "You don't have access to this form." };
      }
    }
  }

  return { form: rows[0], departmentId, institutionId };
}

/* Effective write-block for (form, year). Precedence Archive > Lock > Deadline.
   ARCHIVED is now enforced as a WRITE POLICY (view-only), not a UI filter. */
async function deptLockBlock(pool, form, year) {
  // Bug 11 — department inactive overrides everything (Department INACTIVE > Archive
  // > Lock > Deadline). A department form whose owning department is inactive is
  // view-only: existing records stay readable, all writes are blocked.
  const { rows: deptRows } = await pool.query(
    "SELECT status FROM departments WHERE department_id = $1",
    [form.department_id]
  );
  if (deptRows[0] && deptRows[0].status !== "ACTIVE") {
    return {
      locked: true,
      department_inactive: true,
      message: "This department is inactive. You have view-only access — contact your institution administrator.",
    };
  }

  const { rows: ym } = await pool.query(
    "SELECT is_locked, is_archived FROM department_form_year_mapping WHERE department_form_id = $1 AND academic_year = $2",
    [form.id, year]
  );
  // Deadline is year-scoped: a deadline set for one academic year never affects
  // another. Keyed per (form, year) in department_form_deadline_config.
  const { rows: lc } = await pool.query(
    "SELECT is_locked, auto_locked, deadline_at AS deadline FROM department_form_deadline_config WHERE department_form_id = $1 AND academic_year = $2",
    [form.id, year]
  );
  const row = lc[0] || {};
  const isArchived      = ym[0]?.is_archived === true;
  const deadlineExpired = !!(row.deadline && new Date(row.deadline).getTime() <= Date.now());
  const lockedOnly      = ym[0]?.is_locked === true || row.is_locked === true || deadlineExpired;

  const ARCHIVE_MSG = "This form is archived for the selected academic year — it is now view-only.";

  // LEGACY (authoritative): archive wins, then lock/deadline.
  let legacy;
  if (isArchived) {
    legacy = { locked: true, message: ARCHIVE_MSG };
  } else if (lockedOnly) {
    legacy = {
      locked: true,
      message: (deadlineExpired || row.auto_locked)
        ? "This form's deadline has expired for your department — it is now view-only."
        : "This form is locked for your department. You can only view records.",
    };
  } else {
    legacy = { locked: false, message: null };
  }

  // CANDIDATE (shadow — shared resolver picks precedence; dept keeps its wording).
  const state = getEffectiveState({
    archived: isArchived,
    locked: lockedOnly,
    autoLocked: !!row.auto_locked,
    deadlineAt: row.deadline ?? null,
  });
  const candidate = state === STATE.ACTIVE
    ? { locked: false, message: null }
    : state === STATE.ARCHIVED
      ? { locked: true, message: ARCHIVE_MSG }
      : {
          locked: true,
          message: state === STATE.DEADLINE_EXPIRED
            ? "This form's deadline has expired for your department — it is now view-only."
            : "This form is locked for your department. You can only view records.",
        };

  return assertEquivalent("departmentFormData.deptLockBlock", legacy, candidate);
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/records?year=&language=
   Supports multilingual field labels (en/hi) — schema labels are
   enriched on the fly for the requested language before returning.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/records", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    if (!validSlug(form.form_name)) return res.status(400).json({ success: false, message: "Invalid form." });

    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);
    const language = (req.query.language || "en").toLowerCase();

    // Tolerate a missing physical table (e.g. legacy/partial state) — return empty.
    const { rows: ex } = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
      [table]
    );
    const effectiveSchema = await loadEffectiveSchema(pool, form, year);

    // enrichSchemaLabels expects a schema-row wrapper ({ schema: { fields } }).
    // Wrap, enrich, then unwrap so the response shape stays the same.
    const displaySchema = language !== "en"
      ? (await enrichSchemaLabels({ schema: effectiveSchema }, language).catch(() => ({ schema: effectiveSchema }))).schema
      : effectiveSchema;

    if (!ex.length) {
      const lk = await deptLockBlock(pool, form, year);
      return res.json({ success: true, records: [], schema: { schema: displaySchema, year, form_name: form.form_name }, lock: { is_locked: lk.locked, message: lk.message } });
    }

    // Return records in the requested language. For Hindi: prefer translated mirror rows;
    // fall back to English rows that have no Hindi mirror (legacy / untranslated).
    const { rows: rawRecords } = language === "en"
      ? await pool.query(
          `SELECT t.*, u.full_name AS entered_by
           FROM ${table} t
           LEFT JOIN users u ON u.id = t.created_by
           WHERE t.department_id = $1 AND t.academic_year = $2 AND (t.language = 'en' OR t.language IS NULL)
           ORDER BY t.created_at DESC`,
          [departmentId, year]
        )
      : await pool.query(
          `WITH has_translation AS (
             SELECT source_row_id FROM ${table}
             WHERE  language = $3 AND source_row_id IS NOT NULL
               AND  department_id = $1 AND academic_year = $2
           )
           SELECT t.*, u.full_name AS entered_by
           FROM ${table} t
           LEFT JOIN users u ON u.id = t.created_by
           WHERE t.department_id = $1 AND t.academic_year = $2
             AND (
               t.language = $3
               OR (
                 (t.language = 'en' OR t.language IS NULL)
                 AND t.id NOT IN (SELECT source_row_id FROM has_translation WHERE source_row_id IS NOT NULL)
               )
             )
           ORDER BY t.created_at DESC`,
          [departmentId, year, language]
        );
    const lock = await deptLockBlock(pool, form, year);

    // Flatten custom_fields (extra JSONB fields from non-creation years) into each row.
    const records = rawRecords.map((row) => {
      if (!row.custom_fields || typeof row.custom_fields !== "object") return row;
      return { ...row, ...row.custom_fields };
    });

    return res.json({
      success: true,
      records,
      schema: { schema: displaySchema, year, form_name: form.form_name },
      lock: { is_locked: lock.locked, message: lock.message },
    });
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/records", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/records/:recordId
   Fetches the latest version of a single record. Called by the edit flow
   immediately after lock acquisition so the form is always pre-populated
   with fresh DB data rather than the potentially stale list-page snapshot.
─────────────────────────────────────────────────────────────────────── */
router.get("/:id/records/:recordId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    if (!validSlug(form.form_name)) return res.status(400).json({ success: false, message: "Invalid form." });

    const table = deptRecordsTable(form.department_id, form.form_name);

    const { rows } = await pool.query(
      `SELECT t.*, u.full_name AS entered_by
       FROM ${table} t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.department_id = $1 AND t.id = $2 AND (t.language = 'en' OR t.language IS NULL)`,
      [departmentId, req.params.recordId]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "Record not found or has been deleted." });

    const record = rows[0];
    if (record.custom_fields && typeof record.custom_fields === "object") {
      Object.assign(record, record.custom_fields);
    }

    return res.json({ success: true, record });
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/records/:recordId/counterpart
   Returns the linked record in the opposite language for the reference pane:
     • English source row  → returns the Hindi mirror (source_row_id = recordId)
     • Hindi mirror row    → returns the English source (id = source_row_id)
   Registered BEFORE the POST /:id/records route (distinct path with /counterpart suffix).
───────────────────────────────────────────────────────────────────── */
router.get("/:id/records/:recordId/counterpart", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    if (!validSlug(form.form_name)) return res.status(400).json({ success: false, message: "Invalid form." });

    const table = deptRecordsTable(form.department_id, form.form_name);
    await ensureSourceRowIdColumn(pool, table);

    const { rows: selfRows } = await pool.query(
      `SELECT * FROM ${table} WHERE id = $1 AND department_id = $2`,
      [req.params.recordId, departmentId]
    );
    if (!selfRows.length)
      return res.status(404).json({ success: false, message: "Record not found." });

    const self = selfRows[0];
    let counterpart = null;

    if (self.language === "hi" && self.source_row_id) {
      // Hindi mirror → return the English source
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE id = $1 AND department_id = $2`,
        [self.source_row_id, departmentId]
      );
      counterpart = rows[0] || null;
    } else {
      // English source → return the Hindi mirror (if any)
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE source_row_id = $1 AND department_id = $2 AND language = 'hi' LIMIT 1`,
        [self.id, departmentId]
      );
      counterpart = rows[0] || null;
    }

    if (counterpart?.custom_fields && typeof counterpart.custom_fields === "object") {
      Object.assign(counterpart, counterpart.custom_fields);
    }

    return res.json({ success: true, record: counterpart });
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/records/:recordId/counterpart", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch counterpart record." });
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

    const effectiveSchema = await loadEffectiveSchema(pool, form, year);
    const fields = activeFields(effectiveSchema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const createdBy = req.user.userId || null;

    // Split: physical columns (creation-year) go directly; extra fields go to custom_fields JSONB.
    const physicalCols = await getPhysicalCols(pool, table);
    const baseFieldCols = fieldCols.filter((c) => physicalCols.has(c));
    const extraFieldCols = fieldCols.filter((c) => !physicalCols.has(c));
    const customFieldsJson = extraFieldCols.length > 0
      ? JSON.stringify(Object.fromEntries(extraFieldCols.map((c) => [c, data[c] ?? null])))
      : null;

    const stdCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id", "language", "created_by", "custom_fields"];
    const stdVals = [form.form_name, departmentId, institutionId, year, null, form.id, "en", createdBy, customFieldsJson];
    const allCols = [...stdCols, ...baseFieldCols.map(quoteIdent)];
    const allVals = [...stdVals, ...baseFieldCols.map((c) => data[c] ?? null)];
    const ph = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${ph}) RETURNING *`,
      allVals
    );

    const record = rows[0];
    if (record.custom_fields && typeof record.custom_fields === "object") {
      Object.assign(record, record.custom_fields);
    }

    // Create Hindi mirror row — English record already committed; translation failure is non-fatal.
    try {
      await ensureSourceRowIdColumn(pool, table);
      const fieldModes = buildFieldModes(fields);
      const hiData = await translateRow(data, fieldModes);
      const hiCustomFieldsJson = extraFieldCols.length > 0
        ? JSON.stringify(Object.fromEntries(extraFieldCols.map((c) => [c, hiData[c] ?? null])))
        : null;
      const hiCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id",
        "language", "created_by", "custom_fields", "source_row_id", ...baseFieldCols.map(quoteIdent)];
      const hiVals = [form.form_name, departmentId, institutionId, year, null, form.id,
        "hi", createdBy, hiCustomFieldsJson, record.id, ...baseFieldCols.map((c) => hiData[c] ?? null)];
      const hiPh = hiVals.map((_, i) => `$${i + 1}`).join(", ");
      await pool.query(`INSERT INTO ${table} (${hiCols.join(", ")}) VALUES (${hiPh})`, hiVals);
    } catch (hiErr) {
      logger.warn("Hindi translation failed; English record saved.", { form: form.form_name, error: hiErr.message });
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_RECORD_CREATED",
      entityType: "department_form_record",
      entityId: record.id,
      newValue: { form_name: form.form_name, form_id: form.id, academic_year: year },
      message: `Record created in department form "${form.form_name}"`,
    }).catch(() => {});

    return res.json({ success: true, record, message: "Record created successfully." });
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
    const { form, departmentId, institutionId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    const effectiveSchema = await loadEffectiveSchema(pool, form, year);
    const fields = activeFields(effectiveSchema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));

    // Split: physical vs extra fields.
    const physicalCols = await getPhysicalCols(pool, table);
    const baseFieldCols = fieldCols.filter((c) => physicalCols.has(c));
    const extraFieldCols = fieldCols.filter((c) => !physicalCols.has(c));
    const customFieldsJson = extraFieldCols.length > 0
      ? JSON.stringify(Object.fromEntries(extraFieldCols.map((c) => [c, data[c] ?? null])))
      : null;

    let idx = 1;
    const setClauses = [
      ...baseFieldCols.map((c) => `${quoteIdent(c)} = $${idx++}`),
      ...(extraFieldCols.length > 0 ? [`custom_fields = $${idx++}`] : []),
      "updated_at = now()",
    ];
    const whereClause = `department_id = $${idx++} AND id = $${idx++}`;
    const vals = [
      ...baseFieldCols.map((c) => data[c] ?? null),
      ...(extraFieldCols.length > 0 ? [customFieldsJson] : []),
      departmentId,
      req.params.recordId,
    ];

    const { rows: oldRows } = await pool.query(
      `SELECT * FROM ${table} WHERE id = $1 AND department_id = $2`,
      [req.params.recordId, departmentId]
    );

    const { rows } = await pool.query(
      `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Record not found." });

    if (oldRows.length > 0) {
      const oldKeys = extractUploadKeys(oldRows[0]);
      const newKeys = extractUploadKeys(data);
      const toDelete = oldKeys.filter(k => !newKeys.includes(k));
      for (const key of toDelete) {
        await deleteFile(key).catch(() => {});
      }
    }

    const record = rows[0];
    if (record.custom_fields && typeof record.custom_fields === "object") {
      Object.assign(record, record.custom_fields);
    }

    // Release the pre-edit lock on successful save (best-effort).
    releaseLock(pool, { recordId: req.params.recordId, userId: req.user.userId }).catch(() => {});

    // Sync Hindi mirror row — English record already updated; translation failure is non-fatal.
    try {
      await ensureSourceRowIdColumn(pool, table);
      const fieldModes = buildFieldModes(fields);
      const hiData = await translateRow(data, fieldModes);
      const hiCustomFieldsJson = extraFieldCols.length > 0
        ? JSON.stringify(Object.fromEntries(extraFieldCols.map((c) => [c, hiData[c] ?? null])))
        : null;

      const { rows: hiExisting } = await pool.query(
        `SELECT id FROM ${table} WHERE source_row_id = $1 AND department_id = $2`,
        [req.params.recordId, departmentId]
      );

      if (hiExisting.length > 0) {
        let hi = 1;
        const hiSet = [
          ...baseFieldCols.map((c) => `${quoteIdent(c)} = $${hi++}`),
          ...(extraFieldCols.length > 0 ? [`custom_fields = $${hi++}`] : []),
          "updated_at = now()",
        ];
        const hiVals = [
          ...baseFieldCols.map((c) => hiData[c] ?? null),
          ...(extraFieldCols.length > 0 ? [hiCustomFieldsJson] : []),
          req.params.recordId, departmentId,
        ];
        await pool.query(
          `UPDATE ${table} SET ${hiSet.join(", ")} WHERE source_row_id = $${hi++} AND department_id = $${hi++}`,
          hiVals
        );
      } else {
        const hiCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id",
          "language", "created_by", "custom_fields", "source_row_id", ...baseFieldCols.map(quoteIdent)];
        const hiVals = [form.form_name, departmentId, institutionId, year, null, form.id,
          "hi", req.user.userId, hiCustomFieldsJson, req.params.recordId, ...baseFieldCols.map((c) => hiData[c] ?? null)];
        const hiPh = hiVals.map((_, i) => `$${i + 1}`).join(", ");
        await pool.query(`INSERT INTO ${table} (${hiCols.join(", ")}) VALUES (${hiPh})`, hiVals);
      }
    } catch (hiErr) {
      logger.warn("Hindi mirror sync failed; English record updated.", { form: form.form_name, error: hiErr.message });
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_RECORD_UPDATED",
      entityType: "department_form_record",
      entityId: record.id,
      newValue: { form_name: form.form_name, form_id: form.id, academic_year: year },
      message: `Record updated in department form "${form.form_name}"`,
    }).catch(() => {});

    return res.json({ success: true, record, message: "Record updated successfully." });
  } catch (err) {
    logger.error("PUT /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-form-data/:id/records/:recordId/lock
   Acquire a pre-edit lock. Returns 200 { acquired:true } or
   409 { acquired:false, lockedByName, expiresAt } when locked by someone else.
───────────────────────────────────────────────────────────────────── */
router.post("/:id/records/:recordId/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  if (!requireContributor(req, res)) return;
  try {
    const { form, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });

    const { rows: userRows } = await pool.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [req.user.userId]
    );
    const userName = userRows[0]?.full_name || "A user";

    const result = await acquireLock(pool, {
      recordId: req.params.recordId,
      formType: "department",
      formId: String(form.id),
      userId: req.user.userId,
      userName,
    });

    if (result.acquired) {
      return res.json({ success: true, acquired: true });
    }
    // Return 200 (not 409) so the response is always treated as a normal business
    // outcome; the frontend distinguishes acquired:true vs acquired:false.
    return res.json({
      success: true,
      acquired: false,
      lockedByName: result.lockedByName,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    logger.error("POST /api/department-form-data/:id/records/:recordId/lock", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to acquire edit lock." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/department-form-data/:id/records/:recordId/lock
   Release the caller's edit lock. Silently succeeds if no lock exists.
───────────────────────────────────────────────────────────────────── */
router.delete("/:id/records/:recordId/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    await releaseLock(pool, {
      recordId: req.params.recordId,
      userId: req.user.userId,
    });
    return res.json({ success: true });
  } catch (err) {
    logger.error("DELETE /api/department-form-data/:id/records/:recordId/lock", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to release edit lock." });
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
    
    const { rows: deletedRows, rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE id = ANY($1::uuid[]) AND department_id = $2 RETURNING *`,
      [ids, departmentId]
    );
    
    if (deletedRows.length > 0) {
      for (const row of deletedRows) {
        const keys = extractUploadKeys(row);
        for (const key of keys) {
          await deleteFile(key).catch(() => {});
        }
      }
      
      const cascadeIds = [...new Set([
        ...deletedRows.filter((r) => r.language !== "hi").map((r) => r.id),
        ...deletedRows.filter((r) => r.language === "hi" && r.source_row_id).map((r) => r.source_row_id),
      ])];
      if (cascadeIds.length) {
        const { rows: cascadeDeletedRows } = await pool.query(
          `DELETE FROM ${table} WHERE (source_row_id = ANY($1::uuid[]) OR id = ANY($1::uuid[])) AND department_id = $2 RETURNING *`,
          [cascadeIds, departmentId]
        );
        for (const row of cascadeDeletedRows) {
          const keys = extractUploadKeys(row);
          for (const key of keys) {
            await deleteFile(key).catch(() => {});
          }
        }
      }
    }

    const deleted = rowCount ?? 0;

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_RECORDS_BULK_DELETED",
      entityType: "department_form_record",
      entityId: null,
      newValue: { form_name: form.form_name, form_id: form.id, academic_year: year, deleted_count: deleted },
      message: `${deleted} record(s) bulk deleted from department form "${form.form_name}"`,
    }).catch(() => {});

    return res.json({ success: true, deleted, failed: Math.max(0, ids.length - deleted), message: `${deleted} record(s) deleted.` });
  } catch (err) {
    logger.error("DELETE /api/department-form-data bulk-delete", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Bulk delete failed." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/export?format=csv&language=
   Exports the department's records for the selected year.
   Supports language=hi to export translated values with Hindi headers.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/export", async (req, res) => {
  const pool = req.app.locals.pool;
  const { format = "csv" } = req.query;
  const language = (req.query.language || "en").toLowerCase();
  try {
    const { form, departmentId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const table = deptRecordsTable(form.department_id, form.form_name);
    const year = resolveYear(req);

    const effectiveSchema = await loadEffectiveSchema(pool, form, year);
    const displaySchema = language !== "en"
      ? (await enrichSchemaLabels({ schema: effectiveSchema }, language).catch(() => ({ schema: effectiveSchema }))).schema
      : effectiveSchema;
    const fields = activeFields(displaySchema);
    const cols = fields.map((f) => dbCol(f.column_name));
    const headers = fields.map((f) => f.label?.[language] || f.label?.en || f.column_name.replace(/_/g, " "));

    const { rows } = language === "en"
      ? await pool.query(
          `SELECT t.*, u.full_name AS entered_by
           FROM ${table} t
           LEFT JOIN users u ON u.id = t.created_by
           WHERE t.department_id = $1 AND t.academic_year = $2 AND (t.language = 'en' OR t.language IS NULL)
           ORDER BY t.created_at DESC`,
          [departmentId, year]
        )
      : await pool.query(
          `WITH has_translation AS (
             SELECT source_row_id FROM ${table}
             WHERE  language = $3 AND source_row_id IS NOT NULL
               AND  department_id = $1 AND academic_year = $2
           )
           SELECT t.*, u.full_name AS entered_by
           FROM ${table} t
           LEFT JOIN users u ON u.id = t.created_by
           WHERE t.department_id = $1 AND t.academic_year = $2
             AND (
               t.language = $3
               OR (
                 (t.language = 'en' OR t.language IS NULL)
                 AND t.id NOT IN (SELECT source_row_id FROM has_translation WHERE source_row_id IS NOT NULL)
               )
             )
           ORDER BY t.created_at DESC`,
          [departmentId, year, language]
        );

    const allHeaders = ["#", "Added By", ...headers, "Created"];
    const dataRows = rows.map((r, i) => {
      // Flatten custom_fields (extra JSONB fields from non-creation years) into the row.
      const flat = (r.custom_fields && typeof r.custom_fields === "object")
        ? { ...r, ...r.custom_fields }
        : r;
      return [
        i + 1,
        r.entered_by || "",
        ...cols.map((c) => {
          const v = flat[c];
          if (v == null) return "";
          if (v === true) return "Yes";
          if (v === false) return "No";
          return String(v);
        }),
        r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
      ];
    });

    const baseName = `${form.form_name}_${year}${language !== "en" ? `_${language}` : ""}`;

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
    /* Bug 12 — delete the whole pair whichever side was targeted: resolve the
       English source id first (a Hindi row → its source_row_id), so a Hindi row is
       never deleted on its own (English orphan). */
    const { rows: tgt } = await pool.query(
      `SELECT source_row_id FROM ${table} WHERE id = $1 AND department_id = $2`,
      [req.params.recordId, departmentId]
    );
    const rootId = tgt[0]?.source_row_id || req.params.recordId;
    const { rows: deletedRows, rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE (id = $1 OR source_row_id = $1) AND department_id = $2 RETURNING *`,
      [rootId, departmentId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: "Record not found." });

    if (deletedRows.length > 0) {
      for (const row of deletedRows) {
        const keys = extractUploadKeys(row);
        for (const key of keys) {
          await deleteFile(key).catch(() => {});
        }
      }
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_RECORD_DELETED",
      entityType: "department_form_record",
      entityId: rootId,
      newValue: { form_name: form.form_name, form_id: form.id, academic_year: year },
      message: `Record deleted from department form "${form.form_name}"`,
    }).catch(() => {});

    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    logger.error("DELETE /api/department-form-data/:id/records/:recordId", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-form-data/:id/import/sample?format=csv|xlsx
   Returns a header-only sample file with schema column names.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/import/sample", async (req, res) => {
  const pool = req.app.locals.pool;
  const { format = "csv" } = req.query;
  try {
    const { form, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const year = resolveYear(req);
    const effectiveSchema = await loadEffectiveSchema(pool, form, year);
    const fields = activeFields(effectiveSchema);
    const headers = fields.map((f) => f.label?.en || f.column_name.replace(/_/g, " "));

    const baseName = `${form.form_name}_import_sample`;

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Import");
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      await wb.xlsx.write(res);
      return res.end();
    }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + headers.map(esc).join(",") + "\r\n";
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } catch (err) {
    logger.error("GET /api/department-form-data/:id/import/sample", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to generate sample file." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-form-data/:id/import   multipart: file
   Parses uploaded CSV/XLSX and bulk-inserts records.
───────────────────────────────────────────────────────────────────── */
router.post("/:id/import", (req, res, next) => {
  handleImportUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  const pool = req.app.locals.pool;
  if (!requireContributor(req, res)) return;
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

  try {
    const { form, departmentId, institutionId, error } = await loadForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });

    const year = resolveYear(req);
    const lock = await deptLockBlock(pool, form, year);
    if (lock.locked) return res.status(403).json({ success: false, message: lock.message });

    /* Parse file */
    let wb;
    const isCsv = /\.(csv)$/i.test(req.file.originalname);
    if (isCsv) {
      const text = req.file.buffer.toString("utf8");
      wb = XLSX.read(text, { type: "string" });
    } else {
      wb = XLSX.read(req.file.buffer, { type: "buffer" });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws["!ref"]) return res.status(400).json({ success: false, message: "File is empty." });

    const range = XLSX.utils.decode_range(ws["!ref"]);
    if (range.e.r > 10000) {
      return res.status(400).json({ success: false, message: "File exceeds 10,000 row limit. Please split and re-import." });
    }

    const fileRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!fileRows.length) return res.status(400).json({ success: false, message: "File contains no data rows." });

    /* Build column map: file header → schema column name (case-insensitive) */
    const effectiveSchema = await loadEffectiveSchema(pool, form, year);
    const fields = activeFields(effectiveSchema);
    const table = deptRecordsTable(form.department_id, form.form_name);
    const physicalCols = await getPhysicalCols(pool, table);

    const normalize = (s) => String(s).trim().toLowerCase().replace(/\s+/g, "_");
    const headerMap = {};
    for (const f of fields) {
      const labelKey = normalize(f.label?.en || f.column_name.replace(/_/g, " "));
      const colKey   = normalize(f.column_name);
      headerMap[labelKey] = dbCol(f.column_name);
      headerMap[colKey]   = dbCol(f.column_name);
    }

    const fileHeaders = Object.keys(fileRows[0]);
    const mappedCols = fileHeaders.map((h) => ({ fileHeader: h, dbColumn: headerMap[normalize(h)] || null }));
    const unknownHeaders = mappedCols.filter((m) => !m.dbColumn).map((m) => m.fileHeader);

    const baseFieldCols = fields.map((f) => dbCol(f.column_name)).filter((c) => physicalCols.has(c));
    const extraFieldCols = fields.map((f) => dbCol(f.column_name)).filter((c) => !physicalCols.has(c));
    const createdBy = req.user.userId || null;

    let inserted = 0;
    const errors = [];

    for (let i = 0; i < fileRows.length; i++) {
      const row = fileRows[i];
      try {
        /* Build data object from file row */
        const data = {};
        for (const { fileHeader, dbColumn } of mappedCols) {
          if (dbColumn) data[dbColumn] = row[fileHeader] === "" ? null : row[fileHeader];
        }

        const customFieldsJson = extraFieldCols.length > 0
          ? JSON.stringify(Object.fromEntries(extraFieldCols.map((c) => [c, data[c] ?? null])))
          : null;

        const stdCols = ["form_name", "department_id", "institution_id", "academic_year", "role_name", "schema_id", "language", "created_by", "custom_fields"];
        const stdVals = [form.form_name, departmentId, institutionId, year, null, form.id, "en", createdBy, customFieldsJson];
        const allCols = [...stdCols, ...baseFieldCols.map(quoteIdent)];
        const allVals = [...stdVals, ...baseFieldCols.map((c) => data[c] ?? null)];
        const ph = allVals.map((_, idx) => `$${idx + 1}`).join(", ");

        await pool.query(
          `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${ph})`,
          allVals
        );
        inserted++;
      } catch (rowErr) {
        errors.push({ row: i + 2, error: rowErr.message });
      }
    }

    if (inserted > 0) {
      await writeAuditLog(req, {
        actionType: "DEPARTMENT_FORM_BULK_IMPORT",
        entityType: "department_form_record",
        entityId: form.id,
        newValue: { form_name: form.form_name, form_id: form.id, academic_year: year, inserted },
        message: `${inserted} record(s) imported into department form "${form.form_name}"`,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      inserted,
      failed: errors.length,
      errors: errors.slice(0, 20),
      unknownHeaders: unknownHeaders.length ? unknownHeaders : undefined,
      message: `${inserted} record(s) imported successfully${errors.length ? `, ${errors.length} failed` : ""}.`,
    });
  } catch (err) {
    logger.error("POST /api/department-form-data/:id/import", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Import failed: " + err.message });
  }
});

module.exports = router;
