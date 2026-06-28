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
const { enqueueEmail }  = require("../../services/mailService");
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
  if (roles.includes("super_admin")) return true;   // super_admin only: god-mode override
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
         AND (sv.event = 'SUBMITTED' OR sv.decision IS NOT NULL)
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

    const needsDirectorApproval = !!section.needs_director_approval;
    const isDirectorsOffice     = (req.user.roles || []).includes("directors_office");
    const isAdmin               = (req.user.roles || []).some(r => ["super_admin","institute_admin"].includes(r));
    // Admins can act as fallback reviewers ONLY on sections with no workflow step AND not
    // pending director approval (those must go exclusively to directors_office).
    const isAdminSteplessFallback = isAdmin && !needsDirectorApproval && currentIdx === -1 && steps.length === 0;
    const canReviewNow =
      (needsDirectorApproval && isDirectorsOffice) ||
      canReview(req.user, steps[currentIdx]) ||
      isAdminSteplessFallback;

    return res.json({
      success: true,
      data: {
        section_status:          section.status,
        workflow_name:           section.workflow_name,
        current_step:            steps[currentIdx] || null,
        steps:                   pipeline,
        can_review:              canReviewNow,
        needs_director_approval: needsDirectorApproval,
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

    const { description } = req.body;
    if (!description || !description.trim())
      return res.status(400).json({ success: false, message: "description is required when submitting" });

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

    // Workflow must be assigned
    if (!section.workflow_template_id)
      return res.status(422).json({ success: false, message: "A workflow template must be assigned before submitting" });

    // Validate all required blocks have content
    const { rows: reqBlocks } = await pool.query(
      `SELECT id, block_type, content FROM public.section_blocks
       WHERE section_id = $1 AND is_required = TRUE AND deleted_at IS NULL`,
      [sectionId]
    );
    const emptyRequired = reqBlocks.filter(b => {
      const c = b.content || {};
      if (b.block_type === "PARAGRAPH") return !(c.html || c.text || "").trim();
      if (b.block_type === "HEADING")   return !(c.text || "").trim();
      if (b.block_type === "TABLE")     return !(c.rows || []).length;
      if (b.block_type === "LIST")      return !(c.items || []).filter(i => i?.trim()).length;
      return false;
    });
    if (emptyRequired.length > 0) {
      return res.status(422).json({
        success: false,
        message: `${emptyRequired.length} required block(s) have no content`,
        empty_blocks: emptyRequired.map(b => b.id),
      });
    }

    // Get unresolved comment count (for SENT_BACK re-submit warning in response)
    const { rows: unresCnt } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM public.block_comments
       WHERE section_id = $1 AND is_resolved = FALSE AND deleted_at IS NULL AND parent_id IS NULL`,
      [sectionId]
    );
    const unresolvedCount = Number(unresCnt[0]?.cnt || 0);

    // Find first workflow step
    let firstStepId = null;
    const { rows: stepRows } = await pool.query(
      `SELECT id FROM public.workflow_steps WHERE template_id = $1 ORDER BY step_order LIMIT 1`,
      [section.workflow_template_id]
    );
    if (stepRows.length) firstStepId = stepRows[0].id;

    let versionNum = null;
    try {
      versionNum = await createSectionSnapshot(pool, sectionId, "SUBMITTED", req.user.userId, null, description.trim());
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

    // Notify approver at first step (in-app + email)
    if (firstStepId) {
      const { rows: notifRows } = await pool.query(
        `SELECT ws.*, u.id AS uid, u.full_name AS approver_name, u.email AS approver_email
         FROM public.workflow_steps ws
         LEFT JOIN public.users u ON u.id = ws.approver_user_id
         WHERE ws.id = $1`, [firstStepId]
      );
      if (notifRows[0]?.uid) {
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           VALUES ($1, 'REVIEW_REQUESTED', 'Section awaiting your review',
                   $2, 'SECTION', $3)`,
          [notifRows[0].uid, `A section has been submitted for review at step: ${notifRows[0].step_name}`, sectionId]
        ).catch(() => {});

        // Email the approver
        if (notifRows[0].approver_email) {
          const { rows: submitterRows } = await pool.query(
            `SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId]
          );
          const submittedByName = submitterRows[0]?.full_name || "A contributor";
          enqueueEmail(pool, {
            eventId:         "form_submitted",
            recipientEmail:  notifRows[0].approver_email,
            recipientUserId: notifRows[0].uid,
            payload: {
              full_name:         notifRows[0].approver_name,
              section_name:      `Section ${sectionId.slice(0, 8)}`,
              step_name:         notifRows[0].step_name || "Step 1",
              submitted_by_name: submittedByName,
              login_url:         process.env.APP_LOGIN_URL || "http://localhost:5173/login",
            },
          }).catch((e) => logger.error("Failed to enqueue form_submitted email", { err: e.message }));
        }
      }
    }

    await writeAuditLog(req, {
      actionType: "SECTION_SUBMITTED", entityType: "SECTION", entityId: sectionId,
      oldValue: { status: section.status }, newValue: { status: "SUBMITTED", version_num: versionNum },
      status: "SUCCESS", message: `Section submitted (v${versionNum})`,
    });

    return res.json({
      success:          true,
      data:             rows[0],
      version_num:      versionNum,
      unresolved_count: unresolvedCount,
    });
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

    // Verify permission: must be the designated approver for the current step,
    // OR directors_office for final director approval,
    // OR admin fallback for truly stepless sections (no workflow template assigned).
    const steps               = await getWorkflowSteps(pool, sectionId);
    const currentStep         = steps.find(s => s.id === section.current_step_id) ?? null;
    const isAdmin             = (req.user.roles || []).some(r => ["super_admin","institute_admin"].includes(r));
    const isDirectorsOffice   = (req.user.roles || []).includes("directors_office");
    const needsDirectorApproval = !!section.needs_director_approval;
    const isAdminSteplessFallback = isAdmin && !needsDirectorApproval && !currentStep && steps.length === 0;

    const canAct =
      (needsDirectorApproval && isDirectorsOffice) ||
      canReview(req.user, currentStep) ||
      isAdminSteplessFallback;

    if (!canAct)
      return res.status(403).json({ success: false, message: "You are not the designated approver for this step" });

    const dec = decision.toUpperCase();

    // Stamp the most recent SUBMITTED snapshot with the reviewer decision.
    // ('APPROVED' and 'SENT_BACK' are not valid event types in section_versions;
    //  the decision is stored in the decision/reviewer_* columns instead.)
    const { rows: latestVer } = await pool.query(
      `SELECT version_num FROM public.section_versions
       WHERE section_id = $1 AND event = 'SUBMITTED'
       ORDER BY version_num DESC LIMIT 1`,
      [sectionId]
    );
    let versionNum = null;
    if (latestVer.length) {
      versionNum = latestVer[0].version_num;
      await pool.query(
        `UPDATE public.section_versions
         SET reviewer_id            = $1,
             decision               = $2,
             reviewer_comment       = $3,
             workflow_step_id       = $4,
             latest_decision        = $2,
             latest_decision_by     = $1,
             latest_decision_at     = now(),
             latest_decision_step_id = $4
         WHERE section_id = $5 AND version_num = $6`,
        [req.user.userId, dec, comment || null, section.current_step_id, sectionId, versionNum]
      );
    }

    let newStatus  = null;
    let nextStepId = section.current_step_id;

    if (needsDirectorApproval && isDirectorsOffice) {
      // ── Director's Office final approval path ──────────────────────────────
      nextStepId = null;
      await pool.query(
        `UPDATE public.report_sections SET needs_director_approval = FALSE WHERE id = $1`,
        [sectionId]
      );

      if (dec === "APPROVED") {
        newStatus = "APPROVED";
        // Notify section owner of final approval (in-app + email)
        const { rows: ownerNotifRows } = await pool.query(
          `SELECT sa.user_id, u.full_name, u.email FROM public.section_assignments sa
           JOIN public.users u ON u.id = sa.user_id
           WHERE sa.section_id = $1 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
          [sectionId]
        ).catch(() => ({ rows: [] }));
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           SELECT sa.user_id, 'SECTION_APPROVED', 'Your section has been finally approved',
                  'Director''s Office has given final approval. The section is now APPROVED.', 'SECTION', $1
           FROM public.section_assignments sa
           WHERE sa.section_id = $1 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
          [sectionId]
        ).catch(() => {});
        const { rows: reviewerNameRows } = await pool.query(
          `SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId]
        ).catch(() => ({ rows: [] }));
        const reviewerName = reviewerNameRows[0]?.full_name || "Director's Office";
        for (const owner of (ownerNotifRows || [])) {
          enqueueEmail(pool, {
            eventId:         "form_approved",
            recipientEmail:  owner.email,
            recipientUserId: owner.user_id,
            payload: {
              full_name:        owner.full_name,
              section_name:     `Section ${sectionId.slice(0, 8)}`,
              approved_by_name: reviewerName,
              login_url:        process.env.APP_LOGIN_URL || "http://localhost:5173/login",
            },
          }).catch((e) => logger.error("Failed to enqueue form_approved email", { err: e.message }));
        }
      } else {
        // SENT_BACK by director → owner must revise and resubmit
        newStatus = "SENT_BACK";
        const { rows: ownerSentBackRows } = await pool.query(
          `SELECT sa.user_id, u.full_name, u.email FROM public.section_assignments sa
           JOIN public.users u ON u.id = sa.user_id
           WHERE sa.section_id = $1 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
          [sectionId]
        ).catch(() => ({ rows: [] }));
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           SELECT sa.user_id, 'SECTION_SENT_BACK', 'Your section was sent back by Director''s Office',
                  $1, 'SECTION', $2
           FROM public.section_assignments sa
           WHERE sa.section_id = $2 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
          [comment || "Director's Office has sent the section back. Please revise and resubmit.", sectionId]
        ).catch(() => {});
        const { rows: dirRevNameRows } = await pool.query(
          `SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId]
        ).catch(() => ({ rows: [] }));
        const dirRevName = dirRevNameRows[0]?.full_name || "Director's Office";
        for (const owner of (ownerSentBackRows || [])) {
          enqueueEmail(pool, {
            eventId:         "form_rejected",
            recipientEmail:  owner.email,
            recipientUserId: owner.user_id,
            payload: {
              full_name:     owner.full_name,
              section_name:  `Section ${sectionId.slice(0, 8)}`,
              reviewer_name: dirRevName,
              comment:       comment || "Director's Office has sent the section back. Please revise and resubmit.",
              login_url:     process.env.APP_LOGIN_URL || "http://localhost:5173/login",
            },
          }).catch((e) => logger.error("Failed to enqueue form_rejected email", { err: e.message }));
        }
      }
    } else if (dec === "APPROVED") {
      // ── Normal workflow step approval ──────────────────────────────────────
      const currentStepIdx = steps.findIndex(s => s.id === section.current_step_id);
      const nextStep = steps[currentStepIdx + 1];

      if (nextStep) {
        // Advance to next step in workflow
        newStatus  = "UNDER_REVIEW";
        nextStepId = nextStep.id;

        // Notify next approver (in-app + email)
        if (nextStep.approver_user_id) {
          await pool.query(
            `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, 'REVIEW_REQUESTED', 'Section awaiting your review',
                     $2, 'SECTION', $3)`,
            [nextStep.approver_user_id, `Passed to you for review: ${nextStep.step_name}`, sectionId]
          ).catch(() => {});

          // Email the next-step reviewer
          pool.query(
            `SELECT u.full_name, u.email, rs.title AS section_title, r.title AS report_title
             FROM public.users u
             JOIN public.report_sections rs ON rs.id = $2
             JOIN public.reports r ON r.id = rs.report_id
             WHERE u.id = $1`,
            [nextStep.approver_user_id, sectionId]
          ).then(({ rows: nr }) => {
            if (!nr[0]?.email) return;
            pool.query(`SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId])
              .then(({ rows: cur }) => {
                enqueueEmail(pool, {
                  eventId:         "form_submitted",
                  recipientEmail:  nr[0].email,
                  recipientUserId: nextStep.approver_user_id,
                  payload: {
                    full_name:         nr[0].full_name,
                    section_name:      nr[0].section_title || `Section ${sectionId.slice(0, 8)}`,
                    step_name:         nextStep.step_name  || "Review Step",
                    submitted_by_name: cur[0]?.full_name   || "Previous reviewer",
                    login_url:         process.env.APP_LOGIN_URL || "http://localhost:5173/login",
                  },
                }).catch((e) => logger.error("Failed to enqueue step-advance email", { err: e.message }));
              }).catch(() => {});
          }).catch(() => {});
        }
      } else {
        // Last workflow step approved → route to Director's Office for final approval
        newStatus  = "SUBMITTED";
        nextStepId = null;
        await pool.query(
          `UPDATE public.report_sections SET needs_director_approval = TRUE WHERE id = $1`,
          [sectionId]
        );

        // Notify all directors_office users (in-app + email)
        await pool.query(
          `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
           SELECT DISTINCT u.id, 'REVIEW_REQUESTED',
                  'Section awaiting Director''s Office final approval',
                  'All workflow steps have been completed. This section requires your final approval.',
                  'SECTION', $1
           FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.id
             AND ur.revoked_at IS NULL
             AND (ur.expires_at IS NULL OR ur.expires_at > now())
           JOIN public.roles r ON r.id = ur.role_id AND r.name = 'directors_office'
           WHERE u.account_status = 'ACTIVE'`,
          [sectionId]
        ).catch(() => {});

        // Email all Director's Office users
        pool.query(
          `SELECT DISTINCT u.id, u.full_name, u.email, rs.title AS section_title, rp.title AS report_title
           FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.id
             AND ur.revoked_at IS NULL
             AND (ur.expires_at IS NULL OR ur.expires_at > now())
           JOIN public.roles ro ON ro.id = ur.role_id AND ro.name = 'directors_office'
           JOIN public.report_sections rs ON rs.id = $1
           JOIN public.reports rp ON rp.id = rs.report_id
           WHERE u.account_status = 'ACTIVE'`,
          [sectionId]
        ).then(({ rows: dirRows }) => {
          for (const du of dirRows) {
            enqueueEmail(pool, {
              eventId:         "form_submitted",
              recipientEmail:  du.email,
              recipientUserId: du.id,
              payload: {
                full_name:         du.full_name,
                section_name:      du.section_title || `Section ${sectionId.slice(0, 8)}`,
                step_name:         "Director's Office Final Approval",
                submitted_by_name: "All workflow steps completed",
                login_url:         process.env.APP_LOGIN_URL || "http://localhost:5173/login",
              },
            }).catch((e) => logger.error("Failed to enqueue director email", { err: e.message }));
          }
        }).catch(() => {});
      }
    } else {
      // SENT_BACK → reset to IN_PROGRESS, clear step
      newStatus  = "SENT_BACK";
      nextStepId = null;

      // Notify owner (in-app + email)
      const { rows: sbOwnerRows } = await pool.query(
        `SELECT sa.user_id, u.full_name, u.email FROM public.section_assignments sa
         JOIN public.users u ON u.id = sa.user_id
         WHERE sa.section_id = $1 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
        [sectionId]
      ).catch(() => ({ rows: [] }));
      await pool.query(
        `INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
         SELECT sa.user_id, 'SECTION_SENT_BACK', 'Your section was sent back',
                $1, 'SECTION', $2
         FROM public.section_assignments sa
         WHERE sa.section_id = $2 AND sa.role = 'OWNER' AND sa.completed_at IS NULL`,
        [comment || "Please review the feedback and resubmit.", sectionId]
      ).catch(() => {});
      const { rows: sbRevNameRows } = await pool.query(
        `SELECT full_name FROM public.users WHERE id = $1`, [req.user.userId]
      ).catch(() => ({ rows: [] }));
      const sbRevName = sbRevNameRows[0]?.full_name || "An approver";
      for (const owner of (sbOwnerRows || [])) {
        enqueueEmail(pool, {
          eventId:         "form_rejected",
          recipientEmail:  owner.email,
          recipientUserId: owner.user_id,
          payload: {
            full_name:     owner.full_name,
            section_name:  `Section ${sectionId.slice(0, 8)}`,
            reviewer_name: sbRevName,
            comment:       comment || "Please review the feedback and resubmit.",
            login_url:     process.env.APP_LOGIN_URL || "http://localhost:5173/login",
          },
        }).catch((e) => logger.error("Failed to enqueue form_rejected email", { err: e.message }));
      }
    }

    // Update section status and step
    const { rows } = await pool.query(
      `UPDATE public.report_sections
       SET status = $1, current_step_id = $2, updated_by = $3
       WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
      [newStatus, nextStepId, req.user.userId, sectionId]
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
