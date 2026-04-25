const express   = require("express");
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcrypt");
const crypto    = require("crypto");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

// Never store raw refresh tokens — SHA-256 hash before writing to DB
function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// HttpOnly cookie options — JS cannot read this token at all
function cookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   REFRESH_TOKEN_TTL_MS,
    path:     "/api/auth",
  };
}

async function fetchUser(pool, whereClause, params) {
  const { rows } = await pool.query(
    `SELECT
       u.id, u.email, u.full_name, u.password_hash,
       u.must_change_password, u.account_status,
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

function buildAccessPayload(user) {
  return {
    userId:        user.id,
    email:         user.email,
    institutionId: user.institution_id,
    departmentId:  user.department_id,
    roles:         (user.roles || []).map((r) => r.name),
  };
}

function buildUserObject(user) {
  return {
    id:                 user.id,
    fullName:           user.full_name,
    email:              user.email,
    institutionId:      user.institution_id,
    institutionName:    user.institution_name,
    departmentId:       user.department_id,
    departmentName:     user.department_name,
    profileImageUrl:    user.profile_image_url,
    mustChangePassword: user.must_change_password,
    roles:              user.roles || [],
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

    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    if (user.account_status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: user.account_status === "INACTIVE"
          ? "Your account is inactive. Contact your administrator."
          : "Your account has been suspended. Contact your administrator.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    // Single session: wipe all previous sessions for this user
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);

    const rawRefreshToken = generateRefreshToken();
    const expiresAt       = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(rawRefreshToken), expiresAt]
    );

    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

    // Refresh token goes in HttpOnly cookie — never exposed to JavaScript
    res.cookie("pm_refresh", rawRefreshToken, cookieOptions());

    return res.status(200).json({
      success:     true,
      message:     "Login successful.",
      accessToken: signAccessToken(buildAccessPayload(user)),
      user:        buildUserObject(user),
    });

  } catch (err) {
    console.error("[LOGIN ERROR]", err.message);
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
    // ── Token reuse detection ──────────────────────────────────────────────
    // If this hash matches a *previous* (already-rotated) token, someone is
    // replaying a stale token — possible theft. Nuke all sessions for the user.
    const { rows: reuseRows } = await pool.query(
      "SELECT user_id FROM sessions WHERE previous_token_hash = $1",
      [incomingHash]
    );

    if (reuseRows.length) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [reuseRows[0].user_id]);
      res.clearCookie("pm_refresh", { path: "/api/auth" });
      return res.status(401).json({
        success: false,
        message: "Security violation detected. Please sign in again.",
      });
    }
    // ──────────────────────────────────────────────────────────────────────

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

    // Rotate: issue new token, keep old hash as previous for next reuse check
    const newRawToken  = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await pool.query(
      `UPDATE sessions
       SET token_hash = $1, previous_token_hash = $2, expires_at = $3, last_used_at = now()
       WHERE id = $4`,
      [hashToken(newRawToken), incomingHash, newExpiresAt, session.id]
    );

    const user = await fetchUser(pool, "WHERE u.id = $1", [session.user_id]);

    res.cookie("pm_refresh", newRawToken, cookieOptions());

    return res.status(200).json({
      success:     true,
      accessToken: signAccessToken(buildAccessPayload(user)),
    });

  } catch (err) {
    console.error("[REFRESH ERROR]", err.message);
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

    return res.status(200).json({
      success:     true,
      accessToken: signAccessToken(buildAccessPayload(user)),
      user:        buildUserObject(user),
    });

  } catch (err) {
    console.error("[ME ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/auth/logout ── */
router.post("/logout", async (req, res) => {
  const pool     = req.app.locals.pool;
  const rawToken = req.cookies.pm_refresh;

  if (rawToken) {
    await pool.query(
      "DELETE FROM sessions WHERE token_hash = $1",
      [hashToken(rawToken)]
    ).catch(() => {});
  }

  res.clearCookie("pm_refresh", { path: "/api/auth" });
  return res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;
