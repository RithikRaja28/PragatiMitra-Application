"use strict";

/**
 * utils/snapshotHelper.js
 *
 * Creates a JSONB snapshot of a section + its blocks and writes it to
 * section_versions.  Called from approvals and version-restore routes.
 */

async function createSectionSnapshot(pool, sectionId, event, userId, reason = null) {
  // Load section row
  const { rows: sRows } = await pool.query(
    `SELECT * FROM public.report_sections WHERE id = $1`,
    [sectionId]
  );
  if (!sRows.length) throw new Error(`Section ${sectionId} not found`);
  const section = sRows[0];

  // Load blocks (ordered)
  const { rows: blocks } = await pool.query(
    `SELECT * FROM public.section_blocks
     WHERE section_id = $1 AND deleted_at IS NULL
     ORDER BY order_index`,
    [sectionId]
  );

  // Next version number
  const { rows: vRows } = await pool.query(
    `SELECT COALESCE(MAX(version_num), 0) + 1 AS next_num
     FROM public.section_versions WHERE section_id = $1`,
    [sectionId]
  );
  const versionNum = vRows[0].next_num;

  const snapshot = {
    section,
    blocks,
    meta: {
      reason,
      blocks_count: blocks.length,
      snapshot_at:  new Date().toISOString(),
    },
  };

  await pool.query(
    `INSERT INTO public.section_versions
       (section_id, version_num, event, snapshot, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [sectionId, versionNum, event, JSON.stringify(snapshot), userId || null]
  );

  return versionNum;
}

module.exports = { createSectionSnapshot };
