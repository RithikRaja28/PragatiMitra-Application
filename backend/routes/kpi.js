/**
 * routes/kpi.js — Annual Report Portal · KPI Backend
 *
 * Role-based scope:
 *   institute_admin  → scope='institute', keyed by institute_id  (UUID/TEXT)
 *   department_admin → scope='department', keyed by department_id (UUID/TEXT)
 *
 * Dashboard config fields on kpi_config:
 *   show_on_dashboard       BOOLEAN  — user explicitly pinned this KPI to dashboard
 *   dashboard_display_type  TEXT     — 'single' | 'group'
 *   dashboard_group_name    TEXT     — label when display_type='group'
 */

const express         = require("express");
const router          = express.Router();
const { verifyToken } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const { translateSentence, transliteratePhrase, lookupLabel } = require("../services/translationService");
const DEVANAGARI_RE = /[ऀ-ॿ]/;

const logger            = require("../utils/logger");
const { getLogContext } = logger;

router.use((req, _res, next) => { req.pool = req.app.locals.pool; next(); });
router.use(verifyToken);

// ─── One-time init flag (avoid re-running migrations per request) ──────────────
let _initialized = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Translate a single KPI metadata string to Hindi.
 * Resolution order matches enrichSchemaLabels in translationService:
 *   1. Predefined lookup map  — instant, correct for common words
 *   2. Google Translate       — handles phrases like "Patient data by district"
 *   3. Phonetic transliteration fallback — when Google fails or returns non-Devanagari
 * Returns null when text is empty or all paths fail.
 */
async function translateKpiField(text) {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  // 1. Predefined map (title, description, department, etc.)
  const fromMap = lookupLabel(t, "hi");
  if (fromMap) return fromMap;

  // 2. Google Translate
  try {
    const hi = await translateSentence(t);
    if (hi && DEVANAGARI_RE.test(hi)) return hi;
  } catch {}

  // 3. Phonetic fallback (handles pure-alpha text like proper nouns)
  try {
    const phonetic = await transliteratePhrase(t);
    if (phonetic && DEVANAGARI_RE.test(phonetic)) return phonetic;
  } catch {}

  return null;
}

/**
 * Translate all three KPI metadata fields to Hindi in parallel.
 * Mirrors autoFillHindiLabels from forms.js — called at save time.
 */
async function autoTranslateKpiMeta(title, description, exportTitle) {
  const [title_hi, description_hi, export_title_hi] = await Promise.all([
    translateKpiField(title),
    translateKpiField(description),
    translateKpiField(exportTitle),
  ]);
  return { title_hi, description_hi, export_title_hi };
}

/**
 * Enrich a single kpi_config row with Hindi metadata if it is missing.
 * Mirrors enrichSchemaLabels from translationService — called at retrieval time.
 * Saves the result back to DB asynchronously so subsequent fetches are instant.
 */
async function enrichKpiRowHindi(pool, row) {
  if (row.title_hi) return row; // already translated

  const meta = await autoTranslateKpiMeta(row.title, row.description, row.export_title)
    .catch(() => ({ title_hi: null, description_hi: null, export_title_hi: null }));

  if (!meta.title_hi) return row; // translation failed entirely — return as-is

  // Persist async (fire-and-forget) — AND title_hi IS NULL prevents race conditions
  pool.query(
    `UPDATE kpi_config
        SET title_hi=$1, description_hi=$2, export_title_hi=$3
      WHERE id=$4 AND title_hi IS NULL`,
    [meta.title_hi, meta.description_hi || null, meta.export_title_hi || null, row.id]
  ).catch(() => {});

  return { ...row, ...meta };
}

function quoteIdent(name) {
  if (typeof name !== "string" || !name.trim()) throw new Error("Invalid identifier");
  if (name.includes("\0")) throw new Error("Invalid identifier");
  return `"${name.replace(/"/g, '""')}"`;
}

const NUMERIC_TYPES = [
  "integer","bigint","smallint","numeric","decimal","real",
  "double precision","float","float4","float8","int2","int4",
  "int8","money","serial","bigserial","smallserial",
];

function isNumericType(dt) {
  return NUMERIC_TYPES.some(nt => (dt || "").toLowerCase().includes(nt));
}

// ─── Custom-field helpers ─────────────────────────────────────────────────────

// "2026-2027" → 2026, "2027" → 2027, null/undefined → null
function parseYearStart(academicYear) {
  if (!academicYear) return null;
  const m = String(academicYear).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Schema field types that count as numeric for aggregation compatibility.
const NUMERIC_SCHEMA_TYPES = new Set([
  "number", "integer", "float", "decimal", "numeric",
  "currency", "percent", "int",
]);
function isNumericSchemaType(schemaType) {
  return NUMERIC_SCHEMA_TYPES.has((schemaType || "text").toLowerCase());
}

// Column names in custom_field_schemas are generated from user-supplied labels and
// must be alphanumeric+underscore.  Validate before interpolating into SQL JSONB keys.
function isValidColName(name) {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name);
}

// SQL expression that extracts a custom field value from the `custom_fields` JSONB
// column.  Always returns text; callers must append ::numeric when needed.
function customFieldExpr(col) {
  if (!isValidColName(col))
    throw new Error(`Invalid custom field name: "${col}"`);
  return `(custom_fields->>'${col}')`;
}

/**
 * Resolve which columns of `tableName` are physical DB columns vs. custom fields
 * stored inside the `custom_fields` JSONB column.
 *
 * Lookup order (most specific first):
 *   1. institution_id + exact start-year of academicYear
 *   2. institution_id only (latest year)
 *   3. Any active schema for formName (global / shared form fallback)
 *
 * Returns { physical: Set<string>, custom: Set<string>, customSchemaTypes: Map<string,string> }
 */
