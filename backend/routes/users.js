"use strict";

const express = require("express");
const bcrypt  = require("bcrypt");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

/* ── Role helpers ── */
function isOnlyInstAdmin(req) {
  const roles = req.user.roles || [];
  return roles.includes("institute_admin") && !roles.includes("super_admin");
}

function isDeptAdmin(req) {
  const roles = req.user.roles || [];
  return roles.includes("department_admin")
    && !roles.includes("super_admin")
    && !roles.includes("institute_admin");
}

const ALLOWED_ROLES = ["super_admin", "institute_admin", "department_admin"];

/* ── GET /api/users ── */
router.get("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    let rows;

    if (isDeptAdmin(req)) {
      // Department admin: only users in their own institution + department, with optional role filter
      const { role } = req.query;

      const conditions = [
        "u.account_status != 'DELETED'",
        `u.institution_id = $1`,
        `u.department_id  = $2`,
      ];
      const params = [req.user.institutionId, req.user.departmentId];

      if (role) {
        params.push(role);
        conditions.push(`EXISTS (
          SELECT 1 FROM user_roles ur2
          JOIN roles r2 ON r2.id = ur2.role_id
          WHERE ur2.user_id = u.id
            AND r2.name = $${params.length}
            AND ur2.revoked_at IS NULL
            AND (ur2.expires_at IS NULL OR ur2.expires_at > now())
        )`);
      }

      const whereClause = conditions.join(" AND ");

      ({ rows } = await pool.query(`
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
        WHERE ${whereClause}
        ORDER BY u.created_at DESC
      `, params));

    } else if (isOnlyInstAdmin(req)) {
      // Institute admin: users in their institution, with optional role + department filters
      const { role, department_id } = req.query;

      const conditions = [
        "u.account_status != 'DELETED'",
        `u.institution_id = $1`,
      ];
      const params = [req.user.institutionId];

      if (department_id) {
        params.push(department_id);
        conditions.push(`u.department_id = $${params.length}`);
      }
      if (role) {
        params.push(role);
        conditions.push(`EXISTS (
          SELECT 1 FROM user_roles ur2
          JOIN roles r2 ON r2.id = ur2.role_id
          WHERE ur2.user_id = u.id
            AND r2.name = $${params.length}
            AND ur2.revoked_at IS NULL
            AND (ur2.expires_at IS NULL OR ur2.expires_at > now())
        )`);
      }

      const whereClause = conditions.join(" AND ");

      ({ rows } = await pool.query(`
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
        WHERE ${whereClause}
        ORDER BY u.created_at DESC
      `, params));

    } else {
      // Super admin: all users, with optional filters
      const { institution_id, role, department_id } = req.query;

      const conditions = ["u.account_status != 'DELETED'"];
      const params     = [];

      if (institution_id) {
        params.push(institution_id);
        conditions.push(`u.institution_id = $${params.length}`);
      }
      if (department_id) {
        params.push(department_id);
        conditions.push(`u.department_id = $${params.length}`);
      }
      if (role) {
        params.push(role);
        conditions.push(`EXISTS (
          SELECT 1 FROM user_roles ur2
          JOIN roles r2 ON r2.id = ur2.role_id
          WHERE ur2.user_id = u.id
            AND r2.name = $${params.length}
            AND ur2.revoked_at IS NULL
            AND (ur2.expires_at IS NULL OR ur2.expires_at > now())
        )`);
      }

      const whereClause = conditions.join(" AND ");

      ({ rows } = await pool.query(`
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
        WHERE ${whereClause}
        ORDER BY u.created_at DESC
      `, params));
    }

    return res.json({ success: true, users: rows });
  } catch (err) {
    logger.error("GET /api/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/users/:id ── */
router.put("/:id", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  let { full_name, email, institution_id, department_id, account_status } = req.body;

  if (!full_name?.trim() || !email?.trim())
    return res.status(400).json({ success: false, message: "Name and email are required." });

  const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
  if (account_status && !validStatuses.includes(account_status))
    return res.status(400).json({ success: false, message: "Invalid account status." });

  try {
    // ── Fetch existing user before update (needed for audit diff and RBAC check) ──
    const { rows: existingRows } = await pool.query(
      `SELECT full_name, email, account_status, institution_id, department_id
       FROM users WHERE id = $1 AND account_status != 'DELETED'`,
      [id]
    );
    if (!existingRows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const existing = existingRows[0];

    // ── Department admin: verify target user belongs to their institution + department ──
    if (isDeptAdmin(req)) {
      if (
        existing.institution_id !== req.user.institutionId ||
        existing.department_id  !== req.user.departmentId
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only manage users from your own department.",
        });
      }
      institution_id = req.user.institutionId;
      department_id  = req.user.departmentId;

    // ── Institute admin: verify target user belongs to their institution ──
    } else if (isOnlyInstAdmin(req)) {
      if (existing.institution_id !== req.user.institutionId)
        return res.status(403).json({ success: false, message: "You can only manage users from your own institution." });
      institution_id = req.user.institutionId;
    }

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

    const updated = rows[0];

    // ── Audit log — only record fields that actually changed ──
    const changedFields = [
      "full_name", "email", "account_status", "institution_id", "department_id",
    ].filter((f) => String(existing[f] ?? "") !== String(updated[f] ?? ""));

    await writeAuditLog(req, {
      actionType: "USER_UPDATED",
      entityType: "USER",
      entityId:   updated.id,
      oldValue: {
        full_name:      existing.full_name,
        email:          existing.email,
        account_status: existing.account_status,
        institution_id: existing.institution_id,
        department_id:  existing.department_id,
      },
      newValue: {
        full_name:      updated.full_name,
        email:          updated.email,
        account_status: updated.account_status,
        institution_id: updated.institution_id,
        department_id:  updated.department_id,
      },
      changedFields,
      status:  "SUCCESS",
      message: `User "${updated.full_name}" updated`,
    });

    return res.json({ success: true, user: updated });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already in use at this institution." });
    logger.error("PUT /api/users/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/users ── */
router.post("/", verifyToken, requireRole(ALLOWED_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  let { full_name, email, password, institution_id, department_id, role_name } = req.body;

  // ── Scope institution / department to what the admin owns ──
  if (isDeptAdmin(req)) {
    institution_id = req.user.institutionId;
    department_id  = req.user.departmentId;
  } else if (isOnlyInstAdmin(req)) {
    institution_id = req.user.institutionId;
  }

  if (!full_name?.trim() || !email?.trim() || !password || !institution_id || !role_name)
    return res.status(400).json({ success: false, message: "Name, email, password, institution, and role are required." });

  if (password.length < 8)
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

  try {
    const { rows: roleRows } = await pool.query(
      "SELECT id FROM roles WHERE name = $1",
      [role_name]
    );
    if (!roleRows.length)
      return res.status(400).json({ success: false, message: "Invalid role." });

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users
         (full_name, email, password_hash, institution_id, department_id, must_change_password, is_temporary_password, created_by)
       VALUES ($1, $2, $3, $4, $5, true, true, $6)
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

    // ── Audit log ──
    await writeAuditLog(req, {
      actionType: "USER_CREATED",
      entityType: "USER",
      entityId:   rows[0].id,
      newValue: {
        full_name:      rows[0].full_name,
        email:          rows[0].email,
        account_status: rows[0].account_status,
        role:           role_name,
        institution_id,
        department_id:  department_id || null,
      },
      status:  "SUCCESS",
      message: `User "${rows[0].full_name}" created`,
    });

    return res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already exists at this institution." });
    logger.error("POST /api/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
