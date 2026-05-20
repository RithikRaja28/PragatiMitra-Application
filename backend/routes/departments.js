"use strict";


const express        = require("express");
const multer         = require("multer");
const XLSX           = require("xlsx");
const ExcelJS        = require("exceljs");
const { randomUUID } = require("crypto");
const { verifyToken } = require("../middleware/auth");


const { writeAuditLog } = require("../utils/audit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();
router.use(verifyToken);

/* ── Role helpers ── */
function isOnlyInstAdmin(req) {
  const roles = req.user.roles || [];
  return roles.includes("institute_admin") && !roles.includes("super_admin");
}

/* ── UUID validation helper ── */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => typeof v === "string" && UUID_RE.test(v);

/* ── Multer: memory storage, 10 MB limit ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok =
      /\.(xlsx|xls|csv)$/i.test(file.originalname) ||
      [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/csv",
      ].includes(file.mimetype);
    cb(ok ? null : new Error("Only XLSX / XLS / CSV files are accepted."), !!ok);
  },
});

/* ── Schema fields definition ── */
const DEPT_FIELDS = [
  { key: "institution_name", label: "Institution Name",         required: false,
    aliases: ["institution", "institutionname", "org", "organization", "college", "university"] },
  { key: "name",             label: "Department Name",          required: true,
    aliases: ["departmentname", "deptname", "department", "dept"] },
  { key: "code",             label: "Department Code",          required: true,
    aliases: ["departmentcode", "deptcode", "dept code", "deptid"] },
  { key: "status",           label: "Status (ACTIVE/INACTIVE)", required: false,
    aliases: ["status", "state", "active"] },
];

/* ── Auto-mapping helper — returns { schemaKey: matchingFileColumn } ── */
function buildAutoMapping(fileColumns) {
  const norm = (s) => String(s).toLowerCase().replace(/[\s_\-\.]+/g, "");
  const mapping = {};
  for (const field of DEPT_FIELDS) {
    const needles = new Set([norm(field.key), norm(field.label), ...field.aliases.map(norm)]);
    const matched = fileColumns.find((c) => needles.has(norm(c)));
    mapping[field.key] = matched || "";
  }
  return mapping;
}

/* ─────────────────────────────────────────────────────────────────────
   IMPORT / EXPORT ENDPOINTS
   All static-path routes must come before /:id to avoid route collision.
───────────────────────────────────────────────────────────────────── */

/* ── GET /api/departments/import/schema ────────────────────────────── */
router.get("/import/schema", (req, res) => {
  const fields = DEPT_FIELDS.map(({ key, label, required }) => ({ key, label, required }));
  return res.json({ success: true, fields });
});

/* ── POST /api/departments/import/parse ────────────────────────────── */
router.post("/import/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded." });
  }
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "The file is empty." });
    }
    if (rows.length > 100_000) {
      return res
        .status(400)
        .json({ success: false, message: "File exceeds the 100,000-row limit." });
    }

    const fileColumns = Object.keys(rows[0]);   // actual headers from the uploaded file
    const autoMapping = buildAutoMapping(fileColumns); // { schemaKey: matchingFileColumn }

    const sessionId = randomUUID();
    req.app.locals.importSessions.set(sessionId, {
      rows,
      expiresAt: Date.now() + 3_600_000,
    });

    logger.info("Department import parse", {
      ...getLogContext(req),
      totalRows: rows.length,
      sessionId,
    });

    return res.json({
      success:     true,
      sessionId,
      columns:     fileColumns,   // wizard uses this to populate the "Your File Column" dropdowns
      totalRows:   rows.length,
      preview:     rows.slice(0, 5),
      autoMapping,
    });
  } catch (err) {
    logger.error("POST /api/departments/import/parse failed", {
      ...getLogContext(req),
      stack: err.stack,
    });
    return res.status(500).json({ success: false, message: "Failed to parse file." });
  }
});

