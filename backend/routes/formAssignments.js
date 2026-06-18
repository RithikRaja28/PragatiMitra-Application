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
const { getFormArchiveBlockForReq } = require("../services/academicYearService");
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
   roles. Only these users are visibility-restricted to their assigned forms. */
function isContributorOnly(req) {
  const roles = req.user?.roles || [];
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

function resolveYear(req) {
  const q = Number(req.query.year);            if (Number.isInteger(q)) return q;
  const h = Number(req.get("X-Academic-Year")); if (Number.isInteger(h)) return h;
  const b = Number(req.body?.year);            if (Number.isInteger(b)) return b;
  return new Date().getFullYear();
}

const router = express.Router();
router.use(verifyToken);

/* Only Department Admin / Nodal Officer may assign (super_admin allowed as god).
   Contributors / Faculty / Hospital / Finance can NOT assign. */
const ASSIGN_ROLES = ["super_admin", "department_admin", "nodal_officer"];

/* GET /api/form-assignments/contributors?form_id=&year=
   Assignable contributors for the assigner's department + the form's current
   assigned list (for the modal). */
router.get("/contributors", requireRole(ASSIGN_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { institutionId, departmentId } = await assignerContext(pool, req);
    if (!departmentId) return res.json({ success: true, contributors: [], assigned: [] });
    const year   = resolveYear(req);
    const formId = req.query.form_id || null;

    /* Assignable contributors: same institution + same department + active +
       role 'contributor', EXCLUDING (a) the assigner themselves and (b) any
       contributor who already holds a Nodal Officer capability (an active
       nodal_officer_assignments row) — a nodal contributor is an assigner, not
       an assignee. Reuses the existing nodal_officer_assignments table. */
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
           WHERE noa.user_id = u.id AND noa.is_active = TRUE AND noa.department_id IS NOT NULL
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

    // Archive write policy — an archived form is view-only, so assignment changes
    // are blocked for it (the selected year). Resolve the form name from id when
    // the body doesn't include it.
    let fname = form_name;
    if (!fname) {
      const { rows: tl } = await pool.query("SELECT form_name FROM table_list WHERE id = $1", [form_id]);
      fname = tl[0]?.form_name || null;
    }
    if (fname) {
      const archiveBlock = await getFormArchiveBlockForReq(pool, req, institutionId, fname, year);
      if (archiveBlock.blocked)
        return res.status(403).json({ success: false, message: archiveBlock.message });
    }

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
        [form_id, form_name || null, institutionId, departmentId, year, req.user.userId, cid]
      );
      created += 1;
    }

    await writeAuditLog(req, {
      actionType: "FORM_ASSIGNED",
      entityType: "form_assignment",
      entityId: form_id,
      newValue: { form_id, form_name, academic_year: year, department_id: departmentId, count: created },
      message: `Form assigned to ${created} contributor(s) — "${form_name || form_id}"`,
    }).catch(() => {});

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
    const { rowCount } = await pool.query(
      `UPDATE form_assignments SET is_active = false, updated_at = now()
       WHERE id = $1 AND department_id = $2`,
      [req.params.id, departmentId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: "Assignment not found." });
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

module.exports = {
  router,
  ensureFormAssignmentsTable,
  getAssignedFormIds,
  isFormAssigned,
  isFormAssignedAnyYear,
  isContributorOnly,
};
