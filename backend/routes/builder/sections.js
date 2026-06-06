"use strict";

/**
 * routes/builder/sections.js
 * Mount: app.use("/api/builder/sections", require("./routes/builder/sections"))
 *
 * POST   /                       create section
 * GET    /:id                    get section (blocks included)
 * PUT    /:id                    update title / description / order_index
 * PATCH  /:id/status             transition status
 * DELETE /:id                    soft-delete
 * POST   /reorder                bulk reorder (fractional indexing)
 * POST   /:id/lock               acquire editing lock
 * DELETE /:id/lock               release editing lock
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

/* ─── GET /review-queue — sections pending this user's review ───────────── */
router.get("/review-queue", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const roles   = req.user.roles || [];
    const isAdmin = roles.includes("super_admin") || roles.includes("institute_admin");
    const instId  = req.user.institutionId || null;
    const userId  = req.user.userId;

    /*
     * Strict step routing:
     *   Every user (including admins) only sees sections whose current workflow
     *   step designates them (by user id OR by role).
     *
     *   Admins additionally see submitted sections that have NO workflow step
     *   assigned (current_step_id IS NULL) as an oversight fallback — those
     *   sections can't route to anyone specific.
     */
    const { rows } = await pool.query(
      `SELECT
         s.id, s.title, s.status, s.report_id, s.current_step_id,
         s.submission_deadline,
         s.updated_at AS submitted_at,
         r.title AS report_title, r.report_type, r.academic_year,
         ws.step_name  AS current_step_name,
         ws.step_order AS current_step_order,
         u.full_name   AS submitted_by_name
       FROM public.report_sections s
       JOIN public.reports r ON r.id = s.report_id AND r.deleted_at IS NULL
       LEFT JOIN public.workflow_steps ws ON ws.id = s.current_step_id
       LEFT JOIN public.users u ON u.id = s.updated_by
       WHERE s.status IN ('SUBMITTED','UNDER_REVIEW')
         AND s.deleted_at IS NULL
         AND ($1::uuid IS NULL OR r.institution_id = $1)
         AND (
           /* Step explicitly designates this user or their role */
           ws.approver_user_id = $2
           OR ws.approver_role = ANY($3::text[])
           /* Admins see workflow-less sections as fallback oversight */
           OR ($4 AND s.current_step_id IS NULL)
         )
       ORDER BY s.updated_at DESC`,
      [instId, userId, roles, isAdmin]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/sections GET /review-queue", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get review queue" });
  }
});

/* ─── GET /assigned — all sections assigned to the current user ──────────── */
router.get("/assigned", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id, s.title, s.description, s.status, s.report_id, s.order_index,
         r.title          AS report_title,
         r.report_type,
         r.academic_year,
         r.institution_id,
         a.id             AS assignment_id,
         a.role           AS assignment_role,
         a.due_at,
         a.assigned_at,
         a.completed_at
       FROM public.section_assignments a
       JOIN public.report_sections s ON s.id = a.section_id AND s.deleted_at IS NULL
       JOIN public.reports r         ON r.id = s.report_id  AND r.deleted_at IS NULL
       WHERE a.user_id = $1
       ORDER BY a.due_at ASC NULLS LAST, r.title, s.order_index`,
      [req.user.userId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/sections GET /assigned", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get assigned sections" });
  }
});

/* ─── POST / — create section ─────────────────────────────────────────────── */
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { report_id, parent_id, title, description, order_index } = req.body;
    if (!isUUID(report_id)) return res.status(400).json({ success: false, message: "report_id (UUID) required" });
    if (!title?.trim())     return res.status(400).json({ success: false, message: "title required" });

    // Verify report exists
    const { rows: rr } = await pool.query(
      `SELECT id FROM public.reports WHERE id = $1 AND deleted_at IS NULL`,
      [report_id]
    );
    if (!rr.length) return res.status(404).json({ success: false, message: "Report not found" });

    if (parent_id && !isUUID(parent_id))
      return res.status(400).json({ success: false, message: "parent_id must be a UUID" });

    // Default order_index: max + 1 for siblings
    let oi = order_index != null ? Number(order_index) : null;
    if (oi == null) {
      const { rows: oRows } = await pool.query(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS next_oi
         FROM public.report_sections
         WHERE report_id = $1 AND ${parent_id ? "parent_id = $2" : "parent_id IS NULL"}
           AND deleted_at IS NULL`,
        parent_id ? [report_id, parent_id] : [report_id]
      );
      oi = oRows[0].next_oi;
    }

    const { rows } = await pool.query(
      `INSERT INTO public.report_sections
         (report_id, parent_id, title, description, order_index, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING *`,
      [report_id, parent_id || null, title.trim(), description || null, oi, req.user.userId]
    );
    const section = rows[0];

    await writeAuditLog(req, {
      actionType: "SECTION_CREATED",
      entityType: "SECTION",
      entityId:   section.id,
      newValue:   section,
      status:     "SUCCESS",
      message:    `Section "${section.title}" created`,
    });

    return res.status(201).json({ success: true, data: section });
  } catch (err) {
    logger.error("builder/sections POST /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create section" });
  }
});