/* ── POST /api/departments/import/validate ─────────────────────────── */
router.post("/import/validate", async (req, res) => {
  const { mapping, sessionId, defaultInstitutionId = null } = req.body;
  const pool = req.app.locals.pool;

  const session = req.app.locals.importSessions.get(sessionId);
  if (!session) {
    return res.status(400).json({
      success: false,
      message: "Import session expired. Please re-upload your file.",
    });
  }
  const data = session.rows;

  if (!mapping || typeof mapping !== "object") {
    return res.status(400).json({ success: false, message: "Column mapping is required." });
  }

  try {
    /* Preload institution map: name_lower → institution_id */
    const { rows: instRows } = await pool.query(
      `SELECT institution_id, institution_name
       FROM   institutions
       WHERE  status = 'ACTIVE'`
    );
    const institutionMap = new Map(
      instRows.map((r) => [r.institution_name.toLowerCase().trim(), r.institution_id])
    );

    /* Preload existing departments */
    const { rows: deptRows } = await pool.query(
      `SELECT department_id,
              LOWER(name)  AS name_lower,
              UPPER(code)  AS code_upper,
              institution_id
       FROM   departments`
    );
    const existingByName = new Map(
      deptRows.map((d) => [`${d.name_lower}::${d.institution_id}`, d.department_id])
    );
    const existingByCode = new Map(
      deptRows.map((d) => [`${d.code_upper}::${d.institution_id}`, d.department_id])
    );

    let validCount   = 0;
    let invalidCount = 0;
    const preview    = [];

    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const errors = [];

      const rawInstitutionName = String(row[mapping.institution_name] ?? "").trim();
      const rawName            = String(row[mapping.name]             ?? "").trim();
      const rawCode            = String(row[mapping.code]             ?? "").trim().toUpperCase();
      const rawStatus          =
        (String(row[mapping.status] ?? "").trim().toUpperCase()) || "ACTIVE";

      if (!rawName)  errors.push("name is required.");
      if (!rawCode)  errors.push("code is required.");
      else if (!/^[A-Z0-9_-]+$/.test(rawCode))
        errors.push("code may only contain letters, digits, hyphens, underscores.");
      if (!["ACTIVE", "INACTIVE"].includes(rawStatus))
        errors.push(`Invalid status "${rawStatus}". Use ACTIVE or INACTIVE.`);

      /* Resolve institution */
      let institution_id = null;
      if (rawInstitutionName) {
        institution_id = institutionMap.get(rawInstitutionName.toLowerCase());
        if (!institution_id)
          errors.push(`Institution "${rawInstitutionName}" not found or inactive.`);
      } else if (defaultInstitutionId) {
        institution_id = defaultInstitutionId;
      } else {
        errors.push("institution_name is required (or select a default institution).");
      }

      /* Check existing / duplicate */
      let existsInDB    = false;
      let existingDeptId = null;
      if (institution_id && rawName) {
        const nameKey  = `${rawName.toLowerCase()}::${institution_id}`;
        existingDeptId = existingByName.get(nameKey) ?? null;
        existsInDB     = !!existingDeptId;
      }

      /* Code collision only matters for new records */
      if (institution_id && rawCode && !existsInDB) {
        const codeKey = `${rawCode}::${institution_id}`;
        if (existingByCode.has(codeKey))
          errors.push(`Code "${rawCode}" is already used by another department in this institution.`);
      }

      const isValid = errors.length === 0;
      if (isValid) validCount++;
      else         invalidCount++;

      if (preview.length < 50) {
        preview.push({
          rowIndex:         i,
          institution_name: rawInstitutionName || "(default)",
          name:             rawName,
          code:             rawCode,
          status:           rawStatus,
          existsInDB,
          valid:            isValid,
          errors,
        });
      }
    }

    return res.json({ success: true, validCount, invalidCount, preview, total: data.length });
  } catch (err) {
    logger.error("POST /api/departments/import/validate failed", {
      ...getLogContext(req),
      stack: err.stack,
    });
    return res.status(500).json({ success: false, message: "Validation failed." });
  }
});

