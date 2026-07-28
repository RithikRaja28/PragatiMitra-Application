"use strict";

/**
 * routes/builder/reports.js
 * Mount: app.use("/api/builder/reports", require("./routes/builder/reports"))
 *
 * GET    /                     list reports for caller's institution
 * POST   /                     create report
 * GET    /:id                  get report with full section tree
 * PUT    /:id                  update report metadata
 * DELETE /:id                  soft-delete report
 * GET    /:id/progress         section completion stats
 */

const express           = require("express");
const { randomUUID }    = require("crypto");
const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const { deleteReportFolder, deleteFile, renameFolder, reportDir, instituteDir } = require("../../utils/localStorage");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => typeof v === "string" && UUID_RE.test(v);

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function callerInstitution(req) {
  // super_admin may pass ?institution_id; others are locked to their own
  const roles = req.user.roles || [];
  if (roles.includes("super_admin") && req.query.institution_id) {
    return req.query.institution_id;
  }
  return req.user.institutionId || null;
}

/* ─── GET / — list reports ─────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { status, report_type, academic_year, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));

    const conditions = ["r.institution_id = $1", "r.deleted_at IS NULL"];
    const params     = [instId];

    if (status)        { params.push(status.toUpperCase());        conditions.push(`r.status = $${params.length}`); }
    if (report_type)   { params.push(report_type);                 conditions.push(`r.report_type = $${params.length}`); }
    if (academic_year) { params.push(academic_year);               conditions.push(`r.academic_year = $${params.length}`); }

    const where = conditions.join(" AND ");

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT r.id, r.title, r.report_type, r.academic_year, r.status,
                r.created_at, r.updated_at,
                u.full_name AS created_by_name
         FROM public.reports r
         LEFT JOIN public.users u ON u.id = r.created_by
         WHERE ${where}
         ORDER BY r.updated_at DESC
         LIMIT ${Math.min(100, Number(limit))} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM public.reports r WHERE ${where}`, params),
    ]);

    return res.json({
      success: true,
      data:    dataRes.rows,
      total:   Number(countRes.rows[0].count),
      page:    Number(page),
    });
  } catch (err) {
    logger.error("builder/reports GET /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list reports" });
  }
});

/* ─── POST / — create report ──────────────────────────────────────────────── */
router.post(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { title, description, report_type, academic_year, institution_id: bodyInstId,
              cover_image_url, logo_url, bg_image_url,
              cycle_id, template_id, primary_language = "en",
              default_workflow_id,
              submission_deadline, review_deadline, approval_deadline } = req.body;
      if (!title?.trim()) return res.status(400).json({ success: false, message: "title is required" });

      const roles  = req.user.roles || [];
      const instId = roles.includes("super_admin") && bodyInstId
        ? bodyInstId
        : req.user.institutionId;

      if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

      const { rows } = await pool.query(
        `INSERT INTO public.reports
           (institution_id, title, description, report_type, academic_year,
            cover_image_url, logo_url, bg_image_url,
            cycle_id, template_id, primary_language,
            default_workflow_id,
            submission_deadline, review_deadline, approval_deadline,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
         RETURNING *`,
        [instId, title.trim(), description || null, report_type || null, academic_year || null,
         cover_image_url || null, logo_url || null, bg_image_url || null,
         isUUID(cycle_id) ? cycle_id : null,
         isUUID(template_id) ? template_id : null,
         primary_language,
         isUUID(default_workflow_id) ? default_workflow_id : null,
         submission_deadline || null, review_deadline || null, approval_deadline || null,
         req.user.userId]
      );
      const report = rows[0];

      // If a template is provided, stamp it onto the report
      if (isUUID(template_id)) {
        await pool.query(
          `SELECT public.stamp_template_to_report($1, $2, $3)`,
          [report.id, template_id, req.user.userId]
        ).catch(e => logger.warn("Template stamp failed (non-fatal)", { err: e.message }));
      }

      await writeAuditLog(req, {
        actionType: "REPORT_CREATED",
        entityType: "REPORT",
        entityId:   report.id,
        newValue:   report,
        status:     "SUCCESS",
        message:    `Report "${report.title}" created`,
      });

      return res.status(201).json({ success: true, data: report });
    } catch (err) {
      logger.error("builder/reports POST /", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to create report" });
    }
  }
);

