require("dotenv").config();

const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const cookies    = require("cookie-parser");
const rateLimit  = require("express-rate-limit");
const { Pool } = require("pg");

/* ---------------------------------------------------
   ROUTES
--------------------------------------------------- */
const authRoutes        = require("./routes/login");
const departmentRoutes  = require("./routes/departments");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------------------------------------------
   SECURITY MIDDLEWARE
--------------------------------------------------- */
app.use(helmet());

app.use(
  cors({
    origin: ["http://localhost:5173", "https://yourfrontend.com"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "Too many requests, try again later.",
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(cookies());

/* ---------------------------------------------------
   POSTGRESQL CONNECTION POOL
   Attached to app.locals so all route files share it.
--------------------------------------------------- */
const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     process.env.DB_PORT,
  max:      30,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error("Database connection failed:", err.message);
  }
  console.log("Connected to PostgreSQL successfully");
  release();
});

// Make pool available in all route handlers via req.app.locals.pool
app.locals.pool = pool;

/* ---------------------------------------------------
   ROUTES
--------------------------------------------------- */
app.get("/", (req, res) => {
  res.json({ success: true, message: "Pragatimitra API running." });
});

app.use("/api/auth",   authRoutes);
app.use("/api/users",  require("./routes/users"));
app.use("/api/lookup", require("./routes/lookup"));
app.use("/api/auth",        authRoutes);
app.use("/api/departments", departmentRoutes);

/* ---------------------------------------------------
   GLOBAL ERROR HANDLER
--------------------------------------------------- */
app.use((err, req, res, next) => {
  console.error("[UNHANDLED ERROR]", err.stack);
  res.status(500).json({ success: false, message: "Something went wrong." });
});

/* ---------------------------------------------------
   START
--------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});