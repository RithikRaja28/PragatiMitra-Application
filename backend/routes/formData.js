"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { writeAuditLog } = require("../utils/audit");
const { translateRow, resolveTranslationMode, enrichSchemaLabels } = require("../services/translationService");
const { getAcademicYearLockBlockForReq, getFormArchiveBlockForReq, resolveOperatingYear, getAcademicYearLockBlock, getFormArchiveBlock } = require("../services/academicYearService");
const { getEffectiveState, messageFor, canWrite } = require("../services/stateResolver");
const { SOURCE_LANGUAGE, isDerivedRow } = require("../services/translationOwnership");
const { assertEquivalent } = require("../services/equivalenceGuard");
const { assertFormDomainAccess } = require("../services/domainService");
const { resolveEffectiveDepartment, getDepartmentWriteBlock } = require("../services/departmentContext");
const { ensureSchemaExists } = require("../services/schemaPropagationService");
const { isFormAssigned, isContributorOnly, isPgStudentOnly } = require("./formAssignments");
const { extractUploadKeys, deleteFile, decodeFileTokenWithoutVerification, signReadUrl } = require("../utils/localStorage");
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

/* Bug 17 — shared-form schema ownership. On a WRITE, a consumer institution must
   store its OWN schema copy's id, never the creator's. getActiveSchema falls back
   to the creator's canonical row when the consumer has no copy yet; this detects
   that fallback, materializes the consumer's own copy (idempotent clone), and
   re-resolves so the record's schema_id references the consumer's schema. Returns
   the institution-owned schema (or the original if anything goes wrong → never
   blocks the write). */
async function resolveOwnedSchema(pool, formName, institutionId, year, schema) {
  if (!schema || !institutionId) return schema;
  if (String(schema.institution_id) === String(institutionId)) return schema; // already owned
  try {
    await ensureSchemaExists(pool, formName);
    const own = await getActiveSchema(pool, formName, institutionId, year);
    if (own && String(own.institution_id) === String(institutionId)) return own;
  } catch (err) {
    logger.error(`Bug 17 resolveOwnedSchema failed for ${formName}/${institutionId}`, { stack: err.stack });
  }
  return schema;
}

/* H-2 — the academic year(s) the TARGETED record(s) actually belong to. Lock /
   archive / academic-year enforcement on edit & delete must key off the record's
   OWN year, never the latest schema year or a client-chosen header — otherwise a
   view-only old-year record could be edited/deleted by selecting a different
   (active) year. Optionally department-scoped so a dept admin's batch isn't
   over-blocked by other departments' rows in the same id list. NULL-year rows
   (very old imports) are skipped — they fall back to the existing header checks. */
