"use strict";

/**
 * routes/builder/workflows.js
 * Mount: app.use("/api/builder/workflows", require("./routes/builder/workflows"))
 *
 * GET    /                  list workflow templates
 * POST   /                  create workflow template
 * GET    /:id               get template with steps
 * PUT    /:id               update template name/description
 * DELETE /:id               delete template (if not in use)
 * POST   /:id/steps         add step to template
 * PUT    /:id/steps/:stepId update step
 * DELETE /:id/steps/:stepId remove step
 * PATCH  /:id/default       set as institution default
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

function callerInstitution(req) {
  const roles = req.user.roles || [];
  if (roles.includes("super_admin") && req.query.institution_id) return req.query.institution_id;
  return req.user.institutionId || null;
}

/* ── GET /roles ── roles available for workflow step assignment ─────────────── */
router.get("/roles", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, display_name, description
       FROM public.roles
       ORDER BY display_name ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("workflows GET /roles", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to fetch roles" });
  }
});

/* ── GET / ── list workflow templates ───────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { rows: templates } = await pool.query(
      `SELECT wt.*,
              u.full_name AS created_by_name,
              COUNT(ws.id) AS step_count
       FROM public.workflow_templates wt
       LEFT JOIN public.users u ON u.id = wt.created_by
       LEFT JOIN public.workflow_steps ws ON ws.template_id = wt.id
       WHERE wt.institution_id = $1
       GROUP BY wt.id, u.full_name
       ORDER BY wt.is_default DESC, wt.name`, [instId]
    );

    // Include steps for each template so dropdowns/cards can render them
    if (templates.length > 0) {
      const ids = templates.map(t => t.id);
      const { rows: allSteps } = await pool.query(
        `SELECT ws.*, u.full_name AS approver_name
         FROM public.workflow_steps ws
         LEFT JOIN public.users u ON u.id = ws.approver_user_id
         WHERE ws.template_id = ANY($1::uuid[])
         ORDER BY ws.template_id, ws.step_order`,
        [ids]
      );
      const stepsByTemplate = {};
      for (const s of allSteps) {
        if (!stepsByTemplate[s.template_id]) stepsByTemplate[s.template_id] = [];
        stepsByTemplate[s.template_id].push(s);
      }
      for (const t of templates) t.steps = stepsByTemplate[t.id] || [];
    }

    return res.json({ success: true, data: templates });
  } catch (err) {
    logger.error("workflows GET /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list workflow templates" });
  }
});

/* ── POST / ── create workflow template ─────────────────────────────────────── */
router.post("/", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { name, description, steps = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO public.workflow_templates (institution_id, name, description, created_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [instId, name.trim(), description || null, req.user.userId]
      );
      const template = rows[0];

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!s.step_name?.trim()) continue;
        await client.query(
          `INSERT INTO public.workflow_steps
             (template_id, step_order, step_name, approver_role, approver_user_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [template.id, i + 1, s.step_name.trim(), s.approver_role || null,
           isUUID(s.approver_user_id) ? s.approver_user_id : null]
        );
      }

      await client.query("COMMIT");

      await writeAuditLog(req, {
        actionType: "WORKFLOW_CREATED", entityType: "WORKFLOW", entityId: template.id,
        newValue: template, status: "SUCCESS", message: `Workflow "${template.name}" created`,
      });

      return res.status(201).json({ success: true, data: template });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("workflows POST /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create workflow" });
  }
});

/* ── GET /:id ── get template with steps ────────────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const [tmplRes, stepsRes] = await Promise.all([
      pool.query(`SELECT * FROM public.workflow_templates WHERE id = $1`, [id]),
      pool.query(
        `SELECT ws.*, u.full_name AS approver_name
         FROM public.workflow_steps ws
         LEFT JOIN public.users u ON u.id = ws.approver_user_id
         WHERE ws.template_id = $1 ORDER BY ws.step_order`, [id]
      ),
    ]);

    if (!tmplRes.rows.length) return res.status(404).json({ success: false, message: "Workflow not found" });

    return res.json({ success: true, data: { ...tmplRes.rows[0], steps: stepsRes.rows } });
  } catch (err) {
    logger.error("workflows GET /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get workflow" });
  }
});

/* ── PUT /:id ── update template metadata ───────────────────────────────────── */
router.put("/:id", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { name, description } = req.body;
    const { rows } = await pool.query(
      `UPDATE public.workflow_templates
       SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name?.trim() || null, description ?? null, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Workflow not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("workflows PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update workflow" });
  }
});

