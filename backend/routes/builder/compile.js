"use strict";

/**
 * routes/builder/compile.js
 * Generates DOCX/PDF/HTML/JSON that visually matches ReportPreviewPage + wordDocUtils.jsx.
 *
 * GET  /report/:reportId/status
 * POST /report/:reportId
 * GET  /report/:reportId/history
 * GET  /report/:reportId/:compileId/download
 */

const express = require("express");
const path    = require("path");
const fs      = require("fs");
const http    = require("http");
const https   = require("https");

const { verifyToken, requireRole } = require("../../middleware/auth");
const { writeAuditLog }            = require("../../utils/audit");
const logger                       = require("../../utils/logger");
const { getLogContext }            = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

const EXPORTS_DIR  = path.join(__dirname, "../../exports");
const BACKEND_ROOT = path.join(__dirname, "../../");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

/* ─── Colors — exact match to wordDocUtils.jsx ───────────────────────────── */
const C = {
  primary:   "1F3864",   // Section H1, report title
  secondary: "2E4A7A",   // Section H2, content headings
  tertiary:  "374151",   // Section H3+
  body:      "111827",   // Body text
  gray:      "6B7280",   // Description, captions
  lightGray: "9CA3AF",   // Header/footer
  tblHead:   "D0CECE",   // Table header background
  tblAlt:    "F9FAFB",   // Alternating row
  divider:   "9CA3AF",
  border:    "D1D5DB",
  link:      "1D4ED8",
};

/* ═══════════════════════════════ SHARED HELPERS ═════════════════════════════ */

function flattenToDocumentOrder(sections) {
  const byId  = new Map(sections.map(s => [s.id, { ...s, _children: [] }]));
  const roots = [];
  for (const s of sections) {
    const node = byId.get(s.id);
    if (s.parent_id && byId.has(s.parent_id)) byId.get(s.parent_id)._children.push(node);
    else roots.push(node);
  }
  const result = [];
  function traverse(nodes) {
    nodes.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    for (const n of nodes) { result.push(n); traverse(n._children); }
  }
  traverse(roots);
  return result;
}

function buildSectionNumbers(sections) {
  const numbers = new Map();
  const byId    = new Map(sections.map(s => [s.id, { ...s, _children: [] }]));
  const roots   = [];
  for (const s of sections) {
    const node = byId.get(s.id);
    if (s.parent_id && byId.has(s.parent_id)) byId.get(s.parent_id)._children.push(node);
    else roots.push(node);
  }
  function traverse(nodes, prefix) {
    nodes.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    let i = 0;
    for (const n of nodes) {
      i++;
      const num = prefix ? `${prefix}.${i}` : String(i);
      numbers.set(n.id, num);
      traverse(n._children, num);
    }
  }
  traverse(roots, "");
  return numbers;
}

function escHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    if (url.startsWith("/uploads/")) {
      const p = path.join(BACKEND_ROOT, url);
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    }
    if (!url.startsWith("http")) return null;
    return await new Promise((resolve, reject) => {
      const proto = url.startsWith("https") ? https : http;
      const req   = proto.get(url, { timeout: 6000 }, res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end",  () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      });
      req.on("error",   reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    });
  } catch { return null; }
}

/* ═════════════════════════════ STATUS CHECK ═════════════════════════════════ */

router.get("/report/:reportId/status", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId } = req.params;
    if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

    const reportRes = await pool.query(
      `SELECT title FROM public.reports WHERE id = $1 AND deleted_at IS NULL`,
      [reportId]
    );
    if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });

    const sectRes = await pool.query(
      `SELECT s.id, s.title, s.status, s.parent_id, s.order_index, p.title AS parent_title
       FROM public.report_sections s
       LEFT JOIN public.report_sections p ON p.id = s.parent_id AND p.deleted_at IS NULL
       WHERE s.report_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.order_index`,
      [reportId]
    );

    const all      = sectRes.rows;
    const ready    = all.filter(s => ["APPROVED", "LOCKED"].includes(s.status));
    const notReady = all.filter(s => !["APPROVED", "LOCKED"].includes(s.status));

    return res.json({
      success: true,
      data: {
        report_title:       reportRes.rows[0].title,
        can_compile:        notReady.length === 0 && all.length > 0,
        total_count:        all.length,
        ready_count:        ready.length,
        not_ready_count:    notReady.length,
        not_ready_sections: notReady.map(s => ({
          id: s.id, title: s.title, status: s.status,
          parent_id: s.parent_id, parent_title: s.parent_title || null,
        })),
      },
    });
  } catch (err) {
    logger.error("compile GET status", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to check compile status" });
  }
});

/* ═════════════════════════════ COMPILE ══════════════════════════════════════ */

