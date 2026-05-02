"use strict";

const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const bcrypt  = require("bcrypt");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

/* ─── Multer: memory storage, 25 MB cap ────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV and Excel files (.csv, .xlsx, .xls) are allowed"), ok);
  },
});

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File too large. Maximum size is 25 MB."
        : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}

/* ─── Schema config ─────────────────────────────────────────────── */
const SCHEMA_CONFIG = {
  EXCLUDED: [
    "id", "password_hash", "created_at", "updated_at", "last_login_at", "created_by",
    "must_change_password", "is_temporary_password", "profile_image_url",
    "token_version", "password_changed_at", "refresh_token", "reset_token",
    "reset_token_expires", "email_verified", "email_verification_token",
    "two_factor_secret", "two_factor_enabled", "failed_login_attempts",
    "locked_until", "last_password_change",
  ],
  FK: {
    institution_id: { label: "Institution", importKey: "institution_name", exportExpr: "i.institution_name" },
    department_id:  { label: "Department",  importKey: "department_name",  exportExpr: "d.name" },
  },
  VIRTUAL_IMPORT: [
    { key: "password",  label: "Password", required: false },
    { key: "role_name", label: "Role",     required: false },
  ],
  FORCE_REQUIRED: ["full_name", "email", "institution_name"],
  ALIASES: {
    full_name:        ["name", "fullname", "full name", "full_name", "username", "user name", "employee name", "employee_name", "staff name", "staff_name"],
    email:            ["mail", "email id", "emailid", "email_id", "email address", "emailaddress", "e-mail", "e mail"],
    institution_name: ["institution", "institution name", "institution_name", "org", "organization", "college", "institute", "school", "university"],
    department_name:  ["dept", "department", "department name", "department_name", "dept name", "division"],
    role_name:        ["role", "user role", "rolename", "role_name", "role name", "designation", "access level", "access_level"],
    account_status:   ["status", "user status", "state", "account_status", "account status", "active"],
    password:         ["pass", "pwd", "temp password", "initial password", "temp_password", "initial_password"],
  },
};

function normalize(s) {
  return String(s).toLowerCase().replace(/[\s_\-\.]+/g, "");
}