async function resolveColumnSources(pool, tableName, institutionId, academicYear) {
  const formName = tableName.endsWith("_records")
    ? tableName.slice(0, -"_records".length)
    : tableName;

  // All physical columns currently in the table
  const { rows: physRows } = await pool.query(
    `SELECT column_name
     FROM   information_schema.columns
     WHERE  table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  const physical = new Set(physRows.map(r => r.column_name));

  const yearNum = parseYearStart(academicYear);

  // Base query – returns one row per unique column_name, latest year wins
  const fieldQ = (extra = "") => `
    SELECT DISTINCT ON (elem->>'column_name')
           elem->>'column_name' AS col,
           elem->>'type'        AS schema_type
    FROM   custom_field_schemas,
           jsonb_array_elements(schema->'fields') AS elem
    WHERE  form_name = $1
      AND  is_active = true
      AND  elem->>'column_name' IS NOT NULL
      ${extra}
    ORDER  BY elem->>'column_name', year DESC NULLS LAST`;

  let schemaRows = [];

  if (institutionId && yearNum) {
    const { rows } = await pool.query(
      fieldQ("AND institution_id = $2 AND year = $3"),
      [formName, institutionId, yearNum]
    );
    schemaRows = rows;
  }

  if (!schemaRows.length && institutionId) {
    const { rows } = await pool.query(
      fieldQ("AND institution_id = $2"),
      [formName, institutionId]
    );
    schemaRows = rows;
  }

  if (!schemaRows.length) {
    const { rows } = await pool.query(fieldQ(), [formName]);
    schemaRows = rows;
  }

  const custom = new Set();
  const customSchemaTypes = new Map();
  for (const r of schemaRows) {
    const col = r.col?.trim().toLowerCase();
    if (!col || physical.has(col)) continue;   // skip physical columns
    custom.add(col);
    customSchemaTypes.set(col, r.schema_type || "text");
  }

  return { physical, custom, customSchemaTypes };
}

function niceNumber(val) {
  if (!val || val <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const res = val / mag;
  if (res <= 1) return 1 * mag;
  if (res <= 2) return 2 * mag;
  if (res <= 5) return 5 * mag;
  return 10 * mag;
}

function niceInterval(nm) {
  if (!nm || nm <= 0) return 20;
  const raw = nm / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const res = raw / mag;
  if (res <= 1) return 1 * mag;
  if (res <= 2) return 2 * mag;
  if (res <= 5) return 5 * mag;
  return 10 * mag;
}

const AGG_LABELS = {
  none:           "Raw",
  sum:            "SUM",
  count:          "COUNT",
  avg:            "AVG",
  min:            "MIN",
  max:            "MAX",
  count_distinct: "COUNT DISTINCT",
};

function buildAggExpr(aggType, col) {
  switch (aggType) {
    case "sum":            return `SUM(${col}::numeric)`;
    case "count":          return `COUNT(*)`;
    case "avg":            return `AVG(${col}::numeric)`;
    case "min":            return `MIN(${col}::numeric)`;
    case "max":            return `MAX(${col}::numeric)`;
    case "count_distinct": return `COUNT(DISTINCT ${col})`;
    default:               return `${col}::numeric`;
  }
}

/**
 * Build the human-readable display SQL stored in kpi_config.query.
 * Accepts an optional `customFields` Set so that columns stored in the
 * custom_fields JSONB column are referenced correctly via ->> extraction
 * rather than as bare identifiers.
 */
function buildDisplaySql(cfg, customFields = new Set()) {
  const agg      = cfg.aggregation_type || "none";
  const groupCol = cfg.group_by_column  || cfg.x_col;
  const yCols    = cfg.y_cols || [];

  // Physical column → quoted identifier; custom field → JSONB ->> extraction
  const colRef = col =>
    customFields.has(col) ? customFieldExpr(col) : quoteIdent(col);

  // Every _records table has a `language` column ('en' | 'hi' | NULL).
  // Without this filter the query returns double records when Hindi rows exist.
  const langFilter = `(language = 'en' OR language IS NULL)`;

  const groupRef = colRef(groupCol);

  if (agg === "none") {
    return (
      `SELECT ${groupRef}, ${yCols.map(colRef).join(", ")}\n` +
      `FROM   ${cfg.table_name}\n` +
      `WHERE  ${groupRef} IS NOT NULL\n` +
      `  AND  ${langFilter}\n` +
      `ORDER  BY ${groupRef}`
    );
  }

  const yExprs = yCols.map(col => {
    const expr = buildAggExpr(agg, colRef(col));
    return `${expr} AS "${col}_${agg}"`;
  });

  return (
    `SELECT ${groupRef},\n` +
    `       ${yExprs.join(",\n       ")}\n` +
    `FROM   ${cfg.table_name}\n` +
    `WHERE  ${groupRef} IS NOT NULL\n` +
    `  AND  ${langFilter}\n` +
    `GROUP  BY ${groupRef}\n` +
    `ORDER  BY ${groupRef}`
  );
}

// ─── Security: input validation ───────────────────────────────────────────────

const VALID_AGG_TYPES   = new Set(["none","sum","count","avg","min","max","count_distinct"]);
const VALID_CHART_TYPES = new Set(["bar","bar_stack","line","area","pie","doughnut"]);
// Aggregations that only make sense on numeric columns
const NUMERIC_ONLY_AGGS = new Set(["sum","avg","min","max"]);

/**
 * Ensure aggregation_type is a known safe value.
 * Throws a 400-class Error if invalid (caught and returned as 400).
 */
function validateAggType(agg) {
  if (!VALID_AGG_TYPES.has(agg || "none"))
    throw Object.assign(new Error(`Invalid aggregation type "${agg}". Allowed: ${[...VALID_AGG_TYPES].join(", ")}`), { statusCode: 400 });
}

function validateChartType(ct) {
  if (!VALID_CHART_TYPES.has(ct || "bar"))
    throw Object.assign(new Error(`Invalid chart type "${ct}".`), { statusCode: 400 });
}

/**
 * Validate that table_name is whitelisted (exists in table_list as a dynamic form table).
 * Prevents arbitrary table access.
 */
async function validateTableWhitelist(pool, tableName) {
  // table_list stores form_name; dynamic-form tables are named <form_name>_records
  const { rows } = await pool.query(
    `SELECT 1 FROM table_list WHERE form_name || '_records' = $1 LIMIT 1`,
    [tableName]
  );
  if (!rows.length)
    throw Object.assign(new Error(`Table "${tableName}" is not a recognised data source. Only dynamic-form tables may be used for KPI creation.`), { statusCode: 400 });
}

/**
 * Load all column names+types for a table and validate that:
 *  1. x_col exists (physical OR custom field)
 *  2. group_by_column (if given) exists
 *  3. all y_cols exist
 *  4. aggregation is compatible with each y_col's data type / schema type
 *
 * Accepts two extra optional params so it can also approve columns that live
 * inside the custom_fields JSONB column rather than as physical table columns.
 *
 * Returns { colMap, custom, customSchemaTypes } — callers may use the custom
 * field sets to build JSONB-aware SQL expressions.
 */
async function validateColumns(pool, tableName, xCol, yCols, groupByCol, aggType, institutionId, academicYear) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type
     FROM   information_schema.columns
     WHERE  table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  if (!rows.length)
    throw Object.assign(new Error(`Table "${tableName}" was not found or has no columns.`), { statusCode: 400 });

  const colMap = new Map(rows.map(r => [r.column_name, r.data_type]));

  // Resolve custom fields (stored in custom_fields JSONB, not physical columns)
  const { custom, customSchemaTypes } = await resolveColumnSources(
    pool, tableName, institutionId || null, academicYear || null
  );

  // A column is valid if it exists as a physical column OR as a custom field
  const exist      = col => colMap.has(col) || custom.has(col);
  // Numeric check: physical → data_type; custom → schema type from custom_field_schemas
  const isNumericCol = col => {
    if (colMap.has(col)) return isNumericType(colMap.get(col));
    if (custom.has(col)) return isNumericSchemaType(customSchemaTypes.get(col));
    return false;
  };

  if (!exist(xCol))
    throw Object.assign(new Error(`X-axis column "${xCol}" does not exist in table "${tableName}".`), { statusCode: 400 });
  if (groupByCol && !exist(groupByCol))
    throw Object.assign(new Error(`Group-by column "${groupByCol}" does not exist in table "${tableName}".`), { statusCode: 400 });

  const agg = aggType || "none";
  for (const col of yCols) {
    if (!exist(col))
      throw Object.assign(new Error(`Y-axis column "${col}" does not exist in table "${tableName}".`), { statusCode: 400 });
    if (NUMERIC_ONLY_AGGS.has(agg) && !isNumericCol(col))
      throw Object.assign(new Error(
        `Aggregation "${agg.toUpperCase()}" requires a numeric column, but "${col}" is not numeric. ` +
        `Use COUNT or COUNT DISTINCT for text/date columns.`
      ), { statusCode: 400 });
  }

  return { colMap, custom, customSchemaTypes };
}

// ─── Role context from JWT ─────────────────────────────────────────────────────

function getRoleContext(req) {
  const roles = new Set(req.user?.roles || []);
  const isHospitalAdmin = roles.has("hospital_admin");
  const isFinanceAdmin  = roles.has("finance_admin");
  return {
    isInstAdmin:    roles.has("institute_admin"),
    isDeptAdmin:    roles.has("department_admin"),
    isHospitalAdmin,
    isFinanceAdmin,
    // Domain for hospital/finance scope — 'academic' for all other roles.
    role_domain: isHospitalAdmin ? "hospital" : isFinanceAdmin ? "finance" : "academic",
    institute_id:  String(req.user?.institutionId ?? ""),
    department_id: String(req.user?.departmentId  ?? ""),
    user_id:       String(req.user?.userId        ?? ""),
  };
}

// Each role maps to exactly one scope value — institute / department / hospital / finance
// are mutually exclusive and never overlap, even when they share the same institute_id.
// kpi_config.scope is the sole partition key; institute_id / department_id only
// disambiguate WITHIN a scope (which institute, which department).
const SCOPE_RULES = {
  institute:  { role: "isInstAdmin",     idField: "institute_id"  },
  department: { role: "isDeptAdmin",     idField: "department_id" },
  hospital:   { role: "isHospitalAdmin", idField: "institute_id"  },
  finance:    { role: "isFinanceAdmin",  idField: "institute_id"  },
};

// Returns { clause, params }.
//
// requestedScope ("institute" | "department" | "hospital" | "finance" | null):
//   When provided (from ?scope= query param), ONLY that scope is returned, and the
//   caller must actually hold the matching role. This prevents a dual-role user
//   (e.g. institute_admin + department_admin via NOA) from seeing institute KPIs on
//   the department page, or a hospital/finance admin's KPIs leaking into the
//   institute admin's own list just because they share an institute_id.
//   When null, every scope the caller legitimately holds is returned (OR'd).
function buildScopeWhere(ctx, alias = "c", requestedScope = null) {
  const a = alias ? `${alias}.` : "";

  const rule = SCOPE_RULES[requestedScope];
  if (rule) {
    const id = ctx[rule.idField];
    if (ctx[rule.role] && id)
      return { clause: `WHERE ${a}scope = '${requestedScope}' AND ${a}${rule.idField} = $1`, params: [id] };
    return { clause: "WHERE 1=0", params: [] };
  }

  // No explicit scope — return every scope this caller holds (OR'd), not a priority pick.
  const conditions = [];
  const params = [];
  for (const [scopeName, r] of Object.entries(SCOPE_RULES)) {
    const id = ctx[r.idField];
    if (ctx[r.role] && id) {
      params.push(id);
      conditions.push(`(${a}scope = '${scopeName}' AND ${a}${r.idField} = $${params.length})`);
    }
  }
  if (!conditions.length) return { clause: "WHERE 1=0", params: [] };
  return { clause: `WHERE ${conditions.join(" OR ")}`, params };
}

// Append an extra AND condition to an existing scope result
function appendAnd(scope, condition, ...newParams) {
  const idx = scope.params.length + 1;
  // Replace placeholder $N in condition with actual position
  let resolved = condition;
  newParams.forEach((_, i) => {
    resolved = resolved.replace(`$?`, `$${idx + i}`);
  });
  const clause = scope.clause
    ? `${scope.clause} AND ${resolved}`
    : `WHERE ${resolved}`;
  return { clause, params: [...scope.params, ...newParams] };
}

async function checkOwnership(pool, configId, ctx) {
  // A user may have multiple roles (e.g. NOA-elevated dept admin also has institute_admin).
  // Accept ownership for ANY scope the caller legitimately controls — OR logic.
  const conditions = [];
  const params = [configId];

  for (const [scopeName, rule] of Object.entries(SCOPE_RULES)) {
    const id = ctx[rule.idField];
    if (ctx[rule.role] && id) {
      params.push(id);
      conditions.push(`(scope = '${scopeName}' AND ${rule.idField} = $${params.length})`);
    }
  }

  if (!conditions.length) return false;

  const { rows } = await pool.query(
    `SELECT id FROM kpi_config WHERE id = $1 AND (${conditions.join(" OR ")})`,
    params
  );
  return rows.length > 0;
}

// ─── Ensure tables + migrations (runs once per process) ───────────────────────
async function ensureTables(pool) {
  if (_initialized) return;

  // 1. Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_config (
      id                     SERIAL        PRIMARY KEY,
      title                  TEXT          NOT NULL DEFAULT 'KPI Chart',
      description            TEXT,
      table_name             VARCHAR(255)  NOT NULL,
      x_col                  VARCHAR(255)  NOT NULL,
      y_cols                 TEXT[]        NOT NULL,
      chart_type             VARCHAR(50)   NOT NULL DEFAULT 'bar',
      query                  TEXT,
      scope                  VARCHAR(20)   NOT NULL DEFAULT 'institute',
      institute_id           TEXT,
      department_id          TEXT,
      show_on_dashboard      BOOLEAN       NOT NULL DEFAULT false,
      dashboard_display_type TEXT          NOT NULL DEFAULT 'single',
      dashboard_group_name   TEXT,
      created_by             TEXT,
      updated_by             TEXT,
      created_at             TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMP     NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kpi_svg_reports (
      id          SERIAL    PRIMARY KEY,
      config_id   INTEGER   REFERENCES kpi_config(id) ON DELETE CASCADE,
      title       TEXT,
      svg_data    TEXT      NOT NULL,
      report_data JSONB,
      svg_bytes   INTEGER   GENERATED ALWAYS AS (length(svg_data)) STORED,
      exported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dashboard_kpi (
      id            SERIAL    PRIMARY KEY,
      kpi_config_id INTEGER   NOT NULL REFERENCES kpi_config(id) ON DELETE CASCADE,
      created_by    TEXT,
      updated_by    TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Add new columns to existing tables (each individually so one failure doesn't block others)
  const safeAdd = async (sql) => { try { await pool.query(sql); } catch (err) { logger.warn("KPI DDL safeAdd skipped", { sql: sql.slice(0, 120), error: err.message }); } };

  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS scope                  VARCHAR(20) NOT NULL DEFAULT 'institute'`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS show_on_dashboard      BOOLEAN     NOT NULL DEFAULT false`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS dashboard_display_type TEXT        NOT NULL DEFAULT 'single'`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS dashboard_group_name   TEXT`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS academic_year          VARCHAR(20)`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS aggregation_type       VARCHAR(20) NOT NULL DEFAULT 'none'`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS group_by_column        VARCHAR(255)`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS export_title           TEXT`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS title_hi               TEXT`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS description_hi         TEXT`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS export_title_hi        TEXT`);

  // 3. Convert old INTEGER columns to TEXT (handles projects that started before this refactor)
  const safeConvert = async (table, col) => {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name=$1 AND column_name=$2 AND data_type='integer'`,
        [table, col]
      );
      if (rows.length > 0) {
        await pool.query(`ALTER TABLE ${table} ALTER COLUMN ${col} TYPE TEXT USING ${col}::TEXT`);
      }
    } catch (_) {}
  };

  const safeAddText = async (table, col) => {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [table, col]
      );
      if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
    } catch (_) {}
  };

  await safeConvert("kpi_config", "institute_id");
  await safeConvert("kpi_config", "department_id");
  await safeConvert("kpi_config", "created_by");
  await safeConvert("kpi_config", "updated_by");
  await safeConvert("kpi_config", "row_limit");   // was integer, safe to ignore if missing
  await safeConvert("dashboard_kpi", "created_by");
  await safeConvert("dashboard_kpi", "updated_by");

  await safeAddText("kpi_config", "institute_id");
  await safeAddText("kpi_config", "department_id");

  await safeAdd(`ALTER TABLE kpi_svg_reports ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20)`);

  // 4. Performance indexes (idempotent — IF NOT EXISTS)
  await safeAdd(`CREATE INDEX IF NOT EXISTS idx_kpi_config_scope_inst   ON kpi_config (scope, institute_id)  WHERE scope = 'institute'`);
  await safeAdd(`CREATE INDEX IF NOT EXISTS idx_kpi_config_scope_dept   ON kpi_config (scope, department_id) WHERE scope = 'department'`);
  await safeAdd(`CREATE INDEX IF NOT EXISTS idx_kpi_config_dashboard    ON kpi_config (show_on_dashboard)    WHERE show_on_dashboard = true`);
  await safeAdd(`CREATE INDEX IF NOT EXISTS idx_kpi_svg_config_id       ON kpi_svg_reports (config_id, exported_at DESC)`);

  _initialized = true;
}

// Raw (non-aggregated) queries cap — prevents memory blow-up on large tables.
// Aggregation queries are not capped because GROUP BY already reduces cardinality.
const RAW_ROW_LIMIT    = 5000;
// Statement timeout for KPI queries (30 s). Prevents runaway queries from blocking
// the connection pool.  Set per-connection so it doesn't affect other routes.
const QUERY_TIMEOUT_MS = 30_000;

// ─── Core query runner — supports raw SELECT and aggregation (GROUP BY) ───────
// lang: "en" | "hi" — filters records by the language column so the chart never
//       mixes English and Hindi translation copies of the same submission.
async function runConfigQuery(pool, cfg, lang = "en") {
  const yArr = cfg.y_cols || [];
  if (!yArr.length)    throw new Error("No y_cols configured");
  if (!cfg.x_col)      throw new Error("No x_col configured");
  if (!cfg.table_name) throw new Error("No table_name configured");

  const agg            = cfg.aggregation_type || "none";
  const groupCol       = cfg.group_by_column  || cfg.x_col;
  const normalizedLang = lang === "hi" ? "hi" : "en";

  // Determine which columns are custom fields (stored in custom_fields JSONB).
  // This runs one lightweight schema lookup, not the full data query.
  const { custom } = await resolveColumnSources(
    pool, cfg.table_name, cfg.institute_id || null, cfg.academic_year || null
  );

  // SQL reference for a column:
  //   physical column → "col_name" (quoted identifier)
  //   custom field    → (custom_fields->>'col_name') (JSONB text extraction)
  const colRef        = col => custom.has(col) ? customFieldExpr(col) : quoteIdent(col);
  // Numeric variant — appends ::numeric cast (used for aggregations and raw y-axis)
  const colRefNumeric = col => `${colRef(col)}::numeric`;

  const groupColRef = colRef(groupCol);

  let selectParts;

  if (agg === "none") {
    selectParts = [
      `${colRef(cfg.x_col)} AS __x__`,
      ...yArr.map((col, i) => `COALESCE(${colRefNumeric(col)}, 0) AS __y${i}__`),
    ];
  } else {
    selectParts = [`${groupColRef} AS __x__`];
    yArr.forEach((col, i) => {
      const cRef = colRef(col);
      const cNum = colRefNumeric(col);
      let expr;
      switch (agg) {
        case "sum":            expr = `COALESCE(SUM(${cNum}), 0)`; break;
        case "count":          expr = `COUNT(*)`; break;
        case "avg":            expr = `COALESCE(AVG(${cNum}), 0)`; break;
        case "min":            expr = `COALESCE(MIN(${cNum}), 0)`; break;
        case "max":            expr = `COALESCE(MAX(${cNum}), 0)`; break;
        case "count_distinct": expr = `COUNT(DISTINCT ${cRef})`; break;
        default:               expr = `COALESCE(${cNum}, 0)`;
      }
      selectParts.push(`${expr} AS __y${i}__`);
    });
  }

  const whereColRef   = agg === "none" ? colRef(cfg.x_col) : groupColRef;
  const groupByClause = agg !== "none" ? `GROUP BY ${groupColRef}` : "";
  // Only cap raw (non-aggregated) queries; aggregation naturally reduces cardinality
  const limitClause   = agg === "none" ? `LIMIT ${RAW_ROW_LIMIT}` : "";

  // ── Parameterized WHERE conditions ────────────────────────────────────────
  const wConds  = [`${whereColRef} IS NOT NULL`];
  const wParams = [];

  // Language filter — prevents double-counting when Hindi translation rows exist.
  // NULL covers legacy rows created before the language column was added to the table.
  wConds.push(`(language = $${wParams.length + 1} OR language IS NULL)`);
  wParams.push(normalizedLang);

  // Tenant scope filter — ensures data belongs to the KPI's own institution/department.
  // Without this, KPIs on shared form tables would aggregate data across all tenants.
  if (cfg.scope === "institute" && cfg.institute_id) {
    wConds.push(`institution_id = $${wParams.length + 1}`);
    wParams.push(cfg.institute_id);
  } else if (cfg.scope === "department" && cfg.department_id) {
    wConds.push(`department_id = $${wParams.length + 1}`);
    wParams.push(cfg.department_id);
  }

  const sqlParts = [
    `SELECT ${selectParts.join(", ")}`,
    `FROM   ${quoteIdent(cfg.table_name)}`,
    `WHERE  ${wConds.join(" AND ")}`,
    groupByClause,
    `ORDER  BY ${agg === "none" ? colRef(cfg.x_col) : groupColRef}`,
    limitClause,
  ].filter(Boolean);

  const sql = sqlParts.join(" ");

  // Acquire a client so we can set a per-connection statement_timeout
  const client = await pool.connect();
  let rows;
  try {
    await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
    ({ rows } = await client.query(sql, wParams));
  } catch (err) {
    // Translate PG error codes into user-friendly dependency errors
    if (err.code === "42P01") // undefined_table
      throw Object.assign(new Error(`Data source table "${cfg.table_name}" no longer exists. The underlying form may have been deleted.`), { dependency: true });
    if (err.code === "42703") // undefined_column
      throw Object.assign(new Error(`One or more columns configured in this KPI no longer exist. The form schema may have changed.`), { dependency: true });
    if (err.code === "57014") // query_canceled (timeout)
      throw new Error(`KPI query timed out after ${QUERY_TIMEOUT_MS / 1000} s. Try adding an aggregation or reducing the dataset.`);
    throw err;
  } finally {
    client.release();
  }

  const xData  = rows.map(r => String(r.__x__));
  const series = yArr.map((col, i) => ({
    column: agg !== "none" ? `${AGG_LABELS[agg] || agg}(${col})` : col,
    values: rows.map(r => {
      const v = parseFloat(r[`__y${i}__`]);
      return isNaN(v) ? 0 : v;   // guard NaN from NULL / non-numeric casts
    }),
  }));

  // Attach translated labels from the form schema so all consumers
  // (chart legends, data table, SVG export, dashboard panel) can use
  // label_en / label_hi without a separate client-side fetch.
  try {
    if (cfg.table_name?.endsWith("_records")) {
      const formName = cfg.table_name.slice(0, -"_records".length);
      const instId   = cfg.institute_id || null;
      const labelQ   = instId
        ? `SELECT DISTINCT ON (elem->>'column_name')
             elem->>'column_name' AS col,
             elem->'label'->>'en' AS label_en,
             elem->'label'->>'hi' AS label_hi
           FROM   custom_field_schemas,
                  jsonb_array_elements(schema->'fields') AS elem
           WHERE  form_name = $1
             AND  is_active = true
             AND  institution_id = $2
             AND  elem->>'column_name' IS NOT NULL
           ORDER  BY elem->>'column_name', year DESC NULLS LAST`
        : `SELECT DISTINCT ON (elem->>'column_name')
             elem->>'column_name' AS col,
             elem->'label'->>'en' AS label_en,
             elem->'label'->>'hi' AS label_hi
           FROM   custom_field_schemas,
                  jsonb_array_elements(schema->'fields') AS elem
           WHERE  form_name = $1
             AND  is_active = true
             AND  elem->>'column_name' IS NOT NULL
           ORDER  BY elem->>'column_name', year DESC NULLS LAST`;
      const { rows: lRows } = await pool.query(labelQ, instId ? [formName, instId] : [formName]);
      const labelMap = {};
      lRows.forEach(r => { if (r.col) labelMap[r.col.trim().toLowerCase()] = { en: r.label_en, hi: r.label_hi }; });
      yArr.forEach((col, i) => {
        const info = labelMap[col.trim().toLowerCase()];
        if (!info) return;
        series[i].label_en = info.en;
        series[i].label_hi = info.hi;
        const raw = normalizedLang === "hi" ? (info.hi || info.en || col) : (info.en || col);
        series[i].label   = agg !== "none" ? `${AGG_LABELS[agg] || agg}(${raw})` : raw;
      });
    }
  } catch (_) { /* label lookup must never break chart rendering */ }

  const allVals = series.flatMap(s => s.values);
  const dataMax = allVals.length ? Math.max(...allVals) : 100;
  const nm      = niceNumber(dataMax);

  return {
    x:          xData,
    series,
    row_count:  rows.length,
    truncated:  agg === "none" && rows.length === RAW_ROW_LIMIT,
    y_range:    { min: 0, max: nm, interval: niceInterval(nm) },
    y_stats:    { min: allVals.length ? Math.min(...allVals) : 0, max: dataMax },
    sql:        buildDisplaySql(cfg, custom),   // custom set makes display SQL reflect JSONB extractions
    aggregation: agg,
    fetched_at: new Date().toISOString(),
  };
}


// =============================================================================
//  TABLE ENDPOINTS
// =============================================================================

router.get("/tables", async (req, res) => {
  const { schema = "public" } = req.query;
  const ctx = getRoleContext(req);
  try {
    await ensureTables(req.pool);
    // Only list tables from the Dynamic Form Creation module (<form_name>_records).
    // hospital_admin / finance_admin: restrict to their domain's form tables so they
    // cannot build KPIs against another domain's data.
    // department_admin: restrict to academic-domain forms only — they must never see
    // hospital/finance tables in the Source Table dropdown. A dual-role NOA user who
    // also holds institute_admin keeps the unfiltered institute_admin view (unchanged).
    const params = [schema];
    let domainFilter = "";
    if (ctx.isHospitalAdmin || ctx.isFinanceAdmin) {
      domainFilter = `AND COALESCE(tl.form_domain, 'academic') = $${params.push(ctx.role_domain)}`;
    } else if (ctx.isDeptAdmin && !ctx.isInstAdmin) {
      domainFilter = `AND COALESCE(tl.form_domain, 'academic') = $${params.push("academic")}`;
    }

    const { rows } = await req.pool.query(
      `SELECT t.table_name,
              t.table_schema AS schema_name
       FROM   information_schema.tables t
       JOIN   table_list tl
              ON t.table_name = tl.form_name || '_records'
       LEFT   JOIN pg_stat_user_tables s
              ON s.schemaname = t.table_schema AND s.relname = t.table_name
       LEFT   JOIN pg_class c
              ON c.relname = t.table_name
             AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.table_schema)
       WHERE  t.table_schema = $1
         AND  t.table_type   = 'BASE TABLE'
         ${domainFilter}
       ORDER  BY t.table_name`,
      params
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error("GET /api/kpi/tables", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/tables/:tableName/columns", async (req, res) => {
  const { tableName } = req.params;
  // Optional: ?year=2026-2027 scopes custom fields to a specific academic year.
  // When omitted, the latest schema for the institution is used (safe default).
  const { year } = req.query;
  const ctx = getRoleContext(req);

  // All KPI-selectable tables are dynamic-form tables named <form_name>_records
  if (!tableName.endsWith("_records")) {
    return res.status(400).json({ ok: false, error: `"${tableName}" is not a dynamic-form table` });
  }
  const formName = tableName.slice(0, -"_records".length);

  try {
    // Build label + schema-type maps from custom_field_schemas.
    // DISTINCT ON (col) + ORDER BY year DESC → most recent label wins when a column
    // label was renamed across schema versions.
    // Institution-scoped first; falls back to global (shared / super-admin forms).
    const SCOPED_SCHEMA_Q = `
      SELECT DISTINCT ON (elem->>'column_name')
        elem->>'column_name'        AS col,
        elem->'label'->>'en'        AS label_en,
        elem->'label'->>'hi'        AS label_hi,
        elem->>'type'               AS schema_type
      FROM   custom_field_schemas cfs,
             jsonb_array_elements(cfs.schema->'fields') AS elem
      WHERE  cfs.form_name = $1 AND cfs.institution_id = $2 AND cfs.is_active = true
        AND  elem->>'column_name' IS NOT NULL
      ORDER  BY elem->>'column_name', cfs.year DESC NULLS LAST`;

    const GLOBAL_SCHEMA_Q = `
      SELECT DISTINCT ON (elem->>'column_name')
        elem->>'column_name'        AS col,
        elem->'label'->>'en'        AS label_en,
        elem->'label'->>'hi'        AS label_hi,
        elem->>'type'               AS schema_type
      FROM   custom_field_schemas cfs,
             jsonb_array_elements(cfs.schema->'fields') AS elem
      WHERE  cfs.form_name = $1 AND cfs.is_active = true
        AND  elem->>'column_name' IS NOT NULL
      ORDER  BY elem->>'column_name', cfs.year DESC NULLS LAST`;

    let schemaRows = [];

    if (ctx.institute_id) {
      const { rows } = await req.pool.query(SCOPED_SCHEMA_Q, [formName, ctx.institute_id]);
      schemaRows = rows;
    }

    // Fallback: shared / super-admin forms that have no per-institution schema row
    if (!schemaRows.length) {
      const { rows } = await req.pool.query(GLOBAL_SCHEMA_Q, [formName]);
      schemaRows = rows;
    }

    // Build a map: column_name → { label_en, label_hi, schema_type }
    const labelMap = {};
    schemaRows.forEach(r => {
      const col = r.col?.trim().toLowerCase().replace(/\s+/g, "_");
      if (col && !labelMap[col]) {
        labelMap[col] = {
          label_en:    r.label_en    || null,
          label_hi:    r.label_hi    || null,
          schema_type: r.schema_type || "text",
        };
      }
    });

    const schemaColumns = Object.keys(labelMap);

    if (!schemaColumns.length) {
      return res.json({ ok: true, data: [] });
    }

    // ── Physical columns ───────────────────────────────────────────────────
    // Columns that exist BOTH in the schema AND as real PostgreSQL columns.
    const { rows: physRows } = await req.pool.query(
      `SELECT column_name, data_type, is_nullable, ordinal_position
       FROM   information_schema.columns
       WHERE  table_schema = 'public' AND table_name = $1
         AND  column_name = ANY($2::text[])
       ORDER  BY ordinal_position`,
      [tableName, schemaColumns]
    );
    const physColNames = new Set(physRows.map(r => r.column_name));

    // ── Custom fields ──────────────────────────────────────────────────────
    // Columns declared in custom_field_schemas but NOT present as physical columns —
    // their values are stored inside the custom_fields JSONB column per record.
    // If ?year= is supplied, resolve only columns active for that academic year
    // (enforces institution-A vs institution-B and year-2026 vs year-2027 isolation).
    let customColNames = schemaColumns.filter(col => !physColNames.has(col));

    if (customColNames.length && (year || ctx.institute_id)) {
      // resolveColumnSources applies institution + year scoping with graceful fallback
      const sources = await resolveColumnSources(
        req.pool, tableName, ctx.institute_id || null, year || null
      );
      // Only expose custom fields that belong to this institution's (and year's) schema
      customColNames = customColNames.filter(col => sources.custom.has(col));
    }

    // ── Merge result ───────────────────────────────────────────────────────
    const physResult = physRows.map(r => ({
      ...r,
      is_numeric:      isNumericType(r.data_type),
      is_custom_field: false,
      schema_type:     labelMap[r.column_name]?.schema_type || null,
      label_en:        labelMap[r.column_name]?.label_en    || null,
      label_hi:        labelMap[r.column_name]?.label_hi    || null,
    }));

    const customResult = customColNames.map(col => ({
      column_name:      col,
      data_type:        "text",     // JSONB ->> always returns text
      is_nullable:      "YES",
      ordinal_position: null,
      is_numeric:       isNumericSchemaType(labelMap[col]?.schema_type || "text"),
      is_custom_field:  true,
      schema_type:      labelMap[col]?.schema_type || "text",
      label_en:         labelMap[col]?.label_en    || null,
      label_hi:         labelMap[col]?.label_hi    || null,
    }));

    const result = [...physResult, ...customResult];

    if (!result.length) {
      return res.status(404).json({ ok: false, error: `Table "${tableName}" not found or has no schema-defined columns` });
    }

    res.json({ ok: true, data: result });
  } catch (err) {
    logger.error("GET /api/kpi/tables/:tableName/columns", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  CONFIG ENDPOINTS
// =============================================================================

router.post("/configs", async (req, res) => {
  const ctx = getRoleContext(req);
  if (!ctx.isInstAdmin && !ctx.isDeptAdmin && !ctx.isHospitalAdmin && !ctx.isFinanceAdmin)
    return res.status(403).json({ ok: false, error: "Only Institute Admin, Department Admin, Hospital Admin, or Finance Admin can create KPIs." });

  const {
    title                  = "KPI Chart",
    description            = "",
    table_name,
    x_col,
    y_cols                 = [],
    chart_type             = "bar",
    show_on_dashboard      = false,
    dashboard_display_type = "single",
    dashboard_group_name   = null,
    academic_year          = null,
    aggregation_type       = "none",
    group_by_column        = null,
    export_title           = null,
  } = req.body;

  if (!table_name)    return res.status(400).json({ ok: false, error: "table_name is required" });
  if (!x_col)         return res.status(400).json({ ok: false, error: "x_col is required" });
  if (!y_cols.length) return res.status(400).json({ ok: false, error: "y_cols must not be empty" });

  // Each role maps to exactly one scope value — hospital_admin/finance_admin always
  // get their own scope (never 'institute'), so their KPIs never leak into the
  // institute admin's list even though they share the same institute_id.
  // For users who hold both institute_admin and department_admin (e.g. NOA-elevated),
  // honour the client's requested scope so DeptKpiPage creates dept-scoped KPIs.
  const requestedScope = req.body.scope;
  let scope, institute_id, department_id;
  if (ctx.isHospitalAdmin) {
    scope = "hospital"; institute_id = ctx.institute_id; department_id = null;
  } else if (ctx.isFinanceAdmin) {
    scope = "finance"; institute_id = ctx.institute_id; department_id = null;
  } else if (requestedScope === "department" && ctx.isDeptAdmin) {
    if (!ctx.department_id)
      return res.status(400).json({ ok: false, error: "No department is associated with your account." });
    scope = "department"; institute_id = null; department_id = ctx.department_id;
  } else if (ctx.isInstAdmin) {
    scope = "institute"; institute_id = ctx.institute_id; department_id = null;
  } else if (ctx.isDeptAdmin) {
    if (!ctx.department_id)
      return res.status(400).json({ ok: false, error: "No department is associated with your account." });
    scope = "department"; institute_id = null; department_id = ctx.department_id;
  } else {
    return res.status(403).json({ ok: false, error: "Not authorized to create KPIs." });
  }

  try {
    await ensureTables(req.pool);

    // ── Security & validation ──────────────────────────────────────────────────
    validateAggType(aggregation_type);
    validateChartType(chart_type);
    await validateTableWhitelist(req.pool, table_name);

    // hospital_admin / finance_admin: block creation of KPIs against another domain's
    // form tables. Fail closed — if the table is not in their domain, reject.
    if (ctx.isHospitalAdmin || ctx.isFinanceAdmin) {
      const { rows: domainRows } = await req.pool.query(
        `SELECT 1 FROM table_list
         WHERE form_name || '_records' = $1
           AND COALESCE(form_domain, 'academic') = $2
         LIMIT 1`,
        [table_name, ctx.role_domain]
      );
      if (!domainRows.length)
        return res.status(403).json({
          ok: false,
          error: `Table "${table_name}" does not belong to the ${ctx.role_domain} domain.`,
        });
    }
    const { custom: customFields } = await validateColumns(
      req.pool, table_name, x_col, y_cols, group_by_column, aggregation_type,
      ctx.institute_id, academic_year
    );

    // ── Duplicate detection ────────────────────────────────────────────────────
    // Warn (not block) if an identical KPI config already exists for this scope.
    const effectiveGroupBy = group_by_column || null;
    const dupIdField = SCOPE_RULES[scope].idField; // 'institute_id' or 'department_id'
    const dupId       = scope === "department" ? department_id : institute_id;
    const { rows: dupRows } = await req.pool.query(
      `SELECT id, title FROM kpi_config
       WHERE  table_name        = $1
         AND  x_col             = $2
         AND  y_cols            = $3
         AND  aggregation_type  = $4
         AND  scope             = '${scope}'
         AND  ${dupIdField}     = $5
         AND  (academic_year IS NOT DISTINCT FROM $6)
         AND  (group_by_column  IS NOT DISTINCT FROM $7)
       LIMIT 3`,
      [table_name, x_col, y_cols, aggregation_type || "none", dupId,
       academic_year || null, effectiveGroupBy]
    );
    const duplicates = dupRows;

    // Auto-translate metadata to Hindi
    const { title_hi, description_hi, export_title_hi } =
      await autoTranslateKpiMeta(title, description, export_title);

    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type,
                       aggregation_type, group_by_column };

    const { rows } = await req.pool.query(
      `INSERT INTO kpi_config
         (title, title_hi, description, description_hi, table_name, x_col, y_cols, chart_type, query,
          scope, institute_id, department_id,
          show_on_dashboard, dashboard_display_type, dashboard_group_name,
          academic_year, aggregation_type, group_by_column,
          export_title, export_title_hi,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [title, title_hi, description, description_hi,
       table_name, x_col, y_cols, chart_type, buildDisplaySql(cfgDraft, customFields),
       scope, institute_id || null, department_id || null,
       show_on_dashboard, dashboard_display_type, dashboard_group_name || null,
       academic_year || null, aggregation_type || "none", group_by_column || null,
       export_title || null, export_title_hi, ctx.user_id, ctx.user_id]
    );
    const savedRow    = rows[0];
    const queryResult = await runConfigQuery(req.pool, savedRow, req.query.lang || "en");

    await writeAuditLog(req, {
      actionType: "KPI_CREATED",
      entityType: "kpi",
      entityId:   String(savedRow.id),
      newValue: {
        title:            savedRow.title,
        scope:            savedRow.scope,
        table_name:       savedRow.table_name,
        aggregation_type: savedRow.aggregation_type,
        academic_year:    savedRow.academic_year,
        institute_id:     savedRow.institute_id,
        department_id:    savedRow.department_id,
      },
      message: `KPI Created - "${savedRow.title}"`,
    });

    res.status(201).json({
      ok: true,
      data:         savedRow,
      query_result: queryResult,
      updated:      false,
      // Inform frontend if similar KPIs exist so it can show a non-blocking warning
      similar_kpis: duplicates.length ? duplicates : undefined,
    });

  } catch (err) {
    const status = err.statusCode || 500;
    logger.error("POST /api/kpi/configs", { ...getLogContext(req), stack: err.stack });
    res.status(status).json({ ok: false, error: err.message });
  }
});