async function getRecordYears(pool, formName, ids, institutionId, departmentId = null) {
  if (!ids || ids.length === 0) return [];
  const params = [ids, institutionId];
  let deptClause = "";
  if (departmentId) {
    params.push(departmentId);
    deptClause = ` AND (department_id = $3 OR department_id IS NULL)`;
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT year FROM ${formName}_records
      WHERE id = ANY($1::uuid[]) AND institution_id = $2 AND year IS NOT NULL${deptClause}`,
    params
  );
  return rows.map((r) => Number(r.year)).filter((y) => Number.isInteger(y));
}

/* H-2 — combined write-block (lock + academic-year lock/archive + form archive)
   for a SPECIFIC (form, institution, year). Used to enforce against a record's own
   year. Returns { blocked, message }. A null year means "no record-year signal" →
   not blocked here (the existing header-based checks still apply). */
async function getYearWriteBlock(pool, formName, institutionId, year) {
  if (year == null) return { blocked: false, message: null };
  const lb = await getLockBlock(pool, formName, institutionId, year);
  if (lb.locked) return { blocked: true, message: lb.message };
  const ay = await getAcademicYearLockBlock(pool, institutionId, year);
  if (ay.locked) return { blocked: true, message: ay.message };
  const ab = await getFormArchiveBlock(pool, institutionId, formName, year);
  if (ab.blocked) return { blocked: true, message: ab.message };
  return { blocked: false, message: null };
}

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


async function resolveRecordsTable(pool, formName, institutionId) {
    const { rows } = await pool.query(
        `
        SELECT
            department_id,
            form_name
        FROM department_table_list
        WHERE form_name = $1
          AND institution_id = $2
          AND is_archived = FALSE
        ORDER BY academic_year DESC
        LIMIT 1
        `,
        [formName, institutionId]
    );

    if (rows.length) {
        const prefix = rows[0].department_id
            .replace(/-/g, "")
            .substring(0, 12);

        return `dept_form_${prefix}_${rows[0].form_name}`;
    }

    return `${formName}_records`;
}

const router = express.Router();
router.use(verifyToken);

/* Bug 16 — precompute the institution's ACTIVE academic year once per request
   (only when no explicit year is supplied) so the contributor assignment guard and
   any year fallback inherit it instead of jumping to the calendar year. Never
   blocks on error. */
router.use(async (req, _res, next) => {
  try {
    // Positive-year check guards against body.year === null (→ Number 0).
    const vy = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
    const explicit = vy(req.query.year) || vy(req.get("X-Academic-Year")) || vy(req.body?.year);
    if (!explicit) {
      const pool = req.app.locals.pool;
      const { institutionId } = await resolveEffectiveDepartment(pool, req);
      // M-2 — prefer active → latest real academic year (never the calendar year
      // for a year-aware institution).
      req.institutionAcademicYear = await resolveOperatingYear(pool, institutionId);
    }
  } catch { /* leave undefined → calendar-year fallback */ }
  next();
});

/* Domain isolation guard — runs for EVERY :formName route. A non-super-admin
   user may only touch records of a form in their own domain; a Hospital/Finance
   form is invisible (403) to Academic users and vice-versa. super_admin is
   cross-domain. Academic default keeps all existing behavior. */
router.param("formName", async (req, res, next, formName) => {
  const pool = req.app.locals.pool;
  try {
    const acc = await assertFormDomainAccess(pool, req, formName);
    if (!acc.allowed) return res.status(acc.status || 403).json({ success: false, message: acc.message });

    // Contributor: may only touch forms ASSIGNED to them for the selected year.
    if (isContributorOnly(req)) {
      // Fall back to the institution's active/latest DB year — never the calendar year.
      const year = Number(req.query.year) || Number(req.get("X-Academic-Year")) || Number(req.body?.year)
        || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : null);
      const ok = year != null && await isFormAssigned(pool, req.user.userId, formName, year);
      if (!ok) return res.status(403).json({ success: false, message: "This form is not assigned to you." });
    }

    // PG Student: same assignment gate as contributor.
    if (isPgStudentOnly(req)) {
      const year = Number(req.query.year) || Number(req.get("X-Academic-Year")) || Number(req.body?.year)
        || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : null);
      const ok = year != null && await isFormAssigned(pool, req.user.userId, formName, year);
      if (!ok) return res.status(403).json({ success: false, message: "This form is not assigned to you." });
    }
    return next();
  } catch (err) {
    // FAIL-CLOSED: an authorization lookup failure must DENY, never allow. Falling
    // through to next() here would let a contributor / cross-domain user reach a
    // form whenever the assignment/domain check errored.
    logger.error("formData domain/assignment guard failed — denying (fail-closed)", {
      formName, userId: req.user?.userId, route: req.originalUrl, stack: err.stack,
    });
    return res.status(503).json({ success: false, message: "Authorization is temporarily unavailable. Please try again." });
  }
});

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

   "department_admin" as a returned `role` value means "department-scoped",
   not literally the department_admin DB role — nodal officers (via their NOA
   capability), plain contributors, and PG students all get the identical
   treatment (scoped to their own department, not the whole institute), same
   as departmentFormData.js's loadForm() already does for pg_student. Every
   call site below only branches on `ctx.role === "department_admin"` to
   decide whether to apply the departmentId filter, so reusing this label
   keeps all of them correct without touching each one individually.
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

  const isDeptScoped = roles.includes("department_admin") || roles.includes("nodal_officer")
    || isContributorOnly(req) || isPgStudentOnly(req);

  // EFFECTIVE (nodal-aware) institution + department — a Nodal Officer scopes to
  // their NODAL department, not their home department (Bug 4). Read via the single
  // resolver so records here match the assignment/forms/export screens.
  const { institutionId, departmentId } = await resolveEffectiveDepartment(pool, req);

  return {
    institutionId: institutionId || null,
    departmentId:  isDeptScoped ? (departmentId || null) : null,
    role: isDeptScoped ? "department_admin" : "institute_admin",
  };
}

/* Returns the first-created active schema row for an institution — this is
   the "base" row from form-creation time whose fields have real physical
   columns in *_records.  We sort by created_at ASC (not year ASC) because
   a form can be activated for an earlier academic year after its initial
   creation, producing an empty row with a smaller year but a later
   created_at; using year ASC would incorrectly treat that empty row as the
   base and hide all fields. */
async function getBaseSchemaRow(pool, formName, institutionId) {
  const { rows } = await pool.query(
    `SELECT * FROM custom_field_schemas
     WHERE form_name = $1 AND institution_id = $2 AND is_active = true
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1`,
    [formName, institutionId]
  );
  if (rows[0]) return rows[0];
  const { rows: fb } = await pool.query(
    `SELECT cfs.* FROM custom_field_schemas cfs
     JOIN table_list tl ON tl.form_name = cfs.form_name
     WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true
     ORDER BY cfs.created_at ASC NULLS LAST
     LIMIT 1`,
    [formName]
  );
  return fb[0] || null;
}

/* Returns the non-system column names that physically exist in the records
   table (i.e., fields that were present at form-creation time and have real
   DB columns, as opposed to extra fields stored in custom_fields JSONB). */
async function getPhysicalCols(pool, tableName) {
  const SYSTEM = new Set([
    "id", "form_name", "institution_id", "department_id", "year",
    "schema_id", "status", "order_index", "custom_fields", "language",
    "source_row_id", "created_by", "updated_by", "created_at", "updated_at",
    "academic_year", "role_name",
  ]);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(rows.map(r => r.column_name).filter(c => !SYSTEM.has(c)));
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
  let row = rows[0] || null;

  // Fallback: shared forms have one canonical schema row (the creator's).
  if (!row) {
    const fbParams = [formName];
    let fq = `SELECT cfs.* FROM custom_field_schemas cfs
              JOIN table_list tl ON tl.form_name = cfs.form_name
              WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true`;
    if (year) { fq += ` AND cfs.year = $2`; fbParams.push(year); }
    fq += ` ORDER BY cfs.year DESC LIMIT 1`;
    const { rows: fb } = await pool.query(fq, fbParams);
    row = fb[0] || null;
  }
  // Fallback: Department forms
   // ----------------------------------------------------
// Fallback: Department forms
// ----------------------------------------------------
if (!row) {

    // Try requested academic year first
    const deptParams = [formName];
    let deptQuery = `
        SELECT
            dfs.id,
            dfs.department_form_id,
            dfs.academic_year AS year,
            dfs.schema,
            dfs.is_base,
            dtl.department_id,
            dtl.institution_id,
            dtl.used_column_names
        FROM department_table_list dtl
        JOIN department_form_schemas dfs
          ON dfs.department_form_id = dtl.id
        WHERE dtl.form_name = $1
    `;

    if (year) {
        deptQuery += ` AND dfs.academic_year = $2`;
        deptParams.push(year);
    }

    deptQuery += `
        ORDER BY dfs.academic_year DESC
        LIMIT 1
    `;

    let { rows: deptRows } = await pool.query(
        deptQuery,
        deptParams
    );

    row = deptRows[0] || null;

    // If requested year not found,
    // fall back to latest available department schema
    if (!row && year) {

        const { rows: latestRows } = await pool.query(
            `
            SELECT
                dfs.id,
                dfs.department_form_id,
                dfs.academic_year AS year,
                dfs.schema,
                dfs.is_base,
                dtl.department_id,
                dtl.institution_id,
                dtl.used_column_names
            FROM department_table_list dtl
            JOIN department_form_schemas dfs
              ON dfs.department_form_id = dtl.id
            WHERE dtl.form_name = $1
            ORDER BY dfs.academic_year DESC
            LIMIT 1
            `,
            [formName]
        );

        row = latestRows[0] || null;
    }
}
  if (!row) return null;

  // New-style schema rows (snapshot model) are complete — return as-is.
  // Legacy extra-only rows (no base fields present) are merged with the
  // creation-year base row for backward compatibility.
  let baseRow;

if (row.department_form_id) {

    const { rows } = await pool.query(
        `
        SELECT *
        FROM department_form_schemas
        WHERE department_form_id = $1
          AND is_base = true
        LIMIT 1
        `,
        [row.department_form_id]
    );

    baseRow = rows[0] || null;

} else {

    baseRow = await getBaseSchemaRow(
        pool,
        formName,
        row.institution_id || institutionId
    );

}
  if (!baseRow || baseRow.id === row.id) return row;

  const baseFields     = baseRow.schema?.fields || [];
  const rowFields      = row.schema?.fields || [];
  const baseFieldNames = new Set(baseFields.map(f => f.column_name));
  const hasBaseFields  = rowFields.some(f => baseFieldNames.has(f.column_name));
  if (hasBaseFields) return row; // complete snapshot — no merge needed

  const uniqueExtra = rowFields.filter(f => !baseFieldNames.has(f.column_name));
  return {
    ...row,
    schema: {
      ...row.schema,
      fields: [...baseFields, ...uniqueExtra],
    },
    used_column_names: [
      ...(baseRow.used_column_names || []),
      ...(row.used_column_names || []).filter(n => !baseFieldNames.has(n)),
    ],
  };
}


function activeFields(schemaRow) {
  const excluded = new Set(schemaRow.schema?.excluded_fixed_columns || []);
  const seen = new Set();
  return (schemaRow.schema?.fields || []).filter((f) => {
    if (f.hidden) return false; // hidden columns excluded from data collection & display
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
const LOCK_MSG_MANUAL  = "This form is currently locked by the institution admin. You can only view the records.";
const LOCK_MSG_EXPIRED = "This form deadline has expired for your institution. The form is automatically locked.";

/* The original (form-wide) lock decision for a single {is_locked,auto_locked,
   deadline_at} row — extracted verbatim so both the legacy form_lock_config row
   and a year-scoped row reuse the exact same semantics. */
function lockDecisionFor(row) {
  if (!row?.is_locked) return { locked: false, message: null };
  const expired =
    row.auto_locked ||
    (row.deadline_at && new Date(row.deadline_at).getTime() <= Date.now());
  return { locked: true, message: expired ? LOCK_MSG_EXPIRED : LOCK_MSG_MANUAL };
}

/* Returns { locked, message }. When `year` is supplied AND this (form,
   institution, year) has its own per-year deadline row, the DEADLINE dimension is
   governed per-year (Issue 5) — a form-wide MANUAL admin lock still applies across
   all years. A form with no per-year row keeps the exact legacy form-wide result,
   so untouched forms behave byte-identically (validated by the shadow guard). */
async function getLockBlock(pool, formName, institutionId, year = null) {
  const { rows } = await pool.query(
    `SELECT flc.is_locked, flc.auto_locked, flc.deadline_at
     FROM form_lock_config flc
     WHERE flc.form_name = $1 AND flc.institution_id = $2`,
    [formName, institutionId]
  );
  const row = rows[0];

  // LEGACY (authoritative form-wide decision — unchanged).
  const legacy = lockDecisionFor(row);

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

  let result = assertEquivalent("formData.getLockBlock", legacy, candidate);

  // Issue 5 — per-year deadline override. Only when a per-year row exists for this
  // year; otherwise the legacy form-wide result above stands (backward compatible).
  if (year != null) {
    const { rows: yr } = await pool.query(
      `SELECT is_locked, auto_locked, deadline_at FROM form_year_deadlines
       WHERE form_name = $1 AND institution_id = $2 AND academic_year = $3`,
      [formName, institutionId, Number(year)]
    );
    if (yr.length) {
      const manualLocked = !!row?.is_locked && !row?.auto_locked; // form-wide admin lock
      result = manualLocked
        ? { locked: true, message: LOCK_MSG_MANUAL }
        : lockDecisionFor(yr[0]);
    }
  }
  return result;
}

/* Resolve the academic year a write targets for the deadline check: the top-bar
   selection (X-Academic-Year header) wins, else the supplied fallback. */
function lockYearForReq(req, fallbackYear = null) {
  const h = Number(req?.headers?.["x-academic-year"]);
  return Number.isInteger(h) ? h : (fallbackYear ?? null);
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

    let schema = await getActiveSchema(pool, formName, ctx.institutionId, year);
    if (!schema && year != null)
      schema = await getActiveSchema(pool, formName, ctx.institutionId, null);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found for this form." });

    const queryParams = [ctx.institutionId];
    const deptClause  = (ctx.role === "department_admin" && ctx.departmentId)
      ? (() => { queryParams.push(ctx.departmentId); return `AND (department_id = $${queryParams.length} OR department_id IS NULL)`; })()
      : "";

    /* Year filter — restrict records to the selected academic year so each year's
       data is isolated. Records saved before this feature existed carry year=NULL
       and are included when no year is provided (legacy callers); when a year IS
       provided they are excluded so the view stays year-clean. */
    let yearClause = "";
    const parsedYear = year != null ? Number(year) : NaN;
    if (Number.isInteger(parsedYear) && parsedYear > 0) {
      queryParams.push(parsedYear);
      yearClause = `AND year = $${queryParams.length}`;
    }

    /* Issue 7 — opt-in server pagination + search + sort. All three are OFF unless
       their query params are present, so existing callers get the byte-identical
       full, created_at-DESC result set as before. */
    const limitNum  = Number(req.query.limit);
    const offsetNum = Number(req.query.offset) || 0;
    const paginate  = Number.isInteger(limitNum) && limitNum > 0;

    // Split schema fields into physical-column fields vs JSONB (custom_fields) fields.
    // Physical columns support ORDER BY and plain col::text ILIKE search.
    // JSONB fields must use custom_fields->>'col' ILIKE for search.
    const physicalCols = await getPhysicalCols(pool, `${formName}_records`);
    const allSchemaCols = activeFields(schema)
      .map((f) => dbCol(f.column_name))
      .filter((c) => /^[a-z][a-z0-9_]*$/.test(c));
    const physSearchCols = allSchemaCols.filter(c => physicalCols.has(c));
    const jsonbSearchCols = allSchemaCols.filter(c => !physicalCols.has(c));

    const searchTerm = (req.query.search ?? "").toString().trim();

    // Validated ORDER BY — only created_at or a physical column; never a JSONB key or raw input.
    const sortReq = (req.query.sort ?? "").toString().trim().toLowerCase();
    const sortCol = (sortReq === "created_at" || physSearchCols.includes(sortReq)) ? sortReq : "created_at";
    const sortDir = (req.query.dir ?? "").toString().toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderBy = `ORDER BY ${sortCol} ${sortDir}${(paginate || sortReq) ? ", id DESC" : ""}`;

    /* Appends a case-insensitive OR-search across all active columns. Physical
       columns use col::text ILIKE; JSONB extra fields use custom_fields->>'col' ILIKE. */
    function searchClause() {
      if (!searchTerm || allSchemaCols.length === 0) return "";
      queryParams.push(`%${searchTerm}%`);
      const p = `$${queryParams.length}`;
      const conditions = [
        ...physSearchCols.map(c => `${c}::text ILIKE ${p}`),
        ...jsonbSearchCols.map(c => `custom_fields->>'${c}' ILIKE ${p}`),
      ];
      if (conditions.length === 0) return "";
      return `AND (${conditions.join(" OR ")})`;
    }

    let recordsQuery;
    if (language === "en") {
      const sc = searchClause();
      recordsQuery = `SELECT * FROM ${formName}_records
                      WHERE institution_id = $1 AND (language = 'en' OR language IS NULL)
                      ${deptClause} ${yearClause} ${sc}
                      ${orderBy}`;
    } else {
      /* For non-English: return translated rows where they exist, PLUS English
         rows that have no translated mirror (imported records, translation-disabled
         forms). This prevents the blank-screen when Hindi rows are absent. */
      queryParams.push(language);
      const langParam = `$${queryParams.length}`;
      const sc = searchClause(); // pushed AFTER language → correct $n
      recordsQuery = `
        WITH has_translation AS (
          SELECT source_row_id
          FROM   ${formName}_records
          WHERE  language = ${langParam}
            AND  source_row_id IS NOT NULL
            AND  institution_id = $1
            ${yearClause}
        )
        SELECT * FROM ${formName}_records
        WHERE institution_id = $1
          ${deptClause}
          ${yearClause}
          AND (
            language = ${langParam}
            OR (
              (language = 'en' OR language IS NULL)
              AND id NOT IN (SELECT source_row_id FROM has_translation)
            )
          )
          ${sc}
        ${orderBy}`;
    }

    let total = null;
    if (paginate) {
      const { rows: cnt } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM (${recordsQuery}) AS sub`,
        queryParams
      );
      total = cnt[0]?.n ?? 0;
      recordsQuery += ` LIMIT ${limitNum} OFFSET ${Math.max(0, offsetNum)}`;
    }

    const { rows: rawRecords } = await pool.query(recordsQuery, queryParams);

    /* Flatten extra fields stored in custom_fields JSONB into the top-level
       row object so the frontend receives a uniform flat record regardless of
       whether a field is a physical column or a JSONB extra field. */
    const records = rawRecords.map(row => {
      if (!row.custom_fields || typeof row.custom_fields !== "object") return row;
      return { ...row, ...row.custom_fields };
    });

    const { rows: lockRows } = await pool.query(
      `SELECT is_locked, locked_by, locked_at, deadline_at, COALESCE(auto_locked, false) AS auto_locked
       FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, ctx.institutionId]
    );
    const lock = lockRows[0] || { is_locked: false, locked_by: null, locked_at: null, deadline_at: null, auto_locked: false };

    /* Issue 5 — when a per-year deadline governs the selected academic year, show
       THAT year's deadline/lock in the banner (a form-wide manual lock still wins).
       Forms without a per-year row keep the legacy form-wide lock object above. */
    const lockYear = lockYearForReq(req, year != null ? Number(year) : null);
    if (lockYear != null) {
      const { rows: yr } = await pool.query(
        `SELECT is_locked, auto_locked, deadline_at, locked_at, locked_by
         FROM form_year_deadlines
         WHERE form_name = $1 AND institution_id = $2 AND academic_year = $3`,
        [formName, ctx.institutionId, lockYear]
      );
      if (yr.length) {
        const manualLocked = !!lock.is_locked && !lock.auto_locked;
        lock.deadline_at = yr[0].deadline_at;
        lock.auto_locked = !!yr[0].auto_locked;
        lock.is_locked   = manualLocked || !!yr[0].is_locked;
        lock.locked_at   = yr[0].locked_at ?? lock.locked_at;
        lock.locked_by   = yr[0].locked_by ?? lock.locked_by;
      }
    }

    /* Enrich schema labels for non-English responses so the frontend can show
       translated headers without a separate translation request. */
    const displaySchema = language !== "en"
      ? await enrichSchemaLabels(schema, language)
      : schema;

    /* Archive (highest precedence) → surface as view-only so the client hides
       Save/Delete/Import and shows the view-only banner. Export & search still
       work (they don't consult lock.is_locked). Writes are independently blocked
       on the server (the POST/PUT/DELETE handlers above). */
    const archiveView = await getFormArchiveBlockForReq(
      pool, req, ctx.institutionId, formName, schema?.year ?? (year != null ? Number(year) : null)
    );
    if (archiveView.blocked) {
      lock.is_locked = true;
      lock.archived  = true;
      lock.message   = archiveView.message;
    }

    /* Issue 18 — surface the ACADEMIC-YEAR (master) lock/archive in the banner too,
       using the SAME helper the write handlers enforce (getAcademicYearLockBlockForReq).
       Without this the year could be locked — blocking POST/PUT/DELETE — while the UI
       still showed the form as editable (list state ≠ save state). Now the view-only
       banner matches exactly what a save would do. */
    const ayView = await getAcademicYearLockBlockForReq(
      pool, req, ctx.institutionId, schema?.year ?? (year != null ? Number(year) : null)
    );
    if (ayView.locked) {
      lock.is_locked = true;
      lock.message   = lock.message || ayView.message;
    }

    /* Bug 11 — an inactive department makes ALL its records view-only (highest
       precedence: Department inactive > Archive > Lock > Deadline). Surface it so
       the client hides Save/Delete/Import; writes are independently blocked above.
       Institution-level admins (no department scope) are unaffected. */
    const deptView = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptView.blocked) {
      lock.is_locked           = true;
      lock.department_inactive = true;
      lock.message             = deptView.message;
    }

    const payload = { success: true, records, schema: displaySchema, lock };
    if (paginate) { payload.total = total; payload.limit = limitNum; payload.offset = Math.max(0, offsetNum); }
    return res.json(payload);
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/form-data/:formName/records/:id
   Fetches the latest version of a single record. Called by the edit flow
   immediately after lock acquisition so the form is always pre-populated
   with fresh DB data rather than the potentially stale list-page snapshot.
   Scoped to the caller's institution (and department for dept admins).
─────────────────────────────────────────────────────────────────────── */
router.get("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    let whereClause = "id = $1 AND institution_id = $2";
    const params = [id, ctx.institutionId];
    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $3 OR department_id IS NULL)`;
      params.push(ctx.departmentId);
    }

    const { rows } = await pool.query(
      `SELECT * FROM ${formName}_records WHERE ${whereClause}`,
      params
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "Record not found or has been deleted." });

    const record = rows[0];

    let englishRow = null;
