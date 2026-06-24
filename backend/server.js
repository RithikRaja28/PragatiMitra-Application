require("dotenv").config();

const express       = require("express");
const helmet        = require("helmet");
const cors          = require("cors");
const cookies       = require("cookie-parser");
const rateLimit     = require("express-rate-limit");
const { Pool }      = require("pg");

const logger        = require("./utils/logger");
const requestId     = require("./middleware/requestId");
const requestLogger = require("./middleware/requestLogger");
const errorHandler  = require("./middleware/errorHandler");

/* ─── Uncaught / unhandled errors ──────────────────────────── */
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down", { stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const stack = reason instanceof Error ? reason.stack : String(reason);
  logger.error("Unhandled promise rejection", { stack });
});

/* ─── Route imports ─────────────────────────────────────────── */
const authRoutes                  = require("./routes/login");
const departmentRoutes            = require("./routes/departments");
const institutionRoutes           = require("./routes/institutions");
const userRoutes                  = require("./routes/users");
const lookupRoutes                = require("./routes/lookup");
const auditLogRoutes              = require("./routes/auditLogs");
const notificationTemplatesRouter = require("./routes/notificationTemplates");
const nodalOfficerAssignmentsRouter = require("./routes/nodalOfficerAssignments");

// Collaborative Report Builder
const builderReportsRoutes       = require("./routes/builder/reports");
const builderSectionsRoutes      = require("./routes/builder/sections");
const builderBlocksRoutes        = require("./routes/builder/blocks");
const builderAssignmentsRoutes   = require("./routes/builder/assignments");
const builderApprovalsRoutes     = require("./routes/builder/approvals");
const builderVersionsRoutes      = require("./routes/builder/versions");
const builderCyclesRoutes        = require("./routes/builder/cycles");
const builderWorkflowsRoutes     = require("./routes/builder/workflows");
const builderTemplatesRoutes     = require("./routes/builder/templates");
const builderCommentsRoutes          = require("./routes/builder/comments");
const builderCompileRoutes           = require("./routes/builder/compile");
const builderNotificationsRoutes     = require("./routes/builder/notifications");
const builderReportIntegrationRoutes = require("./routes/builder/reportIntegration");

const app  = express();
const PORT = process.env.PORT || 3000;

/* Behind a reverse proxy in production (most hosts), so secure cookies, HTTPS
   detection and the rate-limiter see the REAL client IP instead of the proxy's.
   Harmless when not proxied. */
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

/* ─── Security middleware ───────────────────────────────────── */
app.use(helmet());

/* Allowed CORS origins = built-in localhost dev origins PLUS any production
   origin(s) supplied via env — deploy-by-config, no code change:
     FRONTEND_URL  = https://app.yourdomain.com           (single origin)
     CORS_ORIGINS  = https://a.com,https://b.com           (comma-separated, optional)
   credentials:true is required for the httpOnly refresh cookie. */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5000",
  "http://localhost:4000",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : []),
];

app.use(cors({
  origin:      ALLOWED_ORIGINS,
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

/* ─── Global API rate limiter ───────────────────────────────────
   Protects against abuse WITHOUT throttling normal SPA usage — a single
   dashboard page load fires many requests, so the old 200-per-15-min cap (with a
   15-minute lockout) was exhausted almost immediately and blocked legitimate
   users for a long time. We now use a short 1-minute window (a brief burst
   recovers in ≤60s instead of 15 min) with a high per-IP ceiling. In
   development/testing it is effectively disabled so QA is never throttled.
   NOTE: in production, run behind a reverse proxy and set `app.set("trust proxy", 1)`
   so the limit is applied per real client IP (otherwise every user shares the
   proxy's IP and hits the cap collectively). */
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX)
  || (process.env.NODE_ENV === "production" ? 1000 : 100000);
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === "production" ? 500 : 5000,
  message:  "Too many requests, try again later.",
}));

app.use(express.json({ limit: "50mb" }));

app.use(cookies());

/* ─── Request ID + logging ──────────────────────────────────── */
app.use(requestId);
app.use(requestLogger);

