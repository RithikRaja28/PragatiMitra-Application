const express   = require("express");
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    issuer:   "pragatimitra-api",
    audience: "pragatimitra-app",
  });
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
         u.id,
         u.full_name,
         u.email,
         u.password_hash,
         u.must_change_password,
         u.account_status,
         u.profile_image_url,
         u.institution_id,
         u.department_id,
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
       WHERE LOWER(u.email) = $1
         AND u.account_status != 'DELETED'
       LIMIT 1`,
      [normalizedEmail]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const user = rows[0];

    if (user.account_status !== "ACTIVE") {
      const message =
        user.account_status === "INACTIVE"
          ? "Your account is inactive. Contact your administrator."
          : "Your account has been suspended. Contact your administrator.";
      return res.status(403).json({ success: false, message });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const { rows: vRows } = await pool.query(
      `UPDATE users
       SET token_version = token_version + 1, last_login_at = now()
       WHERE id = $1
       RETURNING token_version`,
      [user.id]
    );

    const token = signToken({
      userId:        user.id,
      email:         user.email,
      institutionId: user.institution_id,
      departmentId:  user.department_id,
      version:       vRows[0].token_version,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id:              user.id,
        fullName:        user.full_name,
        email:           user.email,
        institutionId:   user.institution_id,
        institutionName: user.institution_name,
        departmentId:    user.department_id,
        departmentName:  user.department_name,
        profileImageUrl: user.profile_image_url,
        mustChangePassword: user.must_change_password,
        roles:           user.roles,
      },
    });

  } catch (err) {
    console.error("[LOGIN ERROR]", err.message);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
});

/* ── GET /api/auth/me — verify token + return fresh user data ── */
router.get("/me", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.profile_image_url,
         u.must_change_password,
         u.institution_id,
         u.department_id,
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
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const u = rows[0];
    return res.status(200).json({
      success: true,
      user: {
        id:              u.id,
        fullName:        u.full_name,
        email:           u.email,
        institutionId:   u.institution_id,
        institutionName: u.institution_name,
        departmentId:    u.department_id,
        departmentName:  u.department_name,
        profileImageUrl: u.profile_image_url,
        mustChangePassword: u.must_change_password,
        roles:           u.roles,
      },
    });
  } catch (err) {
    console.error("[ME ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/auth/logout ── */
router.post("/logout", (_req, res) => {
  return res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;
