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

const superAdminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many reset requests. Try again after 15 minutes." },
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
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // When the frontend and backend are on different domains (separate hosting),
    // the refresh cookie is cross-site, so production needs SameSite=None +
    // Secure or the browser drops it (login appears to work but refresh fails).
    // Local dev stays same-site → keep the stricter "strict" + non-secure.
    secure:   isProd,
    sameSite: isProd ? "none" : "strict",
    maxAge:   REFRESH_TOKEN_TTL_MS,
    path:     "/api/auth",
  };
}

/**
 * enrichWithNodalOfficerRole
 *
 * Reads the nodal_officer_assignments table and attaches NOA metadata to the
 * in-memory user object.  The user's original role in user_roles is NEVER
 * modified — neither in the database nor in user.roles.
 *
 * Side-effects on the in-memory user object only (discarded after response):
 *   noa_active_years    — all reporting_year strings with is_active=TRUE
 *   noa_institution_id  — institution of the most recent active assignment
 *   noa_department_id   — department of the most recent active assignment
 *   noa_department_name — name of that department
 *
 * buildAccessPayload uses noa_active_years to add "department_admin" to the
 * JWT roles claim (a computed permission, not a DB role) so existing
 * requireRole / isDeptAdmin checks work for NOA users without any route changes.
 *
 * buildUserObject does NOT expose noa_* fields in the roles array; it only
 * adds noaActiveYears so the frontend can switch dashboards on year change.
 *
 * Fails silently — must never block authentication.
 */
async function enrichWithNodalOfficerRole(pool, user) {
  if (!user) return;
  try {
    const [deptResult, instResult] = await Promise.all([
      // Department-level NOA assignments
      pool.query(
        `SELECT
           noa.institution_id,
           noa.department_id,
           noa.reporting_year,
           d.name AS department_name
         FROM nodal_officer_assignments noa
         JOIN departments d ON d.department_id = noa.department_id
         WHERE noa.user_id       = $1
           AND noa.is_active     = TRUE
           AND noa.department_id IS NOT NULL
         ORDER BY noa.reporting_year DESC`,
        [user.id]
      ),
      // Institute-level NOA assignments (department_id = NULL)
      pool.query(
        `SELECT institution_id, reporting_year
         FROM nodal_officer_assignments
         WHERE user_id       = $1
           AND is_active     = TRUE
           AND department_id IS NULL
         ORDER BY reporting_year DESC`,
        [user.id]
      ),
    ]);

    if (deptResult.rows.length) {
      user.noa_active_years    = deptResult.rows.map((r) => r.reporting_year);
      user.noa_institution_id  = deptResult.rows[0].institution_id;
      user.noa_department_id   = deptResult.rows[0].department_id;
      user.noa_department_name = deptResult.rows[0].department_name;
    }

    if (instResult.rows.length) {
      user.noa_institute_active_years   = instResult.rows.map((r) => r.reporting_year);
      user.noa_institute_institution_id = instResult.rows[0].institution_id;
    }
  } catch (_) {
    // Silently swallow — must never block login
  }
}

