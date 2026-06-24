"use strict";


const { randomUUID } = require("crypto");
const express  = require("express");
const multer   = require("multer");
const XLSX     = require("xlsx");     // used for import parsing only
const ExcelJS  = require("exceljs"); // used for styled Excel export
const { verifyToken } = require("../middleware/auth");
const logger  = require("../utils/logger");
const { getLogContext } = logger;
const { writeAuditLog } = require("../utils/audit");
const { translateSentence, transliteratePhrase, lookupLabel, translateRow, resolveTranslationMode } = require("../services/translationService");
const { getReadUrl } = require("../utils/s3");
const { getAcademicYearLockBlockForReq, getFormArchiveBlockForReq, resolveOperatingYear } = require("../services/academicYearService");
const { assertFormDomainAccess } = require("../services/domainService");
const { resolveEffectiveDepartment, getDepartmentWriteBlock } = require("../services/departmentContext");
const { ensureSchemaExists } = require("../services/schemaPropagationService");
const { isFormAssigned, isContributorOnly } = require("./formAssignments");


/* 7 days — maximum presigned URL lifetime for long-term IAM credentials */
const DOC_URL_TTL = 7 * 24 * 3600;


/* Regex for Devanagari script — used to validate stored Hindi labels. */
const DEVANAGARI_RE = /[ऀ-ॿ]/;


/* Resolve a single UI label to the target language.
   Priority order:
     0. Predefined lookup map  — instant, correct for common form-field words
     1. translateSentence       — Google Translate full phrase
     2. transliteratePhrase     — word-by-word + phonetic fallback
*/
async function resolveLabel(source, language) {
  if (language === "en" || !source) return source;


  // 0. Predefined lookup — avoids wrong phonetic for common words
  const fromMap = lookupLabel(source, language);
  if (fromMap) return fromMap;


  // 1. Google Translate
  const translated = await translateSentence(source).catch(() => source);
  if (DEVANAGARI_RE.test(translated)) return translated;


  // 2. Word-by-word + phonetic fallback
  const phonetic = await transliteratePhrase(source).catch(() => "");
  return DEVANAGARI_RE.test(phonetic) ? phonetic : source;
}


const router = express.Router();
router.use(verifyToken);


/* Bug 16 — precompute the institution's ACTIVE academic year once per request
   (only when no explicit year is supplied) so the contributor import/export guard
   inherits it instead of jumping to the calendar year. Never blocks on error. */
router.use(async (req, _res, next) => {
  try {
    // Positive-year check guards against body.year === null (→ Number 0).
    const vy = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
    const explicit = vy(req.query.year) || vy(req.get("X-Academic-Year")) || vy(req.body?.year);
    if (!explicit) {
      const { institutionId } = await resolveEffectiveDepartment(req.app.locals.pool, req);
      // M-2 — active → latest real academic year (no calendar drift when year-aware).
      req.institutionAcademicYear = await resolveOperatingYear(req.app.locals.pool, institutionId);
    }
  } catch { /* leave undefined → calendar-year fallback */ }
  next();
});


/* Domain isolation guard for every :formName route (import / export). Mirrors
   formData.js: a non-super-admin can only import/export a form in their own
   domain. Academic default → unchanged. */
router.param("formName", async (req, res, next, formName) => {
  const pool = req.app.locals.pool;
  try {
    const acc = await assertFormDomainAccess(pool, req, formName);
    if (!acc.allowed) return res.status(acc.status || 403).json({ success: false, message: acc.message });


    // Contributor: only their assigned forms FOR THE SELECTED ACADEMIC YEAR (Bug 7).
    // Import/export authorization must be year-scoped exactly like record entry —
    // an assignment is User + Form + Academic Year, not User + Form. Resolve the
    // year identically to formData.js's param guard (query → X-Academic-Year header
    // → body → current year) so a contributor assigned only for 2025 cannot
    // export/import while the top bar is on 2027.
    if (isContributorOnly(req)) {
      // Bug 16 — fall back to the institution's ACTIVE year (not the calendar year).
      const year = Number(req.query.year) || Number(req.get("X-Academic-Year")) || Number(req.body?.year)
        || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : new Date().getFullYear());
      const ok = await isFormAssigned(pool, req.user.userId, formName, year);
      if (!ok) return res.status(403).json({ success: false, message: "This form is not assigned to you for the selected academic year." });
    }
    return next();
  } catch (err) {
    // FAIL-CLOSED: an authorization lookup failure must DENY export/import, never
    // allow. A swallowed error here would let a cross-domain / unassigned user
    // export or import a form's records.
    logger.error("import/export domain/assignment guard failed — denying (fail-closed)", {
      formName, userId: req.user?.userId, route: req.originalUrl, stack: err.stack,
    });
    return res.status(503).json({ success: false, message: "Authorization is temporarily unavailable. Please try again." });
  }
});


/* ── Multer: memory storage, 50 MB limit (raised for 10k rows) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV and Excel files (.csv, .xlsx, .xls) are allowed"), ok);
  },
});


function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large. Maximum size is 50 MB." : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}


/* ── helpers ── */
function validateFormName(name) { return /^[a-z][a-z0-9_]*$/.test(name); }
function dbCol(col) { return col.trim().toLowerCase().replace(/\s+/g, "_"); }
function normalize(s) { return String(s).toLowerCase().replace(/[\s_\-\.]+/g, ""); }


/* ── Date export formatting ────────────────────────────────────────────────
   With the pg DATE type-parser fix in server.js, date values arrive as plain
   "YYYY-MM-DD" strings. This helper is a defensive fallback that also handles
   the legacy case where pg still returns a JS Date object, using LOCAL-time
   getters so the calendar date is never shifted by the server's UTC offset. */
function formatExportDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val);
  return s.length > 10 ? s.slice(0, 10) : s; // strip time component if present
}


/* ── Date parsing ──────────────────────────────────────────────────────────
   Supports, in priority order:
     1. JS Date object  — from XLSX cellDates mode
     2. Excel serial    — integer number of days since 1899-12-30
     3. ISO             — YYYY-MM-DD  /  YYYY/MM/DD  /  YYYY.MM.DD
     4. DD-first        — DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY  (Indian default)
                          D/M/YY two-digit year also accepted
     5. MM-first        — MM/DD/YYYY  MM-DD-YYYY  (US format, fallback when
                          DD-first produces an invalid month)
   Returns "YYYY-MM-DD" string, or null when the value cannot be parsed.
   Caller should treat null as a validation error for required fields. */


function _utcDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}


function parseImportDate(val) {
  if (val == null || val === "") return null;


  /* 1. JS Date object (XLSX cellDates: true) */
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }


  const str = String(val).trim();
  if (!str) return null;


  /* 2. Excel serial number — positive integer in plausible date range */
  const num = Number(str);
  if (!isNaN(num) && Number.isFinite(num) && num > 0 && Math.floor(num) === num && num < 2_958_466) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86_400_000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }


  /* 3. ISO: YYYY[-/.]MM[-/.]DD */
  const isoM = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoM) return _utcDate(+isoM[1], +isoM[2], +isoM[3]);


  /* 4 & 5. D/M/Y patterns — handles 4-digit or 2-digit year */
  const dmyM = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyM) {
    const a = +dmyM[1], b = +dmyM[2];
    let y = +dmyM[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;   // 2-digit year pivot at 50


    /* Try DD/MM/YYYY first (Indian/European standard) */
    const dmy = _utcDate(y, b, a);
    if (dmy) return dmy;


    /* Fallback: MM/DD/YYYY (US format) when DD/MM produces an invalid month */
    const mdy = _utcDate(y, a, b);
    if (mdy) return mdy;


    return null;
  }


  /* 6. Native JS parse — last resort (handles ISO 8601 variants, RFC 2822, etc.) */
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}


/* ════════════════════════════════════════════════════════════════
   resolveUserContext
════════════════════════════════════════════════════════════════ */
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


  const isDeptAdmin = roles.includes("department_admin") || roles.includes("nodal_officer");


  // EFFECTIVE (nodal-aware) context — exports/imports must scope to the Nodal
  // Officer's NODAL department, matching records & assignments (Bug 4).
  const { institutionId, departmentId } = await resolveEffectiveDepartment(pool, req);


  return {
    institutionId: institutionId || null,
    departmentId:  isDeptAdmin ? (departmentId || null) : null,
    role: isDeptAdmin ? "department_admin" : "institute_admin",
  };
}


/* ── fetch active schema fields ── */
async function getSchemaFields(pool, formName, institutionId, year) {
  // Primary: institution-specific row.
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year) { q += ` AND year = $3`; params.push(year); }
  q += ` ORDER BY year DESC LIMIT 1`;
  const { rows } = await pool.query(q, params);


  let schemaRow = rows[0];
  if (!schemaRow) {
    // Fallback: shared forms use the creator's canonical schema row.
    const fbParams = [formName];
    let fq = `SELECT cfs.* FROM custom_field_schemas cfs
              JOIN table_list tl ON tl.form_name = cfs.form_name
              WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true`;
    if (year) { fq += ` AND cfs.year = $2`; fbParams.push(year); }
    fq += ` ORDER BY cfs.year DESC LIMIT 1`;
    const { rows: fb } = await pool.query(fq, fbParams);
    schemaRow = fb[0] || null;
  }
  if (!schemaRow) return null;


  const schema   = schemaRow;
  const excluded = new Set(schema.schema?.excluded_fixed_columns || []);
  const seen     = new Set();
  const fields   = (schema.schema?.fields || []).filter((f) => {
    const col = dbCol(f.column_name);
    if (excluded.has(col) || excluded.has(f.column_name)) return false;
    if (seen.has(col)) return false;
    seen.add(col);
    return true;
  });
  return { schemaRow: schema, fields };
}


/* ── auto-map file columns → schema columns ── */
function buildAutoMapping(fileColumns, schemaFields) {
  const mapping = {};
  for (const field of schemaFields) {
    const col     = dbCol(field.column_name);
    const label   = (field.label?.en || field.column_name).toLowerCase();
    const needles = new Set([col, normalize(col), normalize(label)]);
    const matched = fileColumns.find((fc) => needles.has(normalize(fc)));
    mapping[col] = matched || "";
  }
  return mapping;
}


/* ── shared row processor: validate + cast one row ── */
function processRow(row, fields, fieldToCol, rowNum) {
  const getValue = (schemaCol) => {
    const fileCol = fieldToCol[schemaCol];
    return fileCol !== undefined ? String(row[fileCol] ?? "").trim() : null;
  };


  const rowData = {};
  for (const field of fields) {
    const col   = dbCol(field.column_name);
    const val   = getValue(col);
    const label = field.label?.en || field.column_name;


    if (field.required && (val === null || val === "")) {
      return { error: { row: rowNum, field: col, error: `${label} is required` } };
    }
    if (val === null || val === "") {
      rowData[col] = null;
    } else if (field.type === "number") {
      const n = Number(val);
      if (isNaN(n)) return { error: { row: rowNum, field: col, error: `${label} must be a number` } };
      rowData[col] = n;
    } else if (field.type === "boolean") {
      rowData[col] = ["true", "yes", "1"].includes(val.toLowerCase());
    } else if (field.type === "date") {
      const parsed = parseImportDate(val);
      if (parsed === null && field.required) {
        return { error: { row: rowNum, field: col, error: `${label} has an unrecognised date format ("${val}"). Use DD/MM/YYYY, YYYY-MM-DD, or MM/DD/YYYY.` } };
      }
      rowData[col] = parsed;
    } else if (field.type === "document") {
      /* Document files cannot be included in a CSV/Excel import.
         Always store NULL — the user uploads the file manually after import. */
      rowData[col] = null;
    } else {
      rowData[col] = val;
    }
  }
  return { rowData };
}


