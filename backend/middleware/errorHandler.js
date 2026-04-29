"use strict";

const logger            = require("../utils/logger");
const { getLogContext } = require("../utils/logger");

/**
 * Global Express error handler — attach AFTER all routes in server.js.
 * Handles errors passed via next(err) or thrown inside async routes.
 *
 * Attach a custom errorCode to any Error before passing to next():
 *   const err = new Error("Not found"); err.errorCode = "RESOURCE_NOT_FOUND"; next(err);
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;

  logger.error(err.message || "Unhandled server error", {
    ...getLogContext(req),
    status,
    statusMessage: err.message || "Internal Server Error",
    errorCode:     err.errorCode || err.code || "INTERNAL_SERVER_ERROR",
    stack:         err.stack,
  });

  if (res.headersSent) return;

  res.status(status).json({ success: false, message: "Something went wrong." });
}

module.exports = errorHandler;
