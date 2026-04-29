"use strict";

const logger             = require("../utils/logger");
const { getLogContext }  = require("../utils/logger");

/**
 * Logs every incoming HTTP request on response finish.
 * Depends on requestId middleware running first (req.id must exist).
 * Attach AFTER requestId but BEFORE route definitions in server.js.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    logger.info("HTTP request", {
      ...getLogContext(req),
      status:        res.statusCode,
      statusMessage: res.statusMessage || "",
      duration:      `${Date.now() - start}ms`,
    });
  });

  next();
}

module.exports = requestLogger;
