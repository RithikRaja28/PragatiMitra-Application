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

/* ── Notification templates: seed missing event rows (idempotent) ──────────
   ON CONFLICT (event_id) DO NOTHING preserves any admin customisations that
   were made after initial seeding while still creating missing rows on upgrade.
── */
pool.query(`
  INSERT INTO notification_templates
    (event_id, label, email_subject, email_body, app_message,
     email_enabled, app_enabled, role_group, category)
  VALUES
    (
      'department_created',
      'Department Created',
      'New Department Added — {DEPARTMENT_NAME}',
      E'Hi {FULL_NAME},\n\nA new department has been added to {INSTITUTION_NAME} on {APP_NAME}.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nYou can now assign users and forms to this department.\n\n— {APP_NAME} Team',
      'Department "{DEPARTMENT_NAME}" has been added to {INSTITUTION_NAME}.',
      true, true, 'system', 'Administration'
    ),
    (
      'nodal_officer_assigned',
      'Nodal Officer Assigned',
      'You have been assigned as Nodal Officer — {REPORTING_YEAR}',
      E'Hi {FULL_NAME},\n\nYou have been assigned as a Nodal Officer on {APP_NAME}.\n\nReporting Year: {REPORTING_YEAR}\nInstitution: {INSTITUTION_NAME}\nScope: {SCOPE}\n\nPlease log in to view your assigned sections and responsibilities.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team',
      'You have been assigned as Nodal Officer for {REPORTING_YEAR}.',
      true, true, 'system', 'Assignments'
    ),
    (
      'nodal_officer_removed',
      'Nodal Officer Removed',
      'Your Nodal Officer Assignment Has Been Removed — {REPORTING_YEAR}',
      E'Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been removed.\n\nIf you believe this is a mistake, please contact your institution administrator.\n\n— {APP_NAME} Team',
      'Your Nodal Officer assignment for {REPORTING_YEAR} has been removed.',
      true, true, 'system', 'Assignments'
    ),
    (
      'institution_created',
      'Institution Created',
      'New Institution Registered — {INSTITUTION_NAME}',
      E'Hi {FULL_NAME},\n\nA new institution has been successfully registered on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nEmail Domain: {EMAIL_DOMAIN}\nLocation: {CITY}, {STATE}\n\nYou can now onboard administrators and departments for this institution.\n\n— {APP_NAME} Team',
      'Institution "{INSTITUTION_NAME}" has been registered.',
      true, true, 'system', 'Administration'
    ),
    (
      'committee_created',
      'Committee Created',
      'Management Committee Added — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
      E'Hi {FULL_NAME},\n\nA new management committee record has been created on {APP_NAME}.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\nPosition: {POSITION}\nInstitution: {INSTITUTION_NAME}\n\nPlease review the committee details in the system.\n\n— {APP_NAME} Team',
      'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been added.',
      true, true, 'system', 'Administration'
    )
  ON CONFLICT (event_id) DO NOTHING
`).catch((e) => logger.error("Failed to seed notification templates", { stack: e.stack }));

/* ── Fix stale nodal_officer_removed template if it still references {DepartmentName} ── */
pool.query(`
  UPDATE notification_templates
  SET email_body  = E'Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been removed.\n\nIf you believe this is a mistake, please contact your institution administrator.\n\n— {APP_NAME} Team',
      app_message = 'Your Nodal Officer assignment for {REPORTING_YEAR} has been removed.'
  WHERE event_id = 'nodal_officer_removed'
    AND (email_body ILIKE '%DepartmentName%')
`).catch((e) => logger.error("Failed to fix nodal_officer_removed template", { stack: e.stack }));

