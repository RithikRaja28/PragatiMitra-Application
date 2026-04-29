"use strict";

const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

// Apply auth to ALL routes at once — same pattern as departments.js / institutions.js
router.use(verifyToken);

/* -----------------------------------------------
   GET /api/audit-logs/summary
   ⚠️  MUST be before /:id — otherwise Express
   treats "summary" as the :id param value.
   Returns count per entity_type for the stat cards.
   -----------------------------------------------*/
router.get("/summary", async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      SELECT
        entity_type,
        COUNT(*) AS total
      FROM public.audit_logs
      GROUP BY entity_type
      ORDER BY entity_type
    `);

    const summary = {};
    result.rows.forEach((r) => {
      summary[r.entity_type.toLowerCase()] = parseInt(r.total, 10);
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    logger.error("GET /api/audit-logs/summary failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to fetch audit summary." });
  }
});

/* -----------------------------------------------
   GET /api/audit-logs
   Query params:
     - entity_type : "USER" | "DEPARTMENT" | "INSTITUTION" | "ROLE" | "AUTH" | "SYSTEM"
     - search      : free-text across action_type, message, ip_address
     - page        : default 1
     - limit       : default 20, max 100
   -----------------------------------------------*/
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const { entity_type, search, page = 1, limit = 20 } = req.query;

  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (entity_type && entity_type !== "all") {
    conditions.push(`al.entity_type = $${idx++}`);
    values.push(entity_type.toUpperCase());
  }

  if (search && search.trim()) {
    conditions.push(
      `(al.action_type ILIKE $${idx} OR al.message ILIKE $${idx} OR al.ip_address ILIKE $${idx})`
    );
    values.push(`%${search.trim()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM public.audit_logs al ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT
         al.id,
         al.action_type,
         al.entity_type,
         al.entity_id,
         al.status,
         al.message,
         al.ip_address,
         al.user_agent,
         al.old_value,
         al.new_value,
         al.changed_fields,
         al.metadata,
         al.created_at,
         u.full_name AS actor_name,
         u.email     AS actor_email
       FROM public.audit_logs al
       LEFT JOIN public.users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limitNum, offset]
    );

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    logger.error("GET /api/audit-logs failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to fetch audit logs." });
  }
});

/* -----------------------------------------------
   GET /api/audit-logs/:id
   Single audit log entry — MUST be last.
   -----------------------------------------------*/
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         al.*,
         u.full_name AS actor_name,
         u.email     AS actor_email
       FROM public.audit_logs al
       LEFT JOIN public.users u ON u.id = al.user_id
       WHERE al.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Log entry not found." });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error("GET /api/audit-logs/:id failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to fetch log entry." });
  }
});

module.exports = router;