/* ─── GET /shared — reports shared with the caller's role ───────────────────── */
router.get("/shared", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const roles  = (req.user.roles || []).filter(r => r !== "super_admin");
    const instId = req.user.institutionId;
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });
    if (!roles.length) return res.json({ success: true, data: [], total: 0 });

    // Optional academic year filter (X-Academic-Year header: e.g. "2023" → "2023-2024")
    const headerYear = Number(req.get("X-Academic-Year"));
    const academicYearStr = (Number.isInteger(headerYear) && headerYear > 1900)
      ? `${headerYear}-${headerYear + 1}`
      : null;

    const params = [instId, ...roles];
    const placeholders = roles.map((_, i) => `$${i + 2}`).join(", ");
    const yearClause = academicYearStr
      ? `AND r.academic_year = $${params.push(academicYearStr)}`
      : "";

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (r.id) r.id, r.title, r.report_type, r.academic_year, r.status,
              r.primary_language, r.cover_image_url,
              r.submission_deadline, r.review_deadline, r.approval_deadline,
              r.created_at, r.updated_at,
              u.full_name AS created_by_name,
              rc.name     AS cycle_name
       FROM public.reports r
       JOIN public.report_access ra ON ra.report_id = r.id AND ra.revoked_at IS NULL
       LEFT JOIN public.users u  ON u.id  = r.created_by
       LEFT JOIN public.reporting_cycles rc ON rc.id = r.cycle_id
       WHERE r.institution_id = $1
         AND r.deleted_at IS NULL
         AND ra.role_name IN (${placeholders})
         ${yearClause}
       ORDER BY r.id, r.updated_at DESC`,
      params
    );

    return res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    logger.error("builder/reports GET /shared", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list shared reports" });
  }
});

/* ─── GET /:id — get report with section tree ─────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const { rows: rRows } = await pool.query(
      `SELECT r.*, u.full_name AS created_by_name
       FROM public.reports r
       LEFT JOIN public.users u ON u.id = r.created_by
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [id]
    );
    if (!rRows.length) return res.status(404).json({ success: false, message: "Report not found" });

    // Recursive section tree
    const { rows: sections } = await pool.query(
      `WITH RECURSIVE tree AS (
         SELECT s.*, 0 AS depth
         FROM public.report_sections s
         WHERE s.report_id = $1 AND s.parent_id IS NULL AND s.deleted_at IS NULL
         UNION ALL
         SELECT s.*, t.depth + 1
         FROM public.report_sections s
         JOIN tree t ON s.parent_id = t.id
         WHERE s.deleted_at IS NULL
       )
       SELECT t.*,
              u.full_name  AS locked_by_name,
              a.user_id    AS owner_id,
              au.full_name AS owner_name
       FROM tree t
       LEFT JOIN public.users u  ON u.id  = t.locked_by
       LEFT JOIN public.section_assignments a
         ON a.section_id = t.id AND a.role = 'OWNER' AND a.completed_at IS NULL
       LEFT JOIN public.users au ON au.id = a.user_id
       ORDER BY t.depth, t.order_index`,
      [id]
    );

    return res.json({ success: true, data: { ...rRows[0], sections } });
  } catch (err) {
    logger.error("builder/reports GET /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get report" });
  }
});

