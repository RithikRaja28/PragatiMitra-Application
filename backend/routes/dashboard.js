"use strict";

/**
 * routes/dashboard.js  →  mounted at /api/dashboard
 * ─────────────────────────────────────────────────────────────────────────
 * Domain-scoped dashboard metrics (Part 2). Read-only aggregation — never
 * writes, never changes existing routes/DB. Powers the Hospital + Finance
 * dashboards (and any other domain-scoped consumer) with LIVE data instead of
 * static numbers. Everything is scoped by the caller's:
 *   domain (form_domain = users.role_domain) + institution + selected year.
 * Hospital/Finance users only ever see their own domain's forms/records.
 */

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { resolveUserDomain } = require("../services/domainService");
const { resolveOperatingYear } = require("../services/academicYearService");
const logger = require("../utils/logger");

const router = express.Router();
router.use(verifyToken);

const SLUG_RE = /^[a-z][a-z0-9_]*$/;

/* GET /api/dashboard/summary
   Returns { domain, metrics, recent_activity } for the caller's domain +
   institution. metrics = { total_forms, active_forms, pending_deadlines,
   total_records, assigned_users }. */
router.get("/summary", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    // Domain — hospital / finance / academic. super/institute admin resolve to
    // null (cross-domain); they don't use this dashboard, so default to academic.
    let domain = null;
    try { domain = await resolveUserDomain(pool, req); } catch { domain = null; }
    if (!domain) domain = "academic";

    // Institution — JWT value, with a live DB fallback.
    const { rows: uRows } = await pool.query(
      "SELECT institution_id FROM users WHERE id = $1",
      [req.user.userId]
    );
    const institutionId = req.user.institutionId || uRows[0]?.institution_id || null;

    const emptyMetrics = {
      total_forms: 0, active_forms: 0, pending_deadlines: 0,
      total_records: 0, assigned_users: 0,
    };
    if (!institutionId)
      return res.json({ success: true, domain, metrics: emptyMetrics, recent_activity: [] });

    // Selected academic year (top-bar) → for per-year deadlines. N-3 — fall back to
    // the institution's ACTIVE → latest real academic year (never the calendar year),
    // matching every other surface. A null year simply yields no per-year overrides
    // (form-wide deadlines still apply), so the dashboard never invents a year.
    const headerYear = Number(req.get("X-Academic-Year"));
    const year = Number.isInteger(headerYear) ? headerYear : await resolveOperatingYear(pool, institutionId);

    // Domain forms accessible to this institution, with their form-wide lock +
    // deadline. institute_access = the institutions a form is shared with.
    const { rows: forms } = await pool.query(
      `SELECT tl.id, tl.form_name,
              COALESCE(flc.is_locked, false) AS is_locked,
              flc.deadline_at,
              (SELECT schema->>'display_label' FROM custom_field_schemas
               WHERE form_name = tl.form_name ORDER BY created_at DESC LIMIT 1) AS form_display_name
         FROM table_list tl
         LEFT JOIN form_lock_config flc
           ON flc.form_name = tl.form_name AND flc.institution_id = $1
        WHERE COALESCE(tl.form_domain, 'academic') = $2
          AND $1 = ANY(COALESCE(tl.institute_access, '{}'::uuid[]))
        ORDER BY tl.form_name`,
      [institutionId, domain]
    );

    const formIds = forms.map((f) => f.id);

    // Per-year deadline overrides (Bug 6) — a year-scoped deadline wins for `year`.
    const yearDeadline = new Map();
    if (formIds.length) {
      const { rows: yd } = await pool.query(
        `SELECT form_name, deadline_at FROM form_year_deadlines
          WHERE institution_id = $1 AND academic_year = $2`,
        [institutionId, year]
      );
      for (const r of yd) yearDeadline.set(r.form_name, r.deadline_at);
    }

    // Distinct contributors actively assigned to this domain's forms.
    let assignedUsers = 0;
    if (formIds.length) {
      const { rows: au } = await pool.query(
        `SELECT COUNT(DISTINCT assigned_to)::int AS n
           FROM form_assignments
          WHERE form_id = ANY($1::uuid[]) AND institution_id = $2 AND is_active = true`,
        [formIds, institutionId]
      );
      assignedUsers = au[0]?.n || 0;
    }

    // Records per form — sum English rows; capture last activity. Each form has its
    // own physical {form_name}_records table; a missing table (form never received
    // data) counts as 0 and is skipped, never an error.
    /* N-4 — count records in BOUNDED-PARALLEL batches instead of one sequential
       query per form. Wall-clock drops from N×latency to ~ceil(N/8)×latency for a
       large institution, while the per-table try/catch (missing table → 0) and the
       (institution_id, created_at) index keep each query cheap. Results are
       identical (activity is sorted by last_updated below). */
    let totalRecords = 0;
    const activity = [];
    const countForms = forms.filter((f) => SLUG_RE.test(f.form_name));
    const COUNT_CONCURRENCY = 8;
    for (let i = 0; i < countForms.length; i += COUNT_CONCURRENCY) {
      const batch = countForms.slice(i, i + COUNT_CONCURRENCY);
      const results = await Promise.all(batch.map(async (f) => {
        try {
          const { rows: rc } = await pool.query(
            `SELECT COUNT(*)::int AS n, MAX(created_at) AS last
               FROM ${f.form_name}_records
              WHERE institution_id = $1 AND (language = 'en' OR language IS NULL)`,
            [institutionId]
          );
          return { form_name: f.form_name, form_display_name: f.form_display_name, n: rc[0]?.n || 0, last: rc[0]?.last || null };
        } catch {
          return { form_name: f.form_name, form_display_name: f.form_display_name, n: 0, last: null }; // records table absent → 0
        }
      }));
      for (const r of results) {
        totalRecords += r.n;
        if (r.last) activity.push({ form_name: r.form_name, form_display_name: r.form_display_name, record_count: r.n, last_updated: r.last });
      }
    }

    const now = Date.now();
    const lockedForms  = forms.filter((f) => f.is_locked).length;
    const activeForms  = forms.filter((f) => !f.is_locked).length;

    const expiredForms = forms.filter((f) => {
      const dl = yearDeadline.has(f.form_name) ? yearDeadline.get(f.form_name) : f.deadline_at;
      return dl && new Date(dl).getTime() <= now;
    }).length;

    const pendingDeadlines = forms.filter((f) => {
      const dl = yearDeadline.has(f.form_name) ? yearDeadline.get(f.form_name) : f.deadline_at;
      return dl && new Date(dl).getTime() > now;
    }).length;

    // openForms = not locked AND not expired
    const openForms = forms.filter((f) => {
      const dl = yearDeadline.has(f.form_name) ? yearDeadline.get(f.form_name) : f.deadline_at;
      const isExpired = dl && new Date(dl).getTime() <= now;
      return !f.is_locked && !isExpired;
    }).length;

    activity.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));

    return res.json({
      success: true,
      domain,
      metrics: {
        // Canonical set (used by DomainDashboardPage)
        assigned_forms:   forms.length,
        open_forms:       openForms,
        locked_forms:     lockedForms,
        expired_forms:    expiredForms,
        // Legacy aliases (kept for any consumer still reading these)
        total_forms:      forms.length,
        active_forms:     activeForms,
        pending_deadlines: pendingDeadlines,
        total_records:    totalRecords,
        assigned_users:   assignedUsers,
      },
      recent_activity: activity.slice(0, 5),
    });
  } catch (err) {
    logger.error("GET /api/dashboard/summary failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load dashboard summary." });
  }
});

