"use strict";

/**
 * utils/snapshotHelper.js
 *
 * Creates a JSONB snapshot of a section + its blocks and writes it to
 * section_versions.  Called from approvals and version-restore routes.
 */

async function createSectionSnapshot(pool, sectionId, event, userId, reason = null, description = null) {
  // Load section row
  const { rows: sRows } = await pool.query(
    `SELECT * FROM public.report_sections WHERE id = $1`,
    [sectionId]
  );
  if (!sRows.length) throw new Error(`Section ${sectionId} not found`);
  const section = sRows[0];

  // Load blocks (ordered), each carrying its current translations — every snapshot is a
  // brand-new row in section_versions (never an UPDATE), so this captures both the primary
  // content AND the Hindi/etc. translation state at this exact point in time as history.
  const { rows: blocks } = await pool.query(
    `SELECT b.*,
            COALESCE(
              (SELECT jsonb_object_agg(bt.language, bt.content)
               FROM public.block_translations bt
               WHERE bt.block_id = b.id),
              '{}'::jsonb
            ) AS translations
     FROM public.section_blocks b
     WHERE b.section_id = $1 AND b.deleted_at IS NULL
     ORDER BY b.order_index`,
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
       (section_id, version_num, event, snapshot, created_by, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sectionId, versionNum, event, JSON.stringify(snapshot), userId || null, description || null]
  );

  return versionNum;
}

module.exports = { createSectionSnapshot };