let hindiRow = null;

if ((record.language ?? "en") === "en") {
  englishRow = record;

 let hiQuery = `
    SELECT *
    FROM ${formName}_records
    WHERE source_row_id = $1
      AND institution_id = $2
      AND language = 'hi'
`;

const hiParams = [englishRow.id, ctx.institutionId];

if (ctx.role === "department_admin" && ctx.departmentId) {
    hiQuery += ` AND (department_id = $3 OR department_id IS NULL)`;
    hiParams.push(ctx.departmentId);
}

hiQuery += ` LIMIT 1`;

const { rows: hiRows } = await pool.query(
    hiQuery,
    hiParams
);

  hindiRow = hiRows[0] || null;

} else {
  hindiRow = record;

  let enQuery = `
    SELECT *
    FROM ${formName}_records
    WHERE id = $1
      AND institution_id = $2
`;

const enParams = [hindiRow.source_row_id, ctx.institutionId];

if (ctx.role === "department_admin" && ctx.departmentId) {
    enQuery += ` AND (department_id = $3 OR department_id IS NULL)`;
    enParams.push(ctx.departmentId);
}

enQuery += ` LIMIT 1`;

const { rows: enRows } = await pool.query(
    enQuery,
    enParams
);

  englishRow = enRows[0] || null;
}
const data = {};
const dataHi = {};