async function fetchUser(pool, whereClause, params) {
  const { rows } = await pool.query(
    `SELECT
       u.id, u.email, u.full_name, u.password_hash,
       u.must_change_password, u.is_temporary_password, u.account_status,
       u.institution_id, u.department_id, u.profile_image_url,
       COALESCE(u.role_domain, 'academic') AS role_domain,
       i.institution_name,
       i.status     AS institution_status,
       i.deleted_at AS institution_deleted_at,
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

/* Bug 10 — institution lifecycle gate. A non-super-admin whose institution is
   archived (status != ACTIVE) or soft-deleted (deleted_at set) cannot sign in or
   restore a session — the institution is the parent owner, so its state cascades
   to every user under it. Super admins (system-level) and users with no
   institution are exempt. Mirrors the per-request gate in middleware/auth.js. */
function institutionGateBlocked(user) {
  const isSuperAdmin = (user.roles || []).some((r) => (r?.name || r) === "super_admin");
  if (isSuperAdmin || !user.institution_id) return false;
  return user.institution_status !== "ACTIVE" || !!user.institution_deleted_at;
}

function buildAccessPayload(user, sessionId) {
  const isDeptNOA     = !!(user.noa_active_years?.length);
  const isInstNOA     = !!(user.noa_institute_active_years?.length);
  const originalRoles = (user.roles || []).map((r) => r.name);

  // Inject NOA-derived roles into the JWT without touching user_roles in DB.
  const roles = [...originalRoles];
  if (isDeptNOA && !originalRoles.includes("department_admin"))
    roles.unshift("department_admin");
  if (isInstNOA && !originalRoles.includes("institute_admin"))
    roles.unshift("institute_admin");

  return {
    userId:                  user.id,
    email:                   user.email,
    // Use dept-NOA context for departmentId; inst-level NOA keeps original institution_id.
    institutionId:           isDeptNOA ? user.noa_institution_id : user.institution_id,
    departmentId:            isDeptNOA ? user.noa_department_id  : user.department_id,
    roles,
    // Domain (academic|hospital|finance) drives shell + form visibility. Default academic.
    roleDomain:              user.role_domain || "academic",
    noaActiveYears:          user.noa_active_years         || [],
    noaInstituteActiveYears: user.noa_institute_active_years || [],
    sessionId,
  };
}

function buildUserObject(user) {
  const isDeptNOA = !!(user.noa_active_years?.length);
  return {
    id:                      user.id,
    fullName:                user.full_name,
    email:                   user.email,
    institutionId:           isDeptNOA ? user.noa_institution_id  : user.institution_id,
    institutionName:         user.institution_name,
    departmentId:            isDeptNOA ? user.noa_department_id   : user.department_id,
    departmentName:          isDeptNOA ? user.noa_department_name : user.department_name,
    profileImageUrl:         user.profile_image_url,
    mustChangePassword:      user.must_change_password,
    isTemporaryPassword:     user.is_temporary_password,
    // Domain (academic|hospital|finance) — drives which shell/dashboard loads.
    roleDomain:              user.role_domain || "academic",
    // Original roles from user_roles — NEVER includes NOA-derived roles.
    roles:                   user.roles || [],
    // Years for which user has an active dept-level NOA assignment.
    noaActiveYears:          user.noa_active_years         || [],
    // Years for which user has an active institute-level NOA assignment.
    noaInstituteActiveYears: user.noa_institute_active_years || [],
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

    // ── Bug 10: institution archived / deleted → block login ──────────
    if (institutionGateBlocked(user)) {
      await writeAuditLog(req, {
        actionType:     "LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Login blocked for ${user.email} — institution ${user.institution_deleted_at ? "deleted" : user.institution_status}`,
        metadata:       { reason: "institution_not_active", institution_status: user.institution_status },
      });
      return res.status(403).json({ success: false, message: "Your institution is no longer active. Please contact your administrator." });
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

/* ── POST /api/auth/super-admin/register ──
   Creates a new super admin account.
   Protected by SUPER_ADMIN_SETUP_KEY from .env so only authorised
   personnel (who know the key) can register a super admin account. ── */