/* ─── GET /:id/progress — lightweight section completion counts ──────────────── */
router.get("/:id/progress", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const [statsRes, stepRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                                 AS total,
           COUNT(*) FILTER (WHERE status = 'NOT_STARTED')          AS not_started,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')          AS in_progress,
           COUNT(*) FILTER (WHERE status = 'SUBMITTED')            AS submitted,
           COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW')         AS under_review,
           COUNT(*) FILTER (WHERE status = 'APPROVED')             AS approved,
           COUNT(*) FILTER (WHERE status = 'SENT_BACK')            AS sent_back,
           COUNT(*) FILTER (WHERE status = 'LOCKED')               AS locked
         FROM public.report_sections
         WHERE report_id = $1 AND deleted_at IS NULL`,
        [id]
      ),
      /* per-step count: how many sections are currently waiting at each workflow step */
      pool.query(
        `SELECT ws.step_order, ws.step_name, ws.approver_role,
                COUNT(rs.id) AS section_count
         FROM public.report_sections rs
         JOIN public.workflow_steps ws ON ws.id = rs.current_step_id
         WHERE rs.report_id = $1
           AND rs.status IN ('SUBMITTED','UNDER_REVIEW')
           AND rs.deleted_at IS NULL
         GROUP BY ws.step_order, ws.step_name, ws.approver_role
         ORDER BY ws.step_order`,
        [id]
      ),
    ]);

    const s     = statsRes.rows[0];
    const total = Number(s.total);
    const done  = Number(s.approved) + Number(s.locked);

    return res.json({
      success: true,
      data: {
        total,
        not_started:  Number(s.not_started),
        in_progress:  Number(s.in_progress),
        submitted:    Number(s.submitted),
        under_review: Number(s.under_review),
        approved:     Number(s.approved),
        sent_back:    Number(s.sent_back),
        locked:       Number(s.locked),
        completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
        step_progress: stepRes.rows.map(r => ({
          step_order:    r.step_order,
          step_name:     r.step_name,
          approver_role: r.approver_role,
          count:         Number(r.section_count),
        })),
      },
    });
  } catch (err) {
    logger.error("builder/reports GET /:id/progress", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get progress" });
  }
});

/* ─── GET /:id/dashboard — admin stats dashboard ─────────────────────────────── */
router.get("/:id/dashboard", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const [reportRes, statsRes, deptRes, userRes, overdueRes, activityRes] = await Promise.all([
      pool.query(
        `SELECT r.*, c.name AS cycle_name, c.submission_deadline AS cycle_submission_deadline
         FROM public.reports r
         LEFT JOIN public.reporting_cycles c ON c.id = r.cycle_id
         WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]
      ),
      pool.query(
        `SELECT
           COUNT(*)                                                         AS total,
           COUNT(*) FILTER (WHERE status = 'NOT_STARTED')                  AS not_started,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')                  AS in_progress,
           COUNT(*) FILTER (WHERE status = 'SUBMITTED')                    AS submitted,
           COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW')                 AS under_review,
           COUNT(*) FILTER (WHERE status = 'APPROVED')                     AS approved,
           COUNT(*) FILTER (WHERE status = 'SENT_BACK')                    AS sent_back,
           COUNT(*) FILTER (WHERE status = 'LOCKED')                       AS locked,
           COUNT(*) FILTER (WHERE submission_deadline < NOW()
             AND status NOT IN ('APPROVED','LOCKED'))                       AS overdue
         FROM public.report_sections WHERE report_id = $1 AND deleted_at IS NULL`, [id]
      ),
      pool.query(
        `SELECT d.name AS department_name,
                COUNT(sa.id) AS assigned_sections,
                COUNT(sa.id) FILTER (WHERE rs.status = 'APPROVED') AS approved_sections
         FROM public.section_department_assignments sda
         JOIN public.departments d ON d.department_id = sda.department_id
         JOIN public.report_sections rs ON rs.id = sda.section_id AND rs.deleted_at IS NULL
         LEFT JOIN public.section_assignments sa ON sa.section_id = rs.id
         WHERE rs.report_id = $1
         GROUP BY d.department_id, d.name
         ORDER BY d.name`, [id]
      ),
      pool.query(
        `SELECT u.full_name, u.email,
                COUNT(sa.id) AS assigned_sections,
                COUNT(sa.id) FILTER (WHERE rs.status IN ('APPROVED','LOCKED')) AS completed_sections
         FROM public.section_assignments sa
         JOIN public.users u ON u.id = sa.user_id
         JOIN public.report_sections rs ON rs.id = sa.section_id AND rs.deleted_at IS NULL
         WHERE rs.report_id = $1
         GROUP BY u.id, u.full_name, u.email
         ORDER BY u.full_name`, [id]
      ),
      pool.query(
        `SELECT s.id, s.title, s.status, s.submission_deadline,
                u.full_name AS owner_name
         FROM public.report_sections s
         LEFT JOIN public.section_assignments sa ON sa.section_id = s.id AND sa.role = 'OWNER' AND sa.completed_at IS NULL
         LEFT JOIN public.users u ON u.id = sa.user_id
         WHERE s.report_id = $1 AND s.submission_deadline < NOW()
           AND s.status NOT IN ('APPROVED','LOCKED') AND s.deleted_at IS NULL
         ORDER BY s.submission_deadline`, [id]
      ),
      pool.query(
        `SELECT al.action_type AS action, al.message, al.created_at,
                u.full_name AS user_name
         FROM public.audit_logs al
         LEFT JOIN public.users u ON u.id = al.user_id
         WHERE al.entity_id = $1 OR al.entity_id IN (
           SELECT id FROM public.report_sections WHERE report_id = $1
         )
         ORDER BY al.created_at DESC LIMIT 20`, [id]
      ),
    ]);

    if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });

    const stats = statsRes.rows[0];
    const total = Number(stats.total);
    const ready = Number(stats.approved) + Number(stats.locked);

    return res.json({
      success: true,
      data: {
        report: reportRes.rows[0],
        progress: {
          ...stats,
          completion_pct: total > 0 ? Math.round((ready / total) * 100) : 0,
          export_ready: Number(stats.not_started) === 0 && Number(stats.in_progress) === 0 &&
                        Number(stats.submitted) === 0 && Number(stats.under_review) === 0 &&
                        Number(stats.sent_back) === 0,
        },
        departments: deptRes.rows,
        users: userRes.rows,
        overdue_sections: overdueRes.rows,
        activity: activityRes.rows,
      },
    });
  } catch (err) {
    logger.error("builder/reports GET /:id/dashboard", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get dashboard" });
  }
});

