/**
 * audit.js — Call this helper from any route to record an audit event.
 *
 * Usage:
 *   const { writeAuditLog } = require("../utils/audit");
 *
 *   await writeAuditLog(req, {
 *     actionType:    "USER_CREATED",
 *     entityType:    "USER",
 *     entityId:      newUser.id,
 *     newValue:      { email: newUser.email, full_name: newUser.full_name },
 *     status:        "SUCCESS",
 *     message:       `User ${newUser.email} created`,
 *   });
 */

/**
 * @param {import("express").Request} req
 * @param {{
 *   actionType:    string,
 *   entityType:    "USER"|"DEPARTMENT"|"INSTITUTION"|"ROLE"|"AUTH"|"SYSTEM"|"BILLING",
 *   entityId?:     string|null,
 *   oldValue?:     object|null,
 *   newValue?:     object|null,
 *   changedFields?: string[],
 *   status?:       "SUCCESS"|"FAILURE",
 *   message?:      string,
 *   metadata?:     object|null,
 * }} options
 */
async function writeAuditLog(req, options) {
  const pool = req.app.locals.pool;

  const {
    actionType,
    entityType,
    entityId = null,
    oldValue = null,
    newValue = null,
    changedFields = null,
    status = "SUCCESS",
    message = null,
    metadata = null,
  } = options;

  // Extract actor — set by authenticate middleware on req.user
  const userId = req.user?.userId || null;

  // Extract IP (respect X-Forwarded-For from proxies/nginx)
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers["user-agent"] || null;

  try {
    await pool.query(
      `INSERT INTO public.audit_logs
         (user_id, action_type, entity_type, entity_id,
          old_value, new_value, changed_fields,
          status, message, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        userId,
        actionType,
        entityType.toUpperCase(),
        entityId,
        oldValue  ? JSON.stringify(oldValue)  : null,
        newValue  ? JSON.stringify(newValue)  : null,
        changedFields,
        status,
        message,
        ip,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Never let audit failures crash the main request
    console.error("[AUDIT] Failed to write log:", err.message);
  }
}

module.exports = { writeAuditLog };