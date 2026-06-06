"use strict";

/**
 * routes/builder/notifications.js
 * Mount: app.use("/api/builder/notifications", ...)
 *
 * GET    /          list unread (and optionally all) notifications for caller
 * PATCH  /:id/read  mark one notification read
 * PATCH  /read-all  mark all notifications read
 * DELETE /:id       delete a notification
 */

const express         = require("express");
const { verifyToken } = require("../../middleware/auth");
const logger          = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

/* ── GET / ── list notifications ────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { unread_only = "true", limit = 50 } = req.query;
    const params = [req.user.userId];
    const conds  = ["n.user_id = $1"];

    if (unread_only === "true") conds.push("n.read_at IS NULL");

    const { rows } = await pool.query(
      `SELECT * FROM public.notifications n
       WHERE ${conds.join(" AND ")}
       ORDER BY n.created_at DESC
       LIMIT ${Math.min(200, Number(limit))}`, params
    );

    const unreadCount = rows.filter(r => !r.read_at).length;
    return res.json({ success: true, data: rows, unread_count: unreadCount });
  } catch (err) {
    logger.error("notifications GET /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get notifications" });
  }
});

/* ── PATCH /:id/read ── mark one read ───────────────────────────────────────── */
router.patch("/:id/read", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    await pool.query(
      `UPDATE public.notifications SET read_at = NOW()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, req.user.userId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error("notifications PATCH read", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to mark read" });
  }
});

/* ── PATCH /read-all ── mark all read ───────────────────────────────────────── */
router.patch("/read-all", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `UPDATE public.notifications SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL RETURNING id`,
      [req.user.userId]
    );
    return res.json({ success: true, marked: rows.length });
  } catch (err) {
    logger.error("notifications PATCH read-all", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to mark all read" });
  }
});

/* ── DELETE /:id ── delete notification ─────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    await pool.query(
      `DELETE FROM public.notifications WHERE id = $1 AND user_id = $2`,
      [id, req.user.userId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error("notifications DELETE", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
});

module.exports = router;
