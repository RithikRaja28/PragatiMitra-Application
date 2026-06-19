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

    // Selected academic year (top-bar) → for per-year deadlines.
    const headerYear = Number(req.get("X-Academic-Year"));
    const year = Number.isInteger(headerYear) ? headerYear : new Date().getFullYear();

    // Domain forms accessible to this institution, with their form-wide lock +
    // deadline. institute_access = the institutions a form is shared with.
    const { rows: forms } = await pool.query(
      `SELECT tl.id, tl.form_name,
              COALESCE(flc.is_locked, false) AS is_locked,
              flc.deadline_at
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
    let totalRecords = 0;
    const activity = [];
    for (const f of forms) {
      if (!SLUG_RE.test(f.form_name)) continue;
      try {
        const { rows: rc } = await pool.query(
          `SELECT COUNT(*)::int AS n, MAX(created_at) AS last
             FROM ${f.form_name}_records
            WHERE institution_id = $1 AND (language = 'en' OR language IS NULL)`,
          [institutionId]
        );
        const n = rc[0]?.n || 0;
        totalRecords += n;
        if (rc[0]?.last) activity.push({ form_name: f.form_name, record_count: n, last_updated: rc[0].last });
      } catch {
        /* records table absent for this form → 0, skip */
      }
    }

    const now = Date.now();
    const activeForms = forms.filter((f) => !f.is_locked).length;
    const pendingDeadlines = forms.filter((f) => {
      const dl = yearDeadline.has(f.form_name) ? yearDeadline.get(f.form_name) : f.deadline_at;
      return dl && new Date(dl).getTime() > now;
    }).length;

    activity.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));

    return res.json({
      success: true,
      domain,
      metrics: {
        total_forms: forms.length,
        active_forms: activeForms,
        pending_deadlines: pendingDeadlines,
        total_records: totalRecords,
        assigned_users: assignedUsers,
      },
      recent_activity: activity.slice(0, 5),
    });
  } catch (err) {
    logger.error("GET /api/dashboard/summary failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load dashboard summary." });
  }
});

module.exports = router;