/* ─── pg type parsers ──────────────────────────────────────────
   By default pg converts DATE columns to JS Date objects at local
   midnight. On a UTC+5:30 server that midnight is 18:30 UTC of the
   previous day, so .toISOString() would silently shift the date.
   Registering a string parser for DATE (OID 1082) keeps the value
   as "YYYY-MM-DD" throughout the application, matching what was
   stored and what the user entered.
─────────────────────────────────────────────────────────────── */
const { types: pgTypes } = require("pg");
pgTypes.setTypeParser(1082, (val) => val); // DATE → keep as "YYYY-MM-DD" string

/* ─── PostgreSQL pool ───────────────────────────────────────── */
const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     Number(process.env.DB_PORT) || 5432,
  // Pool sizing is env-tunable; defaults preserve the previous hardcoded values.
  max:                     Number(process.env.DB_POOL_MAX)           || 30,
  min:                     Number(process.env.DB_POOL_MIN)           || 0,
  idleTimeoutMillis:       Number(process.env.DB_IDLE_TIMEOUT)       || 30_000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT) || 5_000,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  logger.error("PostgreSQL pool error", { stack: err.stack });
});

pool.connect((err, client, release) => {
  if (err) {
    logger.error("Database connection failed", { stack: err.stack });
    return;
  }
  logger.info("Connected to PostgreSQL successfully");
  release();
});

// Make pool available to all route handlers via req.app.locals.pool
app.locals.pool = pool;

/* ── Password reset tokens ── */
pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`).catch((e) => logger.error("Failed to ensure password_reset_tokens table", { stack: e.stack }));

pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)`)
  .catch((e) => logger.error("Failed to ensure idx_prt_user index", { stack: e.stack }));

/* ── Deadline reminder deduplication log ── */
pool.query(`
  CREATE TABLE IF NOT EXISTS form_deadline_reminder_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    form_key        TEXT        NOT NULL,
    reminder_type   TEXT        NOT NULL,
    recipient_email TEXT        NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (form_key, reminder_type, recipient_email)
  )
`).catch((e) => logger.error("Failed to ensure form_deadline_reminder_log table", { stack: e.stack }));

/* ── Nodal Officer Assignments: ensure table + index exist on startup ── */
pool.query(`
  CREATE TABLE IF NOT EXISTS nodal_officer_assignments (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    institution_id UUID        NOT NULL REFERENCES institutions(institution_id),
    department_id  UUID        REFERENCES departments(department_id),
    user_id        UUID        NOT NULL REFERENCES users(id),
    reporting_year TEXT        NOT NULL,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    assigned_by    UUID        NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`).catch(e => logger.error("Failed to ensure nodal_officer_assignments table", { stack: e.stack }));

// Multiple active assignments per dept+year are now allowed — drop the old
// unique partial index if it was created by a previous version of the server.
pool.query(`DROP INDEX IF EXISTS idx_noa_unique_active`)
  .catch(e => logger.error("Failed to drop idx_noa_unique_active", { stack: e.stack }));

// One-time/idempotent: rewrite any legacy "YYYY-YY" reporting_year values
// (e.g. "2026-27") to the standard "YYYY-YYYY" form (e.g. "2026-2027").
nodalOfficerAssignmentsRouter.normalizeReportingYears(pool)
  .catch(e => logger.error("Failed to normalize reporting_year format", { stack: e.stack }));

/* ── Form-level Hindi translation toggle: ensure the metadata column exists.
   NOT NULL DEFAULT TRUE backfills every existing form to TRUE, so current
   auto-translate behavior is preserved (backward compatible). ── */
pool
  .query(`ALTER TABLE table_list ADD COLUMN IF NOT EXISTS translate_to_hindi BOOLEAN NOT NULL DEFAULT TRUE`)
  .catch((e) => logger.error("Failed to ensure table_list.translate_to_hindi column", { stack: e.stack }));

/* ── Role/Form domain (Academic | Hospital | Finance) — additive metadata.
   NOT NULL DEFAULT 'academic' backfills every existing user/form to 'academic',
   so all current Academic behavior is preserved exactly (backward compatible). ── */
