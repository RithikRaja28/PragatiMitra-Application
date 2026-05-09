"use strict";

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const logger = require("../utils/logger");

const router = express.Router();
router.use(verifyToken);

/* ── resolve institution_id for non-super-admin users ── */
async function resolveInstitutionId(pool, req) {
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  if (isSuperAdmin) return req.body.institution_id || req.query.institution_id || null;
  const { rows } = await pool.query(
    "SELECT institution_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  return rows[0]?.institution_id || null;
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/languages
   Returns list of supported languages from supported_languages table.
───────────────────────────────────────────────────────────────────── */
router.get("/languages", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT code, name FROM supported_languages ORDER BY name`
    );
    return res.json({ success: true, languages: rows });
  } catch (err) {
    // Table may not exist yet — return a safe fallback
    logger.warn("GET /api/forms/languages — falling back to defaults", { message: err.message });
    return res.json({
      success: true,
      languages: [
        { code: "en", name: "English" },
        { code: "ta", name: "Tamil" },
        { code: "hi", name: "Hindi" },
      ],
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/institution-forms
   Returns table_list rows accessible to the current institution.
   Query param: ?institution_id=<uuid> (super admin only; others use token)
───────────────────────────────────────────────────────────────────── */
router.get("/institution-forms", async (req, res) => {
  const pool = req.app.locals.pool;
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId && !isSuperAdmin) {
      return res.json({ success: true, forms: [] });
    }

    let rows;
    if (isSuperAdmin) {
      ({ rows } = await pool.query(
        `SELECT id, form_name, institute_access, share_table, created_by, created_at, updated_at
         FROM table_list
         ORDER BY form_name`
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT id, form_name, institute_access, share_table, created_by, created_at, updated_at
         FROM table_list
         WHERE $1::uuid = ANY(COALESCE(institute_access, '{}'::uuid[]))
         ORDER BY form_name`,
        [institutionId]
      ));
    }

    return res.json({ success: true, forms: rows, institutionId });
  } catch (err) {
    logger.error("GET /api/forms/institution-forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch institution forms." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/templates
   Shared templates (share_table=true) that this institution hasn't
   accessed yet. Super admin sees all shared templates.
───────────────────────────────────────────────────────────────────── */
router.get("/templates", async (req, res) => {
  const pool = req.app.locals.pool;
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  try {
    if (isSuperAdmin) {
      const { rows } = await pool.query(
        `SELECT id, form_name, institute_access, share_table, created_at
         FROM table_list
         WHERE share_table = true
         ORDER BY form_name`
      );
      return res.json({ success: true, templates: rows });
    }

    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.json({ success: true, templates: [] });

    const { rows } = await pool.query(
      `SELECT id, form_name, institute_access, share_table, created_at
       FROM table_list
       WHERE share_table = true
         AND (institute_access IS NULL OR NOT ($1::text = ANY(COALESCE(institute_access, '{}'::text[]))))
       ORDER BY form_name`,
      [institutionId]
    );
    return res.json({ success: true, templates: rows });
  } catch (err) {
    logger.error("GET /api/forms/templates", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch templates." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/my-forms
   Forms configured for the current institution.
   Super admin sees all table_list entries with schema counts.
───────────────────────────────────────────────────────────────────── */
router.get("/my-forms", async (req, res) => {
  const pool = req.app.locals.pool;
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  try {
    if (isSuperAdmin) {
      const { rows } = await pool.query(
        `SELECT tl.id, tl.form_name, tl.share_table, tl.institute_access, tl.created_at,
                COUNT(cfs.id)::int AS schema_count
         FROM table_list tl
         LEFT JOIN custom_field_schemas cfs ON cfs.form_name = tl.form_name
         GROUP BY tl.id, tl.form_name, tl.share_table, tl.institute_access, tl.created_at
         ORDER BY tl.form_name`
      );
      return res.json({ success: true, forms: rows });
    }

    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.json({ success: true, forms: [], institutionId: null });

    const { rows } = await pool.query(
      `SELECT cfs.id, cfs.form_name, cfs.institution_id, cfs.year,
              cfs.schema_version, cfs.schema, cfs.is_active, cfs.created_at,
              tl.share_table
       FROM custom_field_schemas cfs
       JOIN table_list tl ON tl.form_name = cfs.form_name
       WHERE cfs.institution_id = $1 AND cfs.is_active = true
       ORDER BY cfs.form_name, cfs.year DESC`,
      [institutionId]
    );
    return res.json({ success: true, forms: rows, institutionId });
  } catch (err) {
    logger.error("GET /api/forms/my-forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch forms." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/:formName/table-columns
   Returns physical columns for a given table (information_schema).
   Used in template-adapt mode to show existing fixed columns.
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/table-columns", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;

  // Only allow safe identifiers
  if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
         AND column_name NOT IN ('id','form_name','institution_id','year','schema_id',
                                  'status','order_index','custom_fields',
                                  'created_at','updated_at')
       ORDER BY ordinal_position`,
      [formName]
    );
    return res.json({ success: true, columns: rows });
  } catch (err) {
    logger.error("GET /api/forms/:formName/table-columns", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch table columns." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/:formName/schema
   Returns the active schema for a form + institution.
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/schema", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year } = req.query;

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) {
      return res.status(400).json({ success: false, message: "Institution ID required." });
    }

    const params = [formName, institutionId];
    let yearClause = "";
    if (year) { yearClause = " AND year = $3"; params.push(year); }

    const { rows } = await pool.query(
      `SELECT * FROM custom_field_schemas
       WHERE form_name = $1 AND institution_id = $2 AND is_active = true
       ${yearClause}
       ORDER BY schema_version DESC LIMIT 1`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Schema not found." });
    }
    return res.json({ success: true, schema: rows[0] });
  } catch (err) {
    logger.error("GET /api/forms/:formName/schema", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch schema." });
  }
});

/* ── Map schema field type → PostgreSQL column type ── */
function pgType(fieldType) {
  const map = {
    text: "TEXT", textarea: "TEXT", email: "TEXT",
    phone: "TEXT", document: "TEXT", number: "NUMERIC",
    date: "DATE", boolean: "BOOLEAN",
  };
  return map[fieldType] || "TEXT";
}

/* ── Build CREATE TABLE DDL for a form's physical records table ── */
function buildRecordsTableDDL(tableName, fields) {
  const standard = [
    "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
    "form_name TEXT",
    "institution_id UUID",
    "year INT",
    "schema_id UUID",
    "status TEXT",
    "order_index INT",
    "custom_fields JSONB",
    "language TEXT",
    "created_at TIMESTAMPTZ DEFAULT now()",
    "updated_at TIMESTAMPTZ DEFAULT now()",
  ];
  const fixed = (fields || []).map((f) => {
    const col = f.column_name.toLowerCase().replace(/\s+/g, "_");
    return `${col} ${pgType(f.type)}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${[...standard, ...fixed].join(",\n  ")}\n)`;
}

/* ─────────────────────────────────────────────────────────────────────
   POST /api/forms
   1. Insert into table_list
   2. Insert into custom_field_schemas
   3. Insert into form_lock_config
   4. CREATE TABLE <form_name>_records (standard + fixed columns)
   Body: { form_name, share_table?, schema, year?, institution_id? }
───────────────────────────────────────────────────────────────────── */
router.post(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { form_name, share_table = false, schema, year } = req.body;

    if (!form_name || !String(form_name).trim()) {
      return res.status(400).json({ success: false, message: "form_name is required." });
    }
    if (!schema || typeof schema !== "object") {
      return res.status(400).json({ success: false, message: "schema is required." });
    }

    const normalizedName = String(form_name).trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z][a-z0-9_]*$/.test(normalizedName)) {
      return res.status(400).json({ success: false, message: "form_name must start with a letter and contain only letters, digits, and underscores." });
    }
    const formYear = Number(year) || new Date().getFullYear();
    const recordsTable = `${normalizedName}_records`;

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID is required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Register in table_list
        await client.query(
          `INSERT INTO table_list (form_name, share_table, institute_access, created_by)
           VALUES ($1, $2, ARRAY[$3::uuid], $4)
           ON CONFLICT (form_name) DO NOTHING`,
          [normalizedName, share_table, institutionId, req.user.userId]
        );

        const isSuperAdmin = (req.user.roles || []).includes("super_admin");
        await client.query(
          `UPDATE table_list
           SET institute_access = array_append(COALESCE(institute_access,'{}'), $1::uuid),
               share_table = CASE WHEN $2 THEN $2 ELSE share_table END,
               updated_by = $3, updated_at = now()
           WHERE form_name = $4
             AND NOT ($1::uuid = ANY(COALESCE(institute_access, '{}'::uuid[])))`,
          [institutionId, isSuperAdmin && share_table, req.user.userId, normalizedName]
        );

        // 2. Insert custom_field_schemas
        const { rows: vRows } = await client.query(
          `SELECT COALESCE(MAX(schema_version), 0) AS max_v
           FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND year = $3`,
          [normalizedName, institutionId, formYear]
        );
        const nextVersion = vRows[0].max_v + 1;

        const { rows: sRows } = await client.query(
          `INSERT INTO custom_field_schemas
             (form_name, institution_id, year, schema_version, schema, is_active, created_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, true, $6)
           RETURNING id`,
          [normalizedName, institutionId, formYear, nextVersion, JSON.stringify(schema), req.user.userId]
        );
        const schemaId = sRows[0].id;

        // 3. Insert form_lock_config
        await client.query(
          `INSERT INTO form_lock_config (form_name, institution_id, is_locked)
           VALUES ($1, $2, false)
           ON CONFLICT (form_name, institution_id) DO NOTHING`,
          [normalizedName, institutionId]
        );

        // 4. Create physical records table
        const ddl = buildRecordsTableDDL(recordsTable, schema.fields || []);
        await client.query(ddl);

        await client.query("COMMIT");

        await writeAuditLog(req, {
          actionType: "CREATE_FORM",
          entityType: "form",
          entityId: schemaId,
          newValue: { form_name: normalizedName, records_table: recordsTable, share_table, institution_id: institutionId },
        });

        return res.json({
          success: true,
          message: `Form "${normalizedName}" created. Table "${recordsTable}" is ready.`,
          schema_id: schemaId,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error("POST /api/forms", { stack: err.stack });
      if (err.code === "23505") {
        return res.status(409).json({ success: false, message: "A schema for this form/institution/year already exists at this version." });
      }
      return res.status(500).json({ success: false, message: "Failed to create form." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   POST /api/forms/adopt
   Adopt a shared template for the current institution.
   Creates a new custom_field_schemas entry for this institution.
   Body: { form_name, schema, year?, institution_id? }
───────────────────────────────────────────────────────────────────── */
router.post(
  "/adopt",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { form_name, schema, year } = req.body;

    if (!form_name) return res.status(400).json({ success: false, message: "form_name is required." });
    if (!schema)    return res.status(400).json({ success: false, message: "schema is required." });

    const formYear = Number(year) || new Date().getFullYear();

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Verify the template exists and is shared
        const { rows: tRows } = await client.query(
          "SELECT id FROM table_list WHERE form_name = $1 AND share_table = true",
          [form_name]
        );
        if (!tRows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ success: false, message: "Shared template not found." });
        }

        // Add institution to institute_access if not present
        await client.query(
          `UPDATE table_list
           SET institute_access = array_append(COALESCE(institute_access,'{}'), $1::text),
               updated_by = $2, updated_at = now()
           WHERE form_name = $3
             AND NOT ($1::text = ANY(COALESCE(institute_access, '{}'::text[])))`,
          [institutionId, req.user.userId, form_name]
        );

        // Next schema version
        const { rows: vRows } = await client.query(
          `SELECT COALESCE(MAX(schema_version), 0) AS max_v
           FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND year = $3`,
          [form_name, institutionId, formYear]
        );
        const nextVersion = vRows[0].max_v + 1;

        const { rows: sRows } = await client.query(
          `INSERT INTO custom_field_schemas
             (form_name, institution_id, year, schema_version, schema, is_active, created_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, true, $6)
           RETURNING id`,
          [form_name, institutionId, formYear, nextVersion, JSON.stringify(schema), req.user.userId]
        );

        await client.query("COMMIT");

        return res.json({
          success: true,
          message: `Template "${form_name}" adopted successfully.`,
          schema_id: sRows[0].id,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error("POST /api/forms/adopt", { stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to adopt template." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/forms/:formName/schema
   Save a new schema version (deactivates previous active version).
   Body: { schema, year?, institution_id? }
───────────────────────────────────────────────────────────────────── */
router.put(
  "/:formName/schema",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { formName } = req.params;
    const { schema, year } = req.body;

    if (!schema) return res.status(400).json({ success: false, message: "schema is required." });

    const formYear = Number(year) || new Date().getFullYear();

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Deactivate current active version
        await client.query(
          `UPDATE custom_field_schemas SET is_active = false
           WHERE form_name = $1 AND institution_id = $2 AND year = $3 AND is_active = true`,
          [formName, institutionId, formYear]
        );

        const { rows: vRows } = await client.query(
          `SELECT COALESCE(MAX(schema_version), 0) AS max_v
           FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND year = $3`,
          [formName, institutionId, formYear]
        );
        const nextVersion = vRows[0].max_v + 1;

        const { rows: sRows } = await client.query(
          `INSERT INTO custom_field_schemas
             (form_name, institution_id, year, schema_version, schema, is_active, created_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, true, $6)
           RETURNING id`,
          [formName, institutionId, formYear, nextVersion, JSON.stringify(schema), req.user.userId]
        );

        await client.query("COMMIT");

        return res.json({
          success: true,
          message: "Schema updated successfully.",
          schema_id: sRows[0].id,
          schema_version: nextVersion,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error("PUT /api/forms/:formName/schema", { stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to update schema." });
    }
  }
);

module.exports = router;
