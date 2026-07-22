"use strict";

const logger = require("../utils/logger");

/* ─────────────────────────────────────────────────────────────────────
   Form Deadline & Auto-Lock service
   ─────────────────────────────────────────────────────────────────────
   Enhancement layer on top of the existing manual lock system.

   - table_list.deadline_at  : when the form auto-locks (NULL = no deadline)
   - table_list.auto_locked  : set true once the deadline checker has locked
                               the form, so we only auto-lock ONCE. After that
                               an institution admin may manually unlock and it
                               will NOT be re-locked by the checker.

   The checker simply flips form_lock_config.is_locked = true, exactly the
   same column the manual lock toggles — so department access enforcement in
   formData.js needs no changes.
───────────────────────────────────────────────────────────────────── */

let columnsEnsured = false;

/* Idempotent, safe schema extension — never touches existing columns.
   Deadlines are institution-specific and live ONLY on form_lock_config.
   (table_list is no longer used for deadlines.) */
async function ensureDeadlineColumns(pool) {
  if (columnsEnsured) return;
  await pool.query(`
    ALTER TABLE form_lock_config
      ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS auto_locked BOOLEAN DEFAULT FALSE
  `);
  await ensureYearDeadlineTable(pool);
  columnsEnsured = true;
}

/* Year-scoped deadlines (Issue 5). A deadline set for an academic year locks ONLY
   that year — switching the top-bar year switches the deadline. This is additive:
   `form_lock_config` (form-wide manual lock + the legacy form-wide deadline) is
   untouched, so a form that has never had a per-year deadline behaves exactly as
   before. Once a per-year deadline is set, the per-year row governs that year and
   the legacy form-wide deadline is cleared (virtual migration — see PUT /deadline). */
async function ensureYearDeadlineTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_year_deadlines (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      form_name      text NOT NULL,
      institution_id uuid NOT NULL,
      academic_year  integer NOT NULL,
      deadline_at    timestamptz,
      is_locked      boolean NOT NULL DEFAULT false,
      auto_locked    boolean NOT NULL DEFAULT false,
      locked_at      timestamptz,
      locked_by      uuid,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (form_name, institution_id, academic_year)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_fyd_form_inst_year
       ON form_year_deadlines (form_name, institution_id, academic_year)`
  );
}

/* Core checker: lock any form_lock_config row whose deadline has passed and
   that hasn't been auto-locked yet. Operates per-institution row, so only the
   expired institution is locked — others with later/NULL deadlines are
   untouched. A manual unlock of one institution is never re-locked.
   Returns the number of rows newly auto-locked. */
async function runDeadlineCheck(pool) {
  await ensureDeadlineColumns(pool);

  const { rows: locked } = await pool.query(
    `UPDATE form_lock_config
     SET is_locked = true,
         auto_locked = true,
         locked_at = now(),
         updated_at = now()
     WHERE deadline_at IS NOT NULL
       AND deadline_at <= NOW()
       AND COALESCE(auto_locked, false) = false
     RETURNING form_name, institution_id`
  );

  if (locked.length) {
    const forms = [...new Set(locked.map((r) => r.form_name))];
    logger.info(`Auto-locked ${locked.length} form_lock_config row(s) past deadline: ${forms.join(", ")}`);
  }

  // Year-scoped pass (Issue 5): auto-lock per-year deadline rows whose deadline
  // has passed — locks ONLY that (form, institution, year), never other years.
  const { rows: yearLocked } = await pool.query(
    `UPDATE form_year_deadlines
     SET is_locked = true,
         auto_locked = true,
         locked_at = now(),
         updated_at = now()
     WHERE deadline_at IS NOT NULL
       AND deadline_at <= NOW()
       AND COALESCE(auto_locked, false) = false
     RETURNING form_name, institution_id, academic_year`
  );
  if (yearLocked.length) {
    const forms = [...new Set(yearLocked.map((r) => `${r.form_name}@${r.academic_year}`))];
    logger.info(`Auto-locked ${yearLocked.length} year-scoped deadline row(s): ${forms.join(", ")}`);
  }

  return locked.length + yearLocked.length;
}

/* Periodic checker — mirrors the existing setInterval cleanup pattern in
   server.js (no extra cron dependency). Runs once on boot then every
   intervalMs. .unref() so it never keeps the process alive on shutdown. */
function startDeadlineScheduler(pool, intervalMs = 60 * 1000) {
  // Initial run shortly after boot (give the pool a moment to settle).
  setTimeout(() => {
    runDeadlineCheck(pool).catch((err) =>
      logger.error("Initial deadline check failed", { stack: err.stack })
    );
  }, 5 * 1000).unref();

  const timer = setInterval(() => {
    runDeadlineCheck(pool).catch((err) =>
      logger.error("Scheduled deadline check failed", { stack: err.stack })
    );
  }, intervalMs);
  timer.unref();

  logger.info(`Form deadline auto-lock scheduler started (every ${Math.round(intervalMs / 1000)}s)`);
  return timer;
}

module.exports = { ensureDeadlineColumns, ensureYearDeadlineTable, runDeadlineCheck, startDeadlineScheduler };
