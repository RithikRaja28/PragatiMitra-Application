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

  /* ── Account-lifecycle + session enforcement on EVERY protected request ──
     A valid token is not enough: the account must still be ACTIVE (not disabled,
     not deleted) and the issuing session must still exist. This makes a
     disable / delete / remote-logout take effect IMMEDIATELY on the next request
     instead of waiting for the 15-minute access token to expire.

     One combined query: the user's account_status + (when the token carries a
     sessionId) whether that session is still valid — so no extra DB round-trip
     versus the previous session-only check. */
  try {
    const pool = req.app.locals.pool;
    const { rows } = await pool.query(
      `SELECT u.account_status,
              CASE WHEN $1::uuid IS NULL THEN TRUE
                   ELSE EXISTS (SELECT 1 FROM sessions s WHERE s.id = $1 AND s.user_id = u.id)
              END AS session_ok
         FROM users u
        WHERE u.id = $2`,
      [req.user.sessionId || null, req.user.userId]
    );

    if (!rows.length)
      return res.status(401).json({ success: false, message: "Your account is no longer available. Please sign in again." });

    const status = rows[0].account_status;
    // Deleted / removed → treat as an invalid session (forces re-login).
    if (status === "DELETED")
      return res.status(401).json({ success: false, message: "Your account is no longer active. Please sign in again." });
    // Disabled (INACTIVE / SUSPENDED) → reject and force logout. 401 reuses the
    // existing client logout flow (apiFetch logs out on 401 with this message).
    if (status !== "ACTIVE")
      return res.status(401).json({ success: false, disabled: true, message: "Your account has been disabled. Please contact your administrator." });
    // A login elsewhere / remote logout invalidates this token immediately.
    if (rows[0].session_ok === false)
      return res.status(401).json({ success: false, message: "Session is no longer valid. Please sign in again." });
  } catch {
    return res.status(500).json({ success: false, message: "Internal server error." });
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
