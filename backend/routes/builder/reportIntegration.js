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
 * POST /blocks/:blockId/switch-language                re-fetch the same table in en/hi
 * POST /translate                                     translate text/texts to Hindi
 */

const express           = require("express");
const { verifyToken }   = require("../../middleware/auth");
const { createSectionSnapshot } = require("../../utils/snapshotHelper");
const { translateSentence, translateHtml } = require("../../services/translationService");
const { getActiveSchema }       = require("../../services/schemaResolver");
const logger            = require("../../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

/* ── POST /translate — on-demand EN→HI translation for section editor blocks ──
   Accepts:
     { html }          — rich HTML string; translated with format:'html' so all
                         tags, inline styles, and structure are preserved
     { text }          — single plain-text string
     { texts: string[] } — batch of plain-text strings (list items, table cells) */
// router.post("/translate", async (req, res) => {
//   const { html, text, texts } = req.body;
//   try {
//     if (typeof html === "string") {
//       if (!html.trim())
//         return res.status(400).json({ success: false, message: "html is required" });
//       const hi = await translateHtml(html.trim());
//       return res.json({ success: true, data: { hi } });
//     }
//     if (Array.isArray(texts)) {
//       if (!texts.length || !texts.every((t) => typeof t === "string"))
//         return res.status(400).json({ success: false, message: "texts must be a non-empty string array" });
//       const translations = await Promise.all(
//         texts.map((t) => (t.trim() ? translateSentence(t) : Promise.resolve("")))
//       );
//       return res.json({ success: true, data: { translations } });
//     }
//     if (typeof text !== "string" || !text.trim())
//       return res.status(400).json({ success: false, message: "text or html is required" });
//     const hi = await translateSentence(text.trim());
//     return res.json({ success: true, data: { hi } });
//   } catch (err) {
//     logger.error("report-integration POST /translate", { ...getLogContext(req), err: err.message });
//     return res.status(500).json({ success: false, message: "Translation failed" });
//   }
// });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = v => typeof v === "string" && UUID_RE.test(v);

// Table name safety — must match one of these patterns
const isValidRecordsTable = name =>
  /^[a-z][a-z0-9_]*_records$/.test(name) || /^dept_form_[a-z0-9_]+$/.test(name);

// Columns always excluded from user-facing display
const EXCLUDED_COLS = new Set(["language", "source_row_id", "updated_by"]);

// Field types excluded from the form→TABLE-block import pipeline (column picker,
// preview, import, refetch, switch-language). Document/file fields have no meaningful
// representation as a table cell (raw storage key, not a usable value) and are handled
// by the dedicated FILE/IMAGE block types instead. Scoped to this file only.
const EXCLUDED_FIELD_TYPES = new Set(["document"]);

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
// Schema field labels are stored as { en, hi, ta, ... } (set during form creation in the
// Form Builder, optionally auto-filled by translationService). Extract the label for the
// requested language, falling back to English, then to the raw column name.
function resolveFieldLabel(field, language) {
  const lbl = field?.label;
  if (lbl && typeof lbl === "object") return lbl[language] || lbl.en || field.column_name;
  return lbl || field?.column_name;
}

function buildSelectClause(safeSelected, schemaFields, language = "en", physicalCols = null) {
  const hasDept = safeSelected.includes("department_id");
  const hasUser = safeSelected.includes("created_by");

  const selectParts = safeSelected.map(col => {
    if (col === "department_id") return `d.name AS "Department"`;
    if (col === "created_by")    return `u.full_name AS "Submitted By"`;
    if (col === "created_at")    return `TO_CHAR(r.created_at, 'DD Mon YYYY HH24:MI') AS "Submitted At"`;
    if (col === "year")          return `r.year AS "Academic Year"`;
    // Schema fields key on column_name, not "name" — match correctly so labels actually resolve.
    const field = (schemaFields || []).find(f => f.column_name === col);
    const label = field ? resolveFieldLabel(field, language) : col;
    // Fields added after form creation live in custom_fields JSONB, not as physical columns.
    const isPhysical = !physicalCols || physicalCols.has(col);
    const source = isPhysical ? `r."${col}"` : `r.custom_fields->>'${col}'`;
    return `${source} AS "${label}"`;
  });

  return { hasDept, hasUser, selectParts };
}

function buildFullQuery(tableName, safeSelected, institutionId, year, schemaFields, language = "en", physicalCols = null) {
  const { hasDept, hasUser, selectParts } = buildSelectClause(safeSelected, schemaFields, language, physicalCols);
  const select = [`r.id AS "__row_id"`, ...selectParts].join(", ");

  let q = `SELECT ${select}\nFROM public.${tableName} r`;
  if (hasDept) q += `\nLEFT JOIN public.departments d ON d.department_id = r.department_id`;
  if (hasUser) q += `\nLEFT JOIN public.users u ON u.id = r.created_by`;
  q += `\nWHERE r.institution_id = '${institutionId}'`;
  if (year)    q += `\n  AND r.year = ${Number(year)}`;
  const langClause = language === "hi" ? `r.language = 'hi'` : `(r.language = 'en' OR r.language IS NULL)`;
  q += `\n  AND ${langClause}\nORDER BY r.created_at DESC`;

  return q;
}

function buildColumnMeta(safeSelected, schemaFields, language = "en") {
  return safeSelected.map(col => {
    let label;
    if (col === "department_id") label = "Department";
    else if (col === "created_by") label = "Submitted By";
    else if (col === "created_at") label = "Submitted At";
    else if (col === "year")       label = "Academic Year";
    else {
      const f = (schemaFields || []).find(f => f.column_name === col);
      label = f ? resolveFieldLabel(f, language) : col;
    }
    return { key: label, label, type: "text", hidden: false };
  });
}

async function getPhysicalCols(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map(r => r.column_name));
}

