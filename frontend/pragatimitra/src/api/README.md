# API Layer

Centralized API access for the frontend. **Pages know WHAT to call, never WHERE.**

```
Page / Hook / Component
        │
        ▼
  Service (src/api/services/*)        ← HTTP for one domain (authApi, …)
        │
        ▼
  Client config (src/api/client.js)   ← THE ONLY place that knows the base URL
        │
        ▼
      Backend
```

## Files

- **`client.js`** — the single source of truth for API configuration. The only
  file allowed to read `import.meta.env` / know the host. Exports `API_BASE`
  (backend origin, no trailing slash, no `/api`) and `apiUrl(path)`.
- **`services/`** — domain services. Each wraps a set of endpoints and builds
  every URL from `client.js`. Currently: `authApi` (login, super-admin login/
  register, change-password, me, refresh, logout).
- The authenticated business calls flow through **`src/hooks/useApi.js`**
  (`apiFetch`) — the authenticated client. It injects the Bearer token + the
  `X-Academic-Year` header and resolves its base URL from `client.js`, so those
  call sites are already migration-complete for the "where to call" concern.

## Rules

- No page/component/hook declares `API_BASE`, `localhost`, `VITE_API_URL`, or a
  hardcoded URL. (Enforced: a repo-wide search for `http://localhost` and
  `VITE_API_URL` returns hits in `client.js` only.)
- Deployment changes the environment (`VITE_API_URL`), never code. See
  `.env.example`.

## Adding a new domain service

1. Create `services/<domain>Api.js`; build URLs with `apiUrl("/api/...")` (raw
   calls) or accept `apiFetch` from `useApi()` for authenticated calls.
2. Export it from `services/index.js`.
3. In the page, replace the inline `fetch(...)` with the service method. Keep the
   response handling identical (return the raw `Response`).
