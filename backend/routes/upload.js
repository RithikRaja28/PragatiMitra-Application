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
    } catch (s3Err) {
      logger.error("[upload/document] S3 upload failed", {
        name: s3Err?.name, code: s3Err?.Code || s3Err?.code, message: s3Err?.message,
      });
      const code = s3Err?.Code || s3Err?.code || s3Err?.name || "";
      const friendly =
        code === "NoSuchBucket"
          ? `S3 bucket "${process.env.AWS_BUCKET_NAME}" does not exist. Create it in the AWS console (region: ${process.env.AWS_REGION}).`
          : code === "AccessDenied"
          ? "S3 access denied. Ensure the IAM user has s3:PutObject permission on this bucket."
          : `Storage error: ${s3Err?.message || code}`;
      return res.status(500).json({ success: false, error: friendly });
    }
  });
});

module.exports = router;
