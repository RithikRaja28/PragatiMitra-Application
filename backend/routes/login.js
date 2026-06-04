"use strict";

const express   = require("express");
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcrypt");
const crypto    = require("crypto");
const rateLimit = require("express-rate-limit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;
// ── NEW ──────────────────────────────────────────────────────────
const { writeAuditLog } = require("../utils/audit");
// ────────────────────────────────────────────────────────────────

const router = express.Router();

const REFRESH_TOKEN_TTL_MS = 1 * 24 * 60 * 60 * 1000; // 1 day

/* ── Rate limiters ── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Helpers ── */
function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "15m",
    issuer:   "pragatimitra-api",
    audience: "pragatimitra-app",
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   REFRESH_TOKEN_TTL_MS,
    path:     "/api/auth",
  };
}

/**
 * currentReportingYear
 * Indian academic calendar: year starts in July.
 *   Month >= 7  →  "YYYY-(YY+1)"   e.g. July 2026 → "2026-27"
 *   Month < 7   →  "(YYYY-1)-YY"   e.g. June 2026 → "2025-26"
 */
function currentReportingYear() {
  const now   = new Date();
  const month = now.getMonth() + 1;   // 1-12
  const year  = now.getFullYear();
  if (month >= 7) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

/**
 * enrichWithNodalOfficerRole
 *
 * After the regular user/roles query, checks nodal_officer_assignments for an
 * ACTIVE Department Nodal Officer record for the CURRENT academic year.
 * If found, prepends 'department_admin' to the user's roles array so that:
 *   - requireRole / isOnlyInstAdmin / isDeptAdmin checks pass automatically
 *   - Frontend roleConfig routes to the Department Admin dashboard
 *   - departmentId in the JWT reflects the delegated department
 *
 * Only Department Nodal Officer is supported; Institution Nodal Officer is
 * a future feature.  Fails silently — must never block authentication.
 */
async function enrichWithNodalOfficerRole(pool, user) {
  if (!user) return;
  try {
    const reportingYear = currentReportingYear();

    const { rows } = await pool.query(
      `SELECT
         noa.institution_id,
         noa.department_id,
         r.id           AS role_id,
         r.name         AS role_name,
         r.display_name AS role_display_name,
         r.permissions  AS role_permissions
       FROM nodal_officer_assignments noa
       JOIN roles r ON r.name = 'department_admin'
       WHERE noa.user_id       = $1
         AND noa.is_active     = TRUE
         AND noa.department_id IS NOT NULL
         AND noa.reporting_year = $2
       LIMIT 1`,
      [user.id, reportingYear]
    );

    if (!rows.length) return;

    const noa = rows[0];

    // Only prepend if user doesn't already hold department_admin via user_roles
    if (!(user.roles || []).some((r) => r.name === "department_admin")) {
      user.roles = [
        {
          id:           noa.role_id,
          name:         "department_admin",
          display_name: noa.role_display_name,
          permissions:  noa.role_permissions,
        },
        ...(user.roles || []),
      ];
    }

    // Override department context with the assigned department
    user.institution_id = noa.institution_id;
    user.department_id  = noa.department_id;
  } catch (_) {
    // Silently swallow — nodal officer lookup must never block login
  }
}

async function fetchUser(pool, whereClause, params) {
  const { rows } = await pool.query(
    `SELECT
       u.id, u.email, u.full_name, u.password_hash,
       u.must_change_password, u.is_temporary_password, u.account_status,
       u.institution_id, u.department_id, u.profile_image_url,
       i.institution_name,
       d.name AS department_name,
       COALESCE(
         (SELECT json_agg(json_build_object(
             'id',           r.id,
             'name',         r.name,
             'display_name', r.display_name,
             'permissions',  r.permissions
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
     ${whereClause}`,
    params
  );
  return rows[0] || null;
}

function buildAccessPayload(user, sessionId) {
  return {
    userId:        user.id,
    email:         user.email,
    institutionId: user.institution_id,
    departmentId:  user.department_id,
    roles:         (user.roles || []).map((r) => r.name),
    sessionId,
  };
}

function buildUserObject(user) {
  return {
    id:                   user.id,
    fullName:             user.full_name,
    email:                user.email,
    institutionId:        user.institution_id,
    institutionName:      user.institution_name,
    departmentId:         user.department_id,
    departmentName:       user.department_name,
    profileImageUrl:      user.profile_image_url,
    mustChangePassword:   user.must_change_password,
    isTemporaryPassword:  user.is_temporary_password,
    roles:                user.roles || [],
  };
}

/* ── POST /api/auth/login ── */
router.post("/login", loginLimiter, async (req, res) => {
  const pool = req.app.locals.pool;
  const { email, password } = req.body;

  if (!email || typeof email !== "string")
    return res.status(400).json({ success: false, message: "Email is required." });
  if (!password || typeof password !== "string")
    return res.status(400).json({ success: false, message: "Password is required." });

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return res.status(400).json({ success: false, message: "Invalid email format." });

  try {
    const user = await fetchUser(
      pool,
      "WHERE LOWER(u.email) = $1 AND u.account_status != 'DELETED'",
      [normalizedEmail]
    );

    // ── AUDIT: Login failed — user not found ────────────────────────
    if (!user) {
      await writeAuditLog(req, {
        actionType: "LOGIN_FAILED",
        entityType: "SESSION",
        status:     "FAILURE",
        message:    `Login attempt for unknown email: ${normalizedEmail}`,
        metadata:   { reason: "user_not_found", attempted_email: normalizedEmail },
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // ── AUDIT: Login failed — account inactive / suspended ─────────
    if (user.account_status !== "ACTIVE") {
      await writeAuditLog(req, {
        actionType:     "LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Login blocked for ${user.email} — account ${user.account_status}`,
        metadata:       { reason: "account_not_active", account_status: user.account_status },
      });
      return res.status(403).json({
        success: false,
        message: user.account_status === "INACTIVE"
          ? "Your account is inactive. Contact your administrator."
          : "Your account has been suspended. Contact your administrator.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    // ── AUDIT: Login failed — wrong password ────────────────────────
    if (!passwordMatch) {
      await writeAuditLog(req, {
        actionType:     "LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Failed login attempt for ${user.email} — incorrect password`,
        metadata:       { reason: "invalid_password" },
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Single session: wipe all previous sessions for this user
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);

    const rawRefreshToken = generateRefreshToken();
    const expiresAt       = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const { rows: [{ id: sessionId }] } = await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [user.id, hashToken(rawRefreshToken), expiresAt]
    );

    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

    // Elevate role if user has an active Nodal Officer delegation
    await enrichWithNodalOfficerRole(pool, user);

    // ── AUDIT: Login success ────────────────────────────────────────
    await writeAuditLog(req, {
      actionType:     "LOGIN_SUCCESS",
      entityType:     "SESSION",
      entityId:       user.id,
      overrideUserId: user.id,
      status:         "SUCCESS",
      message:        `${user.full_name} (${user.email}) signed in`,
      metadata:       {
        session_id:   sessionId,
        roles:        (user.roles || []).map((r) => r.name),
        institution:  user.institution_name || null,
      },
    });
    // ───────────────────────────────────────────────────────────────

    res.cookie("pm_refresh", rawRefreshToken, cookieOptions());

    return res.status(200).json({
      success:     true,
      message:     "Login successful.",
      accessToken: signAccessToken(buildAccessPayload(user, sessionId)),
      user:        buildUserObject(user),
    });

  } catch (err) {
    logger.error("POST /api/auth/login failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
});

/* ── POST /api/auth/refresh ── */
router.post("/refresh", refreshLimiter, async (req, res) => {
  const pool     = req.app.locals.pool;
  const rawToken = req.cookies.pm_refresh;

  if (!rawToken)
    return res.status(401).json({ success: false, message: "No session found." });

  const incomingHash = hashToken(rawToken);

  try {
    // ── Token reuse detection ───────────────────────────────────────
    const { rows: reuseRows } = await pool.query(
      "SELECT user_id FROM sessions WHERE previous_token_hash = $1",
      [incomingHash]
    );

    if (reuseRows.length) {
      // ── AUDIT: Security violation — token replay ──────────────────
      await writeAuditLog(req, {
        actionType:     "SESSION_TOKEN_REUSE",
        entityType:     "SESSION",
        entityId:       reuseRows[0].user_id,
        overrideUserId: reuseRows[0].user_id,
        status:         "FAILURE",
        message:        "Possible token theft detected — all sessions invalidated",
        metadata:       { reason: "refresh_token_reuse" },
      });
      // ─────────────────────────────────────────────────────────────
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [reuseRows[0].user_id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({
        success: false,
        message: "Security violation detected. Please sign in again.",
      });
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND u.account_status = 'ACTIVE'`,
      [incomingHash]
    );

    if (!rows.length)
      return res.status(401).json({ success: false, message: "Invalid session. Please sign in again." });

    const session = rows[0];

    if (new Date(session.expires_at) < new Date()) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({ success: false, expired: true, message: "Session expired. Please sign in again." });
    }

    const newRawToken  = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await pool.query(
      `UPDATE sessions
       SET token_hash = $1, previous_token_hash = $2, expires_at = $3, last_used_at = now()
       WHERE id = $4`,
      [hashToken(newRawToken), incomingHash, newExpiresAt, session.id]
    );

    const user = await fetchUser(pool, "WHERE u.id = $1", [session.user_id]);
    await enrichWithNodalOfficerRole(pool, user);

    res.cookie("pm_refresh", newRawToken, cookieOptions());

    return res.status(200).json({
      success:     true,
      accessToken: signAccessToken(buildAccessPayload(user, session.id)),
    });

  } catch (err) {
    logger.error("POST /api/auth/refresh failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/auth/me — restore session on page load ── */
router.get("/me", refreshLimiter, async (req, res) => {
  const pool     = req.app.locals.pool;
  const rawToken = req.cookies.pm_refresh;

  if (!rawToken)
    return res.status(401).json({ success: false, message: "No session found." });

  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at
       FROM sessions s
       WHERE s.token_hash = $1`,
      [hashToken(rawToken)]
    );

    if (!rows.length)
      return res.status(401).json({ success: false, message: "Session not found." });

    const session = rows[0];

    if (new Date(session.expires_at) < new Date()) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({ success: false, expired: true, message: "Session expired." });
    }

    await pool.query("UPDATE sessions SET last_used_at = now() WHERE id = $1", [session.id]);

    const user = await fetchUser(
      pool,
      "WHERE u.id = $1 AND u.account_status = 'ACTIVE'",
      [session.user_id]
    );

    if (!user) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({ success: false, expired: true, message: "Account is no longer active." });
    }

    await enrichWithNodalOfficerRole(pool, user);

    return res.status(200).json({
      success:     true,
      accessToken: signAccessToken(buildAccessPayload(user, session.id)),
      user:        buildUserObject(user),
    });

  } catch (err) {
    logger.error("GET /api/auth/me failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/auth/change-password ── */
const { verifyToken } = require("../middleware/auth");

router.post("/change-password", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword)
    return res.status(400).json({ success: false, message: "newPassword is required." });

  if (newPassword.length < 8)
    return res.status(400).json({ success: false, message: "New password must be at least 8 characters." });

  if (currentPassword === newPassword)
    return res.status(400).json({ success: false, message: "New password must differ from the current password." });

  try {
    const { rows } = await pool.query(
      "SELECT id, password_hash, is_temporary_password FROM users WHERE id = $1 AND account_status = 'ACTIVE'",
      [req.user.userId]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const dbUser = rows[0];

    if (!dbUser.is_temporary_password) {
      if (!currentPassword)
        return res.status(400).json({ success: false, message: "currentPassword is required." });

      const match = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!match)
        return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE users SET password_hash = $1, must_change_password = false, is_temporary_password = false WHERE id = $2",
      [newHash, req.user.userId]
    );

    const user = await fetchUser(pool, "WHERE u.id = $1", [req.user.userId]);

    return res.json({
      success: true,
      message: "Password changed successfully.",
      user: buildUserObject(user),
    });

  } catch (err) {
    logger.error("POST /api/auth/change-password failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/auth/logout ── */
router.post("/logout", async (req, res) => {
  const pool     = req.app.locals.pool;
  const rawToken = req.cookies.pm_refresh;

  if (rawToken) {
    try {
      // ── Look up session to get user info for audit before deleting ──
      const { rows } = await pool.query(
        `SELECT s.user_id, u.full_name, u.email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1`,
        [hashToken(rawToken)]
      );

      await pool.query(
        "DELETE FROM sessions WHERE token_hash = $1",
        [hashToken(rawToken)]
      );

      // ── AUDIT: Logout ─────────────────────────────────────────────
      if (rows.length) {
        const { user_id, full_name, email } = rows[0];
        await writeAuditLog(req, {
          actionType:     "LOGOUT",
          entityType:     "SESSION",
          entityId:       user_id,
          overrideUserId: user_id,
          status:         "SUCCESS",
          message:        `${full_name} (${email}) signed out`,
        });
      }
      // ─────────────────────────────────────────────────────────────
    } catch (_) {
      // Never let audit/session cleanup crash the logout response
    }
  }

  res.clearCookie("pm_refresh", { path: "/api/auth" });
  return res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;