/* =============================================================================
 *  Institute Admin Dashboard — academic-year-scoped endpoints
 *
 *  All four routes share the same resolution contract:
 *    • institution_id  — from JWT (req.user.institutionId)
 *    • year (integer)  — X-Academic-Year header → resolveOperatingYear fallback
 *    • academic_year   — "${year}-${year+1}" matching reports.academic_year
 *
 *  Mounted at /api/dashboard/institute/*
 * =========================================================================== */

async function resolveInstituteYear(pool, req) {
  const institutionId = req.user.institutionId || null;
  const headerYear    = Number(req.get("X-Academic-Year"));
  const year          = Number.isInteger(headerYear) && headerYear > 1900
    ? headerYear
    : await resolveOperatingYear(pool, institutionId);
  return { institutionId, year, academicYearStr: `${year}-${year + 1}` };
}

/* PostgreSQL error code 42P01 = "relation does not exist".
   The report-builder module tables are optional — when they haven't been
   migrated yet the dashboard silently returns empty arrays instead of 500. */
const isUndefinedTable = (err) => err.code === "42P01";

/* ── GET /api/dashboard/institute/pending-approvals ──────────────────────────
   Sections in SUBMITTED / UNDER_REVIEW status for the institution + year,
   ordered oldest-first so the most overdue items surface first.             */
