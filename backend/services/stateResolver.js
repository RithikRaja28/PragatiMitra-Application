"use strict";

/**
 * stateResolver.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for the precedence between a form/record's lifecycle
 * states. Previously "archived", "locked" and "deadline expired" were each
 * evaluated ad-hoc in several routers (formData.getLockBlock,
 * departmentFormData.deptLockBlock, the dept-forms list flags,
 * academicYearService.getAcademicYearLockBlock). When two of them were true at
 * once the winning state was implicit and could differ between modules.
 *
 * This module makes the precedence explicit and shared. It is a PURE function
 * with NO behavior change of its own — the existing call sites are rewired to
 * derive their current outputs from it.
 *
 * PRECEDENCE (highest → lowest):
 *
 *     ARCHIVED          → hidden; ignore lock + deadline
 *        ↓
 *     LOCKED            → view-only (manual admin lock); ignore deadline
 *        ↓
 *     DEADLINE_EXPIRED  → view-only (auto-locked because the deadline passed)
 *        ↓
 *     ACTIVE            → normal read/write
 * ───────────────────────────────────────────────────────────────────────── */

const STATE = Object.freeze({
  ARCHIVED: "archived",
  LOCKED: "locked",
  DEADLINE_EXPIRED: "deadline_expired",
  ACTIVE: "active",
});

/* The exact message strings the UI/API have always shown, kept here so every
   surface speaks with one voice. ACTIVE/ARCHIVED have no block message. */
const MESSAGES = Object.freeze({
  [STATE.LOCKED]:
    "This form is currently locked by the institution admin. You can only view the records.",
  [STATE.DEADLINE_EXPIRED]:
    "This form deadline has expired for your institution. The form is automatically locked.",
});

/* Resolve the single effective state from the raw flags.
 *
 *   archived    — the year/form is archived (academic_year_master.is_archived,
 *                 department_form_year_mapping.is_archived, …).
 *   locked      — the row is locked (form_lock_config.is_locked, year is_locked …).
 *                 NOTE: in the DB an auto (deadline) lock also sets is_locked=true;
 *                 the autoLocked flag below disambiguates manual vs deadline lock.
 *   autoLocked  — the lock was produced by an expired deadline (auto_locked=true).
 *   deadlineAt  — the deadline timestamp (may have passed before the auto-lock
 *                 scheduler has run).
 *
 * The mapping reproduces today's behavior exactly:
 *   • archived                       → ARCHIVED
 *   • manual lock (locked&&!auto)    → LOCKED
 *   • auto lock OR locked&past-deadline → DEADLINE_EXPIRED
 *   • else                           → ACTIVE
 */
function getEffectiveState({ archived = false, locked = false, autoLocked = false, deadlineAt = null } = {}) {
  if (archived) return STATE.ARCHIVED;

  const deadlinePassed = deadlineAt != null && new Date(deadlineAt).getTime() <= Date.now();

  if (locked) {
    // An auto-lock (or a lock whose deadline has already passed) is a deadline
    // expiry; a plain admin lock is a manual lock.
    if (autoLocked || deadlinePassed) return STATE.DEADLINE_EXPIRED;
    return STATE.LOCKED;
  }

  return STATE.ACTIVE;
}

/* Writes are allowed only in the normal ACTIVE state. */
function canWrite(state) {
  return state === STATE.ACTIVE;
}

/* Everything except ARCHIVED is at least viewable (locked/expired = view-only). */
function canView(state) {
  return state !== STATE.ARCHIVED;
}

/* ARCHIVED is hidden from listings / top bar / reports. */
function isHidden(state) {
  return state === STATE.ARCHIVED;
}

/* The block message for a non-writable state (null for ARCHIVED/ACTIVE). */
function messageFor(state) {
  return MESSAGES[state] || null;
}

module.exports = {
  STATE,
  getEffectiveState,
  canWrite,
  canView,
  isHidden,
  messageFor,
};
