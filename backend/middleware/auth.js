const jwt = require("jsonwebtoken");

// Pure JWT verification — zero DB hits.
// Role checks use claims embedded in the token at login time.
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "Access denied. No token provided." });

  const token = authHeader.split(" ")[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   "pragatimitra-api",
      audience: "pragatimitra-app",
    });
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError"
      ? "Session expired. Please sign in again."
      : "Invalid token. Please sign in again.";
    return res.status(401).json({ success: false, message });
  }
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
