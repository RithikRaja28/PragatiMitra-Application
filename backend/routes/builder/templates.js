"use strict";

/**
 * routes/builder/templates.js
 * Mount: app.use("/api/builder/templates", require("./routes/builder/templates"))
 *
 * GET    /                          list report templates
 * POST   /                          create report template
 * GET    /:id                       get template with full section tree
 * PUT    /:id                       update template metadata
 * PATCH  /:id/status                change status (DRAFT→ACTIVE→ARCHIVED)
 * DELETE /:id                       delete template (DRAFT only)
 * POST   /:id/sections              add section to template
 * PUT    /:id/sections/:secId       update template section
 * DELETE /:id/sections/:secId       remove template section
 * POST   /:id/sections/:secId/blocks  add block to template section
 * PUT    /:id/sections/:secId/blocks/:blkId  update block
 * DELETE /:id/sections/:secId/blocks/:blkId  remove block
 * POST   /:id/stamp                 stamp template onto report
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

const ALLOWED_BLOCK_TYPES = [
  "PARAGRAPH","HEADING","IMAGE","IMAGE_GRID","TABLE","KPI","CHART",
  "LIST","CHECKLIST","FILE","DIVIDER","EMBED",
];

function callerInstitution(req) {
  const roles = req.user.roles || [];
  if (roles.includes("super_admin") && req.query.institution_id) return req.query.institution_id;
  return req.user.institutionId || null;
}

/* ── GET / ── list templates ────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { status, report_type } = req.query;
    const params = [instId], conds = ["rt.institution_id = $1"];

    if (status)      { params.push(status.toUpperCase()); conds.push(`rt.status = $${params.length}`); }
    if (report_type) { params.push(report_type);          conds.push(`rt.report_type = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT rt.*, u.full_name AS created_by_name,
              COUNT(ts.id) AS section_count
       FROM public.report_templates rt
       LEFT JOIN public.users u ON u.id = rt.created_by
       LEFT JOIN public.template_sections ts ON ts.template_id = rt.id
       WHERE ${conds.join(" AND ")}
       GROUP BY rt.id, u.full_name
       ORDER BY rt.name`, params
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("templates GET /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list templates" });
  }
});

/* ── POST / ── create template ──────────────────────────────────────────────── */
router.post("/", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const instId = callerInstitution(req);
    if (!instId) return res.status(400).json({ success: false, message: "institution_id required" });

    const { name, description, report_type, version, default_workflow_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });

    const { rows } = await pool.query(
      `INSERT INTO public.report_templates
         (institution_id, name, description, report_type, version, default_workflow_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [instId, name.trim(), description || null, report_type || null,
       version || "1.0", isUUID(default_workflow_id) ? default_workflow_id : null, req.user.userId]
    );

    await writeAuditLog(req, {
      actionType: "TEMPLATE_CREATED", entityType: "TEMPLATE", entityId: rows[0].id,
      newValue: rows[0], status: "SUCCESS", message: `Template "${rows[0].name}" created`,
    });

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates POST /", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create template" });
  }
});

/* ── GET /:id ── get template with section tree ─────────────────────────────── */
router.get("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const [tmplRes, sectRes] = await Promise.all([
      pool.query(`SELECT rt.* FROM public.report_templates rt WHERE rt.id = $1`, [id]),
      pool.query(
        `WITH RECURSIVE tree AS (
           SELECT ts.*, 0 AS depth
           FROM public.template_sections ts WHERE ts.template_id = $1 AND ts.parent_id IS NULL
           UNION ALL
           SELECT ts2.*, t.depth + 1
           FROM public.template_sections ts2 JOIN tree t ON ts2.parent_id = t.id
           WHERE ts2.template_id = $1
         )
         SELECT t.*, json_agg(
           json_build_object('id',tb.id,'block_type',tb.block_type,'order_index',tb.order_index,
                             'default_content',tb.default_content,'is_required',tb.is_required)
           ORDER BY tb.order_index
         ) FILTER (WHERE tb.id IS NOT NULL) AS blocks
         FROM tree t
         LEFT JOIN public.template_blocks tb ON tb.template_section_id = t.id
         GROUP BY t.id, t.template_id, t.parent_id, t.title, t.title_translations, t.description, t.order_index,
                  t.workflow_template_id, t.data_source_id, t.created_by, t.created_at, t.updated_at, t.depth
         ORDER BY t.depth, t.order_index`, [id]
      ),
    ]);

    if (!tmplRes.rows.length) return res.status(404).json({ success: false, message: "Template not found" });

    return res.json({ success: true, data: { ...tmplRes.rows[0], sections: sectRes.rows } });
  } catch (err) {
    logger.error("templates GET /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get template" });
  }
});

/* ── PUT /:id ── update template metadata ───────────────────────────────────── */
router.put("/:id", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    // Fetch current version to auto-bump it
    const { rows: cur } = await pool.query(
      `SELECT version FROM public.report_templates WHERE id = $1`, [id]
    );
    if (!cur.length) return res.status(404).json({ success: false, message: "Template not found" });

    const [maj, min] = (cur[0].version || "1.0").split(".").map(n => parseInt(n, 10) || 0);
    const nextVersion = `${maj}.${min + 1}`;

    const allowed = ["name","description","report_type","default_workflow_id"];
    const sets = [], params = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f} = $${params.length}`); }
    }
    // Always bump version on save
    params.push(nextVersion); sets.push(`version = $${params.length}`);

    params.push(req.user.userId); sets.push(`updated_by = $${params.length}`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE public.report_templates SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update template" });
  }
});

