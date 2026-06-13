"use strict";

/**
 * academicYearService.js
 * ─────────────────────────────────────────────────────────────
 * Academic-Year-aware form lifecycle (Phase 1 — foundation).
 *
 * Two NEW additive tables (existing table_list / form_lock_config /
 * custom_field_schemas are NOT modified):
 *
 *   academic_year_master       — the academic years an institution has created,
 *                                with one row flagged active (current year).
 *   academic_year_form_config  — per (institution, academic_year) lifecycle:
 *                                which forms are active / archived / disabled.
 *
 * MAPPING RULE (locked decision): the academic-year string keys off its START
 * YEAR integer, which is exactly the integer `year` already stored on
 * custom_field_schemas / *_records. So "2025-2026" ⇄ start_year 2025.
 *
 * Form references are stored as table_list.id (uuid) strings inside the JSON
 * arrays — forms are never duplicated, only referenced.
 *
 * STANDARD FORMAT (locked): "YYYY-YYYY" — plain hyphen, 4-digit end year,
 * e.g. "2025-2026". This is the single canonical format shared with
 * nodal_officer_assignments.reporting_year (see normalizeReportingYears in
 * nodalOfficerAssignments.js) and management_committees.finance_year.
 * Older rows may still hold the legacy en-dash form ("2025–2026"); see
 * normalizeAcademicYears below for the one-time/idempotent rewrite.
 */

/* One-time, idempotent rewrite of any non-canonical academic_year strings
   (e.g. legacy en-dash "2025–2026") to the canonical "YYYY-YYYY" form. The
   authoritative `start_year` integer column is the source of truth, so the
   rebuilt string is always correct regardless of what separator/format the
   row previously held. Rows already canonical are left untouched (no-op). */
async function normalizeAcademicYears(pool) {
  await pool.query(`
    UPDATE academic_year_master
    SET academic_year = start_year || '-' || (start_year + 1)
    WHERE academic_year <> (start_year || '-' || (start_year + 1))
  `);
}

/* Ensure the two tables exist. Idempotent — safe to run on every boot, mirrors
   the ensureDeadlineColumns / translate_to_hindi pattern in server.js. */
async function ensureAcademicYearTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_year_master (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL,
      academic_year  text NOT NULL,
      start_year     integer NOT NULL,
      active         boolean NOT NULL DEFAULT false,
      created_by     uuid,
      created_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (institution_id, academic_year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_year_form_config (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id      uuid NOT NULL,
      academic_year       text NOT NULL,
      active_forms_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
      archived_forms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      open_close          jsonb NOT NULL DEFAULT '{}'::jsonb,
      disabled            jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by          uuid,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE (institution_id, academic_year)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_aym_inst_active ON academic_year_master (institution_id, active)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ayfc_inst_year ON academic_year_form_config (institution_id, academic_year)`
  );

  await normalizeAcademicYears(pool);
}

/* 2025 → "2025-2026"  (canonical YYYY-YYYY format, plain hyphen) */
function formatAcademicYear(startYear) {
  const s = Number(startYear);
  return `${s}-${s + 1}`;
}

/* "2025-2026" / "2025–2026" / "2025" → 2025 (start year integer), else null */
function parseStartYear(academicYear) {
  const m = String(academicYear).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/* Ensure the master + form-config rows exist for (institution, year). The master
   row is created INACTIVE so it never silently changes the institution's current
   year — that is an explicit admin action. Safe to call inside a transaction. */
async function ensureYearRows(client, { institutionId, academicYear, startYear, createdBy = null }) {
  await client.query(
    `INSERT INTO academic_year_master (institution_id, academic_year, start_year, active, created_by)
     VALUES ($1, $2, $3, false, $4)
     ON CONFLICT (institution_id, academic_year) DO NOTHING`,
    [institutionId, academicYear, startYear, createdBy]
  );
  await client.query(
    `INSERT INTO academic_year_form_config (institution_id, academic_year, created_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (institution_id, academic_year) DO NOTHING`,
    [institutionId, academicYear, createdBy]
  );
}

/* Place a form id into the list for `status` (active|archived|disabled) and
   remove it from the other two, for one (institution, year) config row.
   The config row must already exist (see ensureYearRows). */
async function setFormStatusForYear(client, { institutionId, academicYear, formId, status }) {
  const columns = { active: "active_forms_json", archived: "archived_forms_json", disabled: "disabled" };
  const target = columns[status];
  if (!target) throw new Error(`Invalid status: ${status}`);
  const others = Object.values(columns).filter((c) => c !== target);

  await client.query(
    `UPDATE academic_year_form_config
     SET ${target} = (
           SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${target} || to_jsonb($3::text)) AS e
         ),
         ${others[0]} = (
           SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${others[0]}) AS e WHERE e <> $3::text
         ),
         ${others[1]} = (
           SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${others[1]}) AS e WHERE e <> $3::text
         ),
         updated_at = now()
     WHERE institution_id = $1 AND academic_year = $2`,
    [institutionId, academicYear, String(formId)]
  );
}

module.exports = {
  ensureAcademicYearTables,
  formatAcademicYear,
  parseStartYear,
  ensureYearRows,
  setFormStatusForYear,
};
