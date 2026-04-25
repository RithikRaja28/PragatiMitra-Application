require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------------------------------------------
   SECURITY MIDDLEWARE
--------------------------------------------------- */

// Secure HTTP headers
app.use(helmet());

// Allow frontend domains only
app.use(
  cors({
    origin: ["http://localhost:5173", "https://yourfrontend.com"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// Prevent abuse / brute force
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 200,
    message: "Too many requests, try again later.",
  }),
);

// Parse JSON body safely
app.use(express.json({ limit: "10kb" }));

/* ---------------------------------------------------
   POSTGRESQL CONNECTION POOL
--------------------------------------------------- */

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 30, // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Test DB connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error("Database connection failed:", err.message);
  }
  console.log("Connected to PostgreSQL successfully");
  release();
});



app.get("/", async (req, res) => {
  res.json({
    success: true,
    message: "Server running successfully",
  });
});



app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    success: false,
    message: "Something went wrong",
  });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});