/* ── POST /api/departments/import/execute ──────────────────────────── */
router.post("/import/execute", async (req, res) => {
  const {
    mapping,
    sessionId,
    duplicateHandling = "skip",
    defaultInstitutionId = null,
  } = req.body;
  const pool = req.app.locals.pool;

  /* SSE setup */
  res.setHeader("Content-Type",    "text/event-stream");
  res.setHeader("Cache-Control",   "no-cache");
  res.setHeader("Connection",      "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload) => {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
  };

  const session = req.app.locals.importSessions.get(sessionId);
  if (!session) {
    send({ error: true, message: "Import session expired. Please re-upload your file." });
    return res.end();
  }
  const data = session.rows;

  try {
    send({ progress: 0, message: "Loading reference data…" });

    /* Preload institution map */
    const { rows: instRows } = await pool.query(
      `SELECT institution_id, institution_name
       FROM   institutions
       WHERE  status = 'ACTIVE'`
    );
    const institutionMap = new Map(
      instRows.map((r) => [r.institution_name.toLowerCase().trim(), r.institution_id])
    );

    /* Preload existing departments */
    const { rows: deptRows } = await pool.query(
      `SELECT department_id,
              LOWER(name)  AS name_lower,
              UPPER(code)  AS code_upper,
              institution_id
       FROM   departments`
    );
    const existingByName = new Map(
      deptRows.map((d) => [`${d.name_lower}::${d.institution_id}`, d.department_id])
    );
    const existingByCode = new Map(
      deptRows.map((d) => [`${d.code_upper}::${d.institution_id}`, d.department_id])
    );

    send({ progress: 5, message: "Processing rows…" });

    /* Prepare rows */
    const toInsert = [];
    const toUpdate = [];
    const errorRows = [];
    let skipped = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      const rawInstitutionName = String(row[mapping.institution_name] ?? "").trim();
      const rawName            = String(row[mapping.name]             ?? "").trim();
      const rawCode            = String(row[mapping.code]             ?? "").trim().toUpperCase();
      const rawStatus          =
        (String(row[mapping.status] ?? "").trim().toUpperCase()) || "ACTIVE";

      if (!rawName || !rawCode) {
        errorRows.push({ row: i + 2, reason: "name and code are required." });
        continue;
      }
      if (!/^[A-Z0-9_-]+$/.test(rawCode)) {
        errorRows.push({ row: i + 2, reason: `Invalid code format: "${rawCode}".` });
        continue;
      }

      let institution_id = null;
      if (rawInstitutionName) {
        institution_id = institutionMap.get(rawInstitutionName.toLowerCase());
        if (!institution_id) {
          errorRows.push({ row: i + 2, reason: `Institution "${rawInstitutionName}" not found.` });
          continue;
        }
      } else if (defaultInstitutionId) {
        institution_id = defaultInstitutionId;
      } else {
        errorRows.push({ row: i + 2, reason: "institution_name is required." });
        continue;
      }

      const status   = ["ACTIVE", "INACTIVE"].includes(rawStatus) ? rawStatus : "ACTIVE";
      const nameKey  = `${rawName.toLowerCase()}::${institution_id}`;
      const codeKey  = `${rawCode}::${institution_id}`;
      const existingId = existingByName.get(nameKey);

      if (existingId) {
        if (duplicateHandling === "update") {
          toUpdate.push({
            department_id: existingId,
            name:          rawName,
            code:          rawCode,
            institution_id,
            status,
          });
        } else {
          skipped++;
        }
      } else {
        /* Check code collision for new inserts */
        if (existingByCode.has(codeKey)) {
          errorRows.push({
            row:    i + 2,
            reason: `Code "${rawCode}" already used by another department in this institution.`,
          });
          continue;
        }
        toInsert.push({ name: rawName, code: rawCode, institution_id, status });
        /* Register in maps to catch intra-file duplicates */
        existingByName.set(nameKey, "__pending__");
        existingByCode.set(codeKey, "__pending__");
      }
    }

    send({ progress: 20, message: `Inserting ${toInsert.length} new departments…` });

    const CHUNK     = 1000;
    const createdBy = req.user.userId;
    let insertDone  = 0;
    let updateDone  = 0;

    /* Batch INSERT */
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const vals  = [];
      const tuples = chunk.map((d, idx) => {
        const b = idx * 5;
        vals.push(d.name, d.code, d.institution_id, d.status, createdBy);
        return `($${b+1},$${b+2},$${b+3}::uuid,$${b+4},$${b+5}::uuid,$${b+5}::uuid)`;
      });
      await pool.query(
        `INSERT INTO departments
           (name, code, institution_id, status, created_by, updated_by)
         VALUES ${tuples.join(",")}`,
        vals
      );
      insertDone += chunk.length;
      send({
        progress: Math.round(20 + (insertDone / Math.max(toInsert.length, 1)) * 50),
        message:  `Inserted ${insertDone} / ${toInsert.length}`,
      });
    }

    send({ progress: 70, message: `Updating ${toUpdate.length} existing departments…` });

    /* Batch UPDATE via unnest */
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      await pool.query(
        `UPDATE departments
         SET    name           = v.name,
                code           = v.code,
                institution_id = v.institution_id::uuid,
                status         = v.status,
                updated_at     = now(),
                updated_by     = $6::uuid
         FROM   unnest($1::uuid[],$2::text[],$3::text[],$4::uuid[],$5::text[])
                  AS v(department_id, name, code, institution_id, status)
         WHERE  departments.department_id = v.department_id`,
        [
          chunk.map((d) => d.department_id),
          chunk.map((d) => d.name),
          chunk.map((d) => d.code),
          chunk.map((d) => d.institution_id),
          chunk.map((d) => d.status),
          createdBy,
        ]
      );
      updateDone += chunk.length;
      send({
        progress: Math.round(70 + (updateDone / Math.max(toUpdate.length, 1)) * 25),
        message:  `Updated ${updateDone} / ${toUpdate.length}`,
      });
    }

    /* Clean up session */
    req.app.locals.importSessions.delete(sessionId);

    logger.info("Department import complete", {
      ...getLogContext(req),
      insertDone,
      updateDone,
      skipped,
      errors: errorRows.length,
    });

    send({
      complete:  true,
      imported:  insertDone,
      updated:   updateDone,
      skipped,
      total:     data.length,
      failed:    errorRows.length,
      errors:    errorRows.slice(0, 50),
    });
    res.end();
  } catch (err) {
    logger.error("POST /api/departments/import/execute failed", {
      ...getLogContext(req),
      stack: err.stack,
    });
    send({ error: true, message: "Import failed: " + err.message });
    res.end();
  }
});

