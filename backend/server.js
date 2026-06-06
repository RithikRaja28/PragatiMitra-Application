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
const radiologyRoutes             = require("./routes/radiology");   // ← radiology

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

// SVG payloads can be large — 10 MB for radiology, 10 KB for everything else
app.use((req, res, next) => {
  if (req.path.startsWith("/api/radiology")) {
    express.json({ limit: "10mb" })(req, res, next);
  } else {
    express.json({ limit: "50mb" })(req, res, next);
  }
});

app.use(cookies());

/* ─── Request ID + logging ──────────────────────────────────── */
app.use(requestId);
app.use(requestLogger);

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

/* ── Import session cache: rows stored server-side after parse ───── */
app.locals.importSessions = new Map();
// Purge sessions older than 1 hour every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of app.locals.importSessions) {
    if (val.expiresAt < now) app.locals.importSessions.delete(key);
  }
}, 30 * 60 * 1000).unref();

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
app.use("/api/radiology",              radiologyRoutes);   // ← radiology mounted
app.use("/api/kpi", require("./routes/kpi"));

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