"use strict";

const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const bcrypt  = require("bcrypt");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const logger  = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

/* ── Multer: memory storage, 25 MB limit ── */
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
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

/* ── Dynamic field schema ── */
/* This array drives the mapping UI; add/remove entries here to extend the system. */
const IMPORT_FIELDS = [
  {
    key:      "full_name",
    label:    "Full Name",
    required: true,
    aliases:  ["name", "fullname", "full_name", "username", "user", "employee_name", "employeename", "staff_name"],
  },
  {
    key:      "email",
    label:    "Email",
    required: true,
    aliases:  ["mail", "email_id", "emailid", "email_address", "emailaddress", "e-mail"],
  },
  {
    key:      "password",
    label:    "Password",
    required: false,
    aliases:  ["pass", "pwd", "password", "temp_password", "temppassword", "initial_password"],
  },
  {
    key:      "institution_name",
    label:    "Institution",
    required: false,
    aliases:  ["institution", "org", "organization", "college", "institute", "institution_name", "school", "university"],
  },
  {
    key:      "department_name",
    label:    "Department",
    required: false,
    aliases:  ["dept", "department", "dept_name", "department_name", "division"],
  },
  {
    key:      "role_name",
    label:    "Role",
    required: false,
    aliases:  ["role", "user_role", "rolename", "role_name", "designation", "access_level"],
  },
  {
    key:      "account_status",
    label:    "Account Status",
    required: false,
    aliases:  ["status", "user_status", "state", "account_status", "active"],
  },
];

/* Normalize a string for alias matching */
function normalize(s) {
  return String(s).toLowerCase().replace(/[\s_\-\.]+/g, "");
}

/* Auto-map file columns to system fields using alias matching */
function buildAutoMapping(fileColumns) {
  const mapping = {};
  for (const field of IMPORT_FIELDS) {
    const needles = new Set([
      normalize(field.key),
      normalize(field.label),
      ...field.aliases.map(normalize),
    ]);
    const matched = fileColumns.find((col) => needles.has(normalize(col)));
    mapping[field.key] = matched || "";
  }
  return mapping;
}

/* ── GET /api/users/import/schema ── */
router.get(
  "/import/schema",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  (_req, res) => {
    res.json({ success: true, fields: IMPORT_FIELDS });
  }
);

/* ── POST /api/users/import/parse ── */
router.post(
  "/import/parse",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  handleUpload,
  (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded." });

    try {
      const ext       = req.file.originalname.toLowerCase().split(".").pop();
      const encoding  = req.body.encoding  || "UTF-8";
      const delimiter = req.body.delimiter || ",";

      let wb;
      if (ext === "csv") {
        const text = req.file.buffer.toString(encoding.toLowerCase().replace("-", ""));
        wb = XLSX.read(text, { type: "string", FS: delimiter });
      } else {
        wb = XLSX.read(req.file.buffer, { type: "buffer" });
      }

      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length)
        return res.status(400).json({ success: false, message: "File is empty or has no data rows." });

      if (rows.length > 5000)
        return res.status(400).json({ success: false, message: "File has more than 5,000 rows. Please split it into smaller batches." });

      const columns = Object.keys(rows[0]);

      return res.json({
        success:     true,
        columns,
        totalRows:   rows.length,
        rows,                         // all rows — frontend holds them for execute
        preview:     rows.slice(0, 5),
        autoMapping: buildAutoMapping(columns),
      });
    } catch (err) {
      logger.error("Import parse failed", { ...getLogContext(req), stack: err.stack });
      return res.status(400).json({ success: false, message: `File parsing failed: ${err.message}` });
    }
  }
);

