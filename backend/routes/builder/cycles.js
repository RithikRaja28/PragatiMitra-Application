"use strict";

/**
 * routes/builder/cycles.js
 * Mount: app.use("/api/builder/cycles", require("./routes/builder/cycles"))
 *
 * GET    /                          list cycles for institution
 * POST   /                          create cycle
 * GET    /:id                       get cycle with stats
 * PUT    /:id                       update cycle (deadlines, name, etc.)
 * PATCH  /:id/close                 close cycle
 * PATCH  /:id/archive               archive cycle
 * GET    /:id/departments           list dept deadline overrides
 * PUT    /:id/departments           upsert dept deadline overrides
 */

const express           = require("express");
const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

function callerInstitution(req) {
  const roles = req.user.roles || [];
  if (roles.includes("super_admin") && req.query.institution_id) return req.query.institution_id;
  return req.user.institutionId || null;
}

/* ── GET / ── list cycles ───────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const params = [instId];
    const conds  = ["c.institution_id = $1"];

    if (status) { params.push(status.toUpperCase()); conds.push(`c.status = $${params.length}`); }

    const where = conds.join(" AND ");
    const [data, count] = await Promise.all([
      pool.query(
        `SELECT c.*,
                u.full_name AS created_by_name,
                COUNT(r.id) AS report_count
         FROM   public.reporting_cycles c
         LEFT JOIN public.users u ON u.id = c.created_by
         LEFT JOIN public.reports r ON r.cycle_id = c.id AND r.deleted_at IS NULL
         WHERE  ${where}
         GROUP BY c.id, u.full_name
         ORDER BY c.created_at DESC
         LIMIT ${Math.min(100, Number(limit))} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM public.reporting_cycles c WHERE ${where}`, params),
    ]);

    return res.json({ success: true, data: data.rows, total: Number(count.rows[0].count), page: Number(page) });
  } catch (err) {
    logger.error("cycles GET /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list cycles" });
  }
});

/* ── POST / ── create cycle ─────────────────────────────────────────────────── */
router.post("/", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { name, description, start_date, end_date, reporting_year,
            submission_deadline, review_deadline, approval_deadline } = req.body;

    if (!name?.trim())   return res.status(400).json({ success: false, message: "name is required" });
    if (!start_date)     return res.status(400).json({ success: false, message: "start_date is required" });
    if (!end_date)       return res.status(400).json({ success: false, message: "end_date is required" });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ success: false, message: "end_date must be >= start_date" });

    const { rows } = await pool.query(
      `INSERT INTO public.reporting_cycles
         (institution_id, name, description, start_date, end_date, reporting_year,
          submission_deadline, review_deadline, approval_deadline, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       RETURNING *`,
      [instId, name.trim(), description || null, start_date, end_date,
       reporting_year || null, submission_deadline || null, review_deadline || null,
       approval_deadline || null, req.user.userId]
    );

    await writeAuditLog(req, {
      actionType: "CYCLE_CREATED", entityType: "CYCLE", entityId: rows[0].id,
      newValue: rows[0], status: "SUCCESS", message: `Cycle "${rows[0].name}" created`,
    });

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("cycles POST /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create cycle" });
  }
});

