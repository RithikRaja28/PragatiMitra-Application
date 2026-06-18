"use strict";

/**
 * routes/builder/comments.js
 * Mount: app.use("/api/builder/comments", require("./routes/builder/comments"))
 *
 * GET    /block/:blockId                  list threaded comments on a block
 * GET    /section/:sectionId/counts       unresolved count per block (badges)
 * GET    /section/:sectionId              all comments grouped by block
 * GET    /report/:reportId/unresolved     all unresolved across a report
 * POST   /block/:blockId                  add top-level comment on a block
 * POST   /:parentId/replies               add reply (flat threading enforced)
 * PUT    /:id                             edit own comment
 * DELETE /:id                             soft-delete comment (own or admin)
 * PATCH  /:id/resolve                     mark top-level comment resolved
 * PATCH  /:id/reopen                      reopen a resolved comment
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

/* ── GET /block/:blockId ── threaded comments on a specific block ─────────── */
router.get("/block/:blockId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { resolved } = req.query;
    const params = [blockId];
    const conds  = ["c.block_id = $1", "c.deleted_at IS NULL"];
    if (resolved === "true")  conds.push("c.is_resolved = TRUE");
    if (resolved === "false") conds.push("c.is_resolved = FALSE");

    const { rows } = await pool.query(
      `SELECT c.*,
              u.full_name  AS author_name,
              u.email      AS author_email,
              ru.full_name AS resolved_by_name
       FROM public.block_comments c
       JOIN  public.users u   ON u.id  = c.created_by
       LEFT JOIN public.users ru ON ru.id = c.resolved_by
       WHERE ${conds.join(" AND ")}
       ORDER BY c.created_at ASC`, params
    );

    const map = {}, roots = [];
    for (const r of rows) { r.replies = []; map[r.id] = r; }
    for (const r of rows) {
      if (r.parent_id && map[r.parent_id]) map[r.parent_id].replies.push(r);
      else roots.push(r);
    }

    return res.json({ success: true, data: roots });
  } catch (err) {
    logger.error("comments GET /block/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get comments" });
  }
});

/* ── GET /section/:sectionId/counts ── unresolved badge counts per block ── */
router.get("/section/:sectionId/counts", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT block_id,
              COUNT(*)                                       AS total,
              COUNT(*) FILTER (WHERE is_resolved = FALSE)   AS unresolved
       FROM public.block_comments
       WHERE section_id = $1 AND deleted_at IS NULL AND parent_id IS NULL
       GROUP BY block_id`,
      [sectionId]
    );

    const counts = {};
    for (const r of rows) {
      counts[r.block_id] = { total: Number(r.total), unresolved: Number(r.unresolved) };
    }

    return res.json({ success: true, counts });
  } catch (err) {
    logger.error("comments GET /section/:id/counts", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get counts" });
  }
});

/* ── GET /section/:sectionId ── all comments grouped by block ───────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT c.*,
              u.full_name  AS author_name,
              ru.full_name AS resolved_by_name,
              sb.block_type
       FROM public.block_comments c
       JOIN  public.users u         ON u.id  = c.created_by
       LEFT JOIN public.users ru    ON ru.id = c.resolved_by
       JOIN  public.section_blocks sb ON sb.id = c.block_id
       WHERE c.section_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.block_id, c.created_at ASC`,
      [sectionId]
    );

    const blockMap = {};
    for (const r of rows) {
      if (!blockMap[r.block_id]) {
        blockMap[r.block_id] = { total: 0, unresolved: 0, comments: [], _map: {} };
      }
      r.replies = [];
      blockMap[r.block_id]._map[r.id] = r;
    }
    for (const r of rows) {
      const bg = blockMap[r.block_id];
      if (r.parent_id && bg._map[r.parent_id]) {
        bg._map[r.parent_id].replies.push(r);
      } else if (!r.parent_id) {
        bg.comments.push(r);
        bg.total++;
        if (!r.is_resolved) bg.unresolved++;
      }
    }

    const blocks = {};
    for (const [bid, val] of Object.entries(blockMap)) {
      const { _map, ...rest } = val;
      blocks[bid] = rest;
    }

    return res.json({ success: true, blocks });
  } catch (err) {
    logger.error("comments GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get section comments" });
  }
});

