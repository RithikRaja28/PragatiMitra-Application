"use strict";

/**
 * routes/formAssignments.js  →  mounted at /api/form-assignments
 * ─────────────────────────────────────────────────────────────────────────
 * Contributor form-ASSIGNMENT workflow. Assignment ONLY controls visibility —
 * it never creates / duplicates / clones forms or transfers ownership. The
 * Institution owns the form, the Department receives it, a Department Admin /
 * Nodal Officer assigns it to Contributors, and the Contributor consumes it
 * (enters records) — scoped to (institution, department, academic_year, form).
 *
 * Fully additive: a new `form_assignments` table, new endpoints. Nothing about
 * the existing form / record / year / deadline / lock engines changes.
 */

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const { getFormLifecycleStatus, resolveOperatingYear } = require("../services/academicYearService");
const { assertFormDomainAccess } = require("../services/domainService");
const { resolveEffectiveDepartment, getDepartmentWriteBlock } = require("../services/departmentContext");
const logger = require("../utils/logger");

/* Assigner's EFFECTIVE (institution, department) context. Delegates to the single
   nodal-aware resolver so a NOA-elevated Contributor assigns for their NODAL
   department and a real Department Admin assigns for their (live) home department
   — the SAME resolver records/forms/exports use, so assignment and records can
   never disagree on the department (Bug 4). */
async function assignerContext(pool, req) {
  return resolveEffectiveDepartment(pool, req);
}

