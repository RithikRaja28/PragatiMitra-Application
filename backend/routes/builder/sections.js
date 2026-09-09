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
const { extractUploadKeys, deleteFile } = require("../../utils/localStorage");
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
    const roles              = req.user.roles || [];
    const isAdmin            = roles.includes("super_admin") || roles.includes("institute_admin");
    const isDirectorsOffice  = roles.includes("directors_office");
    const instId             = req.user.institutionId || null;
    const userId             = req.user.userId;

    /*
     * Strict step routing:
     *   Every user (including admins) only sees sections whose current workflow
     *   step designates them (by user id OR by role).
     *
     *   Admins additionally see submitted sections that have NO workflow step
     *   assigned (current_step_id IS NULL) as an oversight fallback — those
     *   sections can't route to anyone specific.
     *
     *   Directors office users additionally see all sections where
     *   needs_director_approval = TRUE (routed after last workflow step).
     */
    const { rows } = await pool.query(
      `SELECT
         s.id, s.title, s.status, s.report_id, s.current_step_id,
         s.submission_deadline,
         s.updated_at AS submitted_at,
         s.needs_director_approval,
         r.title AS report_title, r.report_type, r.academic_year,
         ws.step_name  AS current_step_name,
         ws.step_order AS current_step_order,
         u.full_name   AS submitted_by_name
       FROM public.report_sections s
       JOIN public.reports r ON r.id = s.report_id AND r.deleted_at IS NULL
       LEFT JOIN public.workflow_steps ws ON ws.id = s.current_step_id
       LEFT JOIN public.users u ON u.id = s.updated_by
       LEFT JOIN public.users u_caller ON u_caller.id = $2
       WHERE s.status IN ('SUBMITTED','UNDER_REVIEW')
         AND s.deleted_at IS NULL
         AND ($1::uuid IS NULL OR r.institution_id = $1)
         AND (
           /* Step explicitly designates this user or their role */
           ws.approver_user_id = $2
           OR (
               ws.approver_role = ANY($3::text[])
               AND (ws.approver_department_id IS NULL OR ws.approver_department_id = u_caller.department_id)
           )
           /* Admins see stepless sections as fallback oversight — NOT director-approval ones */
           OR ($4 AND s.current_step_id IS NULL AND NOT COALESCE(s.needs_director_approval, FALSE))
           /* Directors office see all sections pending their final approval */
           OR ($5 AND s.needs_director_approval = TRUE)
         )
       ORDER BY s.updated_at DESC`,
      [instId, userId, roles, isAdmin, isDirectorsOffice]
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
      `-- Direct user assignments
       SELECT
         s.id, s.title, s.description, s.status, s.report_id, s.order_index,
         r.title          AS report_title,
         r.report_type,
         r.academic_year,
         r.institution_id,
         a.id             AS assignment_id,
         a.role           AS assignment_role,
         a.due_at,
         a.assigned_at,
         a.completed_at,
         (SELECT sv.description FROM public.section_versions sv
          WHERE sv.section_id = s.id ORDER BY sv.version_num DESC LIMIT 1) AS latest_version_description,
         (SELECT sv.version_num FROM public.section_versions sv
          WHERE sv.section_id = s.id ORDER BY sv.version_num DESC LIMIT 1) AS latest_version_num,
         (SELECT COUNT(*) FROM public.block_comments bc
          WHERE bc.section_id = s.id AND bc.is_resolved = FALSE
            AND bc.deleted_at IS NULL AND bc.parent_id IS NULL) AS unresolved_comment_count
       FROM public.section_assignments a
       JOIN public.report_sections s ON s.id = a.section_id AND s.deleted_at IS NULL
       JOIN public.reports r         ON r.id = s.report_id  AND r.deleted_at IS NULL
       WHERE a.user_id = $1

       UNION

       -- Role-based assignments: sections assigned to a role the current user holds
       SELECT
         s.id, s.title, s.description, s.status, s.report_id, s.order_index,
         r.title          AS report_title,
         r.report_type,
         r.academic_year,
         r.institution_id,
         swa.id           AS assignment_id,
         'OWNER'          AS assignment_role,
         swa.due_at,
         swa.assigned_at,
         NULL::timestamptz AS completed_at,
         (SELECT sv.description FROM public.section_versions sv
          WHERE sv.section_id = s.id ORDER BY sv.version_num DESC LIMIT 1) AS latest_version_description,
         (SELECT sv.version_num FROM public.section_versions sv
          WHERE sv.section_id = s.id ORDER BY sv.version_num DESC LIMIT 1) AS latest_version_num,
         (SELECT COUNT(*) FROM public.block_comments bc
          WHERE bc.section_id = s.id AND bc.is_resolved = FALSE
            AND bc.deleted_at IS NULL AND bc.parent_id IS NULL) AS unresolved_comment_count
       FROM public.section_workflow_assignments swa
       JOIN public.report_sections s ON s.id = swa.section_id AND s.deleted_at IS NULL
       JOIN public.reports r         ON r.id = s.report_id    AND r.deleted_at IS NULL
       JOIN public.user_roles ur     ON ur.user_id = $1 AND ur.revoked_at IS NULL
       JOIN public.roles ro          ON ro.id = ur.role_id AND ro.name = swa.role_name
       JOIN public.users u           ON u.id = $1
       WHERE swa.assignee_type = 'ROLE'
         AND swa.workflow_step_id IS NULL
         AND (swa.department_id IS NULL OR swa.department_id = u.department_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.section_assignments sa2
           WHERE sa2.section_id = swa.section_id AND sa2.user_id = $1
         )

       ORDER BY due_at ASC NULLS LAST, report_title, order_index`,
      [req.user.userId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/sections GET /assigned", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get assigned sections" });
  }
});

