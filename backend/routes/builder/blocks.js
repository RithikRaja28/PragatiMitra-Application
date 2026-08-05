"use strict";

/**
 * routes/builder/blocks.js
 * Mount: app.use("/api/builder/blocks", require("./routes/builder/blocks"))
 *
 * GET    /section/:sectionId     list blocks for a section
 * POST   /section/:sectionId     create block
 * PUT    /:id                    update block content (with locking + version snapshot)
 * PATCH  /:id/file-field         immediate upload-time replace of one file/image field
 * DELETE /:id                    soft-delete block
 * POST   /reorder                bulk reorder blocks
 * PUT    /:id/translations/:language   upsert a block's translated content
 * GET    /:id/translations/:language   fetch a block's translated content
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const { createSectionSnapshot } = require("../../utils/snapshotHelper");
const logger            = require("../../utils/logger");
const { extractUploadKeys, deleteFile } = require("../../utils/localStorage");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => typeof v === "string" && UUID_RE.test(v);

const VALID_TYPES = ["PARAGRAPH","HEADING","IMAGE","IMAGE_GRID","TABLE","KPI","CHART","LIST","FILE","DIVIDER"];

/* ─── GET /section/:sectionId ─────────────────────────────────────────────── */
router.get("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const { rows } = await pool.query(
      `SELECT * FROM public.section_blocks
       WHERE section_id = $1 AND deleted_at IS NULL
       ORDER BY order_index`,
      [sectionId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("builder/blocks GET /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list blocks" });
  }
});