router.post(
  "/report/:reportId",
  requireRole(["super_admin", "institute_admin", "publication_cell"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      const { reportId } = req.params;
      if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });

      const {
        format             = "DOCX",
        language           = "en",
        include_toc        = true,
        include_numbering  = true,
        approved_only      = true,
      } = req.body;

      const fmt = format.toUpperCase();
      if (!["DOCX", "PDF", "HTML", "JSON"].includes(fmt))
        return res.status(400).json({ success: false, message: "Invalid format" });

      // Fetch report + branding
      const reportRes = await pool.query(
        `SELECT r.*, i.institution_name
         FROM public.reports r
         JOIN public.institutions i ON i.institution_id = r.institution_id
         WHERE r.id = $1 AND r.deleted_at IS NULL`,
        [reportId]
      );
      if (!reportRes.rows.length) return res.status(404).json({ success: false, message: "Report not found" });
      const report = reportRes.rows[0];

      // Pre-compile readiness check
      if (approved_only) {
        const { rows: bad } = await pool.query(
          `SELECT id, title FROM public.report_sections
           WHERE report_id = $1 AND deleted_at IS NULL AND status NOT IN ('APPROVED','LOCKED')`,
          [reportId]
        );
        if (bad.length > 0) {
          return res.status(422).json({
            success: false,
            message: `${bad.length} section(s) not yet approved.`,
            not_ready_sections: bad,
          });
        }
      }

      // Fetch sections + blocks via LATERAL (avoids GROUP BY column enumeration)
      const sf1 = approved_only ? "AND s.status IN ('APPROVED','LOCKED')"  : "AND s.deleted_at IS NULL";
      const sf2 = approved_only ? "AND s2.status IN ('APPROVED','LOCKED') AND s2.deleted_at IS NULL" : "AND s2.deleted_at IS NULL";

      const sectRes = await pool.query(
        `WITH RECURSIVE tree AS (
           SELECT s.*, 0 AS depth
           FROM public.report_sections s
           WHERE s.report_id = $1 AND s.parent_id IS NULL ${sf1}
           UNION ALL
           SELECT s2.*, t.depth + 1
           FROM public.report_sections s2
           JOIN tree t ON s2.parent_id = t.id ${sf2}
         )
         SELECT t.*, blk.blocks
         FROM tree t
         LEFT JOIN LATERAL (
           SELECT json_agg(
             json_build_object(
               'id', b.id, 'block_type', b.block_type,
               'content', b.content, 'order_index', b.order_index
             ) ORDER BY b.order_index
           ) AS blocks
           FROM public.section_blocks b
           WHERE b.section_id = t.id AND b.deleted_at IS NULL
         ) blk ON TRUE
         ORDER BY t.depth, t.order_index`,
        [reportId]
      );

      const sections = flattenToDocumentOrder(sectRes.rows);
      const opts     = { fmt, language, include_toc, include_numbering, approved_only };

      const ts       = Date.now();
      const safeName = report.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60);
      const ext      = fmt === "DOCX" ? "docx" : fmt === "PDF" ? "pdf" : fmt === "JSON" ? "json" : "html";
      const fileName = `${safeName}_${ts}.${ext}`;
      const outPath  = path.join(EXPORTS_DIR, fileName);

      let fileSize = 0;
      if (fmt === "DOCX") {
        fileSize = await generateDocx(report, sections, outPath, opts);
      } else if (fmt === "PDF") {
        fileSize = await generatePdf(report, sections, outPath, opts);
      } else if (fmt === "JSON") {
        const json = JSON.stringify({ report, sections, opts }, null, 2);
        fs.writeFileSync(outPath, json);
        fileSize = Buffer.byteLength(json);
      } else {
        const html = buildHtml(report, sections, opts);
        fs.writeFileSync(outPath, html);
        fileSize = Buffer.byteLength(html);
      }

      const { rows: compRows } = await pool.query(
        `INSERT INTO public.compiled_reports
           (report_id, language, format, storage_path, file_size, compile_options, included_sections, compiled_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [reportId, language, fmt, outPath, fileSize,
         JSON.stringify(opts), sections.map(s => s.id), req.user.userId]
      );

      await writeAuditLog(req, {
        actionType: "REPORT_COMPILED", entityType: "REPORT", entityId: reportId,
        newValue: opts, status: "SUCCESS",
        message: `Report compiled as ${fmt} (${sections.length} sections)`,
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

/* ═════════════════════════════ HISTORY ══════════════════════════════════════ */

router.get("/report/:reportId/history", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId } = req.params;
    if (!isUUID(reportId)) return res.status(400).json({ success: false, message: "Invalid report id" });
    const { rows } = await pool.query(
      `SELECT cr.*, u.full_name AS compiled_by_name
       FROM public.compiled_reports cr
       LEFT JOIN public.users u ON u.id = cr.compiled_by
       WHERE cr.report_id = $1 ORDER BY cr.compiled_at DESC`,
      [reportId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("compile GET history", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get compile history" });
  }
});

/* ═════════════════════════════ DOWNLOAD ════════════════════════════════════ */

router.get("/report/:reportId/:compileId/download", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { reportId, compileId } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM public.compiled_reports WHERE id = $1 AND report_id = $2`,
      [compileId, reportId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Artifact not found" });
    const artifact = rows[0];
    if (!fs.existsSync(artifact.storage_path))
      return res.status(404).json({ success: false, message: "File not found on server" });

    const mimeMap = {
      DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      PDF:  "application/pdf",
      HTML: "text/html",
      JSON: "application/json",
    };
    res.setHeader("Content-Type", mimeMap[artifact.format] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(artifact.storage_path)}"`);
    res.setHeader("Content-Length", artifact.file_size || 0);
    fs.createReadStream(artifact.storage_path).pipe(res);
  } catch (err) {
    logger.error("compile GET download", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to download artifact" });
  }
});

/* ══════════════════════════ DOCX GENERATION ════════════════════════════════ */
/* Styling mirrors wordDocUtils.jsx → WordBlock + SectionHeader + A4Page      */

