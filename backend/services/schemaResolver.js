"use strict";

/**
 * schemaResolver.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for "what is the schema of a shared form".
 *
 * A shared form (one row in table_list with multiple institutions in
 * institute_access) has one canonical schema STRUCTURE. Historically each
 * institution gets its own physical custom_field_schemas row (cloned by
 * schemaPropagationService) — convenient, but it means the canonical structure
 * is implicit and could drift between institutions.
 *
 * This module names the canonical schema and provides a COMPATIBILITY RESOLVER
 * so every reader resolves the same structure:
 *
 *   form
 *    ├── master schema  (canonical structure — getCanonicalSchema)
 *    └── institution rows = references that carry only institution STATE
 *        (lock / archive / deadline / year / visibility) — and those live in
 *        form_lock_config / academic_year_form_config, NEVER in the schema JSON.
 *
 * IMPORTANT — this is read-side and NON-MUTATING. It performs no migration, no
 * regeneration, creates no tables, and never rewrites an existing schema row.
 * An institution that already has its own active schema row keeps using it
 * (behavior unchanged); only a MISSING row falls back to the canonical schema,
 * which is exactly what schemaPropagationService would have cloned anyway.
 * ───────────────────────────────────────────────────────────────────────── */

/* The canonical schema for a form = its creator/earliest active schema row.
   This is the SAME selection schemaPropagationService has always used as the
   clone template, extracted here so there is one definition of "canonical".
   Returns the full row (schema, year, used_column_names, created_by, …) or null. */
async function getCanonicalSchema(pool, formName) {
  if (!formName || !/^[a-z][a-z0-9_]*$/.test(formName)) return null;
  const { rows } = await pool.query(
    `SELECT * FROM custom_field_schemas
      WHERE form_name = $1 AND is_active = true
      ORDER BY created_at ASC NULLS LAST, year ASC
      LIMIT 1`,
    [formName]
  );
  return rows[0] || null;
}

/* Resolve the schema row a given institution should use for a form.
   • If the institution has its own active row → return it (unchanged behavior).
   • Otherwise → fall back to the canonical schema (compatibility: old/missing
     rows keep working). Returns the row or null. */
async function resolveInstitutionSchema(pool, formName, institutionId) {
  if (!formName || !/^[a-z][a-z0-9_]*$/.test(formName)) return null;

  if (institutionId) {
    const { rows } = await pool.query(
      `SELECT * FROM custom_field_schemas
        WHERE form_name = $1 AND institution_id = $2 AND is_active = true
        ORDER BY year DESC
        LIMIT 1`,
      [formName, institutionId]
    );
    if (rows[0]) return rows[0];
  }

  return getCanonicalSchema(pool, formName);
}

module.exports = { getCanonicalSchema, resolveInstitutionSchema };
