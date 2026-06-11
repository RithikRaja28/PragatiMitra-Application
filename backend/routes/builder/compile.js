"use strict";

/**
 * routes/builder/compile.js
 * Mount: app.use("/api/builder/compile", require("./routes/builder/compile"))
 *
 * GET    /report/:reportId/status    pre-compile readiness check
 * POST   /report/:reportId           compile report to DOCX or PDF
 * GET    /report/:reportId/history   list compiled artifacts
 * GET    /report/:reportId/:compileId/download  download artifact
 */

const express    = require("express");
const path       = require("path");
const fs         = require("fs");
const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog } = require("../../utils/audit");
const logger     = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

const EXPORTS_DIR = path.join(__dirname, "../../exports");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

/* ── GET /report/:reportId/status ── readiness check ───────────────────────── */
router.get("/report/:reportId/status", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId } = req.params;
    if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const [reportRes, statsRes, missingRes] = await Promise.all([
      pool.query(`SELECT title, status, is_locked, primary_language FROM public.reports WHERE id = $1 AND deleted_at IS NULL`, [reportId]),
      pool.query(
        `SELECT
           COUNT(*)                                                AS total,
           COUNT(*) FILTER (WHERE status = 'APPROVED')            AS approved,
           COUNT(*) FILTER (WHERE status = 'LOCKED')              AS locked,
           COUNT(*) FILTER (WHERE status NOT IN ('APPROVED','LOCKED')) AS not_ready
         FROM public.report_sections WHERE report_id = $1 AND deleted_at IS NULL`, [reportId]
      ),
      pool.query(
        `SELECT s.title, s.status
         FROM public.report_sections s
         WHERE s.report_id = $1 AND s.status NOT IN ('APPROVED','LOCKED') AND s.deleted_at IS NULL
         ORDER BY s.order_index`, [reportId]
      ),
    ]);

    if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });

    const stats = statsRes.rows[0];
    const readiness = {
      total_sections: Number(stats.total),
      approved: Number(stats.approved) + Number(stats.locked),
      not_ready: Number(stats.not_ready),
      can_compile: Number(stats.not_ready) === 0,
      pending_sections: missingRes.rows,
    };

    return res.json({ success: true, data: { ...reportRes.rows[0], readiness } });
  } catch (err) {
    logger.error("compile GET status", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to check compile status" });
  }
});

