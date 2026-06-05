"use strict";

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const logger = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

const REPORTING_YEARS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"];
const ALLOWED_ROLES   = ["department_admin", "super_admin"];

/* ── GET /api/nodal-officer-assignments ── */
router.get("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, roles } = req.user;

  try {
    let whereClause, params;

    if (roles.includes("super_admin")) {
      whereClause = "";
      params      = [];
    } else {
      // department_admin — scoped to their own department
      whereClause = "WHERE noa.institution_id = $1 AND noa.department_id = $2";
      params      = [institutionId, departmentId];
    }

    const { rows } = await pool.query(
      `SELECT
         noa.id,
         noa.institution_id,
         noa.department_id,
         noa.user_id,
         noa.reporting_year,
         noa.is_active,
         noa.created_at,
         u.full_name  AS user_full_name,
         u.email      AS user_email,
         d.name       AS department_name
       FROM nodal_officer_assignments noa
       JOIN users        u ON u.id             = noa.user_id
       LEFT JOIN departments d ON d.department_id = noa.department_id
       ${whereClause}
       ORDER BY noa.reporting_year DESC, noa.created_at DESC`,
      params
    );

    return res.json({ success: true, assignments: rows });
  } catch (err) {
    logger.error("GET /api/nodal-officer-assignments failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/nodal-officer-assignments ──
   Creates a new assignment record.  Multiple active records per dept+year
   are permitted — there is no uniqueness restriction.
── */
router.post("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, userId } = req.user;
  const { user_id, reporting_year } = req.body;

  if (!user_id)
    return res.status(400).json({ success: false, message: "user_id is required." });
  if (!reporting_year)
    return res.status(400).json({ success: false, message: "reporting_year is required." });
  if (!REPORTING_YEARS.includes(reporting_year))
    return res.status(400).json({ success: false, message: "Invalid reporting_year." });
  if (!departmentId)
    return res.status(400).json({ success: false, message: "Your account has no department assigned." });

  try {
    const { rows } = await pool.query(
      `INSERT INTO nodal_officer_assignments
         (institution_id, department_id, user_id, reporting_year, is_active, assigned_by)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING *`,
      [institutionId, departmentId, user_id, reporting_year, userId]
    );

    return res.status(201).json({
      success:    true,
      message:    "Nodal Officer assigned successfully.",
      assignment: rows[0],
    });
  } catch (err) {
    logger.error("POST /api/nodal-officer-assignments failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/nodal-officer-assignments/:id ──
   Accepts { user_id? } to change the assigned user, and/or
           { is_active? } to enable/disable the record.
   At least one field must be provided.
── */
router.put("/:id", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, roles } = req.user;
  const { id } = req.params;
  const { user_id, is_active } = req.body;

  if (user_id === undefined && is_active === undefined)
    return res.status(400).json({ success: false, message: "Provide user_id or is_active." });
  if (is_active !== undefined && typeof is_active !== "boolean")
    return res.status(400).json({ success: false, message: "is_active must be a boolean." });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM nodal_officer_assignments WHERE id = $1",
      [id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "Assignment not found." });

    const assignment = rows[0];

    // Scope guard
    if (!roles.includes("super_admin")) {
      if (assignment.institution_id !== institutionId || assignment.department_id !== departmentId)
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Build dynamic SET clause — update only what was provided
    const setClauses = ["updated_at = now()"];
    const vals       = [];

    if (user_id !== undefined) {
      vals.push(user_id);
      setClauses.push(`user_id = $${vals.length}`);
    }
    if (is_active !== undefined) {
      vals.push(is_active);
      setClauses.push(`is_active = $${vals.length}`);
    }
    vals.push(id);

    const { rows: updated } = await pool.query(
      `UPDATE nodal_officer_assignments
         SET ${setClauses.join(", ")}
       WHERE id = $${vals.length}
       RETURNING *`,
      vals
    );

    return res.json({ success: true, assignment: updated[0] });
  } catch (err) {
    logger.error("PUT /api/nodal-officer-assignments/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── DELETE /api/nodal-officer-assignments/:id ── */
router.delete("/:id", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, roles } = req.user;
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM nodal_officer_assignments WHERE id = $1",
      [id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "Assignment not found." });

    const assignment = rows[0];

    if (!roles.includes("super_admin")) {
      if (assignment.institution_id !== institutionId || assignment.department_id !== departmentId)
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    await pool.query("DELETE FROM nodal_officer_assignments WHERE id = $1", [id]);

    return res.json({ success: true, message: "Assignment deleted." });
  } catch (err) {
    logger.error("DELETE /api/nodal-officer-assignments/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