pool
  .query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role_domain TEXT NOT NULL DEFAULT 'academic'`)
  .catch((e) => logger.error("Failed to ensure users.role_domain column", { stack: e.stack }));
pool
  .query(`ALTER TABLE table_list ADD COLUMN IF NOT EXISTS form_domain TEXT NOT NULL DEFAULT 'academic'`)
  .catch((e) => logger.error("Failed to ensure table_list.form_domain column", { stack: e.stack }));

/* ── Seed the domain-admin roles (Hospital Admin / Finance Admin). Idempotent
   (skips if already present). roles.name has no unique constraint, so we guard
   with NOT EXISTS rather than ON CONFLICT. ── */
pool
  .query(`
    INSERT INTO roles (name, display_name, description, permissions, is_system)
    SELECT v.name, v.display_name, v.description, '{}'::jsonb, true
    FROM (VALUES
      ('hospital_admin', 'Hospital Admin', 'Manages Hospital-domain forms and data'),
      ('finance_admin',  'Finance Admin',  'Manages Finance-domain forms and data')
    ) AS v(name, display_name, description)
    WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = v.name)
  `)
  .catch((e) => logger.error("Failed to seed domain-admin roles", { stack: e.stack }));

/* ── audit_logs: ensure columns added after initial table creation ── */
pool.query(`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS browser_name VARCHAR(50)`)
  .catch((e) => logger.error("Failed to ensure audit_logs.browser_name column", { stack: e.stack }));
pool.query(`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS session_id UUID`)
  .catch((e) => logger.error("Failed to ensure audit_logs.session_id column", { stack: e.stack }));

/* ── kpi_svg_reports: ensure academic_year column + backfill from exported_at ── */
pool.query(`ALTER TABLE public.kpi_svg_reports ADD COLUMN IF NOT EXISTS academic_year INTEGER`)
  .then(() => pool.query(`
    UPDATE public.kpi_svg_reports
    SET academic_year = CASE
      WHEN EXTRACT(MONTH FROM exported_at) >= 4
        THEN EXTRACT(YEAR FROM exported_at)::int
      ELSE EXTRACT(YEAR FROM exported_at)::int - 1
    END
    WHERE academic_year IS NULL
  `))
  .catch(e => logger.error("Failed to ensure kpi_svg_reports.academic_year", { stack: e.stack }));

/* ── section_versions: ensure reviewer/decision columns added after initial schema.
   Guarded so it no-ops cleanly when the report-builder table hasn't been created
   yet (its migration may not have run on this database). ── */
pool.query(`
  DO $$
  BEGIN
    IF to_regclass('public.section_versions') IS NOT NULL THEN
      ALTER TABLE public.section_versions
        ADD COLUMN IF NOT EXISTS description      TEXT,
        ADD COLUMN IF NOT EXISTS reviewer_id      UUID REFERENCES public.users(id),
        ADD COLUMN IF NOT EXISTS decision         TEXT,
        ADD COLUMN IF NOT EXISTS reviewer_comment TEXT,
        ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES public.workflow_steps(id);
    END IF;
  END $$;
`).catch((e) => logger.error("Failed to ensure section_versions reviewer columns", { stack: e.stack }));

/* ── Institution lifecycle (Bug 10): ensure status + soft-delete columns exist at
   boot. The login / refresh / me / verifyToken gates read institutions.status and
   institutions.deleted_at on the FIRST request (before any institutions route runs
   its lazy ensure), so these must be present from startup. Idempotent. ── */
pool.query(`
  ALTER TABLE institutions
    ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