/* ─── POST /section/:sectionId — create block ────────────────────────────── */
router.post("/section/:sectionId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId }              = req.params;
    const { block_type, content = {}, order_index } = req.body;

    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });
    if (!block_type || !VALID_TYPES.includes(block_type.toUpperCase()))
      return res.status(400).json({ success: false, message: `block_type must be one of: ${VALID_TYPES.join(", ")}` });

    // Verify section exists
    const { rows: sr } = await pool.query(
      `SELECT id FROM public.report_sections WHERE id = $1 AND deleted_at IS NULL`,
      [sectionId]
    );
    if (!sr.length) return res.status(404).json({ success: false, message: "Section not found" });

    // Compute order_index
    let oi = order_index != null ? Number(order_index) : null;
    if (oi == null) {
      const { rows: oRows } = await pool.query(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS next_oi
         FROM public.section_blocks WHERE section_id = $1 AND deleted_at IS NULL`,
        [sectionId]
      );
      oi = oRows[0].next_oi;
    }

    const { rows } = await pool.query(
      `INSERT INTO public.section_blocks
         (section_id, block_type, order_index, content, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5)
       RETURNING *`,
      [sectionId, block_type.toUpperCase(), oi, JSON.stringify(content), req.user.userId]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/blocks POST /section/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to create block" });
  }
});

/* ─── PUT /:id — update block content (with locking + version snapshot) ── */
router.put("/:id", async (req, res) => {
  const pool   = req.app.locals.pool;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { content, order_index, description, version_lock, is_required } = req.body;

    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });

    // description is required for versioned saves
    if (description !== undefined && typeof description === "string" && description.trim().length > 0 && description.trim().length < 5)
      return res.status(400).json({ success: false, message: "description must be at least 5 characters" });

    const sets   = [];
    const params = [];

    if (content !== undefined) {
      params.push(JSON.stringify(content));
      sets.push(`content = $${params.length}`);
    }
    if (order_index != null) {
      params.push(Number(order_index));
      sets.push(`order_index = $${params.length}`);
    }
    if (is_required !== undefined) {
      params.push(Boolean(is_required));
      sets.push(`is_required = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: "Nothing to update" });

    params.push(req.user.userId);
    sets.push(`updated_by = $${params.length}`);
    params.push(id);

    // Fetch block to get section_id
    const { rows: bRows } = await pool.query(
      `SELECT b.section_id, b.content, rs.version_lock AS current_lock,
              rs.locked_by, rs.locked_at, rs.status
       FROM public.section_blocks b
       JOIN public.report_sections rs ON rs.id = b.section_id
       WHERE b.id = $1 AND b.deleted_at IS NULL`,
      [id]
    );
    if (!bRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const { section_id, current_lock, locked_by, locked_at, status } = bRows[0];
    const userId = req.user.userId;

    // Pessimistic lock check: another user has the section locked within 15 min
    if (locked_by && locked_by !== userId && locked_at) {
      const lockedAgo = (Date.now() - new Date(locked_at).getTime()) / 1000;
      if (lockedAgo < 900) {
        return res.status(423).json({
          success: false,
          message: "Section is currently being edited by another user",
          locked_by,
          locked_at,
        });
      }
    }

    await client.query("BEGIN");

    // Update block content
    const { rows } = await client.query(
      `UPDATE public.section_blocks SET ${sets.join(", ")}
       WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Block not found" });
    }

    // If version_lock provided, apply optimistic locking on the section
    let newVersionLock = current_lock;
    let statusChanged  = false;
    const prevStatus   = status;

    if (version_lock !== undefined) {
      const newStatus = status === "NOT_STARTED" ? "IN_PROGRESS" : status;
      statusChanged   = newStatus !== prevStatus;

      const { rowCount } = await client.query(
        `UPDATE public.report_sections
         SET version_lock = version_lock + 1,
             locked_by    = $1,
             locked_at    = NOW(),
             status       = $2,
             updated_by   = $1
         WHERE id = $3 AND version_lock = $4 AND deleted_at IS NULL`,
        [userId, newStatus, section_id, Number(version_lock)]
      );

      if (rowCount === 0) {
        await client.query("ROLLBACK");
        // Return the latest version_num so client can show it
        const { rows: vRows } = await pool.query(
          `SELECT COALESCE(MAX(version_num), 0) AS latest FROM public.section_versions WHERE section_id = $1`,
          [section_id]
        );
        return res.status(409).json({
          success: false,
          message: "Content was modified by someone else. Please reload.",
          latest_version_num: vRows[0]?.latest || 0,
        });
      }

      newVersionLock = Number(version_lock) + 1;
    } else {
      // No optimistic lock requested — just update locked_by/locked_at and status
      const newStatus = status === "NOT_STARTED" ? "IN_PROGRESS" : status;
      statusChanged   = newStatus !== prevStatus;
      await client.query(
        `UPDATE public.report_sections
         SET locked_by = $1, locked_at = NOW(), status = $2, updated_by = $1
         WHERE id = $3 AND deleted_at IS NULL`,
        [userId, newStatus, section_id]
      );
    }

    await client.query("COMMIT");

    // Clean up replaced files in content
    if (content !== undefined) {
      const oldKeys = extractUploadKeys(bRows[0].content);
      const newKeys = extractUploadKeys(content);
      // Only delete files that belong to this report submission
      const toDelete = oldKeys.filter(k => !newKeys.includes(k) && k.includes("/submissions/"));
      for (const key of toDelete) {
        await deleteFile(key).catch(() => {});
      }
    }

    // Audit log if status changed
    if (statusChanged) {
      await writeAuditLog(req, {
        actionType: "SECTION_STATUS_CHANGED",
        entityType: "SECTION",
        entityId:   section_id,
        oldValue:   { status: prevStatus },
        newValue:   { status: "IN_PROGRESS" },
        status:     "SUCCESS",
        message:    "Section moved to IN_PROGRESS on first edit",
      }).catch(() => {});
    }

    // Create version snapshot if description provided
    let versionNum = null;
    if (description && description.trim().length >= 5) {
      try {
        versionNum = await createSectionSnapshot(
          pool, section_id, "MANUAL", userId, null, description.trim()
        );
      } catch (snapErr) {
        logger.warn("Snapshot failed on block save (non-fatal)", { section_id, err: snapErr.message });
      }
    }

    return res.json({
      success:      true,
      data:         rows[0],
      version_lock: newVersionLock,
      version_num:  versionNum,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("builder/blocks PUT /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to update block" });
  } finally {
    client.release();
  }
});

/* ─── PATCH /:id/file-field — immediate upload-time replace ──────────────────
   Called right after a successful upload for an IMAGE/IMAGE_GRID/FILE block's
   file reference — deliberately NOT part of the deferred "Save Changes" flow
   (PUT /:id above). Block edits are held in local UI state and only PUT to
   the server on Save, but uploads write to disk immediately; replacing an
   upload before ever saving orphaned the old file with no DB trace of it.
   This persists just the one file field the moment it's uploaded — reading
   the old value and writing the new one in a single statement (no separate
   read-then-write race) — and deletes the old file if superseded, regardless
   of whether the surrounding block content has ever been explicitly saved. */
const FILE_FIELD_PATH_RE = /^(url|fileName|name)$|^cols\.[0-9]+\.(url|fileName)$/;

router.patch("/:id/file-field", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    const { path, value } = req.body;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });
    if (typeof path !== "string" || !FILE_FIELD_PATH_RE.test(path))
      return res.status(400).json({ success: false, message: "Invalid field path" });
    if (typeof value !== "string")
      return res.status(400).json({ success: false, message: "value must be a string" });

    const pathArr = path.split(".");

    const { rows } = await pool.query(
      `WITH old AS (
         SELECT content #>> $2::text[] AS old_value
         FROM public.section_blocks WHERE id = $1 AND deleted_at IS NULL
       )
       UPDATE public.section_blocks
       SET content = jsonb_set(content, $2::text[], to_jsonb($3::text), true),
           updated_by = $4
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING content, (SELECT old_value FROM old) AS old_value`,
      [id, pathArr, value, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const { old_value: oldValue } = rows[0];
    if (oldValue && oldValue !== value) {
      const [oldKey] = extractUploadKeys(oldValue);
      if (oldKey) await deleteFile(oldKey).catch(() => {});
    }

    return res.json({ success: true, data: rows[0].content });
  } catch (err) {
    logger.error("builder/blocks PATCH /:id/file-field", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to save file field" });
  }
});

/* ─── DELETE /:id — soft delete ─────────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { rows } = await pool.query(
      `UPDATE public.section_blocks SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id, content`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Block not found" });

    // Clean up all files in deleted block
    const keys = extractUploadKeys(rows[0].content);
    for (const key of keys) {
      await deleteFile(key).catch(() => {});
    }

    return res.json({ success: true, message: "Block deleted" });
  } catch (err) {
    logger.error("builder/blocks DELETE /:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to delete block" });
  }
});

/* ─── POST /reorder — bulk reorder ──────────────────────────────────────── */
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

    const ids    = items.map((i) => i.id);
    const orders = items.map((i) => Number(i.order_index));

    await pool.query(
      `UPDATE public.section_blocks AS b
       SET order_index = v.order_index::REAL,
           updated_by  = $3
       FROM (SELECT UNNEST($1::uuid[]) AS id, UNNEST($2::real[]) AS order_index) AS v
       WHERE b.id = v.id AND b.deleted_at IS NULL`,
      [ids, orders, req.user.userId]
    );

    return res.json({ success: true, message: "Blocks reordered" });
  } catch (err) {
    logger.error("builder/blocks POST /reorder", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to reorder blocks" });
  }
});

/* ─── PUT /:id/translations/:language — upsert a block's translated content ──
   Per the translation data spec: content here mirrors the SAME JSONB shape as
   section_blocks.content, but only the translatable text fields are filled
   (e.g. { html } for PARAGRAPH, { text } for HEADING, { items } for LIST,
   { caption, alt } for IMAGE, { headers, rows } for a manual TABLE). Structural
   /non-text fields are never duplicated here — the compiler/editor reads those
   from the primary content and only overlays text fields from this row. ───── */
router.put("/:id/translations/:language", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, language } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });
    if (!/^[a-z]{2,10}$/i.test(language)) return res.status(400).json({ success: false, message: "Invalid language code" });

    const { content } = req.body;
    if (!content || typeof content !== "object" || Array.isArray(content))
      return res.status(400).json({ success: false, message: "content object is required" });

    const { rows: blkRows } = await pool.query(
      `SELECT id FROM public.section_blocks WHERE id=$1 AND deleted_at IS NULL`, [id]
    );
    if (!blkRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const { rows } = await pool.query(
      `INSERT INTO public.block_translations (block_id, language, content, status, created_by, updated_by)
       VALUES ($1,$2,$3::jsonb,'DRAFT',$4,$4)
       ON CONFLICT (block_id, language) DO UPDATE
         SET content    = public.block_translations.content || EXCLUDED.content,
             updated_by  = EXCLUDED.updated_by
       RETURNING content, status`,
      [id, language.toLowerCase(), JSON.stringify(content), req.user.userId]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error("builder/blocks PUT /:id/translations/:language", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to save translation" });
  }
});

/* ─── GET /:id/translations/:language — fetch a single translation row ──── */
router.get("/:id/translations/:language", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { id, language } = req.params;
    if (!isUUID(id)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { rows } = await pool.query(
      `SELECT content, status FROM public.block_translations WHERE block_id=$1 AND language=$2`,
      [id, language.toLowerCase()]
    );
    return res.json({ success: true, data: rows[0] || { content: {}, status: null } });
  } catch (err) {
    logger.error("builder/blocks GET /:id/translations/:language", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to fetch translation" });
  }
});

module.exports = router;
