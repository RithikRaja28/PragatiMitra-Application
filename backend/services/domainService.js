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

const logger = require("../utils/logger");

const VALID_DOMAINS = ["academic", "hospital", "finance"];

/* Sentinel filter-domain returned when a scoped user's domain cannot be
   POSITIVELY determined (lookup failed). It matches no form's form_domain, so a
   form LIST filtered by it comes back empty — fail-closed: a transient metadata
   failure must hide all forms, never leak another domain's forms. */
const NO_DOMAIN_MATCH = "__no_domain_match__";

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
  /* Scoped user (hospital / finance / department / faculty / contributor): their
     domain must be read POSITIVELY. A query failure here must NOT fall back to
     'academic' — that would let a Hospital/Finance user reach Academic forms on a
     transient DB error. Throw so every caller (guard / list filter) fails closed. */
  const { rows } = await pool.query(
    "SELECT COALESCE(role_domain, 'academic') AS d FROM users WHERE id = $1",
    [req.user.userId]
  );
  if (!rows.length) {
    const err = new Error("User domain could not be resolved.");
    err.code = "DOMAIN_UNKNOWN";
    throw err;
  }
  return rows[0].d || "academic";
}

/* A form's domain. Throws on a query FAILURE so callers fail closed (an error
   must never be read as 'academic' — that could expose a hospital/finance form to
   an academic user). A legitimately ABSENT row (the form isn't registered, or is a
   legacy form predating form_domain) resolves to the 'academic' default, matching
   table_list's COALESCE default — backward compatible. */
async function getFormDomain(pool, formName) {
  const { rows } = await pool.query(
    "SELECT COALESCE(form_domain, 'academic') AS d FROM table_list WHERE form_name = $1",
    [formName]
  );
  return rows[0]?.d || "academic";
}

/* Returns { allowed, status?, message }. FAIL-CLOSED: access is ALLOWED only when
   positively confirmed (super/institute admin, or matching domain). Any lookup
   failure / missing metadata DENIES (503) — never allows on error. Use to guard
   form-data + form-management + import/export ops. */
async function assertFormDomainAccess(pool, req, formName) {
  try {
    const userDomain = await resolveUserDomain(pool, req);
    if (userDomain == null) return { allowed: true }; // super_admin / institute_admin (cross-domain)
    const formDomain = await getFormDomain(pool, formName);
    if (formDomain !== userDomain)
      return { allowed: false, status: 403, message: "This form is not available in your domain." };
    return { allowed: true };
  } catch (err) {
    logger.error("assertFormDomainAccess: domain lookup failed — denying (fail-closed)", {
      formName, userId: req.user?.userId, reason: err.code || err.message,
    });
    return { allowed: false, status: 503, message: "Authorization is temporarily unavailable. Please try again." };
  }
}

/* L-3 — domain isolation for entities that carry NO domain column of their own
   (department forms). The entity's domain is taken from its OWNER/creator's
   role_domain. super_admin / institute_admin are cross-domain (allowed). A scoped
   user is allowed only when the owner's domain matches theirs. Fail-closed: a
   viewer-domain read error denies (resolveUserDomain throws → caught here). */
async function assertDomainOwnerAccess(pool, req, ownerUserId) {
  try {
    const viewerDomain = await resolveUserDomain(pool, req);
    if (viewerDomain == null) return { allowed: true }; // cross-domain admins
    const { rows } = ownerUserId
      ? await pool.query("SELECT COALESCE(role_domain, 'academic') AS d FROM users WHERE id = $1", [ownerUserId])
      : { rows: [] };
    const ownerDomain = rows[0]?.d || "academic"; // unknown/legacy owner → academic default
    if (ownerDomain !== viewerDomain)
      return { allowed: false, status: 403, message: "This form is not available in your domain." };
    return { allowed: true };
  } catch (err) {
    logger.error("assertDomainOwnerAccess: domain lookup failed — denying (fail-closed)", {
      ownerUserId, userId: req.user?.userId, reason: err.code || err.message,
    });
    return { allowed: false, status: 503, message: "Authorization is temporarily unavailable. Please try again." };
  }
}

/* Resolve the domain to filter a form LIST by, for the requesting user.
   - non-super-admin → their own domain (forced; cannot be overridden)
   - super_admin     → optional ?domain query, else null (all domains)
   Returns a domain string to filter by, or null for "no filter (all)". */
async function resolveListFilterDomain(pool, req) {
  let userDomain;
  try {
    userDomain = await resolveUserDomain(pool, req);
  } catch (err) {
    // Fail-closed: cannot confirm a scoped user's domain → filter by a sentinel
    // that matches nothing, so the list is empty instead of leaking cross-domain.
    logger.error("resolveListFilterDomain: domain lookup failed — returning empty (fail-closed)", {
      userId: req.user?.userId, reason: err.code || err.message,
    });
    return NO_DOMAIN_MATCH;
  }
  if (userDomain != null) return userDomain; // scoped users: forced
  const dp = req.query?.domain ? String(req.query.domain).toLowerCase() : null;
  return VALID_DOMAINS.includes(dp) ? dp : null;
}

module.exports = {
  VALID_DOMAINS,
  NO_DOMAIN_MATCH,
  ROLE_TO_DOMAIN,
  normalizeDomain,
  domainForUser,
  resolveUserDomain,
  getFormDomain,
  assertFormDomainAccess,
  assertDomainOwnerAccess,
  resolveListFilterDomain,
};
