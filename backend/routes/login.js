const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});


function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    issuer: "pragatimitra-api",
    audience: "pragatimitra-app",
  });
}


router.post("/login", loginLimiter, async (req, res) => {
  const pool = req.app.locals.pool;

  /* 1. Basic input validation */
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ success: false, message: "Email is required." });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ success: false, message: "Password is required." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "Invalid email format." });
  }

  try {
    /* 2. Fetch user with role, college, department info */
    const { rows } = await pool.query(
  `SELECT
     u.user_id,
     u.email,
     u.password,
     u.first_name,
     u.last_name,
     u.user_name,
     u.must_change_password,
     u.status,
     u.role_id,
     u.college_id,
     u.department_id,
     u.year,
     u.profile_picture_url,
     r.role_name,
     c.college_name,
     d.name AS department_name
   FROM users u
   LEFT JOIN roles      r ON r.role_id       = u.role_id
   LEFT JOIN college    c ON c.college_id    = u.college_id
   LEFT JOIN department d ON d.department_id = u.department_id
   WHERE u.email = $1
   LIMIT 1`,
  [normalizedEmail]
);
   
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = rows[0];

   
   if (user.status.toUpperCase() !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message:
          user.status.toUpperCase() === "INACTIVE"
            ? "Your account is inactive. Contact your administrator."
            : "Your account has been suspended. Contact your administrator.",
      });
    }

    
   const passwordMatch = password === user.password;
if (!passwordMatch) {
  return res.status(401).json({
    success: false,
    message: "Invalid email or password.",
  });
}

    
    const tokenPayload = {
      userId: user.user_id,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name,
      collegeId: user.college_id,
      departmentId: user.department_id,
    };

    const token = signToken(tokenPayload);

    const safeUser = {
      userId: user.user_id,
      userName: user.user_name,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name,
      collegeId: user.college_id,
      collegeName: user.college_name,
      departmentId: user.department_id,
      departmentName: user.department_name,
      year: user.year,
      profilePictureUrl: user.profile_picture_url,
      mustChangePassword: user.must_change_password,
    };

    
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: safeUser,
    });

  } catch (err) {
    console.error("[LOGIN ERROR]", err.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred. Please try again.",
    });
  }
});


router.post("/logout", (req, res) => {
  return res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;