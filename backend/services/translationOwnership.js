"use strict";

/**
 * translationOwnership.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for the English↔Hindi row ownership rule.
 *
 * Form records use a row-per-language model:
 *   • English row  → language = 'en', source_row_id = NULL     (the SOURCE)
 *   • Hindi  row   → language = 'hi', source_row_id = <en id>  (DERIVED)
 *
 * Ownership rule (already enforced implicitly across formData.js /
 * departmentFormData.js; centralized here so it has one home):
 *
 *     English row owns the lifecycle.   Hindi row follows.
 *     Create EN → Create HI   Edit EN → Update HI
 *     Delete EN → Delete HI   Archive/Lock EN → Archive/Lock HI
 *
 * A Hindi (derived) row may NEVER be created, edited, or deleted independently,
 * and counts/exports must read only SOURCE rows. This module only provides the
 * shared constants + predicates; it changes no behavior on its own.
 * ───────────────────────────────────────────────────────────────────────── */

const SOURCE_LANGUAGE = "en";
const DERIVED_LANGUAGE = "hi";

/* A source (English) row: the lifecycle owner. */
function isSourceRow(row) {
  if (!row) return false;
  return row.language === SOURCE_LANGUAGE && row.source_row_id == null;
}

/* A derived (Hindi) row: a mirror linked back to its English source. */
function isDerivedRow(row) {
  if (!row) return false;
  return row.language === DERIVED_LANGUAGE && row.source_row_id != null;
}

/* Guard for write paths — throws if a caller tries to mutate a derived row
   directly. CRUD must always target the English source row; the Hindi mirror is
   regenerated/removed from it. Call sites that already target EN rows are
   unaffected. */
function assertSourceForWrite(row) {
  if (isDerivedRow(row)) {
    const err = new Error(
      "Hindi rows are derived from their English source and cannot be modified independently."
    );
    err.code = "DERIVED_ROW_WRITE";
    throw err;
  }
}

module.exports = {
  SOURCE_LANGUAGE,
  DERIVED_LANGUAGE,
  isSourceRow,
  isDerivedRow,
  assertSourceForWrite,
};
