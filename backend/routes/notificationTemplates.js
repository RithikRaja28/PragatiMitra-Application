"use strict";

const express                      = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog }            = require("../utils/audit");
const logger                       = require("../utils/logger");
const { getLogContext }            = logger;

const router = express.Router();

/* ════════════════════════════════════════════════════════════════
   INBOX ROUTES — must be BEFORE /:event_id
   Any logged-in user can access their own notifications.
════════════════════════════════════════════════════════════════ */

/* ── GET /api/notification-templates/inbox ── */
router.get("/inbox", verifyToken, async (req, res) => {
  const pool   = req.app.locals.pool;
  const userId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT id, event_id, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
    );
    return res.json({ success: true, notifications: rows });
  } catch (err) {
    logger.error("GET /inbox failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── GET /api/notification-templates/inbox/unread ── */
router.get("/inbox/unread", verifyToken, async (req, res) => {
  const pool   = req.app.locals.pool;
  const userId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return res.json({ success: true, count: parseInt(rows[0].cnt, 10) });
  } catch (err) {
    logger.error("GET /inbox/unread failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/notification-templates/inbox/read-all ── */
router.put("/inbox/read-all", verifyToken, async (req, res) => {
  const pool   = req.app.locals.pool;
  const userId = req.user.userId;
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
      [userId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error("PUT /inbox/read-all failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/notification-templates/inbox/:id/read ── */
router.put("/inbox/:id/read", verifyToken, async (req, res) => {
  const pool   = req.app.locals.pool;
  const userId = req.user.userId;
  const id     = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "Invalid notification id." });
  }

  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error("PUT /inbox/:id/read failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ════════════════════════════════════════════════════════════════
   ADMIN TEMPLATE ROUTES — AFTER inbox routes
   /:event_id must be last — it would swallow /inbox if placed first
════════════════════════════════════════════════════════════════ */

/* ── GET /api/notification-templates ── */
router.get(
  "/",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { rows } = await pool.query(
        `SELECT event_id, label, role_group, category, email_enabled, app_enabled,
                email_subject, email_body, app_message, updated_at
         FROM notification_templates
         ORDER BY role_group, category, id`
      );
      return res.json({ success: true, templates: rows });
    } catch (err) {
      logger.error("GET /api/notification-templates failed", {
        ...getLogContext(req), stack: err.stack,
      });
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
  }
);

/* ── PUT /api/notification-templates/:event_id ── */
router.put(
  "/:event_id",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { event_id } = req.params;
    const { email_enabled, app_enabled, email_subject, email_body, app_message } = req.body;

    if (!email_subject?.trim() || !email_body?.trim()) {
      return res.status(400).json({ success: false, message: "Subject and body are required." });
    }

    try {
      const { rows: existing } = await pool.query(
        `SELECT * FROM notification_templates WHERE event_id = $1`,
        [event_id]
      );
      if (!existing.length) {
        return res.status(404).json({ success: false, message: "Template not found." });
      }

      const { rows } = await pool.query(
        `UPDATE notification_templates
         SET email_enabled = $1,
             app_enabled   = $2,
             email_subject = $3,
             email_body    = $4,
             app_message   = $5,
             updated_at    = now(),
             updated_by    = $6
         WHERE event_id = $7
         RETURNING event_id, label, email_enabled, app_enabled,
                   email_subject, email_body, app_message, updated_at`,
        [
          email_enabled ?? existing[0].email_enabled,
          app_enabled   ?? existing[0].app_enabled,
          email_subject.trim(),
          email_body.trim(),
          app_message?.trim() ?? "",
          req.user.userId,
          event_id,
        ]
      );

      await writeAuditLog(req, {
        actionType: "NOTIFICATION_TEMPLATE_UPDATED",
        entityType: "NOTIFICATION_TEMPLATE",
        entityId:   event_id,
        oldValue:   existing[0],
        newValue:   rows[0],
        status:     "SUCCESS",
        message:    `Notification template "${rows[0].label}" updated`,
      });

      return res.json({ success: true, template: rows[0] });
    } catch (err) {
      logger.error("PUT /api/notification-templates/:event_id failed", {
        ...getLogContext(req), stack: err.stack,
      });
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
  }
);

module.exports = router;