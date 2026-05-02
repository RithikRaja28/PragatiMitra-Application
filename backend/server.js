require("dotenv").config();

const express        = require("express");
const helmet         = require("helmet");
const cors           = require("cors");
const cookies        = require("cookie-parser");
const rateLimit      = require("express-rate-limit");
const { Pool }       = require("pg");

const logger         = require("./utils/logger");
const requestId      = require("./middleware/requestId");
const requestLogger  = require("./middleware/requestLogger");
const errorHandler   = require("./middleware/errorHandler");

/* ─── Uncaught / unhandled errors ──────────────────────────── */
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down", { stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const stack = reason instanceof Error ? reason.stack : String(reason);
  logger.error("Unhandled promise rejection", { stack });
});

/* ─── Routes ────────────────────────────────────────────────── */
const authRoutes        = require("./routes/login");
const departmentRoutes  = require("./routes/departments");
const institutionRoutes = require("./routes/institutions");
const userRoutes        = require("./routes/users");
const lookupRoutes      = require("./routes/lookup");
const auditLogRoutes    = require("./routes/auditLogs");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── Security middleware ───────────────────────────────────── */
app.use(helmet());

app.use(
  cors({
    origin:      ["http://localhost:5173", "https://yourfrontend.com"],
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      200,
    message:  "Too many requests, try again later.",
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(cookies());

/* ─── Request ID + logging (order matters) ──────────────────── */
app.use(requestId);      // must be first — stamps req.id before anything logs
app.use(requestLogger);  // reads req.id set above

/* ─── PostgreSQL pool ───────────────────────────────────────── */
const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     process.env.DB_PORT,
  max:      30,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Log idle-client errors from the pool (e.g., connection drops)
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

app.locals.pool = pool;

/* ─── Routes ────────────────────────────────────────────────── */
app.get("/", (req, res) => {
  res.json({ success: true, message: "Pragatimitra API running." });
});

app.use("/api/auth",         authRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/lookup",       lookupRoutes);
app.use("/api/roles",        require("./routes/roles"));
app.use("/api/departments",  departmentRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/committees",   require("./routes/committees"));
app.use("/api/audit-logs",   auditLogRoutes);

/* ─── Global error handler (must be last) ───────────────────── */
app.use(errorHandler);

/* ─── Start ─────────────────────────────────────────────────── */
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV || "development" });
});
