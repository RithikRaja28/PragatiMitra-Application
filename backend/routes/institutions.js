"use strict";

const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

router.use(verifyToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => typeof v === "string" && UUID_RE.test(v);

/* ─── India states list ──────────────────────────────────────────── */
const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli",
  "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
const INDIA_STATES_SET = new Set(INDIA_STATES.map((s) => s.toLowerCase()));

/* ─── Multer: memory storage, 25 MB cap ─────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV and Excel files are allowed"), ok);
  },
});

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large. Maximum size is 25 MB." : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}

/* ─── Schema config ──────────────────────────────────────────────── */
const SCHEMA_CONFIG = {
  EXCLUDED:       ["institution_id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"],
  FORCE_REQUIRED: ["institution_name", "code", "email_domain", "address_line1", "city", "state", "pincode"],
  ALIASES: {
    institution_name: ["name", "institution name", "college name", "university name", "institute name", "institutionname"],
    code:             ["institution code", "inst code", "short code", "abbreviation", "abbr"],
    email_domain:     ["domain", "email domain", "mail domain", "emaildomain"],
    address_line1:    ["address", "address 1", "address line 1", "addr1", "street"],
    address_line2:    ["address 2", "address line 2", "addr2"],
    city:             ["town", "location"],
    state:            ["province", "region"],
    country:          ["nation"],
    pincode:          ["pin", "postal code", "zip", "zip code", "pin code", "postal"],
    status:           ["account status", "institution status", "active"],
  },
};

function normalize(s) { return String(s).toLowerCase().replace(/[\s_\-\.]+/g, ""); }
function toLabel(col)  { return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

/* ─── Dynamic schema from information_schema ─────────────────────── */
async function getImportSchema(pool) {
  const { rows: cols } = await pool.query(`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'institutions' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  const fields = [];
  for (const col of cols) {
    const name = col.column_name;
    if (SCHEMA_CONFIG.EXCLUDED.includes(name)) continue;
    const required = SCHEMA_CONFIG.FORCE_REQUIRED.includes(name)
      ? true
      : (col.is_nullable === "NO" && !col.column_default);
    fields.push({
      key: name, label: toLabel(name), dbColumn: name, required,
      aliases: SCHEMA_CONFIG.ALIASES[name] || [],
    });
  }
  fields.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  return fields;
}

function buildAutoMapping(fields, cols) {
  const mapping = {};
  for (const field of fields) {
    const needles = new Set([normalize(field.key), normalize(field.label), ...field.aliases.map(normalize)]);
    const matched = cols.find((c) => needles.has(normalize(c)));
    mapping[field.key] = matched || "";
  }
  return mapping;
}

/* ─── Per-row validation (shared between validate + execute) ─────── */
function validateRow(row, fieldToCol) {
  const get = (field) => {
    const col = fieldToCol[field];
    return col !== undefined ? String(row[col] ?? "").trim() : "";
  };
  const errors = [];

  const name = get("institution_name");
  if (!name) errors.push({ field: "institution_name", reason: "Institution name is required" });

  const code = get("code");
  if (!code)
    errors.push({ field: "code", reason: "Institution code is required" });
  else if (!/^[A-Z0-9_\-]+$/i.test(code))
    errors.push({ field: "code", reason: "Code must contain only letters, digits, hyphens, underscores" });

  const domain = get("email_domain");
  if (!domain)
    errors.push({ field: "email_domain", reason: "Email domain is required" });
  else if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain.toLowerCase()))
    errors.push({ field: "email_domain", reason: "Enter a valid domain (e.g. college.edu.in)" });

  const addr1 = get("address_line1");
  if (!addr1) errors.push({ field: "address_line1", reason: "Address line 1 is required" });

  const city = get("city");
  if (!city) errors.push({ field: "city", reason: "City is required" });

  const state = get("state");
  if (!state)
    errors.push({ field: "state", reason: "State is required" });
  else if (!INDIA_STATES_SET.has(state.toLowerCase()))
    errors.push({ field: "state", reason: `"${state}" is not a valid Indian state/UT` });

  const pincode = get("pincode");
  if (!pincode)
    errors.push({ field: "pincode", reason: "Pincode is required" });
  else if (!/^\d{6}$/.test(pincode))
    errors.push({ field: "pincode", reason: "Pincode must be exactly 6 digits" });

  const status = get("status");
  if (status && !["ACTIVE", "INACTIVE"].includes(status.toUpperCase()))
    errors.push({ field: "status", reason: `"${status}" is not valid — use ACTIVE or INACTIVE` });

  return {
    valid: errors.length === 0,
    errors,
    values: {
      institution_name: name,
      code:             code ? code.toUpperCase() : "",
      email_domain:     domain ? domain.toLowerCase() : "",
      address_line1:    addr1,
      address_line2:    get("address_line2") || null,
      city,
      state,
      country:          get("country") || "India",
      pincode,
      status:           (status && ["ACTIVE", "INACTIVE"].includes(status.toUpperCase()))
        ? status.toUpperCase() : "ACTIVE",
    },
  };
}

/* ── GET /api/institutions/import/schema ──────────────────────── */
router.get("/import/schema", requireRole(["super_admin"]), async (req, res) => {
  try {
    const fields = await getImportSchema(req.app.locals.pool);
    return res.json({ success: true, fields });
  } catch (err) {
    logger.error("institutions import/schema failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load schema." });
  }
});

/* ── POST /api/institutions/import/parse ──────────────────────── */
router.post("/import/parse", requireRole(["super_admin"]), handleUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
  try {
    const fields    = await getImportSchema(req.app.locals.pool);
    const ext       = req.file.originalname.toLowerCase().split(".").pop();
    const encoding  = (req.body.encoding  || "UTF-8").replace("-", "");
    const delimiter = req.body.delimiter  || ",";

    let wb;
    if (ext === "csv") {
      const text = req.file.buffer.toString(encoding.toLowerCase());
      wb = XLSX.read(text, { type: "string", FS: delimiter });
    } else {
      wb = XLSX.read(req.file.buffer, { type: "buffer" });
    }

    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!rows.length)   return res.status(400).json({ success: false, message: "File is empty or has no data rows." });
    if (rows.length > 10000) return res.status(400).json({ success: false, message: "File exceeds 10,000 rows." });

    const columns = Object.keys(rows[0]);
    return res.json({
      success: true, columns, totalRows: rows.length, rows,
      preview: rows.slice(0, 5), autoMapping: buildAutoMapping(fields, columns),
    });
  } catch (err) {
    logger.error("institutions import/parse failed", { ...getLogContext(req), stack: err.stack });
    return res.status(400).json({ success: false, message: `File parsing failed: ${err.message}` });
  }
});

/* ── POST /api/institutions/import/validate ───────────────────── */
router.post("/import/validate", requireRole(["super_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { mapping, data } = req.body;
  if (!mapping || !Array.isArray(data))
    return res.status(400).json({ success: false, message: "mapping and data are required." });

  try {
    const { rows: existing } = await pool.query(
      "SELECT LOWER(code) AS code_lower, LOWER(email_domain) AS domain_lower FROM institutions"
    );
    const existingCodes   = new Set(existing.map((r) => r.code_lower));
    const existingDomains = new Set(existing.map((r) => r.domain_lower));

    const fieldToCol = {};
    for (const [f, c] of Object.entries(mapping)) { if (c) fieldToCol[f] = c; }

    let ready = 0; let skipped = 0;
    const errors      = [];
    const seenCodes   = new Set();
    const seenDomains = new Set();

    for (let i = 0; i < data.length; i++) {
      const rowNum    = i + 1;
      const result    = validateRow(data[i], fieldToCol);
      const rowErrors = [...result.errors];

      const codeLower = result.values.code ? result.values.code.toLowerCase() : "";
      const isNewCode = codeLower && !existingCodes.has(codeLower);

      if (codeLower) {
        if (existingCodes.has(codeLower))
          rowErrors.push({ field: "code", reason: `Code "${result.values.code}" already exists in DB` });
        else if (seenCodes.has(codeLower))
          rowErrors.push({ field: "code", reason: `Code "${result.values.code}" appears multiple times in file` });
        else
          seenCodes.add(codeLower);
      }

      /* For new institutions only — also validate email_domain uniqueness */
      if (isNewCode && result.values.email_domain) {
        const domainLower = result.values.email_domain.toLowerCase();
        if (existingDomains.has(domainLower))
          rowErrors.push({ field: "email_domain", reason: `Email domain "${result.values.email_domain}" is already registered to another institution` });
        else if (seenDomains.has(domainLower))
          rowErrors.push({ field: "email_domain", reason: `Email domain "${result.values.email_domain}" appears multiple times in file` });
        else
          seenDomains.add(domainLower);
      }

      if (rowErrors.length) { skipped++; errors.push({ row: rowNum, errors: rowErrors }); }
      else                  { ready++; }
    }

    const unmappedRequired = SCHEMA_CONFIG.FORCE_REQUIRED.filter((f) => !fieldToCol[f]).length;
    return res.json({ success: true, total: data.length, ready, skipped, unmappedRequired, errors });
  } catch (err) {
    logger.error("institutions import/validate failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Validation failed." });
  }
});

/* ── POST /api/institutions/import/execute  (streaming SSE + batch INSERT) ── */
router.post("/import/execute", requireRole(["super_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { mapping, data, duplicateHandling = "skip" } = req.body;

  if (!mapping || !Array.isArray(data) || !data.length)
    return res.status(400).json({ success: false, message: "mapping and data are required." });

  /* ── SSE headers — keeps the connection alive so the client can read progress ── */
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");   // disable nginx proxy buffering
  res.flushHeaders();

  const send = (payload) => { try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) {} };

  try {
    /* ── Build field → column lookup ── */
    const fieldToCol = {};
    for (const [f, c] of Object.entries(mapping)) { if (c) fieldToCol[f] = c; }

    /* ── Pre-fetch codes + email_domains (one query) ── */
    const { rows: existing } = await pool.query(
      "SELECT LOWER(code) AS code_lower, LOWER(email_domain) AS domain_lower FROM institutions"
    );
    const existingCodes   = new Set(existing.map((r) => r.code_lower));
    const existingDomains = new Set(existing.map((r) => r.domain_lower));

    /* ── Validate + split into toInsert / toUpdate ── */
    const toInsert    = [];
    const toUpdate    = [];
    let   skipped     = 0;
    const seenCodes   = new Set();
    const seenDomains = new Set();
    const errorRows   = [];

    for (let i = 0; i < data.length; i++) {
      const result = validateRow(data[i], fieldToCol);
      if (!result.valid) {
        skipped++;
        errorRows.push({ row: i + 2, errors: result.errors });
        continue;
      }
      const codeLower = result.values.code.toLowerCase();
      if (seenCodes.has(codeLower)) {
        skipped++;
        errorRows.push({ row: i + 2, errors: [{ field: "code", reason: `Duplicate code "${result.values.code}" in file` }] });
        continue;
      }
      seenCodes.add(codeLower);

      if (existingCodes.has(codeLower)) {
        if (duplicateHandling === "overwrite") toUpdate.push(result.values);
        else skipped++;
      } else {
        /* New institution — guard against email_domain conflicts before queueing INSERT */
        const domainLower = result.values.email_domain.toLowerCase();
        if (existingDomains.has(domainLower) || seenDomains.has(domainLower)) {
          skipped++;
          errorRows.push({ row: i + 2, errors: [{ field: "email_domain", reason: `Email domain "${result.values.email_domain}" is already registered to another institution` }] });
        } else {
          seenDomains.add(domainLower);
          toInsert.push(result.values);
        }
      }
    }

    const BATCH       = 500;
    const total       = toInsert.length + toUpdate.length;
    let   processed   = 0;
    const userId      = req.user.userId;

    const INS_COLS = ["institution_name", "code", "email_domain", "address_line1",
                      "address_line2", "city", "state", "country", "pincode", "status"];
    /* email_domain is excluded from updates — it has its own unique constraint and
       changing it via bulk import risks conflicts; use the edit form for that. */
    const UPD_COLS = INS_COLS.filter((c) => c !== "code" && c !== "email_domain");

    send({ phase: "importing", done: 0, total });

    /* ── INSERT new records in batches of 500 ── */
    /* toInsert is pre-filtered to codes not in DB — plain INSERT, no ON CONFLICT needed */
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk  = toInsert.slice(i, i + BATCH);
      const vals   = [];
      const tuples = [];
      let   p      = 1;

      for (const v of chunk) {
        const t = INS_COLS.map((col) => { vals.push(v[col] ?? null); return `$${p++}`; });
        vals.push(userId, userId);
        t.push(`$${p++}`, `$${p++}`);
        tuples.push(`(${t.join(",")})`);
      }

      await pool.query(
        `INSERT INTO institutions (${INS_COLS.join(",")},created_by,updated_by) VALUES ${tuples.join(",")}`,
        vals
      );

      processed += chunk.length;
      send({ phase: "importing", done: processed, total });
    }

    /* ── UPDATE existing records in batches of 500 (overwrite mode) ── */
    /* Uses UPDATE … FROM unnest(…) — one round-trip, no unique constraint required */
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const chunk      = toUpdate.slice(i, i + BATCH);
      const setClause  = UPD_COLS.map((c) => `${c} = v.${c}`).join(", ");
      // $1=userId, $2…$(N+1)=one text[] per UPD_COL, $(N+2)=code_match[]
      const unnestExpr = UPD_COLS.map((_, idx) => `$${idx + 2}::text[]`)
        .concat(`$${UPD_COLS.length + 2}::text[]`).join(", ");
      const vCols = UPD_COLS.concat("code_match").join(", ");

      await pool.query(
        `UPDATE institutions
         SET ${setClause}, updated_at = now(), updated_by = $1::uuid
         FROM unnest(${unnestExpr}) AS v(${vCols})
         WHERE LOWER(institutions.code) = LOWER(v.code_match)`,
        [userId, ...UPD_COLS.map((col) => chunk.map((v) => v[col] ?? null)), chunk.map((v) => v.code)]
      );

      processed += chunk.length;
      send({ phase: "importing", done: processed, total });
    }

    const imported = toInsert.length + toUpdate.length;

    await writeAuditLog(req, {
      actionType: "INSTITUTIONS_BULK_IMPORTED",
      entityType: "INSTITUTION",
      entityId:   null,
      newValue:   { total: data.length, imported, skipped },
      status:     "SUCCESS",
      message:    `Bulk import: ${imported} imported, ${skipped} skipped`,
    });

    send({ complete: true, imported, skipped, total: data.length, failed: errorRows.length, errors: errorRows.slice(0, 50) });
    res.end();
  } catch (err) {
    logger.error("institutions import/execute failed", { ...getLogContext(req), stack: err.stack });
    try { send({ error: true, message: `Import failed: ${err.message}` }); res.end(); } catch (_) {}
  }
});

/* ── GET /api/institutions/export ─────────────────────────────── */
router.get("/export", requireRole(["super_admin"]), async (req, res) => {
  const pool   = req.app.locals.pool;
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";
  try {
    const fields = await getImportSchema(pool);
    const colExpressions = fields.map((f) => `"${f.dbColumn}" AS "${f.label}"`).join(", ");
    const { rows } = await pool.query(
      `SELECT ${colExpressions} FROM institutions ORDER BY institution_name ASC`
    );
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Institutions");
    const ts = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="institutions_${ts}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", `attachment; filename="institutions_${ts}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } catch (err) {
    logger.error("institutions export failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Export failed." });
  }
});