/* ── POST /report/:reportId ── compile to DOCX / PDF ───────────────────────── */
router.post(
  "/report/:reportId",
  requireRole(["super_admin", "institute_admin", "publication_cell"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { reportId } = req.params;
      if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const {
        format = "DOCX",
        language = "en",
        include_toc = true,
        include_numbering = true,
        include_page_numbers = true,
        watermark = null,
        approved_only = true,
      } = req.body;

      const VALID_FORMATS = ["DOCX", "PDF", "HTML", "JSON"];
      if (!VALID_FORMATS.includes(format.toUpperCase()))
        return res.status(400).json({ success: false, message: "Invalid format" });

      // Fetch report + sections + blocks
      const reportRes = await pool.query(
        `SELECT r.*, i.institution_name
         FROM public.reports r
         JOIN public.institutions i ON i.institution_id = r.institution_id
         WHERE r.id = $1 AND r.deleted_at IS NULL`, [reportId]
      );
      if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });

      const report = reportRes.rows[0];

      const sectCondition = approved_only
        ? "AND s.status IN ('APPROVED','LOCKED')"
        : "AND s.deleted_at IS NULL";

      const sectRes = await pool.query(
        `WITH RECURSIVE tree AS (
           SELECT s.*, 0 AS depth FROM public.report_sections s
           WHERE s.report_id = $1 AND s.parent_id IS NULL ${sectCondition}
           UNION ALL
           SELECT s2.*, t.depth + 1 FROM public.report_sections s2
           JOIN tree t ON s2.parent_id = t.id ${sectCondition.replace("s.", "s2.")}
         )
         SELECT t.*, json_agg(
           json_build_object('id',b.id,'block_type',b.block_type,'content',b.content,'order_index',b.order_index)
           ORDER BY b.order_index
         ) FILTER (WHERE b.id IS NOT NULL) AS blocks
         FROM tree t
         LEFT JOIN public.section_blocks b ON b.section_id = t.id AND b.deleted_at IS NULL
         GROUP BY t.id, t.report_id, t.parent_id, t.title, t.description, t.order_index,
                  t.status, t.version_lock, t.locked_by, t.locked_at, t.workflow_template_id,
                  t.current_step_id, t.submission_deadline, t.review_deadline, t.source_template_section_id,
                  t.data_source_id, t.created_by, t.updated_by, t.created_at, t.updated_at, t.deleted_at, t.depth
         ORDER BY t.depth, t.order_index`, [reportId]
      );

      const sections = sectRes.rows;
      const includedSectionIds = sections.map(s => s.id);

      const compileOptions = {
        format: format.toUpperCase(),
        language,
        include_toc,
        include_numbering,
        include_page_numbers,
        watermark,
        approved_only,
      };

      // Build output filename
      const ts = Date.now();
      const fileName = `${report.title.replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.${format.toLowerCase()}`;
      const storagePath = path.join(EXPORTS_DIR, fileName);

      // Generate the document
      let fileSize = 0;
      if (format.toUpperCase() === "DOCX") {
        fileSize = await generateDocx(report, sections, storagePath, compileOptions);
      } else if (format.toUpperCase() === "PDF") {
        fileSize = await generatePdf(report, sections, storagePath, compileOptions);
      } else if (format.toUpperCase() === "JSON") {
        const json = JSON.stringify({ report, sections, compileOptions }, null, 2);
        fs.writeFileSync(storagePath, json);
        fileSize = Buffer.byteLength(json);
      } else {
        const html = buildHtml(report, sections, compileOptions);
        fs.writeFileSync(storagePath, html);
        fileSize = Buffer.byteLength(html);
      }

      // Record artifact
      const { rows: compRows } = await pool.query(
        `INSERT INTO public.compiled_reports
           (report_id, language, format, storage_path, file_size, compile_options, included_sections, compiled_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [reportId, language, format.toUpperCase(), storagePath, fileSize,
         JSON.stringify(compileOptions), includedSectionIds, req.user.userId]
      );

      await writeAuditLog(req, {
        actionType: "REPORT_COMPILED", entityType: "REPORT", entityId: reportId,
        newValue: compileOptions, status: "SUCCESS",
        message: `Report compiled as ${format.toUpperCase()} (${sections.length} sections)`,
      });

      return res.json({
        success: true,
        data: compRows[0],
        download_url: `/api/builder/compile/report/${reportId}/${compRows[0].id}/download`,
      });
    } catch (err) {
      logger.error("compile POST", { ...getLogContext(req), err: err.message });
      return res.status(500).json({ success: false, message: `Compilation failed: ${err.message}` });
    }
  }
);

/* ── GET /report/:reportId/history ── list compiled artifacts ───────────────── */
router.get("/report/:reportId/history", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId } = req.params;
    if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const { rows } = await pool.query(
      `SELECT cr.*, u.full_name AS compiled_by_name
       FROM public.compiled_reports cr
       LEFT JOIN public.users u ON u.id = cr.compiled_by
       WHERE cr.report_id = $1
       ORDER BY cr.compiled_at DESC`, [reportId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("compile GET history", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get compile history" });
  }
});

/* ── GET /report/:reportId/:compileId/download ── download artifact ─────────── */
router.get("/report/:reportId/:compileId/download", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId, compileId } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM public.compiled_reports WHERE id = $1 AND report_id = $2`, [compileId, reportId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Artifact not found" });

    const artifact = rows[0];
    if (!fs.existsSync(artifact.storage_path))
      return res.status(404).json({ success: false, message: "File not found on server" });

    const mimeMap = { DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      PDF: "application/pdf", HTML: "text/html", JSON: "application/json" };
    const ext  = artifact.format.toLowerCase();
    const mime = mimeMap[artifact.format] || "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(artifact.storage_path)}"`);
    res.setHeader("Content-Length", artifact.file_size || 0);

    fs.createReadStream(artifact.storage_path).pipe(res);
  } catch (err) {
    logger.error("compile GET download", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to download artifact" });
  }
});

/* ═══════════════════════ DOCUMENT GENERATION HELPERS ═══════════════════════ */

async function generateDocx(report, sections, outputPath, options) {
  // Uses the 'docx' npm package. Install: npm install docx
  let docx;
  try { docx = require("docx"); } catch {
    throw new Error("docx package not installed. Run: npm install docx");
  }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
          AlignmentType, BorderStyle, ImageRun, WidthType } = docx;

  const children = [];

  // Cover page
  children.push(
    new Paragraph({ text: report.institution_name || "", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: report.academic_year || "", alignment: AlignmentType.CENTER }),
    new Paragraph({ text: "" }),
  );

  // TOC placeholder
  if (options.include_toc) {
    children.push(new Paragraph({ text: "Table of Contents", heading: HeadingLevel.HEADING_2 }));
    let secNum = 0;
    for (const s of sections.filter(s => !s.parent_id)) {
      secNum++;
      children.push(new Paragraph({ text: `${secNum}. ${s.title}`, indent: { left: 0 } }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Sections
  let secNum = 0;
  for (const section of sections) {
    const level = section.depth === 0 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
    if (section.depth === 0) secNum++;
    const prefix = options.include_numbering ? `${secNum}. ` : "";
    children.push(new Paragraph({ text: `${prefix}${section.title}`, heading: level }));

    for (const block of (section.blocks || [])) {
      const c = block.content || {};
      switch (block.block_type) {
        case "PARAGRAPH":
          children.push(new Paragraph({ children: [new TextRun({ text: c.text || c.html?.replace(/<[^>]*>/g,"") || "" })] }));
          break;
        case "HEADING":
          children.push(new Paragraph({ text: c.text || "", heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][(c.level || 1) - 1] }));
          break;
        case "DIVIDER":
          children.push(new Paragraph({ border: { bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } } }));
          break;
        case "LIST":
          for (const item of (c.items || [])) {
            children.push(new Paragraph({ text: `• ${item}`, indent: { left: 360 } }));
          }
          break;
        case "KPI":
          children.push(new Paragraph({ children: [new TextRun({ text: `${c.label}: `, bold: true }), new TextRun({ text: `${c.value ?? "—"} ${c.unit || ""}` })] }));
          break;
        case "TABLE":
          if (c.columns && c.rows) {
            const tRows = [];
            tRows.push(new TableRow({
              children: c.columns.map(col => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: col.label || col.key, bold: true })] })] }))
            }));
            for (const row of c.rows) {
              tRows.push(new TableRow({
                children: c.columns.map(col => new TableCell({ children: [new Paragraph({ text: String(row[col.key] ?? "") })] }))
              }));
            }
            children.push(new Table({ rows: tRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          }
          break;
        default:
          // IMAGE, FILE, CHART, EMBED — text placeholder
          children.push(new Paragraph({ children: [new TextRun({ text: `[${block.block_type}]`, italics: true, color: "888888" })] }));
      }
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return buffer.length;
}

async function generatePdf(report, sections, outputPath, options) {
  // Uses puppeteer. Install: npm install puppeteer
  let puppeteer;
  try { puppeteer = require("puppeteer"); } catch {
    throw new Error("puppeteer not installed. Run: npm install puppeteer");
  }

  const html = buildHtml(report, sections, options);
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "25mm", right: "25mm" } });
  await browser.close();
  fs.writeFileSync(outputPath, pdfBuffer);
  return pdfBuffer.length;
}

function buildHtml(report, sections, options) {
  const sectionHtml = sections.map(s => {
    const hTag = s.depth === 0 ? "h1" : "h2";
    const blocksHtml = (s.blocks || []).map(b => {
      const c = b.content || {};
      switch (b.block_type) {
        case "PARAGRAPH": return `<p>${c.html || c.text || ""}</p>`;
        case "HEADING":   return `<h${c.level || 2}>${c.text || ""}</h${c.level || 2}>`;
        case "LIST":      return `<ul>${(c.items||[]).map(i=>`<li>${i}</li>`).join("")}</ul>`;
        case "DIVIDER":   return `<hr/>`;
        case "KPI":       return `<p><strong>${c.label}:</strong> ${c.value ?? "—"} ${c.unit||""}</p>`;
        case "TABLE":
          if (!c.columns) return "";
          return `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
            <thead><tr>${c.columns.map(col=>`<th>${col.label||col.key}</th>`).join("")}</tr></thead>
            <tbody>${(c.rows||[]).map(row=>`<tr>${c.columns.map(col=>`<td>${row[col.key]??""}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>`;
        default: return `<p><em>[${b.block_type}]</em></p>`;
      }
    }).join("\n");
    return `<section style="margin-bottom:24px"><${hTag}>${s.title}</${hTag}>${blocksHtml}</section>`;
  }).join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: 'Calibri', sans-serif; font-size: 11pt; color: #1a1a1a; }
    h1   { font-size: 18pt; border-bottom: 2px solid #333; padding-bottom: 4px; }
    h2   { font-size: 14pt; color: #1e3a5f; }
    table{ border-collapse: collapse; width: 100%; }
    th   { background: #1e3a5f; color: #fff; }
    td,th{ border: 1px solid #ccc; padding: 6px 10px; }
    hr   { border: none; border-top: 1px solid #ccc; }
    @page { margin: 20mm 25mm; }
  </style>
  </head><body>
  <h1 style="text-align:center">${report.title}</h1>
  <p style="text-align:center">${report.academic_year||""}</p>
  ${sectionHtml}
  </body></html>`;
}

module.exports = router;
