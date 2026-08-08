const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { slugify, slugWithId } = require("./slug");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

/* Extension → { mime, inline }. `inline` controls Content-Disposition on the
   signed read route — only formats a browser can safely render with no script
   execution risk (raster images, PDF) are served inline; everything else
   (including SVG, which can carry embedded scripts) forces a download. */
const EXT_INFO = {
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  png: { mime: "image/png", inline: true },
  webp: { mime: "image/webp", inline: true },
  gif: { mime: "image/gif", inline: true },
  bmp: { mime: "image/bmp", inline: true },
  tiff: { mime: "image/tiff", inline: true },
  tif: { mime: "image/tiff", inline: true },
  pdf: { mime: "application/pdf", inline: true },

  svg: { mime: "image/svg+xml", inline: false },
  doc: { mime: "application/msword", inline: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false },
  xls: { mime: "application/vnd.ms-excel", inline: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inline: false },
  ppt: { mime: "application/vnd.ms-powerpoint", inline: false },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inline: false },
  txt: { mime: "text/plain", inline: false },
  csv: { mime: "text/csv", inline: false },
  json: { mime: "application/json", inline: false },
  xml: { mime: "application/xml", inline: false },
  zip: { mime: "application/zip", inline: false },
  rar: { mime: "application/vnd.rar", inline: false },
  mp3: { mime: "audio/mpeg", inline: false },
  wav: { mime: "audio/wav", inline: false },
  ogg: { mime: "audio/ogg", inline: false },
  m4a: { mime: "audio/mp4", inline: false },
  mp4: { mime: "video/mp4", inline: false },
  webm: { mime: "video/webm", inline: false },
  mov: { mime: "video/quicktime", inline: false },
};

function extInfo(key) {
  const ext = path.extname(key).slice(1).toLowerCase();
  return EXT_INFO[ext] || { mime: "application/octet-stream", inline: false };
}

/* Resolve a storage key to an absolute path, rejecting anything that would
   escape UPLOAD_ROOT (path traversal via "..", absolute paths, etc). */
function resolveSafePath(key) {
  const resolved = path.resolve(UPLOAD_ROOT, key);
  if (resolved !== UPLOAD_ROOT && !resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return resolved;
}

async function saveBuffer(key, buffer) {
  const filePath = resolveSafePath(key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
}

async function deleteFile(key) {
  const filePath = resolveSafePath(key);
  await fs.promises.unlink(filePath).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });
}

function sign(key, exp) {
  const secret = process.env.JWT_SECRET;
  return crypto.createHmac("sha256", secret).update(`${key}:${exp}`).digest("hex");
}

/* Signed, time-limited download URL via an opaque encrypted token.
   baseUrl must be supplied by the caller (derived from the incoming request)
   so this works correctly in any environment. */
function signReadUrl(key, expiresInSeconds, baseUrl) {
  const exp = Date.now() + expiresInSeconds * 1000;
  
  const secret = process.env.JWT_SECRET;
  // Ensure we have a 32-byte key for AES-256
  const cipherKey = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv);
  
  const payload = JSON.stringify({ k: key, e: exp });
  let encrypted = cipher.update(payload, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  const authTag = cipher.getAuthTag().toString('base64url');
  
  const token = `${iv.toString('base64url')}.${encrypted}.${authTag}`;
  return `${baseUrl}/api/file/${token}`;
}

/**
 * Decrypts the short-id token back into { key, exp }.
 * Returns false if the token is invalid, tampered with, or expired.
 */
function verifyAndDecodeFileToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const [ivStr, encrypted, authTagStr] = parts;
    const secret = process.env.JWT_SECRET;
    const cipherKey = crypto.createHash('sha256').update(secret).digest();
    
    const iv = Buffer.from(ivStr, 'base64url');
    const authTag = Buffer.from(authTagStr, 'base64url');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    
    const { k: key, e: exp } = JSON.parse(decrypted);
    
    const expNum = Number(exp);
    if (!key || !Number.isFinite(expNum)) return false;
    if (Date.now() > expNum) return false;
    
    return { key, exp: expNum };
  } catch (err) {
    return false;
  }
}

/**
 * Decrypts the token to extract the key, ignoring expiration.
 * Used for extracting keys from stored DB fields or old payloads, 
 * where the token might have expired.
 */
function decodeFileTokenWithoutVerification(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const [ivStr, encrypted, authTagStr] = parts;
    const secret = process.env.JWT_SECRET;
    const cipherKey = crypto.createHash('sha256').update(secret).digest();
    
    const iv = Buffer.from(ivStr, 'base64url');
    const authTag = Buffer.from(authTagStr, 'base64url');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    
    const { k: key } = JSON.parse(decrypted);
    return key ? { key } : false;
  } catch (err) {
    return false;
  }
}

