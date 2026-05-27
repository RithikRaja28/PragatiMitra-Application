"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const { translateRow } = require("../services/translationService");

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

function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}

async function checkFormLock(pool, formName, institutionId) {
  const { rows } = await pool.query(
    `SELECT is_locked FROM form_lock_config WHERE form_name = $1 AND institution_id = $2`,
    [formName, institutionId]
  );
  return rows[0]?.is_locked || false;
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

/* ─────────────────────────────────────────────────────────────────────
   GET /api/form-data/:formName/records
   Returns English records by default. Pass ?language=hi for Hindi rows.
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year, language = "en" } = req.query;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, institutionId, year);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found for this form." });

    const { rows: records } = await pool.query(
      `SELECT * FROM ${formName}_records
       WHERE institution_id = $1 AND (language = $2 OR ($2 = 'en' AND language IS NULL))
       ORDER BY created_at DESC`,
      [institutionId, language]
    );

    const { rows: lockRows } = await pool.query(
      `SELECT is_locked, locked_by, locked_at FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, institutionId]
    );
    const lock = lockRows[0] || { is_locked: false, locked_by: null, locked_at: null };

    return res.json({ success: true, records, schema, lock });
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/form-data/:formName/records
   Inserts the English row, then asynchronously inserts a Hindi row
   (language = 'hi', source_row_id = <english row id>).
   Body: { data: { col: value }, year?, language? }
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

    if (await checkFormLock(pool, formName, institutionId)) {
      return res.status(403).json({
        success: false,
        message: "This form is currently locked by the institution admin. You can only view the records.",
      });
    }

    const schema = await getActiveSchema(pool, formName, institutionId, year);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found." });

    const fields = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const formYear = Number(year) || schema.year;
    const departmentId = req.user.departmentId || null;
    const createdBy = req.user.userId || null;

    const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language", "created_by"];
    const stdVals = [formName, institutionId, departmentId, formYear, schema.id, language, createdBy];
    const fieldVals = fieldCols.map((col) => data[col] ?? null);

    const allCols = [...stdCols, ...fieldCols];
    const allVals = [...stdVals, ...fieldVals];
    const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${formName}_records (${allCols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      allVals
    );
    const enRow = rows[0];

    // Only auto-generate Hindi row for English submissions
    if (language === "en") {
      const tableName = `${formName}_records`;
      setImmediate(async () => {
        try {
          await ensureSourceRowIdColumn(pool, tableName);

          const hiData = await translateRow(data);
          const hiStdVals = [formName, institutionId, departmentId, formYear, schema.id, "hi", createdBy];
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
      });
    }

    return res.json({ success: true, record: enRow, message: "Record created successfully." });
  } catch (err) {
    logger.error(`POST /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/form-data/:formName/records/:id
   Updates the English row, then asynchronously updates the linked Hindi row.
   Body: { data: { col: value } }
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

    if (await checkFormLock(pool, formName, institutionId)) {
      return res.status(403).json({
        success: false,
        message: "This form is currently locked by the institution admin. You can only view the records.",
      });
    }

    const schema = await getActiveSchema(pool, formName, institutionId, null);
    if (!schema) return res.status(404).json({ success: false, message: "No active schema found." });

    const fields = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));

    let idx = 1;
    const setClauses = fieldCols.map((col) => `${col} = $${idx++}`);
    setClauses.push(`updated_at = now()`);

    const vals = [
      ...fieldCols.map((col) => data[col] ?? null),
      institutionId,
      id,
    ];

    const { rows } = await pool.query(
      `UPDATE ${formName}_records SET ${setClauses.join(", ")}
       WHERE institution_id = $${idx++} AND id = $${idx} RETURNING *`,
      vals
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Record not found." });

    // Asynchronously update linked Hindi row
    const tableName = `${formName}_records`;
    setImmediate(async () => {
      try {
        await ensureSourceRowIdColumn(pool, tableName);

        const hiData = await translateRow(data);
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
    });

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error(`PUT /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/:id
   Deletes the English row and its linked Hindi row (source_row_id match).
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

    if (await checkFormLock(pool, formName, institutionId)) {
      return res.status(403).json({
        success: false,
        message: "This form is currently locked by the institution admin. You can only view the records.",
      });
    }

    await ensureSourceRowIdColumn(pool, `${formName}_records`);

    const { rowCount } = await pool.query(
      `DELETE FROM ${formName}_records
       WHERE (id = $1 OR source_row_id = $1) AND institution_id = $2`,
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
