"use strict";

/**
 * routes/builder/reportIntegration.js
 * Form-data import feature for TABLE blocks.
 *
 * GET  /forms                                         list accessible forms
 * GET  /forms/:formName/columns                       column list for wizard step 2
 * GET  /forms/:formName/preview                       5-row preview + count
 * POST /sections/:sectionId/blocks/table-import       create block from form data
 * POST /blocks/:blockId/refetch                       re-execute stored query
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { createSectionSnapshot } = require("../../utils/snapshotHelper");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

// Table name safety — must match one of these patterns
const isValidRecordsTable = name =>
  /^[a-z][a-z0-9_]*_records$/.test(name) || /^dept_form_[a-z0-9_]+$/.test(name);

// Columns always excluded from user-facing display
const EXCLUDED_COLS = new Set(["language", "source_row_id"]);

// Fixed system columns shared by every _records table (when present)
const SYSTEM_COLS = [
  { key: "department_id", label: "Department" },
  { key: "created_by",    label: "Submitted By" },
  { key: "year",          label: "Academic Year" },
  { key: "created_at",    label: "Submitted At" },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function resolveInstitutionId(pool, userId, override) {
  if (isUUID(override)) return override;
  const { rows } = await pool.query(
    `SELECT institution_id FROM public.users WHERE id = $1`, [userId]
  );
  return rows[0]?.institution_id || null;
}

async function tableExists(pool, name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]
  );
  return rows.length > 0;
}

async function getDbColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map(r => r.column_name));
}

/**
 * Build SELECT + FROM + JOIN parts.
 * Columns that map to a JOIN (department_id → departments, created_by → users)
 * are replaced with human-readable aliases; all others use the schema label.
 */
function buildSelectClause(safeSelected, schemaFields) {
  const hasDept = safeSelected.includes("department_id");
  const hasUser = safeSelected.includes("created_by");

  const selectParts = safeSelected.map(col => {
    if (col === "department_id") return `d.name AS "Department"`;
    if (col === "created_by")    return `u.full_name AS "Submitted By"`;
    if (col === "created_at")    return `TO_CHAR(r.created_at, 'DD Mon YYYY HH24:MI') AS "Submitted At"`;
    if (col === "year")          return `r.year AS "Academic Year"`;
    const field = (schemaFields || []).find(f => f.name === col);
    const label = field?.label || col;
    return `r."${col}" AS "${label}"`;
  });

  return { hasDept, hasUser, selectParts };
}

function buildFullQuery(tableName, safeSelected, institutionId, year, schemaFields) {
  const { hasDept, hasUser, selectParts } = buildSelectClause(safeSelected, schemaFields);
  const select = [`r.id AS "__row_id"`, ...selectParts].join(", ");

  let q = `SELECT ${select}\nFROM public.${tableName} r`;
  if (hasDept) q += `\nLEFT JOIN public.departments d ON d.department_id = r.department_id`;
  if (hasUser) q += `\nLEFT JOIN public.users u ON u.id = r.created_by`;
  q += `\nWHERE r.institution_id = '${institutionId}'`;
  if (year)    q += `\n  AND r.year = ${Number(year)}`;
  q += `\n  AND (r.language = 'en' OR r.language IS NULL)\nORDER BY r.created_at DESC`;

  return q;
}

function buildColumnMeta(safeSelected, schemaFields) {
  return safeSelected.map(col => {
    let label;
    if (col === "department_id") label = "Department";
    else if (col === "created_by") label = "Submitted By";
    else if (col === "created_at") label = "Submitted At";
    else if (col === "year")       label = "Academic Year";
    else {
      const f = (schemaFields || []).find(f => f.name === col);
      label = f?.label || col;
    }
    return { key: label, label, type: "text", hidden: false };
  });
}