/* ── GET /api/departments/export ───────────────────────────────────── */
router.get("/export", async (req, res) => {
  const pool = req.app.locals.pool;
  const { institution_id } = req.query;

  try {
    const params = [];
    let sql = `
      SELECT d.name,
             d.code,
             i.institution_name,
             d.status,
             to_char(d.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
      FROM   departments d
      JOIN   institutions i ON i.institution_id = d.institution_id
    `;
    if (isUUID(institution_id)) {
      sql += ` WHERE d.institution_id = $1`;
      params.push(institution_id);
    }
    sql += ` ORDER BY i.institution_name, d.name`;

    const { rows } = await pool.query(sql, params);

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Departments");

    worksheet.columns = [
      { header: "institution_name", key: "institution_name", width: 40 },
      { header: "name",             key: "name",             width: 40 },
      { header: "code",             key: "code",             width: 22 },
      { header: "status",           key: "status",           width: 15 },
      { header: "created_at",       key: "created_at",       width: 22 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    for (const row of rows) {
      worksheet.addRow(row);
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=departments_export.xlsx"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error("GET /api/departments/export failed", {
      ...getLogContext(req),
      stack: err.stack,
    });
    return res.status(500).json({ success: false, message: "Export failed." });
  }
});

/* ── GET /api/departments/export/sample ────────────────────────────── */
router.get("/export/sample", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows: instRows } = await pool.query(
      `SELECT institution_name
       FROM   institutions
       WHERE  status = 'ACTIVE'
       ORDER  BY institution_name`
    );
    const institutionNames = instRows.map((r) => r.institution_name);

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Departments Import");
    const listSheet = workbook.addWorksheet("_lists");
    listSheet.state = "veryHidden";

    institutionNames.forEach((name, i) => {
      listSheet.getCell(i + 1, 1).value = name;
    });

    worksheet.columns = [
      { header: "institution_name", key: "institution_name", width: 40 },
      { header: "name",             key: "name",             width: 40 },
      { header: "code",             key: "code",             width: 22 },
      { header: "status",           key: "status",           width: 15 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const ex1 = institutionNames[0] || "My University";
    const ex2 = institutionNames[1] || institutionNames[0] || "My University";
    worksheet.addRow({ institution_name: ex1, name: "Computer Science",       code: "CS",   status: "ACTIVE" });
    worksheet.addRow({ institution_name: ex1, name: "Electrical Engineering",  code: "EE",   status: "ACTIVE" });
    worksheet.addRow({ institution_name: ex2, name: "Business Administration", code: "MBA",  status: "ACTIVE" });

    const MAX_ROWS = 5001;

    if (institutionNames.length) {
      for (let r = 2; r <= MAX_ROWS; r++) {
        worksheet.getCell(r, 1).dataValidation = {
          type:             "list",
          allowBlank:       true,
          formulae:         [`_lists!$A$1:$A$${institutionNames.length}`],
          showErrorMessage: true,
          errorTitle:       "Invalid institution",
          error:            "Pick from the dropdown list.",
        };
      }
    }

    for (let r = 2; r <= MAX_ROWS; r++) {
      worksheet.getCell(r, 4).dataValidation = {
        type:             "list",
        allowBlank:       true,
        formulae:         ['"ACTIVE,INACTIVE"'],
        showErrorMessage: true,
        errorTitle:       "Invalid status",
        error:            "Use ACTIVE or INACTIVE.",
      };
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=departments_import_sample.xlsx"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error("GET /api/departments/export/sample failed", {
      ...getLogContext(req),
      stack: err.stack,
    });
    return res.status(500).json({ success: false, message: "Failed to generate sample file." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   EXISTING CRUD ROUTES
───────────────────────────────────────────────────────────────────── */

/* ── GET /api/departments/institutions ──────────────────────────
   Super admin  → all active institutions (unchanged).
   Inst. admin  → only their own institution.
──────────────────────────────────────────────────────────────── */
router.get(
  "/institutions",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      if (isOnlyInstAdmin(req)) {
        const { rows } = await pool.query(
          `SELECT institution_id, institution_name
           FROM   institutions
           WHERE  institution_id = $1`,
          [req.user.institutionId]
        );
        return res.json({ success: true, data: rows });
      }

      // Super admin — original query unchanged
      const { rows } = await pool.query(
        `SELECT institution_id, institution_name
         FROM   institutions
         ORDER  BY institution_name ASC`
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error("GET /api/departments/institutions failed", {
        ...getLogContext(req), stack: err.stack,
      });
      return res.status(500).json({ success: false, message: "Failed to fetch institutions." });
    }
  }
);

/* ── GET /api/departments?institution_id=<uuid> ─────────────────
   Super admin  → any institution (unchanged).
   Inst. admin  → forced to their own institution_id.
──────────────────────────────────────────────────────────────── */
router.get(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    let { institution_id } = req.query;

    // Inst. admin: ignore whatever was sent, use their own
    if (isOnlyInstAdmin(req)) {
      institution_id = req.user.institutionId;
    }

    if (!isUUID(institution_id)) {
      return res.status(400).json({ success: false, message: "A valid institution_id is required." });
    }

    // For inst. admin: double-check it really is their institution
    if (isOnlyInstAdmin(req) && institution_id !== req.user.institutionId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
      const { rows } = await pool.query(
        `SELECT
           d.department_id,
           d.name,
           d.code,
           d.status,
           d.created_at,
           COUNT(u.id) FILTER (WHERE u.account_status != 'DELETED') AS member_count
         FROM   departments d
         LEFT   JOIN users u
                ON  u.department_id  = d.department_id
                AND u.institution_id = $1
         WHERE  d.institution_id = $1
         GROUP  BY d.department_id, d.name, d.code, d.status, d.created_at
         ORDER  BY d.name ASC`,
        [institution_id]
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error("GET /api/departments failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to fetch departments." });
    }
  }
);

/* ── POST /api/departments ──────────────────────────────────────
   Super admin  → institution_id from request body (unchanged).
   Inst. admin  → institution_id forced to their own.
──────────────────────────────────────────────────────────────── */
router.post(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const createdBy = req.user?.userId;

    const rawName = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const rawCode = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";

    // Inst. admin: ignore client-supplied institution_id, use their own
    const institution_id = isOnlyInstAdmin(req)
      ? req.user.institutionId
      : req.body.institution_id;

    const errors = {};
    if (!rawName) errors.name = "Department name is required.";
    else if (rawName.length > 120) errors.name = "Name must be 120 characters or fewer.";

    if (!rawCode) errors.code = "Department code is required.";
    else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";
    else if (!/^[A-Z0-9_-]+$/.test(rawCode))
      errors.code = "Code may only contain letters, digits, hyphens, and underscores.";

    if (!isUUID(institution_id)) errors.institution_id = "A valid institution is required.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, errors });
    }

    if (!isUUID(createdBy)) {
      return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
    }

    try {
      const { rows: instRows } = await pool.query(
        `SELECT 1 FROM institutions WHERE institution_id = $1 AND status = 'ACTIVE'`,
        [institution_id]
      );
      if (!instRows.length) {
        return res.status(400).json({
          success: false,
          errors: { institution_id: "Institution not found or is inactive." },
        });
      }

      const { rows: dupName } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1 AND LOWER(name) = LOWER($2)`,
        [institution_id, rawName]
      );
      if (dupName.length) {
        return res.status(409).json({
          success: false,
          errors: { name: `A department named "${rawName}" already exists in this institution.` },
        });
      }

      const { rows: dupCode } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1 AND code = $2`,
        [institution_id, rawCode]
      );
      if (dupCode.length) {
        return res.status(409).json({
          success: false,
          errors: { code: `Code "${rawCode}" is already used by another department in this institution.` },
        });
      }

      const { rows: [newDept] } = await pool.query(
        `INSERT INTO departments (institution_id, name, code, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING department_id, name, code, status, created_at`,
        [institution_id, rawName, rawCode, createdBy]
      );

      await writeAuditLog(req, {
        actionType: "DEPT_CREATED",
        entityType: "DEPARTMENT",
        entityId:   newDept.department_id,
        newValue:   { name: newDept.name, code: newDept.code, status: newDept.status },
        status:     "SUCCESS",
        message:    `Department "${newDept.name}" created`,
      });

      return res.status(201).json({
        success: true,
        message: `Department "${newDept.name}" created successfully.`,
        data: newDept,
      });
    } catch (err) {
      logger.error("POST /api/departments failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to create department." });
    }
