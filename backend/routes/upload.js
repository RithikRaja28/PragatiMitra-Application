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

  // Permanent public URL — works when the S3 bucket has public-read ACL on the prefix
  const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

  res.json({ uploadUrl, fileKey, publicUrl });
});

/**
 * POST /api/upload/read-url
 * Body: { fileKey, expiresIn? }
 * Returns: { readUrl }
 *
 * expiresIn defaults to 604800 (7 days) for document images.
 * Use for private-bucket fallback when public URLs are not configured.
 */
router.post("/read-url", verifyToken, async (req, res) => {
  const { fileKey, expiresIn = 604800 } = req.body;

  if (!fileKey) {
    return res.status(400).json({ error: "fileKey is required." });
  }

  const readUrl = await getReadUrl(fileKey, Number(expiresIn));
  res.json({ readUrl });
});

module.exports = router;