/* ═══════════════════════════════════════════════════════════════
   GET /api/form-data/:formName/departments
═══════════════════════════════════════════════════════════════ */
router.get("/:formName/departments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });


    const { rows } = await pool.query(
      `SELECT department_id AS id, name FROM departments
       WHERE institution_id = $1 AND status = 'ACTIVE'
       ORDER BY name`,
      [ctx.institutionId]
    );
    return res.json({ success: true, departments: rows, role: ctx.role });
  } catch (err) {
    logger.error("GET departments for import", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch departments." });
  }
});


/* ═══════════════════════════════════════════════════════════════
   POST /api/form-data/:formName/import/parse
   Parses file, returns columns + schema + all rows for client-side chunking.
   Limit raised to 10,000 rows.
═══════════════════════════════════════════════════════════════ */
router.post("/:formName/import/parse", handleUpload, async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year } = req.body;


  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded." });


  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });


    // Bug 11 — an inactive department blocks import (a write). Contributors are
    // already gated by the assignment param guard; this covers dept admins.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });


    const result = await getSchemaFields(pool, formName, ctx.institutionId, year);
    if (!result)
      return res.status(404).json({ success: false, message: "No active schema found for this form." });


    const { fields } = result;


    const { rows: lockRows } = await pool.query(
      `SELECT is_locked FROM form_lock_config WHERE form_name = $1 AND institution_id = $2`,
      [formName, ctx.institutionId]
    );
    if (lockRows[0]?.is_locked)
      return res.status(403).json({ success: false, message: "This form is locked. Import is disabled." });


    // Archive write policy — an archived form is view-only (import blocked).
    const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, Number(year) || null);
    if (archiveBlock.blocked)
      return res.status(403).json({ success: false, message: archiveBlock.message });


    const ext       = req.file.originalname.toLowerCase().split(".").pop();
    const encoding  = req.body.encoding  || "UTF-8";
    const delimiter = req.body.delimiter || ",";


    let wb;
    if (ext === "csv") {
      const text = req.file.buffer.toString(encoding.toLowerCase().replace("-", ""));
      wb = XLSX.read(text, { type: "string", FS: delimiter });
    } else {
      wb = XLSX.read(req.file.buffer, { type: "buffer" });
    }


    const ws = wb.Sheets[wb.SheetNames[0]];


    /* ── Row limit check BEFORE sheet_to_json (HIGH-5) ──────────────────────
       XLSX.utils.sheet_to_json allocates the entire dataset as JS objects before
       we can check its length. A crafted 50 k-row file (~5 MB on disk) expands to
       ~400 MB in heap, potentially crashing the process.
       `ws['!ref']` gives the worksheet's dimension range (e.g. "A1:Z10501") without
       parsing cell values.  decode_range().e.r is the 0-based last-row index; since
       row 0 is the header, e.r equals the data-row count. */
    if (!ws || !ws["!ref"])
      return res.status(400).json({ success: false, message: "File is empty or has no data rows." });
    const sheetRange    = XLSX.utils.decode_range(ws["!ref"]);
    const estimatedRows = sheetRange.e.r; // header is row 0; data rows = e.r
    if (estimatedRows > 10500)
      return res.status(400).json({ success: false, message: "File has more than 10,500 rows. Please split into smaller batches." });


    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });


    if (!rows.length)
      return res.status(400).json({ success: false, message: "File is empty or has no data rows." });


    const fileColumns = Object.keys(rows[0]);


    return res.json({
      success:         true,
      importSessionId: randomUUID(), // CRIT-2: opaque token sent back with every chunk
      fileColumns,
      schemaFields: fields.map((f) => ({
        col:      dbCol(f.column_name),
        label:    f.label?.en || f.column_name,
        type:     f.type,
        required: !!f.required,
      })),
      totalRows:    rows.length,
      rows,                          // all rows returned for client-side chunking
      preview:      rows.slice(0, 5),
      autoMapping:  buildAutoMapping(fileColumns, fields),
      userRole:     ctx.role,
      departmentId: ctx.departmentId,
    });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/import/parse`, { ...getLogContext(req), stack: err.stack });
    return res.status(400).json({ success: false, message: `File parsing failed: ${err.message}` });
  }
});


/* ═══════════════════════════════════════════════════════════════
   POST /api/form-data/:formName/import/execute-chunk
   Processes one chunk of rows (500–1000 recommended).
   Called repeatedly by the frontend for chunked imports.


   Body:
   {
     mapping:          { schemaCol: fileCol, … },
     chunk:            [ rowObjects… ],           // one page of the full dataset
     chunkIndex:       0,                         // 0-based
     totalChunks:      N,
     duplicateHandling: "skip" | "overwrite" | "new",
     departmentId:     uuid | null,
     year:             number | null,
     language:         "en",
   }
═══════════════════════════════════════════════════════════════ */
router.post("/:formName/import/execute-chunk", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const {
    mapping,
    chunk,
    chunkIndex = 0,
    chunkStartIndex = 0,
    totalChunks = null,
    duplicateHandling = "skip",
    year,
    language = "en",
    departmentId,
    importSessionId = null, // CRIT-2: opaque UUID from parse response; null = old clients
  } = req.body;


  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!mapping || !Array.isArray(chunk) || !chunk.length)
    return res.status(400).json({ success: false, message: "mapping and chunk are required." });


  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });


    // Bug 11 — an inactive department blocks import (a write). Dept admins gated
    // here; contributors are already blocked by the assignment param guard.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId: ctx.departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });


    /* SECURITY: dept admin cannot override their own department */
    const resolvedDeptId = ctx.role === "department_admin"
      ? ctx.departmentId
      : (departmentId || null);


    /* Bug 13 — re-check the manual form lock on EVERY chunk so locking the form
       mid-import stops remaining chunks immediately.
       CRIT-2 fix: when the lock fires on chunk > 0, committed rows from earlier
       chunks are deleted (using import_session_id stored on every inserted row)
       so the import never leaves a partial dataset behind. Clients that don't send
       importSessionId (old frontend) keep the original 403 / preserve behaviour. */
    {
      const { rows: lockRows } = await pool.query(
        `SELECT is_locked FROM form_lock_config WHERE form_name = $1 AND institution_id = $2`,
        [formName, ctx.institutionId]
      );
      if (lockRows[0]?.is_locked) {
        if (importSessionId && Number(chunkIndex) > 0) {
          // Roll back all rows committed by earlier chunks in this import session.
          // Runs against both English and Hindi rows (Hindi mirrors carry the same
          // import_session_id). Fire-and-forget: a cleanup failure is logged but
          // does not change the 409 response the client receives.
          pool.query(
            `DELETE FROM ${formName}_records
               WHERE import_session_id = $1 AND institution_id = $2`,
            [importSessionId, ctx.institutionId]
          ).catch((e) =>
            logger.error("import session rollback failed", {
              importSessionId, formName, error: e.message,
            })
          );
          return res.status(409).json({
            success:     false,
            rolledBack:  true,
            message:     "The form was locked during import. All rows committed in earlier chunks have been rolled back.",
          });
        }
        return res.status(403).json({ success: false, message: "This form is locked. Import is disabled." });
      }
    }


    /* ── M-2 fix — ONE resolved academic year drives BOTH the schema lookup and the
       year every imported row is stored under, so an import batch can never tag rows
       to one year while referencing another year's schema. Resolve the effective
       year ONCE (explicit body → SELECTED header → institution ACTIVE; no calendar
       shortcut), look up the schema FOR THAT YEAR, and only fall back to the latest
       active schema when that year has none. Every row in the batch then gets
       formYear = schemaRow.year (one year, one schema, no mixed batch). ── */
    const importHeaderYear = Number(req.headers["x-academic-year"]);
    const effectiveYear = Number(year)
      || (Number.isInteger(importHeaderYear) && importHeaderYear > 0 ? importHeaderYear : null)
      || (Number.isInteger(req.institutionAcademicYear) ? req.institutionAcademicYear : null);


    let result = await getSchemaFields(pool, formName, ctx.institutionId, effectiveYear);
    if (!result && effectiveYear != null)
      result = await getSchemaFields(pool, formName, ctx.institutionId, null); // latest active fallback
    if (!result)
      return res.status(404).json({ success: false, message: "No active schema found." });


    /* Bug 17 — imported rows must reference the CONSUMER institution's own schema
       copy (for the SAME year), never the creator's. */
    if (result.schemaRow && String(result.schemaRow.institution_id) !== String(ctx.institutionId)) {
      try {
        await ensureSchemaExists(pool, formName);
        const own = await getSchemaFields(pool, formName, ctx.institutionId, result.schemaRow.year);
        if (own && own.schemaRow && String(own.schemaRow.institution_id) === String(ctx.institutionId)) result = own;
      } catch (e) {
        logger.error(`Bug 17 consumer-schema resolution failed for ${formName}`, { stack: e.stack });
      }
    }


    const { schemaRow, fields } = result;
    // SINGLE SOURCE OF TRUTH: imported rows' year == the year of the schema used.
    const formYear = schemaRow.year;
    if (effectiveYear != null && Number(effectiveYear) !== Number(formYear)) {
      logger.warn("import rows year fell back to schema year (selected year has no schema)", {
        formName, institutionId: ctx.institutionId,
        resolved_year: effectiveYear, schema_year: formYear,
      });
    }


    /* N-2 — honor the PER-YEAR deadline lock (form_year_deadlines) exactly like the
       record-save path's getLockBlock, so import and manual entry resolve the SAME
       lock state. The form-wide lock is already checked above; this closes the gap
       where a year whose deadline has auto-locked it still accepted imported rows. */
    {
      const { rows: yd } = await pool.query(
        `SELECT is_locked, auto_locked, deadline_at FROM form_year_deadlines
          WHERE form_name = $1 AND institution_id = $2 AND academic_year = $3`,
        [formName, ctx.institutionId, Number(formYear)]
      );
      if (yd[0]?.is_locked) {
        const expired = yd[0].auto_locked
          || (yd[0].deadline_at && new Date(yd[0].deadline_at).getTime() <= Date.now());
        return res.status(403).json({
          success: false,
          message: expired
            ? "This form deadline has expired for your institution. Import is disabled."
            : "This form is currently locked by the institution admin. Import is disabled.",
        });
      }
    }


    /* Academic-year lock — checks the SELECTED year (header), blocks import.
       Bug 13 — re-evaluated on EVERY chunk (was chunk 0 only) so a year lock /
       archive / deadline that lands mid-import stops the remaining chunks at once. */
    {
      const ayLock = await getAcademicYearLockBlockForReq(pool, req, ctx.institutionId, formYear);
      if (ayLock.locked)
        return res.status(403).json({ success: false, message: ayLock.message });


      // Archive write policy — an archived form is view-only (import blocked).
      const archiveBlock = await getFormArchiveBlockForReq(pool, req, ctx.institutionId, formName, formYear);
      if (archiveBlock.blocked)
        return res.status(403).json({ success: false, message: archiveBlock.message });


      /* Issue 5 — per-year deadline lock: if the SELECTED year's deadline has
         passed (or its row is locked), import into that year is disabled. Forms
         without a per-year deadline row are unaffected. */
      const headerYear = Number(req.headers["x-academic-year"]);
      const dlYear = Number.isInteger(headerYear) ? headerYear : formYear;
      if (dlYear != null) {
        const { rows: yd } = await pool.query(
          `SELECT is_locked, auto_locked, deadline_at FROM form_year_deadlines
           WHERE form_name = $1 AND institution_id = $2 AND academic_year = $3`,
          [formName, ctx.institutionId, Number(dlYear)]
        );
        if (yd.length) {
          const r = yd[0];
          const blocked = r.is_locked || r.auto_locked ||
            (r.deadline_at && new Date(r.deadline_at).getTime() <= Date.now());
          if (blocked)
            return res.status(403).json({ success: false, message: "This form deadline has expired for your institution. Import is disabled." });
        }
      }
    }


    /* Build fileCol → schemaCol lookup */
    const fieldToCol = {};
    for (const [schemaCol, fileCol] of Object.entries(mapping)) {
      if (fileCol) fieldToCol[schemaCol] = fileCol;
    }


    /* Validate + cast all rows in this chunk */
    const errors   = [];
    const prepared = [];


    for (let i = 0; i < chunk.length; i++) {
      const globalRowNum = chunkStartIndex + i + 1;
      const { rowData, error } = processRow(chunk[i], fields, fieldToCol, globalRowNum);
      if (error) errors.push(error);
      else prepared.push(rowData);
    }


    /* Persist valid rows inside a single transaction */
    const client = await pool.connect();
    let success  = 0;
    let skipped  = 0;
    const recordsTable = `${formName}_records`;
    const fieldCols    = fields.map((f) => dbCol(f.column_name));


    /* Track inserted English rows so Hindi mirrors can be created afterward */
    const insertedRows = [];


    try {
      await client.query("BEGIN");


      /* Ensure source_row_id and import_session_id columns exist. */
      await client.query(
        `ALTER TABLE ${recordsTable} ADD COLUMN IF NOT EXISTS source_row_id UUID`
      );
      if (importSessionId) {
        await client.query(
          `ALTER TABLE ${recordsTable} ADD COLUMN IF NOT EXISTS import_session_id UUID`
        );
      }


      /* Bug 14 — batched duplicate detection. The previous code ran ONE SELECT per
         row (10k rows → 10k sequential scans, the dominant import cost). Instead we
         pre-resolve every existing match for this chunk in a SINGLE query, then
         decide skip/overwrite/insert in memory.


         Correctness: the match runs in SQL via an ordinal-tagged VALUES join with
         each key column CAST to its real column type, so it is byte-identical to the
         old per-row `col = $n` coercion (no JS-side comparison of DB values, which
         would risk numeric/date/boolean type drift). Intra-chunk duplicates — a key
         first seen within this same chunk — are tracked in `seenInChunk` using the
         freshly cast row values (both sides come from processRow, so same JS types),
         exactly reproducing the old "an earlier row in this transaction is found by a
         later row" behavior. Skip/overwrite/insert outcomes are unchanged. */
      const PG_TYPE = { text: "TEXT", textarea: "TEXT", description: "TEXT", email: "TEXT", phone: "TEXT", document: "TEXT", number: "NUMERIC", date: "DATE", boolean: "BOOLEAN" };
      const requiredFields = fields.filter((f) => f.required);
      const requiredCols   = requiredFields.map((f) => dbCol(f.column_name));
      const requiredTypes  = requiredFields.map((f) => PG_TYPE[f.type] || "TEXT");
      const dedupActive    = duplicateHandling !== "new" && requiredCols.length > 0;
      const keyOf = (rd) => JSON.stringify(requiredCols.map((c) => rd[c] ?? null));


      const preloadMap = new Map();   // prepared-row ordinal → existing row id
      if (dedupActive && prepared.length > 0) {
        const params = [ctx.institutionId, resolvedDeptId];
        let p = 3;
        const valuesRows = prepared.map((rowData, ord) => {
          const ks = requiredCols.map((col, j) => { params.push(rowData[col] ?? null); return `$${p++}::${requiredTypes[j]}`; });
          return `(${ord}, ${ks.join(", ")})`;
        });
        const vCols     = requiredCols.map((_, j) => `k${j}`).join(", ");
        const joinOn    = requiredCols.map((col, j) => `r.${col} = v.k${j}`).join(" AND ");
        const deptMatch = resolvedDeptId ? `r.department_id = $2` : `(r.department_id IS NULL OR r.department_id = $2)`;
        const { rows: matches } = await client.query(
          `SELECT DISTINCT ON (v.ord) v.ord, r.id
             FROM (VALUES ${valuesRows.join(", ")}) AS v(ord, ${vCols})
             JOIN ${recordsTable} r
               ON r.institution_id = $1 AND ${deptMatch} AND ${joinOn}
            ORDER BY v.ord, r.id`,
          params
        );
        for (const m of matches) if (!preloadMap.has(m.ord)) preloadMap.set(m.ord, m.id);
      }


      const seenInChunk = new Map();  // intra-chunk key → inserted id
      const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language"];
      const stdVals = [formName, ctx.institutionId, resolvedDeptId, formYear, schemaRow.id, language];
      // CRIT-2: tag every row with the session ID so a mid-import lock can DELETE them.
      if (importSessionId) { stdCols.push("import_session_id"); stdVals.push(importSessionId); }
      const allCols = [...stdCols, ...fieldCols];


      for (let ord = 0; ord < prepared.length; ord++) {
        const rowData = prepared[ord];


        if (dedupActive) {
          let existingId = preloadMap.get(ord);
          if (existingId === undefined) existingId = seenInChunk.get(keyOf(rowData));
          if (existingId !== undefined) {
            if (duplicateHandling === "skip") { skipped++; continue; }
            if (duplicateHandling === "overwrite") {
              let idx = 1;
              const setClauses = [...fieldCols.map((col) => `${col} = $${idx++}`), `updated_at = now()`];
              const updateVals = [...fieldCols.map((col) => rowData[col] ?? null), ctx.institutionId, existingId];
              await client.query(
                `UPDATE ${recordsTable} SET ${setClauses.join(", ")} WHERE institution_id = $${idx++} AND id = $${idx}`,
                updateVals
              );
              success++; continue;
            }
          }
        }


        /* INSERT — capture the new row's id for Hindi linking */
        const allVals = [...stdVals, ...fieldCols.map((col) => rowData[col] ?? null)];
        const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");
        const { rows: [inserted] } = await client.query(
          `INSERT INTO ${recordsTable} (${allCols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
          allVals
        );
        insertedRows.push({ id: inserted.id, rowData });
        if (dedupActive) seenInChunk.set(keyOf(rowData), inserted.id);
        success++;
      }


      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }


    /* ── Hindi mirror rows ────────────────────────────────────────────────
       For each newly imported English row, translate text fields and insert
       a linked Hindi row. Runs BEFORE the response so import success
       guarantees that Hindi rows exist. All rows are processed concurrently
       (translation caches deduplicate repeat values across the chunk).
       Individual row failures are retried up to 3 times; persistent failures
       are counted and surfaced as `hindiWarnings` in the response rather than
       silently swallowed. */
    let hindiWarnings = 0;
    if (language === "en" && insertedRows.length > 0) {
      const hindiEnabled = await pool
        .query(`SELECT COALESCE(translate_to_hindi, true) AS enabled FROM table_list WHERE form_name = $1`, [formName])
        .then(r => r.rows[0]?.enabled !== false)
        .catch(() => true);


      if (hindiEnabled) {
        const fieldModes = {};
        for (const f of fields) fieldModes[dbCol(f.column_name)] = resolveTranslationMode(f);


        await Promise.all(insertedRows.map(async ({ id: srcId, rowData }) => {
          let lastErr;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const hiData = await translateRow(rowData, fieldModes);
              const hiCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "source_row_id", ...fieldCols];
              const hiVals = [formName, ctx.institutionId, resolvedDeptId, formYear, schemaRow.id, "hi", srcId, ...fieldCols.map(c => hiData[c] ?? null)];
              // Carry the session ID so a rollback DELETE also removes Hindi mirrors.
              if (importSessionId) { hiCols.push("import_session_id"); hiVals.push(importSessionId); }
              const hiPh = hiVals.map((_, i) => `$${i + 1}`).join(", ");
              await pool.query(`INSERT INTO ${recordsTable} (${hiCols.join(", ")}) VALUES (${hiPh})`, hiVals);
              return;
            } catch (e) {
              lastErr = e;
              if (attempt < 3) await new Promise(r => setTimeout(r, 200 * attempt));
            }
          }
          logger.error(`Hindi import mirror exhausted (3 attempts) for ${formName}/${srcId}`, { message: lastErr.message });
          hindiWarnings++;
        }));
      }
    }


    // Log once: on the last chunk, or every call when totalChunks is not provided.
    const isLastChunk = totalChunks === null || chunkIndex + 1 >= Number(totalChunks);
    if (isLastChunk && (success > 0 || skipped > 0)) {
      await writeAuditLog(req, {
        actionType: "FORM_DATA_IMPORTED",
        entityType: "form_data",
        entityId: null,
        newValue: {
          form_name: formName,
          institution_id: ctx.institutionId,
          department_id: resolvedDeptId,
          imported: success,
          skipped,
          failed: errors.length,
        },
        message: `Form Data Imported - "${formName}" (${success} row${success !== 1 ? "s" : ""})`,
      });
    }


    return res.json({
      success:  true,
      imported: success,
      skipped,
      failed:   errors.length,
      errors,
      chunkIndex,
      ...(hindiWarnings > 0 ? { hindiWarnings } : {}),
    });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/import/execute-chunk`, { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: `Chunk import failed: ${err.message}` });
  }
});


/* ═══════════════════════════════════════════════════════════════
   POST /api/form-data/:formName/import/execute   (kept for backward compat)
   Delegates to single-chunk logic for small files (≤1 000 rows).
═══════════════════════════════════════════════════════════════ */
router.post("/:formName/import/execute", async (req, res) => {
  const { mapping, data, duplicateHandling = "skip", year, language = "en", departmentId } = req.body;
  // Reuse chunk endpoint logic by reshaping the request
  req.body = {
    mapping,
    chunk:             data,
    chunkIndex:        0,
    totalChunks:       1,
    duplicateHandling,
    year,
    language,
    departmentId,
  };
  // Forward to execute-chunk handler via internal re-dispatch
  return router.handle(
    Object.assign(req, { url: `/${req.params.formName}/import/execute-chunk`, method: "POST" }),
    res,
    () => res.status(404).json({ success: false, message: "Not found." })
  );
});


/* ═══════════════════════════════════════════════════════════════
   GET /api/form-data/:formName/export
═══════════════════════════════════════════════════════════════ */
router.get("/:formName/export", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { format = "csv", year, language = "en" } = req.query;


  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });


  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });


    const result = await getSchemaFields(pool, formName, ctx.institutionId, year);
    if (!result)
      return res.status(404).json({ success: false, message: "No active schema found." });


    const { fields } = result;
    const fieldCols    = fields.map((f) => dbCol(f.column_name));
    const recordsTable = `${formName}_records`;


    /* Build WHERE clause — scoped by role + language */
    let whereClause = "WHERE institution_id = $1";
    let queryParams = [ctx.institutionId];


    if (ctx.departmentId) {
      whereClause += " AND department_id = $2";
      queryParams.push(ctx.departmentId);
    }


    /* Language filter: English rows have language='en' or NULL; other languages are exact */
    if (language === "en") {
      whereClause += ` AND (language = 'en' OR language IS NULL)`;
    } else {
      whereClause += ` AND language = $${queryParams.length + 1}`;
      queryParams.push(language);
    }


    /* Issue 7 — STREAMING export. Records are read in fixed-size batches and
       written straight to the response (CSV via res.write; XLSX via the ExcelJS
       streaming WorkbookWriter) so peak memory stays bounded regardless of row
       count (100k+ no longer materialises the whole result set + a full workbook /
       CSV string in memory). Output columns/labels/formatting are unchanged. */
    const EXPORT_BATCH = 2000;


    // Total count (for the audit log) — does not load any row data.
    const { rows: cntRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${recordsTable} ${whereClause}`,
      queryParams
    );
    const recordCount = cntRows[0]?.n ?? 0;


    await writeAuditLog(req, {
      actionType: "FORM_DATA_EXPORTED",
      entityType: "form_data",
      entityId: null,
      newValue: {
        form_name: formName,
        institution_id: ctx.institutionId,
        department_id: ctx.departmentId,
        format,
        record_count: recordCount,
      },
      message: `Form Data Exported - "${formName}" (${recordCount} record${recordCount !== 1 ? "s" : ""})`,
    });


    /* Dept names (EN + HI) for the institute-admin export — fetched once for the
       whole institution (bounded, small) so each batch can resolve names without
       re-querying. */
    let deptMap = {};
    if (!ctx.departmentId) {
      const { rows: depts } = await pool.query(
        `SELECT department_id, name, name_hi FROM departments WHERE institution_id = $1`,
        [ctx.institutionId]
      );
      depts.forEach(d => { deptMap[d.department_id] = { name: d.name, name_hi: d.name_hi }; });
    }


    /* "Department" column header and fallback in the export language */
    const deptColHeader   = language === "hi" ? "विभाग"        : "Department";
    const institutionWide = language === "hi" ? "संस्था-व्यापी" : "Institution-wide";


    /* ── Resolve column headers ───────────────────────────────────────────
       For non-English exports:
         1. Use stored label[lang] ONLY if it actually contains target-script
            characters (guards against English text accidentally saved as the
            Hindi label in the form builder).
         2. Otherwise fall through to resolveLabel (Google Translate → phonetic
            fallback), which covers all existing forms that were created before
            Hindi label storage was added.
    ─────────────────────────────────────────────────────────────────────── */
    const isTargetScript = (text) => language === "en" || DEVANAGARI_RE.test(text);


    const fieldLabelMap  = {};
    const createdAtLabel = language !== "en"
      ? await resolveLabel("Created At", language)
      : "Created At";


    if (language !== "en") {
      await Promise.all(fields.map(async (f) => {
        const col    = dbCol(f.column_name);
        const stored = f.label?.[language];
        if (stored && isTargetScript(stored)) {
          fieldLabelMap[col] = stored;
        } else {
          const source = f.label?.en || f.column_name;
          fieldLabelMap[col] = await resolveLabel(source, language);
        }
      }));
    } else {
      fields.forEach((f) => {
        const col = dbCol(f.column_name);
        fieldLabelMap[col] = f.label?.en || f.column_name;
      });
    }


    /* Document fields → presigned URLs. getReadUrl is local HMAC (no S3 network
       call); resolved lazily per key with a cache so each unique file is signed
       once across all batches. Legacy local URLs (http://…) pass through as-is. */
    const docCols = new Set(
      fields.filter((f) => f.type === "document").map((f) => dbCol(f.column_name))
    );
    const keyToUrl = {};
    async function signDoc(val) {
      if (!val) return "";
      if (val.startsWith("http://") || val.startsWith("https://")) return val;
      if (keyToUrl[val] === undefined) {
        try { keyToUrl[val] = await getReadUrl(val, DOC_URL_TTL); }
        catch { keyToUrl[val] = val; } // fallback: keep raw key on error
      }
      return keyToUrl[val];
    }


    /* ── Ordered header list ──────────────────────────────────────────── */
    const headers = [];
    if (!ctx.departmentId) headers.push(deptColHeader);
    fields.forEach((f) => headers.push(fieldLabelMap[dbCol(f.column_name)]));
    headers.push(createdAtLabel);


    /* Track which column indices (0-based) hold document URLs for XLSX hyperlinks */
    const hasDeptCol    = !ctx.departmentId;
    const docColIndices = new Set(
      fields.reduce((acc, f, i) => {
        if (f.type === "document") acc.push((hasDeptCol ? 1 : 0) + i);
        return acc;
      }, [])
    );


    /* Build one export row array from a DB record (signs document URLs). */
    async function buildRow(rec) {
      const row = [];
      if (!ctx.departmentId) {
        const deptInfo = rec.department_id ? deptMap[rec.department_id] : null;
        row.push(deptInfo
          ? (language === "hi" ? (deptInfo.name_hi || deptInfo.name) : deptInfo.name)
          : institutionWide);
      }
      for (const f of fields) {
        const val = rec[dbCol(f.column_name)] ?? "";
        if (f.type === "date")          row.push(formatExportDate(val));
        else if (f.type === "document") row.push(await signDoc(val));
        else                            row.push(val);
      }
      row.push(rec.created_at ? formatExportDate(new Date(rec.created_at)) : "");
      return row;
    }


    /* Read the next batch. A stable `id` tiebreaker is appended to the original
       ordering so OFFSET paging can't skip/duplicate rows sharing a
       (department_id, created_at). */
    function fetchBatch(offset) {
      return pool.query(
        `SELECT ${fieldCols.join(", ")}, department_id, created_at, id
         FROM ${recordsTable}
         ${whereClause}
         ORDER BY department_id NULLS LAST, created_at DESC, id DESC
         LIMIT ${EXPORT_BATCH} OFFSET ${offset}`,
        queryParams
      ).then((r) => r.rows);
    }


    const ts       = new Date().toISOString().slice(0, 10);
    const langTag  = language !== "en" ? `_${language}` : "";
    const baseName = `${formName}${langTag}_${ts}`;


    /* ── XLSX export — ExcelJS streaming WorkbookWriter ───────────────── */
    if (format === "xlsx") {
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");


      const workbook  = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: true });
      const worksheet = workbook.addWorksheet(formName, { views: [{ state: "frozen", ySplit: 1 }] });
      worksheet.columns = headers.map((h) => ({ width: Math.max(String(h).length + 4, 12) }));


      /* Header row — bold white text on blue background */
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
        cell.border    = { bottom: { style: "thin", color: { argb: "FF1E40AF" } } };
      });
      headerRow.height = 20;
      headerRow.commit();


      let rowIdx = 0;
      for (let offset = 0; ; offset += EXPORT_BATCH) {
        const batch = await fetchBatch(offset);
        if (!batch.length) break;
        for (const rec of batch) {
          const dataRow = worksheet.addRow(await buildRow(rec));
          if (rowIdx % 2 === 1) {
            dataRow.eachCell({ includeEmpty: true }, (cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
            });
          }
          docColIndices.forEach((colIdx) => {
            const cell = dataRow.getCell(colIdx + 1); // ExcelJS is 1-based
            const url  = cell.value;
            if (url && typeof url === "string" && url.startsWith("https://")) {
              cell.value = { text: "View Document ↗", hyperlink: url, tooltip: url };
              cell.font  = { color: { argb: "FF2563EB" }, underline: true, size: 10 };
            }
          });
          dataRow.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { vertical: "middle" }; });
          dataRow.commit();
          rowIdx++;
        }
        if (batch.length < EXPORT_BATCH) break;
      }


      await worksheet.commit();
      await workbook.commit(); // finalises + ends the response stream
      return;
    }


    /* ── CSV export — streamed line-by-line ───────────────────────────── */
    const escape = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.write("�" + headers.map(escape).join(",") + "\r\n"); // BOM for Excel UTF-8 detection
    for (let offset = 0; ; offset += EXPORT_BATCH) {
      const batch = await fetchBatch(offset);
      if (!batch.length) break;
      let chunk = "";
      for (const rec of batch) chunk += (await buildRow(rec)).map(escape).join(",") + "\r\n";
      res.write(chunk);
      if (batch.length < EXPORT_BATCH) break;
    }
    return res.end();
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/export`, { ...getLogContext(req), stack: err.stack });
    // If we've already started streaming, headers are sent — just end the stream.
    if (!res.headersSent) return res.status(500).json({ success: false, message: "Export failed." });
    try { res.end(); } catch (_) { /* already closed */ }
  }
});


/* ═══════════════════════════════════════════════════════════════
   GET /api/form-data/:formName/export/sample
═══════════════════════════════════════════════════════════════ */
router.get("/:formName/export/sample", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { format = "csv", year } = req.query;


  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });


  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });


    const result = await getSchemaFields(pool, formName, ctx.institutionId, year);
    if (!result)
      return res.status(404).json({ success: false, message: "No active schema found." });


    const { fields } = result;


    const samplePlaceholder = (field) => {
      if (field.type === "number")   return "0";
      if (field.type === "boolean")  return "Yes";
      if (field.type === "date")     return "2025-01-01";
      if (field.type === "email")    return "example@email.com";
      if (field.type === "phone")    return "9876543210";
      if (field.type === "document") return "(upload via UI – leave blank)";
      return "Sample Value";
    };


    const sampleRows = [1, 2].map(() => {
      const row = {};
      fields.forEach((f) => { row[f.label?.en || f.column_name] = samplePlaceholder(f); });
      return row;
    });


    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample");


    if (format === "xlsx") {
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="${formName}_sample.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }


    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", `attachment; filename="${formName}_sample.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/export/sample`, { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Sample export failed." });
  }
});


module.exports = router;