/* ─── GET /activity — last 5 section events for the institution/year ────────
   Returns SUBMITTED events + review decisions (APPROVED / SENT_BACK) scoped
   to the caller's institution and the selected academic year (X-Academic-Year
   header). Used by the Director Admin dashboard Recent Activities widget.    */
router.get("/activity", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = req.user.institutionId || null;
    if (!instId) return res.json({ success: true, data: [] });

    // Parse academic year from header (e.g. "2023" → "2023-2024")
    const headerYear = Number(req.get("X-Academic-Year"));
    const academicYearStr = (Number.isInteger(headerYear) && headerYear > 1900)
      ? `${headerYear}-${headerYear + 1}`
      : null;

    const baseParams = [instId];
    const yearClause = academicYearStr
      ? `AND r.academic_year = $${baseParams.push(academicYearStr)}`
      : "";

    const { rows } = await pool.query(
      `SELECT activity_at, activity_type, section_id, section_title, report_title,
              academic_year, actor_name
       FROM (
         /* ── Submission events ── */
         SELECT
           sv.created_at                        AS activity_at,
           'SUBMITTED'                          AS activity_type,
           s.id                                 AS section_id,
           s.title                              AS section_title,
           r.title                              AS report_title,
           r.academic_year,
           u.full_name                          AS actor_name
         FROM public.section_versions sv
         JOIN public.report_sections s  ON s.id = sv.section_id AND s.deleted_at IS NULL
         JOIN public.reports r          ON r.id = s.report_id   AND r.deleted_at IS NULL
           AND r.institution_id = $1 ${yearClause}
         LEFT JOIN public.users u ON u.id = sv.created_by
         WHERE sv.event = 'SUBMITTED'

         UNION ALL

         /* ── Review decision events (APPROVED / SENT_BACK) ── */
         SELECT
           sv.latest_decision_at                AS activity_at,
           sv.latest_decision                   AS activity_type,
           s.id                                 AS section_id,
           s.title                              AS section_title,
           r.title                              AS report_title,
           r.academic_year,
           u.full_name                          AS actor_name
         FROM public.section_versions sv
         JOIN public.report_sections s  ON s.id = sv.section_id AND s.deleted_at IS NULL
         JOIN public.reports r          ON r.id = s.report_id   AND r.deleted_at IS NULL
           AND r.institution_id = $1 ${yearClause}
         LEFT JOIN public.users u ON u.id = sv.latest_decision_by
         WHERE sv.latest_decision IS NOT NULL AND sv.latest_decision_at IS NOT NULL
       ) events
       ORDER BY activity_at DESC
       LIMIT 5`,
      baseParams
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/sections GET /activity", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get recent activity" });
  }
});