/* ─── GET /:id — get section with blocks ─────────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows: sRows } = await pool.query(
      `SELECT s.*, u.full_name AS locked_by_name
       FROM public.report_sections s
       LEFT JOIN public.users u ON u.id = s.locked_by
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const { rows: blocks } = await pool.query(
      `SELECT * FROM public.section_blocks
       WHERE section_id = $1 AND deleted_at IS NULL
       ORDER BY order_index`,
      [id]
    );

    return res.json({ success: true, data: { ...sRows[0], blocks } });
  } catch (err) {
    logger.error("builder/sections GET /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get section" });
  }
});

/* ─── PUT /:id — update section ──────────────────────────────────────────── */
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const allowed = ["title", "description", "order_index", "workflow_template_id"];
    const sets    = [];
    const params  = [];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });

    // Check optimistic lock
    const { version_lock } = req.body;
    if (version_lock != null) {
      params.push(Number(version_lock));
      sets.push(`version_lock = version_lock + 1`);
      params.push(id);
      params.push(Number(version_lock));

      params.push(req.user.userId);
      const setStr = sets.join(", ");

      const { rows } = await pool.query(
        `UPDATE public.report_sections
         SET ${setStr}, updated_by = $${params.length - 1}
         WHERE id = $${params.length - 2} AND version_lock = $${params.length - 1 - 1} AND deleted_at IS NULL
         RETURNING *`,
        params
      );
      if (!rows.length)
        return res.status(409).json({ success: false, message: "Conflict: section was modified by another user. Please reload." });

      return res.json({ success: true, data: rows[0] });
    }

    // Without version_lock check
    params.push(req.user.userId);
    sets.push(`updated_by = $${params.length}`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE public.report_sections SET ${sets.join(", ")}
       WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Section not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/sections PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update section" });
  }
});

/* ─── PATCH /:id/status — status transition ─────────────────────────────── */
const VALID_TRANSITIONS = {
  NOT_STARTED:  ["IN_PROGRESS", "SUBMITTED"],
  IN_PROGRESS:  ["SUBMITTED"],
  SUBMITTED:    ["UNDER_REVIEW", "SENT_BACK"],
  UNDER_REVIEW: ["APPROVED", "SENT_BACK"],
  SENT_BACK:    ["IN_PROGRESS", "SUBMITTED"],
  APPROVED:     ["LOCKED"],
  LOCKED:       [],
};

