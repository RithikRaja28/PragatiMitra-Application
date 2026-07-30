const express = require("express");
const fs = require("fs");
const path = require("path");
const { verifyAndDecodeFileToken, resolveSafePath, extInfo, signReadUrl } = require("../utils/localStorage");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/file/token?key=...
 * Generates a fresh AES-encrypted token URL for a known internal file key.
 * Only authenticated users can generate tokens.
 */
router.get("/token", verifyToken, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ success: false, message: "Missing key" });

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  // 2 hours expiry
  const url = signReadUrl(key, 2 * 60 * 60, baseUrl);
  return res.json({ success: true, url });
});

/**
 * GET /api/file/:token
 * Streams a private file using an opaque AES-encrypted token instead of query params.
 * This is public/unauthenticated because the token acts as the short-lived access pass.
 */
router.get("/:token", async (req, res) => {
  const { token } = req.params;

  const decoded = verifyAndDecodeFileToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired link." });
  }

  const { key } = decoded;

  let filePath;
  try {
    filePath = resolveSafePath(key);
  } catch {
    return res.status(400).json({ error: "Invalid file key." });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return res.status(404).json({ error: "File not found." });
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