router.get("/institute/pending-approvals", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId, academicYearStr } = await resolveInstituteYear(pool, req);
    if (!institutionId) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.title                                              AS section_title,
         r.id                                                 AS report_id,
         r.title                                              AS report_title,
         r.report_type,
         s.status,
         s.updated_at                                         AS submitted_at,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - s.updated_at)) / 86400)::int
                                                              AS pending_days,
         ws.step_name                                         AS current_step_name,
         COALESCE(dept.name, '—')                             AS department_name
       FROM public.report_sections s
       JOIN public.reports r
         ON r.id            = s.report_id
        AND r.deleted_at    IS NULL
        AND r.institution_id = $1
        AND r.academic_year  = $2
       LEFT JOIN public.workflow_steps ws ON ws.id = s.current_step_id
       LEFT JOIN LATERAL (
         SELECT d.name
           FROM public.section_workflow_assignments swa
           JOIN public.departments d ON d.id = swa.department_id
          WHERE swa.section_id       = s.id
            AND swa.assignee_type    = 'DEPARTMENT'
            AND swa.workflow_step_id IS NULL
          LIMIT 1
       ) dept ON true
       WHERE s.status IN ('SUBMITTED', 'UNDER_REVIEW')
         AND s.deleted_at IS NULL
       ORDER BY s.updated_at ASC`,
      [institutionId, academicYearStr]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    if (isUndefinedTable(err)) return res.json({ success: true, data: [] });
    logger.error("GET /api/dashboard/institute/pending-approvals failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load pending approvals." });
  }
});

/* ── GET /api/dashboard/institute/department-health ──────────────────────────
   Per-department section counts + completion % for the selected year.
   Only active departments. Only sections whose report matches inst + year.  */
router.get("/institute/department-health", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId, academicYearStr } = await resolveInstituteYear(pool, req);
    if (!institutionId) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT
         d.id                                                             AS department_id,
         d.name                                                           AS department_name,
         COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL)            AS total_sections,
         COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL AND s.status = 'APPROVED')
                                                                          AS completed_sections,
         COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL AND s.status IN ('SUBMITTED','UNDER_REVIEW'))
                                                                          AS pending_approvals,
         ROUND(
           CASE WHEN COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL) > 0
           THEN COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL AND s.status = 'APPROVED')
                * 100.0
                / COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL)
           ELSE 0 END
         )                                                                AS completion_pct,
         MAX(s.updated_at) FILTER (WHERE r.id IS NOT NULL)               AS last_activity
       FROM public.departments d
       LEFT JOIN public.section_workflow_assignments swa
         ON swa.department_id    = d.id
        AND swa.assignee_type    = 'DEPARTMENT'
        AND swa.workflow_step_id IS NULL
       LEFT JOIN public.report_sections s
         ON s.id = swa.section_id AND s.deleted_at IS NULL
       LEFT JOIN public.reports r
         ON r.id            = s.report_id
        AND r.deleted_at    IS NULL
        AND r.institution_id = $1
        AND r.academic_year  = $2
       WHERE d.institution_id = $1 AND d.status = 'ACTIVE'
       GROUP BY d.id, d.name
       ORDER BY d.name`,
      [institutionId, academicYearStr]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    if (isUndefinedTable(err)) return res.json({ success: true, data: [] });
    logger.error("GET /api/dashboard/institute/department-health failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load department health." });
  }
});

