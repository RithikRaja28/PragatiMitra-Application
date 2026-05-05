/**
 * routes/radiology.js
 * Mount in server.js:  app.use("/api/radiology", require("./routes/radiology"));
 *
 * DB tables (from pgAdmin screenshots):
 *   medical_reports  — period(text PK), x_ray(int), usg(int), bmd(int), ct_scan(int)
 *   svg_reports      — id(serial PK), title(text), description(text), svg_data(text),
 *                      status(varchar 50), chart_type(varchar 50),
 *                      created_at(timestamp), updated_at(timestamp)
 */

const express = require("express");
const router  = express.Router();

/* ── Inject shared pool from app.locals into every request ──── */
router.use((req, _res, next) => {
  req.pool = req.app.locals.pool;
  next();
});

/* ── Canonical period sort order ─────────────────────────────── */
const PERIOD_ORDER = [
  "Apr-24","May-24","Jun-24","Jul-24","Aug-24","Sep-24",
  "Oct-24","Nov-24","Dec-24","Jan-25","Feb-25","Mar-25",
  "Apr-25","May-25","Jun-25","Jul-25","Aug-25","Sep-25",
];

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/radiology/reports
//  Returns all rows from medical_reports (excluding "Total" sentinel row).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports", async (req, res) => {
  try {
    const { rows } = await req.pool.query(
      `SELECT period, x_ray, usg, bmd, ct_scan
       FROM   medical_reports
       WHERE  period <> 'Total'
       ORDER  BY period`
    );

    // Sort by canonical period order; unknown periods fall to the end
    rows.sort((a, b) => {
      const ai = PERIOD_ORDER.indexOf(a.period);
      const bi = PERIOD_ORDER.indexOf(b.period);
      if (ai === -1 && bi === -1) return a.period.localeCompare(b.period);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[GET /reports]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/radiology/reports
//  Insert new row OR update existing row (upsert on period).
//  Used for both inserting new rows AND editing existing numeric cells.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reports", async (req, res) => {
  const { period, x_ray = 0, usg = 0, bmd = 0, ct_scan = 0 } = req.body;

  if (!period) {
    return res.status(400).json({ ok: false, error: "period is required" });
  }

  try {
    const { rows } = await req.pool.query(
      `INSERT INTO medical_reports (period, x_ray, usg, bmd, ct_scan)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (period) DO UPDATE
         SET x_ray   = EXCLUDED.x_ray,
             usg     = EXCLUDED.usg,
             bmd     = EXCLUDED.bmd,
             ct_scan = EXCLUDED.ct_scan
       RETURNING period, x_ray, usg, bmd, ct_scan`,
      [period, Number(x_ray), Number(usg), Number(bmd), Number(ct_scan)]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[POST /reports]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/radiology/reports/:period
//  Rename the period label of an existing row.
// ─────────────────────────────────────────────────────────────────────────────
router.put("/reports/:period", async (req, res) => {
  const oldPeriod = decodeURIComponent(req.params.period);
  const { new_period } = req.body;

  if (!new_period) {
    return res.status(400).json({ ok: false, error: "new_period is required" });
  }

  try {
    const { rows, rowCount } = await req.pool.query(
      `UPDATE medical_reports
       SET    period = $1
       WHERE  period = $2
       RETURNING period, x_ray, usg, bmd, ct_scan`,
      [new_period, oldPeriod]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: `Period "${oldPeriod}" not found` });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[PUT /reports/:period]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/radiology/reports/:period
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/reports/:period", async (req, res) => {
  const period = decodeURIComponent(req.params.period);
  try {
    const { rowCount } = await req.pool.query(
      `DELETE FROM medical_reports WHERE period = $1`,
      [period]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: "Row not found" });
    }
    res.json({ ok: true, deleted: period });
  } catch (err) {
    console.error("[DELETE /reports/:period]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/radiology/save-svg
//  Persist a combined chart + table SVG blob into svg_reports.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/save-svg", async (req, res) => {
  const {
    title       = "Radiology Report",
    description = "",
    svg_data,
    report_data = null,          // JSONB — filtered chart data
    status      = "draft",
    chart_type  = "bar",
  } = req.body;

  if (!svg_data) {
    return res.status(400).json({ ok: false, error: "svg_data is required" });
  }
  if (!["draft", "approval", "final"].includes(status)) {
    return res.status(400).json({ ok: false, error: "status must be: draft | approval | final" });
  }

  try {
    // node-postgres handles JS objects natively for JSONB columns —
    // do NOT JSON.stringify here; double-encoding stores a string, not JSONB
    const { rows } = await req.pool.query(
      `INSERT INTO svg_reports (title, description, svg_data, report_data, status, chart_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, status, chart_type, created_at`,
      [
        title,
        description,
        svg_data,
        report_data ?? null,   // pass object directly — pg serialises to JSONB
        status,
        chart_type,
      ]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[POST /save-svg]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/radiology/svgs  — list records (metadata only, no SVG blob)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/svgs", async (req, res) => {
  const { status } = req.query;   // optional ?status=final
  const allowed = ["draft", "approval", "final"];

  try {
    let queryText =
      `SELECT id, title, description, status, chart_type, created_at,
              pg_column_size(svg_data) AS svg_bytes
       FROM   svg_reports`;
    const params = [];

    if (status && allowed.includes(status)) {
      queryText += ` WHERE status = $1`;
      params.push(status);
    }
    queryText += ` ORDER BY created_at DESC`;

    const { rows } = await req.pool.query(queryText, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("[GET /svgs]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/radiology/svgs/:id  — fetch a single SVG record including svg_data
// ─────────────────────────────────────────────────────────────────────────────
router.get("/svgs/:id", async (req, res) => {
  try {
    const { rows, rowCount } = await req.pool.query(
      `SELECT id, title, description, svg_data, report_data, status, chart_type, created_at, updated_at
       FROM   svg_reports
       WHERE  id = $1`,
      [req.params.id]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: "Record not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[GET /svgs/:id]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/radiology/svgs/:id/status  — workflow: draft → approval → final
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/svgs/:id/status", async (req, res) => {
  const { status } = req.body;

  if (!["draft", "approval", "final"].includes(status)) {
    return res.status(400).json({ ok: false, error: "status must be: draft | approval | final" });
  }

  try {
    const { rows, rowCount } = await req.pool.query(
      `UPDATE svg_reports
       SET    status     = $1,
              updated_at = NOW()
       WHERE  id         = $2
       RETURNING id, status, updated_at`,
      [status, req.params.id]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: "Record not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("[PATCH /svgs/:id/status]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;