async function validateColumns(pool, tableName, requested) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=ANY($2)`,
    [tableName, requested]
  );
  const validSet = new Set(rows.map(r => r.column_name));
  // department_id / created_by are handled via JOINs — allow even if not a physical column
  return requested.filter(c => validSet.has(c) || c === "department_id" || c === "created_by");
}

/* ── GET /forms — list forms accessible to the user's institution ─── */
router.get("/forms", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const iid = await resolveInstitutionId(pool, req.user.userId, req.query.institution_id);
    if (!iid) return res.status(400).json({ success: false, message: "institution_id required" });

    if (!(await tableExists(pool, "table_list"))) {
      return res.json({ success: true, data: [] });
    }

    const hasCfs = await tableExists(pool, "custom_field_schemas");
    const { rows } = await pool.query(
      hasCfs
        ? `SELECT tl.id, tl.form_name, tl.form_domain, tl.share_table,
                  cfs.schema -> 'fields' AS fields, cfs.year
           FROM public.table_list tl
           JOIN public.custom_field_schemas cfs
             ON  cfs.form_name      = tl.form_name
             AND cfs.institution_id = $1
             AND cfs.is_active      = TRUE
           WHERE $1 = ANY(tl.institute_access)
           ORDER BY tl.form_domain, tl.form_name`
        : `SELECT id, form_name, form_domain, share_table, NULL AS fields, NULL AS year
           FROM public.table_list
           WHERE $1 = ANY(institute_access)
           ORDER BY form_name`,
      [iid]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("report-integration GET /forms", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list forms" });
  }
});

/* ── GET /forms/:formName/columns ───────────────────────────────── */
router.get("/forms/:formName/columns", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { formName } = req.params;
    const { year }     = req.query;
    const iid = await resolveInstitutionId(pool, req.user.userId, req.query.institution_id);

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });
    if (!(await tableExists(pool, tableName)))
      return res.status(404).json({ success: false, message: "Form data table not found" });

    const dbCols = await getDbColumns(pool, tableName);

    // System columns that actually exist in this table
    const systemCols = SYSTEM_COLS.filter(c => dbCols.has(c.key) && !EXCLUDED_COLS.has(c.key));

    // Dynamic schema columns from custom_field_schemas
    let schemaFields = [];
    if (await tableExists(pool, "custom_field_schemas")) {
      const params = [formName, iid];
      let sq = `SELECT schema -> 'fields' AS fields FROM public.custom_field_schemas
                WHERE form_name=$1 AND institution_id=$2 AND is_active=TRUE`;
      if (year) { params.push(Number(year)); sq += ` AND year=$${params.length}`; }
      sq += ` ORDER BY created_at DESC LIMIT 1`;
      const { rows } = await pool.query(sq, params);
      schemaFields = Array.isArray(rows[0]?.fields) ? rows[0].fields : [];
    }

    let dynamicCols = schemaFields
      .filter(f => f.name && dbCols.has(f.name) && !EXCLUDED_COLS.has(f.name))
      .map(f => ({ key: f.name, label: f.label || f.name }));

    // Fallback: if no schema, surface DB columns directly (minus hidden ones)
    if (!dynamicCols.length) {
      const sysKeys    = new Set(SYSTEM_COLS.map(c => c.key));
      const autoHide   = new Set(["id", "form_name", "schema_id", "status", "order_index",
                                  "custom_fields", "institution_id", "updated_at", ...EXCLUDED_COLS]);
      for (const col of dbCols) {
        if (!sysKeys.has(col) && !autoHide.has(col)) {
          dynamicCols.push({ key: col, label: col });
        }
      }
    }

    return res.json({ success: true, data: { system: systemCols, dynamic: dynamicCols, formName, year: year || null } });
  } catch (err) {
    logger.error("report-integration GET /forms/:formName/columns", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to get columns" });
  }
});

/* ── GET /forms/:formName/preview — 5 rows + total count ─────────── */
router.get("/forms/:formName/preview", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { formName }     = req.params;
    const { year, columns } = req.query;
    const iid = await resolveInstitutionId(pool, req.user.userId, req.query.institution_id);
    if (!iid) return res.status(400).json({ success: false, message: "institution_id required" });

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });
    if (!(await tableExists(pool, tableName)))
      return res.status(404).json({ success: false, message: "Form data table not found" });

    const requested = (columns || "").split(",").map(c => c.trim()).filter(Boolean);
    if (!requested.length) return res.status(400).json({ success: false, message: "columns required" });

    const safeSelected = await validateColumns(pool, tableName, requested);
    if (!safeSelected.length) return res.status(400).json({ success: false, message: "No valid columns" });

    const baseQuery = buildFullQuery(tableName, safeSelected, iid, year, []);
    const countSql  = `SELECT COUNT(*) AS cnt FROM public.${tableName} r
                        WHERE r.institution_id='${iid}'${year ? ` AND r.year=${Number(year)}` : ""}
                          AND (r.language='en' OR r.language IS NULL)`;

    const [pvRes, cntRes] = await Promise.all([
      pool.query(baseQuery.replace(/ORDER BY.*$/, "") + "\nORDER BY r.created_at DESC LIMIT 5"),
      pool.query(countSql),
    ]);

    return res.json({ success: true, data: { rows: pvRes.rows, total: Number(cntRes.rows[0]?.cnt || 0) } });
  } catch (err) {
    logger.error("report-integration GET /forms/:formName/preview", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to preview: " + err.message });
  }
});

/* ── POST /sections/:sectionId/blocks/table-import ──────────────── */
router.post("/sections/:sectionId/blocks/table-import", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    // Accept both camelCase and snake_case field names
    const formName        = req.body.formName        || req.body.form_name;
    const year            = req.body.year            != null ? req.body.year : req.body.academic_year;
    const selectedColumns = req.body.selectedColumns || req.body.columns;
    const schemaFields    = req.body.schemaFields    || req.body.schema_fields || [];
    const orderIndex      = req.body.orderIndex      != null ? req.body.orderIndex : req.body.order_index;

    if (!formName || !Array.isArray(selectedColumns) || !selectedColumns.length)
      return res.status(400).json({ success: false, message: "form_name and columns are required" });

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });
    if (!(await tableExists(pool, tableName)))
      return res.status(404).json({ success: false, message: "Form data table not found" });

    const iid = await resolveInstitutionId(pool, req.user.userId, null);
    if (!iid) return res.status(400).json({ success: false, message: "Could not determine institution" });

    // Verify section exists
    const { rows: secRows } = await pool.query(
      `SELECT id FROM public.report_sections WHERE id=$1 AND deleted_at IS NULL`, [sectionId]
    );
    if (!secRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    const safeSelected = await validateColumns(pool, tableName, selectedColumns);
    if (!safeSelected.length) return res.status(400).json({ success: false, message: "No valid columns" });

    const storedQuery  = buildFullQuery(tableName, safeSelected, iid, year, schemaFields);
    const columnMeta   = buildColumnMeta(safeSelected, schemaFields);
    const columnMap    = [{ key: "__row_id", label: "Row ID", hidden: true }, ...columnMeta];
    const importedAt   = new Date().toISOString();

    // Execute query to get all data
    const { rows: dataRows } = await pool.query(storedQuery);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. data_sources row (stores the dormant query)
      const { rows: dsRows } = await client.query(
        `INSERT INTO public.data_sources
           (institution_id, name, description, source_type, query, params, column_map, created_by)
         VALUES ($1,$2,$3,'SQL',$4,$5::jsonb,$6::jsonb,$7)
         RETURNING id`,
        [
          iid,
          `Form Import — ${formName} (${year})`,
          `Auto-generated from form: ${formName}, year: ${year}`,
          storedQuery,
          JSON.stringify({ form_name: formName, academic_year: Number(year), selected_columns: safeSelected, imported_at: importedAt }),
          JSON.stringify(columnMap),
          req.user.userId,
        ]
      );
      const dataSourceId = dsRows[0].id;

      // 2. Compute order_index
      let oIdx = orderIndex != null ? Number(orderIndex) : null;
      if (oIdx == null) {
        const { rows: oRows } = await client.query(
          `SELECT COALESCE(MAX(order_index), 0) + 1 AS next
           FROM public.section_blocks WHERE section_id=$1 AND deleted_at IS NULL`,
          [sectionId]
        );
        oIdx = oRows[0].next;
      }

      // 3. section_blocks row
      const blockContent = {
        source:        "form_import",
        form_name:     formName,
        academic_year: Number(year),
        imported_at:   importedAt,
        columns:       columnMeta,
        rows:          dataRows,
        guidance:      {},
      };
      const { rows: blkRows } = await client.query(
        `INSERT INTO public.section_blocks
           (section_id, block_type, order_index, data_source_id, content, is_required, created_by)
         VALUES ($1,'TABLE',$2,$3,$4::jsonb,FALSE,$5)
         RETURNING *`,
        [sectionId, oIdx, dataSourceId, JSON.stringify(blockContent), req.user.userId]
      );

      // 4. Snapshot
      try {
        await createSectionSnapshot(pool, sectionId, "MANUAL", req.user.userId, null,
          `Imported table from ${formName} (${year}) — ${dataRows.length} rows`);
      } catch {}

      await client.query("COMMIT");
      return res.json({ success: true, data: blkRows[0] });
    } catch (e2) {
      await client.query("ROLLBACK");
      throw e2;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("report-integration POST table-import", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to import: " + err.message });
  }
});

/* ── POST /blocks/:blockId/refetch — re-run stored query ─────────── */
router.post("/blocks/:blockId/refetch", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { rows: blkRows } = await pool.query(
      `SELECT b.*, ds.query AS ds_query, ds.id AS ds_id
       FROM public.section_blocks b
       LEFT JOIN public.data_sources ds ON ds.id = b.data_source_id
       WHERE b.id=$1 AND b.deleted_at IS NULL`,
      [blockId]
    );
    if (!blkRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const block = blkRows[0];
    if (block.block_type !== "TABLE")
      return res.status(422).json({ success: false, message: "Not a TABLE block" });
    if (!block.ds_id || !block.ds_query)
      return res.status(422).json({ success: false, message: "Block has no form data source" });

    const { rows: freshRows } = await pool.query(block.ds_query);
    const importedAt = new Date().toISOString();

    // Update block content — replace rows + imported_at
    await pool.query(
      `UPDATE public.section_blocks
       SET content    = content
                     || jsonb_build_object('rows', $1::jsonb)
                     || jsonb_build_object('imported_at', $2::text),
           updated_by = $3
       WHERE id=$4 AND deleted_at IS NULL`,
      [JSON.stringify(freshRows), importedAt, req.user.userId, blockId]
    );

    // Track last-fetch time in data_sources.params
    await pool.query(
      `UPDATE public.data_sources
       SET params     = params || $1::jsonb,
           updated_by = $2
       WHERE id=$3`,
      [JSON.stringify({ imported_at: importedAt }), req.user.userId, block.ds_id]
    ).catch(() => {});

    // Snapshot
    try {
      const formName = (block.content || {}).form_name || "form";
      await createSectionSnapshot(pool, block.section_id, "MANUAL", req.user.userId, null,
        `Re-fetched from ${formName} — ${freshRows.length} rows`);
    } catch {}

    return res.json({ success: true, data: { rows: freshRows, imported_at: importedAt, count: freshRows.length } });
  } catch (err) {
    logger.error("report-integration POST /blocks/:blockId/refetch", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to re-fetch: " + err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   KPI CHART IMPORT — helpers + routes
═══════════════════════════════════════════════════════════════════ */

/**
 * Strip dangerous constructs from an SVG string (whitelist approach).
 * The SVGs come from our own KPI system so we trust the structure,
 * but we still remove anything that could execute code.
 */
function sanitizeSvg(svg) {
  if (!svg || typeof svg !== "string") return "";
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\bhref\s*=\s*["'](?:javascript|data):[^"']*["']/gi, "")
    .replace(/\bxlink:href\s*=\s*["'](?:javascript|data):[^"']*["']/gi, "");
}

/**
 * Extract structured data from the KPI chart SVG.
 *
 * The chart library embeds a "data table" nested SVG containing:
 *   - A "SERIES" header text element (identifies the section)
 *   - Column header text elements (first y-level after SERIES)
 *   - Series-value text elements (second y-level, first item may be series name)
 *   - Totals text elements (y-level containing "Total")
 *
 * Returns { columns, series:[{name, display_name, values}], totals }.
 * All fields gracefully degrade to empty arrays if parsing fails.
 */
function extractKpiDataFromSvg(svg) {
  if (!svg || typeof svg !== "string") return { columns: [], series: [], totals: [] };

  try {
    // Locate the inner SVG block that contains the "SERIES" header.
    // Walk backwards from the SERIES text to find the enclosing <svg.
    const seriesPos = svg.search(/>SERIES</i);
    if (seriesPos === -1) return { columns: [], series: [], totals: [] };

    const innerStart = svg.lastIndexOf("<svg", seriesPos);
    if (innerStart === -1) return { columns: [], series: [], totals: [] };

    // Find the matching </svg> by tracking nesting depth.
    let depth = 1;
    let pos   = innerStart + 4;
    while (pos < svg.length && depth > 0) {
      const nextOpen  = svg.indexOf("<svg",  pos);
      const nextClose = svg.indexOf("</svg>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        pos = nextClose + 6;
      }
    }
    const innerSvg = svg.slice(innerStart, pos);

    // Collect all <text y="N">content</text> inside the inner SVG.
    const textRe   = /<text\b[^>]*?\by="(\d+(?:\.\d+)?)"[^>]*?>([\s\S]*?)<\/text>/g;
    const textsByY = new Map();
    let m;
    while ((m = textRe.exec(innerSvg)) !== null) {
      const y    = Math.round(parseFloat(m[1]));
      const text = m[2].replace(/<[^>]+>/g, "").trim();  // strip child tags (tspan etc.)
      if (!text) continue;
      if (!textsByY.has(y)) textsByY.set(y, []);
      textsByY.get(y).push(text);
    }

    // Find the y of the "SERIES" header and the "Total" row.
    let seriesY = -1;
    let totalsY = -1;
    for (const [y, texts] of textsByY) {
      if (texts.some(t => /^series$/i.test(t)))  seriesY = y;
      if (texts.some(t => /^total$/i.test(t)))   totalsY = y;
    }

    // Collect y values strictly between seriesY and totalsY.
    const sortedYs = Array.from(textsByY.keys()).sort((a, b) => a - b);
    const midYs    = sortedYs.filter(y => y > seriesY && (totalsY < 0 || y < totalsY));

    // First mid-y → column headers; second mid-y → series values (+ optional name).
    const columns = midYs.length >= 1
      ? (textsByY.get(midYs[0]) || []).filter(t => !/^series$/i.test(t))
      : [];

    let seriesName = "Series";
    let values     = [];
    if (midYs.length >= 2) {
      const raw  = textsByY.get(midYs[1]) || [];
      const tryN = parseFloat((raw[0] || "").replace(/,/g, ""));
      if (raw.length > 0 && isNaN(tryN)) {
        // First text is a label, not a number → it's the series name.
        seriesName = raw[0];
        values     = raw.slice(1).map(t => { const n = parseFloat(t.replace(/,/g, "")); return isNaN(n) ? t : n; });
      } else {
        values = raw.map(t => { const n = parseFloat(t.replace(/,/g, "")); return isNaN(n) ? t : n; });
      }
    }

    const totals = totalsY >= 0
      ? (textsByY.get(totalsY) || [])
          .filter(t => !/^total$/i.test(t))
          .map(t => { const n = parseFloat(t.replace(/,/g, "")); return isNaN(n) ? t : n; })
      : [];

    return { columns, series: [{ name: seriesName, display_name: seriesName, values }], totals };
  } catch {
    return { columns: [], series: [], totals: [] };
  }
}

/* ── Helper: check that kpi_svg_reports table exists ───────────── */
async function kpiTableExists(pool) {
  return tableExists(pool, "kpi_svg_reports");
}

/* ── GET /kpi-reports/years — distinct academic years ───────────── */
router.get("/kpi-reports/years", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    if (!(await kpiTableExists(pool))) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT DISTINCT academic_year
       FROM public.kpi_svg_reports
       WHERE academic_year IS NOT NULL
       ORDER BY academic_year DESC`
    );
    return res.json({ success: true, data: rows.map(r => r.academic_year) });
  } catch (err) {
    logger.error("report-integration GET /kpi-reports/years", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list years" });
  }
});