// Keep the old verification for backward compatibility with existing links
function verifyReadToken(key, exp, sig) {
  const expNum = Number(exp);
  if (!key || !Number.isFinite(expNum) || !sig) return false;
  if (Date.now() > expNum) return false;
  const expected = sign(key, expNum);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ─── Tenant-scoped storage-key builders ────────────────────────────────
   Pure path construction only — no DB queries here. Callers resolve the
   institute/report/template name + id (and permission to use it) first,
   then hand the already-resolved strings to these builders. Folder layout:

     [institute]/reports/[report]/branding/{logos,cover-images,background-images}/
     [institute]/reports/[report]/generated/{pdf,docx}/
     [institute]/reports/[report]/submissions/{en,hi}/{images,files}/
     [institute]/institute_forms/[form_name]/{en,hi}/{images,files}/
     [institute]/department_forms/dept_[dept_name]/[form_name]/{en,hi}/{images,files}/

   Submission/form uploads carry an en/hi language segment reflecting which
   language pane the upload came from (see langSegment()) — this only affects
   *where new uploads are filed*; it does not by itself make Hindi content
   independently editable anywhere it wasn't already (e.g. report image
   blocks still hold one shared URL regardless of language tab).

   Templates hold no files of their own — they're structure-only (block
   type + required flag + captions); real uploads only ever live under a
   report.

   Institute/report segments carry a short id suffix (slugWithId) since
   institution_name/report.title have no DB uniqueness constraint;
   department names and form_name slugs are already unique (per-institution
   / regex-validated), so those use a plain slug. ───────── */

function instituteDir(institutionName, institutionId) {
  return slugWithId(institutionName, institutionId);
}
function reportDir(reportTitle, reportId) {
  return slugWithId(reportTitle, reportId);
}
function deptDir(departmentName) {
  return `dept_${slugify(departmentName)}`;
}

function reportBrandingKey({ institutionName, institutionId, reportTitle, reportId, assetFolder, filename }) {
  return [instituteDir(institutionName, institutionId), "reports", reportDir(reportTitle, reportId),
    "branding", assetFolder, filename].join("/");
}

function langSegment(language) {
  return language === "hi" ? "hi" : "en";
}

function reportSubmissionKey({ institutionName, institutionId, reportTitle, reportId, language, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "reports", reportDir(reportTitle, reportId),
    "submissions", langSegment(language), kind, filename].join("/");
}

function instituteFormKey({ institutionName, institutionId, formName, language, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "institute_forms", formName, langSegment(language), kind, filename].join("/");
}

function departmentFormKey({ institutionName, institutionId, departmentName, formName, language, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "department_forms", deptDir(departmentName),
    formName, langSegment(language), kind, filename].join("/");
}

async function deleteReportFolder(institutionName, institutionId, reportTitle, reportId) {
  try {
    const key = [instituteDir(institutionName, institutionId), "reports", reportDir(reportTitle, reportId)].join("/");
    const dirPath = resolveSafePath(key);
    await fs.promises.rm(dirPath, { recursive: true, force: true }).catch(err => {
      if (err.code !== "ENOENT") throw err;
    });
  } catch (err) {
    // Ignore safe path resolution errors if dir doesn't exist
  }
}

async function renameFolder(oldKeyPrefix, newKeyPrefix) {
  try {
    const oldPath = resolveSafePath(oldKeyPrefix);
    const newPath = resolveSafePath(newKeyPrefix);
    if (fs.existsSync(oldPath)) {
      await fs.promises.rename(oldPath, newPath);
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Recursively extract storage keys from any object (DB row, form data, JSON content).
 *
 * Handles two storage formats used across the app:
 *   1. Full URLs:  "http://host/uploads/aiims-3c8a6547/.../file.png"  → extracts the part after /uploads/
 *   2. Raw keys:   "aiims-3c8a6547/department_forms/.../file.jpg"     → used as-is
 *
 * Skips non-upload strings (UUIDs, timestamps, plain text, etc.) by requiring
 * the value to either contain "/uploads/" or look like a storage path (has a
 * slash and ends with a known file extension).
 */
const UPLOAD_EXTENSIONS = new Set(Object.keys(EXT_INFO));

function extractUploadKeys(obj) {
  const keys = [];
  if (typeof obj === 'string') {
    // Format 1: full URL with /uploads/ prefix (legacy/public)
    const urlMatch = obj.match(/\/uploads\/(.+)$/);
    if (urlMatch) {
      keys.push(urlMatch[1]);
    } else {
      // Format 2: clean private URL (/api/file/<token>)
      const fileMatch = obj.match(/\/api\/file\/(.+)$/);
      if (fileMatch) {
        const decoded = decodeFileTokenWithoutVerification(fileMatch[1]);
        if (decoded && decoded.key) {
          keys.push(decoded.key);
        }
      } else {
        // Format 3: raw storage key (e.g. "aiims-xxx/department_forms/.../file.jpg")
        const ext = obj.split('.').pop()?.toLowerCase();
        if (obj.includes('/') && ext && UPLOAD_EXTENSIONS.has(ext)) {
          keys.push(obj);
        }
      }
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) keys.push(...extractUploadKeys(item));
  } else if (obj !== null && typeof obj === 'object') {
    for (const val of Object.values(obj)) keys.push(...extractUploadKeys(val));
  }
  return keys;
}

module.exports = {
  UPLOAD_ROOT,
  extInfo,
  resolveSafePath,
  saveBuffer,
  deleteFile,
  signReadUrl,
  verifyAndDecodeFileToken,
  verifyReadToken,
  decodeFileTokenWithoutVerification,
  instituteDir,
  reportDir,
  deptDir,
  reportBrandingKey,
  reportSubmissionKey,
  instituteFormKey,
  departmentFormKey,
  deleteReportFolder,
  extractUploadKeys,
  renameFolder,
};