/* ── Seed additional notification templates (idempotent) ── */
pool.query(`
  INSERT INTO notification_templates
    (event_id, label, email_subject, email_body, app_message,
     email_enabled, app_enabled, role_group, category)
  VALUES
    (
      'nodal_officer_activated',
      'Nodal Officer Activated',
      'Your Nodal Officer Assignment Has Been Reinstated — {REPORTING_YEAR}',
      E'Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been reinstated.\n\nInstitution: {INSTITUTION_NAME}\nScope: {SCOPE}\n\nPlease log in to access your responsibilities.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team',
      'Your Nodal Officer assignment for {REPORTING_YEAR} has been reinstated.',
      true, true, 'system', 'Assignments'
    ),
    (
      'department_activated',
      'Department Activated',
      'Department Reactivated — {DEPARTMENT_NAME}',
      E'Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nUsers can now be assigned to this department.\n\n— {APP_NAME} Team',
      'Department "{DEPARTMENT_NAME}" has been reactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'department_deactivated',
      'Department Deactivated',
      'Department Deactivated — {DEPARTMENT_NAME}',
      E'Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nNo new users can be assigned to this department while inactive.\n\n— {APP_NAME} Team',
      'Department "{DEPARTMENT_NAME}" has been deactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'institution_activated',
      'Institution Activated',
      'Institution Reactivated — {INSTITUTION_NAME}',
      E'Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been reactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAll associated users and departments are now active.\n\n— {APP_NAME} Team',
      'Institution "{INSTITUTION_NAME}" has been reactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'institution_deactivated',
      'Institution Deactivated',
      'Institution Deactivated — {INSTITUTION_NAME}',
      E'Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been deactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAccess for users of this institution has been restricted.\n\n— {APP_NAME} Team',
      'Institution "{INSTITUTION_NAME}" has been deactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'committee_activated',
      'Committee Activated',
      'Committee Reactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
      E'Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team',
      'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been reactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'committee_deactivated',
      'Committee Deactivated',
      'Committee Deactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
      E'Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team',
      'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been deactivated.',
      true, true, 'system', 'Administration'
    ),
    (
      'role_created',
      'Role Created',
      'New Role Created — {ROLE_DISPLAY_NAME}',
      E'Hi {FULL_NAME},\n\nA new custom role has been created on {APP_NAME}.\n\nRole: {ROLE_DISPLAY_NAME}\nIdentifier: {ROLE_NAME}\nDescription: {ROLE_DESCRIPTION}\n\n— {APP_NAME} Team',
      'New role "{ROLE_DISPLAY_NAME}" has been created.',
      true, true, 'system', 'Administration'
    )
  ON CONFLICT (event_id) DO NOTHING
`).catch((e) => logger.error("Failed to seed additional notification templates", { stack: e.stack }));

/* ── Seed password reset + deadline reminder templates (idempotent) ── */
pool.query(`
  INSERT INTO notification_templates
    (event_id, label, email_subject, email_body, app_message,
     email_enabled, app_enabled, role_group, category)
  VALUES
    (
      'password_reset',
      'Password Reset',
      'Reset Your Password — {APP_NAME}',
      E'Hi {FULL_NAME},\n\nWe received a request to reset the password for your {APP_NAME} account.\n\nClick the button below to set a new password. This link is valid for 1 hour and can only be used once.\n\nIf you did not request a password reset, you can safely ignore this email — your password will not change.\n\n— {APP_NAME} Team',
      'A password reset link has been sent to your email address.',
      true, false, 'system', 'Security'
    ),
    (
      'form_deadline_reminder',
      'Form Deadline Reminder',
      'Deadline Reminder: {FORM_NAME} — {DAYS_REMAINING} day(s) left',
      E'Hi {FULL_NAME},\n\nThis is a reminder that the submission deadline for "{FORM_NAME}" is approaching on {APP_NAME}.\n\nForm: {FORM_NAME}\nDeadline: {DEADLINE}\nTime Remaining: {DAYS_REMAINING} day(s)\n\nPlease ensure all required submissions are completed before the deadline.\n\n— {APP_NAME} Team',
      'Deadline reminder: "{FORM_NAME}" is due on {DEADLINE}.',
      true, true, 'system', 'Forms'
    )
  ON CONFLICT (event_id) DO NOTHING
`).catch((e) => logger.error("Failed to seed password_reset/deadline_reminder templates", { stack: e.stack }));

/* ── Seed form creation notification templates (idempotent) ── */
pool.query(`
  INSERT INTO notification_templates
    (event_id, label, email_subject, email_body, app_message,
     email_enabled, app_enabled, role_group, category)
  VALUES
    (
      'institute_form_created',
      'Institute Form Created',
      'New Form Created — {FORM_NAME}',
      E'Hi {FULL_NAME},\n\nA new form has been created on {APP_NAME} for your institution.\n\nForm: {FORM_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nInstitution: {INSTITUTION_NAME}\nCreated By: {CREATED_BY}\nType: {FORM_TYPE}\nDeadline: {DEADLINE}\n\nPlease log in to review and manage this form.\n\n— {APP_NAME} Team',
      'New form "{FORM_NAME}" has been created for {ACADEMIC_YEAR}.',
      true, true, 'institute_admin', 'Forms'
    ),
    (
      'department_form_created',
      'Department Form Created',
      'New Department Form — {FORM_NAME}',
      E'Hi {FULL_NAME},\n\nA new department form has been created on {APP_NAME}.\n\nForm: {FORM_NAME}\nDepartment: {DEPARTMENT_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nCreated By: {CREATED_BY}\nDeadline: {DEADLINE}\n\nPlease log in to review and complete this form before the deadline.\n\n— {APP_NAME} Team',
      'New department form "{FORM_NAME}" created for {DEPARTMENT_NAME}.',
      true, true, 'department_admin', 'Forms'
    )
  ON CONFLICT (event_id) DO NOTHING
`).catch((e) => logger.error("Failed to seed form creation notification templates", { stack: e.stack }));

