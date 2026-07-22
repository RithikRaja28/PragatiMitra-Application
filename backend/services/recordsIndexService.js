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
  // Legacy records tables may predate source_row_id (added lazily on first write
  // via ensureSourceRowIdColumn). Ensure it exists before indexing it — IF NOT
  // EXISTS makes this a no-op when already present.
  await db.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS source_row_id UUID`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS ${ix("sr")} ON ${tableName} (source_row_id)`
  );
}

/* Standard (non-searchable) columns — never get a trigram index. */
const STD_COLS = new Set([
  "form_name", "institution_id", "department_id", "year", "academic_year", "schema_id",
  "status", "order_index", "custom_fields", "language", "source_row_id",
  "created_by", "updated_by", "created_at", "updated_at", "role_name",
]);

/* L-1 — substring-search acceleration. The records search uses ILIKE '%term%' (a
   leading wildcard a B-tree cannot use), so add a GIN trigram index on each
   searchable TEXT/VARCHAR column. Results are byte-identical — only execution gets
   faster. Built CONCURRENTLY (no table lock) and pool-only (never inside the
   create-path transaction). Degrades gracefully: if pg_trgm isn't available the
   index simply isn't created and search falls back to the existing scan. */
async function ensureRecordsTrgmIndexes(pool, tableName) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) return;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND data_type IN ('text', 'character varying')`,
    [tableName]
  );
  for (const r of rows) {
    const col = r.column_name;
    if (STD_COLS.has(col) || !/^[a-z][a-z0-9_]*$/.test(col)) continue;
    const ix = `ix_${tableName}_${col}_trgm`.slice(0, 63);
    try {
      await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${ix} ON ${tableName} USING gin ("${col}" gin_trgm_ops)`);
    } catch (e) {
      logger.error(`trgm index failed for ${tableName}.${col}`, { stack: e.stack });
    }
  }
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

  // L-1 — trigram search indexes (best-effort; requires the pg_trgm extension).
  const trgmOk = await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
    .then(() => true)
    .catch((e) => { logger.error("pg_trgm extension unavailable — search trigram indexes skipped", { stack: e.stack }); return false; });
  if (trgmOk) {
    for (const r of rows) {
      try { await ensureRecordsTrgmIndexes(pool, r.table_name); }
      catch (e) { logger.error(`ensureRecordsTrgmIndexes failed for ${r.table_name}`, { stack: e.stack }); }
    }
    logger.info(`Search (trigram) indexes ensured across ${rows.length} record table(s)`);
  }
}

module.exports = { ensureRecordsIndexes, ensureRecordsTrgmIndexes, ensureAllRecordsIndexes };
