"use strict";

const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const fs   = require("fs");

const { combine, timestamp, json, errors, colorize, printf } = format;

const LOG_DIR      = path.join(__dirname, "../logs");
const IS_DEV       = process.env.NODE_ENV !== "production";
const SERVICE_NAME = process.env.SERVICE_NAME || "pragatimitra-api";

// Ensure the logs directory exists before Winston tries to write
fs.mkdirSync(LOG_DIR, { recursive: true });

/* ── Sensitive-key scrubber ─────────────────────────────────────
   Used for both objects (scrub) and request bodies (scrubBody).
   Keys are matched case-insensitively. Values are replaced with
   "[REDACTED]" so the key still appears in the log.
─────────────────────────────────────────────────────────────── */
const SENSITIVE = new Set([
  "password", "password_hash", "newpassword", "currentpassword",
  "token", "accesstoken", "refreshtoken", "pm_refresh", "jwt",
  "authorization", "secret", "credential", "credentials",
  "cookie", "set-cookie", "apikey", "api_key", "privatekey",
]);

function scrub(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE.has(k.toLowerCase()) ? "[REDACTED]" : scrub(v, depth + 1);
  }
  return out;
}

/**
 * scrubBody — safe subset of req.body for logging.
 * Returns null for non-object bodies (e.g., file uploads, empty bodies).
 */
function scrubBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return scrub(body);
}

/**
 * getLogContext — extracts ALL standard fields from an Express request.
 * Both requestLogger and errorHandler call this to guarantee consistency.
 *
 * @param {import("express").Request} req
 * @returns {object}
 */
function getLogContext(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.ip ||
    null;

  return {
    requestId: req.id          || null,
    service:   SERVICE_NAME,
    env:       process.env.NODE_ENV || "development",
    method:    req.method      || null,
    route:     req.originalUrl || null,
    ip,
    userId:    req.user?.userId || null,
    username:  req.user?.email  || null,
    query:     Object.keys(req.query  || {}).length ? req.query  : null,
    body:      scrubBody(req.body),
    referer:   req.headers?.referer || null,
    host:      req.headers?.host    || null,
    userAgent: req.headers?.["user-agent"] || "",
  };
}

/* ── Base JSON format (all file transports) ─────────────────── */
const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
  errors({ stack: true }),
  json()
);

/* ── Logger instance ────────────────────────────────────────── */
const logger = createLogger({
  level:       process.env.LOG_LEVEL || (IS_DEV ? "debug" : "info"),
  format:      fileFormat,
  exitOnError: false,
  transports: [
    // Error-only — append, never truncated
    new transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level:    "error",
      options:  { flags: "a" },
    }),

    // All levels combined — append
    new transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
      options:  { flags: "a" },
    }),

    // Daily rotating — keep 14 days, gzip old files
    new transports.DailyRotateFile({
      filename:      path.join(LOG_DIR, "app-%DATE%.log"),
      datePattern:   "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles:      "14d",
      options:       { flags: "a" },
    }),
  ],
});

/* ── Development: pretty console output ─────────────────────── */
if (IS_DEV) {
  logger.add(
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "HH:mm:ss" }),
        printf(({ timestamp, level, message, stack, ...meta }) => {
          const extra = Object.keys(meta).length
            ? " " + JSON.stringify(meta)
            : "";
          return `${timestamp} [${level}] ${message}${stack ? "\n" + stack : ""}${extra}`;
        })
      ),
    })
  );
}

module.exports              = logger;
module.exports.scrub        = scrub;
module.exports.scrubBody    = scrubBody;
module.exports.getLogContext = getLogContext;
module.exports.SERVICE_NAME  = SERVICE_NAME;
