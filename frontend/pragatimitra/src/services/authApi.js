/**
 * src/services/authApi.js
 * ─────────────────────────────────────────────────────────────────────────
 * AUTH domain service — the HTTP layer for authentication endpoints.
 *
 * Pages call these methods and know only WHAT they want (log in, change
 * password); they never build a URL or know the host. Each method resolves its
 * URL from the single source of truth (src/services/api.js) and returns the raw
 * `fetch` Response, so call sites keep their exact response handling
 * (`await res.json()`, `res.ok`, error messages, loading) byte-for-byte.
 *
 * These are the unauthenticated / session-bootstrap calls that cannot use the
 * authenticated apiFetch wrapper (they run before/around having an access token
 * and rely on the httpOnly refresh cookie via `credentials: "include"`).
 * ───────────────────────────────────────────────────────────────────────── */

import { apiUrl } from "./api";

const JSON_HEADERS = { "Content-Type": "application/json" };

/* POST /api/auth/login — body: { email, password }. Sends the refresh cookie. */
export function login(body) {
  return fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/* POST /api/auth/super-admin/login — body: { email, password }. */
export function superAdminLogin(body) {
  return fetch(apiUrl("/api/auth/super-admin/login"), {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/* POST /api/auth/super-admin/register — body: { fullName, email, password, setupKey }. */
export function superAdminRegister(body) {
  return fetch(apiUrl("/api/auth/super-admin/register"), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/* POST /api/auth/change-password — body: { currentPassword, newPassword }.
   Requires the current access token (Bearer). */
export function changePassword(body, accessToken) {
  return fetch(apiUrl("/api/auth/change-password"), {
    method: "POST",
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}

/* GET /api/auth/me — restore the session from the refresh cookie. */
export function me() {
  return fetch(apiUrl("/api/auth/me"), { credentials: "include" });
}

/* POST /api/auth/refresh — mint a fresh access token from the refresh cookie. */
export function refresh() {
  return fetch(apiUrl("/api/auth/refresh"), { method: "POST", credentials: "include" });
}

/* POST /api/auth/logout — clear the server session / refresh cookie. */
export function logout() {
  return fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
}

export default { login, superAdminLogin, superAdminRegister, changePassword, me, refresh, logout };
