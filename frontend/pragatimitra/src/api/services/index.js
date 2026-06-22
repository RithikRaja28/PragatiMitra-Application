/**
 * src/api/services/index.js
 * ─────────────────────────────────────────────────────────────────────────
 * Barrel for the API domain services. Import from here:
 *
 *   import { authApi } from "../../api/services";
 *   const res = await authApi.login({ email, password });
 *
 * Each service is the HTTP layer for one domain and builds every URL from the
 * single source of truth (src/api/client.js). Add new domains here as they are
 * migrated (formApi, userApi, departmentApi, dashboardApi, reportApi,
 * assignmentApi, translationApi, …). Pages should depend on services, never on
 * fetch() / axios() / a base URL directly.
 *
 * NOTE: the authenticated business calls already flow through the centralized
 * authenticated client at src/hooks/useApi.js (apiFetch), which resolves its
 * base URL from src/api/client.js too — so those are migration-complete for the
 * "where to call" concern. New domain services here wrap specific endpoints as
 * teams adopt the page → service → client → backend pattern incrementally.
 * ───────────────────────────────────────────────────────────────────────── */

export * as authApi from "./authApi";
