const express = require("express");
const bcrypt  = require("bcrypt");
const { verifyToken, requireRole } = require("../middleware/auth");

const router = express.Router();

/* ── GET /api/users ── list all non-deleted users ── */
router.get("/", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.account_status,
        u.last_login_at,
        u.created_at,
        u.institution_id,
        u.department_id,
        i.institution_name,
        d.name AS department_name,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'name',         r.name,
              'display_name', r.display_name
            ))
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id
             AND ur.revoked_at IS NULL
             AND (ur.expires_at IS NULL OR ur.expires_at > now())
          ), '[]'::json
        ) AS roles
      FROM users u
      LEFT JOIN institutions i ON i.institution_id = u.institution_id
      LEFT JOIN departments  d ON d.department_id  = u.department_id
      WHERE u.account_status != 'DELETED'
      ORDER BY u.created_at DESC
    `);
    return res.json({ success: true, users: rows });
  } catch (err) {
    console.error("[GET USERS ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/users/:id ── update user ── */
router.put("/:id", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const { full_name, email, institution_id, department_id, account_status } = req.body;

  if (!full_name?.trim() || !email?.trim())
    return res.status(400).json({ success: false, message: "Name and email are required." });

  const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
  if (account_status && !validStatuses.includes(account_status))
    return res.status(400).json({ success: false, message: "Invalid account status." });

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET full_name      = $1,
           email          = $2,
           institution_id = $3,
           department_id  = $4,
           account_status = $5
       WHERE id = $6
       RETURNING id, full_name, email, account_status, institution_id, department_id`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        institution_id || null,
        department_id  || null,
        account_status,
        id,
      ]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    return res.json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already in use at this institution." });
    console.error("[UPDATE USER ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/users ── create user ── */
router.post("/", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { full_name, email, password, institution_id, department_id, role_name } = req.body;

  if (!full_name?.trim() || !email?.trim() || !password || !institution_id || !role_name)
    return res.status(400).json({ success: false, message: "Name, email, password, institution, and role are required." });

  if (password.length < 8)
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

  try {
    const { rows: roleRows } = await pool.query("SELECT id FROM roles WHERE name = $1", [role_name]);
    if (!roleRows.length)
      return res.status(400).json({ success: false, message: "Invalid role." });

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users
         (full_name, email, password_hash, institution_id, department_id, must_change_password, created_by)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, full_name, email, account_status`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        institution_id,
        department_id || null,
        req.user.userId,
      ]
    );

    await pool.query(
      "INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)",
      [rows[0].id, roleRows[0].id, req.user.userId]
    );

    return res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already exists at this institution." });
    console.error("[CREATE USER ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
