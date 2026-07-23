"use strict";

/**
 * routes/publicFiles.js
 * Mount: app.use("/uploads", require("./routes/publicFiles"))
 *
 * Serves the subset of uploaded files that are meant to be publicly fetchable
 * by plain URL (branding assets, report-builder inline images, template
 * images) — everything else under uploads/ (generated reports, submission
 * files, institute/department form uploads) stays private, reachable only via
 * the signed GET /api/upload/file route. Replaces the old flat
 * express.static("/uploads/public", ...) mount, which can't work now that
 * public assets are nested under dynamic per-institute/per-report folders.
 *
 * Not behind verifyToken: must work for plain browser navigation / <img src>,
 * which cannot carry an Authorization header — access control here is the
 * isPublicKey() allowlist below, not auth.
 */

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const { resolveSafePath, extInfo } = require("../utils/localStorage");

const router = express.Router();

function isPublicKey(key) {
  return key.includes("/branding/")
    || key.includes("/submissions/images/")
    || (key.includes("/templates/") && key.includes("/images/"));
}

router.get("/*splat", (req, res) => {
  const key = Array.isArray(req.params.splat) ? req.params.splat.join("/") : req.params.splat;
  if (!key || !isPublicKey(key)) {
    return res.status(404).json({ error: "Not found." });
  }

  let filePath;
  try {
    filePath = resolveSafePath(key);
  } catch {
    return res.status(400).json({ error: "Invalid file key." });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return res.status(404).json({ error: "Not found." });
    }

    const { mime, inline } = extInfo(key);
    const filename = path.basename(key);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  });
});

module.exports = router;
