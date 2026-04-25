const jwt = require("jsonwebtoken");

/**
 * verifyToken — Express middleware
 * Validates Bearer JWT on protected routes.
 *
 * Usage:
 *   const { verifyToken, requireRole } = require("./middleware/auth");
 *   router.get("/dashboard", verifyToken, requireRole(["admin"]), handler);
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "pragatimitra-api",
      audience: "pragatimitra-app",
    });

    // Attach decoded payload to request for downstream use
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please sign in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token. Please sign in again.",
    });
  }
}

/**
 * requireRole — role-based access guard
 * Pass an array of allowed role names.
 *
 * Example: requireRole(["admin", "faculty"])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated." });
    }

    const userRole = (req.user.roleName || "").toLowerCase();
    const allowed  = allowedRoles.map((r) => r.toLowerCase());

    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

module.exports = { verifyToken, requireRole };