const source =
    englishRow ?? hindiRow;

const recordYear =
    source?.year ?? null;

const schema = await getActiveSchema(
    pool,
    formName,
    ctx.institutionId,
    recordYear
);

if (!schema)
    return res.status(404).json({
        success: false,
        message: "No active schema found."
    });

for (const field of activeFields(schema)) {

    const col = dbCol(field.column_name);

    data[col] =
        englishRow?.[col] ?? null;

    dataHi[col] =
        hindiRow?.[col] ?? null;
}
   
     
    if (englishRow?.custom_fields && typeof englishRow.custom_fields === "object") {
    Object.assign(englishRow, englishRow.custom_fields);
}

if (hindiRow?.custom_fields && typeof hindiRow.custom_fields === "object") {
    Object.assign(hindiRow, hindiRow.custom_fields);
}

    return res.json({
    success: true,
    record: {
        ...(englishRow || hindiRow),
        data,
        data_hi: dataHi,
        // Real per-row identity for the English/Hindi pair — the frontend
        // needs each row's own id (not just its field VALUES above) to PATCH
        // a document/image field on the correct row via the fast-path
        // upload-persist endpoint. Without this, a Hindi document upload had
        // no id to target and silently fell back to treating the record as
        // never-saved, so it never fired the immediate DB persist that the
        // English side already got.
        englishRecord: englishRow,
        hindiRecord: hindiRow,
    }
});
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch record." });
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
// router.post("/:formName/records", async (req, res) => {
//   const pool = req.app.locals.pool;
//   const { formName } = req.params;
//   const { data, year, language = SOURCE_LANGUAGE } = req.body;

//   if (!validateFormName(formName))
//     return res.status(400).json({ success: false, message: "Invalid form name." });
//   if (!data || typeof data !== "object")
//     return res.status(400).json({ success: false, message: "data is required." });

//   try {
//     const ctx = await resolveUserContext(pool, req);
//     if (!ctx.institutionId)
//       return res.status(400).json({ success: false, message: "Institution ID required." });

//     // Bug 11 — department inactive is the highest-precedence write block.
//     const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
//     if (deptBlock.blocked)
//       return res.status(403).json({ success: false, message: deptBlock.message });

//     const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req, Number(year) || null));
//     if (lockBlock.locked) {
//       return res.status(403).json({ success: false, message: lockBlock.message });
//     }

//     /* ── M-2 fix — ONE resolved academic year drives BOTH the schema lookup and
//        record.year, so a record can never belong to one year but reference another
//        year's schema. Resolve the effective year ONCE (explicit body → SELECTED
//        top-bar header → institution ACTIVE year; no calendar shortcut), look up the
//        schema FOR THAT YEAR, and only if that year has no schema fall back to the
//        latest active one (existing behavior — forms without a per-year schema still
//        save). record.year is then taken from the SCHEMA THAT WAS ACTUALLY USED, so
//        record.year === schema.year ALWAYS. ── */
//     const effectiveYear = Number(year)
//       || lockYearForReq(req)
//       || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : null);

//     let schema = await getActiveSchema(pool, formName, ctx.institutionId, effectiveYear);
//     if (!schema && effectiveYear != null)
//       schema = await getActiveSchema(pool, formName, ctx.institutionId, null); // latest active fallback
//     if (!schema)
//       return res.status(404).json({ success: false, message: "No active schema found." });
//     // Bug 17 — store the CONSUMER institution's own schema id (for the SAME year),
//     // never the creator's.
//     schema = await resolveOwnedSchema(pool, formName, ctx.institutionId, schema.year, schema);

