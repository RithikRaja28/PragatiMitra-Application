/**
 * src/services/index.js
 * ─────────────────────────────────────────────────────────────────────────
 * Barrel for the frontend services.
 *
 *   import api from "../../services/api";        // the single API client
 *   import { authApi } from "../../services";    // auth domain service
 *
 * `api` (api.js) is the ONE place that knows the backend base URL. Domain
 * services (authApi, …) build their URLs from it. Add new domains here as they
 * are introduced (formApi, userApi, …); pages depend on services, never on a
 * base URL or absolute fetch.
 * ───────────────────────────────────────────────────────────────────────── */

export { default as api } from "./api";
export * as authApi from "./authApi";