/* ── GET /kpi-reports — list KPIs (no svg_data) ─────────────────── */
router.get("/kpi-reports", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    if (!(await kpiTableExists(pool))) return res.json({ success: true, data: [] });

    const year   = req.query.year != null ? Number(req.query.year) : null;
    const search = (req.query.search || "").trim();

    const params = [];
    let where    = "WHERE 1=1";

    if (year) {
      params.push(year);
      where += ` AND academic_year = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND title ILIKE $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT id, config_id, title, academic_year, exported_at,
              LENGTH(svg_data) AS svg_size
       FROM public.kpi_svg_reports
       ${where}
       ORDER BY exported_at DESC`,
      params
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("report-integration GET /kpi-reports", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to list KPI reports" });
  }
});

/* ── GET /kpi-reports/:id — full KPI with svg + extracted data ──── */
router.get("/kpi-reports/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    if (!(await kpiTableExists(pool)))
      return res.status(404).json({ success: false, message: "KPI reports table not found" });

    const kpiId = Number(req.params.id);
    if (!Number.isFinite(kpiId) || kpiId <= 0)
      return res.status(400).json({ success: false, message: "Invalid KPI id" });

    const { rows } = await pool.query(
      `SELECT id, config_id, title, svg_data, academic_year, exported_at
       FROM public.kpi_svg_reports WHERE id = $1`,
      [kpiId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "KPI not found" });

    const kpi           = rows[0];
    const sanitized_svg = sanitizeSvg(kpi.svg_data || "");
    const extracted     = extractKpiDataFromSvg(kpi.svg_data || "");

    return res.json({
      success: true,
      data: {
        id:            kpi.id,
        config_id:     kpi.config_id,
        title:         kpi.title,
        academic_year: kpi.academic_year,
        exported_at:   kpi.exported_at,
        svg_data:      sanitized_svg,
        extracted,       // { columns, series, totals }
      },
    });
  } catch (err) {
    logger.error("report-integration GET /kpi-reports/:id", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to load KPI" });
  }
});