//     const fields    = activeFields(schema);
//     const fieldCols = fields.map((f) => dbCol(f.column_name));
//     // const fieldModes = buildFieldModes(fields);
//     const formYear  = effectiveYear ?? schema.year;
//     const createdBy = req.user.userId || null;

//     const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, formYear);
//     if (ayLock.locked)
//       return res.status(403).json({ success: false, message: ayLock.message });

//     const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, formYear);
//     if (archiveBlock.blocked)
//       return res.status(403).json({ success: false, message: archiveBlock.message });

//     // Resolve the physical records table (institution or department form)
// const tableName = await resolveRecordsTable(
//     pool,
//     formName,
//     ctx.institutionId
// );

// if (!tableName) {
//     return res.status(404).json({
//         success: false,
//         message: "Form data table not found."
//     });
// }


//     /* Split schema fields: those with a physical column go to real DB columns;
//        extra fields (added after creation via schema edit in a new year) are
//        stored in the custom_fields JSONB column — no ALTER TABLE ever runs. */
//    const physicalCols = await getPhysicalCols(
//     pool,
//     tableName
// );
//     const baseFieldCols = fieldCols.filter(col => physicalCols.has(col));
//     const extraFieldCols = fieldCols.filter(col => !physicalCols.has(col));
//     const customFieldsJson = extraFieldCols.length > 0
//       ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, data[col] ?? null])))
//       : null;

//   // ----------------------------------------------------
// // Standard columns (supports BOTH institution & department forms)
// // ----------------------------------------------------
// const stdCols = [];
// const stdVals = [];

// if (physicalCols.has("form_name")) {
//     stdCols.push("form_name");
//     stdVals.push(formName);
// }

// if (physicalCols.has("institution_id")) {
//     stdCols.push("institution_id");
//     stdVals.push(ctx.institutionId);
// }

// if (physicalCols.has("department_id")) {
//     stdCols.push("department_id");
//     stdVals.push(ctx.departmentId);
// }

// // Institution form
// if (physicalCols.has("year")) {
//     stdCols.push("year");
//     stdVals.push(formYear);
// }

// // Department form
// if (physicalCols.has("academic_year")) {
//     stdCols.push("academic_year");
//     stdVals.push(formYear);
// }

// if (physicalCols.has("schema_id")) {
//     stdCols.push("schema_id");
//     stdVals.push(schema.id);
// }

// if (physicalCols.has("language")) {
//     stdCols.push("language");
//     stdVals.push(language);
// }

// if (physicalCols.has("created_by")) {
//     stdCols.push("created_by");
//     stdVals.push(createdBy);
// }

//     const allCols = [...stdCols, "custom_fields", ...baseFieldCols];
//     const allVals = [...stdVals, customFieldsJson, ...baseFieldCols.map(col => data[col] ?? null)];
//     const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

//    const { rows } = await pool.query(
//   `INSERT INTO ${tableName} (${allCols.join(", ")})
//    VALUES (${placeholders})
//    RETURNING *`,
//   allVals
// );
//     const enRow = rows[0];

//     await writeAuditLog(req, {
//       actionType: "FORM_DATA_CREATED",
//       entityType: "form_data",
//       entityId: enRow.id,
//       newValue: { form_name: formName, institution_id: ctx.institutionId, department_id: ctx.departmentId },
//       message: `Form Data Added - "${formName}"`,
//     });

//     // Synchronously generate the Hindi mirror row before responding so the
//     // client re-fetching records immediately after save always sees it.
//     // Only generated for English submissions when this form has the Hindi
//     // translation toggle enabled — when disabled we store only the English
//     // row (no translation/transliteration API call). Translation failure is
//     // logged but does not fail the response — the English row is already
//     // committed.
//     if (language === "en") {
     
//       try {
//         await ensureSourceRowIdColumn(pool, tableName);

//         const hiData = req.body.data_hi;
//         if (
//     !hiData ||
//     typeof hiData !== "object" ||
//     Object.keys(hiData).length === 0
// ) {
//     return res.json({
//         success: true,
//         record: enRow,
//         message: "Record created successfully."
//     });
// }


//         const hiCustomFieldsJson = extraFieldCols.length > 0
//           ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, hiData[col] ?? null])))
//           : null;
//        // Copy English standard values
// const hiStdVals = [...stdVals];

// // Replace language with Hindi
// const langIndex = stdCols.indexOf("language");
// if (langIndex !== -1) {
//     hiStdVals[langIndex] = "hi";
// }
//         const hiAllCols = [...stdCols, "custom_fields", ...baseFieldCols, "source_row_id"];
//         const hiAllVals = [...hiStdVals, hiCustomFieldsJson, ...baseFieldCols.map(col => hiData[col] ?? null), enRow.id];
//         const hiPlaceholders = hiAllVals.map((_, i) => `$${i + 1}`).join(", ");

//         await pool.query(
//           `INSERT INTO ${tableName} (${hiAllCols.join(", ")}) VALUES (${hiPlaceholders})`,
//           hiAllVals
//         );
//       } catch (err) {
//         logger.error(`Hindi row insert failed for ${formName}`, { stack: err.stack });
//       }
//     }

//     return res.json({ success: true, record: enRow, message: "Record created successfully." });
//   } catch (err) {
//     logger.error(`POST /api/form-data/${formName}/records`, { stack: err.stack });
//     return res.status(500).json({ success: false, message: "Failed to create record." });
//   }
// });