// Validates requested column names against the table. Physical columns and system
// join-columns (department_id, created_by) always pass. Schema fields that are NOT
// physical columns are allowed when custom_fields JSONB exists on the table — these
// are fields added after form creation that are stored in the JSONB column.
function validateColumns(requested, physicalCols, schemaFields = []) {
  const schemaColSet = new Set((schemaFields || []).map(f => f.column_name));
  const excludedTypeColSet = new Set(
    (schemaFields || []).filter(f => EXCLUDED_FIELD_TYPES.has(f.type)).map(f => f.column_name)
  );
  const hasCustomFields = physicalCols.has("custom_fields");
  const systemCols = new Set(["department_id", "created_by", "created_at", "year"]);
  return requested.filter(c =>
    !excludedTypeColSet.has(c) &&
    !EXCLUDED_COLS.has(c) &&
    (systemCols.has(c) ||
     physicalCols.has(c) ||
     (hasCustomFields && schemaColSet.has(c)))
  );
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
    const language = req.query.language === "hi" ? "hi" : "en";
    const iid = await resolveInstitutionId(pool, req.user.userId, req.query.institution_id);

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });
    if (!(await tableExists(pool, tableName)))
      return res.status(404).json({ success: false, message: "Form data table not found" });

    const dbCols = await getDbColumns(pool, tableName);

    // Resolve schema using the same multi-step logic as institution-records:
    // year-specific → latest active → shared-form fallback → base-field merge.
    const parsedYear = year != null ? Number(year) : null;
    const schemaRow  = await getActiveSchema(pool, formName, iid, parsedYear);
    const schemaFields = Array.isArray(schemaRow?.schema?.fields) ? schemaRow.schema.fields : [];

    // Only dynamic (schema-defined) fields — system columns excluded.
    const hasCustomFields = dbCols.has("custom_fields");
    let dynamicCols = schemaFields
      .filter(f => {
        if (!f.column_name || EXCLUDED_COLS.has(f.column_name)) return false;
        if (f.hidden) return false;
        if (EXCLUDED_FIELD_TYPES.has(f.type)) return false;
        return dbCols.has(f.column_name) || hasCustomFields;
      })
      .map(f => ({ key: f.column_name, label: resolveFieldLabel(f, language) }));

    // Fallback: no schema — surface raw non-system DB columns
    if (!dynamicCols.length) {
      const sysKeys  = new Set(SYSTEM_COLS.map(c => c.key));
      const autoHide = new Set(["id", "form_name", "schema_id", "status", "order_index",
                                "custom_fields", "institution_id", "updated_at", ...EXCLUDED_COLS]);
      for (const col of dbCols) {
        if (!sysKeys.has(col) && !autoHide.has(col)) {
          dynamicCols.push({ key: col, label: col });
        }
      }
    }

    return res.json({ success: true, data: { dynamic: dynamicCols, formName, year: parsedYear } });
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
    const language = req.query.language === "hi" ? "hi" : "en";
    const iid = await resolveInstitutionId(pool, req.user.userId, req.query.institution_id);
    if (!iid) return res.status(400).json({ success: false, message: "institution_id required" });

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });
    if (!(await tableExists(pool, tableName)))
      return res.status(404).json({ success: false, message: "Form data table not found" });

    const requested = (columns || "").split(",").map(c => c.trim()).filter(Boolean);
    if (!requested.length) return res.status(400).json({ success: false, message: "columns required" });

    // Resolve schema using the same multi-step logic as institution-records.
    const physicalCols = await getPhysicalCols(pool, tableName);
    const parsedYear   = year != null ? Number(year) : null;
    const schemaRow    = await getActiveSchema(pool, formName, iid, parsedYear);
    const schemaFields = Array.isArray(schemaRow?.schema?.fields) ? schemaRow.schema.fields : [];

    const safeSelected = validateColumns(requested, physicalCols, schemaFields);
    if (!safeSelected.length) return res.status(400).json({ success: false, message: "No valid columns" });

    const baseQuery  = buildFullQuery(tableName, safeSelected, iid, parsedYear, schemaFields, language, physicalCols);
    const langClause = language === "hi" ? `r.language='hi'` : `(r.language='en' OR r.language IS NULL)`;
    const countSql   = `SELECT COUNT(*) AS cnt FROM public.${tableName} r
                        WHERE r.institution_id='${iid}'${parsedYear ? ` AND r.year=${parsedYear}` : ""}
                          AND ${langClause}`;

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
    const orderIndex      = req.body.orderIndex      != null ? req.body.orderIndex : req.body.order_index;
    const language        = req.body.language === "hi" ? "hi" : "en";

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

    // Resolve the form schema server-side (never trust a client-supplied schemaFields body —
    // it's also what lets validateColumns() correctly exclude document/file columns below).
    const schemaRow    = await getActiveSchema(pool, formName, iid, year != null ? Number(year) : null);
    const schemaFields = Array.isArray(schemaRow?.schema?.fields) ? schemaRow.schema.fields : [];

    const physicalCols = await getPhysicalCols(pool, tableName);
    const safeSelected = validateColumns(selectedColumns, physicalCols, schemaFields);
    if (!safeSelected.length) return res.status(400).json({ success: false, message: "No valid columns" });

    const storedQuery  = buildFullQuery(tableName, safeSelected, iid, year, schemaFields, language, physicalCols);
    const columnMeta   = buildColumnMeta(safeSelected, schemaFields, language);
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
          JSON.stringify({ form_name: formName, academic_year: Number(year), selected_columns: safeSelected, language, imported_at: importedAt, schema_fields: schemaFields }),
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
        language,
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
      const newBlock = blkRows[0];

      // 3b.