function toLabel(col) {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getImportSchema(pool) {
  const { rows: cols } = await pool.query(`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);

  const fields = [];
  for (const col of cols) {
    const name = col.column_name;
    if (SCHEMA_CONFIG.EXCLUDED.includes(name)) continue;
    if (SCHEMA_CONFIG.FK[name]) {
      const fk = SCHEMA_CONFIG.FK[name];
      fields.push({
        key: fk.importKey, label: fk.label, dbColumn: name,
        required: SCHEMA_CONFIG.FORCE_REQUIRED.includes(fk.importKey),
        isFk: true, isVirtual: false,
        aliases: SCHEMA_CONFIG.ALIASES[fk.importKey] || [],
      });
      continue;
    }
    const required = SCHEMA_CONFIG.FORCE_REQUIRED.includes(name)
      ? true
      : (col.is_nullable === "NO" && !col.column_default);
    fields.push({
      key: name, label: toLabel(name), dbColumn: name, required,
      isFk: false, isVirtual: false,
      aliases: SCHEMA_CONFIG.ALIASES[name] || [],
    });
  }

  for (const vf of SCHEMA_CONFIG.VIRTUAL_IMPORT) {
    fields.push({
      ...vf, dbColumn: null, isFk: false, isVirtual: true,
      aliases: SCHEMA_CONFIG.ALIASES[vf.key] || [],
    });
  }

  // Required fields first, then optional
  fields.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  return fields;
}

function buildAutoMapping(fields, cols) {
  const mapping = {};
  for (const field of fields) {
    const needles = new Set([
      normalize(field.key),
      normalize(field.label),
      ...field.aliases.map(normalize),
    ]);
    const matched = cols.find((c) => needles.has(normalize(c)));
    mapping[field.key] = matched || "";
  }
  return mapping;
}

/* ── GET /api/users/import/schema ─────────────────────────────── */
router.get(
  "/import/schema",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    try {
      const fields = await getImportSchema(req.app.locals.pool);
      return res.json({ success: true, fields });
    } catch (err) {
      logger.error("import/schema failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to load schema." });
    }
  }
);

/* ── POST /api/users/import/parse ─────────────────────────────── */
router.post(
  "/import/parse",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  handleUpload,
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded." });

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

      if (!rows.length)
        return res.status(400).json({ success: false, message: "File is empty or has no data rows." });
      if (rows.length > 5000)
        return res.status(400).json({ success: false, message: "File exceeds 5,000 rows. Split into smaller batches." });

      const columns = Object.keys(rows[0]);
      return res.json({
        success:     true,
        columns,
        totalRows:   rows.length,
        rows,
        preview:     rows.slice(0, 5),
        autoMapping: buildAutoMapping(fields, columns),
      });
    } catch (err) {
      logger.error("Import parse failed", { ...getLogContext(req), stack: err.stack });
      return res.status(400).json({ success: false, message: `File parsing failed: ${err.message}` });
    }
  }
);

/* ── POST /api/users/import/validate ──────────────────────────── */
router.post(
  "/import/validate",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { mapping, data, defaultInstitutionId = null } = req.body;

    if (!mapping || !Array.isArray(data))
      return res.status(400).json({ success: false, message: "mapping and data are required." });

    try {
      const [{ rows: institutions }, { rows: departments }, { rows: roles }] = await Promise.all([
        pool.query("SELECT institution_id, LOWER(institution_name) AS name_lower FROM institutions WHERE status = 'ACTIVE'"),
        pool.query("SELECT department_id, LOWER(name) AS name_lower, institution_id FROM departments WHERE status = 'ACTIVE'"),
        pool.query("SELECT id, LOWER(name) AS name_lower FROM roles"),
      ]);

      const instMap = new Map(institutions.map((i) => [i.name_lower, i.institution_id]));
      const deptMap = new Map(departments.map((d) => [`${d.institution_id}::${d.name_lower}`, d.department_id]));
      const roleMap = new Map(roles.map((r) => [r.name_lower, r.id]));

      const fieldToCol = {};
      for (const [dbField, fileCol] of Object.entries(mapping)) {
        if (fileCol) fieldToCol[dbField] = fileCol;
      }

      const get = (row, field) => {
        const col = fieldToCol[field];
        return col !== undefined ? String(row[col] ?? "").trim() : "";
      };

      const errors  = [];
      let   ready   = 0;
      let   skipped = 0;

      for (let i = 0; i < data.length; i++) {
        const row       = data[i];
        const rowNum    = i + 1;
        const rowErrors = [];

        const full_name = get(row, "full_name");
        const email     = get(row, "email");
        const inst_name = get(row, "institution_name");
        const dept_name = get(row, "department_name");
        const role_str  = get(row, "role_name");

        if (!full_name)
          rowErrors.push({ field: "full_name",        reason: "Full name is required" });
        if (!email)
          rowErrors.push({ field: "email",            reason: "Email is required" });
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          rowErrors.push({ field: "email",            reason: "Invalid email format" });

        let institution_id = defaultInstitutionId || null;
        if (inst_name) {
          const resolved = instMap.get(inst_name.toLowerCase());
          if (!resolved)
            rowErrors.push({ field: "institution_name", reason: `Institution "${inst_name}" not found` });
          else
            institution_id = resolved;
        }
        if (!institution_id && !rowErrors.some((e) => e.field === "institution_name"))
          rowErrors.push({ field: "institution_name", reason: "Institution is required" });

        if (dept_name && institution_id) {
          if (!deptMap.has(`${institution_id}::${dept_name.toLowerCase()}`))
            rowErrors.push({ field: "department_name", reason: `Department "${dept_name}" not found in this institution` });
        }

        if (role_str && !roleMap.has(role_str.toLowerCase()))
          rowErrors.push({ field: "role_name", reason: `Role "${role_str}" not found` });

        if (rowErrors.length) {
          skipped++;
          errors.push({ row: rowNum, errors: rowErrors });
        } else {
          ready++;
        }
      }

      const unmappedRequired = ["full_name", "email", "institution_name"]
        .filter((f) => !fieldToCol[f]).length;

      return res.json({
        success: true,
        total:   data.length,
        ready,
        skipped,
        unmappedRequired,
        errors,
      });
    } catch (err) {
      logger.error("Import validate failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Validation failed." });
    }
  }
);

/* ── POST /api/users/import/execute ───────────────────────────── */
router.post(
  "/import/execute",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const {
      mapping,
      data,
      duplicateHandling    = "skip",
      defaultInstitutionId = null,
      defaultRoleName      = "",
    } = req.body;

    if (!mapping || !Array.isArray(data) || !data.length)
      return res.status(400).json({ success: false, message: "mapping and data are required." });

    try {
      const [{ rows: institutions }, { rows: departments }, { rows: roles }] = await Promise.all([
        pool.query("SELECT institution_id, LOWER(institution_name) AS name_lower FROM institutions WHERE status = 'ACTIVE'"),
        pool.query("SELECT department_id, LOWER(name) AS name_lower, institution_id FROM departments WHERE status = 'ACTIVE'"),
        pool.query("SELECT id, LOWER(name) AS name_lower FROM roles"),
      ]);

      const instMap = new Map(institutions.map((i) => [i.name_lower, i.institution_id]));
      const deptMap = new Map(departments.map((d) => [`${d.institution_id}::${d.name_lower}`, d.department_id]));
      const roleMap = new Map(roles.map((r) => [r.name_lower, r.id]));

      const fieldToCol = {};
      for (const [dbField, fileCol] of Object.entries(mapping)) {
        if (fileCol) fieldToCol[dbField] = fileCol;
      }

      const get = (row, field) => {
        const col = fieldToCol[field];
        return col !== undefined ? String(row[col] ?? "").trim() : "";
      };

      const errors   = [];
      const prepared = [];

      for (let i = 0; i < data.length; i++) {
        const row    = data[i];
        const rowNum = i + 1;

        const full_name  = get(row, "full_name");
        const email      = get(row, "email");
        const password   = get(row, "password");
        const inst_name  = get(row, "institution_name");
        const dept_name  = get(row, "department_name");
        const role_str   = get(row, "role_name");
        const status_str = get(row, "account_status");

        if (!full_name)
          { errors.push({ row: rowNum, error: "Full name is required" }); continue; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          { errors.push({ row: rowNum, error: "Valid email is required" }); continue; }

        let institution_id = defaultInstitutionId || null;
        if (inst_name) {
          const resolved = instMap.get(inst_name.toLowerCase());
          if (!resolved)
            { errors.push({ row: rowNum, error: `Institution "${inst_name}" not found` }); continue; }
          institution_id = resolved;
        }
        if (!institution_id)
          { errors.push({ row: rowNum, error: "Institution is required — map the column or set a default" }); continue; }

        let department_id = null;
        if (dept_name)
          department_id = deptMap.get(`${institution_id}::${dept_name.toLowerCase()}`) || null;

        const role_lookup = role_str || defaultRoleName || "";
        const role_id     = role_lookup ? (roleMap.get(role_lookup.toLowerCase()) || null) : null;

        const VALID_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];
        const account_status = VALID_STATUSES.includes(status_str?.toUpperCase())
          ? status_str.toUpperCase() : "ACTIVE";

        prepared.push({
          full_name,
          email: email.toLowerCase(),
          rawPassword: password || "Welcome@123",
          institution_id,
          department_id,
          role_id,
          account_status,
        });
      }

      await Promise.all(prepared.map(async (u) => {
        u.password_hash = await bcrypt.hash(u.rawPassword, 10);
      }));

      const allEmails = prepared.map((p) => p.email);
      const { rows: existing } = await pool.query(
        `SELECT email, id FROM users WHERE email = ANY($1::text[]) AND account_status != 'DELETED'`,
        [allEmails]
      );
      const existingMap = new Map(existing.map((r) => [r.email, r.id]));

      const client = await pool.connect();
      let success  = 0;
      let skipped  = 0;

      try {
        await client.query("BEGIN");

        for (const user of prepared) {
          const existingId = existingMap.get(user.email);

          if (existingId && duplicateHandling === "skip") {
            skipped++; continue;
          }

          if (existingId && duplicateHandling === "overwrite") {
            await client.query(
              `UPDATE users SET full_name=$1, institution_id=$2, department_id=$3, account_status=$4 WHERE id=$5`,
              [user.full_name, user.institution_id, user.department_id, user.account_status, existingId]
            );
            if (user.role_id) {
              await client.query(`UPDATE user_roles SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [existingId]);
              await client.query(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [existingId, user.role_id, req.user.userId]
              );
            }
            success++; continue;
          }

          const { rows: ins } = await client.query(
            `INSERT INTO users (full_name, email, password_hash, institution_id, department_id, account_status, must_change_password, is_temporary_password, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,true,true,$7) RETURNING id`,
            [user.full_name, user.email, user.password_hash, user.institution_id, user.department_id, user.account_status, req.user.userId]
          );
          if (user.role_id)
            await client.query(
              `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3)`,
              [ins[0].id, user.role_id, req.user.userId]
            );
          success++;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      await writeAuditLog(req, {
        actionType: "USERS_BULK_IMPORTED",
        entityType: "USER",
        entityId:   null,
        newValue:   { total: data.length, success, skipped, failed: errors.length },
        status:     "SUCCESS",
        message:    `Bulk import: ${success} created/updated, ${skipped} skipped, ${errors.length} failed`,
      });

      return res.json({ success: true, total: data.length, imported: success, skipped, failed: errors.length, errors });
    } catch (err) {
      logger.error("Import execute failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: `Import failed: ${err.message}` });
    }
  }
);

