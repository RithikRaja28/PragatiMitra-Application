const express   = require("express");
const { v4: uuidv4 } = require("uuid");
const { getUploadUrl, getReadUrl } = require("../utils/s3");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;     // 10 MB

/**
 * POST /api/upload/presign
 * Body: { fileName, fileType, fileSize, folder? }
 * Returns: { uploadUrl, fileKey }
 *
 * Frontend uses uploadUrl to PUT the file directly to S3.
 * Store fileKey in your DB — use it later to get a read URL.
 */
router.post("/presign", verifyToken, async (req, res) => {
  const { fileName, fileType, fileSize, folder = "general" } = req.body;

  if (!fileName || !fileType || !fileSize) {
    return res.status(400).json({ error: "fileName, fileType, and fileSize are required." });
  }

  if (!ALLOWED_MIME_TYPES.includes(fileType)) {
    return res.status(400).json({ error: "File type not allowed." });
  }

  if (fileSize > MAX_FILE_SIZE) {
    return res.status(400).json({ error: "File size exceeds 10 MB limit." });
  }

  const ext     = fileName.split(".").pop().toLowerCase();
  const fileKey = `${folder}/${uuidv4()}.${ext}`;

  const uploadUrl = await getUploadUrl(fileKey, fileType);

  res.json({ uploadUrl, fileKey });
});

/**
 * POST /api/upload/read-url
 * Body: { fileKey }
 * Returns: { readUrl }
 *
 * Call this when you need to display/download a private file.
 * The URL expires in 15 minutes.
 */
router.post("/read-url", verifyToken, async (req, res) => {
  const { fileKey } = req.body;

  if (!fileKey) {
    return res.status(400).json({ error: "fileKey is required." });
  }

  const readUrl = await getReadUrl(fileKey);
  res.json({ readUrl });
});

module.exports = router;
