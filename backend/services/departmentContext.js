"use strict";

/**
 * departmentContext.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE source of truth for a request's EFFECTIVE institution + department.
 *
 * A user can legitimately act in a department other than their home (profile)
 * department: when a Contributor holds an ACTIVE Nodal Officer (NOA) capability,
 * login.js (buildAccessPayload) puts the NOA's institution + department on the
 * JWT and also injects "department_admin". So for a Nodal Officer the JWT already
 * carries the NODAL department; for everyone else it carries the home department.
 *
 *   Effective department = NOA department   (if active nodal capability)
 *                          users.department_id   (otherwise — read live)
 *
 * Bug 4: the assignment screen resolved department from the JWT (nodal) while the
 * forms/records screens re-read raw users.department_id (home), so a Nodal Officer
 * assigned for Dept B but had records open under Dept A. Every department-scoped
 * path (forms, records, assignments, exports, deadlines, reports, academic year)
 * MUST resolve through here instead of reading users.department_id directly, so all
 * surfaces agree on ONE department.
 *
 * Non-NOA users are unaffected: the JWT department equals their home department,
 * and the else-branch reads the same users.department_id live (so a department
 * move still takes effect immediately for them — see Bug 3 Test 5).
 */

/* True when the request's user holds an ACTIVE department-level NOA capability
   (buildAccessPayload sets noaActiveYears from nodal_officer_assignments). */
function hasActiveNodalCapability(req) {
  return Array.isArray(req.user?.noaActiveYears) && req.user.noaActiveYears.length > 0;
}

/* Effective (nodal-aware) { institutionId, departmentId } for the request.
   - Active nodal capability → the NOA institution + department (carried on the
     JWT by buildAccessPayload).
   - Otherwise → the user's stored home institution + department, read live so a
     profile move takes effect on the next request. */
async function resolveEffectiveDepartment(pool, req) {
  if (hasActiveNodalCapability(req)) {
    return {
      institutionId: req.user.institutionId || null,
      departmentId:  req.user.departmentId  || null,
    };
  }
  const { rows } = await pool.query(
    "SELECT institution_id, department_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  return {
    institutionId: rows[0]?.institution_id || null,
    departmentId:  rows[0]?.department_id  || null,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Bug 11 — Department lifecycle state (single source of truth).

   A department is the parent scope of its users / assignments / forms / records.
   When it is INACTIVE every department-scoped WRITE must stop immediately
   (create / edit / delete / import / assign / submit) while existing data stays
   viewable — the "view-only or hidden" pattern. Enforcement is at the gate, so
   children are never mutated and a restore resumes everything with zero data loss
   (mirrors the institution lifecycle, Bug 10).

   Precedence the caller should honor: Department INACTIVE > Archive > Lock >
   Deadline > Active. This resolver answers only the department dimension; the
   form-level Archive/Lock/Deadline continue to come from stateResolver. */

const DEPARTMENT_INACTIVE_MESSAGE =
  "This department is inactive. You have view-only access — contact your institution administrator.";

/* Live ACTIVE/INACTIVE state of a department. A missing departmentId (institution-
   level / super-admin contexts) is treated as ACTIVE so those flows are unaffected. */
async function getDepartmentState(pool, departmentId) {
  if (!departmentId) return { active: true, status: "ACTIVE" };
  const { rows } = await pool.query(
    "SELECT status FROM departments WHERE department_id = $1",
    [departmentId]
  );
  const status = rows[0]?.status || "ACTIVE";
  return { active: status === "ACTIVE", status };
}

/* Centralized write-gate: { blocked, message }. Institution-level roles
   (super_admin / institute_admin) are above the department and never blocked;
   department-scoped users (department_admin / nodal capability / contributor) are
   blocked from writes when their effective department is inactive. Pass the
   department the action targets (the record/assignment's department) so the gate
   matches the data scope. */
async function getDepartmentWriteBlock(pool, { departmentId, roles = [] } = {}) {
  if (roles.includes("super_admin") || roles.includes("institute_admin"))
    return { blocked: false };
  if (!departmentId) return { blocked: false };
  const { active } = await getDepartmentState(pool, departmentId);
  return active ? { blocked: false } : { blocked: true, message: DEPARTMENT_INACTIVE_MESSAGE };
}

/* Request-level convenience: resolves the acting (nodal-aware) department and
   returns its write-gate. Use where the route does not already have the target
   department resolved. */
async function getDepartmentWriteBlockForReq(pool, req) {
  const { departmentId } = await resolveEffectiveDepartment(pool, req);
  return getDepartmentWriteBlock(pool, { departmentId, roles: req.user?.roles || [] });
}

module.exports = {
  resolveEffectiveDepartment,
  hasActiveNodalCapability,
  getDepartmentState,
  getDepartmentWriteBlock,
  getDepartmentWriteBlockForReq,
  DEPARTMENT_INACTIVE_MESSAGE,
};