router.post("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
 const {
    data,
    data_hi,
    englishData,
    hindiData,
    year,
    language = SOURCE_LANGUAGE
} = req.body;

// Backward compatibility
const enData = englishData || data;
const hiData = hindiData || data_hi;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  // if (!data || typeof data !== "object")
  //   return res.status(400).json({ success: false, message: "data is required." });

  if (
    !enData ||
    typeof enData !== "object" ||
    Array.isArray(enData)
) {
    return res.status(400).json({
        success: false,
        message: "English data is required."
    });
}

if (
    hiData &&
    (
        typeof hiData !== "object" ||
        Array.isArray(hiData)
    )
) {
    return res.status(400).json({
        success: false,
        message: "Invalid Hindi data."
    });
}

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    // Bug 11 — department inactive is the highest-precedence write block.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req, Number(year) || null));
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    /* ── M-2 fix — ONE resolved academic year drives BOTH the schema lookup and
       record.year, so a record can never belong to one year but reference another
       year's schema. Resolve the effective year ONCE (explicit body → SELECTED
       top-bar header → institution ACTIVE year; no calendar shortcut), look up the
       schema FOR THAT YEAR, and only if that year has no schema fall back to the
       latest active one (existing behavior — forms without a per-year schema still
       save). record.year is then taken from the SCHEMA THAT WAS ACTUALLY USED, so
       record.year === schema.year ALWAYS. ── */
    const effectiveYear = Number(year)
      || lockYearForReq(req)
      || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : null);

    let schema = await getActiveSchema(pool, formName, ctx.institutionId, effectiveYear);
    if (!schema && effectiveYear != null)
      schema = await getActiveSchema(pool, formName, ctx.institutionId, null); // latest active fallback
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });
    // Bug 17 — store the CONSUMER institution's own schema id (for the SAME year),
    // never the creator's.
    schema = await resolveOwnedSchema(pool, formName, ctx.institutionId, schema.year, schema);

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const formYear  = effectiveYear ?? schema.year;
    const createdBy = req.user.userId || null;

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, formYear);
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, formYear);
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });

    // Document fields carry a signed "/api/file/<token>" URL from the upload
    // widget — resolve it to the underlying storage key before persisting.
    // Each language's form has its own independent document upload, so
    // check both (previously only enData/"data" was resolved — a Hindi
    // document field's raw token URL was stored as-is).
    for (const f of fields) {
      const col = dbCol(f.column_name);
      if (f.type !== "document") continue;
      for (const langData of [enData, hiData]) {
        if (langData && typeof langData[col] === "string") {
          const match = langData[col].match(/\/api\/file\/(.+)$/);
          if (match) {
            const key = decodeFileTokenWithoutVerification(match[1]);
            if (key) langData[col] = key;
          }
        }
      }
    }

    /* Split schema fields: those with a physical column go to real DB columns;
       extra fields (added after creation via schema edit in a new year) are
       stored in the custom_fields JSONB column — no ALTER TABLE ever runs. */
    const physicalCols  = await getPhysicalCols(pool, `${formName}_records`);
    const baseFieldCols = fieldCols.filter(col => physicalCols.has(col));
    const extraFieldCols = fieldCols.filter(col => !physicalCols.has(col));
    const customFieldsJson = extraFieldCols.length > 0
      ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, enData[col] ?? null])))
      : null;

    const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "created_by"];
    const stdVals = [formName, ctx.institutionId, ctx.departmentId, formYear, schema.id, language, createdBy];

    const allCols = [...stdCols, "custom_fields", ...baseFieldCols];
    const allVals = [...stdVals, customFieldsJson, ...baseFieldCols.map(col => enData[col] ?? null)];
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

    // Manual Hindi mirror row — frontend now sends the Hindi payload directly
    // (data_hi) instead of us calling a translation API. No data_hi means the
    // client hasn't supplied a Hindi version yet; that's not an error, we just
    // respond with the English row.
    // const hiData = req.body.data_hi;

    if (
      !hiData ||
      typeof hiData !== "object" ||
      Object.keys(hiData).length === 0
    ) {
      return res.json({
    success: true,
    englishRecord: enRow,
    message: "Record created successfully."
});
    }

    const tableName = `${formName}_records`;
    try {
      await ensureSourceRowIdColumn(pool, tableName);

      const hiCustomFieldsJson = extraFieldCols.length > 0
        ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, hiData[col] ?? null])))
        : null;

      const hiStdVals = [...stdVals];
      const langIndex = stdCols.indexOf("language");
      if (langIndex !== -1) hiStdVals[langIndex] = "hi";

      const hiAllCols = [...stdCols, "custom_fields", ...baseFieldCols, "source_row_id"];
      const hiAllVals = [...hiStdVals, hiCustomFieldsJson, ...baseFieldCols.map(col => hiData[col] ?? null), enRow.id];
      const hiPlaceholders = hiAllVals.map((_, i) => `$${i + 1}`).join(", ");

      await pool.query(
        `INSERT INTO ${tableName} (${hiAllCols.join(", ")}) VALUES (${hiPlaceholders})`,
        hiAllVals
      );
    } catch (err) {
      logger.error(`Hindi row insert failed for ${formName}`, { stack: err.stack });
    }

    return res.json({ success: true, record: enRow, message: "Record created successfully." });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create record." });
  }
});




/* ─────────────────────────────────────────────────────────────────────
   POST /api/form-data/:formName/records/:id/lock
   Acquire a pre-edit lock. Returns 200 { acquired:true } or
   409 { acquired:false, lockedByName, expiresAt } when locked by someone else.
─────────────────────────────────────────────────────────────────────── */
router.post("/:formName/records/:id/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;
  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  try {
    const { rows: userRows } = await pool.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [req.user.userId]
    );
    const userName = userRows[0]?.full_name || "A user";

    const result = await acquireLock(pool, {
      recordId: id,
      formType: "institute",
      formId: formName,
      userId: req.user.userId,
      userName,
    });

    if (result.acquired) {
      return res.json({ success: true, acquired: true });
    }
    // Return 200 (not 409) so the response is always a normal business outcome.
    return res.json({
      success: true,
      acquired: false,
      lockedByName: result.lockedByName,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/records/${id}/lock`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to acquire edit lock." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/:id/lock
   Release the caller's edit lock. Silently succeeds if no lock exists.
─────────────────────────────────────────────────────────────────────── */
router.delete("/:formName/records/:id/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  try {
    await releaseLock(pool, { recordId: id, userId: req.user.userId });
    return res.json({ success: true });
  } catch (err) {
    logger.error(`DELETE /api/form-data/records/${id}/lock`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to release edit lock." });
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
  const { data, updated_at } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!data || typeof data !== "object")
    return res.status(400).json({ success: false, message: "data is required." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    // Bug 11 — department inactive is the highest-precedence write block.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req));
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    /* Fetch the record first so its own year drives the schema lookup.
       A 2023 record must be validated/saved against the 2023 schema (a,b,c),
       not the latest schema (which may be 2024: a,b,c,d). */
    const { rows: targetRows } = await pool.query(
      `SELECT * FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
      [id, ctx.institutionId]
    );
    if (!targetRows.length)
      return res.status(404).json({ success: false, message: "Record not found." });
    const editedLanguage = targetRows[0].language === "hi" ? "hi" : "en";
    const recordYear = targetRows[0].year != null ? Number(targetRows[0].year) : null;

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, recordYear);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });

    // Academic-year lock — checks the record's own year.
    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, recordYear ?? schema.year);
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    // Archive write policy (highest precedence) — archived form is view-only.
    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, recordYear ?? schema.year);
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    // const fieldModes = buildFieldModes(fields);

    for (const f of fields) {
      const col = dbCol(f.column_name);
      if (f.type === "document" && typeof data[col] === "string") {
        const match = data[col].match(/\/api\/file\/(.+)$/);
        if (match) {
          const key = decodeFileTokenWithoutVerification(match[1]);
          if (key) data[col] = key;
        }
      }
    }

    /* Split fields: base fields (physical columns) vs extra fields (JSONB). */
    const physicalCols   = await getPhysicalCols(pool, `${formName}_records`);
    const baseFieldCols  = fieldCols.filter(col => physicalCols.has(col));
    const extraFieldCols = fieldCols.filter(col => !physicalCols.has(col));
    const customFieldsJson = extraFieldCols.length > 0
      ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, data[col] ?? null])))
      : null;

    if (updated_at) {
      const clientMs = new Date(updated_at).getTime();
      const dbMs     = targetRows[0].updated_at ? new Date(targetRows[0].updated_at).getTime() : null;
      if (dbMs != null && Number.isFinite(clientMs) && clientMs !== dbMs) {
        return res.status(409).json({
          success: false,
          conflict: true,
          message: "This record was modified by another user. Please refresh and try again.",
        });
      }
    }

    const recYearBlock = await getYearWriteBlock(
      pool, formName, ctx.institutionId,
      targetRows[0].year != null ? Number(targetRows[0].year) : null
    );
    if (recYearBlock.blocked)
      return res.status(403).json({ success: false, message: recYearBlock.message });

    let idx = 1;
    const setClauses = [
      ...baseFieldCols.map(col => `${col} = $${idx++}`),
      ...(extraFieldCols.length > 0 ? [`custom_fields = $${idx++}`] : []),
      `updated_at = now()`,
    ];

    let whereClause = `institution_id = $${idx++} AND id = $${idx++}`;
    const whereVals = [ctx.institutionId, id];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $${idx++} OR department_id IS NULL)`;
      whereVals.push(ctx.departmentId);
    }

    const vals = [
      ...baseFieldCols.map(col => data[col] ?? null),
      ...(extraFieldCols.length > 0 ? [customFieldsJson] : []),
      ...whereVals,
    ];

    const { rows } = await pool.query(
      `UPDATE ${formName}_records SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`,
      vals
    );

    if (!rows.length) {
      // Concurrency is already checked above. A 0-row result here means the row
      // exists but is outside this user's writable scope (e.g. a department admin
      // editing another department's record), or it no longer exists.
      const { rows: still } = await pool.query(
        `SELECT 1 FROM ${formName}_records WHERE id = $1 AND institution_id = $2 LIMIT 1`,
        [id, ctx.institutionId]
      );
      if (still.length)
        return res.status(403).json({ success: false, message: "You do not have permission to edit this record." });
      return res.status(404).json({ success: false, message: "Record not found." });
    }

    // Clean up replaced files
    const oldKeys = extractUploadKeys(targetRows[0]);
    const newKeys = extractUploadKeys(data);
    const toDelete = oldKeys.filter(k => !newKeys.includes(k));
    for (const key of toDelete) {
      await deleteFile(key).catch(() => {});
    }

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
    // if (editedLanguage === "en" && await isHindiTranslationEnabled(pool, formName)) {
    //   const tableName = `${formName}_records`;
    //   try {
    //     await ensureSourceRowIdColumn(pool, tableName);

    //     // const hiData = await translateRow(data, fieldModes);
    //     const hiCustomFieldsJson = extraFieldCols.length > 0
    //       ? JSON.stringify(Object.fromEntries(extraFieldCols.map(col => [col, hiData[col] ?? null])))
    //       : null;

    //     let hidx = 1;
    //     const hiSetClauses = [
    //       ...baseFieldCols.map(col => `${col} = $${hidx++}`),
    //       ...(extraFieldCols.length > 0 ? [`custom_fields = $${hidx++}`] : []),
    //       `updated_at = now()`,
    //     ];
    //     const hiVals = [
    //       ...baseFieldCols.map(col => hiData[col] ?? null),
    //       ...(extraFieldCols.length > 0 ? [hiCustomFieldsJson] : []),
    //       id, ctx.institutionId,
    //     ];

    //     const upd = await pool.query(
    //       `UPDATE ${tableName} SET ${hiSetClauses.join(", ")}
    //        WHERE source_row_id = $${hidx} AND institution_id = $${hidx + 1}`,
    //       hiVals
    //     );

    //     if (upd.rowCount === 0) {
    //       const enRow = rows[0];
    //       const hiCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "created_by", "source_row_id", "custom_fields", ...baseFieldCols];
    //       const hiAllVals = [
    //         formName, enRow.institution_id, enRow.department_id, enRow.year, enRow.schema_id,
    //         "hi", enRow.created_by ?? req.user.userId ?? null, enRow.id,
    //         hiCustomFieldsJson,
    //         ...baseFieldCols.map(col => hiData[col] ?? null),
    //       ];
    //       const ph = hiAllVals.map((_, i) => `$${i + 1}`).join(", ");
    //       await pool.query(
    //         `INSERT INTO ${tableName} (${hiCols.join(", ")}) VALUES (${ph})`,
    //         hiAllVals
    //       );
    //     }
    //   } catch (err) {
    //     logger.error(`Hindi row update failed for ${formName}/${id}`, { stack: err.stack });
    //   }
    // }
   
    // ----------------------------------------------------
