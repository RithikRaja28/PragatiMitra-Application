/**
 * routes/kpi.js — Annual Report Portal · KPI Backend
 *
 * Mount: app.use("/api/kpi", require("./routes/kpi"));
 *
 * Architecture:
 *   kpi_config      = SOURCE OF TRUTH (chart configuration + stored query)
 *   kpi_svg_reports = EXPORT ONLY     (SVG saved once at report generation)
 *   dashboard_kpi   = JUNCTION TABLE  (links configs to report pages)
 *
 * Flow:
 *   1. User designs chart → config saved to kpi_config
 *   2. Preview/Regenerate → query rebuilt fresh from config, NO SVG saved
 *   3. Export Report → SVG rendered and saved ONCE to kpi_svg_reports
 *
 * Key rules:
 *   - x_col always comes from DB column
 *   - y_cols are selected numeric DB columns
 *   - New rows in source table appear automatically on regenerate
 *   - New columns appear only when user adds them to y_cols
 *   - institute_id, department_id, year from session — never stored in DB
 *
 * Endpoints:
 *   GET    /api/kpi/tables
 *   GET    /api/kpi/tables/:name/columns
 *
 *   POST   /api/kpi/configs
 *   GET    /api/kpi/configs
 *   GET    /api/kpi/configs/:id
 *   PUT    /api/kpi/configs/:id
 *   DELETE /api/kpi/configs/:id
 *
 *   POST   /api/kpi/configs/:id/regenerate   fresh data, NO SVG saved
 *   POST   /api/kpi/configs/:id/export-svg   save SVG at export time only
 *   GET    /api/kpi/configs/:id/svg
 *
 *   GET    /api/kpi/dashboard-kpi
 *   POST   /api/kpi/dashboard-kpi
 *   DELETE /api/kpi/dashboard-kpi/:id
 */

const express = require("express");
const router  = express.Router();

router.use((req, _res, next) => { req.pool = req.app.locals.pool; next(); });

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
  const t = (dt || "").toLowerCase();
  return NUMERIC_TYPES.some(nt => t.includes(nt));
}