/* ── GET /report/:reportId/unresolved ── all unresolved in a report ──────── */
router.get("/report/:reportId/unresolved", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId } = req.params;
    if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const { rows } = await pool.query(
      `SELECT c.*,
              u.full_name  AS author_name,
              sb.block_type,
              rs.title     AS section_title,
              rs.id        AS section_id
       FROM public.block_comments c
       JOIN  public.users u          ON u.id  = c.created_by
       JOIN  public.section_blocks sb ON sb.id = c.block_id
       JOIN  public.report_sections rs ON rs.id = c.section_id
       WHERE rs.report_id = $1
         AND c.is_resolved = FALSE
         AND c.deleted_at IS NULL
         AND c.parent_id IS NULL
       ORDER BY rs.order_index, c.created_at ASC`,
      [reportId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("comments GET /report/:id/unresolved", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get unresolved comments" });
  }
});

/* ── POST /block/:blockId ── add top-level comment on a block ───────────── */
router.post("/block/:blockId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "body is required" });

    const { rows: bRows } = await pool.query(
      `SELECT section_id FROM public.section_blocks WHERE id = $1 AND deleted_at IS NULL`, [blockId]
    );
    if (!bRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const { rows } = await pool.query(
      `INSERT INTO public.block_comments (block_id, section_id, parent_id, body, created_by)
       VALUES ($1,$2,NULL,$3,$4) RETURNING *`,
      [blockId, bRows[0].section_id, body.trim(), req.user.userId]
    );

    await pool.query(
      `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
       SELECT sa.user_id, 'COMMENT_ADDED', 'New comment on your section',
              $1, 'SECTION', $2
       FROM public.section_assignments sa
       WHERE sa.section_id = $2 AND sa.role = 'OWNER' AND sa.completed_at IS NULL
         AND sa.user_id != $3`,
      [body.substring(0, 100), bRows[0].section_id, req.user.userId]
    ).catch(() => {});

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments POST /block/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add comment" });
  }
});

/* ── POST /:parentId/replies ── reply to a comment (flat threading) ──────── */
router.post("/:parentId/replies", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { parentId } = req.params;
    if (!isUUID(parentId)) return res.status(400).json({ success: false, message: "Invalid parent id" });

    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "body is required" });

    const { rows: pRows } = await pool.query(
      `SELECT id, block_id, section_id, parent_id
       FROM public.block_comments
       WHERE id = $1 AND deleted_at IS NULL`, [parentId]
    );
    if (!pRows.length) return res.status(404).json({ success: false, message: "Parent comment not found" });
    if (pRows[0].parent_id !== null)
      return res.status(400).json({ success: false, message: "Can only reply to top-level comments" });

    const { block_id, section_id } = pRows[0];

    const { rows } = await pool.query(
      `INSERT INTO public.block_comments (block_id, section_id, parent_id, body, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [block_id, section_id, parentId, body.trim(), req.user.userId]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments POST /:parentId/replies", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add reply" });
  }
});

/* ── PUT /:id ── edit own comment ───────────────────────────────────────── */
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "body is required" });

    const { rows } = await pool.query(
      `UPDATE public.block_comments
       SET body = $1, updated_by = $2
       WHERE id = $3 AND created_by = $4 AND deleted_at IS NULL RETURNING *`,
      [body.trim(), req.user.userId, id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Comment not found or not yours" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to edit comment" });
  }
});

/* ── DELETE /:id ── soft-delete comment ────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const isAdmin = (req.user.roles || []).some(r => ["super_admin", "institute_admin"].includes(r));

    const { rows } = await pool.query(
      `UPDATE public.block_comments SET deleted_at = NOW()
       WHERE id = $1 AND ($2 OR created_by = $3) AND deleted_at IS NULL RETURNING id`,
      [id, isAdmin, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Comment not found or not yours" });

    return res.json({ success: true, message: "Comment deleted" });
  } catch (err) {
    logger.error("comments DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete comment" });
  }
});

/* ── PATCH /:id/resolve ── resolve a top-level comment ─────────────────── */
router.patch("/:id/resolve", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { rows } = await pool.query(
      `UPDATE public.block_comments
       SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2 AND parent_id IS NULL AND deleted_at IS NULL RETURNING *`,
      [req.user.userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Comment not found or is a reply" });

    const { rows: uRows } = await pool.query(
      `SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId]
    );

    return res.json({ success: true, data: { ...rows[0], resolved_by_name: uRows[0]?.full_name } });
  } catch (err) {
    logger.error("comments PATCH resolve", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to resolve comment" });
  }
});

/* ── PATCH /:id/reopen ── reopen a resolved comment ────────────────────── */
router.patch("/:id/reopen", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { rows } = await pool.query(
      `UPDATE public.block_comments
       SET is_resolved = FALSE, resolved_by = NULL, resolved_at = NULL
       WHERE id = $1 AND parent_id IS NULL AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Comment not found or is a reply" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments PATCH reopen", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to reopen comment" });
  }
});

module.exports = router;