/* ── Table (idempotent — safe on every boot) ── */
async function ensureFormAssignmentsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_assignments (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id        uuid NOT NULL,
      form_name      text,
      institution_id uuid,
      department_id  uuid,
      academic_year  int  NOT NULL,
      assigned_by    uuid,
      assigned_to    uuid NOT NULL,
      role           text NOT NULL DEFAULT 'contributor',
      is_active      boolean NOT NULL DEFAULT true,
      assigned_at    timestamptz NOT NULL DEFAULT now(),
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (form_id, assigned_to, academic_year)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fa_assignee_year ON form_assignments (assigned_to, academic_year, is_active)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fa_form_year ON form_assignments (form_id, academic_year)`);
}

/* ── Helpers shared with forms.js / formData.js ── */

/* A "pure" contributor — has the contributor role and none of the elevated form
   roles. Only these users are visibility-restricted to their assigned forms.
   Uses dbRoles (live DB-only) so NOA-computed roles (department_admin / institute_admin
   injected by auth.js) never accidentally bypass the assignment filter for a user
   whose primary DB role is 'contributor'. Falls back to req.user.roles when
   dbRoles is absent (non-auth-middleware callers). */
function isContributorOnly(req) {
  const roles = req.user?.dbRoles || req.user?.roles || [];
  if (!roles.includes("contributor")) return false;
  const elevated = ["super_admin", "institute_admin", "department_admin", "nodal_officer", "hospital_admin", "finance_admin"];
  return !roles.some((r) => elevated.includes(r));
}

/* table_list.id values assigned (active) to a user for a given academic year.
   DEPARTMENT-SCOPED: an assignment only counts while fa.department_id still
   matches the user's CURRENT department. So if the user is moved to another
   department, the old department's assignments stop granting visibility on the
   very next request (read live — no logout needed). A user with no department
   matches nothing (fail-closed). */
async function getAssignedFormIds(pool, userId, year) {
  const { rows } = await pool.query(
    `SELECT DISTINCT fa.form_id FROM form_assignments fa
     WHERE fa.assigned_to = $1 AND fa.academic_year = $2 AND fa.is_active = true
       AND fa.department_id = (SELECT department_id FROM users WHERE id = $1)
       AND EXISTS (SELECT 1 FROM departments d
                    WHERE d.department_id = fa.department_id AND d.status = 'ACTIVE')`,
    [userId, Number(year)]
  );
  return rows.map((r) => String(r.form_id));
}

/* Is a specific form (by name) actively assigned to a user for the year?
   Department-scoped (see getAssignedFormIds) — the assignment must belong to the
   user's CURRENT department, so a department move revokes access immediately. */
async function isFormAssigned(pool, userId, formName, year) {
  const { rows } = await pool.query(
    `SELECT 1 FROM form_assignments fa
     JOIN table_list tl ON tl.id = fa.form_id
     WHERE fa.assigned_to = $1 AND tl.form_name = $2
       AND fa.academic_year = $3 AND fa.is_active = true
       AND fa.department_id = (SELECT department_id FROM users WHERE id = $1)
       AND EXISTS (SELECT 1 FROM departments d
                    WHERE d.department_id = fa.department_id AND d.status = 'ACTIVE')
     LIMIT 1`,
    [userId, formName, Number(year)]
  );
  return rows.length > 0;
}

/* Is the form assigned to the user in ANY active year? Used for export/import,
   where the request may not reliably carry the selected year (raw downloads).
   Visibility year-scoping is enforced on the form LIST, so this only gates
   "is this form mine at all". Department-scoped — see getAssignedFormIds. */
async function isFormAssignedAnyYear(pool, userId, formName) {
  const { rows } = await pool.query(
    `SELECT 1 FROM form_assignments fa
     JOIN table_list tl ON tl.id = fa.form_id
     WHERE fa.assigned_to = $1 AND tl.form_name = $2 AND fa.is_active = true
       AND fa.department_id = (SELECT department_id FROM users WHERE id = $1)
       AND EXISTS (SELECT 1 FROM departments d
                    WHERE d.department_id = fa.department_id AND d.status = 'ACTIVE')
     LIMIT 1`,
    [userId, formName]
  );
  return rows.length > 0;
}

/* A year is "explicitly provided" only when it's a positive integer — guards
   against body.year === null (the assign modal sends null when no year is
   selected), since Number(null) === 0 would otherwise look like a valid year. */
const validYear = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
function hasExplicitYear(req) {
  return validYear(req.query.year) || validYear(req.get("X-Academic-Year")) || validYear(req.body?.year);
}

/* Bug 16 — the academic year an assignment targets when none is explicitly given:
   ?year → X-Academic-Year header → body.year → the institution's ACTIVE academic
   year (inherited, precomputed by the middleware below) → calendar year (last
   resort only). Previously this fell straight to the calendar year, so an
   assignment made in (e.g.) July 2026 while the institution's active year was
   2025–2026 was wrongly saved to 2026. */
function resolveYear(req) {
  if (validYear(req.query.year))            return Number(req.query.year);
  if (validYear(req.get("X-Academic-Year"))) return Number(req.get("X-Academic-Year"));
  if (validYear(req.body?.year))            return Number(req.body?.year);
  if (Number.isInteger(req.institutionAcademicYear)) return req.institutionAcademicYear;
  return new Date().getFullYear();
}

const router = express.Router();
router.use(verifyToken);

/* Precompute the institution's active academic year ONCE per request (only when
   no explicit year is supplied) so resolveYear can inherit it. Mirrors the
   department modules. Never blocks on error → falls back to the calendar year. */
router.use(async (req, _res, next) => {
  try {
    if (!hasExplicitYear(req)) {
      const pool = req.app.locals.pool;
      const { institutionId } = await resolveEffectiveDepartment(pool, req);
      // M-2 — active → latest real academic year (no calendar drift when year-aware).
      req.institutionAcademicYear = await resolveOperatingYear(pool, institutionId);
    }
  } catch { /* leave undefined → calendar-year fallback */ }
  next();
});

/* Department Admin / Nodal Officer / Hospital Admin / Finance Admin may assign
   within their own domain (super_admin allowed as god). assertFormDomainAccess
   inside POST / already prevents cross-domain assignments. */
const ASSIGN_ROLES = ["super_admin", "department_admin", "nodal_officer", "hospital_admin", "finance_admin"];

/* GET /api/form-assignments/contributors?form_id=&year=
   Assignable contributors for the assigner's department + the form's current
   assigned list (for the modal). */
router.get("/contributors", requireRole(ASSIGN_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId: instFromCtx, departmentId: deptFromCtx } = await assignerContext(pool, req);
    /* Fall back to JWT values when the DB lookup returns null (e.g. the dept
       admin record has no department_id stored yet); mirrors how users.js
       GET /api/users resolves the dept admin's scope. */
    const institutionId = instFromCtx || req.user.institutionId || null;
    const departmentId  = deptFromCtx || req.user.departmentId  || null;
    if (!departmentId) return res.json({ success: true, contributors: [], assigned: [] });
    const year   = resolveYear(req);
    const formId = req.query.form_id || null;

    /* Assignable contributors: same institution + same department + active +
       role 'contributor', EXCLUDING (a) the assigner themselves and (b) any
       contributor who is the Nodal Officer for THIS SPECIFIC department (they
       are assigners here, not assignees). Contributors who are NOAs in other
       departments remain eligible. */
    const { rows: contributors } = await pool.query(
      `SELECT u.id, u.full_name, u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
       JOIN roles r ON r.id = ur.role_id AND r.name = 'contributor'
       WHERE u.institution_id = $1 AND u.department_id = $2 AND u.account_status = 'ACTIVE'
         AND u.id <> $3
         AND NOT EXISTS (
           SELECT 1 FROM nodal_officer_assignments noa
           WHERE noa.user_id = u.id AND noa.is_active = TRUE AND noa.department_id = $2
         )
       ORDER BY u.full_name`,
      [institutionId, departmentId, req.user.userId]
    );

    let assigned = [];
    if (formId) {
      const { rows } = await pool.query(
        `SELECT fa.id, fa.assigned_to, u.full_name, u.email
         FROM form_assignments fa JOIN users u ON u.id = fa.assigned_to
         WHERE fa.form_id = $1 AND fa.academic_year = $2 AND fa.department_id = $3 AND fa.is_active = true
         ORDER BY u.full_name`,
        [formId, year, departmentId]
      );
      assigned = rows;
    }
    return res.json({ success: true, contributors, assigned, year, departmentId, institutionId });
  } catch (err) {
    logger.error("GET /api/form-assignments/contributors", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load contributors." });
  }
});

/* POST /api/form-assignments  { form_id, form_name?, contributor_ids: [], year? }
   Assigns the (already accessible) form to the given contributors for the year.
   Year-scoped, idempotent (re-assigning re-activates). */
router.post("/", requireRole(ASSIGN_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { form_id, form_name, contributor_ids } = req.body;
  const year = resolveYear(req);
  if (!form_id || !Array.isArray(contributor_ids) || contributor_ids.length === 0)
    return res.status(400).json({ success: false, message: "form_id and contributor_ids are required." });

  try {
    const { institutionId, departmentId } = await assignerContext(pool, req);
    if (!departmentId)
      return res.status(400).json({ success: false, message: "No department is associated with your account." });

    // Bug 11 — an inactive department suspends all assignment activity (assign /
    // approvals / contributor management). Highest precedence, before archive.
    const deptBlock = await getDepartmentWriteBlock(pool, { departmentId, roles: req.user.roles });
    if (deptBlock.blocked)
      return res.status(403).json({ success: false, message: deptBlock.message });

    /* ── Bug 15 — validate the FORM ITSELF before creating any assignment ──────
       The assigner may only assign a form they genuinely own/control. Every check
       runs server-side (the UI/route cannot be trusted — TC-12 direct API). If ANY
       check fails, NO assignment row is created and no success is logged. */
    const { rows: tlRows } = await pool.query(
      `SELECT form_name,
              COALESCE(form_domain, 'academic')        AS form_domain,
              COALESCE(institute_access, '{}'::uuid[]) AS institute_access
         FROM table_list WHERE id = $1`,
      [form_id]
    );
    if (!tlRows.length)
      return res.status(404).json({ success: false, message: "Form not found." });
    const fname = tlRows[0].form_name;   // authoritative — never trust the client's form_name

    // (1) Institution ownership/access — the form must be accessible to the
    //     assigner's institution (TC-03 other institution, TC-04 shared-not-adopted).
    if (!tlRows[0].institute_access.map(String).includes(String(institutionId)))
      return res.status(403).json({ success: false, message: "This form is not available for your institution." });

    // (2) Domain — the form's business domain must match the assigner's domain
    //     (TC-05 hospital→academic, TC-06 academic→hospital). super/institute admin
    //     are cross-domain inside assertFormDomainAccess.
    const domainCheck = await assertFormDomainAccess(pool, req, fname);
    if (!domainCheck.allowed)
      return res.status(domainCheck.status || 403).json({ success: false, message: domainCheck.message });

    // (3) Active for the SELECTED academic year — not archived / disabled, and not a
    //     year the form isn't active in (TC-07 wrong year, TC-08 archived).
    const lifecycle = await getFormLifecycleStatus(pool, institutionId, fname, year);
    if (lifecycle !== "active")
      return res.status(403).json({ success: false, message: "This form is not active for the selected academic year and cannot be assigned." });

    // (4) Locked — a locked form cannot be (re)assigned (TC-09).
    const { rows: lockRows } = await pool.query(
      `SELECT is_locked FROM form_lock_config WHERE form_name = $1 AND institution_id = $2`,
      [fname, institutionId]
    );
    if (lockRows[0]?.is_locked)
      return res.status(403).json({ success: false, message: "This form is locked. Assignment is disabled." });

    // Only same-institution, same-department, active contributors are assignable —
    // and never the assigner themselves, nor a nodal-capable contributor.
    const { rows: valid } = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       JOIN roles r ON r.id = ur.role_id AND r.name = 'contributor'
       WHERE u.id = ANY($1::uuid[]) AND u.institution_id = $2 AND u.department_id = $3
         AND u.account_status = 'ACTIVE'
         AND u.id <> $4
         AND NOT EXISTS (
           SELECT 1 FROM nodal_officer_assignments noa
           WHERE noa.user_id = u.id AND noa.is_active = TRUE AND noa.department_id IS NOT NULL
         )`,
      [contributor_ids, institutionId, departmentId, req.user.userId]
    );
    const validIds = valid.map((v) => v.id);
    if (validIds.length === 0)
      return res.status(400).json({ success: false, message: "No eligible contributors in your department." });

    let created = 0;
    for (const cid of validIds) {
      await pool.query(
        `INSERT INTO form_assignments
           (form_id, form_name, institution_id, department_id, academic_year, assigned_by, assigned_to, role, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'contributor',true)
         ON CONFLICT (form_id, assigned_to, academic_year)
           DO UPDATE SET is_active = true, assigned_by = $6, updated_at = now()`,
        [form_id, fname, institutionId, departmentId, year, req.user.userId, cid]
      );
      created += 1;
    }

    await writeAuditLog(req, {
      actionType: "FORM_ASSIGNED",
      entityType: "form_assignment",
      entityId: form_id,
      newValue: { form_id, form_name: fname, academic_year: year, department_id: departmentId, count: created },
      message: `Form assigned to ${created} contributor(s) — "${fname}"`,
    });

    return res.json({ success: true, message: `Assigned to ${created} contributor(s).`, assigned: created });
  } catch (err) {
    logger.error("POST /api/form-assignments", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to assign form." });
  }
});

