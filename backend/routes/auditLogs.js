"use strict";

const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

/* ─────────────────────────────────────────────────────────────
   Shared SELECT columns used in both the list and single-entry
   queries. Includes all auto-captured request-context fields.
───────────────────────────────────────────────────────────── */
const LOG_COLUMNS = `
  al.id,
  al.action_type,
  al.entity_type,
  al.entity_id,
  al.status,
  al.message,
  al.ip_address,
  al.user_agent,
  al.browser_name,
  al.old_value,
  al.new_value,
  al.changed_fields,
  al.metadata,
  al.created_at,
  u.full_name AS actor_name,
  u.email     AS actor_email
`;

/* ─────────────────────────────────────────────────────────────
   GET /api/audit-logs/summary
   ⚠️  MUST be before /:id — otherwise Express treats "summary"
   as the :id param value.
   Returns total count per entity_type for the stat cards.
───────────────────────────────────────────────────────────── */
router.get("/summary", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(`
      SELECT entity_type, COUNT(*) AS total
      FROM   public.audit_logs
      GROUP  BY entity_type
      ORDER  BY entity_type
    `);

    const summary = {};
    rows.forEach((r) => {
      summary[r.entity_type.toLowerCase()] = parseInt(r.total, 10);
    });

    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("[AUDIT] GET /summary", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch audit summary." });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/audit-logs
   Query params:
     entity_type  — "USER" | "DEPARTMENT" | "INSTITUTION" | "ROLE"
     search       — free-text across action_type, message, ip_address,
                    browser_name, actor name/email
     page         — default 1
     limit        — default 20, max 100
───────────────────────────────────────────────────────────── */
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
    conditions.push(`(
      al.action_type  ILIKE $${idx} OR
      al.message      ILIKE $${idx} OR
      al.ip_address   ILIKE $${idx} OR
      al.browser_name ILIKE $${idx} OR
      u.full_name     ILIKE $${idx} OR
      u.email         ILIKE $${idx}
    )`);
    values.push(`%${search.trim()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM   public.audit_logs al
       LEFT   JOIN public.users u ON u.id = al.user_id
       ${where}`,
      values
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT ${LOG_COLUMNS}
       FROM   public.audit_logs al
       LEFT   JOIN public.users u ON u.id = al.user_id
       ${where}
       ORDER  BY al.created_at DESC
       LIMIT  $${idx++} OFFSET $${idx++}`,
      [...values, limitNum, offset]
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("[AUDIT] GET /", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch audit logs." });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/audit-logs/:id
   Single audit log entry — MUST be last (avoids param collision).
───────────────────────────────────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT ${LOG_COLUMNS}
       FROM   public.audit_logs al
       LEFT   JOIN public.users u ON u.id = al.user_id
       WHERE  al.id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: "Log entry not found." });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("[AUDIT] GET /:id", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch log entry." });
  }
});

module.exports = router;