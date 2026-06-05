"use strict";

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const logger = require("../utils/logger");
const { translateSentence, enrichSchemaLabels } = require("../services/translationService");
const { formatAcademicYear, ensureYearRows, setFormStatusForYear, getAcademicYearLockBlockForReq } = require("../services/academicYearService");

/* Academic-year lock guard for form-management writes. Checks the SELECTED year
   (X-Academic-Year header), falling back to the request's year / current year. */
async function ayLockGuard(pool, req, institutionId) {
  const fallback = Number(req.body?.year) || new Date().getFullYear();
  return getAcademicYearLockBlockForReq(pool, req, institutionId, fallback);
}

/* Auto-fill label.hi for any field missing it, using Google Translate.
   Only runs when translate_to_hindi is true. Mutates schema.fields in-place. */
async function autoFillHindiLabels(schema) {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return;
  const tasks = fields.map(async (field) => {
    const en = field.label?.en || field.column_name;
    if (!en || field.label?.hi) return;
    const hi = await translateSentence(en).catch(() => null);
    if (hi && hi !== en) {
      if (!field.label) field.label = {};
      field.label.hi = hi;
    }
  });
  await Promise.all(tasks);
}

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
───────────────────────────────────────────────────────────────────── */
router.get("/languages", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT code, name FROM supported_languages ORDER BY name`
    );
    return res.json({ success: true, languages: rows });
  } catch (err) {
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
      // Super admin has no single institution context — deadlines are per-institution.
      ({ rows } = await pool.query(
        `SELECT id, form_name, institute_access, share_table, created_by, created_at, updated_at,
                COALESCE(translate_to_hindi, true) AS translate_to_hindi,
                NULL::timestamptz AS deadline_at, false AS auto_locked,
                false AS is_locked, NULL AS locked_by, NULL AS locked_at
         FROM table_list
         ORDER BY form_name`
      ));
    } else {
      // Deadline + lock state come from this institution's form_lock_config row.
      ({ rows } = await pool.query(
        `SELECT tl.id, tl.form_name, tl.institute_access, tl.share_table, tl.created_by, tl.created_at, tl.updated_at,
                COALESCE(tl.translate_to_hindi, true) AS translate_to_hindi,
                flc.deadline_at,
                COALESCE(flc.auto_locked, false) AS auto_locked,
                COALESCE(flc.is_locked, false) AS is_locked,
                flc.locked_by,
                flc.locked_at
         FROM table_list tl
         LEFT JOIN form_lock_config flc
           ON flc.form_name = tl.form_name AND flc.institution_id = $1
         WHERE $1::uuid = ANY(COALESCE(tl.institute_access, '{}'::uuid[]))
         ORDER BY tl.form_name`,
        [institutionId]
      ));
    }

    /* ── Academic-year lifecycle status (opt-in via ?year=) ──────────────
       When a start-year is supplied we annotate each form with its lifecycle
       status for that (institution, year). Status source of truth is
       academic_year_form_config; if no config row exists for the year we fall
       back to the form's schema year so pre-existing forms stay visible in the
       year they belong to. Without ?year= the response is unchanged (existing
       callers keep their current behavior). */
    const yearParam = req.query.year != null ? Number(req.query.year) : null;
    if (yearParam && Number.isInteger(yearParam) && institutionId) {
      const academicYear = formatAcademicYear(yearParam);

      const { rows: cfgRows } = await pool.query(
        `SELECT active_forms_json, archived_forms_json, disabled
         FROM academic_year_form_config
         WHERE institution_id = $1 AND academic_year = $2`,
        [institutionId, academicYear]
      );
      const cfg = cfgRows[0] || null;
      const toSet = (j) => new Set(Array.isArray(j) ? j.map(String) : []);
      const activeSet   = toSet(cfg?.active_forms_json);
      const archivedSet = toSet(cfg?.archived_forms_json);
      const disabledSet = toSet(cfg?.disabled);

      // Fallback signal: form has an active schema for this year.
      const { rows: schemaRows } = await pool.query(
        `SELECT DISTINCT form_name FROM custom_field_schemas
         WHERE institution_id = $1 AND year = $2 AND is_active = true`,
        [institutionId, yearParam]
      );
      const schemaYearForms = new Set(schemaRows.map((r) => r.form_name));

      rows = rows.map((f) => {
        const id = String(f.id);
        let lifecycle_status;
        if (cfg) {
          if (disabledSet.has(id)) lifecycle_status = "disabled";
          else if (activeSet.has(id)) lifecycle_status = "active";
          else if (archivedSet.has(id)) lifecycle_status = "archived";
          else lifecycle_status = schemaYearForms.has(f.form_name) ? "active" : "archived";
        } else {
          // No config for this year yet → derive from the schema year.
          lifecycle_status = schemaYearForms.has(f.form_name) ? "active" : "archived";
        }
        return { ...f, lifecycle_status };
      });

      return res.json({ success: true, forms: rows, institutionId, year: yearParam, academicYear });
    }

    return res.json({ success: true, forms: rows, institutionId });
  } catch (err) {
    logger.error("GET /api/forms/institution-forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch institution forms." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/templates
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
───────────────────────────────────────────────────────────────────── */
router.get("/my-forms", async (req, res) => {
  const pool = req.app.locals.pool;
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  try {
    if (isSuperAdmin) {
      const { rows } = await pool.query(
        `SELECT tl.id, tl.form_name, tl.share_table, tl.institute_access, tl.created_at,
                COALESCE(tl.translate_to_hindi, true) AS translate_to_hindi,
                COUNT(cfs.id)::int AS schema_count
         FROM table_list tl
         LEFT JOIN custom_field_schemas cfs ON cfs.form_name = tl.form_name
         GROUP BY tl.id, tl.form_name, tl.share_table, tl.institute_access, tl.created_at, tl.translate_to_hindi
         ORDER BY tl.form_name`
      );
      return res.json({ success: true, forms: rows });
    }

    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.json({ success: true, forms: [], institutionId: null });

    const { rows } = await pool.query(
      `SELECT cfs.id, cfs.form_name, cfs.institution_id, cfs.year,
              cfs.schema, cfs.is_active, cfs.created_at,
              tl.share_table,
              COALESCE(tl.translate_to_hindi, true) AS translate_to_hindi,
              COALESCE(flc.is_locked, false) AS is_locked,
              flc.locked_by,
              flc.locked_at
       FROM custom_field_schemas cfs
       JOIN table_list tl ON tl.form_name = cfs.form_name
       LEFT JOIN form_lock_config flc
         ON flc.form_name = cfs.form_name AND flc.institution_id = cfs.institution_id
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
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/table-columns", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;

  if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
         AND column_name NOT IN ('id','form_name','institution_id','department_id','year',
                                  'schema_id','status','order_index','custom_fields',
                                  'language','created_by','updated_by',
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
       ORDER BY year DESC LIMIT 1`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Schema not found." });
    }

    // Form-level Hindi translation toggle lives on table_list (per form).
    const { rows: tlRows } = await pool.query(
      `SELECT COALESCE(translate_to_hindi, true) AS translate_to_hindi FROM table_list WHERE form_name = $1`,
      [formName]
    );
    const translateToHindi = tlRows[0] ? tlRows[0].translate_to_hindi : true;

    return res.json({ success: true, schema: rows[0], translate_to_hindi: translateToHindi });
  } catch (err) {
    logger.error("GET /api/forms/:formName/schema", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch schema." });
  }
});

/* ── Map schema field type → PostgreSQL column type ── */
function pgType(fieldType) {
  const map = {
    text: "TEXT", textarea: "TEXT", description: "TEXT", email: "TEXT",
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
    "department_id UUID",
    "year INT",
    "schema_id UUID",
    "status TEXT",
    "order_index INT",
    "custom_fields JSONB",
    "language TEXT",
    "source_row_id UUID",
    "created_by UUID",
    "updated_by UUID",
    "created_at TIMESTAMPTZ DEFAULT now()",
    "updated_at TIMESTAMPTZ DEFAULT now()",
  ];
  const fixed = (fields || []).map((f) => {
    const col = f.column_name.toLowerCase().replace(/\s+/g, "_");
    return `${col} ${pgType(f.type)}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${[...standard, ...fixed].join(",\n  ")}\n)`;
}

/* ── Collect all column names from schema fields (including hidden) ── */
function collectColumnNames(fields) {
  return (fields || [])
    .map((f) => f.column_name?.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
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
    const { form_name, share_table = false, schema, year, translate_to_hindi } = req.body;
    // Form-level Hindi translation toggle — defaults to TRUE (preserves behavior).
    const translateToHindi = translate_to_hindi === false ? false : true;

    if (!form_name || !String(form_name).trim()) {
      return res.status(400).json({ success: false, message: "form_name is required." });
    }
    if (!schema || typeof schema !== "object") {
      return res.status(400).json({ success: false, message: "schema is required." });
    }
    // Deadlines are institution-specific and managed after creation via
    // PUT /api/forms/:formName/deadline — never set at creation time.

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

      // Academic-year lock — block form creation when the selected year is locked.
      const ayLock = await ayLockGuard(pool, req, institutionId);
      if (ayLock.locked)
        return res.status(403).json({ success: false, message: ayLock.message });

      // Auto-fill missing Hindi labels before persisting
      if (translateToHindi) await autoFillHindiLabels(schema);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Register in table_list (no deadline here — deadlines are per-institution)
        await client.query(
          `INSERT INTO table_list (form_name, share_table, institute_access, created_by, translate_to_hindi)
           VALUES ($1, $2, ARRAY[$3::uuid], $4, $5)
           ON CONFLICT (form_name) DO NOTHING`,
          [normalizedName, share_table, institutionId, req.user.userId, translateToHindi]
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

        // 2. Insert custom_field_schemas (one per form/institution/year)
        const usedColNames = collectColumnNames(schema.fields);

        const { rows: sRows } = await client.query(
          `INSERT INTO custom_field_schemas
             (form_name, institution_id, year, schema, is_active, created_by, used_column_names)
           VALUES ($1, $2, $3, $4::jsonb, true, $5, $6)
           RETURNING id`,
          [normalizedName, institutionId, formYear, JSON.stringify(schema), req.user.userId, usedColNames]
        );
        const schemaId = sRows[0].id;

        // 3. Insert form_lock_config — for shared forms cover ALL institutions; otherwise just this one.
        //    Deadlines start NULL; each institution sets its own later.
        if (share_table) {
          await client.query(
            `INSERT INTO form_lock_config (form_name, institution_id, is_locked, deadline_at, auto_locked)
             SELECT $1, institution_id, false, NULL, false FROM institutions
             ON CONFLICT (form_name, institution_id) DO NOTHING`,
            [normalizedName]
          );
        } else {
          await client.query(
            `INSERT INTO form_lock_config (form_name, institution_id, is_locked, deadline_at, auto_locked)
             VALUES ($1, $2, false, NULL, false)
             ON CONFLICT (form_name, institution_id) DO NOTHING`,
            [normalizedName, institutionId]
          );
        }

        // 4. Create physical records table.
        //    IF NOT EXISTS makes this safe to retry, but it also means
        //    a pre-existing table won't have the new custom columns added.
        //    The ALTER TABLE loop below closes that gap.
        const ddl = buildRecordsTableDDL(recordsTable, schema.fields || []);
        await client.query(ddl);

        for (const field of (schema.fields || [])) {
          const colName = field.column_name.trim().toLowerCase().replace(/\s+/g, "_");
          if (/^[a-z][a-z0-9_]*$/.test(colName)) {
            await client.query(
              `ALTER TABLE ${recordsTable} ADD COLUMN IF NOT EXISTS ${colName} ${pgType(field.type)}`
            );
          }
        }

        // 5. Academic-year lifecycle: a newly created form is ACTIVE for its
        //    creation year only (all other years default to archived). Status is
        //    tracked in academic_year_form_config. For shared forms we mirror the
        //    "active" classification to every linked institution for that year.
        const { rows: tlRows } = await client.query(
          `SELECT id, COALESCE(institute_access, '{}'::uuid[]) AS institute_access
           FROM table_list WHERE form_name = $1`,
          [normalizedName]
        );
        const formId = tlRows[0]?.id;
        if (formId) {
          const academicYear = formatAcademicYear(formYear);
          const targets = share_table
            ? [...new Set([String(institutionId), ...(tlRows[0].institute_access || []).map(String)])]
            : [String(institutionId)];
          for (const inst of targets) {
            await ensureYearRows(client, { institutionId: inst, academicYear, startYear: formYear, createdBy: req.user.userId });
            await setFormStatusForYear(client, { institutionId: inst, academicYear, formId, status: "active" });
          }
        }

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
        return res.status(409).json({ success: false, message: "A schema for this form/institution/year already exists." });
      }
      return res.status(500).json({ success: false, message: "Failed to create form." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   POST /api/forms/adopt
   Adopt a shared template for the current institution.
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

      // Academic-year lock — block adopting templates when the year is locked.
      const ayLock = await ayLockGuard(pool, req, institutionId);
      if (ayLock.locked)
        return res.status(403).json({ success: false, message: ayLock.message });

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

        const usedColNames = collectColumnNames(schema.fields);

        const { rows: sRows } = await client.query(
          `INSERT INTO custom_field_schemas
             (form_name, institution_id, year, schema, is_active, created_by, used_column_names)
           VALUES ($1, $2, $3, $4::jsonb, true, $5, $6)
           RETURNING id`,
          [form_name, institutionId, formYear, JSON.stringify(schema), req.user.userId, usedColNames]
        );

        // Ensure a lock config row exists for this institution (default unlocked,
        // no deadline — each institution sets its own afterwards).
        await client.query(
          `INSERT INTO form_lock_config (form_name, institution_id, is_locked, deadline_at, auto_locked)
           VALUES ($1, $2, false, NULL, false)
           ON CONFLICT (form_name, institution_id) DO NOTHING`,
          [form_name, institutionId]
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
      if (err.code === "23505") {
        return res.status(409).json({ success: false, message: "A schema for this form/institution/year already exists." });
      }
      return res.status(500).json({ success: false, message: "Failed to adopt template." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/forms/:formName/schema
   Update the schema in-place (single row per form/institution/year).
   Validates that no previously-used column name is re-introduced.
   Also runs ALTER TABLE … ADD COLUMN for any genuinely new fields.
   Body: { schema, year?, institution_id? }
───────────────────────────────────────────────────────────────────── */
router.put(
  "/:formName/schema",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { formName } = req.params;
    const { schema, year, translate_to_hindi } = req.body;

    if (!schema) return res.status(400).json({ success: false, message: "schema is required." });

    if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
      return res.status(400).json({ success: false, message: "Invalid form name." });
    }

    const formYear = Number(year) || new Date().getFullYear();
    const recordsTable = `${formName}_records`;

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      // Academic-year lock — block schema edits when the selected year is locked.
      const ayLock = await ayLockGuard(pool, req, institutionId);
      if (ayLock.locked)
        return res.status(403).json({ success: false, message: ayLock.message });

      // Auto-fill missing Hindi labels before persisting.
      // translate_to_hindi may be toggled in this same request; default to true if not specified.
      const effectiveTranslate = typeof translate_to_hindi === "boolean" ? translate_to_hindi : true;
      if (effectiveTranslate) await autoFillHindiLabels(schema);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Load current schema row
        const { rows: existing } = await client.query(
          `SELECT id, schema, used_column_names FROM custom_field_schemas
           WHERE form_name = $1 AND institution_id = $2 AND year = $3`,
          [formName, institutionId, formYear]
        );

        if (!existing.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ success: false, message: "Schema not found for this form/institution/year." });
        }

        const currentRow = existing[0];
        const usedColumnNames = new Set(currentRow.used_column_names || []);
        const currentFieldNames = new Set(
          (currentRow.schema?.fields || []).map((f) => f.column_name)
        );

        // Validate: active (non-excluded) incoming fields must not reuse a previously-deleted column name
        const incomingFields = schema.fields || [];
        const excludedFixedCols = new Set(schema.excluded_fixed_columns || []);

        const reused = incomingFields
          .filter((f) => !excludedFixedCols.has(f.column_name))
          .map((f) => f.column_name?.trim().toLowerCase().replace(/\s+/g, "_"))
          .filter((col) => col && usedColumnNames.has(col) && !currentFieldNames.has(col));

        if (reused.length > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `Column name(s) were previously used and cannot be reused: ${reused.join(", ")}. Choose a different name to avoid exposing old data.`,
          });
        }

        // Merge new column names into used_column_names
        const newColNames = collectColumnNames(incomingFields);
        const mergedUsed = Array.from(new Set([...usedColumnNames, ...newColNames]));

        // Update schema in-place
        const { rows: sRows } = await client.query(
          `UPDATE custom_field_schemas
           SET schema = $1::jsonb,
               used_column_names = $2,
               updated_by = $3
           WHERE form_name = $4 AND institution_id = $5 AND year = $6
           RETURNING id`,
          [JSON.stringify(schema), mergedUsed, req.user.userId, formName, institutionId, formYear]
        );

        // Update the form-level Hindi translation toggle (table_list) when provided.
        if (typeof translate_to_hindi === "boolean") {
          await client.query(
            `UPDATE table_list SET translate_to_hindi = $1, updated_by = $2, updated_at = now()
             WHERE form_name = $3`,
            [translate_to_hindi, req.user.userId, formName]
          );
        }

        // ADD COLUMN only for fields that are active (not excluded) and genuinely new
        const visibleNewFields = incomingFields.filter(
          (f) => !excludedFixedCols.has(f.column_name) && !currentFieldNames.has(f.column_name)
        );
        for (const field of visibleNewFields) {
          const colName = field.column_name.trim().toLowerCase().replace(/\s+/g, "_");
          if (/^[a-z][a-z0-9_]*$/.test(colName)) {
            await client.query(
              `ALTER TABLE ${recordsTable} ADD COLUMN IF NOT EXISTS ${colName} ${pgType(field.type)}`
            );
          }
        }

        await client.query("COMMIT");

        return res.json({
          success: true,
          message: "Schema updated successfully.",
          schema_id: sRows[0].id,
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

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/:formName/institution-records
   Institution-admin view: all department records for one form,
   grouped by department_name. Strictly view-only.
   Query: ?language=en|hi (default 'en')
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/institution-records", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;
  const { year, language = "en" } = req.query;

  if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) {
      return res.status(400).json({ success: false, message: "Institution ID required." });
    }

    const schemaParams = [formName, institutionId];
    let schemaYearClause = "";
    if (year) { schemaYearClause = " AND year = $3"; schemaParams.push(year); }
    const { rows: schemaRows } = await pool.query(
      `SELECT * FROM custom_field_schemas
       WHERE form_name = $1 AND institution_id = $2 AND is_active = true
       ${schemaYearClause}
       ORDER BY year DESC LIMIT 1`,
      schemaParams
    );
    if (!schemaRows.length) {
      return res.status(404).json({ success: false, message: "No active schema found for this form." });
    }
    const schema = schemaRows[0];

    const { rows: existsRows } = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [`${formName}_records`]
    );
    if (!existsRows.length) {
      return res.json({ success: true, schema, departments: [], grouped: {} });
    }

    const { rows: records } = await pool.query(
      `SELECT r.*,
              COALESCE(d_rec.name, d_user.name) AS resolved_department_name
       FROM ${formName}_records r
       LEFT JOIN departments d_rec  ON d_rec.department_id  = r.department_id
       LEFT JOIN users u            ON u.id                  = r.created_by
       LEFT JOIN departments d_user ON d_user.department_id  = u.department_id
       WHERE r.institution_id = $1
         AND (r.language = $2 OR ($2 = 'en' AND r.language IS NULL))
       ORDER BY r.created_at DESC`,
      [institutionId, language]
    );

    const grouped = {};
    const counts = new Map();
    for (const rec of records) {
      const deptName = rec.resolved_department_name || "Unassigned";
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(rec);
      counts.set(deptName, (counts.get(deptName) || 0) + 1);
    }

    const departments = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const { rows: lockRows } = await pool.query(
      `SELECT is_locked, locked_by, locked_at, deadline_at, COALESCE(auto_locked, false) AS auto_locked
       FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, institutionId]
    );
    const lock = lockRows[0] || { is_locked: false, locked_by: null, locked_at: null, deadline_at: null, auto_locked: false };

    /* Enrich schema labels for non-English responses — same logic applied in
       GET /api/form-data/:formName/records so both views stay consistent. */
    const displaySchema = language !== "en"
      ? await enrichSchemaLabels(schema, language)
      : schema;

    return res.json({ success: true, schema: displaySchema, departments, grouped, lock });
  } catch (err) {
    logger.error(`GET /api/forms/${formName}/institution-records`, { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch institution records." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/:formName/lock-status
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/lock-status", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;

  if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) {
      return res.status(400).json({ success: false, message: "Institution ID required." });
    }

    const { rows } = await pool.query(
      `SELECT is_locked, locked_by, locked_at
       FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, institutionId]
    );

    const lock = rows[0] || { is_locked: false, locked_by: null, locked_at: null };
    return res.json({ success: true, ...lock });
  } catch (err) {
    logger.error("GET /api/forms/:formName/lock-status", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch lock status." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/forms/:formName/deadline
───────────────────────────────────────────────────────────────────── */
router.get("/:formName/deadline", async (req, res) => {
  const pool = req.app.locals.pool;
  const { formName } = req.params;

  if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
    return res.status(400).json({ success: false, message: "Invalid form name." });
  }

  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) {
      return res.status(400).json({ success: false, message: "Institution ID required." });
    }

    const { rows } = await pool.query(
      `SELECT deadline_at, COALESCE(auto_locked, false) AS auto_locked,
              COALESCE(is_locked, false) AS is_locked, locked_at
       FROM form_lock_config
       WHERE form_name = $1 AND institution_id = $2`,
      [formName, institutionId]
    );

    const row = rows[0] || { deadline_at: null, auto_locked: false, is_locked: false, locked_at: null };
    return res.json({ success: true, ...row });
  } catch (err) {
    logger.error("GET /api/forms/:formName/deadline", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch deadline." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/forms/:formName/deadline
   Add / update / remove the deadline for ONLY the resolved institution's row.
   Body: { deadline_at }  — ISO string to set; null/"" to remove.
───────────────────────────────────────────────────────────────────── */
router.put(
  "/:formName/deadline",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { formName } = req.params;
    const { deadline_at } = req.body;

    if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
      return res.status(400).json({ success: false, message: "Invalid form name." });
    }

    let newDeadline = null;
    if (deadline_at != null && String(deadline_at).trim() !== "") {
      const d = new Date(deadline_at);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid deadline date." });
      }
      newDeadline = d.toISOString();
    }

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      // Academic-year lock — block deadline changes when the year is locked.
      const ayLock = await ayLockGuard(pool, req, institutionId);
      if (ayLock.locked)
        return res.status(403).json({ success: false, message: ayLock.message });

      const { rows } = await pool.query(
        `INSERT INTO form_lock_config (form_name, institution_id, is_locked, deadline_at, auto_locked)
         VALUES ($1, $2, false, $3, false)
         ON CONFLICT (form_name, institution_id) DO UPDATE SET
           deadline_at = $3,
           is_locked   = CASE
                            WHEN form_lock_config.auto_locked
                             AND ($3 IS NULL OR $3 > NOW())
                            THEN false ELSE form_lock_config.is_locked END,
           locked_at   = CASE
                            WHEN form_lock_config.auto_locked
                             AND ($3 IS NULL OR $3 > NOW())
                            THEN NULL ELSE form_lock_config.locked_at END,
           auto_locked = CASE
                            WHEN $3 IS NULL OR $3 > NOW()
                            THEN false ELSE form_lock_config.auto_locked END,
           updated_at  = now()
         RETURNING deadline_at, is_locked, auto_locked, locked_at`,
        [formName, institutionId, newDeadline]
      );

      await writeAuditLog(req, {
        actionType: newDeadline ? "SET_FORM_DEADLINE" : "REMOVE_FORM_DEADLINE",
        entityType: "form_lock",
        entityId: null,
        newValue: { form_name: formName, institution_id: institutionId, deadline_at: newDeadline },
      });

      return res.json({
        success: true,
        message: newDeadline ? "Deadline saved." : "Deadline removed.",
        ...rows[0],
      });
    } catch (err) {
      logger.error("PUT /api/forms/:formName/deadline", { stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to update deadline." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   POST /api/forms/:formName/lock
───────────────────────────────────────────────────────────────────── */
router.post(
  "/:formName/lock",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { formName } = req.params;

    if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
      return res.status(400).json({ success: false, message: "Invalid form name." });
    }

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      const { rows } = await pool.query(
        `INSERT INTO form_lock_config (form_name, institution_id, is_locked, locked_by, locked_at)
         VALUES ($1, $2, true, $3, now())
         ON CONFLICT (form_name, institution_id) DO UPDATE
           SET is_locked = true, locked_by = $3, locked_at = now(), updated_at = now()
         RETURNING *`,
        [formName, institutionId, req.user.userId]
      );

      await writeAuditLog(req, {
        actionType: "LOCK_FORM",
        entityType: "form_lock",
        entityId: rows[0].id,
        newValue: { form_name: formName, institution_id: institutionId, is_locked: true },
      });

      return res.json({ success: true, message: `Form "${formName}" locked.`, lock: rows[0] });
    } catch (err) {
      logger.error("POST /api/forms/:formName/lock", { stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to lock form." });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────
   POST /api/forms/:formName/unlock
───────────────────────────────────────────────────────────────────── */
router.post(
  "/:formName/unlock",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const { formName } = req.params;

    if (!/^[a-z][a-z0-9_]*$/.test(formName)) {
      return res.status(400).json({ success: false, message: "Invalid form name." });
    }

    try {
      const institutionId = await resolveInstitutionId(pool, req);
      if (!institutionId) {
        return res.status(400).json({ success: false, message: "Institution ID required." });
      }

      const { rows } = await pool.query(
        `INSERT INTO form_lock_config (form_name, institution_id, is_locked)
         VALUES ($1, $2, false)
         ON CONFLICT (form_name, institution_id) DO UPDATE
           SET is_locked = false, locked_by = null, locked_at = null, updated_at = now()
         RETURNING *`,
        [formName, institutionId]
      );

      await writeAuditLog(req, {
        actionType: "UNLOCK_FORM",
        entityType: "form_lock",
        entityId: rows[0].id,
        newValue: { form_name: formName, institution_id: institutionId, is_locked: false },
      });

      return res.json({ success: true, message: `Form "${formName}" unlocked.`, lock: rows[0] });
    } catch (err) {
      logger.error("POST /api/forms/:formName/unlock", { stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to unlock form." });
    }
  }
);

module.exports = router;