/* DELETE /api/form-assignments/:id — soft-deactivate one assignment. */
router.delete("/:id", requireRole(ASSIGN_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { departmentId } = await assignerContext(pool, req);

    const { rows: assignRows } = await pool.query(
      `SELECT fa.id, fa.form_id, fa.form_name, fa.institution_id, fa.department_id,
              fa.academic_year, fa.assigned_to, fa.role,
              u.full_name AS contributor_name, u.email AS contributor_email
       FROM form_assignments fa
       LEFT JOIN users u ON u.id = fa.assigned_to
       WHERE fa.id = $1 AND fa.department_id = $2`,
      [req.params.id, departmentId]
    );
    const assignment = assignRows[0] || null;

    const { rowCount } = await pool.query(
      `UPDATE form_assignments SET is_active = false, updated_at = now()
       WHERE id = $1 AND department_id = $2`,
      [req.params.id, departmentId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: "Assignment not found." });

    await writeAuditLog(req, {
      actionType:    "FORM_ASSIGNMENT_REVOKED",
      entityType:    "FORM_ASSIGNMENT",
      entityId:      req.params.id,
      oldValue: assignment ? {
        form_id:           assignment.form_id,
        form_name:         assignment.form_name,
        academic_year:     assignment.academic_year,
        assigned_to:       assignment.assigned_to,
        contributor_name:  assignment.contributor_name,
        contributor_email: assignment.contributor_email,
        department_id:     assignment.department_id,
        institution_id:    assignment.institution_id,
        is_active:         true,
      } : null,
      newValue:      { is_active: false },
      changedFields: ["is_active"],
      status:        "SUCCESS",
      message:       assignment
        ? `Form assignment revoked: "${assignment.form_name}" for contributor "${assignment.contributor_name}"`
        : `Form assignment ${req.params.id} revoked`,
      metadata:      { revoked_by: req.user.userId, academic_year: assignment?.academic_year },
    });

    return res.json({ success: true, message: "Assignment removed." });
  } catch (err) {
    logger.error("DELETE /api/form-assignments/:id", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to remove assignment." });
  }
});