router.post("/super-admin/register", superAdminLoginLimiter, async (req, res) => {
  const pool = req.app.locals.pool;
  const { fullName, email, password, setupKey } = req.body;

  // Validate setup key first — fail fast before touching the DB
  const expectedKey = process.env.SUPER_ADMIN_SETUP_KEY;
  if (!expectedKey || setupKey !== expectedKey)
    return res.status(403).json({ success: false, message: "Invalid setup key." });

  if (!fullName || typeof fullName !== "string" || !fullName.trim())
    return res.status(400).json({ success: false, message: "Full name is required." });
  if (!email || typeof email !== "string")
    return res.status(400).json({ success: false, message: "Email is required." });
  if (!password || typeof password !== "string")
    return res.status(400).json({ success: false, message: "Password is required." });
  if (password.length < 8)
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return res.status(400).json({ success: false, message: "Invalid email format." });

  try {
    // Check email is not already taken
    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [normalizedEmail]
    );
    if (existing.length)
      return res.status(409).json({ success: false, message: "An account with this email already exists." });

    // Resolve super_admin role
    const { rows: roleRows } = await pool.query(
      "SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1"
    );
    if (!roleRows.length)
      return res.status(500).json({ success: false, message: "Super admin role not configured." });

    const superAdminRoleId = roleRows[0].id;
    const passwordHash     = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    let newUserId;
    try {
      await client.query("BEGIN");

      const { rows: [{ id }] } = await client.query(
        `INSERT INTO users
           (full_name, email, password_hash, account_status, must_change_password, is_temporary_password)
         VALUES ($1, $2, $3, 'ACTIVE', false, false)
         RETURNING id`,
        [fullName.trim(), normalizedEmail, passwordHash]
      );
      newUserId = id;

      await client.query(
        "INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $1)",
        [newUserId, superAdminRoleId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType:     "SUPER_ADMIN_REGISTERED",
      entityType:     "USER",
      entityId:       newUserId,
      overrideUserId: newUserId,
      status:         "SUCCESS",
      message:        `Super admin account created for ${normalizedEmail}`,
    });

    return res.status(201).json({
      success: true,
      message: "Super admin account created successfully. You can now sign in.",
    });

  } catch (err) {
    logger.error("POST /api/auth/super-admin/register failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
});

/* ── POST /api/auth/super-admin/login ── */
router.post("/super-admin/login", superAdminLoginLimiter, async (req, res) => {
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

    if (!user) {
      await writeAuditLog(req, {
        actionType: "SUPER_ADMIN_LOGIN_FAILED",
        entityType: "SESSION",
        status:     "FAILURE",
        message:    `Super admin portal login attempt for unknown email: ${normalizedEmail}`,
        metadata:   { reason: "user_not_found", attempted_email: normalizedEmail },
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (user.account_status !== "ACTIVE") {
      await writeAuditLog(req, {
        actionType:     "SUPER_ADMIN_LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Super admin portal login blocked for ${user.email} — account ${user.account_status}`,
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

    if (!passwordMatch) {
      await writeAuditLog(req, {
        actionType:     "SUPER_ADMIN_LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Failed super admin portal login for ${user.email} — incorrect password`,
        metadata:       { reason: "invalid_password" },
      });
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Role gate: must have super_admin before any session is created
    const isSuperAdmin = (user.roles || []).some((r) => (r?.name || r) === "super_admin");

    if (!isSuperAdmin) {
      await writeAuditLog(req, {
        actionType:     "SUPER_ADMIN_LOGIN_FAILED",
        entityType:     "SESSION",
        entityId:       user.id,
        overrideUserId: user.id,
        status:         "FAILURE",
        message:        `Unauthorized super admin portal access by ${user.email} (insufficient role)`,
        metadata:       {
          reason:       "insufficient_role",
          actual_roles: (user.roles || []).map((r) => r.name),
        },
      });
      return res.status(403).json({
        success: false,
        message: "Access denied. This portal is restricted to Super Administrators.",
      });
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

    await enrichWithNodalOfficerRole(pool, user);

    await writeAuditLog(req, {
      actionType:     "SUPER_ADMIN_LOGIN_SUCCESS",
      entityType:     "SESSION",
      entityId:       user.id,
      overrideUserId: user.id,
      status:         "SUCCESS",
      message:        `Super admin ${user.full_name} (${user.email}) signed in via super admin portal`,
      metadata:       {
        session_id: sessionId,
        roles:      (user.roles || []).map((r) => r.name),
      },
    });

    res.cookie("pm_refresh", rawRefreshToken, cookieOptions());

    return res.status(200).json({
      success:     true,
      message:     "Login successful.",
      accessToken: signAccessToken(buildAccessPayload(user, sessionId)),
      user:        buildUserObject(user),
    });

  } catch (err) {
    logger.error("POST /api/auth/super-admin/login failed", { ...getLogContext(req), stack: err.stack });
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

    // ── Bug 10: institution archived / deleted → kill session, force re-login ──
    if (institutionGateBlocked(user)) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({ success: false, disabled: true, message: "Your institution is no longer active. Please contact your administrator." });
    }

    res.cookie("pm_refresh", newRawToken, cookieOptions());

    // Return user alongside the new token so AuthContext can update noaActiveYears
    // immediately (e.g. when an admin enables/disables a NOA assignment).
    return res.status(200).json({
      success:     true,
      accessToken: signAccessToken(buildAccessPayload(user, session.id)),
      user:        buildUserObject(user),
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

    // ── Bug 10: institution archived / deleted → session no longer valid ──
    if (institutionGateBlocked(user)) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({ success: false, disabled: true, message: "Your institution is no longer active. Please contact your administrator." });
    }

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

    await writeAuditLog(req, {
      actionType:    "PASSWORD_CHANGED",
      entityType:    "USER",
      entityId:      user.id,
      changedFields: ["password"],
      status:        "SUCCESS",
      message:       `User "${user.full_name}" (${user.email}) changed their account password`,
      metadata:      { was_temporary_password: dbUser.is_temporary_password },
    });

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

/* ── POST /api/auth/forgot-password ──
   Generates a single-use 1-hour reset token and queues the reset email.
   Always returns the same success message to prevent email enumeration. ── */
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const pool = req.app.locals.pool;
  const { email } = req.body;

  const safeSuccess = () => res.json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
  });

  if (!email || typeof email !== "string")
    return res.status(400).json({ success: false, message: "Email is required." });

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT id, full_name, email, account_status FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (!rows.length || rows[0].account_status !== "ACTIVE") {
      await writeAuditLog(req, {
        actionType: "PASSWORD_RESET_REQUESTED",
        entityType: "USER",
        entityId:   null,
        status:     "FAILURE",
        message:    `Reset requested for ${normalizedEmail} — not found or inactive`,
        metadata:   { email: normalizedEmail },
      });
      return safeSuccess();
    }

    const user = rows[0];

    // Invalidate any outstanding unused tokens for this user before issuing a new one.
    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()`,
      [user.id]
    );

    const rawToken  = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${process.env.APP_RESET_URL || "http://localhost:5173/reset-password"}?token=${rawToken}`;

    const { enqueueEmail } = require("../services/mailService");
    await enqueueEmail(pool, {
      eventId:         "password_reset",
      recipientEmail:  user.email,
      recipientUserId: user.id,
      payload: { full_name: user.full_name, reset_url: resetUrl },
    });

    await writeAuditLog(req, {
      actionType: "PASSWORD_RESET_REQUESTED",
      entityType: "USER",
      entityId:   user.id,
      status:     "SUCCESS",
      message:    `Password reset email queued for ${user.email}`,
    });

    return safeSuccess();
  } catch (err) {
    logger.error("POST /api/auth/forgot-password failed", { ...getLogContext(req), stack: err.stack });
    return safeSuccess(); // still return success to prevent enumeration
  }
});

/* ── POST /api/auth/reset-password ──
   Validates token, sets new password, marks token consumed — all in one transaction. ── */
router.post("/reset-password", async (req, res) => {
  const pool = req.app.locals.pool;
  const { token, newPassword } = req.body;

  if (!token || typeof token !== "string")
    return res.status(400).json({ success: false, message: "Reset token is required." });
  if (!newPassword || typeof newPassword !== "string")
    return res.status(400).json({ success: false, message: "New password is required." });
  if (newPassword.length < 8)
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

  try {
    const tokenHash = hashToken(token.trim());

    const { rows } = await pool.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at,
              u.email, u.full_name, u.account_status
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (!rows.length)
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });

    const rec = rows[0];

    if (rec.used_at)
      return res.status(400).json({ success: false, message: "This reset link has already been used." });
    if (new Date(rec.expires_at) < new Date())
      return res.status(400).json({ success: false, message: "This reset link has expired. Please request a new one." });
    if (rec.account_status !== "ACTIVE")
      return res.status(403).json({ success: false, message: "This account is not active." });

    const newHash = await bcrypt.hash(newPassword, 12);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users
         SET password_hash = $1, must_change_password = false, is_temporary_password = false
         WHERE id = $2`,
        [newHash, rec.user_id]
      );
      await client.query(
        `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
        [rec.id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType:     "PASSWORD_RESET_COMPLETED",
      entityType:     "USER",
      entityId:       rec.user_id,
      overrideUserId: rec.user_id,
      status:         "SUCCESS",
      message:        `Password successfully reset for ${rec.email}`,
    });

    return res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) {
    logger.error("POST /api/auth/reset-password failed", { ...getLogContext(req), stack: err.stack });
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