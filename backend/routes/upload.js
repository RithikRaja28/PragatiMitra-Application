const express = require("express");
const { v4: uuidv4 } = require("uuid");
const {
  saveBuffer, deleteFile: deleteLocalFile, signReadUrl, verifyReadToken,
  extInfo, resolveSafePath,
} = require("../utils/localStorage");
const { verifyToken } = require("../middleware/auth");
const logger = require("../utils/logger");
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

const router = express.Router();

/* ── Allow-lists ──────────────────────────────────────────────────────────
   Image flow (report-builder images / branding) is image-only. Document flow
   (record attachments) accepts everything, including all image types. */
const IMAGE_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
  "image/tiff", "image/svg+xml",
];
const DOC_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "application/json",
  "application/xml", "text/xml",
  "application/zip", "application/x-zip-compressed",
  "application/vnd.rar", "application/x-rar-compressed",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4",
  "video/mp4", "video/webm", "video/quicktime",
];
const DOCUMENT_ALLOWED_TYPES = [...IMAGE_MIME_TYPES, ...DOC_MIME_TYPES];

const IMAGE_MAX   = 10  * 1024 * 1024;
const DOC_MAX      = 25  * 1024 * 1024;
const ARCHIVE_MAX = 50  * 1024 * 1024;
const AUDIO_MAX    = 50  * 1024 * 1024;
const VIDEO_MAX    = 200 * 1024 * 1024;

/* Category classification drives both the size limit and the storage
   subfolder for a document-flow upload — one source of truth for both. */
function categoryOf(mimetype) {
  if (IMAGE_MIME_TYPES.includes(mimetype)) return "images";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.includes("zip") || mimetype.includes("rar")) return "archives";
  return "documents";
}
const CATEGORY_LIMITS = { images: IMAGE_MAX, video: VIDEO_MAX, audio: AUDIO_MAX, archives: ARCHIVE_MAX, documents: DOC_MAX };
function categoryLimit(mimetype) {
  return CATEGORY_LIMITS[categoryOf(mimetype)];
}

/* Fixed, server-controlled destinations for the image-upload flow — the
   caller picks a purpose, never a raw path, so there is no client-influenced
   folder segment at all (stronger than merely sanitizing a free-text folder). */
const IMAGE_PURPOSE_FOLDERS = {
  "branding-logo":       "public/branding/logos",
  "branding-cover":      "public/branding/cover-images",
  "branding-background": "public/branding/background-images",
  "report-image":        "public/report-images",
};
function folderForPurpose(purpose) {
  return IMAGE_PURPOSE_FOLDERS[purpose] || IMAGE_PURPOSE_FOLDERS["report-image"];
}

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: VIDEO_MAX },
  fileFilter: (_req, file, cb) => {
    if (DOCUMENT_ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed."));
  },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: IMAGE_MAX },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed."));
  },
});

function baseUrlFor(req) {
  return `${req.protocol}://${req.get("host")}`;
}

/**
 * POST /api/upload/document
 * Multipart: field name "file"
 * Returns: { success, fileKey }
 */
router.post("/document", verifyToken, (req, res) => {
  uploadDocument.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, error: "File exceeds the maximum allowed size." });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file received." });
    }

    const limit = categoryLimit(req.file.mimetype);
    if (req.file.size > limit) {
      return res.status(400).json({
        success: false,
        error: `File exceeds the ${Math.round(limit / (1024 * 1024))} MB limit for this file type.`,
      });
    }

    try {
      const ext     = path.extname(req.file.originalname).toLowerCase();
      const category = categoryOf(req.file.mimetype);
      const fileKey = `submissions/${category}/${uuidv4()}${ext}`;

      await saveBuffer(fileKey, req.file.buffer);

      return res.json({ success: true, fileKey });
    } catch (storageErr) {
      logger.error("[upload/document] Local storage write failed", { message: storageErr.message });
      return res.status(500).json({ success: false, error: `Storage error: ${storageErr.message}` });
    }
  });
});

/**
 * POST /api/upload/image
 * Multipart: field name "file", optional "purpose"
 *   purpose ∈ branding-logo | branding-cover | branding-background | report-image
 *   (defaults to report-image; unrecognized values fall back to report-image)
 * Returns: { success, publicUrl }
 *
 * For report-builder images and branding assets — publicly readable, served
 * directly from disk via the static /uploads/public mount. The destination
 * folder is chosen entirely server-side from `purpose`, never from a raw
 * client-supplied path segment.
 */
router.post("/image", verifyToken, (req, res) => {
  uploadImage.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, error: "File exceeds the 10 MB limit." });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file received." });
    }

    try {
      const ext     = path.extname(req.file.originalname).toLowerCase();
      const folder  = folderForPurpose(req.body.purpose);
      const fileKey = `${folder}/${uuidv4()}${ext}`;

      await saveBuffer(fileKey, req.file.buffer);

      const publicUrl = `${baseUrlFor(req)}/uploads/${fileKey}`;
      return res.json({ success: true, publicUrl });
    } catch (storageErr) {
      logger.error("[upload/image] Local storage write failed", { message: storageErr.message });
      return res.status(500).json({ success: false, error: `Storage error: ${storageErr.message}` });
    }
  });
});

/**
 * POST /api/upload/read-url
 * Body: { fileKey, expiresIn? }
 * Returns: { readUrl }
 */
router.post("/read-url", verifyToken, (req, res) => {
  const { fileKey, expiresIn = 604800 } = req.body;

  if (!fileKey) {
    return res.status(400).json({ error: "fileKey is required." });
  }

  try {
    const readUrl = signReadUrl(fileKey, Number(expiresIn), baseUrlFor(req));
    res.json({ readUrl });
  } catch (err) {
    logger.error("[upload/read-url] Failed to generate read URL", { message: err.message });
    res.status(500).json({ error: "Failed to generate read URL." });
  }
});

/**
 * GET /api/upload/file?key=&exp=&sig=
 * Signed, time-limited streaming download — the local equivalent of an S3
 * presigned GET URL. Not behind verifyToken: it must be openable via plain
 * browser navigation / <img src>, which cannot carry an Authorization header.
 * Security comes entirely from the signature + expiry.
 */
router.get("/file", async (req, res) => {
  const { key, exp, sig } = req.query;

  if (!verifyReadToken(key, exp, sig)) {
    return res.status(403).json({ error: "Invalid or expired link." });
  }

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
