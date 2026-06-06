"use strict";

/**
 * routes/builder/assignments.js
 * Mount: app.use("/api/builder/assignments", require("./routes/builder/assignments"))
 *
 * GET    /section/:sectionId           list user + dept assignments for a section
 * POST   /section/:sectionId           assign user(s) to a section
 * DELETE /:id                          remove user assignment
 * PATCH  /:id/complete                 mark assignment complete
 * PATCH  /:id/due                      update due_at on assignment
 * POST   /section/:sectionId/bulk      bulk-assign multiple users to one section
 * POST   /report/:reportId/bulk        bulk-assign sections to user/dept
 *
 * Departments:
 * GET    /section/:sectionId/departments        list dept assignments
 * POST   /section/:sectionId/departments        assign a department
 * DELETE /section/:sectionId/departments/:deptId remove dept assignment
 */

const express           = require("express");
const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);
const VALID_ROLES = ["OWNER", "CONTRIBUTOR", "REVIEWER"];

/* ── GET /section/:sectionId ─────────────────────────────────────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const [userRes, deptRes] = await Promise.all([
      pool.query(
        `SELECT a.*, u.full_name, u.email
         FROM public.section_assignments a
         JOIN public.users u ON u.id = a.user_id
         WHERE a.section_id = $1
         ORDER BY a.role DESC, a.assigned_at`, [sectionId]
      ),
      pool.query(
        `SELECT sda.*, d.name AS department_name
         FROM public.section_department_assignments sda
         JOIN public.departments d ON d.department_id = sda.department_id
         WHERE sda.section_id = $1
         ORDER BY d.name`, [sectionId]
      ),
    ]);

    return res.json({ success: true, data: { users: userRes.rows, departments: deptRes.rows } });
  } catch (err) {
    logger.error("assignments GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list assignments" });
  }
});

/* ── POST /section/:sectionId — assign single user ──────────────────────────── */
router.post(
  "/section/:sectionId",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { sectionId } = req.params;
      const { user_id, role = "CONTRIBUTOR", due_at } = req.body;

      if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });
      if (!isUUID(user_id))   return res.status(400).json({ success: false, message: "user_id (UUID) required" });
      if (!VALID_ROLES.includes(role.toUpperCase()))
        return res.status(400).json({ success: false, message: `role must be one of: ${VALID_ROLES.join(", ")}` });

      const [sr, ur] = await Promise.all([
        pool.query(`SELECT id FROM public.report_sections WHERE id = $1 AND deleted_at IS NULL`, [sectionId]),
        pool.query(`SELECT id, full_name FROM public.users WHERE id = $1`, [user_id]),
      ]);
      if (!sr.rows.length) return res.status(404).json({ success: false, message: "Section not found" });
      if (!ur.rows.length) return res.status(404).json({ success: false, message: "User not found" });

      const { rows } = await pool.query(
        `INSERT INTO public.section_assignments
           (section_id, user_id, role, due_at, assigned_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (section_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, due_at = EXCLUDED.due_at,
               assigned_by = EXCLUDED.assigned_by, completed_at = NULL
         RETURNING *`,
        [sectionId, user_id, role.toUpperCase(), due_at || null, req.user.userId]
      );

      // Notify the assigned user
      await pool.query(
        `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
         VALUES ($1, 'SECTION_ASSIGNED', 'Section assigned to you',
                 $2, 'SECTION', $3)`,
        [user_id, `You have been assigned a new section as ${role}`, sectionId]
      ).catch(() => {});

      await writeAuditLog(req, {
        actionType: "SECTION_ASSIGNED", entityType: "SECTION", entityId: sectionId,
        newValue: { user_id, role }, status: "SUCCESS",
        message: `${ur.rows[0].full_name} assigned as ${role}`,
      });

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === "23505")
        return res.status(409).json({ success: false, message: "Section already has an active OWNER" });
      logger.error("assignments POST /section/:id", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to assign user" });
    }
  }
);

