"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { translateFields } = require("../services/translationService");

const router = express.Router();
router.use(verifyToken);

// Field types whose values may contain natural-language text worth translating
const TRANSLATABLE_FIELD_TYPES = new Set(["text", "textarea"]);

// Session-level cache: prevents repeated ALTER TABLE calls for already-present _hi columns
const ensuredHiCols = new Set();

async function ensureHindiColumns(pool, tableName, hiColNames) {
  const pending = hiColNames.filter((c) => !ensuredHiCols.has(`${tableName}.${c}`));
  for (const col of pending) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col} TEXT`);
    ensuredHiCols.add(`${tableName}.${col}`);
  }
}

function validateFormName(name) {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

async function resolveInstitutionId(pool, req) {
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  if (isSuperAdmin) return req.body?.institution_id || req.query?.institution_id || null;
  const { rows } = await pool.query(
    "SELECT institution_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  return rows[0]?.institution_id || null;
}

async function getActiveSchema(pool, formName, institutionId, year) {
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year) { q += ` AND year = $3`; params.push(year); }
  q += ` LIMIT 1`;
  const { rows } = await pool.query(q, params);
  return rows[0] || null;
}

/* ─── normalise a field's column name to its DB form ─── */
function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}

/* ─── get active, deduplicated fields from a schema row ─── */
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

/* ─────────────────────────────────────────────────────────────────────
   GET /api/form-data/:formName/records
   List all records for this institution from <formName>_records.
   Also returns the active schema so the frontend can render headers.
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year } = req.query;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, institutionId, year);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found for this form." });

    const { rows: records } = await pool.query(
      `SELECT * FROM ${formName}_records WHERE institution_id = $1 ORDER BY created_at DESC`,
      [institutionId]
    );

    return res.json({ success: true, records, schema });
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/form-data/:formName/records
   Insert a new record. Body: { data: { col: value }, year?, language? }
───────────────────────────────────────────────────────────────────── */
router.post("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { data, year, language = "en" } = req.body;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }
  if (!data || typeof data !== "object") {
    return res.status(400).json({ success: false, message: "data is required." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, institutionId, year);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found." });

    const fields = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const formYear = Number(year) || schema.year;

    // Translate text/textarea field values to Hindi
    const translatableMap = {};
    for (const f of fields) {
      if (TRANSLATABLE_FIELD_TYPES.has(f.type)) {
        const col = dbCol(f.column_name);
        if (data[col] != null) translatableMap[col] = data[col];
      }
    }
    const hiFields = await translateFields(translatableMap);
    if (Object.keys(hiFields).length > 0) {
      await ensureHindiColumns(pool, `${formName}_records`, Object.keys(hiFields));
    }

    const stdCols   = ["form_name", "institution_id", "year", "schema_id", "language"];
    const stdVals   = [formName, institutionId, formYear, schema.id, language];
    const fieldVals = fieldCols.map((col) => data[col] ?? null);

    const allCols = [...stdCols, ...fieldCols, ...Object.keys(hiFields)];
    const allVals = [...stdVals, ...fieldVals, ...Object.values(hiFields)];
    const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${formName}_records (${allCols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      allVals
    );

    return res.json({ success: true, record: rows[0], message: "Record created successfully." });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/form-data/:formName/records/:id
   Update an existing record. Body: { data: { col: value } }
───────────────────────────────────────────────────────────────────── */
router.put("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;
  const { data } = req.body;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }
  if (!data || typeof data !== "object") {
    return res.status(400).json({ success: false, message: "data is required." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, institutionId, null);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found." });

    const fields = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));

    // Translate text/textarea field values to Hindi
    const translatableMap = {};
    for (const f of fields) {
      if (TRANSLATABLE_FIELD_TYPES.has(f.type)) {
        const col = dbCol(f.column_name);
        if (data[col] != null) translatableMap[col] = data[col];
      }
    }
    const hiFields = await translateFields(translatableMap);
    if (Object.keys(hiFields).length > 0) {
      await ensureHindiColumns(pool, `${formName}_records`, Object.keys(hiFields));
    }

    let idx = 1;
    const setClauses = fieldCols.map((col) => `${col} = $${idx++}`);
    for (const col of Object.keys(hiFields)) setClauses.push(`${col} = $${idx++}`);
    setClauses.push(`updated_at = now()`);

    const vals = [
      ...fieldCols.map((col) => data[col] ?? null),
      ...Object.values(hiFields),
      institutionId,
      id,
    ];

    const { rows } = await pool.query(
      `UPDATE ${formName}_records SET ${setClauses.join(", ")}
       WHERE institution_id = $${idx++} AND id = $${idx} RETURNING *`,
      vals
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Record not found." });

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error(`PUT /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/:id
───────────────────────────────────────────────────────────────────── */
router.delete("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rowCount } = await pool.query(
      `DELETE FROM ${formName}_records WHERE id = $1 AND institution_id = $2`,
      [id, institutionId]
    );

    if (!rowCount) return res.status(404).json({ success: false, message: "Record not found." });

    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    logger.error(`DELETE /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

module.exports = router;
