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

module.exports = { resolveEffectiveDepartment, hasActiveNodalCapability };