/* ── POST /section/:sectionId/bulk — assign multiple users ──────────────────── */
router.post(
  "/section/:sectionId/bulk",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { sectionId } = req.params;
      const { users = [], due_at } = req.body; // [{ user_id, role }]
      if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });
      if (!Array.isArray(users) || !users.length)
        return res.status(400).json({ success: false, message: "users[] required" });

      const created = [];
      for (const u of users) {
        if (!isUUID(u.user_id)) continue;
        const role = VALID_ROLES.includes(u.role?.toUpperCase()) ? u.role.toUpperCase() : "CONTRIBUTOR";
        const { rows } = await pool.query(
          `INSERT INTO public.section_assignments (section_id, user_id, role, due_at, assigned_by)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (section_id, user_id) DO UPDATE
             SET role = EXCLUDED.role, due_at = EXCLUDED.due_at,
                 assigned_by = EXCLUDED.assigned_by, completed_at = NULL
           RETURNING *`,
          [sectionId, u.user_id, role, due_at || u.due_at || null, req.user.userId]
        );
        created.push(rows[0]);
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           VALUES ($1, 'SECTION_ASSIGNED', 'Section assigned to you', $2, 'SECTION', $3)`,
          [u.user_id, `You have been assigned a section as ${role}`, sectionId]
        ).catch(() => {});
      }

      return res.status(201).json({ success: true, data: created });
    } catch (err) {
      logger.error("assignments POST bulk", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to bulk assign" });
    }
  }
);

/* ── POST /report/:reportId/bulk — assign multiple sections to user/dept ─────── */
router.post(
  "/report/:reportId/bulk",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { reportId } = req.params;
      const { section_ids = [], user_id, department_id, role = "CONTRIBUTOR", due_at } = req.body;
      if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });
      if (!Array.isArray(section_ids) || !section_ids.length)
        return res.status(400).json({ success: false, message: "section_ids[] required" });

      const created = [];
      for (const secId of section_ids) {
        if (!isUUID(secId)) continue;
        if (isUUID(user_id)) {
          const r = VALID_ROLES.includes(role.toUpperCase()) ? role.toUpperCase() : "CONTRIBUTOR";
          const { rows } = await pool.query(
            `INSERT INTO public.section_assignments (section_id, user_id, role, due_at, assigned_by)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (section_id, user_id) DO UPDATE
               SET role=EXCLUDED.role, due_at=EXCLUDED.due_at, assigned_by=EXCLUDED.assigned_by, completed_at=NULL
             RETURNING *`,
            [secId, user_id, r, due_at || null, req.user.userId]
          );
          created.push({ type: "user", ...rows[0] });
        }
        if (isUUID(department_id)) {
          const { rows } = await pool.query(
            `INSERT INTO public.section_department_assignments (section_id, department_id, due_at, assigned_by)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (section_id, department_id) DO UPDATE
               SET due_at=EXCLUDED.due_at, assigned_by=EXCLUDED.assigned_by
             RETURNING *`,
            [secId, department_id, due_at || null, req.user.userId]
          );
          created.push({ type: "department", ...rows[0] });
        }
      }

      return res.status(201).json({ success: true, data: created, count: created.length });
    } catch (err) {
      logger.error("assignments POST report bulk", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to bulk assign report sections" });
    }
  }
);

/* ── DELETE /:id — remove user assignment ───────────────────────────────────── */
router.delete("/:id", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid assignment id" });

    const { rows } = await pool.query(
      `DELETE FROM public.section_assignments WHERE id = $1 RETURNING id`, [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Assignment not found" });

    return res.json({ success: true, message: "Assignment removed" });
  } catch (err) {
    logger.error("assignments DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to remove assignment" });
  }
});

/* ── PATCH /:id/complete — mark complete ────────────────────────────────────── */
router.patch("/:id/complete", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid assignment id" });

    const { rows } = await pool.query(
      `UPDATE public.section_assignments SET completed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND completed_at IS NULL RETURNING *`,
      [id, req.user.userId]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "Assignment not found or already completed" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("assignments PATCH complete", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to mark complete" });
  }
});

/* ── PATCH /:id/due — update deadline for an assignment ─────────────────────── */
router.patch("/:id/due", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    const { due_at } = req.body;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid assignment id" });

    const { rows } = await pool.query(
      `UPDATE public.section_assignments SET due_at = $1 WHERE id = $2 RETURNING *`,
      [due_at || null, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Assignment not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("assignments PATCH due", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update deadline" });
  }
});

/* ── GET /section/:sectionId/departments ────────────────────────────────────── */
router.get("/section/:sectionId/departments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT sda.*, d.name AS department_name
       FROM public.section_department_assignments sda
       JOIN public.departments d ON d.department_id = sda.department_id
       WHERE sda.section_id = $1
       ORDER BY d.name`, [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("assignments GET /section/departments", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list dept assignments" });
  }
});

/* ── POST /section/:sectionId/departments — assign a department ─────────────── */
router.post(
  "/section/:sectionId/departments",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { sectionId } = req.params;
      const { department_id, due_at } = req.body;
      if (!isUUID(sectionId))    return res.status(400).json({ success: false, message: "Invalid section id" });
      if (!isUUID(department_id)) return res.status(400).json({ success: false, message: "department_id (UUID) required" });

      const { rows } = await pool.query(
        `INSERT INTO public.section_department_assignments (section_id, department_id, due_at, assigned_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (section_id, department_id) DO UPDATE
           SET due_at = EXCLUDED.due_at, assigned_by = EXCLUDED.assigned_by
         RETURNING *`,
        [sectionId, department_id, due_at || null, req.user.userId]
      );

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error("assignments POST dept", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to assign department" });
    }
  }
);

/* ── DELETE /section/:sectionId/departments/:deptId ─────────────────────────── */
router.delete(
  "/section/:sectionId/departments/:deptId",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { sectionId, deptId } = req.params;
      await pool.query(
        `DELETE FROM public.section_department_assignments
         WHERE section_id = $1 AND department_id = $2`, [sectionId, deptId]
      );
      return res.json({ success: true, message: "Department assignment removed" });
    } catch (err) {
      logger.error("assignments DELETE dept", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: "Failed to remove dept assignment" });
    }
  }
);

module.exports = router;
