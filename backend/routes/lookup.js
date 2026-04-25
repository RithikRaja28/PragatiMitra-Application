const express = require("express");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

/* ── GET /api/lookup/institutions ── */
router.get("/institutions", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT institution_id, institution_name
       FROM institutions
       WHERE status = 'ACTIVE'
       ORDER BY institution_name`
    );
    return res.json({ success: true, institutions: rows });
  } catch (err) {
    console.error("[LOOKUP INSTITUTIONS ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/lookup/departments?institution_id=xxx ── */
router.get("/departments", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  const { institution_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT department_id, name
       FROM departments
       WHERE status = 'ACTIVE'
         AND ($1::uuid IS NULL OR institution_id = $1)
       ORDER BY name`,
      [institution_id || null]
    );
    return res.json({ success: true, departments: rows });
  } catch (err) {
    console.error("[LOOKUP DEPARTMENTS ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/lookup/roles ── */
router.get("/roles", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, display_name FROM roles ORDER BY display_name`
    );
    return res.json({ success: true, roles: rows });
  } catch (err) {
    console.error("[LOOKUP ROLES ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