/* ─── PATCH /:id/lock — lock/unlock report ───────────────────────────────────── */
router.patch(
  "/:id/lock",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { id } = req.params;
      if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const { lock = true } = req.body;
      const { rows } = await pool.query(
        `UPDATE public.reports
         SET is_locked = $1,
             locked_by = $2,
             locked_at = $3,
             updated_by = $2
         WHERE id = $4 AND deleted_at IS NULL RETURNING id, title, is_locked`,
        [Boolean(lock), req.user.userId, lock ? new Date() : null, id]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: "Report not found" });

      await writeAuditLog(req, {
        actionType: lock ? "REPORT_LOCKED" : "REPORT_UNLOCKED",
        entityType: "REPORT", entityId: id,
        status: "SUCCESS", message: `Report ${lock ? "locked" : "unlocked"}`,
      });

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error("builder/reports PATCH /:id/lock", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to update lock status" });
    }
  }
);

/* ─── PUT /:id — update report metadata ─────────────────────────────────────── */
router.put(
  "/:id",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { id } = req.params;
      if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const allowed = ["title", "description", "report_type", "academic_year", "status",
                       "cover_image_url", "logo_url", "bg_image_url",
                       "cycle_id", "primary_language", "default_workflow_id",
                       "submission_deadline", "review_deadline", "approval_deadline"];
      const sets    = [];
      const params  = [];

      for (const field of allowed) {
        if (req.body[field] !== undefined) {
          params.push(field === "status" ? req.body[field].toUpperCase() : req.body[field]);
          sets.push(`${field} = $${params.length}`);
        }
      }
      if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });

      const { rows: oldRows } = await pool.query(
        `SELECT r.title, r.cover_image_url, r.logo_url, r.bg_image_url, i.institution_id, i.institution_name
         FROM public.reports r
         JOIN public.institutions i ON i.institution_id = r.institution_id
         WHERE r.id = $1`,
        [id]
      );
      if (!oldRows.length) return res.status(404).json({ success: false, message: "Report not found" });

      const old = oldRows[0];
      const oldTitle = old.title;
      const institutionId = old.institution_id;
      const institutionName = old.institution_name;

      params.push(req.user.userId);
      sets.push(`updated_by = $${params.length}`);
      params.push(id);

      const { rows } = await pool.query(
        `UPDATE public.reports SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
        params
      );
      if (!rows.length) return res.status(404).json({ success: false, message: "Report not found" });

      const checkAndDel = async (oldUrl, newUrl) => {
        if (oldUrl && newUrl !== undefined && oldUrl !== newUrl) {
          const match = oldUrl.match(/\/uploads\/(.+)$/);
          if (match) await deleteFile(match[1]).catch(() => {});
        }
      };
      await checkAndDel(old?.cover_image_url, req.body.cover_image_url);
      await checkAndDel(old?.logo_url, req.body.logo_url);
      await checkAndDel(old?.bg_image_url, req.body.bg_image_url);

      // If title changed, rename the storage folder and cascade URLs in DB
      if (req.body.title && req.body.title !== oldTitle) {
        const oldSlug = reportDir(oldTitle, id);
        const newSlug = reportDir(req.body.title, id);
        if (oldSlug !== newSlug) {
          const instPart = instituteDir(institutionName, institutionId);
          const oldPrefix = `${instPart}/reports/${oldSlug}`;
          const newPrefix = `${instPart}/reports/${newSlug}`;
          
          await renameFolder(oldPrefix, newPrefix);
          
          // 1) Update all related report_blocks URLs
          await pool.query(
            `UPDATE public.report_blocks 
             SET content = (REPLACE(content::text, $1, $2))::jsonb 
             WHERE report_id = $3`,
            [`/uploads/${oldPrefix}/`, `/uploads/${newPrefix}/`, id]
          );

          // 2) Update report's own branding URLs
          await pool.query(
            `UPDATE public.reports
             SET logo_url = REPLACE(logo_url, $1, $2),
                 cover_image_url = REPLACE(cover_image_url, $1, $2),
                 bg_image_url = REPLACE(bg_image_url, $1, $2)
             WHERE id = $3`,
            [`/uploads/${oldPrefix}/`, `/uploads/${newPrefix}/`, id]
          );
          
          // Re-fetch the row to return the updated branding URLs
          const { rows: updatedBranding } = await pool.query(
            `SELECT * FROM public.reports WHERE id = $1`, [id]
          );
          rows[0] = updatedBranding[0];
        }
      }

      await writeAuditLog(req, {
        actionType: "REPORT_UPDATED",
        entityType: "REPORT",
        entityId:   id,
        newValue:   req.body,
        status:     "SUCCESS",
        message:    `Report updated`,
      });

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error("builder/reports PUT /:id", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to update report" });
    }
  }
);

/* ─── DELETE /:id — soft delete ───────────────────────────────────────────── */
router.delete(
  "/:id",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { id } = req.params;
      if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const { rows } = await pool.query(
        `UPDATE public.reports SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, title, institution_id`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: "Report not found" });

      const report = rows[0];
      const { rows: iRows } = await pool.query(
        `SELECT institution_name FROM public.institutions WHERE institution_id = $1`,
        [report.institution_id]
      );
      if (iRows.length) {
        await deleteReportFolder(iRows[0].institution_name, report.institution_id, report.title, report.id);
      }

      await writeAuditLog(req, {
        actionType: "REPORT_DELETED",
        entityType: "REPORT",
        entityId:   id,
        status:     "SUCCESS",
        message:    `Report "${rows[0].title}" soft-deleted`,
      });

      return res.json({ success: true, message: "Report deleted" });
    } catch (err) {
      logger.error("builder/reports DELETE /:id", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to delete report" });
    }
  }
);

/* ─── GET /:id/progress ────────────────────────────────────────────────────── */
router.get("/:id/progress", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (WHERE status = 'DRAFT')             AS draft,
         COUNT(*) FILTER (WHERE status = 'SUBMITTED')         AS submitted,
         COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW')      AS under_review,
         COUNT(*) FILTER (WHERE status = 'APPROVED')          AS approved,
         COUNT(*) FILTER (WHERE status = 'REJECTED')          AS rejected,
         COUNT(*) FILTER (WHERE status = 'REVISION_REQUIRED') AS revision_required
       FROM public.report_sections
       WHERE report_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/reports GET /:id/progress", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get progress" });
  }
});

/* ─── PUT /:id/branding — upsert branding assignments ───────────────────── */
router.put(
  "/:id/branding",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { id } = req.params;
      if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const { rows: oldReportRows } = await pool.query(
        `SELECT cover_image_url, logo_url, bg_image_url FROM public.reports WHERE id = $1`,
        [id]
      );
      const { rows: oldAssignRows } = await pool.query(
        `SELECT asset_type, asset_url FROM public.branding_assignments WHERE report_id = $1`,
        [id]
      );

      // Update branding URL columns on the report itself
      const { cover_image_url, logo_url, bg_image_url } = req.body;
      await pool.query(
        `UPDATE public.reports
         SET cover_image_url = COALESCE($1, cover_image_url),
             logo_url        = COALESCE($2, logo_url),
             bg_image_url    = COALESCE($3, bg_image_url),
             updated_by      = $4
         WHERE id = $5 AND deleted_at IS NULL`,
        [cover_image_url ?? null, logo_url ?? null, bg_image_url ?? null,
         req.user.userId, id]
      );

      // Upsert individual asset assignments
      const assignments = req.body.assignments || [];
      const VALID_TYPES = ["COVER_IMAGE", "LOGO", "BG_IMAGE"];

      for (const a of assignments) {
        if (!VALID_TYPES.includes(a.asset_type)) continue;
        if (a.user_id && !isUUID(a.user_id)) continue;

        await pool.query(
          `INSERT INTO public.branding_assignments
             (report_id, asset_type, user_id, asset_url, assigned_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (report_id, asset_type) DO UPDATE
             SET user_id     = EXCLUDED.user_id,
                 asset_url   = EXCLUDED.asset_url,
                 assigned_by = EXCLUDED.assigned_by,
                 assigned_at = NOW()`,
          [id, a.asset_type, a.user_id || null, a.asset_url || null, req.user.userId]
        );
      }

      const checkAndDel = async (oldUrl, newUrl) => {
        if (oldUrl && newUrl !== undefined && oldUrl !== newUrl) {
          const match = oldUrl.match(/\/uploads\/(.+)$/);
          if (match) await deleteFile(match[1]).catch(() => {});
        }
      };
      const old = oldReportRows[0] || {};
      await checkAndDel(old.cover_image_url, cover_image_url);
      await checkAndDel(old.logo_url, logo_url);
      await checkAndDel(old.bg_image_url, bg_image_url);
      
      for (const a of assignments) {
        if (!VALID_TYPES.includes(a.asset_type)) continue;
        const oldAssign = oldAssignRows.find(o => o.asset_type === a.asset_type);
        if (oldAssign) {
          await checkAndDel(oldAssign.asset_url, a.asset_url);
        }
      }

      await writeAuditLog(req, {
        actionType: "REPORT_BRANDING_UPDATED",
        entityType: "REPORT",
        entityId:   id,
        newValue:   req.body,
        status:     "SUCCESS",
        message:    `Report branding updated`,
      });

      return res.json({ success: true, message: "Branding saved" });
    } catch (err) {
      logger.error("builder/reports PUT /:id/branding", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to save branding" });
    }
  }
);

/* ─── GET /:id/branding — get branding assignments for a report ──────────── */
router.get("/:id/branding", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const [reportRes, assignRes] = await Promise.all([
      pool.query(
        `SELECT cover_image_url, logo_url, bg_image_url FROM public.reports WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      ),
      pool.query(
        `SELECT ba.asset_type, ba.asset_url, ba.assigned_at,
                u.id AS user_id, u.full_name AS user_name
         FROM public.branding_assignments ba
         LEFT JOIN public.users u ON u.id = ba.user_id
         WHERE ba.report_id = $1`,
        [id]
      ),
    ]);

    if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });

    return res.json({
      success: true,
      data: {
        ...reportRes.rows[0],
        assignments: assignRes.rows,
      },
    });
  } catch (err) {
    logger.error("builder/reports GET /:id/branding", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get branding" });
  }
});

