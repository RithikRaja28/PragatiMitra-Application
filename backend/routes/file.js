const express = require("express");
const fs = require("fs");
const path = require("path");
const { verifyAndDecodeFileToken, resolveSafePath, extInfo } = require("../utils/localStorage");

const router = express.Router();

/**
 * GET /api/file/:token
 * Streams a private file using an opaque AES-encrypted token instead of query params.
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
