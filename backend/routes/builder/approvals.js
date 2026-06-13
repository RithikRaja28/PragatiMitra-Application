"use strict";

/**
 * routes/builder/approvals.js
 * Mount: app.use("/api/builder/approvals", require("./routes/builder/approvals"))
 *
 * Multi-step workflow logic:
 *  1. Contributor submits section → status = SUBMITTED, current_step advances to step 1
 *  2. Approver at step N reviews: APPROVE advances to step N+1 or final APPROVED
 *                                 SEND_BACK resets to IN_PROGRESS with reviewer comment
 *  3. Any approver whose role matches current_step can act
 *
 * GET    /section/:sectionId          approval history
 * POST   /section/:sectionId/submit   submit for review
 * POST   /section/:sectionId/review   reviewer decision (approve / send_back)
 * GET    /section/:sectionId/pipeline current workflow pipeline state
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const { createSectionSnapshot } = require("../../utils/snapshotHelper");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

/* ── helpers ─────────────────────────────────────────────────────────────────── */

async function getWorkflowSteps(pool, sectionId) {
  const { rows } = await pool.query(
    `SELECT ws.*
     FROM public.report_sections rs
     JOIN public.workflow_templates wt ON wt.id = rs.workflow_template_id
     JOIN public.workflow_steps ws ON ws.template_id = wt.id
     WHERE rs.id = $1 AND rs.deleted_at IS NULL
     ORDER BY ws.step_order`, [sectionId]
  );
  return rows;
}

function canReview(user, step) {
  const roles = user.roles || [];
  if (roles.includes("super_admin") || roles.includes("institute_admin")) return true;
  if (!step) return false;
  if (step.approver_user_id && step.approver_user_id === user.userId) return true;
  if (step.approver_role && roles.includes(step.approver_role.toLowerCase())) return true;
  return false;
}

/* ── GET /section/:sectionId — approval history ─────────────────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT sv.*,
              u.full_name  AS reviewer_name,
              ws.step_name AS workflow_step_name,
              ws.step_order
       FROM public.section_versions sv
       LEFT JOIN public.users u ON u.id = sv.reviewer_id
       LEFT JOIN public.workflow_steps ws ON ws.id = sv.workflow_step_id
       WHERE sv.section_id = $1
         AND sv.event IN ('SUBMITTED','APPROVED','SENT_BACK')
       ORDER BY sv.created_at DESC`, [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("approvals GET history", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get approval history" });
  }
});

/* ── GET /section/:sectionId/pipeline — workflow pipeline state ──────────────── */
router.get("/section/:sectionId/pipeline", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows: sRows } = await pool.query(
      `SELECT s.*, wt.name AS workflow_name
       FROM public.report_sections s
       LEFT JOIN public.workflow_templates wt ON wt.id = s.workflow_template_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`, [sectionId]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const section = sRows[0];
    const steps   = await getWorkflowSteps(pool, sectionId);

    // Find current step index
    let currentIdx = -1;
    if (section.current_step_id) {
      currentIdx = steps.findIndex(s => s.id === section.current_step_id);
    }

    const pipeline = steps.map((step, idx) => ({
      ...step,
      state: idx < currentIdx ? "COMPLETED" : idx === currentIdx ? "ACTIVE" : "PENDING",
    }));

    return res.json({
      success: true,
      data: {
        section_status: section.status,
        workflow_name:  section.workflow_name,
        current_step:   steps[currentIdx] || null,
        steps: pipeline,
        can_review: canReview(req.user, steps[currentIdx]),
      },
    });
  } catch (err) {
    logger.error("approvals GET pipeline", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get pipeline" });
  }
});

/* ── POST /section/:sectionId/submit — contributor submits ───────────────────── */
router.post("/section/:sectionId/submit", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows: sRows } = await pool.query(
      `SELECT s.*, wt.id AS workflow_id
       FROM public.report_sections s
       LEFT JOIN public.workflow_templates wt ON wt.id = s.workflow_template_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`, [sectionId]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const section = sRows[0];
    const allowed = ["IN_PROGRESS", "SENT_BACK", "NOT_STARTED"];
    if (!allowed.includes(section.status))
      return res.status(422).json({ success: false, message: `Cannot submit from status: ${section.status}` });

    // Find first workflow step
    let firstStepId = null;
    if (section.workflow_template_id) {
      const { rows: stepRows } = await pool.query(
        `SELECT id FROM public.workflow_steps WHERE template_id = $1 ORDER BY step_order LIMIT 1`,
        [section.workflow_template_id]
      );
      if (stepRows.length) firstStepId = stepRows[0].id;
    }

    let versionNum = null;
    try {
      versionNum = await createSectionSnapshot(pool, sectionId, "SUBMITTED", req.user.userId);
    } catch (snapErr) {
      logger.warn("Snapshot failed on submit (non-fatal)", { sectionId, err: snapErr.message });
    }

    const { rows } = await pool.query(
      `UPDATE public.report_sections
       SET status = 'SUBMITTED', current_step_id = $1,
           locked_by = NULL, locked_at = NULL, updated_by = $2
       WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
      [firstStepId, req.user.userId, sectionId]
    );

    // Notify approver at first step
    if (firstStepId) {
      const { rows: stepRows } = await pool.query(
        `SELECT ws.*, u.id AS uid FROM public.workflow_steps ws
         LEFT JOIN public.users u ON u.id = ws.approver_user_id
         WHERE ws.id = $1`, [firstStepId]
      );
      if (stepRows[0]?.uid) {
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           VALUES ($1, 'REVIEW_REQUESTED', 'Section awaiting your review',
                   $2, 'SECTION', $3)`,
          [stepRows[0].uid, `A section has been submitted for review at step: ${stepRows[0].step_name}`, sectionId]
        ).catch(() => {});
      }
    }

    await writeAuditLog(req, {
      actionType: "SECTION_SUBMITTED", entityType: "SECTION", entityId: sectionId,
      oldValue: { status: section.status }, newValue: { status: "SUBMITTED", version_num: versionNum },
      status: "SUCCESS", message: `Section submitted (v${versionNum})`,
    });

    return res.json({ success: true, data: rows[0], version_num: versionNum });
  } catch (err) {
    logger.error("approvals POST submit", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to submit section" });
  }
});

