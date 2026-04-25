"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken);

// Temporary: log decoded roles so we can confirm the exact role name in the DB
router.use((req, _res, next) => {
  console.log("[DEPT] request from userId:", req.user?.userId, "roles:", req.user?.roles);
  next();
});

/* ── GET /api/departments/institutions ──────────────────────────
   Returns all institutions for the institution-selector dropdown.
   Must be registered BEFORE the parameterised "/:id" routes.
────────────────────────────────────────────────────────────── */
router.get("/institutions", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT institution_id, institution_name
       FROM   institutions
       ORDER  BY institution_name ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[DEPT] institutions fetch:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch institutions." });
  }
});

/* ── GET /api/departments?institution_id=X ──────────────────────
   Returns all departments for one institution, each with a live
   member_count (users whose account_status != 'DELETED').

   Expected department columns: department_id, name, code, status,
   institution_id, created_at.
────────────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const institutionId = Number(req.query.institution_id);

  if (!Number.isInteger(institutionId) || institutionId <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "A valid institution_id is required." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         d.department_id,
         d.name,
         d.code,
         d.status,
         d.created_at,
         COUNT(u.id) FILTER (WHERE u.account_status != 'DELETED') AS member_count
       FROM   departments d
       LEFT   JOIN users u
              ON  u.department_id  = d.department_id
              AND u.institution_id = $1
       WHERE  d.institution_id = $1
       GROUP  BY d.department_id, d.name, d.code, d.status, d.created_at
       ORDER  BY d.name ASC`,
      [institutionId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[DEPT] list:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch departments." });
  }
});

/* ── PATCH /api/departments/:id/deactivate ──────────────────────
   Soft-deletes a department by setting status = 'INACTIVE'.
   Refuses if any ACTIVE users still belong to the department
   under the given institution.

   Body: { institution_id: number }
────────────────────────────────────────────────────────────── */
router.patch("/:id/deactivate", async (req, res) => {
  const pool = req.app.locals.pool;
  const departmentId = Number(req.params.id);
  const institutionId = Number(req.body.institution_id);

  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid department ID." });
  }
  if (!Number.isInteger(institutionId) || institutionId <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "A valid institution_id is required." });
  }

  try {
    // Verify the department exists and belongs to this institution
    const { rows: deptRows } = await pool.query(
      `SELECT department_id, name, status
       FROM   departments
       WHERE  department_id = $1 AND institution_id = $2`,
      [departmentId, institutionId]
    );

    if (!deptRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    }

    const dept = deptRows[0];

    if (dept.status.toUpperCase() === "INACTIVE") {
      return res
        .status(409)
        .json({ success: false, message: "Department is already inactive." });
    }

    // Block deactivation if any active users remain in this department
    const {
      rows: [{ active_count }],
    } = await pool.query(
      `SELECT COUNT(*) AS active_count
       FROM   users
       WHERE  department_id  = $1
         AND  institution_id = $2
         AND  account_status = 'ACTIVE'`,
      [departmentId, institutionId]
    );

    if (Number(active_count) > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot deactivate "${dept.name}": ${active_count} user(s) are still active. Please deactivate all members of this department first.`,
      });
    }

    await pool.query(
      `UPDATE departments SET status = 'INACTIVE' WHERE department_id = $1`,
      [departmentId]
    );

    return res.json({
      success: true,
      message: `"${dept.name}" has been deactivated successfully.`,
    });
  } catch (err) {
    console.error("[DEPT] deactivate:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to deactivate department." });
  }
});

module.exports = router;