/* ── DELETE /:id ── delete template if not in use ───────────────────────────── */
router.delete("/:id", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    // Block deletion if sections reference this workflow
    const { rows: usageRows } = await pool.query(
      `SELECT COUNT(*) FROM public.report_sections
       WHERE workflow_template_id = $1 AND deleted_at IS NULL`, [id]
    );
    if (Number(usageRows[0].count) > 0)
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${usageRows[0].count} section(s) use this workflow`,
      });

    await pool.query(`DELETE FROM public.workflow_templates WHERE id = $1`, [id]);
    return res.json({ success: true, message: "Workflow deleted" });
  } catch (err) {
    logger.error("workflows DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete workflow" });
  }
});

/* ── POST /:id/steps ── add step ────────────────────────────────────────────── */
router.post("/:id/steps", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { step_name, approver_role, approver_user_id } = req.body;
    if (!step_name?.trim()) return res.status(400).json({ success: false, message: "step_name required" });

    const { rows: maxRes } = await pool.query(
      `SELECT COALESCE(MAX(step_order), 0) + 1 AS next FROM public.workflow_steps WHERE template_id = $1`, [id]
    );

    const { rows } = await pool.query(
      `INSERT INTO public.workflow_steps (template_id, step_order, step_name, approver_role, approver_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, maxRes[0].next, step_name.trim(), approver_role || null,
       isUUID(approver_user_id) ? approver_user_id : null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("workflows POST /:id/steps", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add step" });
  }
});

/* ── PUT /:id/steps/:stepId ── update step ──────────────────────────────────── */
router.put("/:id/steps/:stepId", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, stepId } = req.params;
    if (!isUUID(id) || !isUUID(stepId)) return res.status(400).json({ success: false, message: "Invalid id" });

    const { step_name, step_order, approver_role, approver_user_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE public.workflow_steps
       SET step_name        = COALESCE($1, step_name),
           step_order       = COALESCE($2, step_order),
           approver_role    = COALESCE($3, approver_role),
           approver_user_id = $4
       WHERE id = $5 AND template_id = $6 RETURNING *`,
      [step_name?.trim() || null, step_order != null ? Number(step_order) : null,
       approver_role || null, isUUID(approver_user_id) ? approver_user_id : null,
       stepId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Step not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("workflows PUT /:id/steps/:stepId", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update step" });
  }
});

/* ── DELETE /:id/steps/:stepId ── remove step ───────────────────────────────── */
router.delete("/:id/steps/:stepId", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, stepId } = req.params;
    if (!isUUID(id) || !isUUID(stepId)) return res.status(400).json({ success: false, message: "Invalid id" });

    await pool.query(`DELETE FROM public.workflow_steps WHERE id = $1 AND template_id = $2`, [stepId, id]);
    return res.json({ success: true, message: "Step removed" });
  } catch (err) {
    logger.error("workflows DELETE step", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to remove step" });
  }
});

/* ── PATCH /:id/default ── set as institution default ───────────────────────── */
router.patch("/:id/default", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const instId = callerInstitution(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.workflow_templates SET is_default = FALSE WHERE institution_id = $1`, [instId]
      );
      await client.query(
        `UPDATE public.workflow_templates SET is_default = TRUE WHERE id = $1`, [id]
      );
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    return res.json({ success: true, message: "Default workflow set" });
  } catch (err) {
    logger.error("workflows PATCH default", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to set default" });
  }
});

module.exports = router;