/* ─── GET /:id/access ── list report_access entries ──────────────────────── */
router.get("/:id/access", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { rows } = await pool.query(
      `SELECT id, role_name, granted_at
       FROM public.report_access
       WHERE report_id = $1 AND revoked_at IS NULL
       ORDER BY role_name`, [id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/reports GET /:id/access", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get access" });
  }
});

/* ─── PUT /:id/access ── bulk replace report_access ─────────────────────── */
router.put("/:id/access", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { role_names = [] } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM public.report_access WHERE report_id = $1`, [id]);
      for (const rn of role_names) {
        if (!rn || typeof rn !== "string") continue;
        await client.query(
          `INSERT INTO public.report_access (report_id, role_name, granted_by)
           VALUES ($1,$2,$3) ON CONFLICT (report_id, role_name) DO NOTHING`,
          [id, rn, req.user.userId]
        );
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
    return res.json({ success: true });
  } catch (err) {
    logger.error("builder/reports PUT /:id/access", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update access" });
  }
});

/* ─── GET /:id/department-deadlines ─────────────────────────────────────── */
router.get("/:id/department-deadlines", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { rows } = await pool.query(
      `SELECT rdd.*, d.name AS department_name
       FROM public.report_department_deadlines rdd
       JOIN public.departments d ON d.department_id = rdd.department_id
       WHERE rdd.report_id = $1
       ORDER BY d.name`, [id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/reports GET /:id/dept-deadlines", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get dept deadlines" });
  }
});

/* ─── PUT /:id/department-deadlines ── bulk upsert ────────────────────────── */
router.put("/:id/department-deadlines", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { deadlines = [] } = req.body;
    for (const d of deadlines) {
      if (!isUUID(d.department_id)) continue;
      await pool.query(
        `INSERT INTO public.report_department_deadlines
           (report_id, department_id, submission_deadline, review_deadline, approval_deadline, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (report_id, department_id) DO UPDATE
           SET submission_deadline = $3,
               review_deadline     = $4,
               approval_deadline   = $5,
               updated_by          = $6,
               updated_at          = NOW()`,
        [id, d.department_id, d.submission_deadline || null,
         d.review_deadline || null, d.approval_deadline || null, req.user.userId]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error("builder/reports PUT /:id/dept-deadlines", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to save dept deadlines" });
  }
});

/* ─── GET /:id/workflow-assignments ─────────────────────────────────────── */
router.get("/:id/workflow-assignments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { rows } = await pool.query(
      `SELECT swa.*,
              u.full_name  AS user_name,
              d.name       AS department_name
       FROM public.section_workflow_assignments swa
       LEFT JOIN public.users u ON u.id = swa.user_id
       LEFT JOIN public.departments d ON d.department_id = swa.department_id
       WHERE swa.report_id = $1
       ORDER BY swa.section_id, swa.workflow_step_id NULLS FIRST`, [id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/reports GET /:id/wf-assignments", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get workflow assignments" });
  }
});

/* ─── PUT /:id/workflow-assignments ── bulk replace ─────────────────────── */
router.put("/:id/workflow-assignments", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const { assignments = [] } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Replace workflow assignments
      await client.query(`DELETE FROM public.section_workflow_assignments WHERE report_id = $1`, [id]);
      for (const a of assignments) {
        if (!isUUID(a.section_id)) continue;
        if (!["USER", "DEPARTMENT", "ROLE"].includes(a.assignee_type)) continue;
        await client.query(
          `INSERT INTO public.section_workflow_assignments
             (report_id, section_id, workflow_step_id, assignee_type,
              user_id, department_id, role_name, due_at, assigned_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, a.section_id,
           isUUID(a.workflow_step_id) ? a.workflow_step_id : null,
           a.assignee_type,
           isUUID(a.user_id) ? a.user_id : null,
           isUUID(a.department_id) ? a.department_id : null,
           a.role_name || null,
           a.due_at || null,
           req.user.userId]
        );
      }

      // Mirror USER author assignments (no workflow_step_id) into section_assignments
      // so GET /api/builder/sections/assigned can find them for assigned users.
      await client.query(
        `DELETE FROM public.section_assignments
         WHERE section_id IN (
           SELECT id FROM public.report_sections WHERE report_id = $1 AND deleted_at IS NULL
         ) AND role = 'OWNER'`,
        [id]
      );
      for (const a of assignments) {
        if (!isUUID(a.section_id)) continue;
        if (a.assignee_type !== "USER" || !isUUID(a.user_id)) continue;
        if (a.workflow_step_id) continue; // skip review-step assignments; only mirror author assignments
        await client.query(
          `INSERT INTO public.section_assignments
             (section_id, user_id, role, due_at, assigned_by)
           VALUES ($1, $2, 'OWNER', $3, $4)
           ON CONFLICT (section_id, user_id) DO UPDATE
             SET role = 'OWNER', due_at = EXCLUDED.due_at,
                 assigned_by = EXCLUDED.assigned_by, completed_at = NULL`,
          [a.section_id, a.user_id, a.due_at || null, req.user.userId]
        );
        // Notify the assigned user
        pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           VALUES ($1, 'SECTION_ASSIGNED', 'Section assigned to you',
                   'You have been assigned to author a section.', 'SECTION', $2)`,
          [a.user_id, a.section_id]
        ).catch(() => {});
      }

      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    // Notify NOA users (dept admins) for every DEPARTMENT-type assignment
    const deptIds = [...new Set(
      assignments
        .filter(a => a.assignee_type === "DEPARTMENT" && isUUID(a.department_id))
        .map(a => a.department_id)
    )];
    for (const deptId of deptIds) {
      const noaRes = await pool.query(
        `SELECT DISTINCT user_id FROM public.nodal_officer_assignments
         WHERE department_id = $1 AND is_active = TRUE`, [deptId]
      ).catch(() => ({ rows: [] }));
      for (const { user_id } of noaRes.rows) {
        pool.query(`
          INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
          VALUES ($1, 'SECTION_ASSIGNED',
                  'Report sections assigned to your department',
                  'Section(s) have been assigned to your department. Please delegate them to a team member.',
                  'REPORT', $2)
        `, [user_id, id]).catch(() => {});
      }
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error("builder/reports PUT /:id/wf-assignments", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to save workflow assignments" });
  }
});

module.exports = router;
