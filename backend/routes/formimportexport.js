"use strict";

const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const { verifyToken } = require("../middleware/auth");
const logger  = require("../utils/logger");
const { getLogContext } = logger;

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
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year) { q += ` AND year = $3`; params.push(year); }
  q += ` ORDER BY year DESC LIMIT 1`;
  const { rows } = await pool.query(q, params);
  if (!rows[0]) return null;

  const schema   = rows[0];
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
      const d = new Date(val);
      rowData[col] = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
      const globalRowNum = chunkIndex * chunk.length + i + 1;
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

    try {
      await client.query("BEGIN");

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

        /* INSERT */
        const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language"];
        const stdVals = [formName, ctx.institutionId, resolvedDeptId, formYear, schemaRow.id, language];
        const allCols = [...stdCols, ...fieldCols];
        const allVals = [...stdVals, ...fieldCols.map((col) => rowData[col] ?? null)];
        const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

        await client.query(
          `INSERT INTO ${recordsTable} (${allCols.join(", ")}) VALUES (${placeholders})`,
          allVals
        );
        success++;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
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

    /* Fetch dept names for institute admin export */
    let deptMap = {};
    if (!ctx.departmentId && records.some(r => r.department_id)) {
      const deptIds = [...new Set(records.map(r => r.department_id).filter(Boolean))];
      if (deptIds.length > 0) {
        const { rows: depts } = await pool.query(
          `SELECT department_id, name FROM departments WHERE department_id = ANY($1::uuid[])`,
          [deptIds]
        );
        depts.forEach(d => { deptMap[d.department_id] = d.name; });
      }
    }

    const exportRows = records.map((rec) => {
      const row = {};
      if (!ctx.departmentId) {
        row["Department"] = rec.department_id ? (deptMap[rec.department_id] || rec.department_id) : "Institution-wide";
      }
      fields.forEach((f) => {
        const col   = dbCol(f.column_name);
        /* Use the label for the selected language; fall back to English then raw column name */
        const label = f.label?.[language] || f.label?.en || f.column_name;
        row[label]  = rec[col] ?? "";
      });
      row["Created At"] = rec.created_at ? new Date(rec.created_at).toISOString().slice(0, 10) : "";
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows.length ? exportRows : [{}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, formName);
    const ts       = new Date().toISOString().slice(0, 10);
    const langTag  = language !== "en" ? `_${language}` : "";
    const baseName = `${formName}${langTag}_${ts}`;

    if (format === "xlsx") {
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
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
      if (field.type === "number")  return "0";
      if (field.type === "boolean") return "Yes";
      if (field.type === "date")    return "2025-01-01";
      if (field.type === "email")   return "example@email.com";
      if (field.type === "phone")   return "9876543210";
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