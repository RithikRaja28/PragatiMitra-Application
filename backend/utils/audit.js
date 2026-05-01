const logger = require("./logger");

/**
 * utils/audit.js
 *
 * Auto-captured from every request — no manual input ever needed:
 *   • ip_address   — real client IP, respects X-Forwarded-For / X-Real-IP
 *   • user_agent   — raw User-Agent header
 *   • browser_name — friendly label derived from User-Agent (no npm dependency)
 */

/* ─────────────────────────────────────────────────────────────
   parseBrowserName — zero-dependency UA parser
───────────────────────────────────────────────────────────── */
function parseBrowserName(ua = "") {
  if (!ua) return "Unknown";
  if (/Edg\//i.test(ua))            return "Microsoft Edge";
  if (/OPR\//i.test(ua))            return "Opera";
  if (/SamsungBrowser\//i.test(ua)) return "Samsung Browser";
  if (/UCBrowser\//i.test(ua))      return "UC Browser";
  if (/YaBrowser\//i.test(ua))      return "Yandex Browser";
  if (/Brave\//i.test(ua))          return "Brave";
  if (/Vivaldi\//i.test(ua))        return "Vivaldi";
  if (/CriOS\//i.test(ua))          return "Chrome (iOS)";
  if (/FxiOS\//i.test(ua))          return "Firefox (iOS)";
  if (/Chrome\//i.test(ua))         return "Chrome";
  if (/Firefox\//i.test(ua))        return "Firefox";
  if (/Safari\//i.test(ua))         return "Safari";
  if (/MSIE|Trident/i.test(ua))     return "Internet Explorer";
  if (/curl\//i.test(ua))           return "cURL";
  if (/PostmanRuntime/i.test(ua))   return "Postman";
  if (/insomnia\//i.test(ua))       return "Insomnia";
  if (/axios\//i.test(ua))          return "Axios";
  if (/node-fetch\//i.test(ua))     return "node-fetch";
  return "Unknown";
}

/* ─────────────────────────────────────────────────────────────
   writeAuditLog(req, options)
───────────────────────────────────────────────────────────── */
async function writeAuditLog(req, options) {
  const pool = req.app.locals.pool;

  const {
    actionType,
    entityType,
    entityId      = null,
    oldValue      = null,
    newValue      = null,
    changedFields = null,
    status        = "SUCCESS",
    message       = null,
    metadata      = null,
  } = options;

  const userId = req.user?.userId || null;

  // Real client IP — respects reverse-proxy headers
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.headers["x-real-ip"]                                     ||
    req.socket?.remoteAddress                                     ||
    null;

  const userAgent   = req.headers["user-agent"] || null;
  const browserName = parseBrowserName(userAgent);

  try {
    await pool.query(
      `INSERT INTO public.audit_logs
         (user_id, action_type, entity_type, entity_id,
          old_value, new_value, changed_fields,
          status, message, ip_address, user_agent, browser_name, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        userId,
        actionType,
        entityType.toUpperCase(),
        entityId,
        oldValue      ? JSON.stringify(oldValue)  : null,
        newValue      ? JSON.stringify(newValue)  : null,
        changedFields,
        status,
        message,
        ip,
        userAgent,
        browserName,
        metadata      ? JSON.stringify(metadata)  : null,
      ]
    );
  } catch (err) {
    // Never let audit failures crash the main request
    logger.error("Failed to write audit log", { stack: err.stack });
  }
}

module.exports = { writeAuditLog, parseBrowserName };