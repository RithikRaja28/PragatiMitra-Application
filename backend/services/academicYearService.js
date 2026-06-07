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
 * custom_field_schemas / *_records. So "2025–2026" ⇄ start_year 2025.
 *
 * Form references are stored as table_list.id (uuid) strings inside the JSON
 * arrays — forms are never duplicated, only referenced.
 */

const { getEffectiveState, STATE } = require("./stateResolver");

const EN_DASH = "–";

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

  // Lock + Archive lifecycle columns (additive — never drop/redefine).
  // is_locked  → institution+year is view-only (write APIs return 403).
  // is_archived→ year hidden from top bar / create / reports (records preserved).
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS is_locked   boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS locked_at   timestamptz`);
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS locked_by   uuid`);
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS archived_at timestamptz`);
  await pool.query(`ALTER TABLE academic_year_master ADD COLUMN IF NOT EXISTS archived_by uuid`);

  // Per-recipient audit of academic-year activation emails.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_year_notification_logs (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL,
      academic_year  text NOT NULL,
      recipient      text NOT NULL,
      status         text NOT NULL,
      sent_at        timestamptz,
      error          text,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_aym_inst_active ON academic_year_master (institution_id, active)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ayfc_inst_year ON academic_year_form_config (institution_id, academic_year)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_aynl_inst_year ON academic_year_notification_logs (institution_id, academic_year)`
  );
}

/* Returns { locked, message } for a (institution, start-year) academic year.
   Used by every record write path to enforce institution-scoped view-only mode.
   A missing year row is NOT locked (backward compatible). */
async function getAcademicYearLockBlock(pool, institutionId, year) {
  if (!institutionId || year == null) return { locked: false, message: null };
  try {
    const { rows } = await pool.query(
      `SELECT is_locked FROM academic_year_master
       WHERE institution_id = $1 AND start_year = $2`,
      [institutionId, Number(year)]
    );
    // Precedence via the shared resolver (see stateResolver.js). The academic
    // year exposes a manual lock only, so this resolves to LOCKED when set.
    const state = getEffectiveState({ locked: !!rows[0]?.is_locked });
    if (state === STATE.LOCKED) {
      return {
        locked: true,
        message: "This academic year is locked. Records are available in view-only mode.",
      };
    }
  } catch {
    // Never block a write because the lock lookup failed.
  }
  return { locked: false, message: null };
}

/* Resolve the year the user is operating in from the X-Academic-Year request
   header (the top-bar selection), falling back to the record/schema year, then
   check the lock. This is what makes "lock the SELECTED year" actually block
   writes even when the form's stored schema year differs from the selected
   academic year. */
async function getAcademicYearLockBlockForReq(pool, req, institutionId, fallbackYear) {
  const headerYear = Number(req?.headers?.["x-academic-year"]);
  const year = Number.isInteger(headerYear) ? headerYear : fallbackYear;
  return getAcademicYearLockBlock(pool, institutionId, year);
}

/* The institution's CURRENTLY ACTIVE academic year (start-year int), or null if
   the institution hasn't created any years yet. The institution OWNS the
   academic year; departments INHERIT it. This is the value a department request
   should fall back to (instead of guessing the calendar year) when no explicit
   year is supplied. Read-only; never blocks on error. */
async function resolveActiveAcademicYear(pool, institutionId) {
  if (!institutionId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT start_year FROM academic_year_master
        WHERE institution_id = $1 AND active = true
        ORDER BY start_year DESC
        LIMIT 1`,
      [institutionId]
    );
    return rows[0]?.start_year ?? null;
  } catch {
    return null;
  }
}

/* 2025 → "2025–2026"  (en-dash, matches the spec's display format) */
function formatAcademicYear(startYear) {
  const s = Number(startYear);
  return `${s}${EN_DASH}${s + 1}`;
}

/* "2025–2026" / "2025-2026" / "2025" → 2025 (start year integer), else null */
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
  getAcademicYearLockBlock,
  getAcademicYearLockBlockForReq,
  resolveActiveAcademicYear,
};
