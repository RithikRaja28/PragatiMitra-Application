/**
 * sectionToDocx.js  —  Section → professional .docx
 *
 * Document structure:
 *   Page 1     : Cover  (stock cover photo + title block)
 *   Page 2     : Table of Contents (manual dot-leader entries)
 *   Page 3+    : All report sections as H1 headings; current section has full content
 *   Every page : Header — report title right-aligned (+ faded watermark behind content)
 *                Footer — page number centred · logo on right
 *
 * Stock images (TESTING ONLY — swap for real assets later):
 *   STOCK_COVER_URL  — landscape photo for cover page
 *   STOCK_BG_URL     — greyscale photo used as per-page watermark (canvas-faded)
 *   Logo             — canvas-generated AIIA badge (no CORS needed)
 *
 * Binary image note:
 *   Always use fetch().arrayBuffer() for images, never .text() — UTF-8 decoding
 *   corrupts bytes 0x80–0xFF with U+FFFD, breaking every JPEG/PNG.
 */

import {
  Document, Packer,
  Paragraph, TextRun,
  HeadingLevel,
  Table, TableRow, TableCell,
  BorderStyle, AlignmentType, WidthType,
  ImageRun, UnderlineType, ShadingType,
  Header, Footer, PageNumber,
  TabStopType, LeaderType,
  PageBreak,
} from "docx";

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════ */
const FONT        = "Calibri";
const COLOR_TEXT  = "111827";
const COLOR_H1    = "1F3864";
const COLOR_H2    = "2E4A7A";
const COLOR_H3    = "374151";
const COLOR_MUTED = "6B7280";
const COLOR_LINK  = "2563EB";
const COLOR_TH_BG = "D0CECE";

const PX_TO_DU   = 100 / 96;      // 1 docx-unit = 1/100 inch;  96 px = 1 inch
const MAX_IMG_DU = 600;
const PT   = (n)  => n * 2;       // half-points
const TWIP = (i)  => Math.round(i * 1440);
const SP   = (before = 0, after = 160) =>
  ({ spacing: { before, after, line: 276, lineRule: "auto" } });

/* A4 dimensions in docx units (1/100 inch) */
const A4_W_DU = 827;
const A4_H_DU = 1169;

/* Stock images for testing — replace with real assets later */
const STOCK_COVER_URL = "https://picsum.photos/seed/pmcover/840/560";
const STOCK_BG_URL    = "https://picsum.photos/seed/pmdoc/840/1188?grayscale";

/* ══════════════════════════════════════════════════════════════════
   IMAGE PIPELINE
══════════════════════════════════════════════════════════════════ */
function detectImageType(url = "", ct = "") {
  ct = ct.toLowerCase();
  if (ct.includes("png"))  return "png";
  if (ct.includes("gif"))  return "gif";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg"))  return "svg";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  return { jpg:"jpg", jpeg:"jpg", png:"png", gif:"gif", webp:"webp", svg:"svg" }[ext] || "jpg";
}

function getImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Cannot load: ${url}`));
    img.src     = url;
  });
}

async function fetchImageAsArrayBuffer(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { arrayBuffer: await res.arrayBuffer(), type: detectImageType(url, res.headers.get("content-type") || "") };
}

async function fetchImageData(url) {
  if (!url) return null;
  try {
    const [{ arrayBuffer, type }, dims] = await Promise.all([
      fetchImageAsArrayBuffer(url),
      getImageDimensions(url),
    ]);
    return { arrayBuffer, type, naturalW: dims.width, naturalH: dims.height };
  } catch { return null; }
}

function makeImageRun(d, maxDU = MAX_IMG_DU) {
  const sc = (d.naturalW * PX_TO_DU) > maxDU ? maxDU / (d.naturalW * PX_TO_DU) : 1;
  return new ImageRun({
    data: d.arrayBuffer,
    type: d.type,
    transformation: { width: Math.round(d.naturalW * PX_TO_DU * sc), height: Math.round(d.naturalH * PX_TO_DU * sc) },
  });
}

/** Rasterize an inline SVG markup string (e.g. a KPI chart export) to a PNG ArrayBuffer for docx embedding. */
async function svgToPngData(svgMarkup, scale = 2) {
  if (!svgMarkup) return null;
  try {
    const wMatch = svgMarkup.match(/width="(\d+(?:\.\d+)?)"/);
    const hMatch = svgMarkup.match(/height="(\d+(?:\.\d+)?)"/);
    const fallbackW = wMatch ? parseFloat(wMatch[1]) : 600;
    const fallbackH = hMatch ? parseFloat(hMatch[1]) : 360;

    const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    const dims = await new Promise((resolve, reject) => {
      img.onload  = () => resolve({
        width:  img.naturalWidth  || fallbackW,
        height: img.naturalHeight || fallbackH,
      });
      img.onerror = () => reject(new Error("Cannot rasterize SVG"));
      img.src     = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(dims.width  * scale);
    canvas.height = Math.round(dims.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const arrayBuffer = await new Promise(res => canvas.toBlob(b => b.arrayBuffer().then(res), "image/png"));
    return { arrayBuffer, type: "png", naturalW: dims.width, naturalH: dims.height };
  } catch {
    return null;
  }
}

function imgPlaceholder(caption, alt) {
  return new Paragraph({
    children: [new TextRun({ text: `[Image${caption||alt ? ": "+(caption||alt) : ""}]`, italics: true, color: COLOR_MUTED, font: FONT })],
    alignment: AlignmentType.CENTER, ...SP(80, 80),
  });
}

/* ─── Canvas helpers (no CORS risk — runs in browser) ──────────────── */

/** Fetch image, paint it on canvas with reduced opacity, return PNG buffer */
async function toFadedPng(url, opacity = 0.09) {
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, 0, 0);
    const ab = await new Promise(res => canvas.toBlob(b => b.arrayBuffer().then(res), "image/png"));
    return { arrayBuffer: ab, type: "png", naturalW: img.naturalWidth, naturalH: img.naturalHeight };
  } catch { return null; }
}

/** Generate an AIIA logo badge via canvas (no network needed) */
async function makeLogoCanvas() {
  try {
    const W = 180, H = 52;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    /* dark-navy background */
    ctx.fillStyle = "#1F3864";
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.fill();
    /* white text */
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("AIIA", W * 0.36, H / 2);
    /* thin right divider */
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(W * 0.6, 10, 1, H - 20);
    /* subtitle */
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText("Reports", W * 0.8, H / 2);
    const ab = await new Promise(res => canvas.toBlob(b => b.arrayBuffer().then(res), "image/png"));
    return { arrayBuffer: ab, type: "png", naturalW: W, naturalH: H };
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   HTML → TextRun[]
══════════════════════════════════════════════════════════════════ */
function walkNode(node, s = {}) {
  if (node.nodeType === 3) {
    const t = node.textContent;
    return t ? [new TextRun({ text: t, font: FONT, ...s })] : [];
  }
  if (node.nodeType !== 1) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return [new TextRun({ text: "", break: 1 })];
  const ns = { ...s };
  if (tag === "strong" || tag === "b") ns.bold    = true;
  if (tag === "em"     || tag === "i") ns.italics = true;
  if (tag === "u")  ns.underline = { type: UnderlineType.SINGLE };
  if (tag === "s"   || tag === "del") ns.strike = true;
  const style = node.getAttribute?.("style") || "";
  const col = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,6})/)?.[1];
  if (col)  ns.color = col.replace("#", "");
  const fsz = style.match(/font-size\s*:\s*([\d.]+)(?:px|pt)/)?.[1];
  if (fsz)  ns.size  = Math.round(parseFloat(fsz) * 2);
  const runs = [];
  for (const c of node.childNodes) runs.push(...walkNode(c, ns));
  return runs;
}
function htmlToRuns(html) {
  if (!html?.trim()) return [new TextRun({ text: "", font: FONT })];
  const dom  = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const runs = [];
  for (const c of dom.body.childNodes) runs.push(...walkNode(c));
  return runs.length ? runs : [new TextRun({ text: "", font: FONT })];
}

/* ══════════════════════════════════════════════════════════════════
   HTML → multiple docx Paragraphs
   Handles block elements (<p>, <div>, <br>, <ul>, <ol>, <h1>–<h6>)
   so rich paragraph content doesn't collapse into one flat block.
══════════════════════════════════════════════════════════════════ */
function htmlToDocxParagraphs(html, defaultSpacing = SP(0, 120)) {
  if (!html?.trim()) return [new Paragraph({ children: [new TextRun({ text: "", font: FONT })], ...defaultSpacing })];
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = [];

  function pushRuns(node, baseStyle = {}) {
    const runs = [];
    for (const c of node.childNodes) runs.push(...walkNode(c, baseStyle));
    return runs;
  }

  function processNode(node) {
    if (node.nodeType === 3) {
      // bare text node at body level
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t) out.push(new Paragraph({ children: [new TextRun({ text: t, font: FONT })], ...defaultSpacing }));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();

    if (tag === "br") {
      out.push(new Paragraph({ children: [new TextRun({ text: "", font: FONT })], spacing: { before: 0, after: 40 } }));
      return;
    }

    if (tag === "p" || tag === "div") {
      const runs = pushRuns(node);
      if (runs.length) out.push(new Paragraph({ children: runs, ...defaultSpacing }));
      else out.push(new Paragraph({ children: [new TextRun({ text: "", font: FONT })], spacing: { before: 0, after: 60 } }));
      return;
    }

    if (tag === "ul" || tag === "ol") {
      let idx = 1;
      for (const li of node.childNodes) {
        if (li.nodeName.toLowerCase() !== "li") continue;
        const liRuns = pushRuns(li);
        const prefix = tag === "ol" ? `${idx}.\t` : `•\t`;
        out.push(new Paragraph({
          children: [new TextRun({ text: prefix, font: FONT }), ...liRuns],
          indent: { left: TWIP(0.35), hanging: TWIP(0.2) },
          ...SP(0, 80),
        }));
        idx++;
      }
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const lvl = parseInt(tag[1]);
      const cfgMap = {
        1: { heading: HeadingLevel.HEADING_2, color: COLOR_H1, size: PT(16) },
        2: { heading: HeadingLevel.HEADING_3, color: COLOR_H2, size: PT(13) },
        3: { heading: HeadingLevel.HEADING_3, color: COLOR_H3, size: PT(12) },
      };
      const cfg = cfgMap[Math.min(lvl, 3)] || cfgMap[2];
      const runs = pushRuns(node, { bold: true, color: cfg.color, size: cfg.size, font: FONT });
      out.push(new Paragraph({ heading: cfg.heading, children: runs, spacing: { before: TWIP(0.15), after: TWIP(0.08) } }));
      return;
    }

    // any other element — process children
    for (const child of node.childNodes) processNode(child);
  }

  for (const child of dom.body.childNodes) processNode(child);
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: "", font: FONT })], ...defaultSpacing })];
}

/* ══════════════════════════════════════════════════════════════════
   BLOCK → docx elements
══════════════════════════════════════════════════════════════════ */
async function blockToElements(block) {
  const c = block.content || {};
  switch (block.block_type) {

    case "PARAGRAPH":
      return htmlToDocxParagraphs(c.html || c.text || "");

    case "HEADING": {
      const cfg = ({
        1: { heading: HeadingLevel.HEADING_2, color: COLOR_H1, size: PT(16) },
        2: { heading: HeadingLevel.HEADING_3, color: COLOR_H2, size: PT(13) },
        3: { heading: HeadingLevel.HEADING_3, color: COLOR_H3, size: PT(12) },
      })[c.level || 2] || { heading: HeadingLevel.HEADING_3, color: COLOR_H2, size: PT(13) };
      // Pass heading styles as base into walkNode so every TextRun inherits them
      const baseStyle = { bold: true, color: cfg.color, size: cfg.size, font: FONT };
      const dom  = new DOMParser().parseFromString(`<body>${c.text || "Heading"}</body>`, "text/html");
      const runs = [];
      for (const child of dom.body.childNodes) runs.push(...walkNode(child, baseStyle));
      return [new Paragraph({
        heading:  cfg.heading,
        children: runs.length ? runs : [new TextRun({ text: c.text || "Heading", ...baseStyle })],
        spacing:  { before: TWIP(0.15), after: TWIP(0.08) },
      })];
    }

    case "LIST": {
      const items = Array.isArray(c.items) ? c.items : [];
      /* Convert stored px to docx half-points: 1px ≈ 0.75pt → ×2 = 1.5 half-pts */
      const halfPt = Math.round((c.fontSize || 11) * 1.5);
      const color  = (c.fontColor || "#111827").replace("#", "");
      return items.map((item, i) =>
        new Paragraph({
          children: [new TextRun({ text: c.ordered ? `${i+1}.\t${item}` : `•\t${item}`, font: FONT, size: halfPt, color })],
          indent: { left: TWIP(0.35), hanging: TWIP(0.2) },
          ...SP(0, 80),
        })
      );
    }

    case "TABLE": {
      const isFormImport = c.source === "form_import";
      const cols    = isFormImport ? (c.columns || []) : null;
      const headers = isFormImport ? cols.map(col => col.label || col.key) : (c.headers || []);
      const rows    = c.rows || [];
      const bd  = { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" };
      const bds = { top: bd, bottom: bd, left: bd, right: bd };
      const cm  = { top: 80, bottom: 80, left: 120, right: 120 };
      const trs = [];
      if (headers.length) {
        trs.push(new TableRow({ tableHeader: true, children: headers.map(h =>
          new TableCell({ borders: bds, margins: cm, shading: { type: ShadingType.SOLID, color: COLOR_TH_BG },
            children: [new Paragraph({ children: [new TextRun({ text: h || "", bold: true, font: FONT })] })] })
        )}));
      }
      rows.forEach((row, ri) => {
        const cells = isFormImport
          ? cols.map(col => row?.[col.key])
          : (Array.isArray(row) ? row : []);
        trs.push(new TableRow({ children: cells.map(cell =>
          new TableCell({ borders: bds, margins: cm,
            shading: ri%2===1 ? { type: ShadingType.SOLID, color: "F9FAFB" } : undefined,
            children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ""), font: FONT })] })] })
        )}));
      });
      if (!trs.length) return [];
      return [
        new Table({ rows: trs, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: "" })], ...SP(120, 120) }),
      ];
    }

    case "KPI": {
      const opts      = c.compile_options || {};
      const showChart = opts.show_chart      !== false;
      const showTable = opts.show_data_table !== false;
      const data      = c.data || {};
      const columns   = data.columns || [];
      const series    = data.series  || [];
      const totals    = data.totals  || [];
      const el = [];

      if (showChart && c.svg_data) {
        const d = await svgToPngData(c.svg_data);
        el.push(d
          ? new Paragraph({ children: [makeImageRun(d)], alignment: AlignmentType.CENTER, ...SP(80, 40) })
          : imgPlaceholder(opts.caption, c.title));
      }

      if (showTable && columns.length) {
        const bd  = { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" };
        const bds = { top: bd, bottom: bd, left: bd, right: bd };
        const cm  = { top: 80, bottom: 80, left: 120, right: 120 };
        const trs = [new TableRow({ tableHeader: true, children: ["Series", ...columns].map(h =>
          new TableCell({ borders: bds, margins: cm, shading: { type: ShadingType.SOLID, color: COLOR_TH_BG },
            children: [new Paragraph({ children: [new TextRun({ text: String(h), bold: true, font: FONT })] })] })
        )})];
        series.forEach((s, si) => {
          const cells = [s.display_name || s.name, ...(s.values || [])];
          trs.push(new TableRow({ children: cells.map(cell =>
            new TableCell({ borders: bds, margins: cm,
              shading: si % 2 === 1 ? { type: ShadingType.SOLID, color: "F9FAFB" } : undefined,
              children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ""), font: FONT })] })] })
          )}));
        });
        if (totals.length) {
          trs.push(new TableRow({ children: ["Total", ...totals].map(cell =>
            new TableCell({ borders: bds, margins: cm,
              children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ""), bold: true, font: FONT })] })] })
          )}));
        }
        el.push(new Table({ rows: trs, width: { size: 100, type: WidthType.PERCENTAGE } }));
      }

      if (opts.caption) el.push(new Paragraph({ children: [new TextRun({ text: opts.caption, italics: true, color: COLOR_MUTED, font: FONT, size: PT(9) })], alignment: AlignmentType.CENTER, ...SP(0, 120) }));
      el.push(new Paragraph({ children: [new TextRun({ text: "" })], ...SP(0, 120) }));
      return el;
    }

    case "DIVIDER":
      return [new Paragraph({ children: [new TextRun({ text: "" })], thematicBreak: true, ...SP(160, 160) })];

    case "IMAGE": {
      if (!c.url) return [imgPlaceholder(c.caption, c.alt)];
      const d = await fetchImageData(c.url);
      const el = [];
      el.push(d
        ? new Paragraph({ children: [makeImageRun(d)], alignment: { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT }[c.align] || AlignmentType.CENTER, ...SP(80, 40) })
        : imgPlaceholder(c.caption, c.alt)
      );
      if (c.caption) el.push(new Paragraph({ children: [new TextRun({ text: c.caption, italics: true, color: COLOR_MUTED, font: FONT, size: PT(9) })], alignment: AlignmentType.CENTER, ...SP(0, 120) }));
      return el;
    }

    case "IMAGE_GRID": {
      const cols = Array.isArray(c.cols) ? c.cols : [];
      if (!cols.length) return [];
      const dataArr   = await Promise.all(cols.map(col => fetchImageData(col.url)));
      const perCellDU = Math.floor((MAX_IMG_DU - (cols.length - 1) * 40) / cols.length);
      const noBd  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
      const noBds = { top: noBd, bottom: noBd, left: noBd, right: noBd, insideH: noBd, insideV: noBd };
      const cells = cols.map((col, i) => {
        const d = dataArr[i];
        return new TableCell({ borders: noBds, margins: { top: 0, bottom: 0, left: 60, right: 60 }, children: [
          d ? new Paragraph({ children: [makeImageRun(d, perCellDU)], alignment: AlignmentType.CENTER })
            : imgPlaceholder(col.caption, col.alt),
          ...(col.caption ? [new Paragraph({ children: [new TextRun({ text: col.caption, italics: true, color: COLOR_MUTED, font: FONT, size: PT(9) })], alignment: AlignmentType.CENTER })] : []),
        ]});
      });
      return [
        new Table({ rows: [new TableRow({ children: cells })], width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: "" })], ...SP(80, 80) }),
      ];
    }

    case "FILE":
      return [new Paragraph({ children: [
        new TextRun({ text: "Attachment: ", bold: true, font: FONT }),
        new TextRun({ text: c.name || c.url || "[File]", underline: { type: UnderlineType.SINGLE }, color: COLOR_LINK, font: FONT }),
      ], ...SP(80, 80) })];

    default: return [];
  }
}

/* ══════════════════════════════════════════════════════════════════
   COVER PAGE
   Includes a stock photo (testing) above the title block.
══════════════════════════════════════════════════════════════════ */
function buildCoverElements(reportTitle, ayear, reportType, sectionTitle, dateStr, coverImgData) {
  const elems = [];

  /* Cover photo — 90% width, centred */
  if (coverImgData) {
    elems.push(new Paragraph({
      children: [makeImageRun(coverImgData, Math.round(A4_W_DU * 0.9))],
      alignment: AlignmentType.CENTER,
      spacing: { before: TWIP(0.3), after: TWIP(0.4) },
    }));
  } else {
    /* Vertical space when no image */
    elems.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: TWIP(1.8), after: 0 } }));
  }

  if (reportType) {
    elems.push(new Paragraph({
      children: [new TextRun({ text: reportType.replace(/_/g, " ").toUpperCase(), color: COLOR_MUTED, size: PT(9), font: FONT })],
      alignment: AlignmentType.CENTER, ...SP(0, 40),
    }));
  }

  elems.push(new Paragraph({
    children: [new TextRun({ text: reportTitle || "Annual Report", bold: true, color: COLOR_H1, size: PT(26), font: FONT })],
    alignment: AlignmentType.CENTER, ...SP(0, 20),
  }));

  if (ayear) {
    elems.push(new Paragraph({
      children: [new TextRun({ text: ayear, color: COLOR_H2, size: PT(14), font: FONT })],
      alignment: AlignmentType.CENTER, ...SP(0, 100),
    }));
  }

  elems.push(new Paragraph({ children: [new TextRun({ text: "" })], thematicBreak: true, ...SP(60, 60) }));

  elems.push(new Paragraph({
    children: [new TextRun({ text: sectionTitle, bold: true, color: COLOR_H2, size: PT(16), font: FONT })],
    alignment: AlignmentType.CENTER, ...SP(80, 0),
  }));

  elems.push(new Paragraph({
    children: [new TextRun({ text: dateStr, color: COLOR_MUTED, size: PT(9), font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: TWIP(0.4), after: 0 },
  }));

  elems.push(new Paragraph({ children: [new PageBreak()] }));
  return elems;
}

/* ══════════════════════════════════════════════════════════════════
   TABLE OF CONTENTS PAGE
══════════════════════════════════════════════════════════════════ */
function buildToCPage(reportSections, currentSectionId, blocksLength) {
  const topLevel   = (reportSections || []).filter(s => !s.parent_section_id);
  const currentIdx = topLevel.findIndex(s => s.id === currentSectionId);
  const currentPageEst = Math.max(1, Math.ceil(blocksLength / 4));

  function estPage(idx) {
    if (idx < 0) return "—";
    const base = 3;
    const pagesBeforeCurrent = currentIdx;
    const currentStart = base + pagesBeforeCurrent;
    if (idx < currentIdx)   return String(base + idx);
    if (idx === currentIdx) return String(currentStart);
    return String(currentStart + currentPageEst + (idx - currentIdx - 1));
  }

  const TOC_TAB = TWIP(5.5);
  const elements = [
    new Paragraph({
      children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, color: COLOR_H1, size: PT(14), font: FONT, allCaps: true })],
      spacing: { before: 0, after: TWIP(0.05) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_H1 } },
    }),
    new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 0, after: TWIP(0.1) } }),
  ];

  topLevel.forEach((sec, idx) => {
    const isCurrent = sec.id === currentSectionId;
    elements.push(new Paragraph({
      children: [
        new TextRun({ text: sec.title.toUpperCase(), font: FONT, size: PT(11), bold: isCurrent, color: isCurrent ? COLOR_H1 : COLOR_TEXT }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: estPage(idx), font: FONT, size: PT(11), color: COLOR_TEXT }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TOC_TAB, leader: LeaderType.DOT }],
      spacing: { before: 120, after: 60 },
    }));

    (reportSections || []).filter(s => s.parent_section_id === sec.id).forEach((sub) => {
      const isCurrentSub = sub.id === currentSectionId;
      elements.push(new Paragraph({
        children: [
          new TextRun({ text: `    ${sub.title}`, font: FONT, size: PT(10), color: isCurrentSub ? COLOR_H2 : COLOR_MUTED, bold: isCurrentSub }),
          new TextRun({ text: "\t" }),
          new TextRun({ text: "—", font: FONT, size: PT(10), color: COLOR_MUTED }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TOC_TAB, leader: LeaderType.DOT }],
        spacing: { before: 40, after: 40 },
        indent: { left: TWIP(0.25) },
      }));
    });
  });

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

/* ══════════════════════════════════════════════════════════════════
   PAGE HEADER  —  right-aligned report title
   Optionally includes a faded watermark image floating behind content.
   Watermark uses floating ImageRun if the docx version supports it;
   gracefully omitted otherwise.
══════════════════════════════════════════════════════════════════ */
function buildPageHeader(headerText, watermarkData) {
  const children = [];

  /* Watermark — floating behind document, full-page sized */
  if (watermarkData) {
    try {
      children.push(new Paragraph({
        children: [new ImageRun({
          data: watermarkData.arrayBuffer,
          type: watermarkData.type,
          transformation: { width: A4_W_DU, height: A4_H_DU },
          floating: {
            horizontalPosition: { relative: "page", offset: 0 },
            verticalPosition:   { relative: "page", offset: 0 },
            behindDocument: true,
            wrap: { type: "none" },
          },
        })],
        spacing: { before: 0, after: 0 },
      }));
    } catch { /* floating not supported — skip silently */ }
  }

  /* Text header — right aligned with thin bottom border */
  children.push(new Paragraph({
    children: [new TextRun({ text: headerText, font: FONT, size: PT(8.5), color: COLOR_MUTED })],
    alignment: AlignmentType.RIGHT,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } },
    spacing: { before: 0, after: 0 },
  }));

  return new Header({ children });
}

/* ══════════════════════════════════════════════════════════════════
   FOOTER  —  page number (centred) + logo (right tab)
══════════════════════════════════════════════════════════════════ */
function buildFooter(logoData) {
  const pgRun = new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: PT(10), color: COLOR_TEXT });

  if (logoData) {
    /* Scale logo to max 55 DU wide */
    const maxLogoW = 55;
    const logoW = Math.min(Math.round(logoData.naturalW * PX_TO_DU), maxLogoW);
    const logoH = Math.round(logoData.naturalH * PX_TO_DU * (logoW / (logoData.naturalW * PX_TO_DU)));

    return new Footer({
      children: [new Paragraph({
        children: [
          pgRun,
          new TextRun({ text: "\t" }),
          new ImageRun({ data: logoData.arrayBuffer, type: logoData.type, transformation: { width: logoW, height: logoH } }),
        ],
        alignment: AlignmentType.LEFT,
        tabStops: [{ type: TabStopType.RIGHT, position: TWIP(5.5) }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } },
        spacing: { before: 60, after: 0 },
      })],
    });
  }

  return new Footer({
    children: [new Paragraph({
      children: [pgRun],
      alignment: AlignmentType.CENTER,
    })],
  });
}

/* ── Section H1 heading (picked up by Word ToC field) ─────────────── */
function sectionH1(title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: title.toUpperCase(), bold: true, color: COLOR_H1, size: PT(14), font: FONT })],
    spacing: { before: 0, after: TWIP(0.1) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_H1 } },
  });
}

/* ══════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════ */
export async function generateSectionDocx(section, blocks, reportMeta, reportSections = []) {
  const sectionTitle = section?.title            || "Section";
  const reportTitle  = reportMeta?.title         || "";
  const ayear        = reportMeta?.academic_year || "";
  const reportType   = reportMeta?.report_type   || "";
  const dateStr      = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const headerText   = [reportTitle, ayear].filter(Boolean).join("  |  ") || "AIIA Annual Report 2024-25";

  /* Fetch all stock assets + content blocks in parallel */
  const [coverResult, bgResult, logoResult, contentNested] = await Promise.all([
    fetchImageData(STOCK_COVER_URL),
    toFadedPng(STOCK_BG_URL, 0.09),
    makeLogoCanvas(),
    Promise.all(blocks.map(b => blockToElements(b))),
  ]);

  const coverImgData  = coverResult;     // may be null if CORS fails
  const watermarkData = bgResult;        // may be null
  const logoData      = logoResult;      // canvas-generated, always succeeds
  const contentElems  = contentNested.flat();

  /* Cover */
  const coverElems = buildCoverElements(reportTitle, ayear, reportType, sectionTitle, dateStr, coverImgData);

  /* ToC */
  const tocElems = buildToCPage(reportSections, section?.id, blocks.length);

  /* Body: all sections as H1 + current section has full content */
  const topLevel = (reportSections || []).filter(s => !s.parent_section_id);
  const bodyElems = [];

  if (topLevel.length > 0) {
    topLevel.forEach(sec => {
      const isCurrent = sec.id === section?.id;
      bodyElems.push(sectionH1(sec.title));
      if (isCurrent) {
        bodyElems.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 0, after: TWIP(0.15) } }));
        bodyElems.push(...contentElems);
      } else {
        bodyElems.push(
          new Paragraph({
            children: [new TextRun({ text: "(Content not included in this export)", italics: true, color: COLOR_MUTED, font: FONT, size: PT(10) })],
            spacing: { before: TWIP(0.1), after: 0 },
          }),
          new Paragraph({ children: [new PageBreak()] }),
        );
      }
    });
  } else {
    bodyElems.push(sectionH1(sectionTitle));
    bodyElems.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 0, after: TWIP(0.15) } }));
    bodyElems.push(...contentElems);
  }

  const doc = new Document({
    creator:     "PragatiMitra",
    title:       reportTitle ? `${reportTitle} — ${sectionTitle}` : sectionTitle,
    description: "Section report generated by PragatiMitra",
    styles: {
      default: {
        document: {
          run:       { font: FONT, size: PT(11), color: COLOR_TEXT },
          paragraph: { spacing: { line: 276, lineRule: "auto" } },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: TWIP(1), bottom: TWIP(1), left: TWIP(1), right: TWIP(1) } },
      },
      headers: { default: buildPageHeader(headerText, watermarkData) },
      footers: { default: buildFooter(logoData) },
      children: [...coverElems, ...tocElems, ...bodyElems],
    }],
  });

  return Packer.toBlob(doc);
}

/* ── Download helper ─────────────────────────────────────────────── */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════
   PRINT-TO-PDF  (opens browser print dialog — user saves as PDF)
══════════════════════════════════════════════════════════════════ */
export function printSectionAsPdf(section, blocks, reportMeta) {
  const sectionTitle = section?.title || "Section";
  const reportTitle  = reportMeta?.title || "AIIA Annual Report";
  const ayear        = reportMeta?.academic_year || "";
  const headerLabel  = [reportTitle, ayear].filter(Boolean).join("  |  ");

  function blockToHtml(block) {
    const c = block.content || {};
    switch (block.block_type) {
      case "PARAGRAPH":
        return `<div class="para">${c.html || c.text || ""}</div>`;
      case "HEADING": {
        const lvl = Math.min(c.level || 2, 3);
        const tag = `h${lvl + 1}`;
        return `<${tag}>${c.text || ""}</${tag}>`;
      }
      case "LIST": {
        const tag = c.ordered ? "ol" : "ul";
        const items = (c.items || []).map(it => `<li>${it}</li>`).join("");
        return `<${tag} style="font-size:${c.fontSize || 11}pt">${items}</${tag}>`;
      }
      case "TABLE": {
        const isFormImport = c.source === "form_import";
        const cols    = isFormImport ? (c.columns || []) : null;
        const headers = isFormImport ? cols.map(col => col.label || col.key) : (c.headers || []);
        const rows    = c.rows || [];
        const thead   = headers.map(h => `<th>${h}</th>`).join("");
        const tbody   = rows.map(r => {
          const cells = isFormImport ? cols.map(col => r?.[col.key]) : (Array.isArray(r) ? r : []);
          return `<tr>${cells.map(cell => `<td>${cell ?? ""}</td>`).join("")}</tr>`;
        }).join("");
        return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
      }
      case "KPI": {
        const opts      = c.compile_options || {};
        const showChart = opts.show_chart      !== false;
        const showTable = opts.show_data_table !== false;
        const data      = c.data || {};
        const columns   = data.columns || [];
        const series    = data.series  || [];
        const totals    = data.totals  || [];
        const chartHtml = showChart && c.svg_data ? c.svg_data : "";
        const theadHtml = `<th>Series</th>${columns.map(col => `<th>${col}</th>`).join("")}`;
        const rowsHtml  = series.map(s =>
          `<tr><td>${s.display_name || s.name}</td>${(s.values || []).map(v => `<td>${v}</td>`).join("")}</tr>`
        ).join("");
        const totalsHtml = totals.length
          ? `<tr><td><strong>Total</strong></td>${totals.map(v => `<td><strong>${v}</strong></td>`).join("")}</tr>` : "";
        const tableHtml = showTable && columns.length
          ? `<table><thead><tr>${theadHtml}</tr></thead><tbody>${rowsHtml}${totalsHtml}</tbody></table>` : "";
        const captionHtml = opts.caption ? `<p class="caption">${opts.caption}</p>` : "";
        return `<div class="kpi-block">${chartHtml}${tableHtml}${captionHtml}</div>`;
      }
      case "DIVIDER":
        return "<hr/>";
      case "IMAGE":
        return c.url
          ? `<div class="img-wrap"><img src="${c.url}" alt="${c.alt || ""}"/>${c.caption ? `<p class="caption">${c.caption}</p>` : ""}</div>`
          : "";
      default:
        return "";
    }
  }

  const bodyHtml = blocks.map(blockToHtml).join("\n");

  const win = window.open("", "_blank");
  if (!win) { alert("Popup blocked. Please allow popups and try again."); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${headerLabel} — ${sectionTitle}</title>
  <style>
    @page { size: A4; margin: 1in; }
    body  { font-family: Calibri, "Segoe UI", sans-serif; font-size: 11pt; color: #111827; line-height: 1.7; }
    .report-header { font-size: 9pt; color: #6B7280; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 20px; }
    .section-title { font-size: 14pt; font-weight: 700; color: #1F3864; border-bottom: 2px solid #1F3864; padding-bottom: 6px; margin-bottom: 16px; }
    .para  { margin-bottom: 10px; text-align: justify; }
    h2     { font-size: 16pt; color: #1F3864; border-bottom: 1.5px solid #1F3864; padding-bottom: 3px; margin: 18px 0 8px; }
    h3     { font-size: 13pt; color: #2E4A7A; margin: 14px 0 6px; }
    h4     { font-size: 12pt; color: #374151; margin: 10px 0 5px; }
    ul, ol { padding-left: 24px; margin: 4px 0 10px; }
    li     { margin-bottom: 3px; }
    table  { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
    th     { background: #D0CECE; font-weight: bold; padding: 6px 8px; border: 1px solid #9CA3AF; }
    td     { padding: 5px 8px; border: 1px solid #9CA3AF; }
    tr:nth-child(even) td { background: #F9FAFB; }
    hr     { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
    .img-wrap { text-align: center; margin: 12px 0; }
    img    { max-width: 100%; }
    .caption { font-style: italic; color: #6B7280; font-size: 9pt; text-align: center; margin: 4px 0 12px; }
  </style>
</head>
<body>
  <div class="report-header">${headerLabel}</div>
  <div class="section-title">${sectionTitle}</div>
  ${bodyHtml}
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
  win.document.close();
}
