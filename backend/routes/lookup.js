const express = require("express");
const { verifyToken } = require("../middleware/auth");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

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
    logger.error("GET /api/lookup/institutions failed", { ...getLogContext(req), stack: err.stack });
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
    logger.error("GET /api/lookup/departments failed", { ...getLogContext(req), stack: err.stack });
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
    logger.error("GET /api/lookup/roles failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/lookup/users?institution_id=xxx&department_id=xxx&eligible_only=true ──
   eligible_only=true  → exclude users who hold any admin/management role, so only
   faculty/contributors/reviewers appear in Nodal Officer dropdowns.
── */
router.get("/users", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  const { institution_id, department_id, eligible_only } = req.query;

  const EXCLUDED_ROLES = [
    "super_admin", "institute_admin", "department_admin",
    "head_of_department", "finance_officer", "directors_office", "publication_cell",
  ];

  try {
    const rows_query = eligible_only === "true"
      ? await pool.query(
          `SELECT u.id, u.full_name, u.email
           FROM users u
           WHERE u.account_status = 'ACTIVE'
             AND ($1::uuid IS NULL OR u.institution_id = $1)
             AND ($2::uuid IS NULL OR u.department_id  = $2)
             AND NOT EXISTS (
               SELECT 1
               FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id    = u.id
                 AND ur.revoked_at IS NULL
                 AND (ur.expires_at IS NULL OR ur.expires_at > now())
                 AND r.name = ANY($3::text[])
             )
           ORDER BY u.full_name`,
          [institution_id || null, department_id || null, EXCLUDED_ROLES]
        )
      : await pool.query(
          `SELECT u.id, u.full_name, u.email
           FROM users u
           WHERE u.account_status = 'ACTIVE'
             AND ($1::uuid IS NULL OR u.institution_id = $1)
             AND ($2::uuid IS NULL OR u.department_id  = $2)
           ORDER BY u.full_name`,
          [institution_id || null, department_id || null]
        );

    return res.json({ success: true, users: rows_query.rows });
  } catch (err) {
    logger.error("GET /api/lookup/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
