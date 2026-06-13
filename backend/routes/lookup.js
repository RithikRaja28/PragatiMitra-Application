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

/* ── GET /api/lookup/users?institution_id=xxx&department_id=xxx&exclude_roles=super_admin ──
   Returns all active users matching the given scope, with their primary role
   display name and department name included.
   exclude_roles: comma-separated role names to exclude (e.g. "super_admin").
── */
router.get("/users", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  const { institution_id, department_id, exclude_roles } = req.query;
  const excludeList = exclude_roles
    ? exclude_roles.split(",").map((r) => r.trim()).filter(Boolean)
    : [];

  try {
    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         d.name AS department_name,
         COALESCE(
           (SELECT r.display_name
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id    = u.id
              AND ur.revoked_at IS NULL
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
            ORDER BY r.display_name
            LIMIT 1),
           'No Role'
         ) AS role_display_name
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       WHERE u.account_status = 'ACTIVE'
         AND ($1::uuid IS NULL OR u.institution_id = $1)
         AND ($2::uuid IS NULL OR u.department_id  = $2)
         AND (
           array_length($3::text[], 1) IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id    = u.id
               AND ur.revoked_at IS NULL
               AND (ur.expires_at IS NULL OR ur.expires_at > now())
               AND r.name = ANY($3::text[])
           )
         )
       ORDER BY u.full_name`,
      [institution_id || null, department_id || null, excludeList]
    );

    return res.json({ success: true, users: rows });
  } catch (err) {
    logger.error("GET /api/lookup/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
