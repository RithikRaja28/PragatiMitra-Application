"use strict";

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const logger = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

const ALLOWED_ROLES = ["department_admin", "super_admin", "institute_admin"];

/* Standard format (locked): "YYYY-YYYY" with end = start + 1, e.g. "2026-2027".
   Mirrors validateFinanceYear's pattern in committees.js so every "year range"
   string in the app shares one canonical shape. */
const REPORTING_YEAR_RE = /^\d{4}-\d{4}$/;
const isValidReportingYear = (y) => {
  if (typeof y !== "string" || !REPORTING_YEAR_RE.test(y)) return false;
  const [start, end] = y.split("-").map(Number);
  return end === start + 1;
};

/* One-time, idempotent rewrite of any non-canonical reporting_year strings
   (legacy "YYYY-YY", e.g. "2026-27") to the canonical "YYYY-YYYY" form. The
   leading 4-digit start year is always present and authoritative, so the
   rebuilt string is correct regardless of the row's previous shape. Rows
   already canonical are left untouched (no-op). Safe to run on every boot. */
async function normalizeReportingYears(pool) {
  await pool.query(`
    UPDATE nodal_officer_assignments
    SET reporting_year = substring(reporting_year FROM '^(\\d{4})')
                         || '-' ||
                         (substring(reporting_year FROM '^(\\d{4})')::int + 1)
    WHERE reporting_year !~ '^\\d{4}-\\d{4}$'
      AND reporting_year ~ '^\\d{4}-'
  `);
}

/* ── GET /api/nodal-officer-assignments/my-years ──
   Returns all reporting years for which the current user has an active
   NOA assignment (either dept-level or institute-level).
── */
router.get("/my-years", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  const { userId } = req.user;
  try {
    const { rows } = await pool.query(
      `SELECT reporting_year
       FROM nodal_officer_assignments
       WHERE user_id   = $1
         AND is_active = TRUE
       ORDER BY reporting_year DESC`,
      [userId]
    );
    return res.json({ success: true, years: rows.map((r) => r.reporting_year) });
  } catch (err) {
    logger.error("GET /api/nodal-officer-assignments/my-years failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/nodal-officer-assignments ──
   Scope:
     super_admin    → all records
     institute_admin → inst-level records (dept=null) for their institution
     department_admin → dept-level records for their department
── */
router.get("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, roles } = req.user;

  try {
    let whereClause, params;

    if (roles.includes("super_admin")) {
      whereClause = "";
      params      = [];
    } else if (roles.includes("institute_admin") && !roles.includes("department_admin")) {
      // Institute admin sees institution-wide (dept=null) assignments only
      whereClause = "WHERE noa.institution_id = $1 AND noa.department_id IS NULL";
      params      = [institutionId];
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
       JOIN users             u ON u.id             = noa.user_id
       LEFT JOIN departments  d ON d.department_id  = noa.department_id
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
   Creates a new assignment record. Multiple active records per scope+year allowed.
   institute_admin  → department_id = NULL (institution-wide)
   department_admin → department_id = caller's JWT departmentId
── */
router.post("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { institutionId, departmentId, userId, roles } = req.user;
  const { user_id, reporting_year } = req.body;

  if (!user_id)
    return res.status(400).json({ success: false, message: "user_id is required." });
  if (!reporting_year || !isValidReportingYear(reporting_year))
    return res.status(400).json({ success: false, message: "reporting_year must be in YYYY-YYYY format (e.g. 2026-2027)." });

  // Determine insert scope
  let insertDeptId;
  if (roles.includes("institute_admin") && !roles.includes("department_admin")) {
    // Institute-level: always NULL department
    insertDeptId = null;
  } else if (roles.includes("department_admin")) {
    if (!departmentId)
      return res.status(400).json({ success: false, message: "Your account has no department assigned." });
    insertDeptId = departmentId;
  } else {
    // super_admin: caller may specify department_id in body; omit for inst-level
    insertDeptId = req.body.department_id || null;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO nodal_officer_assignments
         (institution_id, department_id, user_id, reporting_year, is_active, assigned_by)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING *`,
      [institutionId, insertDeptId, user_id, reporting_year, userId]
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
   Accepts { user_id? } and/or { is_active? }.
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
      if (roles.includes("institute_admin") && !roles.includes("department_admin")) {
        // Institute admin may only modify inst-level records for their institution
        if (assignment.institution_id !== institutionId || assignment.department_id !== null)
          return res.status(403).json({ success: false, message: "Access denied." });
      } else {
        // Department admin: must match institution AND department
        if (assignment.institution_id !== institutionId || assignment.department_id !== departmentId)
          return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

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
      if (roles.includes("institute_admin") && !roles.includes("department_admin")) {
        if (assignment.institution_id !== institutionId || assignment.department_id !== null)
          return res.status(403).json({ success: false, message: "Access denied." });
      } else {
        if (assignment.institution_id !== institutionId || assignment.department_id !== departmentId)
          return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

    await pool.query("DELETE FROM nodal_officer_assignments WHERE id = $1", [id]);

    return res.json({ success: true, message: "Assignment deleted." });
  } catch (err) {
    logger.error("DELETE /api/nodal-officer-assignments/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
// Exposed so server.js can run the one-time format migration at startup
// (the router itself is a callable function — attaching is the standard
// way to export a secondary helper alongside it without changing app.use()).
module.exports.normalizeReportingYears = normalizeReportingYears;