/* ── Seed academic year activation template ── */
pool.query(`
  INSERT INTO notification_templates
    (event_id, label, email_subject, email_body, app_message,
     email_enabled, app_enabled, role_group, category)
  VALUES (
    'academic_year_activated',
    'Academic Year Activated',
    'New Academic Year Activated — {ACADEMIC_YEAR}',
    E'Hi {FULL_NAME},\n\nAcademic Year {ACADEMIC_YEAR} has been activated for {INSTITUTION_NAME} on {APP_NAME}.\n\n{ACTIVE_FORMS_COUNT} form(s) are now available for submission. Please review your assigned forms and complete submissions before their deadlines.\n\nLog in to get started: {LOGIN_URL}\n\n— {APP_NAME} Team',
    'Academic Year {ACADEMIC_YEAR} activated. {ACTIVE_FORMS_COUNT} form(s) available.',
    true, true, 'system', 'Academic Year'
  )
  ON CONFLICT (event_id) DO NOTHING
`).catch((e) => logger.error("Failed to seed academic_year_activated template", { stack: e.stack }));

/* ── Cleanup: remove all legacy/unused notification templates ── */
pool.query(`
  DELETE FROM notification_templates
  WHERE event_id NOT IN (
    'user_created', 'account_suspended', 'account_reactivated',
    'password_reset', 'academic_year_activated', 'form_deadline_reminder',
    'institution_created', 'institution_activated', 'institution_deactivated',
    'role_created', 'user_role_updated',
    'department_created', 'department_activated', 'department_deactivated',
    'committee_created', 'committee_activated', 'committee_deactivated',
    'institute_form_created',
    'nodal_officer_assigned', 'nodal_officer_activated', 'nodal_officer_removed',
    'department_form_created'
  )
`).catch((e) => logger.error("Failed to delete legacy notification templates", { stack: e.stack }));

/* ── Fix role_group assignments for templates that were mis-seeded ── */
pool.query(`
  UPDATE notification_templates
  SET role_group = 'system', category = 'User Management'
  WHERE event_id = 'user_created' AND role_group != 'system'
`).catch((e) => logger.error("Failed to fix user_created role_group", { stack: e.stack }));

pool.query(`
  UPDATE notification_templates
  SET role_group = 'super_admin', category = 'Administration'
  WHERE event_id IN ('institution_created', 'institution_activated', 'institution_deactivated', 'role_created')
    AND role_group != 'super_admin'
`).catch((e) => logger.error("Failed to fix institution/role_created role_groups", { stack: e.stack }));

pool.query(`
  UPDATE notification_templates
  SET role_group = 'institute_admin', category = 'Administration'
  WHERE event_id IN (
    'department_created', 'department_activated', 'department_deactivated',
    'committee_created', 'committee_activated', 'committee_deactivated'
  )
  AND role_group != 'institute_admin'
`).catch((e) => logger.error("Failed to fix department/committee role_groups", { stack: e.stack }));

pool.query(`
  UPDATE notification_templates
  SET role_group = 'department_admin', category = 'Team Management'
  WHERE event_id = 'nodal_officer_activated' AND role_group != 'department_admin'
`).catch((e) => logger.error("Failed to fix nodal_officer_activated role_group", { stack: e.stack }));

/* ── Fix password_reset template content (legacy db dump had 30-min expiry) ── */
pool.query(`
  UPDATE notification_templates
  SET email_subject = 'Reset Your Password — {APP_NAME}',
      email_body    = E'Hi {FULL_NAME},\n\nWe received a request to reset your password for your {APP_NAME} account.\n\nClick the button below to reset your password. This link expires in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\n— {APP_NAME} Team'
  WHERE event_id = 'password_reset'
    AND email_body LIKE '%30 minutes%'
`).catch((e) => logger.error("Failed to fix password_reset template content", { stack: e.stack }));

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
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || "development",
  });
});