/* ── GET /api/institutions/export/sample ──────────────────────── */
router.get("/export/sample", requireRole(["super_admin"]), async (req, res) => {
  const pool   = req.app.locals.pool;
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";
  try {
    const fields = await getImportSchema(pool);

    const SAMPLE_DEFAULTS = {
      institution_name: ["Example University", "Sample College", "Test Institute"],
      code:             ["EXUNI001", "SMPLCOL2", "TSTINST3"],
      email_domain:     ["example.edu.in", "sample.ac.in", "test.edu"],
      address_line1:    ["123 Main Street", "45 Gandhi Road", "78 Nehru Nagar"],
      address_line2:    ["Near Central Park", "", "Block A"],
      city:             ["Mumbai", "Delhi", "Bengaluru"],
      state:            ["Maharashtra", "Delhi", "Karnataka"],
      country:          ["India", "India", "India"],
      pincode:          ["400001", "110001", "560001"],
      status:           ["ACTIVE", "ACTIVE", "ACTIVE"],
    };

    const sampleData = [0, 1, 2].map((idx) => {
      const row = {};
      fields.forEach((f) => {
        const vals = SAMPLE_DEFAULTS[f.key];
        row[f.key] = vals ? vals[idx] : "";
      });
      return row;
    });

    if (format === "csv") {
      const ws  = XLSX.utils.json_to_sheet(sampleData);
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader("Content-Disposition", 'attachment; filename="institutions_import_sample.csv"');
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.send(csv);
    }

    // Excel with ExcelJS dropdowns
    let ExcelJS;
    try { ExcelJS = require("exceljs"); } catch (_) { ExcelJS = null; }

    if (!ExcelJS) {
      const ws = XLSX.utils.json_to_sheet(sampleData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Institutions Sample");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename="institutions_import_sample.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }

    const workbook  = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet("Institutions Sample");
    const lookups   = workbook.addWorksheet("_Lookups");
    lookups.state   = "veryHidden";

    INDIA_STATES.forEach((v, i) => { lookups.getCell(i + 1, 1).value = v; });
    ["ACTIVE", "INACTIVE"].forEach((v, i) => { lookups.getCell(i + 1, 2).value = v; });
    lookups.getCell(1, 3).value = "India";

    workbook.definedNames.add(`_Lookups!$A$1:$A$${INDIA_STATES.length}`, "StateList");
    workbook.definedNames.add("_Lookups!$B$1:$B$2", "StatusList");
    workbook.definedNames.add("_Lookups!$C$1:$C$1", "CountryList");

    // Build columns dynamically from schema
    mainSheet.columns = fields.map((f) => ({ header: f.label, key: f.key, width: 22 }));

    mainSheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    sampleData.forEach((row) => mainSheet.addRow(row));

    // Build column-letter map from dynamic schema
    const colLetterMap = {};
    mainSheet.columns.forEach((col, idx) => {
      colLetterMap[col.key] = String.fromCharCode(65 + idx);
    });

    const dropdowns = [
      { field: "state",   range: "StateList",  label: "Indian state" },
      { field: "status",  range: "StatusList", label: "status"       },
      { field: "country", range: "CountryList",label: "country"      },
    ];
    for (const { field, range, label } of dropdowns) {
      const col = colLetterMap[field];
      if (col) {
        mainSheet.dataValidations.add(`${col}2:${col}101`, {
          type: "list", allowBlank: true, formulae: [range],
          showErrorMessage: true,
          errorTitle: "Invalid value",
          error: `Please select a valid ${label} from the dropdown.`,
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", 'attachment; filename="institutions_import_sample.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error("institutions sample export failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Sample file generation failed." });
  }
});

/* ── GET /api/institutions ── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT
         i.institution_id,
         i.institution_name,
         i.code,
         i.email_domain,
         i.address_line1,
         i.address_line2,
         i.city,
         i.state,
         i.country,
         i.pincode,
         i.status,
         i.created_at,
         (
           SELECT COUNT(*)
           FROM departments d
           WHERE d.institution_id = i.institution_id
             AND d.status = 'ACTIVE'
         ) AS department_count,
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.institution_id = i.institution_id
             AND u.account_status = 'ACTIVE'
         ) AS user_count
       FROM institutions i
       ORDER BY i.institution_name ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("GET /api/institutions failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch institutions." });
  }
});

/* ── POST /api/institutions ── */
router.post("/", async (req, res) => {
  const pool      = req.app.locals.pool;
  const createdBy = req.user?.userId;

  if (!isUUID(createdBy)) {
    return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
  }

  const rawName    = typeof req.body.institution_name === "string" ? req.body.institution_name.trim() : "";
  const rawCode    = typeof req.body.code             === "string" ? req.body.code.trim().toUpperCase() : "";
  const rawDomain  = typeof req.body.email_domain     === "string" ? req.body.email_domain.trim().toLowerCase() : "";
  const rawAddr1   = typeof req.body.address_line1    === "string" ? req.body.address_line1.trim() : "";
  const rawAddr2   = typeof req.body.address_line2    === "string" ? req.body.address_line2.trim() : "";
  const rawCity    = typeof req.body.city             === "string" ? req.body.city.trim() : "";
  const rawState   = typeof req.body.state            === "string" ? req.body.state.trim() : "";
  const rawCountry = typeof req.body.country          === "string" ? req.body.country.trim() : "India";
  const rawPincode = typeof req.body.pincode          === "string" ? req.body.pincode.trim() : "";

  const errors = {};
  if (!rawName)   errors.institution_name = "Institution name is required.";
  else if (rawName.length > 200) errors.institution_name = "Name must be 200 characters or fewer.";

  if (!rawCode)   errors.code = "Institution code is required.";
  else if (!/^[A-Z0-9_-]+$/.test(rawCode)) errors.code = "Only letters, digits, hyphens, underscores allowed.";
  else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";

  if (!rawDomain) errors.email_domain = "Email domain is required.";
  else if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(rawDomain)) errors.email_domain = "Enter a valid domain (e.g. college.edu.in).";

  if (!rawAddr1)   errors.address_line1 = "Address line 1 is required.";
  if (!rawCity)    errors.city          = "City is required.";
  if (!rawState)   errors.state         = "State is required.";
  if (!rawPincode) errors.pincode       = "Pincode is required.";
  else if (!/^\d{6}$/.test(rawPincode)) errors.pincode = "Pincode must be 6 digits.";

  if (Object.keys(errors).length) return res.status(400).json({ success: false, errors });

  try {
    const { rows: dupCode } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(code) = LOWER($1)`, [rawCode]
    );
    if (dupCode.length)
      return res.status(409).json({ success: false, errors: { code: `Institution code "${rawCode}" already exists.` } });

    const { rows: dupDomain } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(email_domain) = LOWER($1)`, [rawDomain]
    );
    if (dupDomain.length)
      return res.status(409).json({ success: false, errors: { email_domain: `Domain "${rawDomain}" is already registered.` } });

    const { rows: [newInst] } = await pool.query(
      `INSERT INTO institutions
         (institution_name, code, email_domain, address_line1, address_line2,
          city, state, country, pincode, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       RETURNING institution_id, institution_name, code, email_domain,
                 address_line1, city, state, pincode, status, created_at`,
      [rawName, rawCode, rawDomain, rawAddr1, rawAddr2 || null,
       rawCity, rawState, rawCountry, rawPincode, createdBy]
    );

    await writeAuditLog(req, {
      actionType: "INST_CREATED",
      entityType: "INSTITUTION",
      entityId:   newInst.institution_id,
      newValue:   { name: newInst.institution_name, code: newInst.code, email_domain: newInst.email_domain, city: newInst.city, state: newInst.state, status: newInst.status },
      status:     "SUCCESS",
      message:    `Institution "${newInst.institution_name}" created`,
    });

    return res.status(201).json({
      success: true,
      message: `Institution "${newInst.institution_name}" created successfully.`,
      data: newInst,
    });
  } catch (err) {
    logger.error("POST /api/institutions failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create institution." });
  }
});

/* ── PUT /api/institutions/:id ── */
router.put("/:id", async (req, res) => {
  const pool        = req.app.locals.pool;
  const updatedBy   = req.user?.userId;
  const institutionId = req.params.id;

  if (!isUUID(institutionId)) return res.status(400).json({ success: false, message: "Invalid institution ID." });
  if (!isUUID(updatedBy))    return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });

  const rawName    = typeof req.body.institution_name === "string" ? req.body.institution_name.trim() : "";
  const rawCode    = typeof req.body.code             === "string" ? req.body.code.trim().toUpperCase() : "";
  const rawDomain  = typeof req.body.email_domain     === "string" ? req.body.email_domain.trim().toLowerCase() : "";
  const rawAddr1   = typeof req.body.address_line1    === "string" ? req.body.address_line1.trim() : "";
  const rawAddr2   = typeof req.body.address_line2    === "string" ? req.body.address_line2.trim() : "";
  const rawCity    = typeof req.body.city             === "string" ? req.body.city.trim() : "";
  const rawState   = typeof req.body.state            === "string" ? req.body.state.trim() : "";
  const rawCountry = typeof req.body.country          === "string" ? req.body.country.trim() : "India";
  const rawPincode = typeof req.body.pincode          === "string" ? req.body.pincode.trim() : "";
  const rawStatus  = typeof req.body.status           === "string" ? req.body.status.trim().toUpperCase() : "";

  const errors = {};
  if (!rawName)   errors.institution_name = "Institution name is required.";
  if (!rawCode)   errors.code             = "Code is required.";
  else if (!/^[A-Z0-9_-]+$/.test(rawCode)) errors.code = "Only letters, digits, hyphens, underscores allowed.";
  if (!rawDomain) errors.email_domain     = "Email domain is required.";
  if (!rawAddr1)  errors.address_line1    = "Address line 1 is required.";
  if (!rawCity)   errors.city             = "City is required.";
  if (!rawState)  errors.state            = "State is required.";
  if (!rawPincode) errors.pincode         = "Pincode is required.";
  else if (!/^\d{6}$/.test(rawPincode)) errors.pincode = "Pincode must be 6 digits.";
  if (!["ACTIVE", "INACTIVE"].includes(rawStatus)) errors.status = "Status must be ACTIVE or INACTIVE.";

  if (Object.keys(errors).length) return res.status(400).json({ success: false, errors });

  try {
    const { rows: existingRows } = await pool.query(
      `SELECT institution_id, institution_name, code, email_domain, city, state, pincode, status
       FROM institutions WHERE institution_id = $1`, [institutionId]
    );
    if (!existingRows.length) return res.status(404).json({ success: false, message: "Institution not found." });
    const existing = existingRows[0];

    const { rows: dupCode } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(code) = LOWER($1) AND institution_id <> $2`, [rawCode, institutionId]
    );
    if (dupCode.length)
      return res.status(409).json({ success: false, errors: { code: `Institution code "${rawCode}" already exists.` } });

    const { rows: dupDomain } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(email_domain) = LOWER($1) AND institution_id <> $2`, [rawDomain, institutionId]
    );
    if (dupDomain.length)
      return res.status(409).json({ success: false, errors: { email_domain: `Domain "${rawDomain}" is already registered.` } });

    if (existing.status === "ACTIVE" && rawStatus === "INACTIVE") {
      const { rows: [{ active_count }] } = await pool.query(
        `SELECT COUNT(*) AS active_count FROM users WHERE institution_id = $1 AND account_status = 'ACTIVE'`,
        [institutionId]
      );
      if (Number(active_count) > 0)
        return res.status(409).json({ success: false, message: `Cannot deactivate: ${active_count} active user(s) still belong to this institution.` });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE institutions
       SET institution_name=$1, code=$2, email_domain=$3, address_line1=$4, address_line2=$5,
           city=$6, state=$7, country=$8, pincode=$9, status=$10,
           updated_at=now(), updated_by=$11
       WHERE institution_id=$12
       RETURNING institution_id, institution_name, code, email_domain, city, state, pincode, status, updated_at`,
      [rawName, rawCode, rawDomain, rawAddr1, rawAddr2 || null,
       rawCity, rawState, rawCountry, rawPincode, rawStatus, updatedBy, institutionId]
    );

    const changedFields = ["institution_name", "code", "email_domain", "city", "state", "pincode", "status"]
      .filter((f) => String(existing[f] ?? "") !== String(updated[f] ?? ""));

    await writeAuditLog(req, {
      actionType:    "INST_UPDATED",
      entityType:    "INSTITUTION",
      entityId:      updated.institution_id,
      oldValue:      { name: existing.institution_name, code: existing.code, email_domain: existing.email_domain, city: existing.city, state: existing.state, pincode: existing.pincode, status: existing.status },
      newValue:      { name: updated.institution_name,  code: updated.code,  email_domain: updated.email_domain,  city: updated.city,  state: updated.state,  pincode: updated.pincode,  status: updated.status },
      changedFields,
      status:        "SUCCESS",
      message:       `Institution "${updated.institution_name}" updated`,
    });

    return res.json({ success: true, message: `Institution "${updated.institution_name}" updated successfully.`, data: updated });
  } catch (err) {
    logger.error("PUT /api/institutions/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update institution." });
  }
});

module.exports = router;