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
              u.institution_id,
              inst.status     AS inst_status,
              inst.deleted_at AS inst_deleted_at,
              CASE WHEN $1::uuid IS NULL THEN TRUE
                   ELSE EXISTS (SELECT 1 FROM sessions s WHERE s.id = $1 AND s.user_id = u.id)
              END AS session_ok,
              COALESCE(
                (SELECT array_agg(r.name)
                   FROM user_roles ur
                   JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id
                    AND ur.revoked_at IS NULL
                    AND (ur.expires_at IS NULL OR ur.expires_at > now())),
                ARRAY[]::text[]
              ) AS db_roles
         FROM users u
         LEFT JOIN institutions inst ON inst.institution_id = u.institution_id
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

    /* ── Bug 5: evaluate the CURRENT DB role on EVERY request ──────────────
       Authorization must reflect the live user_roles, not the login-time JWT
       snapshot. Re-read the base roles fresh here and overwrite the roles claim,
       so a downgrade/upgrade takes effect on the very next request — no logout,
       re-login, or token-expiry wait.

       NOA-derived roles (department_admin / institute_admin) are computed, not
       stored in user_roles, so re-apply them from the JWT's noaActiveYears (a
       Nodal Officer must keep their elevation). NOA *capability* changes are
       enforced separately via session revocation, so the JWT's NOA claims are
       authoritative within a live session. A query failure falls through to the
       catch below → 500 (deny), never a stale-role allow. */
    const dbRoles = rows[0].db_roles || [];
    req.user.dbRoles = dbRoles; // live DB roles only — never includes NOA-computed roles
    const roles = [...dbRoles];
    if (req.user.noaActiveYears?.length && !roles.includes("department_admin"))
      roles.unshift("department_admin");
    if (req.user.noaInstituteActiveYears?.length && !roles.includes("institute_admin"))
      roles.unshift("institute_admin");
    req.user.roles = roles;

    /* ── Bug 10: institution lifecycle gate (per-request) ──────────────────
       An institution is the parent owner of its users/forms/data. When it is
       archived (status != ACTIVE) or soft-deleted (deleted_at set), every user
       under it must stop operating IMMEDIATELY — login elsewhere, an open tab,
       a direct API call — exactly like a disabled user account. Super admins are
       system-level and exempt (they manage / restore institutions). A user with
       no institution (institution_id NULL) is unaffected. 401 reuses the client
       logout flow. */
    if (rows[0].institution_id && !roles.includes("super_admin")) {
      if (rows[0].inst_status !== "ACTIVE" || rows[0].inst_deleted_at) {
        return res.status(401).json({ success: false, disabled: true, message: "Your institution is no longer active. Please contact your administrator." });
      }
    }
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
