"use strict";

/**
 * equivalenceGuard.js
 * ─────────────────────────────────────────────────────────────────────────
 * Output-equivalence harness for the Architecture Alignment Pass.
 *
 * The alignment pass extracted resolvers (stateResolver, schemaResolver,
 * translationOwnership, the institution-year resolver) and rewired call sites to
 * use them. That work must be 100% behavior-preserving. This harness proves it
 * at runtime WITHOUT ever letting a divergence reach a user:
 *
 *     capture LEGACY output  → compute RESOLVER candidate → assertEquivalent()
 *        identical → use it (it equals legacy anyway)
 *        mismatch  → KEEP legacy output + log "[equivalence-mismatch] <label>"
 *
 * The legacy computation is therefore ALWAYS authoritative. The resolver runs in
 * shadow: its only effect is a warning log if it ever disagrees. Promote a site
 * to resolver-authoritative only after logs show zero mismatches over time.
 *
 * NOTE: this guard is intentionally scoped to the alignment pass. It is NOT used
 * for the Shared-Form Ownership change, where behavior changes by design.
 * ───────────────────────────────────────────────────────────────────────── */

const logger = require("../utils/logger");

/* Structural deep-equality for primitives, plain objects, arrays and Dates.
   Good enough for the small {locked,message} / boolean / id values compared here. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a !== "object") return false; // differing primitives

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/* Compare the legacy (authoritative) output against the resolver candidate.
 * Returns the value to USE:
 *   • equal     → candidate (identical to legacy)
 *   • different → legacy, after logging the mismatch
 * Behavior can never change because the returned value always equals legacy.
 *
 * `compareFn(legacy, candidate)` overrides the default structural comparison.
 */
function assertEquivalent(label, legacy, candidate, compareFn) {
  let equal;
  try {
    equal = compareFn ? !!compareFn(legacy, candidate) : deepEqual(legacy, candidate);
  } catch (err) {
    logger.warn(`[equivalence-mismatch] ${label} (compare threw)`, { error: err.message });
    return legacy;
  }
  if (!equal) {
    logger.warn(`[equivalence-mismatch] ${label}`, {
      legacy: safe(legacy),
      candidate: safe(candidate),
    });
    return legacy;
  }
  return candidate;
}

/* Keep log payloads small/serializable. */
function safe(v) {
  try {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object" && v !== null) return JSON.parse(JSON.stringify(v));
    return v;
  } catch {
    return String(v);
  }
}

module.exports = { assertEquivalent, deepEqual };
