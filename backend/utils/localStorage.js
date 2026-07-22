const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

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

module.exports = {
  UPLOAD_ROOT,
  extInfo,
  resolveSafePath,
  saveBuffer,
  deleteFile,
  signReadUrl,
  verifyReadToken,
};