/* ── GET /api/dashboard/institute/activity-timeline ─────────────────────────
   Weekly submission counts (section_versions SUBMITTED events) for the year,
   ordered chronologically for charting.                                     */
router.get("/institute/activity-timeline", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId, academicYearStr } = await resolveInstituteYear(pool, req);
    if (!institutionId) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT
         DATE_TRUNC('week', sv.created_at)::date AS week_start,
         COUNT(*)::int                            AS submission_count
       FROM public.section_versions sv
       JOIN public.report_sections s
         ON s.id = sv.section_id AND s.deleted_at IS NULL
       JOIN public.reports r
         ON r.id            = s.report_id
        AND r.deleted_at    IS NULL
        AND r.institution_id = $1
        AND r.academic_year  = $2
       WHERE sv.event = 'SUBMITTED'
       GROUP BY DATE_TRUNC('week', sv.created_at)
       ORDER BY week_start ASC`,
      [institutionId, academicYearStr]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    if (isUndefinedTable(err)) return res.json({ success: true, data: [] });
    logger.error("GET /api/dashboard/institute/activity-timeline failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load activity timeline." });
  }
});

/* ── GET /api/dashboard/institute/bottlenecks?inactive_days=7 ────────────────
   Sections that are stalled (inactive ≥ N days), past their submission
   deadline, or sent back ≥ 2 times. Excludes terminal statuses.            */
router.get("/institute/bottlenecks", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId, academicYearStr } = await resolveInstituteYear(pool, req);
    if (!institutionId) return res.json({ success: true, data: [] });

    const inactiveDays = Math.max(1, Math.min(365, Number(req.query.inactive_days) || 7));

    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.title                                                          AS section_title,
         r.title                                                          AS report_title,
         s.status,
         s.updated_at                                                     AS last_activity,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - s.updated_at)) / 86400)::int  AS inactive_days,
         s.submission_deadline,
         CASE
           WHEN s.submission_deadline IS NOT NULL
            AND s.submission_deadline < NOW()
            AND s.status NOT IN ('APPROVED', 'LOCKED')
           THEN true ELSE false
         END                                                              AS is_overdue,
         (SELECT COUNT(*)::int FROM public.section_versions sv2
           WHERE sv2.section_id = s.id AND sv2.decision = 'SENT_BACK')   AS sendback_count,
         COALESCE(dept.name, '—')                                         AS department_name
       FROM public.report_sections s
       JOIN public.reports r
         ON r.id            = s.report_id
        AND r.deleted_at    IS NULL
        AND r.institution_id = $1
        AND r.academic_year  = $2
       LEFT JOIN LATERAL (
         SELECT d.name
           FROM public.section_workflow_assignments swa
           JOIN public.departments d ON d.id = swa.department_id
          WHERE swa.section_id       = s.id
            AND swa.assignee_type    = 'DEPARTMENT'
            AND swa.workflow_step_id IS NULL
          LIMIT 1
       ) dept ON true
       WHERE s.deleted_at IS NULL
         AND s.status NOT IN ('APPROVED', 'LOCKED')
         AND (
           s.updated_at < NOW() - ($3 * INTERVAL '1 day')
           OR (s.submission_deadline IS NOT NULL AND s.submission_deadline < NOW())
           OR (
             SELECT COUNT(*) FROM public.section_versions sv2
              WHERE sv2.section_id = s.id AND sv2.decision = 'SENT_BACK'
           ) >= 2
         )
       ORDER BY
         CASE WHEN s.submission_deadline IS NOT NULL AND s.submission_deadline < NOW()
              AND s.status NOT IN ('APPROVED','LOCKED') THEN 0 ELSE 1 END,
         s.updated_at ASC`,
      [institutionId, academicYearStr, inactiveDays]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    if (isUndefinedTable(err)) return res.json({ success: true, data: [] });
    logger.error("GET /api/dashboard/institute/bottlenecks failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load bottlenecks." });
  }
});

module.exports = router;