router.get("/configs", async (req, res) => {
  const ctx  = getRoleContext(req);
  let scope  = buildScopeWhere(ctx, "c", req.query.scope || null);
  if (req.query.year) scope = appendAnd(scope, "(c.academic_year = $? OR c.academic_year IS NULL)", req.query.year);

  try {
    await ensureTables(req.pool);
    const { rows } = await req.pool.query(
      `SELECT c.*,
              s.id          AS svg_id,
              s.exported_at AS svg_exported_at,
              s.svg_bytes   AS svg_bytes
       FROM   kpi_config c
       LEFT   JOIN LATERAL (
         SELECT id, exported_at, svg_bytes
         FROM   kpi_svg_reports
         WHERE  config_id = c.id
         ORDER  BY exported_at DESC LIMIT 1
       ) s ON TRUE
       ${scope.clause}
       ORDER  BY c.updated_at DESC`,
      scope.params
    );

    // Enrich any rows missing Hindi translations — mirrors enrichSchemaLabels in forms.js
    const enriched = await Promise.all(
      rows.map(r => enrichKpiRowHindi(req.pool, r))
    );

    res.json({ ok: true, data: enriched });
  } catch (err) {
    logger.error("GET /api/kpi/configs", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    await ensureTables(req.pool);
    const { rows, rowCount } = await req.pool.query(
      `SELECT c.*, s.id AS svg_id, s.exported_at AS svg_exported_at, s.svg_bytes
       FROM   kpi_config c
       LEFT   JOIN LATERAL (
         SELECT id, exported_at, svg_bytes FROM kpi_svg_reports
         WHERE config_id=c.id ORDER BY exported_at DESC LIMIT 1
       ) s ON TRUE
       WHERE c.id=$1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const enriched = await enrichKpiRowHindi(req.pool, rows[0]);
    res.json({ ok: true, data: enriched });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/configs/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  const {
    title, description,
    table_name, x_col, y_cols, chart_type,
    show_on_dashboard, dashboard_display_type, dashboard_group_name,
    academic_year, aggregation_type, group_by_column,
    export_title,
    // Optimistic lock token: client sends the updated_at it last observed.
    // If the row was saved by someone else in the meantime, the UPDATE hits 0
    // rows and we return 409 instead of silently overwriting the other edit.
    updated_at: lock_token,
  } = req.body;
  try {
    await ensureTables(req.pool);
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });

    // ── Security & validation ──────────────────────────────────────────────────
    validateAggType(aggregation_type);
    validateChartType(chart_type);
    await validateTableWhitelist(req.pool, table_name);
    const { custom: customFields } = await validateColumns(
      req.pool, table_name, x_col, y_cols, group_by_column, aggregation_type,
      ctx.institute_id, academic_year
    );

    // Auto-translate metadata to Hindi
    const { title_hi, description_hi, export_title_hi } =
      await autoTranslateKpiMeta(title, description, export_title);

    // Fetch old values for audit log diff
    const { rows: oldRows } = await req.pool.query(
      `SELECT title, table_name, x_col, y_cols, chart_type, aggregation_type, academic_year FROM kpi_config WHERE id=$1`,
      [req.params.id]
    );

    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type,
                       aggregation_type, group_by_column };

    // Build WHERE clause — include optimistic lock check when client sends the token.
    const baseParams = [
      title, title_hi, description, description_hi,
      table_name, x_col, y_cols, chart_type,
      buildDisplaySql(cfgDraft, customFields), show_on_dashboard ?? false,
      dashboard_display_type || "single", dashboard_group_name || null,
      academic_year || null, aggregation_type || "none", group_by_column || null,
      export_title || null, export_title_hi, ctx.user_id, req.params.id,
    ];
    const lockClause = lock_token
      ? `AND updated_at = $${baseParams.length + 1}`
      : "";
    if (lock_token) baseParams.push(new Date(lock_token));

    const { rows, rowCount } = await req.pool.query(
      `UPDATE kpi_config SET
         title=$1, title_hi=$2, description=$3, description_hi=$4,
         table_name=$5, x_col=$6, y_cols=$7, chart_type=$8,
         query=$9, show_on_dashboard=$10, dashboard_display_type=$11, dashboard_group_name=$12,
         academic_year=$13, aggregation_type=$14, group_by_column=$15,
         export_title=$16, export_title_hi=$17,
         updated_by=$18, updated_at=NOW()
       WHERE id=$19 ${lockClause} RETURNING *`,
      baseParams
    );

    if (!rowCount) {
      // Distinguish: was it deleted, or did someone else save first?
      const { rowCount: stillExists } = await req.pool.query(
        `SELECT 1 FROM kpi_config WHERE id=$1`, [req.params.id]
      );
      if (!stillExists) return res.status(404).json({ ok: false, error: "Config not found" });
      return res.status(409).json({
        ok: false,
        error: "This KPI was modified by another user while you were editing. Please close the form, reload the list, and try again.",
      });
    }

    await writeAuditLog(req, {
      actionType: "KPI_UPDATED",
      entityType: "kpi",
      entityId:   String(req.params.id),
      oldValue:   oldRows[0] || null,
      newValue: {
        title, table_name, x_col, y_cols, chart_type,
        aggregation_type: aggregation_type || "none",
        academic_year:    academic_year || null,
      },
      message: `KPI Updated - "${title}"`,
    });

    const queryResult = await runConfigQuery(req.pool, rows[0], req.query.lang || "en");
    res.json({ ok: true, data: rows[0], query_result: queryResult });
  } catch (err) {
    const status = err.statusCode || 500;
    logger.error("PUT /api/kpi/configs/:id", { ...getLogContext(req), stack: err.stack });
    res.status(status).json({ ok: false, error: err.message });
  }
});

router.delete("/configs/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });

    // Fetch title for audit log before deletion
    const { rows: cfgRows } = await req.pool.query(
      `SELECT title, scope, institute_id, department_id FROM kpi_config WHERE id=$1`, [req.params.id]
    );

    const { rowCount } = await req.pool.query(`DELETE FROM kpi_config WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });

    await writeAuditLog(req, {
      actionType: "KPI_DELETED",
      entityType: "kpi",
      entityId:   String(req.params.id),
      oldValue:   cfgRows[0] || null,
      message:    `KPI Deleted - "${cfgRows[0]?.title || req.params.id}"`,
    });

    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    logger.error("DELETE /api/kpi/configs/:id", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  REGENERATE — refresh existing config data, no new config created
// =============================================================================

router.post("/configs/:id/regenerate", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    await ensureTables(req.pool);
    const { rows: cfgRows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_config WHERE id=$1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });

    const cfg    = cfgRows[0];
    const result = await runConfigQuery(req.pool, cfg, req.query.lang || "en");

    // Only update the cached query string; do NOT touch updated_at so that
    // regenerating a chart doesn't invalidate concurrent edit sessions.
    await req.pool.query(
      `UPDATE kpi_config SET query=$1 WHERE id=$2`,
      [result.sql, cfg.id]
    );

    await writeAuditLog(req, {
      actionType: "KPI_REGENERATED",
      entityType: "kpi",
      entityId:   String(cfg.id),
      newValue: {
        title:         cfg.title,
        row_count:     result.row_count,
        fetched_at:    result.fetched_at,
        academic_year: cfg.academic_year || null,
      },
      status:  "SUCCESS",
      message: `KPI "${cfg.title}" regenerated`,
      metadata: {
        scope:         cfg.scope,
        institute_id:  cfg.institute_id  || null,
        department_id: cfg.department_id || null,
        table_name:    cfg.table_name,
      },
    });

    res.json({
      ok: true,
      data: { config: cfg, x: result.x, series: result.series,
              y_range: result.y_range, y_stats: result.y_stats,
              row_count: result.row_count, sql: result.sql, fetched_at: result.fetched_at },
    });
  } catch (err) {
    logger.error("POST /api/kpi/configs/:id/regenerate", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  EXPORT SVG
// =============================================================================

router.post("/configs/:id/export-svg", async (req, res) => {
  const ctx = getRoleContext(req);
  const { svg_data, report_data } = req.body;
  if (!svg_data) return res.status(400).json({ ok: false, error: "svg_data is required" });
  const MAX_SVG_BYTES = 512 * 1024; // 512 KB
  if (svg_data.length > MAX_SVG_BYTES)
    return res.status(413).json({ ok: false, error: `SVG is too large (${Math.round(svg_data.length / 1024)} KB). Maximum allowed is 512 KB.` });
  try {
    await ensureTables(req.pool);
    const { rows: cfgRows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_config WHERE id=$1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const cfg = cfgRows[0];
    const { rows } = await req.pool.query(
      `INSERT INTO kpi_svg_reports (config_id, title, svg_data, report_data, academic_year)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, config_id, title, svg_bytes, exported_at, academic_year`,
      [cfg.id, cfg.title, svg_data, report_data ? JSON.stringify(report_data) : null, cfg.academic_year || null]
    );

    await writeAuditLog(req, {
      actionType: "KPI_EXPORTED",
      entityType: "kpi",
      entityId:   String(cfg.id),
      newValue: {
        svg_id:       rows[0].id,
        svg_bytes:    rows[0].svg_bytes,
        exported_at:  rows[0].exported_at,
        academic_year: cfg.academic_year || null,
      },
      message: `KPI Exported - "${cfg.title}"`,
    });

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    logger.error("POST /api/kpi/configs/:id/export-svg", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs/:id/svg", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    await ensureTables(req.pool);
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const { rows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_svg_reports WHERE config_id=$1 ORDER BY exported_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "No exported SVG found." });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  DASHBOARD CHARTS — KPIs pinned to dashboard with their live data
// =============================================================================

router.get("/dashboard-charts", async (req, res) => {
  const ctx  = getRoleContext(req);
  let scope  = buildScopeWhere(ctx, "c", req.query.scope || null);
  if (req.query.year) scope = appendAnd(scope, "(c.academic_year = $? OR c.academic_year IS NULL)", req.query.year);

  try {
    await ensureTables(req.pool);

    // Combine scope filter + show_on_dashboard=true
    const showIdx = scope.params.length + 1;
    const finalClause = scope.clause
      ? `${scope.clause} AND c.show_on_dashboard = $${showIdx}`
      : `WHERE c.show_on_dashboard = $${showIdx}`;
    const finalParams = [...scope.params, true];

    const { rows: configs } = await req.pool.query(
      `SELECT * FROM kpi_config c
       ${finalClause}
       ORDER BY dashboard_group_name NULLS LAST, title`,
      finalParams
    );

    const results = [];
    for (const cfg of configs) {
      try {
        const data = await runConfigQuery(req.pool, cfg, req.query.lang || "en");
        results.push({
          config:     cfg,
          x:          data.x,
          series:     data.series,
          y_range:    data.y_range,
          row_count:  data.row_count,
          truncated:  data.truncated || false,
        });
      } catch (e) {
        results.push({
          config:         cfg,
          x:              [],
          series:         [],
          y_range:        null,
          row_count:      0,
          error:          e.message,
          dependency_err: !!e.dependency,
        });
      }
    }

    // Separate singles from groups
    const singles = results.filter(r => r.config.dashboard_display_type !== "group");
    const groupMap = {};
    for (const r of results.filter(r => r.config.dashboard_display_type === "group")) {
      const key = r.config.dashboard_group_name || "Other";
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(r);
    }
    const groups = Object.entries(groupMap).map(([name, items]) => ({ name, items }));

    res.json({ ok: true, singles, groups });
  } catch (err) {
    logger.error("GET /api/kpi/dashboard-charts", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Returns unique dashboard group names for the caller's scope (used in ConfigDrawer)
router.get("/dashboard-groups", async (req, res) => {
  const ctx   = getRoleContext(req);
  let scope   = buildScopeWhere(ctx, "c", req.query.scope || null);
  try {
    await ensureTables(req.pool);
    const { rows } = await req.pool.query(
      `SELECT DISTINCT dashboard_group_name FROM kpi_config c
       ${scope.clause ? scope.clause + " AND" : "WHERE"} dashboard_group_name IS NOT NULL
         AND dashboard_display_type = 'group'
       ORDER BY dashboard_group_name`,
      scope.params
    );
    res.json({ ok: true, data: rows.map(r => r.dashboard_group_name) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  DASHBOARD KPI (legacy junction table)
// =============================================================================

router.get("/dashboard-kpi", async (req, res) => {
  const ctx = getRoleContext(req);
  let scope = buildScopeWhere(ctx, "c", req.query.scope || null);
  const { kpi_config_id } = req.query;
  try {
    await ensureTables(req.pool);
    let sql = `SELECT dk.*, kc.title, kc.table_name, kc.chart_type, kc.x_col, kc.y_cols
               FROM dashboard_kpi dk LEFT JOIN kpi_config kc ON kc.id=dk.kpi_config_id`;
    const params = [...scope.params];
    const conds  = [];
    if (scope.clause) conds.push(scope.clause.replace(/^WHERE\s+/, "").replace(/c\./g, "kc."));
    if (kpi_config_id) { conds.push(`dk.kpi_config_id=$${params.length+1}`); params.push(kpi_config_id); }
    if (conds.length)  sql += ` WHERE ${conds.join(" AND ")}`;
    sql += ` ORDER BY dk.created_at DESC`;
    const { rows } = await req.pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/dashboard-kpi", async (req, res) => {
  const ctx = getRoleContext(req);
  const { kpi_config_id } = req.body;
  if (!kpi_config_id) return res.status(400).json({ ok: false, error: "kpi_config_id is required" });
  try {
    await ensureTables(req.pool);
    if (!await checkOwnership(req.pool, kpi_config_id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const { rows } = await req.pool.query(
      `INSERT INTO dashboard_kpi (kpi_config_id, created_by, updated_by)
       VALUES ($1,$2,$3) RETURNING *`,
      [kpi_config_id, ctx.user_id, ctx.user_id]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/dashboard-kpi/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    const { rows: dkRows } = await req.pool.query(
      "SELECT kpi_config_id FROM dashboard_kpi WHERE id = $1",
      [req.params.id]
    );
    if (!dkRows.length) return res.status(404).json({ ok: false, error: "Entry not found" });
    if (!await checkOwnership(req.pool, dkRows[0].kpi_config_id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const { rowCount } = await req.pool.query("DELETE FROM dashboard_kpi WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "Entry not found" });
    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
