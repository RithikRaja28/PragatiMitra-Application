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
  columnsEnsured = true;
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

  return locked.length;
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

module.exports = { ensureDeadlineColumns, runDeadlineCheck, startDeadlineScheduler };