/* GET /api/form-assignments/my?year= — the caller's own assigned form ids (year). */
router.get("/my", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const year = resolveYear(req);
    const formIds = await getAssignedFormIds(pool, req.user.userId, year);
    return res.json({ success: true, formIds, year });
  } catch (err) {
    logger.error("GET /api/form-assignments/my", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load assignments." });
  }
});

/* GET /api/form-assignments/dashboard-stats?year=
   Contributor dashboard summary: counts of assigned / pending / locked / expired
   forms for the selected academic year. Scoped to the caller's department.
   - assigned_forms: total active assignments for the year
   - locked_forms:   assigned forms whose form_lock_config shows is_locked = true
   - expired_forms:  assigned forms whose effective deadline is in the past
   - pending_forms:  assigned forms that are neither locked nor expired (still open) */
router.get("/dashboard-stats", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const userId        = req.user.userId;
    const institutionId = req.user.institutionId || null;
    const year          = resolveYear(req);
    const now           = new Date();

    // All active assignments for this user + year (department-scoped)
    const { rows: assignments } = await pool.query(
      `SELECT fa.form_id, fa.form_name, tl.form_name AS tl_name
         FROM form_assignments fa
         JOIN table_list tl ON tl.id = fa.form_id
        WHERE fa.assigned_to   = $1
          AND fa.academic_year = $2
          AND fa.is_active     = true
          AND fa.department_id = (SELECT department_id FROM users WHERE id = $1)
          AND EXISTS (
            SELECT 1 FROM departments d
            WHERE d.department_id = fa.department_id AND d.status = 'ACTIVE'
          )`,
      [userId, year]
    );

    const total = assignments.length;
    if (!total || !institutionId) {
      return res.json({
        success: true,
        year,
        data: { assigned_forms: total, pending_forms: 0, locked_forms: 0, expired_forms: 0 },
      });
    }

    const formNames = assignments.map(a => a.tl_name || a.form_name).filter(Boolean);

    // Lock + deadline info per form (one query for all assigned form names)
    const { rows: lockRows } = await pool.query(
      `SELECT form_name, COALESCE(is_locked, false) AS is_locked, deadline_at
         FROM form_lock_config
        WHERE form_name = ANY($1::text[]) AND institution_id = $2`,
      [formNames, institutionId]
    );
    const lockMap = {};
    for (const r of lockRows) lockMap[r.form_name] = r;

    // Per-year deadline overrides (same logic as dashboard.js)
    const { rows: ydRows } = await pool.query(
      `SELECT form_name, deadline_at FROM form_year_deadlines
        WHERE institution_id = $1 AND academic_year = $2`,
      [institutionId, year]
    );
    const yearDeadline = new Map(ydRows.map(r => [r.form_name, r.deadline_at]));

    let lockedCount  = 0;
    let expiredCount = 0;

    for (const name of formNames) {
      const cfg = lockMap[name];
      const isLocked = cfg?.is_locked ?? false;
      const dl = yearDeadline.has(name) ? yearDeadline.get(name) : cfg?.deadline_at ?? null;
      const isExpired = dl && new Date(dl).getTime() <= now.getTime();

      if (isLocked)        lockedCount++;
      else if (isExpired)  expiredCount++;
    }

    const pendingCount = total - lockedCount - expiredCount;

    return res.json({
      success: true,
      year,
      data: {
        assigned_forms: total,
        pending_forms:  Math.max(0, pendingCount),
        locked_forms:   lockedCount,
        expired_forms:  expiredCount,
      },
    });
  } catch (err) {
    logger.error("GET /api/form-assignments/dashboard-stats", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load dashboard stats." });
  }
});

module.exports = {
  router,
  ensureFormAssignmentsTable,
  getAssignedFormIds,
  isFormAssigned,
  isFormAssignedAnyYear,
  isContributorOnly,
};
