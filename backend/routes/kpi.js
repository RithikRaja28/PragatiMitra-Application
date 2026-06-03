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

router.use((req, _res, next) => { req.pool = req.app.locals.pool; next(); });
router.use(verifyToken);

// ─── One-time init flag (avoid re-running migrations per request) ──────────────
let _initialized = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildDisplaySql(cfg) {
  return (
    `SELECT ${cfg.x_col}, ${(cfg.y_cols || []).join(", ")}\n` +
    `FROM   ${cfg.table_name}\n` +
    `WHERE  ${cfg.x_col} IS NOT NULL\n` +
    `ORDER  BY ${cfg.x_col}`
  );
}

// ─── Role context from JWT ─────────────────────────────────────────────────────

function getRoleContext(req) {
  const roles = new Set(req.user?.roles || []);
  return {
    isInstAdmin:  roles.has("institute_admin"),
    isDeptAdmin:  roles.has("department_admin"),
    isSuperAdmin: roles.has("super_admin"),
    institute_id:  String(req.user?.institutionId ?? ""),
    department_id: String(req.user?.departmentId  ?? ""),
    user_id:       String(req.user?.userId        ?? ""),
  };
}

// Returns { clause, params } — clause may be empty string (super admin = no filter)
function buildScopeWhere(ctx, alias = "c") {
  const a = alias ? `${alias}.` : "";
  if (ctx.isSuperAdmin) return { clause: "", params: [] };
  if (ctx.isInstAdmin && ctx.institute_id)
    return { clause: `WHERE ${a}scope = 'institute' AND ${a}institute_id = $1`, params: [ctx.institute_id] };
  if (ctx.isDeptAdmin && ctx.department_id)
    return { clause: `WHERE ${a}scope = 'department' AND ${a}department_id = $1`, params: [ctx.department_id] };
  return { clause: "WHERE 1=0", params: [] };
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
  if (ctx.isSuperAdmin) return true;
  const { rows } = await pool.query(
    `SELECT id FROM kpi_config WHERE id = $1 AND (
      (scope = 'institute'  AND institute_id  = $2) OR
      (scope = 'department' AND department_id = $3)
    )`,
    [configId, ctx.institute_id, ctx.department_id]
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
  const safeAdd = async (sql) => { try { await pool.query(sql); } catch (_) {} };

  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS scope                  VARCHAR(20) NOT NULL DEFAULT 'institute'`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS show_on_dashboard      BOOLEAN     NOT NULL DEFAULT false`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS dashboard_display_type TEXT        NOT NULL DEFAULT 'single'`);
  await safeAdd(`ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS dashboard_group_name   TEXT`);

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

  _initialized = true;
}

// ─── Core query runner (no row limit — returns all records) ───────────────────
async function runConfigQuery(pool, cfg) {
  const yArr = cfg.y_cols || [];
  if (!yArr.length)    throw new Error("No y_cols configured");
  if (!cfg.x_col)      throw new Error("No x_col configured");
  if (!cfg.table_name) throw new Error("No table_name configured");

  const selectParts = [
    `${quoteIdent(cfg.x_col)} AS __x__`,
    ...yArr.map((col, i) => `COALESCE(${quoteIdent(col)}::numeric, 0) AS __y${i}__`),
  ];

  const sql = [
    `SELECT ${selectParts.join(", ")}`,
    `FROM   ${quoteIdent(cfg.table_name)}`,
    `WHERE  ${quoteIdent(cfg.x_col)} IS NOT NULL`,
    `ORDER  BY ${quoteIdent(cfg.x_col)}`,
  ].join(" ");

  const { rows } = await pool.query(sql);

  const xData  = rows.map(r => String(r.__x__));
  const series = yArr.map((col, i) => ({
    column: col,
    values: rows.map(r => parseFloat(r[`__y${i}__`]) || 0),
  }));

  const allVals = series.flatMap(s => s.values);
  const dataMax = allVals.length ? Math.max(...allVals) : 100;
  const nm      = niceNumber(dataMax);

  return {
    x:          xData,
    series,
    row_count:  rows.length,
    y_range:    { min: 0, max: nm, interval: niceInterval(nm) },
    y_stats:    { min: allVals.length ? Math.min(...allVals) : 0, max: dataMax },
    sql:        buildDisplaySql(cfg),
    fetched_at: new Date().toISOString(),
  };
}


// =============================================================================
//  TABLE ENDPOINTS
// =============================================================================

router.get("/tables", async (req, res) => {
  const { schema = "public" } = req.query;
  try {
    await ensureTables(req.pool);
    // Use pg_class.reltuples (planner estimate) as primary row count — n_live_tup from
    // pg_stat_user_tables is 0 until ANALYZE runs, so it's unreliable for new tables.
    const { rows } = await req.pool.query(
      `SELECT t.table_name,
              t.table_schema AS schema_name,
              GREATEST(0,
                CASE WHEN s.n_live_tup > 0 THEN s.n_live_tup
                     ELSE GREATEST(0, c.reltuples::bigint)
                END
              ) AS row_count
       FROM   information_schema.tables t
       LEFT   JOIN pg_stat_user_tables s
              ON s.schemaname = t.table_schema AND s.relname = t.table_name
       LEFT   JOIN pg_class c
              ON c.relname = t.table_name
             AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.table_schema)
       WHERE  t.table_schema = $1
         AND  t.table_type   = 'BASE TABLE'
         AND  t.table_name NOT IN ('kpi_config','kpi_svg_reports','dashboard_kpi',
                                   'sessions','roles','user_roles')
       ORDER  BY t.table_name`,
      [schema]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[GET /tables]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/tables/:tableName/columns", async (req, res) => {
  const { tableName } = req.params;
  const { schema = "public" } = req.query;
  try {
    const { rows } = await req.pool.query(
      `SELECT column_name, data_type, is_nullable, ordinal_position
       FROM   information_schema.columns
       WHERE  table_schema = $1 AND table_name = $2
       ORDER  BY ordinal_position`,
      [schema, tableName]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: `Table "${tableName}" not found` });
    res.json({ ok: true, data: rows.map(r => ({ ...r, is_numeric: isNumericType(r.data_type) })) });
  } catch (err) {
    console.error("[GET /columns]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  CONFIG ENDPOINTS
// =============================================================================

router.post("/configs", async (req, res) => {
  const ctx = getRoleContext(req);
  if (!ctx.isInstAdmin && !ctx.isDeptAdmin && !ctx.isSuperAdmin)
    return res.status(403).json({ ok: false, error: "Only Institute Admin or Department Admin can create KPIs." });

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
  } = req.body;

  if (!table_name)    return res.status(400).json({ ok: false, error: "table_name is required" });
  if (!x_col)         return res.status(400).json({ ok: false, error: "x_col is required" });
  if (!y_cols.length) return res.status(400).json({ ok: false, error: "y_cols must not be empty" });

  let scope, institute_id, department_id;
  if (ctx.isDeptAdmin) {
    scope = "department"; institute_id = null; department_id = ctx.department_id;
  } else {
    scope = "institute"; institute_id = ctx.institute_id; department_id = null;
  }

  try {
    await ensureTables(req.pool);
    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type };

    // Always INSERT a new config — multiple KPIs from the same table are allowed.
    // Editing an existing config must go through PUT /configs/:id.
    // Refreshing data for an existing config must go through POST /configs/:id/regenerate.
    const { rows } = await req.pool.query(
      `INSERT INTO kpi_config
         (title, description, table_name, x_col, y_cols, chart_type, query,
          scope, institute_id, department_id,
          show_on_dashboard, dashboard_display_type, dashboard_group_name,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [title, description, table_name, x_col, y_cols, chart_type, buildDisplaySql(cfgDraft),
       scope, institute_id || null, department_id || null,
       show_on_dashboard, dashboard_display_type, dashboard_group_name || null,
       ctx.user_id, ctx.user_id]
    );
    const savedRow   = rows[0];
    const queryResult = await runConfigQuery(req.pool, savedRow);
    res.status(201).json({ ok: true, data: savedRow, query_result: queryResult, updated: false });

  } catch (err) {
    console.error("[POST /configs]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs", async (req, res) => {
  const ctx   = getRoleContext(req);
  const scope = buildScopeWhere(ctx);
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
    res.json({ ok: true, data: rows });
  } catch (err) {
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
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/configs/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  const {
    title, description, table_name, x_col, y_cols, chart_type,
    show_on_dashboard, dashboard_display_type, dashboard_group_name,
  } = req.body;
  try {
    await ensureTables(req.pool);
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type };
    const { rows, rowCount } = await req.pool.query(
      `UPDATE kpi_config SET
         title=$1, description=$2, table_name=$3, x_col=$4, y_cols=$5, chart_type=$6,
         query=$7, show_on_dashboard=$8, dashboard_display_type=$9, dashboard_group_name=$10,
         updated_by=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title, description, table_name, x_col, y_cols, chart_type,
       buildDisplaySql(cfgDraft), show_on_dashboard ?? false,
       dashboard_display_type || "single", dashboard_group_name || null,
       ctx.user_id, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/configs/:id", async (req, res) => {
  const ctx = getRoleContext(req);
  try {
    if (!await checkOwnership(req.pool, req.params.id, ctx))
      return res.status(403).json({ ok: false, error: "Not authorized." });
    const { rowCount } = await req.pool.query(`DELETE FROM kpi_config WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
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
    const result = await runConfigQuery(req.pool, cfg);

    await req.pool.query(
      `UPDATE kpi_config SET query=$1, updated_at=NOW() WHERE id=$2`,
      [result.sql, cfg.id]
    );

    res.json({
      ok: true,
      data: { config: cfg, x: result.x, series: result.series,
              y_range: result.y_range, y_stats: result.y_stats,
              row_count: result.row_count, sql: result.sql, fetched_at: result.fetched_at },
    });
  } catch (err) {
    console.error("[POST /regenerate]", err.message);
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
      `INSERT INTO kpi_svg_reports (config_id, title, svg_data, report_data)
       VALUES ($1,$2,$3,$4) RETURNING id, config_id, title, svg_bytes, exported_at`,
      [cfg.id, cfg.title, svg_data, report_data ? JSON.stringify(report_data) : null]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[POST /export-svg]", err.message);
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
  const ctx   = getRoleContext(req);
  const scope = buildScopeWhere(ctx);

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
        const data = await runConfigQuery(req.pool, cfg);
        results.push({ config: cfg, x: data.x, series: data.series,
                       y_range: data.y_range, row_count: data.row_count });
      } catch (e) {
        results.push({ config: cfg, x: [], series: [], y_range: null,
                       row_count: 0, error: e.message });
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
    console.error("[GET /dashboard-charts]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Returns unique dashboard group names for the caller's scope (used in ConfigDrawer)
router.get("/dashboard-groups", async (req, res) => {
  const ctx   = getRoleContext(req);
  const scope = buildScopeWhere(ctx);
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
  const scope = buildScopeWhere(ctx);
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
  try {
    const { rowCount } = await req.pool.query(`DELETE FROM dashboard_kpi WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "Entry not found" });
    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
