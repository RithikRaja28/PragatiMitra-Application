const express = require("express");
const { v4: uuidv4 } = require("uuid");
const {
  saveBuffer, deleteFile: deleteLocalFile, signReadUrl, verifyReadToken,
  extInfo, resolveSafePath,
  reportBrandingKey, reportSubmissionKey,
  instituteFormKey, departmentFormKey,
} = require("../utils/localStorage");
const { verifyToken } = require("../middleware/auth");
const { resolveEffectiveDepartment } = require("../services/departmentContext");
const logger = require("../utils/logger");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => typeof v === "string" && UUID_RE.test(v);
const validateFormName = (name) => typeof name === "string" && /^[a-z][a-z0-9_]*$/.test(name);
/* Which language pane the upload came from — only affects which en/hi
   subfolder the file is filed under, defaults to "en". */
const normalizeLanguage = (v) => (v === "hi" ? "hi" : "en");

/* ── Allow-lists ──────────────────────────────────────────────────────────
   Image flow (report-builder images / branding) is image-only. Document flow
   (record attachments) accepts everything, including all image types. */
const IMAGE_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp",
];
const DOC_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const DOCUMENT_ALLOWED_TYPES = [...IMAGE_MIME_TYPES, ...DOC_MIME_TYPES];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* Category classification drives both the size limit and the storage
   subfolder for a document-flow upload — one source of truth for both. */
function categoryOf(mimetype) {
  if (IMAGE_MIME_TYPES.includes(mimetype)) return "images";
  return "files";
}
const CATEGORY_LIMITS = { images: MAX_FILE_SIZE, files: MAX_FILE_SIZE };
function categoryLimit(mimetype) {
  return CATEGORY_LIMITS[categoryOf(mimetype)];
}

/* Branding purpose → leaf subfolder name. The full destination path is always
   built server-side from a validated report/template scope — the caller picks
   a purpose + a report/template id, never a raw path segment. */
const BRANDING_SUBFOLDER = {
  "branding-logo": "logos",
  "branding-cover": "cover-images",
  "branding-background": "background-images",
};

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (DOCUMENT_ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed."));
  },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed."));
  },
});

function baseUrlFor(req) {
  return `${req.protocol}://${req.get("host")}`;
}

/* ── Scope resolvers ──────────────────────────────────────────────────────
   Each resolves + authorizes a client-supplied id/name against the DB and
   returns a plain { institutionId, institutionName, ... } object used to
   build the storage key — never trust the client for institution/department
   identity, only for WHICH report/form/template it's uploading into. */