/* ── POST /api/users/import/execute ── */
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
      /* Pre-fetch lookups once */
      const [{ rows: institutions }, { rows: departments }, { rows: roles }] = await Promise.all([
        pool.query("SELECT institution_id, LOWER(institution_name) AS name_lower FROM institutions WHERE status = 'ACTIVE'"),
        pool.query("SELECT department_id, LOWER(name) AS name_lower, institution_id FROM departments WHERE status = 'ACTIVE'"),
        pool.query("SELECT id, LOWER(name) AS name_lower FROM roles"),
      ]);

      const instMap = new Map(institutions.map((i) => [i.name_lower, i.institution_id]));
      const deptMap = new Map(departments.map((d) => [`${d.institution_id}::${d.name_lower}`, d.department_id]));
      const roleMap = new Map(roles.map((r) => [r.name_lower, r.id]));

      /* fieldToCol: dbField → fileColumn (only entries with a column selected) */
      const fieldToCol = {};
      for (const [dbField, fileCol] of Object.entries(mapping)) {
        if (fileCol) fieldToCol[dbField] = fileCol;
      }

      const get = (row, field) => {
        const col = fieldToCol[field];
        return col !== undefined ? String(row[col] ?? "").trim() : "";
      };

      /* ── Validate and build prepared rows ── */
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
          { errors.push({ row: rowNum, field: "full_name", error: "Full name is required" }); continue; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          { errors.push({ row: rowNum, field: "email", error: "Valid email is required" }); continue; }

        /* Resolve institution */
        let institution_id = defaultInstitutionId || null;
        if (inst_name) {
          const resolved = instMap.get(inst_name.toLowerCase());
          if (!resolved)
            { errors.push({ row: rowNum, field: "institution_name", error: `Institution "${inst_name}" not found` }); continue; }
          institution_id = resolved;
        }
        if (!institution_id)
          { errors.push({ row: rowNum, field: "institution_name", error: "Institution is required — map the column or set a default" }); continue; }

        /* Resolve department (optional, silently skip if not found) */
        let department_id = null;
        if (dept_name) {
          department_id = deptMap.get(`${institution_id}::${dept_name.toLowerCase()}`) || null;
        }

        /* Resolve role (optional) */
        const role_lookup = role_str || defaultRoleName || "";
        const role_id     = role_lookup ? (roleMap.get(role_lookup.toLowerCase()) || null) : null;

        /* Account status */
        const VALID_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];
        const account_status = VALID_STATUSES.includes(status_str?.toUpperCase())
          ? status_str.toUpperCase()
          : "ACTIVE";

        prepared.push({
          full_name,
          email:      email.toLowerCase(),
          rawPassword: password || "Welcome@123",
          institution_id,
          department_id,
          role_id,
          account_status,
        });
      }

      /* Hash passwords in parallel before opening DB transaction */
      await Promise.all(
        prepared.map(async (user) => {
          user.password_hash = await bcrypt.hash(user.rawPassword, 10);
        })
      );

      /* Detect existing emails for duplicate handling */
      const allEmails     = prepared.map((p) => p.email);
      const { rows: existing } = await pool.query(
        `SELECT email, id FROM users WHERE email = ANY($1::text[]) AND account_status != 'DELETED'`,
        [allEmails]
      );
      const existingMap = new Map(existing.map((r) => [r.email, r.id]));

      /* ── Bulk insert inside a transaction ── */
      const client = await pool.connect();
      let success  = 0;
      let skipped  = 0;

      try {
        await client.query("BEGIN");

        for (const user of prepared) {
          const existingId = existingMap.get(user.email);

          if (existingId && duplicateHandling === "skip") {
            skipped++;
            continue;
          }

          if (existingId && duplicateHandling === "overwrite") {
            await client.query(
              `UPDATE users
               SET full_name=$1, institution_id=$2, department_id=$3, account_status=$4
               WHERE id=$5`,
              [user.full_name, user.institution_id, user.department_id, user.account_status, existingId]
            );
            if (user.role_id) {
              await client.query(
                `UPDATE user_roles SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
                [existingId]
              );
              await client.query(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [existingId, user.role_id, req.user.userId]
              );
            }
            success++;
            continue;
          }

          /* Insert new user (also handles duplicateHandling === "new") */
          const { rows: ins } = await client.query(
            `INSERT INTO users
               (full_name, email, password_hash, institution_id, department_id,
                account_status, must_change_password, is_temporary_password, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,true,true,$7)
             RETURNING id`,
            [
              user.full_name, user.email, user.password_hash,
              user.institution_id, user.department_id,
              user.account_status, req.user.userId,
            ]
          );
          if (user.role_id) {
            await client.query(
              `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3)`,
              [ins[0].id, user.role_id, req.user.userId]
            );
          }
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
        message:    `Bulk import: ${success} users created/updated, ${skipped} skipped, ${errors.length} failed`,
      });

      return res.json({
        success: true,
        total:   data.length,
        imported: success,
        skipped,
        failed:  errors.length,
        errors,
      });
    } catch (err) {
      logger.error("Import execute failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: `Import failed: ${err.message}` });
    }
  }
);

/* ── GET /api/users/export ── */
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
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
               AND ur.revoked_at IS NULL
               AND (ur.expires_at IS NULL OR ur.expires_at > now())
            ), ''
          )                  AS "Roles",
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

/* ── GET /api/users/export/sample ── */
router.get(
  "/export/sample",
  verifyToken,
  requireRole(["super_admin", "institute_admin"]),
  (req, res) => {
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";

    const sampleData = [
      {
        full_name:        "Arun Kumar",
        email:            "arun@example.com",
        password:         "TempPass@123",
        institution_name: "Example College",
        department_name:  "Computer Science",
        role_name:        "contributor",
        account_status:   "ACTIVE",
      },
      {
        full_name:        "Priya Singh",
        email:            "priya@example.com",
        password:         "TempPass@123",
        institution_name: "Example College",
        department_name:  "Electronics",
        role_name:        "reviewer",
        account_status:   "ACTIVE",
      },
      {
        full_name:        "Vikram Nair",
        email:            "vikram@example.com",
        password:         "TempPass@123",
        institution_name: "Example College",
        department_name:  "",
        role_name:        "department_admin",
        account_status:   "ACTIVE",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users Import Sample");

    if (format === "xlsx") {
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename="users_import_sample.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", 'attachment; filename="users_import_sample.csv"');
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  }
);

module.exports = router;