/* ── POST /section/:sectionId/review — reviewer decision ────────────────────── */
router.post("/section/:sectionId/review", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    const { decision, comment = "" } = req.body;

    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const VALID_DECISIONS = ["APPROVED", "SENT_BACK"];
    if (!VALID_DECISIONS.includes(decision?.toUpperCase()))
      return res.status(400).json({ success: false, message: "decision must be APPROVED or SENT_BACK" });

    const { rows: sRows } = await pool.query(
      `SELECT s.* FROM public.report_sections s
       WHERE s.id = $1 AND s.deleted_at IS NULL`, [sectionId]
    );
    if (!sRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const section = sRows[0];
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(section.status))
      return res.status(422).json({ success: false, message: `Cannot review from status: ${section.status}` });

    // Verify permission: admin bypass OR matching workflow step
    const steps       = await getWorkflowSteps(pool, sectionId);
    const currentStep = steps.find(s => s.id === section.current_step_id) || steps[0];
    const isAdmin     = (req.user.roles || []).some(r => ["super_admin","institute_admin"].includes(r));

    if (!isAdmin && !canReview(req.user, currentStep))
      return res.status(403).json({ success: false, message: "You are not the designated approver for this step" });

    const dec = decision.toUpperCase();

    // Snapshot the decision
    const versionNum = await createSectionSnapshot(pool, sectionId, dec === "APPROVED" ? "APPROVED" : "SENT_BACK", req.user.userId, comment || null);

    let newStatus      = dec === "SENT_BACK" ? "SENT_BACK" : null;
    let nextStepId     = section.current_step_id;

    if (dec === "APPROVED") {
      // Advance to next step or final APPROVED
      const currentStepIdx = steps.findIndex(s => s.id === section.current_step_id);
      const nextStep = steps[currentStepIdx + 1];

      if (nextStep) {
        newStatus  = "UNDER_REVIEW";
        nextStepId = nextStep.id;

        // Notify next approver
        if (nextStep.approver_user_id) {
          await pool.query(
            `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, 'REVIEW_REQUESTED', 'Section awaiting your review',
                     $2, 'SECTION', $3)`,
            [nextStep.approver_user_id, `Passed to you for review: ${nextStep.step_name}`, sectionId]
          ).catch(() => {});
        }
      } else {
        newStatus  = "APPROVED";
        nextStepId = null;

        // Notify section owner
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           SELECT sa.user_id, 'SECTION_APPROVED', 'Your section has been approved',
                  'All workflow steps completed.', 'SECTION', $1
           FROM public.section_assignments sa
           WHERE sa.section_id = $1 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
          [sectionId]
        ).catch(() => {});
      }
    } else {
      // SENT_BACK → reset to IN_PROGRESS, clear step
      nextStepId = null;

      // Notify owner
      await pool.query(
        `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
         SELECT sa.user_id, 'SECTION_SENT_BACK', 'Your section was sent back',
                $1, 'SECTION', $2
         FROM public.section_assignments sa
         WHERE sa.section_id = $2 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
        [comment || "Please review the feedback and resubmit.", sectionId]
      ).catch(() => {});
    }

    // Update section status and step
    const { rows } = await pool.query(
      `UPDATE public.report_sections
       SET status = $1, current_step_id = $2, updated_by = $3
       WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
      [newStatus, nextStepId, req.user.userId, sectionId]
    );

    // Record in section_versions with reviewer info
    await pool.query(
      `UPDATE public.section_versions
       SET reviewer_id = $1, decision = $2, reviewer_comment = $3, workflow_step_id = $4
       WHERE section_id = $5 AND version_num = $6`,
      [req.user.userId, dec, comment || null, section.current_step_id, sectionId, versionNum]
    );

    // Also record in legacy builder_approvals for backwards compat
    await pool.query(
      `INSERT INTO public.builder_approvals (section_id, reviewer_id, decision, comments, version_num)
       VALUES ($1,$2,$3,$4,$5)`,
      [sectionId, req.user.userId, dec === "SENT_BACK" ? "REVISION_REQUIRED" : dec, comment || null, versionNum]
    ).catch(() => {});

    await writeAuditLog(req, {
      actionType: "SECTION_REVIEWED", entityType: "SECTION", entityId: sectionId,
      oldValue: { status: section.status }, newValue: { status: newStatus, decision: dec, comment },
      status: "SUCCESS", message: `Section ${dec}`,
    });

    return res.json({ success: true, data: rows[0], version_num: versionNum });
  } catch (err) {
    logger.error("approvals POST review", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to record review" });
  }
});

module.exports = router;
