const express   = require("express");
const { v4: uuidv4 } = require("uuid");
const { getUploadUrl, getReadUrl, uploadBuffer } = require("../utils/s3");
const { verifyToken } = require("../middleware/auth");
const logger  = require("../utils/logger");
const multer  = require("multer");
const path    = require("path");

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

/* ── Memory storage for document uploads — file is streamed to S3 ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed."));
  },
});

/**
 * POST /api/upload/presign
 * Body: { fileName, fileType, fileSize, folder? }
 * Returns: { uploadUrl, fileKey }
 *
 * Frontend uses uploadUrl to PUT the file through the backend into local storage.
 * Store fileKey in your DB — use it later to get a local read URL.
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

  try {
    const uploadUrl = await getUploadUrl(fileKey, fileType);
    const publicUrl = await getReadUrl(fileKey);
    res.json({ uploadUrl, fileKey, publicUrl });
  } catch (err) {
    logger.error("[upload/presign] Failed to generate local upload URL", { message: err.message, code: err?.Code || err?.code });
    res.status(500).json({ error: "Failed to generate local upload URL." });
  }
});

router.put("/local-upload/*fileKey", verifyToken, express.raw({ type: () => true, limit: MAX_FILE_SIZE }), async (req, res) => {
  const rawKey = Array.isArray(req.params.fileKey) ? req.params.fileKey.join("/") : req.params.fileKey;
  const fileKey = String(rawKey || "");
  const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim();

  if (!fileKey || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: "Invalid file key or file type." });
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "No file received." });
  }

  try {
    await uploadBuffer(fileKey, req.body, mimeType);
    return res.json({ success: true, fileKey });
  } catch (err) {
    logger.error("[upload/local-upload] Local upload failed", { message: err.message });
    return res.status(500).json({ error: "Unable to save file locally." });
  }
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

  try {
    const readUrl = await getReadUrl(fileKey, Number(expiresIn));
    res.json({ readUrl });
  } catch (err) {
    logger.error("[upload/read-url] Failed to generate read URL", { message: err.message, code: err?.Code || err?.code });
    res.status(500).json({ error: "Failed to generate read URL. Check S3 configuration." });
  }
});

/**
 * POST /api/upload/document
 * Multipart: field name "file"
 * Returns: { success, fileKey }
 *
 * Accepts the file via multipart (no S3 CORS needed), uploads it to S3
 * server-side, and returns the S3 key. The key is stored in the DB; a
 * presigned read URL is generated on-demand when the user views the file.
 */
router.post("/document", verifyToken, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, error: "File exceeds 10 MB limit." });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file received." });
    }

    try {
      const ext     = path.extname(req.file.originalname).toLowerCase();
      const fileKey = `form-documents/${uuidv4()}${ext}`;

      await uploadBuffer(fileKey, req.file.buffer, req.file.mimetype);

      return res.json({ success: true, fileKey });
    } catch (storageErr) {
      logger.error("[upload/document] Local upload failed", {
        name: storageErr?.name, code: storageErr?.Code || storageErr?.code, message: storageErr?.message,
      });
      return res.status(500).json({ success: false, error: `Storage error: ${storageErr?.message || "Unable to save file locally"}` });
    }
  });
});

module.exports = router;
