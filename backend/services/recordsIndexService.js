"use strict";

/**
 * recordsIndexService.js
 * ─────────────────────────────────────────────────────────────────────────
 * Bug 14 — scale. The physical record tables (`<form>_records` for institution
 * forms, `dept_form_<dep>_<slug>` for department forms) grow to 100k+ rows but
 * were created without indexes, so every list / search / pagination / export
 * filtered by institution/department and sorted by created_at did a sequential
 * scan, and every EN↔HI pair cascade looked up source_row_id by scan.
 *
 * This adds the minimal high-value indexes that match the actual query shapes,
 * keeping write cost low (only 2 indexes per table). Everything is idempotent
 * (CREATE INDEX IF NOT EXISTS), so it is safe to run on every boot and right
 * after a table is created.
 *
 *   institution records → (institution_id, created_at DESC)  — list/paginate/export
 *   department  records → (department_id, academic_year, created_at DESC)
 *   both                → (source_row_id)                    — EN↔HI pair cascade
 */

const logger = require("../utils/logger");

/* Create the hot-path indexes for one record table. `db` may be a pool or a
   transaction client. No-op for an invalid identifier. */
async function ensureRecordsIndexes(db, tableName) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) return;
  const isDept = tableName.startsWith("dept_form_");
  // Index names are bounded to Postgres' 63-char identifier limit; record table
  // names are derived from short form slugs in practice.
  const ix = (suffix) => `ix_${tableName}_${suffix}`.slice(0, 63);

  if (isDept) {
    await db.query(
      `CREATE INDEX IF NOT EXISTS ${ix("dac")} ON ${tableName} (department_id, academic_year, created_at DESC)`
    );
  } else {
    await db.query(
      `CREATE INDEX IF NOT EXISTS ${ix("ic")} ON ${tableName} (institution_id, created_at DESC)`
    );
  }
  await db.query(
    `CREATE INDEX IF NOT EXISTS ${ix("sr")} ON ${tableName} (source_row_id)`
  );
}

/* Backfill indexes on every existing record table. Runs async at boot (never
   blocks startup); failures on one table never stop the rest. */
async function ensureAllRecordsIndexes(pool) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%\\_records' ESCAPE '\\'
             OR table_name LIKE 'dept\\_form\\_%' ESCAPE '\\')`
  );
  let done = 0;
  for (const r of rows) {
    try { await ensureRecordsIndexes(pool, r.table_name); done++; }
    catch (e) { logger.error(`ensureRecordsIndexes failed for ${r.table_name}`, { stack: e.stack }); }
  }
  logger.info(`Records indexes ensured for ${done}/${rows.length} table(s)`);
}

module.exports = { ensureRecordsIndexes, ensureAllRecordsIndexes };