// Manual bilingual support.
//
// When importing English, check whether manually entered Hindi records
// already exist for the same form/year. If they do, store them as the
// Hindi variant of this report block.
//
// No automatic translation or Hindi mirror generation is performed.
      let translations = {};
      if (language === "en") {
        const hiColumnMeta = buildColumnMeta(safeSelected, schemaFields, "hi");
        const hiQuery = buildFullQuery(tableName, safeSelected, iid, year, schemaFields, "hi", physicalCols);
        const { rows: hiRows } = await client.query(hiQuery);
        // Always persist Hindi column metadata so headers render in Hindi even when
        // no Hindi data rows exist yet (schema labels come from custom_field_schemas.label.hi).
        // const hiContent = { columns: hiColumnMeta, rows: hiRows };
        // await client.query(
        //   `INSERT INTO public.block_translations (block_id, language, content, status, created_by, updated_by)
        //    VALUES ($1,'hi',$2::jsonb,'DRAFT',$3,$3)
        //    ON CONFLICT (block_id, language) DO UPDATE
        //      SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by`,
        //   [newBlock.id, JSON.stringify(hiContent), req.user.userId]
        // );
        // translations = { hi: hiContent };


       const hasHindiData = hiRows.some(row =>
  safeSelected.some(col => {
    const value = row[col];

    return (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    );
  })
);

if (hasHindiData) {
    const hiContent = {
        columns: hiColumnMeta,
        rows: hiRows,
    };

    await client.query(
        `INSERT INTO public.block_translations
           (block_id, language, content, status, created_by, updated_by)
         VALUES ($1,'hi',$2::jsonb,'DRAFT',$3,$3)
         ON CONFLICT (block_id, language)
         DO UPDATE
           SET content = EXCLUDED.content,
               updated_by = EXCLUDED.updated_by`,
        [
            newBlock.id,
            JSON.stringify(hiContent),
            req.user.userId,
        ]
    );

    translations.hi = hiContent;
}
      }

      // 4. Snapshot
      try {
        await createSectionSnapshot(pool, sectionId, "MANUAL", req.user.userId, null,
          `Imported table from ${formName} (${year}) — ${dataRows.length} rows`);
      } catch {}

      await client.query("COMMIT");
      // Attach translations to the response so the just-created block shows Hindi data
      // immediately in this session, without requiring a page reload.
      return res.json({ success: true, data: { ...newBlock, translations } });
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
      `SELECT b.*, ds.query AS ds_query, ds.id AS ds_id, ds.params AS ds_params
       FROM public.section_blocks b
       LEFT JOIN public.data_sources ds ON ds.id = b.data_source_id
       WHERE b.id=$1 AND b.deleted_at IS NULL`,
      [blockId]
    );
    if (!blkRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const block = blkRows[0];
    if (block.block_type !== "TABLE")
      return res.status(422).json({ success: false, message: "Not a TABLE block" });
    if (!block.ds_id || !block.ds_params)
      return res.status(422).json({ success: false, message: "Block has no form data source" });

    // Rebuild the primary query from stored params rather than using the cached ds_query
    // so JSONB-column fields (added after form creation) are always extracted correctly.
    const dsParams = block.ds_params;
    const primaryFormName = dsParams.form_name;
    const primaryYear     = dsParams.academic_year;
    const primaryLanguage2 = dsParams.language === "hi" ? "hi" : "en";
    const primarySelected  = dsParams.selected_columns || [];
    const primaryTable     = `${primaryFormName}_records`;

    if (!primaryFormName || !primarySelected.length || !isValidRecordsTable(primaryTable))
      return res.status(422).json({ success: false, message: "Data source is missing import parameters" });

    const primaryIid = await resolveInstitutionId(pool, req.user.userId, null);
    if (!primaryIid) return res.status(400).json({ success: false, message: "Could not determine institution" });

    const primaryPhysical = await getPhysicalCols(pool, primaryTable);
    // Prefer stored schema_fields (saved at import time) so refetch always uses the
    // same column labels that content.columns[].key was built with.  Fall back to a
    // live DB query only when not stored (e.g. old blocks imported before this fix).
    let primarySchema = Array.isArray(dsParams.schema_fields) ? dsParams.schema_fields : null;
    if (!primarySchema || !primarySchema.length) {
      primarySchema = [];
      if (await tableExists(pool, "custom_field_schemas")) {
        const qps = [primaryFormName, primaryIid];
        let sq = `SELECT schema -> 'fields' AS fields FROM public.custom_field_schemas
                  WHERE form_name=$1 AND institution_id=$2 AND is_active=TRUE`;
        if (primaryYear) { qps.push(Number(primaryYear)); sq += ` AND year=$${qps.length}`; }
        sq += ` ORDER BY created_at DESC LIMIT 1`;
        const { rows: sfr } = await pool.query(sq, qps);
        primarySchema = Array.isArray(sfr[0]?.fields) ? sfr[0].fields : [];
      }
    }
    const primarySafe = validateColumns(primarySelected, primaryPhysical, primarySchema);
    const freshColumnMeta = buildColumnMeta(primarySafe, primarySchema, primaryLanguage2);
    const rebuiltQuery = buildFullQuery(primaryTable, primarySafe, primaryIid, primaryYear, primarySchema, primaryLanguage2, primaryPhysical);

    const { rows: freshRows } = await pool.query(rebuiltQuery);
    const importedAt = new Date().toISOString();

    // Update block content — replace rows, columns, and imported_at so the stored
    // column meta always matches the fresh query aliases (prevents key-mismatch blanks).
    await pool.query(
      `UPDATE public.section_blocks
       SET content    = content
                     || jsonb_build_object('rows', $1::jsonb)
                     || jsonb_build_object('columns', $2::jsonb)
                     || jsonb_build_object('imported_at', $3::text),
           updated_by = $4
       WHERE id=$5 AND deleted_at IS NULL`,
      [JSON.stringify(freshRows), JSON.stringify(freshColumnMeta), importedAt, req.user.userId, blockId]
    );

    // Track last-fetch time in data_sources.params
    await pool.query(
      `UPDATE public.data_sources
       SET params     = params || $1::jsonb,
           updated_by = $2
       WHERE id=$3`,
      [JSON.stringify({ imported_at: importedAt }), req.user.userId, block.ds_id]
    ).catch(() => {});

    // Keep the Hindi block_translations row in sync whenever the primary content
    // (English) is refreshed, so re-fetching doesn't go stale relative to the translation.
    const primaryLanguage = (block.content || {}).language === "hi" ? "hi" : "en";
    let translations = {};
    if (primaryLanguage === "en" && block.ds_params?.form_name && block.ds_params?.selected_columns?.length) {
      try {
        const { form_name: formName, academic_year: year, selected_columns: selected } = block.ds_params;
        const tableName = `${formName}_records`;
        if (isValidRecordsTable(tableName)) {
          const iid = await resolveInstitutionId(pool, req.user.userId, null);
          if (iid) {
            const physicalCols = await getPhysicalCols(pool, tableName);
            // Reuse the already-resolved primarySchema for the Hindi sync (same block,
            // same form) — avoids a redundant DB round-trip and keeps labels consistent.
            let schemaFields = primarySchema;
            if (!schemaFields || !schemaFields.length) {
              if (await tableExists(pool, "custom_field_schemas")) {
                const qParams = [formName, iid];
                let sq = `SELECT schema -> 'fields' AS fields FROM public.custom_field_schemas
                          WHERE form_name=$1 AND institution_id=$2 AND is_active=TRUE`;
                if (year) { qParams.push(Number(year)); sq += ` AND year=$${qParams.length}`; }
                sq += ` ORDER BY created_at DESC LIMIT 1`;
                const { rows } = await pool.query(sq, qParams);
                schemaFields = Array.isArray(rows[0]?.fields) ? rows[0].fields : [];
              }
            }
            const safeSelected = validateColumns(selected, physicalCols, schemaFields);
          if (safeSelected.length) {
            const hiColumnMeta = buildColumnMeta(safeSelected, schemaFields, "hi");
            const hiQuery = buildFullQuery(tableName, safeSelected, iid, year, schemaFields, "hi", physicalCols);
            const { rows: hiRows } = await pool.query(hiQuery);
            // Always persist Hindi column metadata so headers render in Hindi even when
            // no Hindi data rows exist yet (labels come from custom_field_schemas.label.hi).
            // const hiContent = { columns: hiColumnMeta, rows: hiRows };
            // await pool.query(
            //   `INSERT INTO public.block_translations (block_id, language, content, status, created_by, updated_by)
            //    VALUES ($1,'hi',$2::jsonb,'DRAFT',$3,$3)
            //    ON CONFLICT (block_id, language) DO UPDATE
            //      SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by`,
            //   [blockId, JSON.stringify(hiContent), req.user.userId]
            // );
            // translations = { hi: hiContent };


             const hasHindiData = hiRows.some(row =>
    safeSelected.some(col => {
        const value = row[col];

        return (
            value != null &&
            String(value).trim() !== ""
        );
    })
);

if (hasHindiData) {

    const hiContent = {
        columns: hiColumnMeta,
        rows: hiRows,
    };

    await pool.query(
        `INSERT INTO public.block_translations
           (block_id, language, content, status, created_by, updated_by)
         VALUES ($1,'hi',$2::jsonb,'DRAFT',$3,$3)
         ON CONFLICT (block_id, language)
         DO UPDATE
           SET content = EXCLUDED.content,
               updated_by = EXCLUDED.updated_by`,
        [
            blockId,
            JSON.stringify(hiContent),
            req.user.userId,
        ]
    );

    translations.hi = hiContent;
}
          }
          }
        }
      } catch (e) {
        logger.error("report-integration refetch: hi translation sync failed", { ...getLogContext(req), err: e.message });
      }
    }

    // Snapshot
    try {
      const formName = (block.content || {}).form_name || "form";
      await createSectionSnapshot(pool, block.section_id, "MANUAL", req.user.userId, null,
        `Re-fetched from ${formName} — ${freshRows.length} rows`);
    } catch {}

    return res.json({ success: true, data: { rows: freshRows, columns: freshColumnMeta, imported_at: importedAt, count: freshRows.length, translations } });
  } catch (err) {
    logger.error("report-integration POST /blocks/:blockId/refetch", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to re-fetch: " + err.message });
  }
});