<<<<<<< HEAD

    const { rows: [newDept] } = await pool.query(
      `INSERT INTO departments (institution_id, name, code, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING department_id, name, code, status, created_at`,
      [institution_id, rawName, rawCode, createdBy]
    );

    await writeAuditLog(req, {
      actionType: "DEPT_CREATED",
      entityType: "DEPARTMENT",
      entityId:   newDept.department_id,
      newValue:   { name: newDept.name, code: newDept.code, status: newDept.status },
      status:     "SUCCESS",
      message:    `Department "${newDept.name}" created`,
    });

    return res.status(201).json({
      success: true,
      message: `Department "${newDept.name}" created successfully.`,
      data: newDept,
    });
  } catch (err) {
    logger.error("POST /api/departments failed", { ...getLogContext(req), stack: err.stack });
    return res
      .status(500)
      .json({ success: false, message: "Failed to create department." });
=======
>>>>>>> insAdmin
  }
);

/* ── PUT /api/departments/:id ───────────────────────────────────
   Super admin  → can update any department (unchanged).
   Inst. admin  → 403 if the department belongs to another institution.
──────────────────────────────────────────────────────────────── */
router.put(
  "/:id",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const updatedBy = req.user?.userId;
    const departmentId = req.params.id;

    if (!isUUID(departmentId)) {
      return res.status(400).json({ success: false, message: "Invalid department ID." });
    }
    if (!isUUID(updatedBy)) {
      return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
    }

    const rawName   = typeof req.body.name   === "string" ? req.body.name.trim()                : "";
    const rawCode   = typeof req.body.code   === "string" ? req.body.code.trim().toUpperCase()   : "";
    const rawStatus = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

    const errors = {};
    if (!rawName) errors.name = "Department name is required.";
    else if (rawName.length > 120) errors.name = "Name must be 120 characters or fewer.";

    if (!rawCode) errors.code = "Department code is required.";
    else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";
    else if (!/^[A-Z0-9_-]+$/.test(rawCode))
      errors.code = "Code may only contain letters, digits, hyphens, and underscores.";

    if (!["ACTIVE", "INACTIVE"].includes(rawStatus))
      errors.status = "Status must be ACTIVE or INACTIVE.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, errors });
    }

    try {
      const { rows: existingRows } = await pool.query(
        `SELECT department_id, name, code, status, institution_id
         FROM   departments
         WHERE  department_id = $1`,
        [departmentId]
      );
      if (!existingRows.length) {
        return res.status(404).json({ success: false, message: "Department not found." });
      }
      const existing = existingRows[0];

      // Inst. admin: must own this department
      if (isOnlyInstAdmin(req) && existing.institution_id !== req.user.institutionId) {
        return res.status(403).json({ success: false, message: "You can only manage departments in your own institution." });
      }

      const { rows: dupName } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1
           AND  LOWER(name) = LOWER($2)
           AND  department_id <> $3`,
        [existing.institution_id, rawName, departmentId]
      );
      if (dupName.length) {
        return res.status(409).json({
          success: false,
          errors: { name: `A department named "${rawName}" already exists in this institution.` },
        });
      }

      const { rows: dupCode } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1
           AND  code = $2
           AND  department_id <> $3`,
        [existing.institution_id, rawCode, departmentId]
      );
      if (dupCode.length) {
        return res.status(409).json({
          success: false,
          errors: { code: `Code "${rawCode}" is already used by another department in this institution.` },
        });
      }

      if (existing.status === "ACTIVE" && rawStatus === "INACTIVE") {
        const { rows: [{ active_count }] } = await pool.query(
          `SELECT COUNT(*) AS active_count
           FROM   users
           WHERE  department_id  = $1
             AND  account_status = 'ACTIVE'`,
          [departmentId]
        );
        if (Number(active_count) > 0) {
          return res.status(409).json({
            success: false,
            message: `Cannot deactivate "${existing.name}": ${active_count} user(s) are still active. Deactivate all members first.`,
          });
        }
      }

      const { rows: [updated] } = await pool.query(
        `UPDATE departments
         SET    name       = $2,
                code       = $3,
                status     = $4,
                updated_at = now(),
                updated_by = $5
         WHERE  department_id = $1
         RETURNING department_id, name, code, status, created_at, updated_at`,
        [departmentId, rawName, rawCode, rawStatus, updatedBy]
      );

      const changedFields = ["name", "code", "status"].filter(
        (f) => existing[f] !== updated[f]
      );

      await writeAuditLog(req, {
        actionType:    "DEPT_UPDATED",
        entityType:    "DEPARTMENT",
        entityId:      updated.department_id,
        oldValue:      { name: existing.name, code: existing.code, status: existing.status },
        newValue:      { name: updated.name,  code: updated.code,  status: updated.status  },
        changedFields,
        status:        "SUCCESS",
        message:       `Department "${updated.name}" updated`,
      });

      return res.json({
        success: true,
        message: `Department "${updated.name}" updated successfully.`,
        data: updated,
      });
    } catch (err) {
      logger.error("PUT /api/departments/:id failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to update department." });
    }
  }
);