async function generateDocx(report, sections, outPath, opts) {
  let docx;
  try { docx = require("docx"); } catch { throw new Error("docx package not installed"); }

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, ImageRun, WidthType, ShadingType,
    HeadingLevel, TabStopType, TabStopPosition, Header, Footer,
    PageNumber, NumberFormat, UnderlineType, LeaderType,
    HorizontalPositionRelativeFrom, HorizontalPositionAlign,
    VerticalPositionRelativeFrom, VerticalPositionAlign,
    TextWrappingType, TextWrappingSide,
  } = docx;

  // When a background image is present, switch to white text so it shows over the image
  const hasBg = !!report.bg_image_url;
  const C = {
    primary:   hasBg ? "FFFFFF" : "1F3864",
    secondary: hasBg ? "F0F0F0" : "2E4A7A",
    tertiary:  hasBg ? "E0E0E0" : "374151",
    body:      hasBg ? "FFFFFF" : "111827",
    gray:      hasBg ? "DDDDDD" : "6B7280",
    lightGray: hasBg ? "CCCCCC" : "9CA3AF",
    tblHead:   hasBg ? "444444" : "D0CECE",
    tblAlt:    hasBg ? "222222" : "F9FAFB",
    divider:   hasBg ? "AAAAAA" : "9CA3AF",
    border:    hasBg ? "888888" : "D1D5DB",
    link:      hasBg ? "93C5FD" : "1D4ED8",
  };

  const sectionNumbers = opts.include_numbering ? buildSectionNumbers(sections) : new Map();

  /* ── Inline style → formatting properties ── */
  function cssColorToHex(val) {
    if (!val) return null;
    val = val.trim().toLowerCase();
    if (val === "inherit" || val === "transparent" || val === "initial") return null;
    if (val.startsWith("#")) {
      const h = val.slice(1);
      if (h.length === 3) return (h[0]+h[0]+h[1]+h[1]+h[2]+h[2]).toUpperCase();
      if (h.length === 6) return h.toUpperCase();
      return null;
    }
    const rgb = val.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgb) return [rgb[1],rgb[2],rgb[3]].map(n => parseInt(n).toString(16).padStart(2,"0")).join("").toUpperCase();
    const named = {
      black:"000000", white:"FFFFFF", red:"FF0000", blue:"0000FF", green:"008000",
      yellow:"FFFF00", orange:"FFA500", purple:"800080", pink:"FFC0CB",
      gray:"808080", grey:"808080", cyan:"00FFFF", magenta:"FF00FF",
      teal:"008080", navy:"000080", maroon:"800000", lime:"00FF00",
      brown:"A52A2A", violet:"EE82EE", aqua:"00FFFF", silver:"C0C0C0",
      darkred:"8B0000", darkblue:"00008B", darkgreen:"006400",
      lightyellow:"FFFFE0", lightblue:"ADD8E6", lightgreen:"90EE90",
    };
    return named[val] || null;
  }

  function cssSizeToHalfPt(val) {
    if (!val) return null;
    val = val.trim();
    const px = val.match(/^([\d.]+)px$/i);  if (px)  return Math.round(parseFloat(px[1])  * 1.5);   // px→pt→½pt
    const pt = val.match(/^([\d.]+)pt$/i);  if (pt)  return Math.round(parseFloat(pt[1])  * 2);
    const em = val.match(/^([\d.]+)r?em$/i); if (em) return Math.round(parseFloat(em[1]) * 12 * 2);
    const ns = { "xx-small":14,"x-small":16,small:20,medium:24,large:28,"x-large":36,"xx-large":48 };
    return ns[val.toLowerCase()] || null;
  }

  function parseStyle(styleStr) {
    const p = {};
    if (!styleStr) return p;
    for (const pair of styleStr.split(";")) {
      const ci = pair.indexOf(":");
      if (ci < 0) continue;
      const k = pair.slice(0, ci).trim().toLowerCase();
      const v = pair.slice(ci + 1).trim();
      if (k === "color")            p.color    = cssColorToHex(v);
      if (k === "background-color") p.bgColor  = cssColorToHex(v);
      if (k === "font-size")        p.fontSize = cssSizeToHalfPt(v);
      if (k === "font-weight" && (v === "bold" || parseInt(v) >= 600)) p.bold   = true;
      if (k === "font-style"  && (v === "italic" || v === "oblique"))  p.italic = true;
      if (k === "text-decoration") {
        if (v.includes("underline"))    p.underline = true;
        if (v.includes("line-through")) p.strike    = true;
      }
      if (k === "vertical-align") {
        if (v === "super") p.superScript = true;
        if (v === "sub")   p.subScript   = true;
      }
    }
    return p;
  }

  function tagStyle(tag) {
    const m = tag.match(/style=["']([^"']*)["']/i);
    return parseStyle(m ? m[1] : "");
  }

  /* ── HTML-to-TextRun parser — preserves all inline formatting ── */
  function parseHtmlRuns(html, baseBold = false, baseItalic = false) {
    if (!html) return [new TextRun({ text: "" })];
    const runs = [];

    function makeRun(text, fmt) {
      if (!text) return;
      runs.push(new TextRun({
        text,
        bold:       fmt.bold    || undefined,
        italics:    fmt.italic  || undefined,
        size:       fmt.size    || 22,
        color:      fmt.color   || C.body,
        font:       "Times New Roman",
        underline:  fmt.underline  ? { type: UnderlineType.SINGLE } : undefined,
        strike:     fmt.strike     || undefined,
        superScript: fmt.superScript || undefined,
        subScript:   fmt.subScript   || undefined,
        shading:    fmt.bgColor
          ? { type: ShadingType.CLEAR, fill: fmt.bgColor, color: "auto" }
          : undefined,
      }));
    }

    function walk(str, fmt) {
      while (str.length > 0) {
        const lt = str.indexOf("<");
        if (lt < 0) { makeRun(decodeEntities(str), fmt); return; }
        if (lt > 0)   makeRun(decodeEntities(str.slice(0, lt)), fmt);

        const gt = str.indexOf(">", lt);
        if (gt < 0) return;
        const tag  = str.slice(lt + 1, gt).trim();
        str        = str.slice(gt + 1);
        const name = tag.replace(/^\//, "").split(/[\s/]/)[0].toLowerCase();

        // Self-closing / void
        if (name === "br" || tag === "br/" || tag === "br") {
          runs.push(new TextRun({ text: "\n", font: "Times New Roman" }));
          continue;
        }
        if (tag.startsWith("/")) continue;
        if (["img", "hr", "input", "meta", "link"].includes(name)) continue;

        const closeTag = `</${name}>`;
        const closeIdx = str.toLowerCase().indexOf(closeTag);
        if (closeIdx < 0) continue;   // unclosed tag — skip

        const inner = str.slice(0, closeIdx);
        str         = str.slice(closeIdx + closeTag.length);
        const ts    = tagStyle(tag);

        // Build child fmt by merging tag semantics + inline style
        const child = {
          bold:        fmt.bold        || ts.bold        || ["strong","b"].includes(name),
          italic:      fmt.italic      || ts.italic      || ["em","i"].includes(name),
          underline:   fmt.underline   || ts.underline   || name === "u",
          strike:      fmt.strike      || ts.strike      || ["s","del","strike"].includes(name),
          superScript: fmt.superScript || ts.superScript || name === "sup",
          subScript:   fmt.subScript   || ts.subScript   || name === "sub",
          color:       ts.color  || (name === "a" ? C.link : fmt.color),
          bgColor:     ts.bgColor || (name === "mark" ? "FFFF00" : fmt.bgColor),
          size:        ts.fontSize || fmt.size,
        };
        walk(inner, child);
      }
    }

    const cleaned = html
      .replace(/<\/p>/gi, "<br/>").replace(/<p[^>]*>/gi, "")
      .replace(/<\/div>/gi, "<br/>").replace(/<div[^>]*>/gi, "")
      .replace(/<\/li>/gi, "<br/>").replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/h[1-6]>/gi, "<br/>").replace(/<h[1-6][^>]*>/gi, "");

    walk(cleaned, { bold: baseBold, italic: baseItalic });
    return runs.length > 0 ? runs : [new TextRun({ text: "", size: 22 })];
  }

  /* ── Split HTML into Paragraphs, preserving per-paragraph alignment ── */
  function htmlToParagraphs(html, extraProps = {}) {
    if (!html) return [new Paragraph({ children: [new TextRun({ text: "", size: 22 })], spacing: { after: 80 }, ...extraProps })];

    // Capture <p> tag attributes (for alignment) then split on paragraph boundaries
    const lines = html
      .replace(/<\/p>/gi, "|||")
      .replace(/<p([^>]*)>/gi, (_, attrs) => {
        const sm = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i);
        const cm = attrs.match(/ql-align-(center|right|justify)/i);
        const al = (sm || cm) ? (sm ? sm[1] : cm[1]) : "";
        return al ? `<<${al}>>` : "";
      })
      .replace(/<\/div>/gi, "|||")
      .replace(/<div([^>]*)>/gi, (_, attrs) => {
        const sm = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i);
        return sm ? `<<${sm[1]}>>` : "";
      })
      .split("|||");

    const paras = [];
    for (const line of lines) {
      const am = line.match(/^<<(\w+)>>/);
      const content = am ? line.slice(am[0].length) : line;
      const alignStr = am ? am[1] : "";
      const alignment =
        alignStr === "center"  ? AlignmentType.CENTER :
        alignStr === "right"   ? AlignmentType.RIGHT  :
        alignStr === "justify" ? AlignmentType.BOTH   :
        undefined;

      const trimmed = content.replace(/<br\s*\/?>/gi, "\n").trim();
      if (!trimmed && paras.length > 0) continue;

      for (const part of trimmed.split("\n")) {
        const runs = parseHtmlRuns(part);
        paras.push(new Paragraph({
          children: runs,
          alignment,
          spacing: { after: 80, line: 432 },
          ...extraProps,
        }));
      }
    }
    return paras.length > 0 ? paras
      : [new Paragraph({ children: [new TextRun({ text: "", size: 22 })], spacing: { after: 80 }, ...extraProps })];
  }

  /* ── Section heading paragraph — matches SectionHeader component ── */
  function sectionHeadingPara(section) {
    const depth = section.depth || 0;
    const num   = sectionNumbers.get(section.id);
    const label = opts.include_numbering && num ? `${num}.  ${section.title}` : section.title;

    if (depth === 0) {
      return [
        new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 30, color: C.primary })],
          border: { bottom: { color: C.primary, space: 1, style: BorderStyle.SINGLE, size: 12 } },
          spacing: { before: 240, after: 120 },
          pageBreakBefore: undefined,
        }),
        ...(section.description ? [new Paragraph({
          children: [new TextRun({ text: section.description, italics: true, size: 18, color: C.gray })],
          spacing: { after: 80 },
        })] : []),
      ];
    }
    if (depth === 1) {
      return [
        new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 24, color: C.secondary })],
          spacing: { before: 180, after: 80 },
        }),
        ...(section.description ? [new Paragraph({
          children: [new TextRun({ text: section.description, italics: true, size: 18, color: C.gray })],
          spacing: { after: 60 },
        })] : []),
      ];
    }
    return [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 22, color: C.tertiary })],
        indent: { left: 180 },
        spacing: { before: 120, after: 60 },
      }),
      ...(section.description ? [new Paragraph({
        children: [new TextRun({ text: section.description, italics: true, size: 16, color: C.gray })],
        indent: { left: 180 },
        spacing: { after: 60 },
      })] : []),
    ];
  }

  /* ── TABLE builder — handles both manual and form_import formats ── */
  function buildTable(c) {
    const isFormImport = c.source === "form_import" || (c.columns && !Array.isArray(c.headers));
    let headers, dataRows;

    if (isFormImport) {
      const cols = c.columns || [];
      if (!cols.length) return null;
      headers  = cols.map(col => col.label || col.key);
      dataRows = (c.rows || []).map(row => cols.map(col => String(row[col.key] ?? "")));
    } else {
      headers  = c.headers || [];
      if (!headers.length) return null;
      dataRows = (c.rows || []).map(row => Array.isArray(row) ? row.map(v => String(v ?? "")) : headers.map(() => ""));
    }

    const colCount = headers.length;
    const colWidth = Math.floor(9020 / colCount);

    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(h => new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.tblHead },
        children: [new Paragraph({
          children: [new TextRun({ text: String(h), bold: true, size: 20, color: C.body })],
          spacing: { after: 0 },
        })],
      })),
    });

    const bodyRows = dataRows.map((row, ri) => new TableRow({
      children: row.map(val => new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: C.tblAlt } : undefined,
        children: [new Paragraph({
          children: [new TextRun({ text: val, size: 20, color: C.body })],
          spacing: { after: 0 },
        })],
      })),
    }));

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top:          { style: BorderStyle.SINGLE, size: 4, color: C.border },
        bottom:       { style: BorderStyle.SINGLE, size: 4, color: C.border },
        left:         { style: BorderStyle.SINGLE, size: 4, color: C.border },
        right:        { style: BorderStyle.SINGLE, size: 4, color: C.border },
        insideH:      { style: BorderStyle.SINGLE, size: 4, color: C.border },
        insideV:      { style: BorderStyle.SINGLE, size: 4, color: C.border },
      },
      rows: [headerRow, ...bodyRows],
    });
  }

  /* ── KPI data table (for kpi_import blocks) ── */
  function buildKpiTable(data) {
    const cols   = data.columns || [];
    const series = data.series  || [];
    const totals = data.totals  || [];
    if (!cols.length || !series.length) return null;

    const allCols  = ["Series", ...cols];
    const colWidth = Math.floor(9020 / allCols.length);

    const headerRow = new TableRow({
      tableHeader: true,
      children: allCols.map(h => new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.tblHead },
        children: [new Paragraph({
          children: [new TextRun({ text: String(h), bold: true, size: 20, color: C.body })],
          spacing: { after: 0 },
        })],
      })),
    });

    const dataRows = series.map((s, ri) => new TableRow({
      children: [
        new TableCell({
          shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: C.tblAlt } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: s.display_name || s.name || "", bold: true, size: 20 })],
            spacing: { after: 0 },
          })],
        }),
        ...(s.values || []).map(v => new TableCell({
          shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: C.tblAlt } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: String(v ?? ""), size: 20 })],
            spacing: { after: 0 },
          })],
        })),
      ],
    }));

    const rows = [headerRow, ...dataRows];
    if (totals.length) {
      rows.push(new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: C.tblHead },
            children: [new Paragraph({
              children: [new TextRun({ text: "Total", bold: true, size: 20 })],
              spacing: { after: 0 },
            })],
          }),
          ...totals.map(v => new TableCell({
            shading: { type: ShadingType.CLEAR, fill: C.tblHead },
            children: [new Paragraph({
              children: [new TextRun({ text: String(v ?? ""), bold: true, size: 20 })],
              spacing: { after: 0 },
            })],
          })),
        ],
      }));
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        right: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        insideH: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        insideV: { style: BorderStyle.SINGLE, size: 4, color: C.border },
      },
      rows,
    });
  }

  /* ── Block → array of DOCX elements ── */
  async function blockToElements(block) {
    // Defensively handle content: PostgreSQL JSONB can arrive as a parsed object,
    // but some editors double-encode it as a JSON string.
    let c = block.content;
    if (typeof c === "string") {
      try { c = JSON.parse(c); } catch { c = { html: c }; }
    }
    c = c || {};
    const els  = [];
    const gap  = () => new Paragraph({ text: "", spacing: { after: 60 } });

    switch (block.block_type) {

      case "PARAGRAPH": {
        const raw = c.html || c.text || c.body || c.value
          || (typeof c.content === "string" ? c.content : "")
          || (typeof block.content === "string" ? block.content : "")
          || "";
        if (raw) {
          els.push(...htmlToParagraphs(raw));
        } else {
          // Empty paragraph spacer so sections don't collapse
          els.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 60 } }));
        }
        break;
      }

      case "HEADING": {
        const lvl   = Math.max(1, Math.min(3, c.level || 2));
        const sizes = [36, 28, 24];  // 18pt, 14pt, 12pt
        const colors = [C.primary, C.secondary, C.tertiary];
        const hasBorder = lvl === 1;
        els.push(new Paragraph({
          children: [new TextRun({ text: c.text || "", bold: true, size: sizes[lvl - 1], color: colors[lvl - 1] })],
          spacing: { before: lvl === 1 ? 180 : lvl === 2 ? 140 : 100, after: lvl === 1 ? 80 : 60 },
          border: hasBorder ? { bottom: { color: C.primary, space: 1, style: BorderStyle.SINGLE, size: 8 } } : undefined,
        }));
        break;
      }

      case "DIVIDER":
        els.push(new Paragraph({
          border: { bottom: { color: C.divider, space: 1, style: BorderStyle.SINGLE, size: 4 } },
          spacing: { before: 80, after: 80 },
        }));
        break;

      case "LIST": {
        const items   = c.items || [];
        const ordered = !!c.ordered;
        items.forEach((item, i) => {
          els.push(new Paragraph({
            children: [
              new TextRun({ text: ordered ? `${i + 1}.  ` : "•  ", bold: false, size: 22, color: C.body }),
              new TextRun({ text: String(item || ""), size: 22, color: C.body }),
            ],
            indent: { left: 360 },
            spacing: { after: 40 },
          }));
        });
        break;
      }

      case "KPI": {
        if (c.source === "kpi_import") {
          // KPI import block
          els.push(new Paragraph({
            children: [new TextRun({ text: c.title || "KPI Chart", bold: true, size: 28, color: C.secondary })],
            spacing: { after: 60 },
          }));
          if (c.caption || c.compile_options?.caption) {
            els.push(new Paragraph({
              children: [new TextRun({ text: c.compile_options?.caption || c.caption, italics: true, size: 18, color: C.gray })],
              spacing: { after: 60 },
            }));
          }
          if (c.data) {
            const tbl = buildKpiTable(c.data);
            if (tbl) { els.push(tbl); els.push(gap()); }
          }
        } else {
          // Simple KPI: label + value + unit
          const title = (c.kpi_title || c.label || "KPI");
          const val   = c.value ?? c.kpi_value ?? "—";
          const unit  = c.unit  || c.kpi_unit  || "";
          els.push(new Paragraph({
            children: [
              new TextRun({ text: `${title}: `, bold: true, size: 22, color: C.primary }),
              new TextRun({ text: `${val} ${unit}`.trim(), size: 22, color: C.body }),
            ],
            spacing: { after: 80 },
          }));
        }
        break;
      }

      case "TABLE": {
        const tbl = buildTable(c);
        if (tbl) { els.push(tbl); els.push(gap()); }
        break;
      }

      case "IMAGE": {
        if (c.url) {
          const buf = await fetchImageBuffer(c.url);
          if (buf) {
            try {
              els.push(new Paragraph({
                children: [new ImageRun({ data: buf, transformation: { width: 500, height: 300 } })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
              }));
            } catch { /* skip broken image */ }
          }
          if (c.caption) {
            els.push(new Paragraph({
              children: [new TextRun({ text: c.caption, italics: true, size: 18, color: C.gray })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
            }));
          }
        }
        break;
      }

      case "IMAGE_GRID": {
        const gridCols = c.cols || [];
        if (!gridCols.length) break;

        const colCount = gridCols.length;
        const totalW   = 9020;
        const cellW    = Math.floor(totalW / colCount);
        const imgPxW   = Math.max(80, Math.floor(520 / colCount));
        const imgPxH   = Math.round(imgPxW * 0.72);

        const bufs = await Promise.all(
          gridCols.map(col => (col.url ? fetchImageBuffer(col.url) : Promise.resolve(null)))
        );

        const gridCells = gridCols.map((col, i) => {
          const cellChildren = [];
          if (bufs[i]) {
            try {
              cellChildren.push(new Paragraph({
                children: [new ImageRun({ data: bufs[i], transformation: { width: imgPxW, height: imgPxH } })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 20 },
              }));
            } catch { /* skip broken image */ }
          } else {
            cellChildren.push(new Paragraph({
              children: [new TextRun({ text: "[Image]", size: 18, color: C.gray })],
              alignment: AlignmentType.CENTER,
            }));
          }
          if (col.caption) {
            cellChildren.push(new Paragraph({
              children: [new TextRun({ text: col.caption, italics: true, size: 16, color: C.gray })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            }));
          }
          if (!cellChildren.length) {
            cellChildren.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
          }
          const noBorder = { style: "none", size: 0, color: "FFFFFF" };
          return new TableCell({
            width: { size: cellW, type: WidthType.DXA },
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
            children: cellChildren,
          });
        });

        const noBorder = { style: "none", size: 0, color: "FFFFFF" };
        els.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: noBorder, bottom: noBorder, left: noBorder,
            right: noBorder, insideH: noBorder, insideV: noBorder,
          },
          rows: [new TableRow({ children: gridCells })],
        }));
        els.push(gap());
        break;
      }

      case "FILE":
        els.push(new Paragraph({
          children: [
            new TextRun({ text: "📎  Attachment: ", bold: true, size: 20, color: C.body }),
            new TextRun({ text: c.name || c.url || "File", size: 20, color: C.link }),
          ],
          spacing: { before: 40, after: 60 },
          shading: { type: ShadingType.CLEAR, fill: "EFF6FF" },
        }));
        break;

      default:
        break;
    }

    return els;
  }

  /* ── Fetch branding assets upfront ── */
  const [coverBuf, logoBuf, bgBuf] = await Promise.all([
    fetchImageBuffer(report.cover_image_url),
    fetchImageBuffer(report.logo_url),
    fetchImageBuffer(report.bg_image_url),
  ]);

  /* ── Build document children (title page + TOC + sections) ── */
  const children = [];

  // Report title block (matches A4Page + first-page block in wordDocUtils)
  children.push(new Paragraph({
    children: [new TextRun({ text: report.institution_name || "", bold: true, size: 24, color: C.primary })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: report.title, bold: true, size: 40, color: C.primary })],
    alignment: AlignmentType.CENTER,
    border: { bottom: { color: C.primary, space: 1, style: BorderStyle.SINGLE, size: 16 } },
    spacing: { after: 80 },
  }));
  if (report.report_type || report.academic_year) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: [report.report_type, report.academic_year].filter(Boolean).join("   ·   "),
        size: 18, color: C.gray, italics: true,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }));
  }

  /* ── Estimate approximate page numbers per section for TOC ── */
  function estimateBlockPageUnits(b) {
    const bc = (typeof b.content === "string" ? { html: b.content } : b.content) || {};
    switch (b.block_type) {
      case "PARAGRAPH": {
        const text = (bc.html || bc.text || "").replace(/<[^>]+>/g, " ");
        const words = text.split(/\s+/).filter(Boolean).length;
        return Math.max(0.3, words / 90);
      }
      case "HEADING":    return 0.4;
      case "IMAGE":      return 3.5;
      case "IMAGE_GRID": return 4.0;
      case "TABLE":      return 1.5 + ((bc.rows || []).length * 0.25);
      case "LIST":       return 0.4 + ((bc.items || []).length * 0.15);
      case "KPI":        return 0.6;
      case "DIVIDER":    return 0.1;
      case "FILE":       return 0.3;
      default:           return 0.4;
    }
  }

  function buildTocPageNums(sectionList) {
    const nums = new Map();
    const UNITS_PER_PAGE = 5;
    let page = 3; // p1 = title, p2 = TOC, p3 = first section

    for (const s of sectionList) {
      const depth = s.depth || 0;
      if (depth === 0) {
        nums.set(s.id, page);
        const units = (s.blocks || []).reduce((sum, b) => sum + estimateBlockPageUnits(b), 0.5);
        page += Math.max(1, Math.round(units / UNITS_PER_PAGE));
      } else {
        // Subsection — start on same page as parent (rough but meaningful)
        const parentPage = nums.get(s.parent_id) || page;
        nums.set(s.id, parentPage);
      }
    }
    return nums;
  }

  // TOC — separate page, dotted leaders with estimated page numbers
  if (opts.include_toc) {
    const dotLeader  = (LeaderType && LeaderType.DOT) || "dot";
    const tocPageMap = buildTocPageNums(sections);

    // "TABLE OF CONTENTS" heading — starts on its own page
    children.push(new Paragraph({
      children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 28, color: C.primary })],
      alignment: AlignmentType.CENTER,
      border: { bottom: { color: C.primary, space: 1, style: BorderStyle.SINGLE, size: 8 } },
      spacing: { before: 0, after: 240 },
      pageBreakBefore: true,
    }));

    for (const s of sections) {
      const depth  = s.depth || 0;
      const num    = sectionNumbers.get(s.id);
      const label  = opts.include_numbering && num ? `${num}   ${s.title}` : s.title;
      const indent = depth * 360;
      const isH1   = depth === 0;
      const pgNum  = String(tocPageMap.get(s.id) || "");

      children.push(new Paragraph({
        children: [
          new TextRun({ text: label, size: isH1 ? 22 : 20, bold: isH1, color: isH1 ? C.primary : C.body }),
          new TextRun({ text: "\t", size: isH1 ? 22 : 20 }),
          new TextRun({ text: pgNum, size: isH1 ? 22 : 20, bold: isH1, color: isH1 ? C.primary : C.body }),
        ],
        indent: { left: indent },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: dotLeader }],
        spacing: { after: isH1 ? 90 : 55 },
      }));
    }

    // Spacer — page break before first section is handled in the section loop below
    children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 60 } }));
  }

  // Sections + blocks
  // When TOC is present the first section also needs a fresh page (after the TOC).
  // Without TOC the first section follows the title page directly (no extra break).
  const hasTOC = !!opts.include_toc;
  let firstRoot = true;
  for (const section of sections) {
    const isRoot = (section.depth || 0) === 0;

    // Page break before every root section; when there's a TOC, include the first root too
    if (isRoot && (!firstRoot || hasTOC)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "" })],
        pageBreakBefore: true,
        spacing: { after: 0, before: 0 },
      }));
    }
    if (isRoot) firstRoot = false;

    const headingParas = sectionHeadingPara(section);

    children.push(...headingParas);

    for (const block of (section.blocks || [])) {
      const els = await blockToElements(block);
      children.push(...els);
    }

    children.push(new Paragraph({ text: "", spacing: { after: 60 } }));
  }

  // ── Background image: floating behind text in header so it repeats on every page ──
  let bgHeaderPara = null;
  if (bgBuf) {
    try {
      bgHeaderPara = new Paragraph({
        children: [
          new ImageRun({
            data: bgBuf,
            transformation: { width: 794, height: 1122 }, // A4 at 96 DPI
            floating: {
              horizontalPosition: {
                relative: (HorizontalPositionRelativeFrom && HorizontalPositionRelativeFrom.PAGE) || "page",
                align:    (HorizontalPositionAlign    && HorizontalPositionAlign.LEFT)           || "left",
              },
              verticalPosition: {
                relative: (VerticalPositionRelativeFrom && VerticalPositionRelativeFrom.PAGE) || "page",
                align:    (VerticalPositionAlign        && VerticalPositionAlign.TOP)          || "top",
              },
              wrap: {
                type: (TextWrappingType && TextWrappingType.NONE) || "none",
                side: (TextWrappingSide && TextWrappingSide.BOTH_SIDES) || "bothSides",
              },
              behindDocument: true,
              allowOverlap:   true,
            },
          }),
        ],
        spacing: { after: 0, before: 0 },
      });
    } catch { bgHeaderPara = null; }
  }

  // ── Header: report meta + title ──
  const hdrMeta = [report.report_type, report.academic_year].filter(Boolean).join("  ");
  const docHeader = new Header({
    children: [
      ...(bgHeaderPara ? [bgHeaderPara] : []),
      new Paragraph({
        children: [
          new TextRun({ text: hdrMeta, size: 15, color: C.lightGray }),
          new TextRun({ text: "\t", size: 15 }),
          new TextRun({ text: report.title, size: 15, color: C.lightGray }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { color: C.border, space: 1, style: BorderStyle.SINGLE, size: 2 } },
        spacing: { after: 0 },
      }),
    ],
  });

  // ── Footer: institution name left · page number center · logo right ──
  const centerTabPos = Math.round(TabStopPosition.MAX / 2);
  const docFooter = new Footer({
    children: [
      new Paragraph({
        children: [
          // Left: institution name
          new TextRun({ text: report.institution_name || "", size: 15, color: C.lightGray }),
          // Tab to center
          new TextRun({ text: "\t", size: 15 }),
          // Center: page number only (just "1", "2" — no total)
          new TextRun({ children: [PageNumber.CURRENT], size: 18, bold: true, color: C.lightGray }),
          // Tab to right
          new TextRun({ text: "\t", size: 15 }),
          // Right: logo image (bigger) or fallback empty
          ...(logoBuf
            ? (() => { try { return [new ImageRun({ data: logoBuf, transformation: { width: 96, height: 36 } })]; } catch { return []; } })()
            : []
          ),
        ],
        tabStops: [
          { type: TabStopType.CENTER, position: centerTabPos },
          { type: TabStopType.RIGHT,  position: TabStopPosition.MAX },
        ],
        border: { top: { color: C.border, space: 1, style: BorderStyle.SINGLE, size: 2 } },
        spacing: { before: 0 },
      }),
    ],
  });

  // ── Build DOCX sections ──
  // Section 1 (optional): full-page cover image with no margins/header/footer
  // Section 2: main content (title, TOC, sections) with header + footer
  const docSections = [];

  if (coverBuf) {
    try {
      docSections.push({
        properties: {
          page: { margin: { top: 0, right: 0, bottom: 0, left: 0 } },
        },
        // Omit headers/footers entirely so the cover page has none
        children: [
          new Paragraph({
            children: [new ImageRun({ data: coverBuf, transformation: { width: 794, height: 1122 } })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
        ],
      });
    } catch (e) {
      logger.error("compile DOCX cover section", { err: e.message });
    }
  }

  docSections.push({
    properties: {
      page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
    },
    headers: { default: docHeader },
    footers: { default: docFooter },
    children,
  });

  const doc = new Document({
    creator:  report.institution_name || "PragatiMitra",
    title:    report.title,
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 22, color: C.body },
          paragraph: { spacing: { line: 432, lineRule: "auto" } },
        },
      },
    },
    sections: docSections,
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  return buffer.length;
}

/* ══════════════════════════ PDF GENERATION ═════════════════════════════════ */

async function generatePdf(report, sections, outPath, opts) {
  let puppeteer;
  try { puppeteer = require("puppeteer"); } catch { throw new Error("puppeteer not installed"); }

  // Convert local/remote images to data URLs so puppeteer can embed them
  async function toDataUrl(url) {
    if (!url) return null;
    const buf = await fetchImageBuffer(url);
    if (!buf) return null;
    const lower = url.toLowerCase();
    const mime  = lower.endsWith(".png") ? "image/png"
                : lower.endsWith(".gif") ? "image/gif"
                : lower.endsWith(".webp") ? "image/webp"
                : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  const [logoDataUrl, bgDataUrl, coverDataUrl] = await Promise.all([
    toDataUrl(report.logo_url),
    toDataUrl(report.bg_image_url),
    toDataUrl(report.cover_image_url),
  ]);

  const html    = buildHtml(report, sections, opts, { logoDataUrl, bgDataUrl, coverDataUrl });
  const hdrMeta = [report.report_type, report.academic_year].filter(Boolean).join("  ");
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:8px;font-family:'Times New Roman',Times,serif;color:#9ca3af;
                    width:100%;padding:6px 25mm 4px;box-sizing:border-box;
                    display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;">
          <span>${escHtml(hdrMeta)}</span>
          <span>${escHtml(report.title || "")}</span>
        </div>`,
      footerTemplate: `
        <div style="font-size:8px;font-family:'Times New Roman',Times,serif;color:#374151;
                    width:100%;padding:4px 25mm 6px;box-sizing:border-box;
                    display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
                    border-top:1px solid #e5e7eb;">
          <span style="text-align:left;">${escHtml(report.institution_name || "")}</span>
          <span style="text-align:center;font-weight:700;font-size:9px;" class="pageNumber"></span>
          <span style="text-align:right;">
            ${logoDataUrl
              ? `<img src="${logoDataUrl}" style="height:24px;max-width:130px;object-fit:contain;vertical-align:middle;">`
              : ""
            }
          </span>
        </div>`,
      margin: { top: "22mm", bottom: "22mm", left: "20mm", right: "20mm" },
    });
    fs.writeFileSync(outPath, pdfBuf);
    return pdfBuf.length;
  } finally {
    await browser.close();
  }
}

/* ══════════════════════════ HTML BUILDER ════════════════════════════════════ */
/* CSS mirrors wordDocUtils.jsx + ReportPreviewPage.jsx exactly               */

function buildHtml(report, sections, opts, assets = {}) {
  const { logoDataUrl = null, bgDataUrl = null, coverDataUrl = null } = assets;
  const hasBg = !!(bgDataUrl || report.bg_image_url);
  const sectionNumbers = opts.include_numbering ? buildSectionNumbers(sections) : new Map();

  /* ── Block → HTML, matching WordBlock component ── */
  function blockHtml(block) {
    const c = block.content || {};
    switch (block.block_type) {

      case "PARAGRAPH":
        return `<div class="para">${c.html || escHtml(c.text || "")}</div>`;

      case "HEADING": {
        const lvl = Math.max(1, Math.min(3, c.level || 2));
        return `<div class="ch${lvl}">${escHtml(c.text || "")}</div>`;
      }

      case "DIVIDER":
        return `<hr class="divider">`;

      case "LIST": {
        const tag   = c.ordered ? "ol" : "ul";
        const items = (c.items || []).map(i => `<li>${escHtml(i)}</li>`).join("");
        return `<${tag} class="blk-list">${items}</${tag}>`;
      }

      case "KPI": {
        if (c.source === "kpi_import") {
          const { columns = [], series = [], totals = [] } = c.data || {};
          const cap = c.compile_options?.caption || c.caption || "";
          let out = `<div class="kpi-block">`;
          out += `<p class="kpi-title">${escHtml(c.title || "KPI Chart")}</p>`;
          if (cap) out += `<p class="kpi-cap">${escHtml(cap)}</p>`;
          if (c.svg_data) out += `<div class="kpi-svg">${c.svg_data}</div>`;
          if (columns.length && series.length) {
            out += `<table class="data-tbl"><thead><tr><th>Series</th>${columns.map(col => `<th>${escHtml(col)}</th>`).join("")}</tr></thead><tbody>`;
            series.forEach((s, ri) => {
              out += `<tr class="${ri % 2 === 1 ? "alt" : ""}"><td><strong>${escHtml(s.display_name || s.name)}</strong></td>${(s.values || []).map(v => `<td>${escHtml(String(v ?? ""))}</td>`).join("")}</tr>`;
            });
            if (totals.length) {
              out += `<tr class="tot"><td><strong>Total</strong></td>${totals.map(v => `<td><strong>${escHtml(String(v ?? ""))}</strong></td>`).join("")}</tr>`;
            }
            out += `</tbody></table>`;
          }
          out += `</div>`;
          return out;
        }
        // Simple KPI
        const title = c.kpi_title || c.label || "KPI";
        const val   = String(c.value ?? c.kpi_value ?? "—");
        const unit  = c.unit || c.kpi_unit || "";
        return `<p class="kpi-simple"><strong>${escHtml(title)}:</strong> ${escHtml(val)} ${escHtml(unit)}</p>`;
      }

      case "TABLE": {
        const isForm = c.source === "form_import" || (c.columns && !Array.isArray(c.headers));
        if (isForm) {
          const cols = c.columns || [];
          if (!cols.length) return "";
          const head = `<thead><tr>${cols.map(col => `<th>${escHtml(col.label || col.key)}</th>`).join("")}</tr></thead>`;
          const body = `<tbody>${(c.rows || []).map((row, ri) =>
            `<tr class="${ri % 2 === 1 ? "alt" : ""}">${cols.map(col => `<td>${escHtml(String(row[col.key] ?? ""))}</td>`).join("")}</tr>`
          ).join("")}</tbody>`;
          return `<table class="data-tbl">${head}${body}</table>`;
        }
        const hdrs = c.headers || [];
        if (!hdrs.length) return "";
        const head = `<thead><tr>${hdrs.map(h => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>`;
        const body = `<tbody>${(c.rows || []).map((row, ri) => {
          const cells = Array.isArray(row) ? row : hdrs.map(() => "");
          return `<tr class="${ri % 2 === 1 ? "alt" : ""}">${cells.map(v => `<td>${escHtml(String(v ?? ""))}</td>`).join("")}</tr>`;
        }).join("")}</tbody>`;
        return `<table class="data-tbl">${head}${body}</table>`;
      }

      case "IMAGE":
        if (!c.url) return "";
        return `<div class="img-wrap">
          <img src="${escHtml(c.url)}" alt="${escHtml(c.caption || "")}" style="width:${c.widthPct ?? 100}%;border-radius:3px;border:1px solid #e5e7eb">
          ${c.caption ? `<div class="img-cap">${escHtml(c.caption)}</div>` : ""}
        </div>`;

      case "IMAGE_GRID": {
        const cols = c.cols || [];
        if (!cols.length) return "";
        const items = cols.map(col => `
          <div>
            ${col.url ? `<img src="${escHtml(col.url)}" style="width:100%;border-radius:3px;border:1px solid #e5e7eb">` : `<div class="img-placeholder">[Image]</div>`}
            ${col.caption ? `<div class="img-cap">${escHtml(col.caption)}</div>` : ""}
          </div>`).join("");
        return `<div class="img-grid" style="grid-template-columns:repeat(${cols.length},1fr)">${items}</div>`;
      }

      case "FILE":
        return `<div class="file-blk">📎 <a href="${escHtml(c.url || "#")}">${escHtml(c.name || c.url || "Attachment")}</a></div>`;

      default:
        return "";
    }
  }

  /* ── Section header HTML, matching SectionHeader component ── */
  function sectionHeaderHtml(section) {
    const depth = section.depth || 0;
    const num   = sectionNumbers.get(section.id);
    const label = opts.include_numbering && num ? `${num}.&nbsp;&nbsp;${escHtml(section.title)}` : escHtml(section.title);
    const cls   = depth === 0 ? "sec-h1" : depth === 1 ? "sec-h2" : "sec-h3";
    const indent = depth >= 2 ? ` style="padding-left:10px"` : "";
    const desc   = section.description ? `<div class="sec-desc">${escHtml(section.description)}</div>` : "";
    return `<div class="${cls}"${indent}>${label}${desc}</div>`;
  }

  /* ── Table of contents with dotted leaders and page numbers ── */
  let tocHtml = "";
  if (opts.include_toc) {
    // Re-use the same page estimator from DOCX path
    function estUnits(b) {
      const bc = (typeof b.content === "string" ? { html: b.content } : b.content) || {};
      switch (b.block_type) {
        case "PARAGRAPH": {
          const words = (bc.html || bc.text || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
          return Math.max(0.3, words / 90);
        }
        case "IMAGE": return 3.5; case "IMAGE_GRID": return 4.0;
        case "TABLE": return 1.5 + ((bc.rows || []).length * 0.25);
        case "LIST": return 0.4 + ((bc.items || []).length * 0.15);
        default: return 0.4;
      }
    }
    const tocMap = new Map();
    let pg = 3;
    for (const s of sections) {
      if ((s.depth || 0) === 0) {
        tocMap.set(s.id, pg);
        pg += Math.max(1, Math.round((s.blocks || []).reduce((a, b) => a + estUnits(b), 0.5) / 5));
      } else {
        tocMap.set(s.id, tocMap.get(s.parent_id) || pg);
      }
    }

    const rows = sections.map(s => {
      const depth  = s.depth || 0;
      const num    = sectionNumbers.get(s.id);
      const label  = opts.include_numbering && num ? `${num}&nbsp;&nbsp;${escHtml(s.title)}` : escHtml(s.title);
      const pgNum  = tocMap.get(s.id) || "";
      const indent = depth * 22;
      const fw     = depth === 0 ? "700" : "400";
      const color  = depth === 0 ? "#1F3864" : "#374151";
      const sz     = depth === 0 ? "11pt" : "10pt";
      return `<div class="toc-row" style="padding-left:${indent}px;font-weight:${fw};color:${color};font-size:${sz}">
        <span class="toc-label">${label}</span>
        <span class="toc-dots"></span>
        <span class="toc-pg">${pgNum}</span>
      </div>`;
    }).join("");
    tocHtml = `<div class="toc-page">
      <div class="sec-h1" style="text-align:center;margin-top:0;margin-bottom:24px">TABLE OF CONTENTS</div>
      ${rows}
    </div>`;
  }

  /* ── Section content ── */
  const contentHtml = sections.map((s, si) => {
    const isRoot = (s.depth || 0) === 0;
    const pb     = isRoot && si > 0 ? "page-break-before:always;" : "";
    const blocks = (s.blocks || []).map(blockHtml).join("\n");
    return `<div class="section" style="${pb}">${sectionHeaderHtml(s)}${blocks}</div>`;
  }).join("\n");

  /* ── Cover image — full-page first page (placed OUTSIDE page-wrapper) ── */
  const coverSrc = coverDataUrl || (report.cover_image_url ? escHtml(report.cover_image_url) : null);
  const coverHtml = coverSrc
    ? `<div class="cover-page" style="page-break-after:always;width:100%;height:100vh;overflow:hidden;line-height:0;margin:0;padding:0;">
        <img src="${coverSrc}" style="width:100%;height:100%;object-fit:cover;display:block;">
       </div>`
    : "";

  /* ── Background image overlay — low opacity, all pages ── */
  const bgSrc = bgDataUrl || null; // only embed if data URL is available (PDF); HTML export skips
  const bgOverlayHtml = bgSrc
    ? `<div style="position:fixed;top:0;left:0;right:0;bottom:0;
                   background-image:url('${bgSrc}');background-size:cover;
                   background-repeat:no-repeat;background-position:center;
                   opacity:0.08;z-index:0;pointer-events:none;"></div>`
    : "";

  /* ── Title page ── */
  const logoSrc = logoDataUrl || (report.logo_url ? escHtml(report.logo_url) : null);
  const titleHtml = `
    <div class="title-page">
      ${logoSrc ? `<img src="${logoSrc}" style="height:52px;float:right">` : ""}
      <div style="clear:both"></div>
      <div style="font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:13pt;font-weight:700;color:#1F3864;text-align:center;margin-bottom:8px">
        ${escHtml(report.institution_name || "")}
      </div>
      <div class="title-main">${escHtml(report.title)}</div>
      ${(report.report_type || report.academic_year)
        ? `<div class="title-sub">${escHtml([report.report_type, report.academic_year].filter(Boolean).join("   ·   "))}</div>`
        : ""}
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(report.title)}</title>
<style>
/* ── Base ── */
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt; color: #111827; margin: 0; padding: 20px;
  background: #808080;
}
.page-wrapper { max-width: 794px; margin: 0 auto; background: #fff; padding: 72px; box-shadow: 0 3px 16px rgba(0,0,0,.45); margin-bottom: 24px; }

/* ── Report title page ── */
.title-page { page-break-after: always; text-align: center; padding: 40px 0 60px; }
.title-main { font-size: 20pt; font-weight: 700; color: #1F3864; margin-bottom: 10px; }
.title-sub  { font-size: 9pt; color: #6b7280; font-style: italic; }

/* ── TOC ── */
.toc-page { page-break-after: always; padding-bottom: 24px; }
.toc-row  { display: flex; align-items: baseline; margin-bottom: 7px; }
.toc-label { white-space: nowrap; flex-shrink: 0; }
.toc-dots  { flex: 1; border-bottom: 1px dotted #374151; margin: 0 6px 3px; min-width: 20px; }
.toc-pg    { white-space: nowrap; flex-shrink: 0; }

/* ── Section headings — exact match to SectionHeader component ── */
.sec-h1 {
  font-size: 15pt; font-weight: 800; color: #1F3864;
  border-bottom: 2px solid #1F3864; padding-bottom: 6px;
  margin-top: 20px; margin-bottom: 10px;
}
.sec-h2 { font-size: 12pt; font-weight: 700; color: #2E4A7A; margin-top: 14px; margin-bottom: 7px; }
.sec-h3 { font-size: 11pt; font-weight: 700; color: #374151; margin-top: 10px; margin-bottom: 5px; }
.sec-desc { font-size: 9pt; font-weight: 400; color: #6b7280; margin-top: 3px; font-style: italic; }

/* ── Content headings (HEADING block, matches WordBlock lvlStyle) ── */
.ch1 { font-size: 18px; font-weight: 700; color: #1F3864; border-bottom: 1.5px solid #1F3864; padding-bottom: 3px; margin-bottom: 10px; margin-top: 18px; }
.ch2 { font-size: 14px; font-weight: 700; color: #2E4A7A; margin-bottom: 6px; margin-top: 14px; }
.ch3 { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px; margin-top: 10px; }

/* ── Paragraph ── */
.para { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.8; color: #111827; margin-bottom: 10px; word-break: break-word; }

/* ── List ── */
.blk-list { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #111827; padding-left: 20px; line-height: 1.75; margin: 4px 0 10px; }
.blk-list li { margin-bottom: 2px; }

/* ── Divider ── */
hr.divider { border: none; border-top: 1px solid #9ca3af; margin: 10px 0 12px; }

/* ── Tables ── */
.data-tbl { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 10pt; }
.data-tbl th { background: #D0CECE; font-weight: 700; padding: 4px 7px; text-align: left; border: 1px solid #9ca3af; color: #111827; }
.data-tbl td { border: 1px solid #9ca3af; padding: 4px 7px; color: #111827; vertical-align: top; }
.data-tbl tr.alt td { background: #f9fafb; }
.data-tbl tr.tot td { background: #D0CECE; font-weight: 700; }

/* ── KPI ── */
.kpi-block { margin: 8px 0 12px; }
.kpi-title { font-size: 14px; font-weight: 700; color: #2E4A7A; margin: 0 0 4px; }
.kpi-cap   { font-size: 10pt; color: #6b7280; font-style: italic; margin: 0 0 8px; }
.kpi-svg   { max-width: 100%; overflow: hidden; margin-bottom: 10px; }
.kpi-svg svg { max-width: 100%; height: auto; }
.kpi-simple { font-size: 11pt; margin: 8px 0; }

/* ── Images ── */
.img-wrap { margin: 8px 0 12px; }
.img-wrap img { border-radius: 3px; border: 1px solid #e5e7eb; }
.img-cap { font-size: 9pt; color: #6b7280; text-align: center; margin-top: 3px; font-style: italic; }
.img-grid { display: grid; gap: 8px; margin: 8px 0 12px; }
.img-placeholder { height: 60px; background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 10px; }

/* ── File attachment ── */
.file-blk { font-size: 10pt; margin: 6px 0 10px; padding: 5px 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 2px; }
.file-blk a { color: #1d4ed8; text-decoration: underline; }

/* ── Page/print ── */
@page :first { margin: 0; size: A4 portrait; }
@page { margin: 20mm 25mm; size: A4 portrait; }
@media print {
  body { background: white; padding: 0; }
  .cover-page { width: 100vw !important; height: 100vh !important; margin: 0 !important; }
  .page-wrapper { box-shadow: none; margin: 0; padding: 0; }
  .section[style*="page-break-before"] { page-break-before: always; }
  .toc-page { page-break-after: always; }
}
${hasBg ? `
/* ── Background image: white text so content is visible over the image ── */
body, .page-wrapper,
.para, .blk-list, .kpi-simple, .sec-desc, .img-cap, .kpi-cap, .file-blk,
.data-tbl td, .data-tbl th, .title-main, .title-sub,
.toc-label, .toc-pg {
  color: #ffffff !important;
}
.sec-h1, .sec-h2, .sec-h3, .ch1, .ch2, .ch3 {
  color: #ffffff !important;
  border-color: rgba(255,255,255,0.4) !important;
}
.sec-h1 { border-bottom-color: rgba(255,255,255,0.5) !important; }
.ch1    { border-bottom-color: rgba(255,255,255,0.4) !important; }
.toc-dots { border-bottom-color: rgba(255,255,255,0.4) !important; }
.data-tbl tr.alt td { background: rgba(255,255,255,0.07) !important; }
.data-tbl th        { background: rgba(255,255,255,0.15) !important; }
` : ""}
</style>
</head>
<body style="position:relative;">
${bgOverlayHtml}
${coverHtml}
<div class="page-wrapper" style="position:relative;z-index:1;">
${titleHtml}
${tocHtml}
${contentHtml}
</div>
</body>
</html>`;
}

module.exports = router;
