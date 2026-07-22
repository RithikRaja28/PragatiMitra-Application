/**
 * src/services/api.js
 * ─────────────────────────────────────────────────────────────────────────
 * THE single API service for the frontend.
 *
 * This is the ONLY file that knows WHERE the backend is hosted. Every page,
 * hook and service calls these helpers with a RELATIVE path ("/api/...") and
 * never learns the host — that is driven entirely by VITE_API_URL at build
 * time (see .env). Deploy the frontend separately by changing VITE_API_URL
 * only; no code changes.
 *
 * Responsibility: base URL + common request config + (optional) token
 * injection. Nothing else — no endpoint registry, no business logic. The
 * helpers return the raw `fetch` Response, so existing call sites keep their
 * exact response handling (`await res.json()`, `res.blob()`, `res.ok`, error
 * messages, loading) unchanged.
 *
 * NOTE: there is no hardcoded host fallback — local dev must set VITE_API_URL in
 * .env (point it at your backend origin). This keeps the frontend source free of
 * any environment-specific host.
 * ───────────────────────────────────────────────────────────────────────── */

/* Backend origin (scheme + host + port), no trailing slash, no "/api" suffix.
   Resolved once from the build-time env. */
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

/* Absolute URL for a relative path. `path` should begin with "/". */
export const apiUrl = (path = "") => `${API_BASE}${path}`;

/* Build a fetch() init from the common options. JSON body is stringified and
   gets the JSON content-type; a FormData/Blob body is passed through untouched
   (the browser sets the correct multipart boundary). A `token` adds the Bearer
   header. Everything else (method, headers, credentials, signal) passes through
   so behaviour is identical to a hand-written fetch. */
function buildInit({ method = "GET", token, headers = {}, body, json, credentials, signal } = {}) {
  const h = { ...headers };
  let b = body;
  if (json !== undefined) {
    if (!h["Content-Type"]) h["Content-Type"] = "application/json";
    b = JSON.stringify(json);
  }
  if (token) h.Authorization = `Bearer ${token}`;
  const init = { method, headers: h };
  if (b !== undefined) init.body = b;
  if (credentials) init.credentials = credentials;
  if (signal) init.signal = signal;
  return init;
}

/* Core request — returns the raw Response. */
export function request(path, options = {}) {
  return fetch(apiUrl(path), buildInit(options));
}

export const get  = (path, options = {}) => request(path, { ...options, method: "GET" });
export const post = (path, options = {}) => request(path, { ...options, method: "POST" });
export const put  = (path, options = {}) => request(path, { ...options, method: "PUT" });
export const del  = (path, options = {}) => request(path, { ...options, method: "DELETE" });

const api = { API_BASE, apiUrl, request, get, post, put, del };
export default api;
