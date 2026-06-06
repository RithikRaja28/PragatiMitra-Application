"use strict";

/**
 * routes/builder/versions.js
 * Mount: app.use("/api/builder/versions", require("./routes/builder/versions"))
 *
 * GET    /section/:sectionId           list version history for a section
 * GET    /section/:sectionId/:num      get full snapshot for a version
 * POST   /section/:sectionId/:num/restore   restore a past snapshot
 */

const express           = require("express");
const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const { createSectionSnapshot } = require("../../utils/snapshotHelper");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => typeof v === "string" && UUID_RE.test(v);

/* ─── GET /section/:sectionId — list versions ────────────────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT v.id, v.version_num, v.event, v.created_at,
              u.full_name AS created_by_name,
              v.snapshot->'meta' AS meta
       FROM public.section_versions v
       LEFT JOIN public.users u ON u.id = v.created_by
       WHERE v.section_id = $1
       ORDER BY v.version_num DESC`,
      [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/versions GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list versions" });
  }
});

/* ─── GET /section/:sectionId/:num — get snapshot ────────────────────────── */
router.get("/section/:sectionId/:num", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId, num } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const vNum = parseInt(num, 10);
    if (isNaN(vNum)) return res.status(400).json({ success: false, message: "version num must be an integer" });

    const { rows } = await pool.query(
      `SELECT v.*, u.full_name AS created_by_name
       FROM public.section_versions v
       LEFT JOIN public.users u ON u.id = v.created_by
       WHERE v.section_id = $1 AND v.version_num = $2`,
      [sectionId, vNum]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Version not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/versions GET /section/:id/:num", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get version" });
  }
});

/* ─── POST /section/:sectionId/:num/restore — restore snapshot ───────────── */
router.post(
  "/section/:sectionId/:num/restore",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const client = await pool.connect();
    try {
      const { sectionId, num } = req.params;
      if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

      const vNum = parseInt(num, 10);
      if (isNaN(vNum)) return res.status(400).json({ success: false, message: "version num must be an integer" });

      // Load snapshot
      const { rows: vRows } = await pool.query(
        `SELECT snapshot FROM public.section_versions WHERE section_id = $1 AND version_num = $2`,
        [sectionId, vNum]
      );
      if (!vRows.length) return res.status(404).json({ success: false, message: "Version not found" });

      const { section: snapSection, blocks: snapBlocks } = vRows[0].snapshot;

      await client.query("BEGIN");

      // Snapshot current state before overwriting
      await createSectionSnapshot(pool, sectionId, "RESTORED", req.user.userId, `Restored to v${vNum}`);

      // Restore section metadata (keep id, report_id, parent_id — restore title, description, order_index)
      await client.query(
        `UPDATE public.report_sections
         SET title = $1, description = $2, order_index = $3,
             status = 'DRAFT', updated_by = $4, updated_at = NOW()
         WHERE id = $5`,
        [snapSection.title, snapSection.description, snapSection.order_index, req.user.userId, sectionId]
      );

      // Soft-delete current blocks
      await client.query(
        `UPDATE public.section_blocks SET deleted_at = NOW() WHERE section_id = $1 AND deleted_at IS NULL`,
        [sectionId]
      );

      // Re-insert blocks from snapshot
      for (const b of snapBlocks) {
        await client.query(
          `INSERT INTO public.section_blocks
             (section_id, block_type, order_index, content, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5)`,
          [sectionId, b.block_type, b.order_index, JSON.stringify(b.content), req.user.userId]
        );
      }

      await client.query("COMMIT");

      await writeAuditLog(req, {
        actionType: "SECTION_RESTORED",
        entityType: "SECTION",
        entityId:   sectionId,
        newValue:   { restored_to_version: vNum },
        status:     "SUCCESS",
        message:    `Section restored to version ${vNum}`,
      });

      return res.json({ success: true, message: `Restored to version ${vNum}` });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("builder/versions POST /restore", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to restore version" });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
