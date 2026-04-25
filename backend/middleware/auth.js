const jwt = require("jsonwebtoken");

async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   "pragatimitra-api",
      audience: "pragatimitra-app",
    });
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Session expired. Please sign in again."
        : "Invalid token. Please sign in again.";
    return res.status(401).json({ success: false, message });
  }

  try {
    const pool = req.app.locals.pool;
    const { rows } = await pool.query(
      `SELECT
         COALESCE(
           (SELECT array_agg(r.name)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
              AND ur.revoked_at IS NULL
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
           ), ARRAY[]::text[]
         ) AS role_names
       FROM users u
       WHERE u.id = $1 AND u.account_status = 'ACTIVE'`,
      [decoded.userId]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Account not found or inactive.",
      });
    }

    req.user = { ...decoded, roleNames: rows[0].role_names };
    next();
  } catch (err) {
    console.error("[AUTH MIDDLEWARE ERROR]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
}

// Pass allowed role machine-key names: requireRole(["super_admin", "institute_admin"])
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated." });
    }

    const userRoles = req.user.roleNames || [];
    const hasRole   = allowedRoles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

module.exports = { verifyToken, requireRole };