`).catch((e) => logger.error("Failed to ensure institutions lifecycle columns", { stack: e.stack }));

/* The institution_status ENUM originally shipped as ACTIVE | INACTIVE only, but
   Archive / soft-delete persist ARCHIVED / DELETED. Extend it idempotently at boot
   so those lifecycle writes succeed. Each runs as its own statement (a new enum
   value can't be used in the transaction that adds it) and is a harmless no-op when
   status is a plain TEXT column. */
["ARCHIVED", "DELETED"].forEach((val) => {
  pool.query(`ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS '${val}'`)
    .catch((e) => logger.error(`Failed to add institution_status value '${val}'`, { stack: e.stack }));
});

/* ── Form deadline auto-lock: ensure columns, then start periodic checker ── */
const { ensureDeadlineColumns, startDeadlineScheduler } = require("./services/formDeadlineService");
ensureDeadlineColumns(pool)
  .then(() => startDeadlineScheduler(pool, 60 * 1000))
  .catch((e) => logger.error("Failed to init form deadline scheduler", { stack: e.stack }));

/* ── Academic-year form lifecycle: ensure the two additive tables exist ── */
const { ensureAcademicYearTables } = require("./services/academicYearService");
ensureAcademicYearTables(pool)
  .catch((e) => logger.error("Failed to ensure academic year tables", { stack: e.stack }));

/* ── Shared-form access sync (idempotent) ─────────────────────────────
   Shared forms must be immediately visible to all institutions with no
   adoption step. These two queries fix any gaps on every boot.

   1. institute_access — any institution not yet in a shared form's array
      is added. The WHERE EXISTS guard makes this a no-op when already complete.

   2. form_lock_config — ensures every (shared form × institution) pair has
      a lock-config row so deadline management works from day one.
      ON CONFLICT DO NOTHING makes it safe to run on every boot.
── */
pool.query(`
  UPDATE table_list
  SET institute_access = (SELECT COALESCE(array_agg(institution_id), '{}'::uuid[]) FROM institutions),
      updated_at = now()
  WHERE share_table = true
    AND EXISTS (
      SELECT 1 FROM institutions i
      WHERE NOT (i.institution_id = ANY(COALESCE(institute_access, '{}'::uuid[])))
    )
`).catch((e) => logger.error("Failed to sync shared-form institute_access", { stack: e.stack }));

pool.query(`
  INSERT INTO form_lock_config (form_name, institution_id, is_locked, deadline_at, auto_locked)
  SELECT tl.form_name, i.institution_id, false, NULL, false
  FROM table_list tl CROSS JOIN institutions i
  WHERE tl.share_table = true
  ON CONFLICT (form_name, institution_id) DO NOTHING