/* ── PATCH /:id/status ── change template status ────────────────────────────── */
router.patch("/:id/status", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid id" });

    const VALID = ["DRAFT","ACTIVE","ARCHIVED"];
    if (!VALID.includes(status?.toUpperCase())) return res.status(400).json({ success: false, message: "Invalid status" });

    const { rows } = await pool.query(
      `UPDATE public.report_templates SET status = $1, updated_by = $2 WHERE id = $3 RETURNING *`,
      [status.toUpperCase(), req.user.userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Template not found" });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates PATCH status", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

/* ── POST /:id/sections ── add template section ─────────────────────────────── */
router.post("/:id/sections", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid template id" });

    const { title, description, parent_id, order_index, title_translations } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: "title required" });

    let oi = order_index != null ? Number(order_index) : null;
    if (oi == null) {
      const { rows: oRows } = await pool.query(
        `SELECT COALESCE(MAX(order_index),0)+1 AS next FROM public.template_sections
         WHERE template_id = $1 AND ${parent_id ? "parent_id = $2" : "parent_id IS NULL"}`,
        parent_id ? [id, parent_id] : [id]
      );
      oi = oRows[0].next;
    }

    const { rows } = await pool.query(
      `INSERT INTO public.template_sections (template_id, parent_id, title, description, order_index, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, isUUID(parent_id) ? parent_id : null, title.trim(), description || null, oi, req.user.userId]
    );
    // Merge title_translations if column exists (added by migration 016)
    if (title_translations && typeof title_translations === "object" && Object.keys(title_translations).length > 0) {
      try {
        await pool.query(
          `UPDATE public.template_sections SET title_translations = title_translations || $1 WHERE id = $2`,
          [JSON.stringify(title_translations), rows[0].id]
        );
      } catch { /* column not yet migrated — safe to ignore */ }
    }

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates POST sections", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add section" });
  }
});

/* ── PUT /:id/sections/:secId ── update template section ───────────────────── */
router.put("/:id/sections/:secId", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, secId } = req.params;
    const { title_translations: tmplTitleTrans } = req.body;
    const allowed = ["title", "description", "order_index", "workflow_template_id"];
    const sets = [], params = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f} = $${params.length}`); }
    }

    // title_translations-only update: skip the main UPDATE, go straight to JSONB merge
    if (!sets.length && tmplTitleTrans && typeof tmplTitleTrans === "object") {
      try {
        await pool.query(
          `UPDATE public.template_sections SET title_translations = title_translations || $1 WHERE id = $2 AND template_id = $3`,
          [JSON.stringify(tmplTitleTrans), secId, id]
        );
      } catch { /* column not yet migrated */ }
      return res.json({ success: true, data: { id: secId } });
    }

    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });
    params.push(secId); params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.template_sections SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND template_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Section not found" });

    if (tmplTitleTrans && typeof tmplTitleTrans === "object") {
      try {
        await pool.query(
          `UPDATE public.template_sections SET title_translations = title_translations || $1 WHERE id = $2`,
          [JSON.stringify(tmplTitleTrans), secId]
        );
      } catch { /* column not yet migrated */ }
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates PUT section", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update section" });
  }
});

