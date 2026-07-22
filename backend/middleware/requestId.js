"use strict";

const { randomUUID } = require("crypto");

/**
 * Generates a unique UUID per request and attaches it to req.id.
 * Also sends it back as X-Request-Id response header for client-side tracing.
 * Must be the FIRST middleware mounted in server.js.
 */
function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}

module.exports = requestId;
