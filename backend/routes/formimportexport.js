"use strict";

const express  = require("express");
const multer   = require("multer");
const XLSX     = require("xlsx");     // used for import parsing only
const ExcelJS  = require("exceljs"); // used for styled Excel export
const { verifyToken } = require("../middleware/auth");
const logger  = require("../utils/logger");
const { getLogContext } = logger;
const { translateSentence, transliteratePhrase, lookupLabel, translateRow, resolveTranslationMode } = require("../services/translationService");
const { getReadUrl } = require("../utils/s3");

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

    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!rows.length)
      return res.status(400).json({ success: false, message: "File is empty or has no data rows." });

    /* ── LIMIT: 10,500 rows ── */
    if (rows.length > 10500)
      return res.status(400).json({ success: false, message: "File has more than 10,500 rows. Please split into smaller batches." });

    const fileColumns = Object.keys(rows[0]);

    return res.json({
      success:      true,
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
    duplicateHandling = "skip",
    year,
    language = "en",
    departmentId,
  } = req.body;

  if (!validateFormName(formName))
    return res.status(400).json({ success: false, message: "Invalid form name." });
  if (!mapping || !Array.isArray(chunk) || !chunk.length)
    return res.status(400).json({ success: false, message: "mapping and chunk are required." });

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    /* SECURITY: dept admin cannot override their own department */
    const resolvedDeptId = ctx.role === "department_admin"
      ? ctx.departmentId
      : (departmentId || null);

    /* Lock check — only on the first chunk to avoid repeated DB hits */
    if (chunkIndex === 0) {
      const { rows: lockRows } = await pool.query(
        `SELECT is_locked FROM form_lock_config WHERE form_name = $1 AND institution_id = $2`,
        [formName, ctx.institutionId]
      );
      if (lockRows[0]?.is_locked)
        return res.status(403).json({ success: false, message: "This form is locked. Import is disabled." });
    }

    const result = await getSchemaFields(pool, formName, ctx.institutionId, year);
    if (!result)
      return res.status(404).json({ success: false, message: "No active schema found." });

    const { schemaRow, fields } = result;
    const formYear = Number(year) || schemaRow.year;

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

      /* Ensure source_row_id column exists (needed for Hindi linking) */
      await client.query(
        `ALTER TABLE ${recordsTable} ADD COLUMN IF NOT EXISTS source_row_id UUID`
      );

      for (const rowData of prepared) {
        if (duplicateHandling !== "new") {
          const requiredCols = fields.filter((f) => f.required).map((f) => dbCol(f.column_name));
          if (requiredCols.length > 0) {
            const whereClause = requiredCols.map((col, idx) => `${col} = $${idx + 3}`).join(" AND ");
            const deptClause  = resolvedDeptId
              ? `AND department_id = $2`
              : `AND (department_id IS NULL OR department_id = $2)`;
            const checkVals = [ctx.institutionId, resolvedDeptId, ...requiredCols.map((col) => rowData[col])];
            const { rows: existing } = await client.query(
              `SELECT id FROM ${recordsTable} WHERE institution_id = $1 ${deptClause} AND ${whereClause} LIMIT 1`,
              checkVals
            );

            if (existing.length > 0) {
              if (duplicateHandling === "skip") { skipped++; continue; }
              if (duplicateHandling === "overwrite") {
                let idx = 1;
                const setClauses = [...fieldCols.map((col) => `${col} = $${idx++}`), `updated_at = now()`];
                const updateVals = [...fieldCols.map((col) => rowData[col] ?? null), ctx.institutionId, existing[0].id];
                await client.query(
                  `UPDATE ${recordsTable} SET ${setClauses.join(", ")} WHERE institution_id = $${idx++} AND id = $${idx}`,
                  updateVals
                );
                success++; continue;
              }
            }
          }
        }

        /* INSERT — capture the new row's id for Hindi linking */
        const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language"];
        const stdVals = [formName, ctx.institutionId, resolvedDeptId, formYear, schemaRow.id, language];
        const allCols = [...stdCols, ...fieldCols];
        const allVals = [...stdVals, ...fieldCols.map((col) => rowData[col] ?? null)];
        const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

        const { rows: [inserted] } = await client.query(
          `INSERT INTO ${recordsTable} (${allCols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
          allVals
        );
        insertedRows.push({ id: inserted.id, rowData });
        success++;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    /* ── Async Hindi mirror rows ──────────────────────────────────────────
       Mirrors the formData.js POST behaviour: for each newly imported English
       row, translate the text fields and insert a linked Hindi row.
       Runs after the response is sent so import speed is unaffected. */
    if (language === "en" && insertedRows.length > 0) {
      const hindiEnabled = await pool
        .query(`SELECT COALESCE(translate_to_hindi, true) AS enabled FROM table_list WHERE form_name = $1`, [formName])
        .then(r => r.rows[0]?.enabled !== false)
        .catch(() => true);

      if (hindiEnabled) {
        const fieldModes = {};
        for (const f of fields) fieldModes[dbCol(f.column_name)] = resolveTranslationMode(f);

        setImmediate(async () => {
          for (const { id: srcId, rowData } of insertedRows) {
            let lastErr;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const hiData  = await translateRow(rowData, fieldModes);
                const hiCols  = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "source_row_id", ...fieldCols];
                const hiVals  = [formName, ctx.institutionId, resolvedDeptId, formYear, schemaRow.id, "hi", srcId, ...fieldCols.map(c => hiData[c] ?? null)];
                const hiPh    = hiVals.map((_, i) => `$${i + 1}`).join(", ");
                await pool.query(`INSERT INTO ${recordsTable} (${hiCols.join(", ")}) VALUES (${hiPh})`, hiVals);
                lastErr = null;
                break;
              } catch (e) {
                lastErr = e;
                if (attempt < 3) await new Promise(r => setTimeout(r, 200 * attempt));
              }
            }
            if (lastErr) {
              logger.error(`Hindi import mirror exhausted (3 attempts) for ${formName}/${srcId}`, { message: lastErr.message });
            }
          }
        });
      }
    }

    return res.json({
      success:  true,
      imported: success,
      skipped,
      failed:   errors.length,
      errors,
      chunkIndex,
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

    const { rows: records } = await pool.query(
      `SELECT ${fieldCols.join(", ")}, department_id, created_at
       FROM ${recordsTable}
       ${whereClause}
       ORDER BY department_id NULLS LAST, created_at DESC`,
      queryParams
    );

    /* Fetch dept names (both EN and HI) for institute admin export */
    let deptMap = {};
    if (!ctx.departmentId && records.some(r => r.department_id)) {
      const deptIds = [...new Set(records.map(r => r.department_id).filter(Boolean))];
      if (deptIds.length > 0) {
        const { rows: depts } = await pool.query(
          `SELECT department_id, name, name_hi FROM departments WHERE department_id = ANY($1::uuid[])`,
          [deptIds]
        );
        depts.forEach(d => { deptMap[d.department_id] = { name: d.name, name_hi: d.name_hi }; });
      }
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

    /* ── Pre-generate presigned URLs for document fields ─────────────────
       getSignedUrl is local HMAC — no S3 network call. Fast even for
       thousands of rows. Deduplicates keys so each unique file is signed
       only once. Legacy local URLs (http://…) are passed through as-is. */
    const docCols = new Set(
      fields.filter((f) => f.type === "document").map((f) => dbCol(f.column_name))
    );

    const keyToUrl = {};
    if (docCols.size > 0) {
      const uniqueKeys = [
        ...new Set(
          records.flatMap((rec) =>
            [...docCols].map((col) => rec[col]).filter(
              (v) => v && !v.startsWith("http://") && !v.startsWith("https://")
            )
          )
        ),
      ];
      await Promise.all(
        uniqueKeys.map(async (key) => {
          try { keyToUrl[key] = await getReadUrl(key, DOC_URL_TTL); }
          catch { keyToUrl[key] = key; } // fallback: keep raw key on error
        })
      );
    }

    function resolveDocValue(val) {
      if (!val) return "";
      if (val.startsWith("http://") || val.startsWith("https://")) return val;
      return keyToUrl[val] ?? val;
    }

    /* ── Build ordered header list + data rows ────────────────────────── */
    const headers = [];
    if (!ctx.departmentId) headers.push(deptColHeader);
    fields.forEach((f) => headers.push(fieldLabelMap[dbCol(f.column_name)]));
    headers.push(createdAtLabel);

    /* Track which column indices (0-based) hold document URLs for XLSX hyperlinks */
    const hasDeptCol   = !ctx.departmentId;
    const docColIndices = new Set(
      fields.reduce((acc, f, i) => {
        if (f.type === "document") acc.push((hasDeptCol ? 1 : 0) + i);
        return acc;
      }, [])
    );

    const dataRows = records.map((rec) => {
      const row = [];
      if (!ctx.departmentId) {
        const deptInfo = rec.department_id ? deptMap[rec.department_id] : null;
        row.push(deptInfo
          ? (language === "hi" ? (deptInfo.name_hi || deptInfo.name) : deptInfo.name)
          : institutionWide);
      }
      fields.forEach((f) => {
        const val = rec[dbCol(f.column_name)] ?? "";
        if (f.type === "date")     row.push(formatExportDate(val));
        else if (f.type === "document") row.push(resolveDocValue(val));
        else                       row.push(val);
      });
      row.push(rec.created_at ? formatExportDate(new Date(rec.created_at)) : "");
      return row;
    });

    const ts       = new Date().toISOString().slice(0, 10);
    const langTag  = language !== "en" ? `_${language}` : "";
    const baseName = `${formName}${langTag}_${ts}`;

    /* ── XLSX export via ExcelJS (supports cell styling) ─────────────── */
    if (format === "xlsx") {
      const workbook  = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(formName);

      /* Header row — bold white text on blue background */
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
        cell.border    = {
          bottom: { style: "thin", color: { argb: "FF1E40AF" } },
        };
      });
      headerRow.height = 20;

      /* Auto-width: seed each column with its header length */
      worksheet.columns = headers.map((h) => ({ width: Math.max(String(h).length + 4, 12) }));

      /* Data rows — normal format, zebra shading + hyperlinks for document cols */
      dataRows.forEach((row, idx) => {
        const dataRow = worksheet.addRow(row);
        if (idx % 2 === 1) {
          dataRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
          });
        }
        /* Convert document URL strings to clickable hyperlinks */
        docColIndices.forEach((colIdx) => {
          const cell = dataRow.getCell(colIdx + 1); // ExcelJS is 1-based
          const url  = cell.value;
          if (url && typeof url === "string" && url.startsWith("https://")) {
            cell.value     = { text: "View Document ↗", hyperlink: url, tooltip: url };
            cell.font      = { color: { argb: "FF2563EB" }, underline: true, size: 10 };
          }
        });
        dataRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.alignment = { vertical: "middle" };
        });
      });

      worksheet.views = [{ state: "frozen", ySplit: 1 }]; // freeze header row

      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      await workbook.xlsx.write(res);
      return res.end();
    }

    /* ── CSV export — plain text, no styling needed ───────────────────── */
    const escape = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = [
      headers.map(escape).join(","),
      ...dataRows.map((r) => r.map(escape).join(",")),
    ];
    const csv = "﻿" + csvLines.join("\r\n"); // BOM for Excel UTF-8 detection
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/export`, { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Export failed." });
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