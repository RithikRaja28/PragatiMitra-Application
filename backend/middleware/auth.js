const jwt = require("jsonwebtoken");

async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "Access denied. No token provided." });

  const token = authHeader.split(" ")[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   "pragatimitra-api",
      audience: "pragatimitra-app",
    });
  } catch (err) {
    const message = err.name === "TokenExpiredError"
      ? "Session expired. Please sign in again."
      : "Invalid token. Please sign in again.";
    return res.status(401).json({ success: false, message });
  }

  // Verify the session that issued this token still exists.
  // This ensures a login on another device immediately invalidates this token.
  if (req.user.sessionId) {
    try {
      const pool = req.app.locals.pool;
      const { rows } = await pool.query(
        "SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2",
        [req.user.sessionId, req.user.userId]
      );
      if (!rows.length)
        return res.status(401).json({ success: false, message: "Session is no longer valid. Please sign in again." });
    } catch {
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
  }

  next();
}

// Pass machine key role names: requireRole(["super_admin", "institute_admin"])
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthenticated." });

    const userRoles = new Set(req.user.roles || []);
    if (!allowedRoles.some((r) => userRoles.has(r)))
      return res.status(403).json({ success: false, message: "You do not have permission to access this resource." });

    next();
  };
}

module.exports = { verifyToken, requireRole };