/* ─── GET /dept-assigned — sections for dept admin to delegate ───────────── */
router.get("/dept-assigned", requireRole(["department_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const userRow = await pool.query(
      `SELECT department_id FROM public.users WHERE id = $1`, [req.user.userId]
    );
    const deptId = userRow.rows[0]?.department_id;
    if (!deptId) return res.json({ success: true, data: { pending: [], delegated: [], departmentId: null } });

    const [pendingRes, delegatedRes] = await Promise.all([
      // Sections still assigned to the dept (not yet delegated to a user)
      pool.query(`
        SELECT
          rs.id, rs.title, rs.description, rs.status, rs.order_index,
          r.id  AS report_id, r.title AS report_title, r.report_type, r.academic_year,
          swa.id AS assignment_id, swa.due_at, swa.assigned_at,
          d.name AS department_name
        FROM public.section_workflow_assignments swa
        JOIN public.report_sections rs ON rs.id = swa.section_id AND rs.deleted_at IS NULL
        JOIN public.reports        r   ON r.id  = swa.report_id
        JOIN public.departments    d   ON d.department_id = swa.department_id
        WHERE swa.assignee_type = 'DEPARTMENT' AND swa.department_id = $1
        ORDER BY r.title, rs.order_index
      `, [deptId]),
      // Sections already delegated to a specific user from this dept
      pool.query(`
        SELECT
          rs.id, rs.title, rs.description, rs.status, rs.order_index,
          r.id  AS report_id, r.title AS report_title, r.report_type, r.academic_year,
          swa.id AS assignment_id, swa.due_at, swa.assigned_at,
          u.id   AS delegated_user_id,
          u.full_name AS delegated_user_name,
          u.email     AS delegated_user_email
        FROM public.section_workflow_assignments swa
        JOIN public.report_sections rs ON rs.id = swa.section_id AND rs.deleted_at IS NULL
        JOIN public.reports        r   ON r.id  = swa.report_id
        JOIN public.users          u   ON u.id  = swa.user_id
        WHERE swa.assignee_type = 'USER'
          AND swa.workflow_step_id IS NULL
          AND u.department_id = $1
        ORDER BY r.title, rs.order_index
      `, [deptId]),
    ]);

    return res.json({ success: true, data: { pending: pendingRes.rows, delegated: delegatedRes.rows, departmentId: deptId } });
  } catch (err) {
    logger.error("sections GET /dept-assigned", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to load department sections" });
  }
});

