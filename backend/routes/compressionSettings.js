"use strict";

const express                      = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog }            = require("../utils/audit");
const logger                       = require("../utils/logger");
const { getLogContext }            = logger;

const router = express.Router();

/* ── GET /api/compression-settings ──────────────────────────────────────
   Any authenticated user can read the settings so upload components can
   validate files against the configured limits.
──────────────────────────────────────────────────────────────────────── */
router.get("/", verifyToken, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT image_min_kb, image_max_kb, pdf_min_mb, pdf_max_mb, updated_at
       FROM compression_settings
       LIMIT 1`
    );
    if (!rows.length) {
      return res.json({
        success: true,
        settings: { image_min_kb: 40, image_max_kb: 200, pdf_min_mb: 1.0, pdf_max_mb: 2.0 },
      });
    }
    return res.json({ success: true, settings: rows[0] });
  } catch (err) {
    logger.error("GET /api/compression-settings failed", {
      ...getLogContext(req), stack: err.stack,
    });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/compression-settings ──────────────────────────────────────
   Super Admin only — update the global compression limits.
──────────────────────────────────────────────────────────────────────── */
router.put(
  "/",
  verifyToken,
  requireRole(["super_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { image_min_kb, image_max_kb, pdf_min_mb, pdf_max_mb } = req.body;

    const imgMin = parseInt(image_min_kb,  10);
    const imgMax = parseInt(image_max_kb,  10);
    const pdfMin = parseFloat(pdf_min_mb);
    const pdfMax = parseFloat(pdf_max_mb);

    if (
      !Number.isFinite(imgMin) || imgMin < 1 ||
      !Number.isFinite(imgMax) || imgMax < 1 ||
      !Number.isFinite(pdfMin) || pdfMin < 0.01 ||
      !Number.isFinite(pdfMax) || pdfMax < 0.01
    ) {
      return res.status(400).json({ success: false, message: "All size fields must be positive numbers." });
    }
    if (imgMin >= imgMax) {
      return res.status(400).json({ success: false, message: "Image minimum must be less than maximum." });
    }
    if (pdfMin >= pdfMax) {
      return res.status(400).json({ success: false, message: "PDF minimum must be less than maximum." });
    }

    try {
      const { rows: existing } = await pool.query("SELECT * FROM compression_settings LIMIT 1");

      const { rows } = await pool.query(
        `UPDATE compression_settings
         SET image_min_kb = $1,
             image_max_kb = $2,
             pdf_min_mb   = $3,
             pdf_max_mb   = $4,
             updated_at   = now(),
             updated_by   = $5
         RETURNING image_min_kb, image_max_kb, pdf_min_mb, pdf_max_mb, updated_at`,
        [imgMin, imgMax, pdfMin, pdfMax, req.user.userId]
      );

      await writeAuditLog(req, {
        actionType: "COMPRESSION_SETTINGS_UPDATED",
        entityType: "COMPRESSION_SETTINGS",
        entityId:   "global",
        oldValue:   existing[0] || null,
        newValue:   rows[0],
        status:     "SUCCESS",
        message:    "Global compression settings updated",
      });

      return res.json({ success: true, settings: rows[0] });
    } catch (err) {
      logger.error("PUT /api/compression-settings failed", {
        ...getLogContext(req), stack: err.stack,
      });
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
  }
);

module.exports = router;