router.patch("/:id/status", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id }           = req.params;
    const { status: next } = req.body;

    if (!isUUID(id))  return res.status(400).json({ success: false, message: "Invalid section id" });
    if (!next)        return res.status(400).json({ success: false, message: "status required" });

    const { rows: sRows } = await pool.query(
      `SELECT status FROM public.report_sections WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const current = sRows[0].status;
    const allowed = VALID_TRANSITIONS[current] || [];
    if (!allowed.includes(next.toUpperCase()))
      return res.status(422).json({
        success: false,
        message: `Cannot transition from ${current} to ${next.toUpperCase()}`,
      });

    const { rows } = await pool.query(
      `UPDATE public.report_sections
       SET status = $1, updated_by = $2
       WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
      [next.toUpperCase(), req.user.userId, id]
    );

    // Snapshot on submit / approval / rejection
    const snapshotEvents = ["SUBMITTED", "APPROVED", "REJECTED", "REVISION_REQUIRED"];
    if (snapshotEvents.includes(next.toUpperCase())) {
      await createSectionSnapshot(pool, id, next.toUpperCase(), req.user.userId, req.body.reason || null).catch(
        (e) => logger.warn("Snapshot failed (non-fatal)", { id, err: e.message })
      );
    }

    await writeAuditLog(req, {
      actionType: "SECTION_STATUS_CHANGE",
      entityType: "SECTION",
      entityId:   id,
      oldValue:   { status: current },
      newValue:   { status: next.toUpperCase() },
      status:     "SUCCESS",
      message:    `Section status: ${current} → ${next.toUpperCase()}`,
    });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/sections PATCH /:id/status", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

/* ─── DELETE /:id — soft delete ─────────────────────────────────────────── */
router.delete("/:id", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `UPDATE public.report_sections SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id, title`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Section not found" });

    await writeAuditLog(req, {
      actionType: "SECTION_DELETED",
      entityType: "SECTION",
      entityId:   id,
      status:     "SUCCESS",
      message:    `Section "${rows[0].title}" soft-deleted`,
    });

    return res.json({ success: true, message: "Section deleted" });
  } catch (err) {
    logger.error("builder/sections DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete section" });
  }
});

/* ─── POST /reorder — bulk reorder ─────────────────────────────────────── */
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

    // UNNEST bulk update
    const ids    = items.map((i) => i.id);
    const orders = items.map((i) => Number(i.order_index));

    await pool.query(
      `UPDATE public.report_sections AS s
       SET order_index = v.order_index::REAL,
           updated_by  = $3
       FROM (SELECT UNNEST($1::uuid[]) AS id, UNNEST($2::real[]) AS order_index) AS v
       WHERE s.id = v.id AND s.deleted_at IS NULL`,
      [ids, orders, req.user.userId]
    );

    return res.json({ success: true, message: "Sections reordered" });
  } catch (err) {
    logger.error("builder/sections POST /reorder", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to reorder sections" });
  }
});

/* ─── POST /:id/lock — acquire editing lock ─────────────────────────────── */
router.post("/:id/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows: sRows } = await pool.query(
      `SELECT locked_by, locked_at FROM public.report_sections WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const { locked_by, locked_at } = sRows[0];
    const lockExpiry = 15 * 60 * 1000; // 15 minutes in ms
    const lockActive = locked_by && locked_at &&
      (Date.now() - new Date(locked_at).getTime()) < lockExpiry;

    if (lockActive && locked_by !== req.user.userId)
      return res.status(423).json({ success: false, message: "Section is being edited by another user", locked_by });

    const { rows } = await pool.query(
      `UPDATE public.report_sections
       SET locked_by = $1, locked_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING locked_by, locked_at`,
      [req.user.userId, id]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/sections POST /:id/lock", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to acquire lock" });
  }
});

/* ─── DELETE /:id/lock — release editing lock ───────────────────────────── */
router.delete("/:id/lock", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });

    await pool.query(
      `UPDATE public.report_sections
       SET locked_by = NULL, locked_at = NULL
       WHERE id = $1 AND (locked_by = $2 OR $3)`,
      [id, req.user.userId, req.user.roles?.includes("super_admin")]
    );

    return res.json({ success: true, message: "Lock released" });
  } catch (err) {
    logger.error("builder/sections DELETE /:id/lock", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to release lock" });
  }
});

module.exports = router;
