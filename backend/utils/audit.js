"use strict";

/**
 * utils/audit.js
 *
 * FIX 1: audit_logs.entity_id column is type UUID in PostgreSQL.
 *         management_committees.id is a plain INTEGER (SERIAL).
 *         Passing an integer string like "1" into a UUID column throws:
 *           "invalid input syntax for type uuid: '1'"
 *
 * FIX 2: Login/logout routes run before JWT auth middleware, so req.user
 *         is null and userId resolves to null → actor shows as "System".
 *         Solution: accept an optional `overrideUserId` field in options.
 *         When provided it takes priority over req.user?.userId.
 *         Login route passes the resolved user's ID directly.
 */

const logger = require("./logger");

/* ─────────────────────────────────────────────────────────────
   UUID validation
───────────────────────────────────────────────────────────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  if (!value) return false;
  return UUID_RE.test(String(value));
}

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

   options.overrideUserId — pass the real user UUID when req.user
   is not populated (e.g. login/logout routes that run before the
   verifyToken middleware).  Takes priority over req.user?.userId.
───────────────────────────────────────────────────────────── */
async function writeAuditLog(req, options) {
  const pool = req.app.locals.pool;

  const {
    actionType,
    entityType,
    entityId        = null,
    oldValue        = null,
    newValue        = null,
    changedFields   = null,
    status          = "SUCCESS",
    message         = null,
    metadata        = null,
    // ── NEW: explicit user override for pre-auth routes ────────
    overrideUserId  = null,
  } = options;

  // overrideUserId wins; fall back to JWT-populated req.user
  const userId = overrideUserId || req.user?.userId || null;

  // Real client IP — respects reverse-proxy headers
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.headers["x-real-ip"]                                     ||
    req.socket?.remoteAddress                                     ||
    null;

  const userAgent   = req.headers["user-agent"] || null;
  const browserName = parseBrowserName(userAgent);

  // entity_id column is UUID — non-UUID values go into metadata.entity_ref
  const safeEntityId = isUuid(entityId) ? entityId : null;

  let finalMetadata = metadata ? { ...metadata } : {};
  if (entityId !== null && entityId !== undefined && !isUuid(entityId)) {
    finalMetadata.entity_ref = String(entityId);
  }
  const metadataJson = Object.keys(finalMetadata).length
    ? JSON.stringify(finalMetadata)
    : null;

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
        entityType ? entityType.toUpperCase() : null,
        safeEntityId,
        oldValue      ? JSON.stringify(oldValue)  : null,
        newValue      ? JSON.stringify(newValue)  : null,
        changedFields ? changedFields             : null,
        status,
        message,
        ip,
        userAgent,
        browserName,
        metadataJson,
      ]
    );
  } catch (err) {
    logger.error("Failed to write audit log", {
      actionType,
      entityType,
      entityId,
      errCode:    err.code,
      errMessage: err.message,
      stack:      err.stack,
    });
  }
}

module.exports = { writeAuditLog, parseBrowserName };