// Manual Hindi update (frontend sends data_hi)
// ----------------------------------------------------
const hiData = req.body.data_hi;

// Only when editing an English record AND frontend supplied Hindi data.
if (
    editedLanguage === "en" &&
    hiData &&
    typeof hiData === "object" &&
    Object.keys(hiData).length > 0
) {
    const tableName = `${formName}_records`;

    // Resolve the Hindi document field's signed upload-token URL to its
    // storage key before persisting — previously only the English row's
    // fields got this treatment, so a Hindi document/photo upload stored
    // the raw temporary URL instead of the real file key.
    for (const f of fields) {
      const col = dbCol(f.column_name);
      if (f.type !== "document" || typeof hiData[col] !== "string") continue;
      const hiMatch = hiData[col].match(/\/api\/file\/(.+)$/);
      if (hiMatch) {
        const hiKey = decodeFileTokenWithoutVerification(hiMatch[1]);
        if (hiKey) hiData[col] = hiKey;
      }
    }

    try {
        await ensureSourceRowIdColumn(pool, tableName);

        // Clean up the Hindi row's own superseded files — previously only
        // the directly-edited row's files were diffed (see "Clean up
        // replaced files" above); the Hindi mirror's old document/image was
        // never cleaned up when it changed here, orphaning it on disk.
        const { rows: existingHiRows } = await pool.query(
          `SELECT * FROM ${tableName} WHERE source_row_id = $1 AND institution_id = $2`,
          [id, ctx.institutionId]
        );
        const hiOldKeys = extractUploadKeys(existingHiRows[0] || {});
        const hiNewKeys = extractUploadKeys(hiData);
        const hiKeysToDelete = hiOldKeys.filter((k) => !hiNewKeys.includes(k));

        const hiCustomFieldsJson =
            extraFieldCols.length > 0
                ? JSON.stringify(
                      Object.fromEntries(
                          extraFieldCols.map(col => [
                              col,
                              hiData[col] ?? null
                          ])
                      )
                  )
                : null;

        let hidx = 1;

        const hiSetClauses = [
            ...baseFieldCols.map(col => `${col} = $${hidx++}`),
            ...(extraFieldCols.length
                ? [`custom_fields = $${hidx++}`]
                : []),
            `updated_at = now()`,
        ];

        const hiVals = [
            ...baseFieldCols.map(col => hiData[col] ?? null),
            ...(extraFieldCols.length
                ? [hiCustomFieldsJson]
                : []),
            id,
            ctx.institutionId,
        ];

        const upd = await pool.query(
            `UPDATE ${tableName}
             SET ${hiSetClauses.join(", ")}
             WHERE source_row_id = $${hidx}
               AND institution_id = $${hidx + 1}`,
            hiVals
        );

        // Hindi row doesn't exist yet → create it.
        if (upd.rowCount === 0) {

            const enRow = rows[0];

            const hiCols = [
                "form_name",
                "institution_id",
                "department_id",
                "year",
                "schema_id",
                "language",
                "created_by",
                "source_row_id",
                "custom_fields",
                ...baseFieldCols
            ];

            const hiAllVals = [
                formName,
                enRow.institution_id,
                enRow.department_id,
                enRow.year,
                enRow.schema_id,
                "hi",
                enRow.created_by ?? req.user.userId ?? null,
                enRow.id,
                hiCustomFieldsJson,
                ...baseFieldCols.map(col => hiData[col] ?? null)
            ];

            const placeholders =
                hiAllVals.map((_, i) => `$${i + 1}`).join(", ");

            await pool.query(
                `INSERT INTO ${tableName}
                (${hiCols.join(", ")})
                VALUES (${placeholders})`,
                hiAllVals
            );
        }

        for (const key of hiKeysToDelete) {
          await deleteFile(key).catch(() => {});
        }

    } catch (err) {

        logger.error(
            `Hindi row update failed for ${formName}/${id}`,
            { stack: err.stack }
        );

    }
}



    // Release the pre-edit lock on successful save (best-effort).
    releaseLock(pool, { recordId: id, userId: req.user.userId }).catch(() => {});

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error(`PUT /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/form-data/:formName/records/:id/file-field
   Body: { column, value }
   Mirrors blocks.js's PATCH .../file-field for reports: called right after
   a successful document/image upload for one existing record's document
   field, independent of that record's own Save/Submit. Reads the old value
   and writes the new one in a single atomic statement, then deletes the old
   file if superseded — regardless of whether the record edit has been
   submitted yet. Only ever touches a column the record's own active schema
   actually declares as a "document" field — never an arbitrary client-
   supplied column name. Operates only on the exact row `id` supplied —
   English and Hindi document/image fields are independent uploads, so this
   never touches the other language's row (previously it force-synced the
   Hindi mirror to the English row's file; the frontend now passes the
   Hindi row's own id when editing its document field instead).
───────────────────────────────────────────────────────────────────────── */
router.patch("/:formName/records/:id/file-field", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;
  const { column, value } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (typeof value !== "string")
    return res.status(400).json({ success: false, message: "value must be a string." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req));
    if (lockBlock.locked)
      return res.status(403).json({ success: false, message: lockBlock.message });

    const { rows: targetRows } = await pool.query(
      `SELECT * FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
      [id, ctx.institutionId]
    );
    if (!targetRows.length)
      return res.status(404).json({ success: false, message: "Record not found." });

    if (ctx.role === "department_admin" && ctx.departmentId) {
      const rowDept = targetRows[0].department_id;
      if (rowDept && rowDept !== ctx.departmentId)
        return res.status(404).json({ success: false, message: "Record not found." });
    }

    const recordYear = targetRows[0].year != null ? Number(targetRows[0].year) : null;
    const schema = await getActiveSchema(pool, formName, ctx.institutionId, recordYear);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found." });

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, recordYear ?? schema.year);
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, recordYear ?? schema.year);
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });

    const recYearBlock = await getYearWriteBlock(pool, formName, ctx.institutionId, recordYear);
    if (recYearBlock.blocked)
      return res.status(403).json({ success: false, message: recYearBlock.message });

    const col = dbCol(String(column || ""));
    const field = activeFields(schema).find(f => dbCol(f.column_name) === col && f.type === "document");
    if (!field)
      return res.status(400).json({ success: false, message: "Not a document field on this form." });

    const physicalCols = await getPhysicalCols(pool, `${formName}_records`);
    let oldValue;
    let newUpdatedAt;

    if (physicalCols.has(col)) {
      const { rows } = await pool.query(
        `WITH old AS (
           SELECT ${col} AS old_value FROM ${formName}_records WHERE id = $1 AND institution_id = $2
         )
         UPDATE ${formName}_records SET ${col} = $3, updated_at = now()
         WHERE id = $1 AND institution_id = $2
         RETURNING (SELECT old_value FROM old) AS old_value, updated_at`,
        [id, ctx.institutionId, value]
      );
      oldValue = rows[0]?.old_value;
      newUpdatedAt = rows[0]?.updated_at;
    } else {
      const { rows } = await pool.query(
        `WITH old AS (
           SELECT custom_fields ->> $3 AS old_value FROM ${formName}_records WHERE id = $1 AND institution_id = $2
         )
         UPDATE ${formName}_records
         SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'::jsonb), ARRAY[$3::text], to_jsonb($4::text), true),
             updated_at = now()
         WHERE id = $1 AND institution_id = $2
         RETURNING (SELECT old_value FROM old) AS old_value, updated_at`,
        [id, ctx.institutionId, col, value]
      );
      oldValue = rows[0]?.old_value;
      newUpdatedAt = rows[0]?.updated_at;
    }

    if (oldValue && oldValue !== value) {
      const [oldKey] = extractUploadKeys(oldValue);
      if (oldKey) await deleteFile(oldKey).catch(() => {});
    }

    // The fast-path upload above just advanced this record's updated_at —
    // report it back so the caller can keep its held reference current and
    // avoid a false "modified by another user" conflict on the next Save
    // (PUT's optimistic-concurrency check compares against updated_at).
    return res.json({ success: true, updated_at: newUpdatedAt });
  } catch (err) {
    logger.error(`PATCH /api/form-data/${formName}/records/${id}/file-field`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to save file field." });
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

    // Bug 11 — department inactive is the highest-precedence write block.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req));
    if (lockBlock.locked)
      return res.status(403).json({ success: false, message: lockBlock.message });

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    // Archive write policy (highest precedence) — archived form is view-only.
    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });

    /* H-2 — enforce against the records' OWN years: if ANY targeted record belongs
       to a locked/archived/academic-year-locked year, reject the whole batch (no
       partial delete) so a protected old-year row can't be removed by selecting a
       different active year. Department-scoped so a dept admin isn't over-blocked
       by other departments' rows that share the id list. */
    const targetYears = await getRecordYears(
      pool, formName, ids, ctx.institutionId,
      ctx.role === "department_admin" ? ctx.departmentId : null
    );
    for (const ty of targetYears) {
      const yb = await getYearWriteBlock(pool, formName, ctx.institutionId, ty);
      if (yb.blocked)
        return res.status(403).json({ success: false, message: yb.message });
    }

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    let whereClause   = "id = ANY($1::uuid[]) AND institution_id = $2";
    const queryParams = [ids, ctx.institutionId];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += " AND (department_id = $3 OR department_id IS NULL)";
      queryParams.push(ctx.departmentId);
    }

    const { rows: deletedRows, rowCount } = await pool.query(
      `DELETE FROM ${formName}_records WHERE ${whereClause} RETURNING *`,
      queryParams
    );

    /* Bug 12 — keep every language pair consistent regardless of which side was in
       the selection. Cascade to BOTH directions: the Hindi mirrors of any deleted
       English rows (source_row_id = deletedEnglishId) AND the English sources of any
       deleted Hindi rows (id = deletedHindiRow.source_row_id). */
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
          `DELETE FROM ${formName}_records
           WHERE (source_row_id = ANY($1::uuid[]) OR id = ANY($1::uuid[])) AND institution_id = $2 RETURNING *`,
          [cascadeIds, ctx.institutionId]
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

    // Bug 11 — department inactive is the highest-precedence write block.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    const lockBlock = await getLockBlock(pool, formName, ctx.institutionId, lockYearForReq(req));
    if (lockBlock.locked) {
      return res.status(403).json({ success: false, message: lockBlock.message });
    }

    const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (ayLock.locked)
      return res.status(403).json({ success: false, message: ayLock.message });

    // Archive write policy (highest precedence) — archived form is view-only.
    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, await getFormActiveYear(pool, formName, ctx.institutionId));
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    /* Bug 12 — delete the WHOLE language pair, whichever side was targeted.
       Resolve the English source id first: a Hindi row points at its source via
       source_row_id; an English row is its own root. Then deleting
       (id = root OR source_row_id = root) removes both, so a Hindi row can never be
       deleted on its own (English orphan) and vice-versa. */
    const { rows: tgtRows } = await pool.query(
      `SELECT source_row_id, year FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
      [id, ctx.institutionId]
    );

    /* H-2 — block deletion when the record's OWN year is locked/archived/AY-locked,
       independent of the latest schema year or the selected-year header. */
    const recYearBlock = await getYearWriteBlock(
      pool, formName, ctx.institutionId,
      tgtRows[0]?.year != null ? Number(tgtRows[0].year) : null
    );
    if (recYearBlock.blocked)
      return res.status(403).json({ success: false, message: recYearBlock.message });

    const rootId = tgtRows[0]?.source_row_id || id;

    let whereClause = "(id = $1 OR source_row_id = $1) AND institution_id = $2";
    const whereVals = [rootId, ctx.institutionId];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $3 OR department_id IS NULL)`;
      whereVals.push(ctx.departmentId);
    }

    const { rows: deletedRows, rowCount } = await pool.query(
      `DELETE FROM ${formName}_records WHERE ${whereClause} RETURNING *`,
      whereVals
    );

    if (!rowCount)
      return res.status(404).json({ success: false, message: "Record not found." });

    if (deletedRows.length > 0) {
      for (const row of deletedRows) {
        const keys = extractUploadKeys(row);
        for (const key of keys) {
          await deleteFile(key).catch(() => {});
        }
      }
    }

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