async function resolveReportScope(pool, req, reportId) {
  if (!isUUID(reportId)) return null;
  const { rows } = await pool.query(
    `SELECT r.id, r.title, r.institution_id, i.institution_name
       FROM public.reports r
       JOIN public.institutions i ON i.institution_id = r.institution_id
      WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [reportId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const roles = req.user.roles || [];
  if (!roles.includes("super_admin") && String(row.institution_id) !== String(req.user.institutionId)) return null;
  return { id: row.id, title: row.title, institutionId: row.institution_id, institutionName: row.institution_name };
}

async function resolveInstituteFormScope(pool, req, formName) {
  if (!validateFormName(formName)) return null;
  const exists = await pool.query(`SELECT 1 FROM public.table_list WHERE form_name = $1`, [formName]);
  if (!exists.rowCount) return null;
  const { institutionId } = await resolveEffectiveDepartment(pool, req);
  if (!institutionId) return null;
  const { rows } = await pool.query(
    `SELECT institution_name FROM public.institutions WHERE institution_id = $1`,
    [institutionId]
  );
  if (!rows.length) return null;
  return { institutionId, institutionName: rows[0].institution_name, formName };
}

async function resolveDepartmentFormScope(pool, req, departmentFormId) {
  if (!isUUID(departmentFormId)) return null;
  const { rows } = await pool.query(
    `SELECT dtl.form_name, dtl.department_id, dtl.institution_id,
            d.name AS department_name, i.institution_name
       FROM public.department_table_list dtl
       JOIN public.departments d  ON d.department_id  = dtl.department_id
       JOIN public.institutions i ON i.institution_id = dtl.institution_id
      WHERE dtl.id = $1`,
    [departmentFormId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const roles = req.user.roles || [];
  if (!roles.includes("super_admin")) {
    const { departmentId } = await resolveEffectiveDepartment(pool, req);
    if (!departmentId || String(row.department_id) !== String(departmentId)) return null;
  }
  return {
    formName: row.form_name,
    departmentId: row.department_id,
    institutionId: row.institution_id,
    departmentName: row.department_name,
    institutionName: row.institution_name,
  };
}

/**
 * POST /api/upload/document
 * Multipart: field "file" + "context" (report_submission | institute_form | department_form)
 *   + one of "reportId" / "formName" / "departmentFormId" matching the context.
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
      const pool = req.app.locals.pool;
      const { context } = req.body;
      const language = normalizeLanguage(req.body.language);

      let scope = null;
      if (context === "report_submission") scope = await resolveReportScope(pool, req, req.body.reportId);
      else if (context === "institute_form") scope = await resolveInstituteFormScope(pool, req, req.body.formName);
      else if (context === "department_form") scope = await resolveDepartmentFormScope(pool, req, req.body.departmentFormId);

      if (!scope) {
        return res.status(400).json({ success: false, error: "Invalid or unauthorized upload context." });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const kind = categoryOf(req.file.mimetype);
      const filename = `${uuidv4()}${ext}`;

      const fileKey =
        context === "report_submission"
          ? reportSubmissionKey({
            institutionName: scope.institutionName, institutionId: scope.institutionId,
            reportTitle: scope.title, reportId: scope.id, language, kind, filename,
          })
          : context === "institute_form"
            ? instituteFormKey({
              institutionName: scope.institutionName, institutionId: scope.institutionId,
              formName: scope.formName, language, kind, filename,
            })
            : departmentFormKey({
              institutionName: scope.institutionName, institutionId: scope.institutionId,
              departmentName: scope.departmentName, formName: scope.formName, language, kind, filename,
            });

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
 * Multipart: field "file", optional "purpose"
 *   purpose ∈ branding-logo | branding-cover | branding-background | report-image
 *   (defaults to report-image; unrecognized values fall back to report-image)
 * Plus "reportId". Templates never hold real files — they're structure-only
 * (block_type, required flag, captions); a report's blocks are the only place
 * uploaded content ever lives.
 * Returns: { success, publicUrl }
 *
 * For report-builder images and branding assets — publicly readable, served
 * via the dynamic /uploads route (routes/publicFiles.js). The destination
 * folder is chosen entirely server-side from a validated report scope +
 * purpose, never from a raw client-supplied path segment.
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
      const pool = req.app.locals.pool;
      const { purpose, reportId } = req.body;
      const language = normalizeLanguage(req.body.language);
      const isBranding = Object.prototype.hasOwnProperty.call(BRANDING_SUBFOLDER, purpose);

      if (!reportId) {
        return res.status(400).json({ success: false, error: "reportId is required." });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;

      const scope = await resolveReportScope(pool, req, reportId);
      if (!scope) return res.status(400).json({ success: false, error: "Invalid or unauthorized report." });
      const fileKey = isBranding
        ? reportBrandingKey({
          institutionName: scope.institutionName, institutionId: scope.institutionId,
          reportTitle: scope.title, reportId: scope.id,
          assetFolder: BRANDING_SUBFOLDER[purpose], filename,
        })
        : reportSubmissionKey({
          institutionName: scope.institutionName, institutionId: scope.institutionId,
          reportTitle: scope.title, reportId: scope.id, language, kind: "images", filename,
        });

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
