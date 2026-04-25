const express = require("express");
const jwt     = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto  = require("crypto");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "15m",
    issuer: "pragatimitra-api",
    audience: "pragatimitra-app",
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
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
    const { rows } = await pool.query(
      `SELECT
         u.user_id, u.email, u.password, u.first_name, u.last_name,
         u.user_name, u.must_change_password, u.status, u.role_id,
         u.college_id, u.department_id, u.year, u.profile_picture_url,
         r.role_name, c.college_name, d.name AS department_name
       FROM users u
       LEFT JOIN roles      r ON r.role_id      = u.role_id
       LEFT JOIN college    c ON c.college_id   = u.college_id
       LEFT JOIN department d ON d.department_id = u.department_id
       WHERE u.email = $1 LIMIT 1`,
      [normalizedEmail]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const user = rows[0];

    if (user.status.toUpperCase() !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: user.status.toUpperCase() === "INACTIVE"
          ? "Your account is inactive. Contact your administrator."
          : "Your account has been suspended. Contact your administrator.",
      });
    }

    if (password !== user.password)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    // Single session: remove existing session for this user
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [user.user_id]);

    // Create new session
    const refreshToken = generateRefreshToken();
    const expiresAt    = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, last_active)
       VALUES ($1, $2, $3, NOW())`,
      [user.user_id, refreshToken, expiresAt]
    );

    const accessToken = signAccessToken({
      userId:       user.user_id,
      email:        user.email,
      roleId:       user.role_id,
      roleName:     user.role_name,
      collegeId:    user.college_id,
      departmentId: user.department_id,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      accessToken,
      refreshToken,
      user: {
        userId:           user.user_id,
        userName:         user.user_name,
        firstName:        user.first_name,
        lastName:         user.last_name,
        email:            user.email,
        roleId:           user.role_id,
        roleName:         user.role_name,
        collegeId:        user.college_id,
        collegeName:      user.college_name,
        departmentId:     user.department_id,
        departmentName:   user.department_name,
        year:             user.year,
        profilePictureUrl: user.profile_picture_url,
        mustChangePassword: user.must_change_password,
      },
    });

  } catch (err) {
    console.error("[LOGIN ERROR]", err.message);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
});

/* ── POST /api/auth/refresh ── */
router.post("/refresh", async (req, res) => {
  const pool = req.app.locals.pool;
  const { refreshToken } = req.body;

  if (!refreshToken)
    return res.status(400).json({ success: false, message: "Refresh token required." });

  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.email, u.role_id, u.college_id, u.department_id, r.role_name
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE s.refresh_token = $1`,
      [refreshToken]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid session. Please sign in again." });

    const session = rows[0];
    const idleMs  = Date.now() - new Date(session.last_active).getTime();

    if (idleMs > 60 * 60 * 1000) {
      await pool.query("DELETE FROM sessions WHERE refresh_token = $1", [refreshToken]);
      return res.status(401).json({
        success: false, expired: true,
        message: "Session expired due to inactivity. Please sign in again.",
      });
    }

    await pool.query(
      "UPDATE sessions SET last_active = NOW() WHERE refresh_token = $1",
      [refreshToken]
    );

    const accessToken = signAccessToken({
      userId:       session.user_id,
      email:        session.email,
      roleId:       session.role_id,
      roleName:     session.role_name,
      collegeId:    session.college_id,
      departmentId: session.department_id,
    });

    return res.status(200).json({ success: true, accessToken });

  } catch (err) {
    console.error("[REFRESH ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/auth/me — restore session on page load ── */
router.get("/me", async (req, res) => {
  const pool = req.app.locals.pool;
  const { refreshToken } = req.query;

  if (!refreshToken)
    return res.status(401).json({ success: false, message: "No session found." });

  try {
    const { rows } = await pool.query(
      `SELECT s.last_active,
              u.user_id, u.user_name, u.first_name, u.last_name, u.email,
              u.role_id, u.college_id, u.department_id, u.year,
              u.profile_picture_url, u.must_change_password,
              r.role_name, c.college_name, d.name AS department_name
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN college c ON c.college_id = u.college_id
       LEFT JOIN department d ON d.department_id = u.department_id
       WHERE s.refresh_token = $1`,
      [refreshToken]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Session not found." });

    const session = rows[0];
    const idleMs  = Date.now() - new Date(session.last_active).getTime();

    if (idleMs > 60 * 60 * 1000) {
      await pool.query("DELETE FROM sessions WHERE refresh_token = $1", [refreshToken]);
      return res.status(401).json({ success: false, expired: true, message: "Session expired." });
    }

    await pool.query(
      "UPDATE sessions SET last_active = NOW() WHERE refresh_token = $1",
      [refreshToken]
    );

    const accessToken = signAccessToken({
      userId:       session.user_id,
      email:        session.email,
      roleId:       session.role_id,
      roleName:     session.role_name,
      collegeId:    session.college_id,
      departmentId: session.department_id,
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        userId:            session.user_id,
        userName:          session.user_name,
        firstName:         session.first_name,
        lastName:          session.last_name,
        email:             session.email,
        roleId:            session.role_id,
        roleName:          session.role_name,
        collegeId:         session.college_id,
        collegeName:       session.college_name,
        departmentId:      session.department_id,
        departmentName:    session.department_name,
        year:              session.year,
        profilePictureUrl: session.profile_picture_url,
        mustChangePassword: session.must_change_password,
      },
    });

  } catch (err) {
    console.error("[ME ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/auth/logout ── */
router.post("/logout", async (req, res) => {
  const pool = req.app.locals.pool;
  const { refreshToken } = req.body;
  if (refreshToken) {
    await pool.query("DELETE FROM sessions WHERE refresh_token = $1", [refreshToken]);
  }
  return res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;