/* ── POST /blocks/:blockId/switch-language — re-fetch the SAME form-import
   TABLE block in a different language (en/hi), e.g. when the editor's EN/HI
   content toggle doesn't match the language this block was last imported in.
   Unlike /refetch (which just re-runs the stored query verbatim), this
   rebuilds the query with a different language filter. ─────────────── */
router.post("/blocks/:blockId/switch-language", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { blockId } = req.params;
    if (!isUUID(blockId)) return res.status(400).json({ success: false, message: "Invalid block id" });
    const language = req.body.language === "hi" ? "hi" : "en";

    const { rows: blkRows } = await pool.query(
      `SELECT b.*, ds.id AS ds_id, ds.params AS ds_params
       FROM public.section_blocks b
       LEFT JOIN public.data_sources ds ON ds.id = b.data_source_id
       WHERE b.id=$1 AND b.deleted_at IS NULL`,
      [blockId]
    );
    if (!blkRows.length) return res.status(404).json({ success: false, message: "Block not found" });

    const block = blkRows[0];
    if (block.block_type !== "TABLE" || (block.content || {}).source !== "form_import")
      return res.status(422).json({ success: false, message: "Not a form-import TABLE block" });
    if (!block.ds_id || !block.ds_params)
      return res.status(422).json({ success: false, message: "Block has no form data source" });

    const dsParams  = block.ds_params;
    const formName  = dsParams.form_name;
    const year      = dsParams.academic_year;
    const selected  = dsParams.selected_columns || [];
    if (!formName || !selected.length)
      return res.status(422).json({ success: false, message: "Data source is missing import parameters" });

    const tableName = `${formName}_records`;
    if (!isValidRecordsTable(tableName))
      return res.status(400).json({ success: false, message: "Invalid form name" });

    const iid = await resolveInstitutionId(pool, req.user.userId, null);
    if (!iid) return res.status(400).json({ success: false, message: "Could not determine institution" });

    // Fetch physical-column set and schema before validation so JSONB fields
    // (added after form creation) are included alongside physical columns.
    const physicalCols = await getPhysicalCols(pool, tableName);
    let schemaFields = [];
    if (await tableExists(pool, "custom_field_schemas")) {
      const qParams = [formName, iid];
      let sq = `SELECT schema -> 'fields' AS fields FROM public.custom_field_schemas
                WHERE form_name=$1 AND institution_id=$2 AND is_active=TRUE`;
      if (year) { qParams.push(Number(year)); sq += ` AND year=$${qParams.length}`; }
      sq += ` ORDER BY created_at DESC LIMIT 1`;
      const { rows } = await pool.query(sq, qParams);
      schemaFields = Array.isArray(rows[0]?.fields) ? rows[0].fields : [];
    }

    const safeSelected = validateColumns(selected, physicalCols, schemaFields);
    if (!safeSelected.length) return res.status(400).json({ success: false, message: "No valid columns" });

    const newQuery  = buildFullQuery(tableName, safeSelected, iid, year, schemaFields, language, physicalCols);
    const columnMeta = buildColumnMeta(safeSelected, schemaFields, language);
    const importedAt = new Date().toISOString();

    const { rows: dataRows } = await pool.query(newQuery);

    const { rows: updRows } = await pool.query(
      `UPDATE public.section_blocks
       SET content    = content
                     || jsonb_build_object('rows', $1::jsonb)
                     || jsonb_build_object('columns', $2::jsonb)
                     || jsonb_build_object('language', $3::text)
                     || jsonb_build_object('imported_at', $4::text),
           updated_by = $5
       WHERE id=$6 AND deleted_at IS NULL
       RETURNING content`,
      [JSON.stringify(dataRows), JSON.stringify(columnMeta), language, importedAt, req.user.userId, blockId]
    );

    await pool.query(
      `UPDATE public.data_sources
       SET query      = $1,
           params     = params || $2::jsonb,
           updated_by = $3
       WHERE id=$4`,
      [newQuery, JSON.stringify({ language, imported_at: importedAt }), req.user.userId, block.ds_id]
    ).catch(() => {});

    try {
      await createSectionSnapshot(pool, block.section_id, "MANUAL", req.user.userId, null,
        `Switched ${formName} table to ${language === "hi" ? "Hindi" : "English"} — ${dataRows.length} rows`);
    } catch {}

    return res.json({ success: true, data: updRows[0].content });
  } catch (err) {
    logger.error("report-integration POST /blocks/:blockId/switch-language", { ...getLogContext(req), err: err.message });
    return res.status(500).json({ success: false, message: "Failed to switch language: " + err.message });
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

    const iid = req.user.institutionId || null;
    const { rows } = await pool.query(
      `SELECT DISTINCT COALESCE(ksr.academic_year, kc.academic_year) AS academic_year
       FROM public.kpi_svg_reports ksr
       JOIN public.kpi_config kc ON kc.id = ksr.config_id
       LEFT JOIN public.departments dept ON dept.department_id::text = kc.department_id
       WHERE COALESCE(ksr.academic_year, kc.academic_year) IS NOT NULL
         AND ($1::text IS NULL
              OR kc.institute_id = $1::text
              OR dept.institution_id::text = $1::text)
       ORDER BY academic_year DESC`,
      [iid]
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

    const year   = (req.query.year || "").trim() || null;
    const search = (req.query.search || "").trim();
    const iid    = req.user.institutionId || null;

    const params = [iid];
    let where    = `WHERE ($1::text IS NULL
                          OR kc.institute_id = $1::text
                          OR dept.institution_id::text = $1::text)`;

    if (year) {
      params.push(year);
      where += ` AND COALESCE(ksr.academic_year, kc.academic_year)::text = $${params.length}::text`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND ksr.title ILIKE $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT ksr.id, ksr.config_id, ksr.title,
              COALESCE(ksr.academic_year, kc.academic_year) AS academic_year,
              ksr.exported_at,
              LENGTH(ksr.svg_data) AS svg_size
       FROM public.kpi_svg_reports ksr
       JOIN public.kpi_config kc ON kc.id = ksr.config_id
       LEFT JOIN public.departments dept ON dept.department_id::text = kc.department_id
       ${where}
       ORDER BY ksr.exported_at DESC`,
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

    const iid = req.user.institutionId || null;
    const { rows } = await pool.query(
      `SELECT ksr.id, ksr.config_id, ksr.title, ksr.svg_data, ksr.exported_at,
              COALESCE(ksr.academic_year, kc.academic_year) AS academic_year
       FROM public.kpi_svg_reports ksr
       JOIN public.kpi_config kc ON kc.id = ksr.config_id
       LEFT JOIN public.departments dept ON dept.department_id::text = kc.department_id
       WHERE ksr.id = $1
         AND ($2::text IS NULL
              OR kc.institute_id = $2::text
              OR dept.institution_id::text = $2::text)`,
      [kpiId, iid]
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
        extracted,
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

    // Fetch SVG — join kpi_config to resolve academic_year when missing on the export row
    const iid = req.user.institutionId || null;
    const { rows: kpiRows } = await pool.query(
      `SELECT ksr.id, ksr.config_id, ksr.title, ksr.svg_data, ksr.exported_at,
              COALESCE(ksr.academic_year, kc.academic_year) AS academic_year
       FROM public.kpi_svg_reports ksr
       JOIN public.kpi_config kc ON kc.id = ksr.config_id
       LEFT JOIN public.departments dept ON dept.department_id::text = kc.department_id
       WHERE ksr.id = $1
         AND ($2::text IS NULL
              OR kc.institute_id = $2::text
              OR dept.institution_id::text = $2::text)`,
      [kpiReportId, iid]
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
      `SELECT ksr.id, ksr.title, ksr.svg_data, ksr.exported_at,
              COALESCE(ksr.academic_year, kc.academic_year) AS academic_year
       FROM public.kpi_svg_reports ksr
       JOIN public.kpi_config kc ON kc.id = ksr.config_id
       WHERE ksr.id = $1`,
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