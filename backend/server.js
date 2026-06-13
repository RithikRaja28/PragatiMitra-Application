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
const builderCommentsRoutes      = require("./routes/builder/comments");
const builderCompileRoutes       = require("./routes/builder/compile");
const builderNotificationsRoutes = require("./routes/builder/notifications");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── Security middleware ───────────────────────────────────── */
app.use(helmet());

app.use(cors({
  origin:      [
    "http://localhost:5173",
    "http://localhost:5000",
    "http://localhost:4000",
    "https://yourfrontend.com",
  ],
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
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
  max:      30,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
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

/* ── audit_logs: ensure columns added after initial table creation ── */
pool.query(`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS browser_name VARCHAR(50)`)
  .catch((e) => logger.error("Failed to ensure audit_logs.browser_name column", { stack: e.stack }));
pool.query(`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS session_id UUID`)
  .catch((e) => logger.error("Failed to ensure audit_logs.session_id column", { stack: e.stack }));

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
const { ensureDepartmentFormTables } = require("./services/departmentFormService");
ensureDepartmentFormTables(pool)
  .catch((e) => logger.error("Failed to ensure department form tables", { stack: e.stack }));

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
app.use("/api/committees",   require("./routes/committees"));
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
app.use("/api/nodal-officer-assignments", nodalOfficerAssignmentsRouter);

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
app.use("/api/builder/notifications", builderNotificationsRoutes);

/* ─── Global error handler (must be last) ───────────────────── */
app.use(errorHandler);

/* ─── Start ─────────────────────────────────────────────────── */
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || "development",
  });
});