/* ── PATCH /api/departments/:id/deactivate ──────────────────────
   Super admin  → institution_id from request body (unchanged).
   Inst. admin  → institution_id forced to their own.
──────────────────────────────────────────────────────────────── */
router.patch(
  "/:id/deactivate",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const updatedBy = req.user?.userId;
    const departmentId = req.params.id;

    // Inst. admin: use their own institution_id regardless of request body
    const institution_id = isOnlyInstAdmin(req)
      ? req.user.institutionId
      : req.body.institution_id;

    if (!isUUID(departmentId)) {
      return res.status(400).json({ success: false, message: "Invalid department ID." });
    }
    if (!isUUID(institution_id)) {
      return res.status(400).json({ success: false, message: "A valid institution_id is required." });
    }

    try {
      const { rows: deptRows } = await pool.query(
        `SELECT department_id, name, status
         FROM   departments
         WHERE  department_id = $1 AND institution_id = $2`,
        [departmentId, institution_id]
      );

      if (!deptRows.length) {
        return res.status(404).json({ success: false, message: "Department not found." });
      }

      const dept = deptRows[0];

      if (dept.status === "INACTIVE") {
        return res.status(409).json({ success: false, message: "Department is already inactive." });
      }

      const { rows: [{ active_count }] } = await pool.query(
        `SELECT COUNT(*) AS active_count
         FROM   users
         WHERE  department_id  = $1
           AND  institution_id = $2
           AND  account_status = 'ACTIVE'`,
        [departmentId, institution_id]
      );

      if (Number(active_count) > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot deactivate "${dept.name}": ${active_count} user(s) are still active. Deactivate all members first.`,
        });
      }

      await pool.query(
        `UPDATE departments
         SET    status     = 'INACTIVE',
                updated_at = now(),
                updated_by = $2
         WHERE  department_id = $1`,
        [departmentId, updatedBy]
      );

<<<<<<< HEAD
    const changedFields = ["name", "code", "status"].filter(
      (f) => existing[f] !== updated[f]
    );

    await writeAuditLog(req, {
      actionType:    "DEPT_UPDATED",
      entityType:    "DEPARTMENT",
      entityId:      updated.department_id,
      oldValue:      { name: existing.name, code: existing.code, status: existing.status },
      newValue:      { name: updated.name,  code: updated.code,  status: updated.status  },
      changedFields,
      status:        "SUCCESS",
      message:       `Department "${updated.name}" updated`,
    });

    return res.json({
      success: true,
      message: `Department "${updated.name}" updated successfully.`,
      data: updated,
    });
  } catch (err) {
    logger.error("PUT /api/departments/:id failed", { ...getLogContext(req), stack: err.stack });
    return res
      .status(500)
      .json({ success: false, message: "Failed to update department." });
  }
});

/* ── PATCH /api/departments/:id/deactivate ──────────────────────
   Soft-deletes a department (status → INACTIVE).
──────────────────────────────────────────────────────────────── */
router.patch("/:id/deactivate", async (req, res) => {
  const pool = req.app.locals.pool;
  const updatedBy = req.user?.userId;
  const departmentId = req.params.id;
  const { institution_id } = req.body;

  if (!isUUID(departmentId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid department ID." });
  }
  if (!isUUID(institution_id)) {
    return res
      .status(400)
      .json({ success: false, message: "A valid institution_id is required." });
  }

  try {
    const { rows: deptRows } = await pool.query(
      `SELECT department_id, name, status
       FROM   departments
       WHERE  department_id = $1 AND institution_id = $2`,
      [departmentId, institution_id]
    );

    if (!deptRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    }

    const dept = deptRows[0];

    if (dept.status === "INACTIVE") {
      return res
        .status(409)
        .json({ success: false, message: "Department is already inactive." });
    }

    const { rows: [{ active_count }] } = await pool.query(
      `SELECT COUNT(*) AS active_count
       FROM   users
       WHERE  department_id  = $1
         AND  institution_id = $2
         AND  account_status = 'ACTIVE'`,
      [departmentId, institution_id]
    );

    if (Number(active_count) > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot deactivate "${dept.name}": ${active_count} user(s) are still active. Deactivate all members first.`,
=======
      await writeAuditLog(req, {
        actionType:    "DEPT_DEACTIVATED",
        entityType:    "DEPARTMENT",
        entityId:      departmentId,
        oldValue:      { status: "ACTIVE" },
        newValue:      { status: "INACTIVE" },
        changedFields: ["status"],
        status:        "SUCCESS",
        message:       `Department "${dept.name}" deactivated`,
>>>>>>> insAdmin
      });

      return res.json({ success: true, message: `"${dept.name}" has been deactivated.` });
    } catch (err) {
      logger.error("PATCH /api/departments/:id/status failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to deactivate department." });
    }
<<<<<<< HEAD

    await pool.query(
      `UPDATE departments
       SET    status     = 'INACTIVE',
              updated_at = now(),
              updated_by = $2
       WHERE  department_id = $1`,
      [departmentId, updatedBy]
    );

    await writeAuditLog(req, {
      actionType:    "DEPT_DEACTIVATED",
      entityType:    "DEPARTMENT",
      entityId:      departmentId,
      oldValue:      { status: "ACTIVE" },
      newValue:      { status: "INACTIVE" },
      changedFields: ["status"],
      status:        "SUCCESS",
      message:       `Department "${dept.name}" deactivated`,
    });

    return res.json({
      success: true,
      message: `"${dept.name}" has been deactivated.`,
    });
  } catch (err) {
    logger.error("PATCH /api/departments/:id/status failed", { ...getLogContext(req), stack: err.stack });
    return res
      .status(500)
      .json({ success: false, message: "Failed to deactivate department." });
=======
>>>>>>> insAdmin
  }
);

module.exports = router;
