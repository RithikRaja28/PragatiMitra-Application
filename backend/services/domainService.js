"use strict";

/**
 * domainService.js
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for business-domain isolation (Academic | Hospital |
 * Finance). Domains are independent: a form created in one domain must NEVER be
 * visible to users of another domain.
 *
 *   users.role_domain  — the user's domain (a.k.a. user_domain). Default 'academic'.
 *   table_list.form_domain — the form's domain. Default 'academic'.
 *
 * Rule: a non-super-admin user only sees/acts on forms where
 *       form_domain === user.role_domain.  super_admin is cross-domain (god).
 *
 * Everything defaults to 'academic', so existing Academic users + forms behave
 * exactly as before (fully backward compatible).
 */

const VALID_DOMAINS = ["academic", "hospital", "finance"];

/* Map the two domain-admin roles → their domain. Used so a Hospital Admin's
   account and forms are always 'hospital' regardless of any selector. */
const ROLE_TO_DOMAIN = {
  hospital_admin: "hospital",
  finance_admin:  "finance",
};

function normalizeDomain(value, fallback = "academic") {
  const d = String(value || "").toLowerCase();
  return VALID_DOMAINS.includes(d) ? d : fallback;
}

/* Domain to assign a user, given the chosen role + explicit selector value.
   A domain-admin role pins the domain; otherwise the explicit selection wins. */
function domainForUser(roleName, explicitDomain) {
  if (ROLE_TO_DOMAIN[roleName]) return ROLE_TO_DOMAIN[roleName];
  return normalizeDomain(explicitDomain);
}

/* The requesting user's effective domain.
   - super_admin / institute_admin → null  (cross-domain: the Institution Admin
     MANAGES forms across every domain — creating Academic/Hospital/Finance forms
     via the domain selector)
   - everyone else → users.role_domain (default 'academic')
   Hospital/Finance admins are scoped to their own domain (they CONSUME forms and
   enter records); department admins / faculty stay Academic. Visibility rule:
   form_domain === user.role_domain. Backward compatible — every existing user +
   form is 'academic'. */
async function resolveUserDomain(pool, req) {
  const roles = req.user?.roles || [];
  if (roles.includes("super_admin") || roles.includes("institute_admin")) return null;
  try {
    const { rows } = await pool.query(
      "SELECT COALESCE(role_domain, 'academic') AS d FROM users WHERE id = $1",
      [req.user.userId]
    );
    return rows[0]?.d || "academic";
  } catch {
    return "academic"; // never block on a metadata read
  }
}

/* A form's domain (defaults to 'academic' for legacy rows / missing forms). */
async function getFormDomain(pool, formName) {
  try {
    const { rows } = await pool.query(
      "SELECT COALESCE(form_domain, 'academic') AS d FROM table_list WHERE form_name = $1",
      [formName]
    );
    return rows[0]?.d || "academic";
  } catch {
    return "academic";
  }
}

/* Returns { allowed, message }. super_admin always allowed; others only when the
   form's domain matches their own. Use to guard form-data + form-management ops. */
async function assertFormDomainAccess(pool, req, formName) {
  const userDomain = await resolveUserDomain(pool, req);
  if (userDomain == null) return { allowed: true };
  const formDomain = await getFormDomain(pool, formName);
  if (formDomain !== userDomain)
    return { allowed: false, message: "This form is not available in your domain." };
  return { allowed: true };
}

/* Resolve the domain to filter a form LIST by, for the requesting user.
   - non-super-admin → their own domain (forced; cannot be overridden)
   - super_admin     → optional ?domain query, else null (all domains)
   Returns a domain string to filter by, or null for "no filter (all)". */
async function resolveListFilterDomain(pool, req) {
  const userDomain = await resolveUserDomain(pool, req);
  if (userDomain != null) return userDomain; // scoped users: forced
  const dp = req.query?.domain ? String(req.query.domain).toLowerCase() : null;
  return VALID_DOMAINS.includes(dp) ? dp : null;
}

module.exports = {
  VALID_DOMAINS,
  ROLE_TO_DOMAIN,
  normalizeDomain,
  domainForUser,
  resolveUserDomain,
  getFormDomain,
  assertFormDomainAccess,
  resolveListFilterDomain,
};
