/**
 * src/api/client.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for API configuration.
 *
 * This is the ONLY file in the entire frontend that is allowed to read the
 * environment or know the backend host/base URL. Every page, hook, component
 * and service resolves the base URL from here — so deployment is "change the
 * env, the system works", with no code edits.
 *
 *   local / dev / staging / production → set VITE_API_URL only.
 *
 * Rules enforced across the app:
 *   • No page declares API_BASE / localhost / VITE_API_URL / a hardcoded URL.
 *   • Pages know WHAT to call (a path like "/api/users"); never WHERE.
 *
 * This module is intentionally tiny and side-effect free. It does NOT inject
 * auth, headers or timeouts — that runtime behaviour lives in the authenticated
 * client (src/hooks/useApi.js → apiFetch) and the domain services in
 * src/api/services/, which all build their URLs from API_BASE here.
 * ───────────────────────────────────────────────────────────────────────── */

/* The backend origin (scheme + host + port), WITHOUT a trailing slash and
   WITHOUT the "/api" prefix — callers pass full paths beginning with "/api/…".
   Falls back to the local dev server when VITE_API_URL is unset. */
export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

/* Build an absolute URL for a path. `path` should start with "/" (e.g.
   "/api/users"). Returns the same string the old inline `${API_BASE}${path}`
   produced, so call sites are byte-for-byte equivalent. */
export function apiUrl(path = "") {
  return `${API_BASE}${path}`;
}

export default API_BASE;