/* ── POST /sections/:sectionId/blocks/kpi-import ────────────────── */
router.post("/sections/:sectionId/blocks/kpi-import", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { sectionId } = req.params;
    if (!isUUID(sectionId)) return res.status(400).json({ success: false, message: "Invalid section id" });

    const kpiReportId = Number(req.body.kpi_report_id);
    const orderIndex  = req.body.order_index != null ? Number(req.body.order_index) : null;
    const caption     = req.body.caption || "";

    if (!Number.isFinite(kpiReportId) || kpiReportId <= 0)
      return res.status(400).json({ success: false, message: "kpi_report_id required" });

    // Verify section
    const { rows: secRows } = await pool.query(
      `SELECT id FROM public.report_sections WHERE id=$1 AND deleted_at IS NULL`, [sectionId]
    );
    if (!secRows.length) return res.status(404).json({ success: false, message: "Section not found" });

    // Verify KPI table
    if (!(await kpiTableExists(pool)))
      return res.status(404).json({ success: false, message: "KPI reports table not found" });

    // Fetch SVG
    const { rows: kpiRows } = await pool.query(
      `SELECT id, config_id, title, svg_data, academic_year, exported_at
       FROM public.kpi_svg_reports WHERE id=$1`,
      [kpiReportId]
    );
    if (!kpiRows.length) return res.status(404).json({ success: false, message: "KPI report not found" });

    const kpi       = kpiRows[0];
    const cleanSvg  = sanitizeSvg(kpi.svg_data || "");
    const extracted = extractKpiDataFromSvg(kpi.svg_data || "");

    // Compute order_index
    let oIdx = orderIndex;
    if (oIdx == null) {
      const { rows: oRows } = await pool.query(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS next
         FROM public.section_blocks WHERE section_id=$1 AND deleted_at IS NULL`,
        [sectionId]
      );
      oIdx = oRows[0].next;
    }

    const importedAt  = new Date().toISOString();
    const blockContent = {
      source:        "kpi_import",
      kpi_report_id: kpi.id,
      config_id:     kpi.config_id,
      title:         kpi.title,
      academic_year: kpi.academic_year,
      imported_at:   importedAt,
      exported_at:   kpi.exported_at,
      svg_data:      cleanSvg,
      data:          extracted,
      compile_options: {
        show_chart:       true,
        show_data_table:  true,
        chart_width:      "full",
        caption,
      },
    };

    const { rows: blkRows } = await pool.query(
      `INSERT INTO public.section_blocks
         (section_id, block_type, order_index, data_source_id, content, is_required, created_by)
       VALUES ($1,'KPI',$2,NULL,$3::jsonb,FALSE,$4)
       RETURNING *`,
      [sectionId, oIdx, JSON.stringify(blockContent), req.user.userId]
    );

    // Snapshot
    try {
      await createSectionSnapshot(pool, sectionId, "MANUAL", req.user.userId, null,
        `Imported KPI chart: ${kpi.title}`);
    } catch {}

    return res.json({ success: true, data: blkRows[0] });
  } catch (err) {
    logger.error("report-integration POST /kpi-import", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to import KPI: " + err.message });
  }
});

/* ── POST /blocks/:blockId/kpi-reimport — refresh SVG + data ─────── */
router.post("/blocks/:blockId/kpi-reimport", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });

    const { rows: blkRows } = await pool.query(
      `SELECT b.* FROM public.section_blocks b
       WHERE b.id=$1 AND b.deleted_at IS NULL`,
      [blockId]
    );
    if (!blkRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const block = blkRows[0];
    if (block.block_type !== "KPI" || (block.content || {}).source !== "kpi_import")
      return res.status(422).json({ success: false, message: "Not a KPI import block" });

    const kpiReportId = Number(block.content.kpi_report_id);
    if (!Number.isFinite(kpiReportId) || kpiReportId <= 0)
      return res.status(422).json({ success: false, message: "Block has no kpi_report_id" });

    if (!(await kpiTableExists(pool)))
      return res.status(404).json({ success: false, message: "KPI reports table not found" });

    const { rows: kpiRows } = await pool.query(
      `SELECT id, title, svg_data, academic_year, exported_at
       FROM public.kpi_svg_reports WHERE id=$1`,
      [kpiReportId]
    );
    if (!kpiRows.length) return res.status(404).json({ success: false, message: "KPI report not found" });

    const kpi       = kpiRows[0];
    const cleanSvg  = sanitizeSvg(kpi.svg_data || "");
    const extracted = extractKpiDataFromSvg(kpi.svg_data || "");
    const importedAt = new Date().toISOString();

    await pool.query(
      `UPDATE public.section_blocks
       SET content    = content
                     || jsonb_build_object(
                          'svg_data',    $1::text,
                          'data',        $2::jsonb,
                          'imported_at', $3::text,
                          'exported_at', $4::text,
                          'title',       $5::text
                        ),
           updated_by = $6
       WHERE id=$7 AND deleted_at IS NULL`,
      [cleanSvg, JSON.stringify(extracted), importedAt, kpi.exported_at, kpi.title, req.user.userId, blockId]
    );

    // Re-read the updated content
    const { rows: updRows } = await pool.query(
      `SELECT content FROM public.section_blocks WHERE id=$1`, [blockId]
    );
    const updatedContent = updRows[0]?.content || {};

    // Snapshot
    try {
      await createSectionSnapshot(pool, block.section_id, "MANUAL", req.user.userId, null,
        `Re-imported KPI chart: ${kpi.title}`);
    } catch {}

    return res.json({ success: true, data: { content: updatedContent } });
  } catch (err) {
    logger.error("report-integration POST /kpi-reimport", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to re-import KPI: " + err.message });
  }
});

module.exports = router;
