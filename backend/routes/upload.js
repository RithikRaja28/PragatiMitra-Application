const express   = require("express");
const { v4: uuidv4 } = require("uuid");
const { getUploadUrl, getReadUrl } = require("../utils/s3");
const { verifyToken } = require("../middleware/auth");
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

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

/* ── Local disk storage for document uploads (mock / dev) ── */
const UPLOADS_DIR = path.join(__dirname, "..", "uploads", "documents");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage: diskStorage,
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
 * Returns: { success, url, fileName }
 *
 * Saves the file to local disk and returns a URL pointing to it.
 * Swap the storage/url logic here when connecting real cloud storage.
 */
router.post("/document", verifyToken, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, error: "File exceeds 10 MB limit." });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file received." });
    }

    /* Build the accessible URL.
       In production swap this with your cloud storage URL. */
    const host     = `${req.protocol}://${req.get("host")}`;
    const fileUrl  = `${host}/uploads/documents/${req.file.filename}`;

    return res.json({
      success:  true,
      url:      fileUrl,
      fileName: req.file.originalname,
    });
  });
});

module.exports = router;