/* ── DELETE /:id/sections/:secId ── remove template section ─────────────────── */
router.delete("/:id/sections/:secId", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, secId } = req.params;

    // Guard: reject if section or any descendant has required blocks
    const { rows: reqRows } = await pool.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM public.template_sections WHERE id = $1 AND template_id = $2
         UNION ALL
         SELECT ts.id FROM public.template_sections ts
         JOIN descendants d ON ts.parent_id = d.id WHERE ts.template_id = $2
       )
       SELECT COUNT(*) AS cnt FROM public.template_blocks tb
       JOIN descendants d ON tb.template_section_id = d.id WHERE tb.is_required = TRUE`,
      [secId, id]
    );
    if (Number(reqRows[0].cnt) > 0)
      return res.status(409).json({ success: false, message: "Cannot delete: section contains required blocks" });

    await pool.query(
      `DELETE FROM public.template_sections WHERE id = $1 AND template_id = $2`, [secId, id]
    );
    return res.json({ success: true, message: "Section removed" });
  } catch (err) {
    logger.error("templates DELETE section", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to remove section" });
  }
});

/* ── POST /:id/sections/:secId/blocks ── add block to template section ──────── */
router.post("/:id/sections/:secId/blocks", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { secId } = req.params;
    const { block_type, order_index, default_content = {}, is_required = false, data_source_id } = req.body;

    if (!ALLOWED_BLOCK_TYPES.includes(block_type?.toUpperCase()))
      return res.status(400).json({ success: false, message: "Invalid block_type" });

    let oi = order_index != null ? Number(order_index) : null;
    if (oi == null) {
      const { rows } = await pool.query(
        `SELECT COALESCE(MAX(order_index),0)+1 AS next FROM public.template_blocks WHERE template_section_id = $1`, [secId]
      );
      oi = rows[0].next;
    }

    const { rows } = await pool.query(
      `INSERT INTO public.template_blocks
         (template_section_id, block_type, order_index, default_content, data_source_id, is_required, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [secId, block_type.toUpperCase(), oi, JSON.stringify(default_content),
       isUUID(data_source_id) ? data_source_id : null, Boolean(is_required), req.user.userId]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates POST block", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to add block" });
  }
});

/* ── PUT /:id/sections/:secId/blocks/:blkId ── update block ─────────────────── */
router.put("/:id/sections/:secId/blocks/:blkId", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { secId, blkId } = req.params;
    const sets = [], params = [];
    if (req.body.default_content !== undefined) { params.push(JSON.stringify(req.body.default_content)); sets.push(`default_content = $${params.length}`); }
    if (req.body.is_required      !== undefined) { params.push(Boolean(req.body.is_required));            sets.push(`is_required = $${params.length}`); }
    if (req.body.order_index      !== undefined) { params.push(Number(req.body.order_index));             sets.push(`order_index = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });
    params.push(blkId); params.push(secId);
    const { rows } = await pool.query(
      `UPDATE public.template_blocks SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND template_section_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Block not found" });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("templates PUT block", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update block" });
  }
});

/* ── DELETE /:id/sections/:secId/blocks/:blkId ── remove block ──────────────── */
router.delete("/:id/sections/:secId/blocks/:blkId", requireRole(["super_admin", "institute_admin", "publication_cell"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { secId, blkId } = req.params;
    const { rows: chk } = await pool.query(
      `SELECT is_required FROM public.template_blocks WHERE id = $1 AND template_section_id = $2`, [blkId, secId]
    );
    if (!chk.length) return res.status(404).json({ success: false, message: "Block not found" });
    if (chk[0].is_required) return res.status(409).json({ success: false, message: "Cannot delete a required block" });
    await pool.query(`DELETE FROM public.template_blocks WHERE id = $1`, [blkId]);
    return res.json({ success: true, message: "Block removed" });
  } catch (err) {
    logger.error("templates DELETE block", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to remove block" });
  }
});

/* ── POST /:id/stamp ── stamp template onto a report ────────────────────────── */
router.post("/:id/stamp", requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    const { report_id } = req.body;
    if (!isUUID(id) || !isUUID(report_id))
      return res.status(400).json({ success: false, message: "template id and report_id (UUID) required" });

    const { rows } = await pool.query(
      `SELECT public.stamp_template_to_report($1, $2, $3) AS section_count`,
      [report_id, id, req.user.userId]
    );

    // Update report.template_id
    await pool.query(`UPDATE public.reports SET template_id = $1 WHERE id = $2`, [id, report_id]);

    await writeAuditLog(req, {
      actionType: "TEMPLATE_STAMPED", entityType: "REPORT", entityId: report_id,
      newValue: { template_id: id }, status: "SUCCESS",
      message: `Template stamped onto report (${rows[0].section_count} sections created)`,
    });

    return res.json({ success: true, section_count: rows[0].section_count });
  } catch (err) {
    logger.error("templates POST stamp", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to stamp template" });
  }
});

module.exports = router;
