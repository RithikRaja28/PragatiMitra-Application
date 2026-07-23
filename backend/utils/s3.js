const fs = require("fs/promises");
const path = require("path");
const LOCAL_BUFFER_UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "buffer-uploads");
const LOCAL_STORAGE_BASE_URL = (process.env.LOCAL_STORAGE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
  .replace(/\/+$/, "");

function getLocalBufferUploadPath(key) {
  // Keys originate on the server, but keep the local destination inside the
  // upload directory if this helper is ever called with untrusted input.
  const normalizedKey = String(key).replace(/\\/g, "/");
  const localPath = path.resolve(LOCAL_BUFFER_UPLOAD_DIR, normalizedKey);
  const localRoot = `${LOCAL_BUFFER_UPLOAD_DIR}${path.sep}`;

  if (!localPath.startsWith(localRoot)) {
    throw new Error("Invalid local upload key");
  }

  return localPath;
}

function getLocalBufferUploadUrl(key) {
  const encodedKey = String(key)
    .replace(/\\/g, "/")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${LOCAL_STORAGE_BASE_URL}/uploads/buffer-uploads/${encodedKey}`;
}

/**
 * Local upload endpoint. The frontend sends the file through the authenticated API.
 * The unused parameters retain the existing caller interface.
 */
async function getUploadUrl(key, _mimeType, _expiresIn = 300) {
  const encodedKey = String(key)
    .replace(/\\/g, "/")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/api/upload/local-upload/${encodedKey}`;
}

/**
 * Local URL for reading/downloading a backend-buffer upload.
 * `expiresIn` remains accepted so existing callers keep the same interface.
 */
async function getReadUrl(key, _expiresIn = 900) {
  return getLocalBufferUploadUrl(key);
}

/**
 * Upload a Buffer directly to local server storage.
 * Used by the /api/upload/document route to proxy files through the backend.
 */
async function uploadBuffer(key, buffer, mimeType) {
  const localPath = getLocalBufferUploadPath(key);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  return { key, mimeType, storage: "local" };
}

/**
 * Delete a backend-buffer upload from local server storage by its key.
 */
async function deleteFile(key) {
  await fs.rm(getLocalBufferUploadPath(key), { force: true });
}

module.exports = { getUploadUrl, getReadUrl, uploadBuffer, deleteFile };
