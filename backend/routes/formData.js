"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();
router.use(verifyToken);

function validateFormName(name) {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}

/* ════════════════════════════════════════════════════════════════
   resolveUserContext — same logic as form-import-export.js
   Returns { institutionId, departmentId, role }

   - institute_admin → departmentId = null  (sees ALL dept records)
   - department_admin → departmentId = theirs (sees ONLY their dept)
   - super_admin     → reads from body/query
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

async function getActiveSchema(pool, formName, institutionId, year) {
  const params = [formName, institutionId];
  let q = `SELECT * FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND is_active = true`;
  if (year) { q += ` AND year = $3`; params.push(year); }
  q += ` ORDER BY year DESC LIMIT 1`;
  const { rows } = await pool.query(q, params);
  return rows[0] || null;
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

   SCOPING:
   - dept admin   → WHERE institution_id=$1 AND (department_id=$2 OR department_id IS NULL)
   - inst admin   → WHERE institution_id=$1  (all departments)
   - super admin  → WHERE institution_id=$1

   NOTE: We also include rows where department_id IS NULL for dept admin
   so manually-added records (which have no dept tag) are still visible.
   Only records imported under a DIFFERENT department are hidden.
─────────────────────────────────────────────────────────────────────── */
router.get("/:formName/records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year } = req.query;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, year);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found for this form." });

    /* Build WHERE clause based on role */
    let whereClause = "WHERE institution_id = $1";
    const queryParams = [ctx.institutionId];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      /*
        Dept admin sees:
        1. Records tagged to their own department
        2. Records with no department tag (institution-wide records, e.g. manually added)
        They do NOT see records tagged to other departments.
      */
      whereClause += " AND (department_id = $2 OR department_id IS NULL)";
      queryParams.push(ctx.departmentId);
    }
    /* inst admin / super admin: no dept filter → sees everything */

    const { rows: records } = await pool.query(
      `SELECT * FROM ${formName}_records
       ${whereClause}
       ORDER BY created_at DESC`,
      queryParams
    );

    return res.json({ success: true, records, schema });
  } catch (err) {
    logger.error(`GET /api/form-data/${formName}/records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/form-data/:formName/records
   Insert a new record manually (not via import).
   Tags the record with the user's department_id automatically.
─────────────────────────────────────────────────────────────────────── */
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
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, year);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));
    const formYear  = Number(year) || schema.year;

    /* Stamp department_id from user context so manual adds are also dept-scoped */
    const stdCols = ["form_name", "institution_id", "department_id", "year", "schema_id", "language"];
    const stdVals = [formName, ctx.institutionId, ctx.departmentId, formYear, schema.id, language];
    const fieldVals = fieldCols.map((col) => data[col] ?? null);

    const allCols = [...stdCols, ...fieldCols];
    const allVals = [...stdVals, ...fieldVals];
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
   Dept admin can only update records belonging to their department.
─────────────────────────────────────────────────────────────────────── */
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
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const schema = await getActiveSchema(pool, formName, ctx.institutionId, null);
    if (!schema)
      return res.status(404).json({ success: false, message: "No active schema found." });

    const fields    = activeFields(schema);
    const fieldCols = fields.map((f) => dbCol(f.column_name));

    let idx = 1;
    const setClauses = [...fieldCols.map((col) => `${col} = $${idx++}`), `updated_at = now()`];

    /* Dept admin: only allow update on their own dept records */
    let whereClause = `institution_id = $${idx++} AND id = $${idx++}`;
    const whereVals = [ctx.institutionId, id];

    if (ctx.role === "department_admin" && ctx.departmentId) {
      whereClause += ` AND (department_id = $${idx++} OR department_id IS NULL)`;
      whereVals.push(ctx.departmentId);
    }

    const vals = [...fieldCols.map((col) => data[col] ?? null), ...whereVals];

    const { rows } = await pool.query(
      `UPDATE ${formName}_records SET ${setClauses.join(", ")}
       WHERE ${whereClause} RETURNING *`,
      vals
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "Record not found." });

    return res.json({ success: true, record: rows[0], message: "Record updated successfully." });
  } catch (err) {
    logger.error(`PUT /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/form-data/:formName/records/:id
   Dept admin can only delete their own dept records.
─────────────────────────────────────────────────────────────────────── */
router.delete("/:formName/records/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName, id } = req.params;

  if (!validateFormName(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const ctx = await resolveUserContext(pool, req);
    if (!ctx.institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    let whereClause = "id = $1 AND institution_id = $2";
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

    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    logger.error(`DELETE /api/form-data/${formName}/records/${id}`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

module.exports = router;