/* ─── GET /dept-users — active users in the dept admin's department ──────── */
router.get("/dept-users", requireRole(["department_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const userRow = await pool.query(
      `SELECT department_id FROM public.users WHERE id = $1`, [req.user.userId]
    );
    const deptId = userRow.rows[0]?.department_id;
    if (!deptId) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, u.email
      FROM public.users u
      WHERE u.department_id = $1 
        AND u.account_status = 'ACTIVE' 
        AND u.id != $2
      ORDER BY u.full_name
    `, [deptId, req.user.userId]);
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("sections GET /dept-users", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to load department users" });
  }
});

/* ─── PATCH /:id/dept-delegate — dept admin assigns a section to a user ─── */
router.patch("/:id/dept-delegate", requireRole(["department_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!isUUID(id) || !isUUID(user_id))
      return res.status(400).json({ success: false, message: "Invalid IDs" });

    // Verify caller is a dept admin with a department
    const callerRow = await pool.query(
      `SELECT department_id FROM public.users WHERE id = $1`, [req.user.userId]
    );
    const deptId = callerRow.rows[0]?.department_id;
    if (!deptId) return res.status(403).json({ success: false, message: "No department association" });

    // Target user must belong to same dept
    const targetRow = await pool.query(
      `SELECT id, full_name, department_id FROM public.users WHERE id = $1`, [user_id]
    );
    if (!targetRow.rows[0] || targetRow.rows[0].department_id !== deptId)
      return res.status(403).json({ success: false, message: "User does not belong to your department" });

    // Find the DEPARTMENT-type assignment for this section
    const assRow = await pool.query(`
      SELECT id, report_id, due_at FROM public.section_workflow_assignments
      WHERE section_id = $1 AND assignee_type = 'DEPARTMENT' AND department_id = $2
    `, [id, deptId]);
    if (!assRow.rows[0])
      return res.status(404).json({ success: false, message: "No department assignment found for this section" });

    const { id: swaId, due_at } = assRow.rows[0];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Promote DEPT → USER (constraint requires department_id = NULL for USER type)
      await client.query(`
        UPDATE public.section_workflow_assignments
        SET assignee_type = 'USER', user_id = $1, department_id = NULL,
            assigned_by = $2, assigned_at = NOW()
        WHERE id = $3
      `, [user_id, req.user.userId, swaId]);

      // Mirror into section_assignments so the user's "My Sections" shows it
      await client.query(`
        INSERT INTO public.section_assignments (section_id, user_id, role, due_at, assigned_by)
        VALUES ($1, $2, 'OWNER', $3, $4)
        ON CONFLICT (section_id, user_id) DO UPDATE
          SET role = 'OWNER', due_at = EXCLUDED.due_at,
              assigned_by = EXCLUDED.assigned_by, completed_at = NULL
      `, [id, user_id, due_at, req.user.userId]);

      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    // Notify the assigned user outside the transaction
    pool.query(`
      INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
      VALUES ($1, 'SECTION_ASSIGNED', 'Section assigned to you',
              'You have been assigned to author a report section.', 'SECTION', $2)
    `, [user_id, id]).catch(() => {});

    return res.json({ success: true });
  } catch (err) {
    logger.error("sections PATCH /:id/dept-delegate", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delegate section" });
  }
});

/* ─── POST / — create section ─────────────────────────────────────────────── */
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { report_id, parent_id, title, description, order_index, title_translations, workflow_template_id } = req.body;
    if (!isUUID(report_id)) return res.status(400).json({ success: false, message: "report_id (UUID) required" });
    if (!title?.trim())     return res.status(400).json({ success: false, message: "title required" });

    // Verify report exists and get default workflow if needed
    const { rows: rr } = await pool.query(
      `SELECT id, default_workflow_id FROM public.reports WHERE id = $1 AND deleted_at IS NULL`,
      [report_id]
    );
    if (!rr.length) return res.status(404).json({ success: false, message: "Report not found" });

    let finalWfId = workflow_template_id || rr[0].default_workflow_id || null;

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
         (report_id, parent_id, title, description, order_index, workflow_template_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       RETURNING *`,
      [report_id, parent_id || null, title.trim(), description || null, oi, finalWfId, req.user.userId]
    );
    const section = rows[0];

    if (title_translations && typeof title_translations === "object" && Object.keys(title_translations).length > 0) {
      try {
        await pool.query(
          `UPDATE public.report_sections SET title_translations = title_translations || $1 WHERE id = $2`,
          [JSON.stringify(title_translations), section.id]
        );
      } catch { /* column not yet migrated */ }
    }

     //insert trans data in section_transulation
    
       if (title_translations && typeof title_translations === "object") {
      try {
        for (const [language, translatedTitle] of Object.entries(title_translations)) {
          await pool.query(
            `
            INSERT INTO public.section_translations
            (
              section_id,
              language,
              title,
              description,
              status,
              created_by,
              updated_by,
              created_at,
              updated_at
            )
            VALUES
            (
              $1,$2,$3,$4,'APPROVED',$5,$5,NOW(),NOW()
            )
            `,
            [
              section.id,
              language,
              translatedTitle,
              description,
              req.user.userId
            ]
          );
        }
      } catch (err) {
        logger.warn("Failed to save section translations", {
          sectionId: section.id,
          error: err.message
        });
      }
    }
    

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

    const { title_translations } = req.body;
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

      if (title_translations && typeof title_translations === "object") {
        try {
          await pool.query(
            `UPDATE public.report_sections SET title_translations = title_translations || $1 WHERE id = $2`,
            [JSON.stringify(title_translations), id]
          );
        } catch { /* column not yet migrated */ }
      }
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

    if (title_translations && typeof title_translations === "object") {
      await pool.query(
        `UPDATE public.report_sections SET title_translations = title_translations || $1 WHERE id = $2`,
        [JSON.stringify(title_translations), id]
      );
    }
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

    // Deleting a section previously left every one of its blocks' files
    // orphaned on disk forever — the compiler excludes non-deleted-section
    // blocks from output, but nothing ever cleaned up their uploads. Soft-
    // delete the blocks too and clean up each one's files, mirroring
    // blocks.js's own single-block DELETE /:id.
    const { rows: blockRows } = await pool.query(
      `UPDATE public.section_blocks SET deleted_at = NOW()
       WHERE section_id = $1 AND deleted_at IS NULL RETURNING id, content`,
      [id]
    );
    let trRows = [];
    if (blockRows.length) {
      // Translations can now carry independent file references too (e.g. a
      // Hindi-only IMAGE block url) — clean those up alongside primary content.
      ({ rows: trRows } = await pool.query(
        `SELECT content FROM public.block_translations WHERE block_id = ANY($1::uuid[])`,
        [blockRows.map((b) => b.id)]
      ));
    }
    for (const block of blockRows) {
      const keys = extractUploadKeys(block.content);
      for (const key of keys) {
        await deleteFile(key).catch(() => {});
      }
    }
    for (const tr of trRows) {
      const keys = extractUploadKeys(tr.content);
      for (const key of keys) {
        await deleteFile(key).catch(() => {});
      }
    }

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

/* ─── GET /:id/access — list section_access grants ──────────────────────── */
router.get("/:id/access", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });
    const { rows } = await pool.query(
      `SELECT id, user_id, role_name, department_id, permission
       FROM public.section_access
       WHERE section_id = $1 AND revoked_at IS NULL
       ORDER BY granted_at`, [id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/sections GET /:id/access", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get section access" });
  }
});

/* ─── PUT /:id/access — bulk replace section_access grants ──────────────── */
router.put("/:id/access", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid section id" });
    const { grants = [] } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE public.section_access SET revoked_at = NOW() WHERE section_id = $1 AND revoked_at IS NULL`, [id]);
      for (const g of grants) {
        const roleN = g.role_name     || null;
        const userI = g.user_id       || null;
        const deptI = g.department_id || null;
        if (!roleN && !userI && !deptI) continue;
        await client.query(
          `INSERT INTO public.section_access (section_id, user_id, role_name, department_id, granted_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, userI, roleN, deptI, req.user.userId]
        );
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
    return res.json({ success: true });
  } catch (err) {
    logger.error("builder/sections PUT /:id/access", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update section access" });
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
