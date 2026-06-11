"use strict";

/**
 * routes/builder/comments.js
 * Mount: app.use("/api/builder/comments", require("./routes/builder/comments"))
 *
 * GET    /block/:blockId            list comments on a block (threaded)
 * GET    /section/:sectionId        list all comments for a section
 * POST   /block/:blockId            add comment (or reply with parent_id)
 * PUT    /:id                       edit own comment
 * DELETE /:id                       soft-delete own comment (or admin)
 * PATCH  /:id/resolve               mark comment resolved
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

/* ── GET /block/:blockId ── list comments on block ──────────────────────────── */
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
       JOIN  public.users u  ON u.id  = c.created_by
       LEFT JOIN public.users ru ON ru.id = c.resolved_by
       WHERE ${conds.join(" AND ")}
       ORDER BY c.created_at ASC`, params
    );

    // Nest replies under their parent
    const map = {};
    const roots = [];
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

/* ── GET /section/:sectionId ── all comments for a section ──────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT c.*,
              u.full_name  AS author_name,
              sb.block_type
       FROM public.block_comments c
       JOIN  public.users u        ON u.id  = c.created_by
       JOIN  public.section_blocks sb ON sb.id = c.block_id
       WHERE c.section_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`, [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("comments GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get section comments" });
  }
});

/* ── POST /block/:blockId ── add comment ────────────────────────────────────── */
router.post("/block/:blockId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { body, parent_id } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "body is required" });

    // Fetch section_id from block
    const { rows: bRows } = await pool.query(
      `SELECT section_id FROM public.section_blocks WHERE id = $1 AND deleted_at IS NULL`, [blockId]
    );
    if (!bRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    if (parent_id && !isUUID(parent_id))
      return res.status(400).json({ success: false, message: "parent_id must be a UUID" });

    const { rows } = await pool.query(
      `INSERT INTO public.block_comments (block_id, section_id, parent_id, body, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [blockId, bRows[0].section_id, isUUID(parent_id) ? parent_id : null, body.trim(), req.user.userId]
    );

    // Notify section owner
    await pool.query(
      `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
       SELECT sa.user_id, 'COMMENT_ADDED', 'New comment on your section',
              $1, 'SECTION', $2
       FROM public.section_assignments sa
       WHERE sa.section_id = $2 AND sa.role = 'OWNER' AND sa.completed_at IS NULL
         AND sa.user_id != $3`,
      [body.substring(0, 100), bRows[0].section_id, req.user.userId]
    ).catch(() => {}); // non-fatal

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments POST /block/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add comment" });
  }
});

/* ── PUT /:id ── edit own comment ───────────────────────────────────────────── */
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

/* ── DELETE /:id ── soft-delete comment ─────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const isAdmin = (req.user.roles || []).some(r => ["super_admin","institute_admin"].includes(r));

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

/* ── PATCH /:id/resolve ── resolve a comment ────────────────────────────────── */
router.patch("/:id/resolve", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { rows } = await pool.query(
      `UPDATE public.block_comments
       SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [req.user.userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Comment not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("comments PATCH resolve", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to resolve comment" });
  }
});

module.exports = router;