/* ── GET /api/users/export ────────────────────────────────────── */
router.get(
  "/export",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool   = req.app.locals.pool;
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";

    try {
      const { rows } = await pool.query(`
        SELECT
          u.full_name        AS "Full Name",
          u.email            AS "Email",
          u.account_status   AS "Account Status",
          i.institution_name AS "Institution",
          d.name             AS "Department",
          COALESCE(
            (SELECT string_agg(r.display_name, ', ')
             FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND ur.revoked_at IS NULL
               AND (ur.expires_at IS NULL OR ur.expires_at > now())
            ), ''
          ) AS "Roles",
          TO_CHAR(u.created_at,    'YYYY-MM-DD') AS "Created At",
          TO_CHAR(u.last_login_at, 'YYYY-MM-DD') AS "Last Login"
        FROM users u
        LEFT JOIN institutions i ON i.institution_id = u.institution_id
        LEFT JOIN departments  d ON d.department_id  = u.department_id
        WHERE u.account_status != 'DELETED'
        ORDER BY u.created_at DESC
      `);

      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Users");
      const ts = new Date().toISOString().slice(0, 10);

      if (format === "xlsx") {
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", `attachment; filename="users_${ts}.xlsx"`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buf);
      }

      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader("Content-Disposition", `attachment; filename="users_${ts}.csv"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.send(csv);
    } catch (err) {
      logger.error("Export failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Export failed." });
    }
  }
);

/* ── GET /api/users/export/sample ────────────────────────────── */
router.get(
  "/export/sample",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool   = req.app.locals.pool;
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";

    try {
      const [{ rows: institutions }, { rows: departments }, { rows: roles }] = await Promise.all([
        pool.query("SELECT institution_name FROM institutions WHERE status = 'ACTIVE' ORDER BY institution_name LIMIT 50"),
        pool.query("SELECT name FROM departments WHERE status = 'ACTIVE' ORDER BY name LIMIT 50"),
        pool.query("SELECT display_name FROM roles ORDER BY display_name LIMIT 50"),
      ]);

      const instNames = institutions.map((r) => r.institution_name);
      const deptNames = departments.map((r) => r.name);
      const roleNames = roles.map((r) => r.display_name);

      const sampleData = [
        {
          full_name: "Arun Kumar",   email: "arun@example.com",
          password: "TempPass@123",  institution_name: instNames[0] || "Example College",
          department_name: deptNames[0] || "Computer Science",
          role_name: roleNames[0] || "contributor", account_status: "ACTIVE",
        },
        {
          full_name: "Priya Singh",  email: "priya@example.com",
          password: "TempPass@123",  institution_name: instNames[0] || "Example College",
          department_name: deptNames[1] || "Electronics",
          role_name: roleNames[1] || "reviewer", account_status: "ACTIVE",
        },
        {
          full_name: "Vikram Nair",  email: "vikram@example.com",
          password: "TempPass@123",  institution_name: instNames[0] || "Example College",
          department_name: "", role_name: roleNames[0] || "contributor", account_status: "ACTIVE",
        },
      ];

      if (format === "csv") {
        const ws  = XLSX.utils.json_to_sheet(sampleData);
        const csv = XLSX.utils.sheet_to_csv(ws);
        res.setHeader("Content-Disposition", 'attachment; filename="users_import_sample.csv"');
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.send(csv);
      }

      // Excel with dropdowns via ExcelJS
      let ExcelJS;
      try { ExcelJS = require("exceljs"); } catch (_) { ExcelJS = null; }

      if (!ExcelJS) {
        // Fallback: plain xlsx without dropdowns
        const ws = XLSX.utils.json_to_sheet(sampleData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Users Import Sample");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", 'attachment; filename="users_import_sample.xlsx"');
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buf);
      }

      const workbook  = new ExcelJS.Workbook();
      const mainSheet = workbook.addWorksheet("Users Import Sample");
      const lookups   = workbook.addWorksheet("_Lookups");
      lookups.state   = "veryHidden";

      // Write lookup values into hidden sheet columns
      instNames.forEach((v, i) => { lookups.getCell(i + 1, 1).value = v; });
      deptNames.forEach((v, i) => { lookups.getCell(i + 1, 2).value = v; });
      roleNames.forEach((v, i) => { lookups.getCell(i + 1, 3).value = v; });
      ["ACTIVE", "INACTIVE", "SUSPENDED"].forEach((v, i) => { lookups.getCell(i + 1, 4).value = v; });

      // Named ranges for data validation
      if (instNames.length) workbook.definedNames.add(`_Lookups!$A$1:$A$${instNames.length}`, "InstList");
      if (deptNames.length) workbook.definedNames.add(`_Lookups!$B$1:$B$${deptNames.length}`, "DeptList");
      if (roleNames.length) workbook.definedNames.add(`_Lookups!$C$1:$C$${roleNames.length}`, "RoleList");
      workbook.definedNames.add("_Lookups!$D$1:$D$3", "StatusList");

      mainSheet.columns = [
        { header: "Full Name",      key: "full_name",        width: 22 },
        { header: "Email",          key: "email",            width: 28 },
        { header: "Password",       key: "password",         width: 18 },
        { header: "Institution",    key: "institution_name", width: 24 },
        { header: "Department",     key: "department_name",  width: 22 },
        { header: "Role",           key: "role_name",        width: 20 },
        { header: "Account Status", key: "account_status",   width: 16 },
      ];

      mainSheet.getRow(1).eachCell((cell) => {
        cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      sampleData.forEach((row) => mainSheet.addRow(row));

      const validations = [
        { col: "D", range: "InstList",   label: "institution" },
        { col: "E", range: "DeptList",   label: "department"  },
        { col: "F", range: "RoleList",   label: "role"        },
        { col: "G", range: "StatusList", label: "status"      },
      ];
      for (const { col, range, label } of validations) {
        mainSheet.dataValidations.add(`${col}2:${col}101`, {
          type: "list", allowBlank: true, formulae: [range],
          showErrorMessage: true,
          errorTitle: "Invalid value",
          error: `Please select a valid ${label} from the dropdown.`,
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Disposition", 'attachment; filename="users_import_sample.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buffer));
    } catch (err) {
      logger.error("Sample export failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Sample file generation failed." });
    }
  }
);

/* ── GET /api/users ───────────────────────────────────────────── */
router.get("/", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.account_status,
        u.last_login_at,
        u.created_at,
        u.institution_id,
        u.department_id,
        i.institution_name,
        d.name AS department_name,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'name',         r.name,
              'display_name', r.display_name
            ))
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id
             AND ur.revoked_at IS NULL
             AND (ur.expires_at IS NULL OR ur.expires_at > now())
          ), '[]'::json
        ) AS roles
      FROM users u
      LEFT JOIN institutions i ON i.institution_id = u.institution_id
      LEFT JOIN departments  d ON d.department_id  = u.department_id
      WHERE u.account_status != 'DELETED'
      ORDER BY u.created_at DESC
    `);
    return res.json({ success: true, users: rows });
  } catch (err) {
    logger.error("GET /api/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── PUT /api/users/:id ───────────────────────────────────────── */
router.put("/:id", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const { full_name, email, institution_id, department_id, account_status } = req.body;

  if (!full_name?.trim() || !email?.trim())
    return res.status(400).json({ success: false, message: "Name and email are required." });

  const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
  if (account_status && !validStatuses.includes(account_status))
    return res.status(400).json({ success: false, message: "Invalid account status." });

  try {
    const { rows: existingRows } = await pool.query(
      `SELECT full_name, email, account_status, institution_id, department_id
       FROM users WHERE id = $1 AND account_status != 'DELETED'`,
      [id]
    );
    if (!existingRows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const existing = existingRows[0];

    const { rows } = await pool.query(
      `UPDATE users
       SET full_name=$1, email=$2, institution_id=$3, department_id=$4, account_status=$5
       WHERE id=$6
       RETURNING id, full_name, email, account_status, institution_id, department_id`,
      [full_name.trim(), email.trim().toLowerCase(), institution_id || null, department_id || null, account_status, id]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const updated = rows[0];

    const changedFields = ["full_name", "email", "account_status", "institution_id", "department_id"]
      .filter((f) => String(existing[f] ?? "") !== String(updated[f] ?? ""));

    await writeAuditLog(req, {
      actionType:    "USER_UPDATED",
      entityType:    "USER",
      entityId:      updated.id,
      oldValue:      existing,
      newValue:      { full_name: updated.full_name, email: updated.email, account_status: updated.account_status, institution_id: updated.institution_id, department_id: updated.department_id },
      changedFields,
      status:        "SUCCESS",
      message:       `User "${updated.full_name}" updated`,
    });

    return res.json({ success: true, user: updated });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already in use at this institution." });
    logger.error("PUT /api/users/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/* ── POST /api/users ──────────────────────────────────────────── */
router.post("/", verifyToken, requireRole(["super_admin", "institute_admin"]), async (req, res) => {
  const pool = req.app.locals.pool;
  const { full_name, email, password, institution_id, department_id, role_name } = req.body;

  if (!full_name?.trim() || !email?.trim() || !password || !institution_id || !role_name)
    return res.status(400).json({ success: false, message: "Name, email, password, institution, and role are required." });

  if (password.length < 8)
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

  try {
    const { rows: roleRows } = await pool.query("SELECT id FROM roles WHERE name = $1", [role_name]);
    if (!roleRows.length)
      return res.status(400).json({ success: false, message: "Invalid role." });

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, institution_id, department_id, must_change_password, is_temporary_password, created_by)
       VALUES ($1,$2,$3,$4,$5,true,true,$6)
       RETURNING id, full_name, email, account_status`,
      [full_name.trim(), email.trim().toLowerCase(), passwordHash, institution_id, department_id || null, req.user.userId]
    );

    await pool.query(
      "INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3)",
      [rows[0].id, roleRows[0].id, req.user.userId]
    );

    await writeAuditLog(req, {
      actionType: "USER_CREATED",
      entityType: "USER",
      entityId:   rows[0].id,
      newValue:   { full_name: rows[0].full_name, email: rows[0].email, account_status: rows[0].account_status, role: role_name, institution_id, department_id: department_id || null },
      status:     "SUCCESS",
      message:    `User "${rows[0].full_name}" created`,
    });

    return res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ success: false, message: "Email already exists at this institution." });
    logger.error("POST /api/users failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;