/* ── GET /:id ── get cycle with progress stats ──────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const [cycleRes, statsRes] = await Promise.all([
      pool.query(
        `SELECT c.*, u.full_name AS created_by_name
         FROM public.reporting_cycles c
         LEFT JOIN public.users u ON u.id = c.created_by
         WHERE c.id = $1`, [id]
      ),
      pool.query(
        `SELECT
           COUNT(r.id)                                                AS total_reports,
           COUNT(r.id) FILTER (WHERE r.status = 'DRAFT')             AS draft_reports,
           COUNT(r.id) FILTER (WHERE r.status = 'PUBLISHED')         AS published_reports,
           COUNT(rs.id)                                               AS total_sections,
           COUNT(rs.id) FILTER (WHERE rs.status = 'APPROVED')        AS approved_sections,
           COUNT(rs.id) FILTER (WHERE rs.status = 'SUBMITTED')       AS submitted_sections,
           COUNT(rs.id) FILTER (WHERE rs.status = 'UNDER_REVIEW')    AS under_review_sections
         FROM public.reports r
         LEFT JOIN public.report_sections rs ON rs.report_id = r.id AND rs.deleted_at IS NULL
         WHERE r.cycle_id = $1 AND r.deleted_at IS NULL`, [id]
      ),
    ]);

    if (!cycleRes.rows.length) return res.status(404).json({ success: false, message: "Cycle not found" });

    return res.json({ success: true, data: { ...cycleRes.rows[0], stats: statsRes.rows[0] } });
  } catch (err) {
    logger.error("cycles GET /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get cycle" });
  }
});

/* ── PUT /:id ── update cycle ───────────────────────────────────────────────── */
router.put("/:id", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const allowed = ["name","description","start_date","end_date","reporting_year",
                     "submission_deadline","review_deadline","approval_deadline"];
    const sets = [], params = [];

    for (const f of allowed) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });

    params.push(req.user.userId); sets.push(`updated_by = $${params.length}`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE public.reporting_cycles SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Cycle not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("cycles PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update cycle" });
  }
});

/* ── PATCH /:id/close ── close a cycle ─────────────────────────────────────── */
router.patch("/:id/close", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const { rows } = await pool.query(
      `UPDATE public.reporting_cycles
       SET status = 'CLOSED', closed_at = NOW(), closed_by = $1, updated_by = $1
       WHERE id = $2 AND status = 'ACTIVE' RETURNING *`,
      [req.user.userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Cycle not found or not ACTIVE" });

    await writeAuditLog(req, {
      actionType: "CYCLE_CLOSED", entityType: "CYCLE", entityId: id,
      status: "SUCCESS", message: `Cycle closed`,
    });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("cycles PATCH /:id/close", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to close cycle" });
  }
});

/* ── PATCH /:id/archive ── archive a cycle ──────────────────────────────────── */
router.patch("/:id/archive", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const { rows } = await pool.query(
      `UPDATE public.reporting_cycles
       SET status = 'ARCHIVED', archived_at = NOW(), archived_by = $1, updated_by = $1
       WHERE id = $2 AND status = 'CLOSED' RETURNING *`,
      [req.user.userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Cycle not found or not CLOSED" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("cycles PATCH /:id/archive", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to archive cycle" });
  }
});

/* ── GET /:id/departments ── list dept deadline overrides ───────────────────── */
router.get("/:id/departments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const { rows } = await pool.query(
      `SELECT cdd.*, d.department_name
       FROM public.cycle_department_deadlines cdd
       JOIN public.departments d ON d.department_id = cdd.department_id
       WHERE cdd.cycle_id = $1
       ORDER BY d.department_name`, [id]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("cycles GET /:id/departments", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get dept deadlines" });
  }
});

/* ── PUT /:id/departments ── upsert dept deadline overrides ─────────────────── */
router.put("/:id/departments", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid cycle id" });

    const { overrides } = req.body; // [{ department_id, submission_deadline, review_deadline }]
    if (!Array.isArray(overrides)) return res.status(400).json({ success: false, message: "overrides[] required" });

    for (const o of overrides) {
      if (!isUUID(o.department_id)) continue;
      await pool.query(
        `INSERT INTO public.cycle_department_deadlines
           (cycle_id, department_id, submission_deadline, review_deadline, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (cycle_id, department_id) DO UPDATE
           SET submission_deadline = EXCLUDED.submission_deadline,
               review_deadline     = EXCLUDED.review_deadline,
               updated_at          = NOW()`,
        [id, o.department_id, o.submission_deadline || null, o.review_deadline || null, req.user.userId]
      );
    }

    return res.json({ success: true, message: "Department deadlines saved" });
  } catch (err) {
    logger.error("cycles PUT /:id/departments", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to save dept deadlines" });
  }
});

module.exports = router;
