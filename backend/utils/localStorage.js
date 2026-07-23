const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");
const { slugify, slugWithId } = require("./slug");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

/* Extension → { mime, inline }. `inline` controls Content-Disposition on the
   signed read route — only formats a browser can safely render with no script
   execution risk (raster images, PDF) are served inline; everything else
   (including SVG, which can carry embedded scripts) forces a download. */
const EXT_INFO = {
  jpg:  { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  png:  { mime: "image/png", inline: true },
  webp: { mime: "image/webp", inline: true },
  gif:  { mime: "image/gif", inline: true },
  bmp:  { mime: "image/bmp", inline: true },
  tiff: { mime: "image/tiff", inline: true },
  tif:  { mime: "image/tiff", inline: true },
  pdf:  { mime: "application/pdf", inline: true },

  svg:  { mime: "image/svg+xml", inline: false },
  doc:  { mime: "application/msword", inline: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false },
  xls:  { mime: "application/vnd.ms-excel", inline: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inline: false },
  ppt:  { mime: "application/vnd.ms-powerpoint", inline: false },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inline: false },
  txt:  { mime: "text/plain", inline: false },
  csv:  { mime: "text/csv", inline: false },
  json: { mime: "application/json", inline: false },
  xml:  { mime: "application/xml", inline: false },
  zip:  { mime: "application/zip", inline: false },
  rar:  { mime: "application/vnd.rar", inline: false },
  mp3:  { mime: "audio/mpeg", inline: false },
  wav:  { mime: "audio/wav", inline: false },
  ogg:  { mime: "audio/ogg", inline: false },
  m4a:  { mime: "audio/mp4", inline: false },
  mp4:  { mime: "video/mp4", inline: false },
  webm: { mime: "video/webm", inline: false },
  mov:  { mime: "video/quicktime", inline: false },
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

/* Signed, time-limited download URL — the local equivalent of an S3
   presigned GET URL. baseUrl must be supplied by the caller (derived from
   the incoming request) so this works correctly in any environment. */
function signReadUrl(key, expiresInSeconds, baseUrl) {
  const exp = Date.now() + expiresInSeconds * 1000;
  const sig = sign(key, exp);
  const qs = new URLSearchParams({ key, exp: String(exp), sig });
  return `${baseUrl}/api/upload/file?${qs.toString()}`;
}

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
     [institute]/reports/[report]/submissions/{images,files}/
     [institute]/templates/[template]/images/
     [institute]/institute_forms/[form_name]/{images,files}/
     [institute]/department_forms/dept_[dept_name]/[form_name]/{images,files}/

   Institute/report/template segments carry a short id suffix (slugWithId)
   since institution_name/report.title/template.name have no DB uniqueness
   constraint; department names and form_name slugs are already unique
   (per-institution / regex-validated), so those use a plain slug. ───────── */

function instituteDir(institutionName, institutionId) {
  return slugWithId(institutionName, institutionId);
}
function reportDir(reportTitle, reportId) {
  return slugWithId(reportTitle, reportId);
}
function templateDir(templateName, templateId) {
  return slugWithId(templateName, templateId);
}
function deptDir(departmentName) {
  return `dept_${slugify(departmentName)}`;
}

function reportBrandingKey({ institutionName, institutionId, reportTitle, reportId, assetFolder, filename }) {
  return [instituteDir(institutionName, institutionId), "reports", reportDir(reportTitle, reportId),
          "branding", assetFolder, filename].join("/");
}

function reportSubmissionKey({ institutionName, institutionId, reportTitle, reportId, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "reports", reportDir(reportTitle, reportId),
          "submissions", kind, filename].join("/");
}

function templateImageKey({ institutionName, institutionId, templateName, templateId, filename }) {
  return [instituteDir(institutionName, institutionId), "templates", templateDir(templateName, templateId),
          "images", filename].join("/");
}

function instituteFormKey({ institutionName, institutionId, formName, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "institute_forms", formName, kind, filename].join("/");
}

function departmentFormKey({ institutionName, institutionId, departmentName, formName, kind, filename }) {
  return [instituteDir(institutionName, institutionId), "department_forms", deptDir(departmentName),
          formName, kind, filename].join("/");
}

module.exports = {
  UPLOAD_ROOT,
  extInfo,
  resolveSafePath,
  saveBuffer,
  deleteFile,
  signReadUrl,
  verifyReadToken,
  instituteDir,
  reportDir,
  templateDir,
  deptDir,
  reportBrandingKey,
  reportSubmissionKey,
  templateImageKey,
  instituteFormKey,
  departmentFormKey,
};