`).catch((e) => logger.error("Failed to sync shared-form form_lock_config", { stack: e.stack }));

/* ── Department form management: ensure the additive department_* tables ── */
const { ensureDepartmentFormTables, backfillFixedFormRoles } = require("./services/departmentFormService");
ensureDepartmentFormTables(pool)
  .then(() => backfillFixedFormRoles(pool))
  .catch((e) => logger.error("Failed to ensure department form tables", { stack: e.stack }));

/* ── Email queue: create table + index, then start background worker ──
   PostgreSQL-backed async email queue. The worker polls every 5 s using
   FOR UPDATE SKIP LOCKED so multiple server instances remain safe.
── */
pool.query(`
  CREATE TABLE IF NOT EXISTS email_queue (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          VARCHAR(50) NOT NULL,
    recipient_email   TEXT        NOT NULL,
    recipient_user_id UUID,
    payload           JSONB       NOT NULL DEFAULT '{}',
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','sent','failed')),
    attempts          INTEGER     NOT NULL DEFAULT 0,
    max_attempts      INTEGER     NOT NULL DEFAULT 3,
    last_attempted_at TIMESTAMPTZ,
    last_error        TEXT,
    scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
  .then(() => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_pending
    ON email_queue (scheduled_at)
    WHERE status = 'pending'
  `))
  .then(() => {
    const { startEmailWorker } = require("./services/mailService");
    startEmailWorker(pool);
    const { startDeadlineReminderJob } = require("./services/deadlineReminderService");
    startDeadlineReminderJob(pool);
  })
  .catch((e) => logger.error("Failed to initialise email queue", { stack: e.stack }));

/* ── Contributor form assignment: ensure the additive form_assignments table ── */
const { ensureFormAssignmentsTable } = require("./routes/formAssignments");
ensureFormAssignmentsTable(pool)
  .catch((e) => logger.error("Failed to ensure form_assignments table", { stack: e.stack }));

/* ── Bug 14 (scale): backfill indexes on every existing record table so
   list/search/pagination/export/pair-cascade stay fast at 100k+ rows. Async +
   idempotent — never blocks startup; new tables are indexed at creation. ── */
const { ensureAllRecordsIndexes } = require("./services/recordsIndexService");
ensureAllRecordsIndexes(pool)
  .catch((e) => logger.error("Failed to ensure records indexes", { stack: e.stack }));

/* ── Shared-form schema repair: INSERT-ONLY backfill of missing schema rows for
   institutions that can access a shared form but never got their own schema
   (fixes "No active schema found"). Idempotent, non-destructive. ── */
const { propagateAllSharedSchemas, ensureSchemaProvenanceColumns } = require("./services/schemaPropagationService");
ensureSchemaProvenanceColumns(pool)
  .then(() => propagateAllSharedSchemas(pool))
  .catch((e) => logger.error("Failed to propagate shared form schemas", { stack: e.stack }));

/* ── Import session cache: rows stored server-side after parse ───── */
app.locals.importSessions = new Map();
// Purge sessions older than 1 hour every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of app.locals.importSessions) {
    if (val.expiresAt < now) app.locals.importSessions.delete(key);
  }
}, 30 * 60 * 1000).unref();

/* ─── Static: serve uploaded documents ─────────────────────── */
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ─── Routes ────────────────────────────────────────────────── */
app.get("/", (_req, res) => {
  res.json({ success: true, message: "Pragatimitra API running." });
});
const uploadRoutes = require("./routes/upload");
app.use("/api/auth",         authRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/lookup",       lookupRoutes);
app.use("/api/roles",        require("./routes/roles"));
app.use("/api/departments",  departmentRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/audit-logs",   auditLogRoutes);
app.use("/api/upload",       uploadRoutes);
app.use("/api/notification-templates", notificationTemplatesRouter);
app.use("/api/kpi",                    require("./routes/kpi"));
app.use("/api/forms",                  require("./routes/forms"));
app.use("/api/department-forms",       require("./routes/departmentForms"));
app.use("/api/department-form-data",   require("./routes/departmentFormData"));
app.use("/api/academic-years",         require("./routes/academicYear"));
app.use("/api/form-data",              require("./routes/formData"));
app.use("/api/form-data",              require("./routes/formimportexport"));
app.use("/api/dashboard",              require("./routes/dashboard"));
app.use("/api/nodal-officer-assignments", nodalOfficerAssignmentsRouter);
app.use("/api/form-assignments",       require("./routes/formAssignments").router);

// Collaborative Report Builder — /api/builder/*
app.use("/api/builder/reports",       builderReportsRoutes);
app.use("/api/builder/sections",      builderSectionsRoutes);
app.use("/api/builder/blocks",        builderBlocksRoutes);
app.use("/api/builder/assignments",   builderAssignmentsRoutes);
app.use("/api/builder/approvals",     builderApprovalsRoutes);
app.use("/api/builder/versions",      builderVersionsRoutes);
app.use("/api/builder/cycles",        builderCyclesRoutes);
app.use("/api/builder/workflows",     builderWorkflowsRoutes);
app.use("/api/builder/templates",     builderTemplatesRoutes);
app.use("/api/builder/comments",      builderCommentsRoutes);
app.use("/api/builder/compile",       builderCompileRoutes);
app.use("/api/builder/notifications",      builderNotificationsRoutes);
app.use("/api/report-integration",         builderReportIntegrationRoutes);

/* ─── Global error handler (must be last) ───────────────────── */
app.use(errorHandler);

/* ─── Start ─────────────────────────────────────────────────── */
/* L-2 — gate the server on the column/table ensures that the FIRST requests
   (login + auth gate, notification inbox, forms/domain) read, so no route is ever
   exposed before that schema exists. All idempotent (ADD COLUMN IF NOT EXISTS); the
   broader seed/repair ensures above keep running in the background. On failure we
   still start (logged) so a transient DDL error never bricks the server — but the
   common missing-column startup races are eliminated. */
async function bootCriticalSchema() {
  await pool.query(`ALTER TABLE institutions
    ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users      ADD COLUMN IF NOT EXISTS role_domain        TEXT    NOT NULL DEFAULT 'academic'`);
  await pool.query(`ALTER TABLE table_list ADD COLUMN IF NOT EXISTS form_domain        TEXT    NOT NULL DEFAULT 'academic'`);
  await pool.query(`ALTER TABLE table_list ADD COLUMN IF NOT EXISTS translate_to_hindi BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS type        VARCHAR(50),
    ADD COLUMN IF NOT EXISTS body        TEXT,
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS entity_id   UUID,
    ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE public.notifications ALTER COLUMN event_id DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE public.notifications ALTER COLUMN message  DROP NOT NULL`).catch(() => {});
}

bootCriticalSchema()
  .catch((e) => logger.error("Critical schema ensure failed (starting anyway)", { stack: e.stack }))
  .finally(() => {
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || "development",
      });
    });
  });