function niceNumber(val) {
  if (!val || val <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const res = val / mag;
  let n;
  if (res <= 1) n = 1;
  else if (res <= 2) n = 2;
  else if (res <= 5) n = 5;
  else n = 10;
  return n * mag;
}

function niceInterval(nm) {
  if (!nm || nm <= 0) return 20;
  const raw = nm / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const res = raw / mag;
  let s;
  if (res <= 1) s = 1;
  else if (res <= 2) s = 2;
  else if (res <= 5) s = 5;
  else s = 10;
  return s * mag;
}

function getSessionContext(req) {
  return {
    institute_id:  req.session?.institute_id  ?? null,
    department_id: req.session?.department_id ?? null,
    year:          req.session?.year          ?? null,
    user_id:       req.session?.user_id       ?? req.session?.userId ?? null,
  };
}

function buildDisplaySql(cfg) {
  return (
    `SELECT ${cfg.x_col}, ${(cfg.y_cols || []).join(", ")}\n` +
    `FROM   ${cfg.table_name}\n` +
    `WHERE  ${cfg.x_col} IS NOT NULL\n` +
    `ORDER  BY ${cfg.x_col}\n` +
    `LIMIT  ${cfg.row_limit || 500}`
  );
}

// ─── Ensure tables ────────────────────────────────────────────────────────────
async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_config (
      id          SERIAL        PRIMARY KEY,
      title       TEXT          NOT NULL DEFAULT 'KPI Chart',
      description TEXT,
      table_name  VARCHAR(255)  NOT NULL,
      x_col       VARCHAR(255)  NOT NULL,
      y_cols      TEXT[]        NOT NULL,
      chart_type  VARCHAR(50)   NOT NULL DEFAULT 'bar',
      row_limit   INTEGER       NOT NULL DEFAULT 500,
      query       TEXT,
      created_by  INTEGER,
      updated_by  INTEGER,
      created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
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
      created_by    INTEGER,
      updated_by    INTEGER,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// ─── Core query runner ────────────────────────────────────────────────────────
// SQL is ALWAYS rebuilt fresh from config fields.
// New rows in the source table appear automatically on every run.
async function runConfigQuery(pool, cfg) {
  const yArr = cfg.y_cols || [];
  if (!yArr.length) throw new Error("No y_cols configured");
  if (!cfg.x_col)   throw new Error("No x_col configured");
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
    `LIMIT  $1`,
  ].join(" ");

  const { rows } = await pool.query(sql, [cfg.row_limit || 500]);

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
    const { rows } = await req.pool.query(
      `SELECT t.table_name,
              t.table_schema AS schema_name,
              s.n_live_tup   AS row_count
       FROM   information_schema.tables t
       LEFT   JOIN pg_stat_user_tables s
              ON s.schemaname = t.table_schema AND s.relname = t.table_name
       WHERE  t.table_schema = $1
         AND  t.table_type   = 'BASE TABLE'
         AND  t.table_name NOT IN ('kpi_config','kpi_svg_reports','dashboard_kpi')
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
  const ctx = getSessionContext(req);
  const {
    title       = "KPI Chart",
    description = "",
    table_name,
    x_col,
    y_cols      = [],
    chart_type  = "bar",
    row_limit   = 500,
  } = req.body;

  if (!table_name)    return res.status(400).json({ ok: false, error: "table_name is required" });
  if (!x_col)         return res.status(400).json({ ok: false, error: "x_col is required" });
  if (!y_cols.length) return res.status(400).json({ ok: false, error: "y_cols must not be empty" });

  try {
    await ensureTables(req.pool);
    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type, row_limit };

    // Check if a config already exists for this table — UPDATE it, do not create a duplicate
    const existing = await req.pool.query(
      `SELECT id FROM kpi_config WHERE table_name = $1 ORDER BY created_at ASC LIMIT 1`,
      [table_name]
    );

    let savedRow;

    if (existing.rowCount > 0) {
      // UPDATE the existing config row for this table
      const existingId = existing.rows[0].id;
      const { rows } = await req.pool.query(
        `UPDATE kpi_config SET
           title=$1, description=$2, x_col=$3, y_cols=$4,
           chart_type=$5, row_limit=$6, query=$7,
           updated_by=$8, updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [title, description, x_col, y_cols, chart_type, row_limit,
         buildDisplaySql(cfgDraft), ctx.user_id, existingId]
      );
      savedRow = rows[0];
      const queryResult = await runConfigQuery(req.pool, savedRow);
      return res.status(200).json({ ok: true, data: savedRow, query_result: queryResult, updated: true });
    }

    // No existing config for this table — INSERT new row
    const { rows } = await req.pool.query(
      `INSERT INTO kpi_config
         (title, description, table_name, x_col, y_cols, chart_type, row_limit, query, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [title, description, table_name, x_col, y_cols, chart_type, row_limit,
       buildDisplaySql(cfgDraft), ctx.user_id, ctx.user_id]
    );
    savedRow = rows[0];
    const queryResult = await runConfigQuery(req.pool, savedRow);
    res.status(201).json({ ok: true, data: savedRow, query_result: queryResult, updated: false });

  } catch (err) {
    console.error("[POST /configs]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs", async (req, res) => {
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
       ORDER  BY c.updated_at DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs/:id", async (req, res) => {
  try {
    await ensureTables(req.pool);
    const { rows, rowCount } = await req.pool.query(
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
       WHERE  c.id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/configs/:id", async (req, res) => {
  const ctx = getSessionContext(req);
  const { title, description, table_name, x_col, y_cols, chart_type, row_limit } = req.body;

  try {
    await ensureTables(req.pool);
    const cfgDraft = { title, description, table_name, x_col, y_cols, chart_type, row_limit };
    const { rows, rowCount } = await req.pool.query(
      `UPDATE kpi_config SET
         title=$1, description=$2, table_name=$3, x_col=$4, y_cols=$5,
         chart_type=$6, row_limit=$7, query=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [title, description, table_name, x_col, y_cols, chart_type, row_limit,
       buildDisplaySql(cfgDraft), ctx.user_id, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/configs/:id", async (req, res) => {
  try {
    const { rowCount } = await req.pool.query(
      `DELETE FROM kpi_config WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  REGENERATE — fresh data preview, SVG is NOT saved
// =============================================================================

router.post("/configs/:id/regenerate", async (req, res) => {
  try {
    await ensureTables(req.pool);
    const { rows: cfgRows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_config WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    const cfg = cfgRows[0];

    const result = await runConfigQuery(req.pool, cfg);

    // Keep stored query in sync
    await req.pool.query(
      `UPDATE kpi_config SET query = $1, updated_at = NOW() WHERE id = $2`,
      [result.sql, cfg.id]
    );

    res.json({
      ok:   true,
      data: {
        config:     cfg,
        x:          result.x,
        series:     result.series,
        y_range:    result.y_range,
        y_stats:    result.y_stats,
        row_count:  result.row_count,
        sql:        result.sql,
        fetched_at: result.fetched_at,
      },
    });
  } catch (err) {
    console.error("[POST /regenerate]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  EXPORT SVG — saved ONCE when user generates the final report
// =============================================================================

router.post("/configs/:id/export-svg", async (req, res) => {
  const { svg_data, report_data } = req.body;
  if (!svg_data) return res.status(400).json({ ok: false, error: "svg_data is required" });

  try {
    await ensureTables(req.pool);
    const { rows: cfgRows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_config WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Config not found" });
    const cfg = cfgRows[0];

    const { rows } = await req.pool.query(
      `INSERT INTO kpi_svg_reports (config_id, title, svg_data, report_data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, config_id, title, svg_bytes, exported_at`,
      [cfg.id, cfg.title, svg_data, report_data ? JSON.stringify(report_data) : null]
    );

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[POST /export-svg]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/configs/:id/svg", async (req, res) => {
  try {
    await ensureTables(req.pool);
    const { rows, rowCount } = await req.pool.query(
      `SELECT * FROM kpi_svg_reports
       WHERE  config_id = $1
       ORDER  BY exported_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "No exported SVG found. Export the report first." });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
//  DASHBOARD KPI
// =============================================================================

router.get("/dashboard-kpi", async (req, res) => {
  const { kpi_config_id } = req.query;
  try {
    await ensureTables(req.pool);
    const params = [];
    let sql = `
      SELECT dk.*, kc.title, kc.table_name, kc.chart_type, kc.x_col, kc.y_cols
      FROM   dashboard_kpi dk
      LEFT   JOIN kpi_config kc ON kc.id = dk.kpi_config_id
    `;
    if (kpi_config_id) { sql += ` WHERE dk.kpi_config_id = $1`; params.push(kpi_config_id); }
    sql += ` ORDER BY dk.created_at DESC`;
    const { rows } = await req.pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/dashboard-kpi", async (req, res) => {
  const ctx = getSessionContext(req);
  const { kpi_config_id } = req.body;
  if (!kpi_config_id) return res.status(400).json({ ok: false, error: "kpi_config_id is required" });
  try {
    await ensureTables(req.pool);
    const { rowCount: exists } = await req.pool.query(
      `SELECT 1 FROM kpi_config WHERE id = $1`, [kpi_config_id]
    );
    if (!exists) return res.status(404).json({ ok: false, error: "kpi_config not found" });
    const { rows } = await req.pool.query(
      `INSERT INTO dashboard_kpi (kpi_config_id, created_by, updated_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [kpi_config_id, ctx.user_id, ctx.user_id]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[POST /dashboard-kpi]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/dashboard-kpi/:id", async (req, res) => {
  try {
    const { rowCount } = await req.pool.query(
      `DELETE FROM dashboard_kpi WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "Entry not found" });
    res.json({ ok: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;