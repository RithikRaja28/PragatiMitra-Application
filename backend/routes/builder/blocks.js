"use strict";

/**
 * routes/builder/blocks.js
 * Mount: app.use("/api/builder/blocks", require("./routes/builder/blocks"))
 *
 * GET    /section/:sectionId     list blocks for a section
 * POST   /section/:sectionId     create block
 * PUT    /:id                    update block content
 * DELETE /:id                    soft-delete block
 * POST   /reorder                bulk reorder blocks
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => typeof v === "string" && UUID_RE.test(v);

const VALID_TYPES = ["PARAGRAPH","HEADING","IMAGE","IMAGE_GRID","TABLE","KPI","CHART","LIST","FILE","DIVIDER"];

/* ─── GET /section/:sectionId ─────────────────────────────────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT * FROM public.section_blocks
       WHERE section_id = $1 AND deleted_at IS NULL
       ORDER BY order_index`,
      [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/blocks GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list blocks" });
  }
});

/* ─── POST /section/:sectionId — create block ────────────────────────────── */
router.post("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId }              = req.params;
    const { block_type, content = {}, order_index } = req.body;

    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });
    if (!block_type || !VALID_TYPES.includes(block_type.toUpperCase()))
      return res.status(400).json({ success: false, message: `block_type must be one of: ${VALID_TYPES.join(", ")}` });

    // Verify section exists
    const { rows: sr } = await pool.query(
      `SELECT id FROM public.report_sections WHERE id = $1 AND deleted_at IS NULL`,
      [sectionId]
    );
    if (!sr.length) return res.status(404).json({ success: false, message: "Section not found" });

    // Compute order_index
    let oi = order_index != null ? Number(order_index) : null;
    if (oi == null) {
      const { rows: oRows } = await pool.query(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS next_oi
         FROM public.section_blocks WHERE section_id = $1 AND deleted_at IS NULL`,
        [sectionId]
      );
      oi = oRows[0].next_oi;
    }

    const { rows } = await pool.query(
      `INSERT INTO public.section_blocks
         (section_id, block_type, order_index, content, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5)
       RETURNING *`,
      [sectionId, block_type.toUpperCase(), oi, JSON.stringify(content), req.user.userId]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/blocks POST /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create block" });
  }
});

/* ─── PUT /:id — update block content ──────────────────────────────────── */
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id }    = req.params;
    const { content, order_index } = req.body;

    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const sets   = [];
    const params = [];

    if (content !== undefined) {
      params.push(JSON.stringify(content));
      sets.push(`content = $${params.length}`);
    }
    if (order_index != null) {
      params.push(Number(order_index));
      sets.push(`order_index = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });

    params.push(req.user.userId);
    sets.push(`updated_by = $${params.length}`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE public.section_blocks SET ${sets.join(", ")}
       WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Block not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/blocks PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update block" });
  }
});

/* ─── DELETE /:id — soft delete ─────────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { rows } = await pool.query(
      `UPDATE public.section_blocks SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Block not found" });

    return res.json({ success: true, message: "Block deleted" });
  } catch (err) {
    logger.error("builder/blocks DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete block" });
  }
});

/* ─── POST /reorder — bulk reorder ──────────────────────────────────────── */
router.post("/reorder", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { items } = req.body; // [{ id, order_index }]
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ success: false, message: "items[] required" });

    for (const item of items) {
      if (!isUUID(item.id) || item.order_index == null)
        return res.status(400).json({ success: false, message: "Each item needs a UUID id and numeric order_index" });
    }

    const ids    = items.map((i) => i.id);
    const orders = items.map((i) => Number(i.order_index));

    await pool.query(
      `UPDATE public.section_blocks AS b
       SET order_index = v.order_index::REAL,
           updated_by  = $3
       FROM (SELECT UNNEST($1::uuid[]) AS id, UNNEST($2::real[]) AS order_index) AS v
       WHERE b.id = v.id AND b.deleted_at IS NULL`,
      [ids, orders, req.user.userId]
    );

    return res.json({ success: true, message: "Blocks reordered" });
  } catch (err) {
    logger.error("builder/blocks POST /reorder", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to reorder blocks" });
  }
});

module.exports = router;
