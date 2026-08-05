"use strict";

/**
 * routes/departmentForms.js  →  mounted at /api/department-forms
 * ─────────────────────────────────────────────────────────────────────────
 * Department-scoped form management. Mirrors routes/forms.js but is fully
 * isolated to the requesting user's department, with an independent academic
 * year lifecycle. Reads/writes ONLY the department_* tables + dept_form_<slug>
 * physical tables — it never touches table_list / custom_field_schemas /
 * form_lock_config, so the institution side is completely unaffected.
 */

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");
const logger = require("../utils/logger");
const {
  resolveDeptContext, ensureDeptYearRow, pgType, slugify,
  deptRecordsTable, collectColumnNames, buildDeptRecordsTableDDL, quoteIdent,
} = require("../services/departmentFormService");
const { resolveOperatingYear } = require("../services/academicYearService");
const { assertEquivalent } = require("../services/equivalenceGuard");
const { enqueueEmail }    = require("../services/mailService");
const { getDepartmentState, DEPARTMENT_INACTIVE_MESSAGE } = require("../services/departmentContext");
const { assertDomainOwnerAccess, resolveUserDomain } = require("../services/domainService");
const { ensureRecordsIndexes } = require("../services/recordsIndexService");
const { translateSentence } = require("../services/translationService");
const { getAssignedFormIds, isPgStudentOnly } = require("./formAssignments");

const router = express.Router();
router.use(verifyToken);

/* Bug 11 — department lifecycle gate for WRITE routes. An inactive department is
   view-only: form create / schema edit / role / deadline / lock / archive / carry-
   forward are all blocked while existing data + GET listings stay available.
   Restore re-enables everything (no children were mutated). */
async function requireActiveDepartment(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const { departmentId } = await resolveDeptContext(pool, req);
    const { active } = await getDepartmentState(pool, departmentId);
    if (!active) return res.status(403).json({ success: false, message: DEPARTMENT_INACTIVE_MESSAGE });
    return next();
  } catch (err) {
    logger.error("requireActiveDepartment failed", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to resolve department state." });
  }
}

/* OWNERSHIP: the INSTITUTION owns the academic year; a department only INHERITS
   it. Departments never create / delete / lock academic years here (no route in
   this module writes academic_year_master) — they only override per-form Active/
   Archive/Roles/Deadline/Visibility. This middleware makes the inheritance
   explicit: when a request carries NO explicit year, it resolves the
   institution's active year so the fallback inherits it instead of guessing the
   calendar year. It does the lookup ONLY on the no-year path, so normal flows
   (which always send ?year) pay nothing. */
// A year counts as explicit only when positive (body.year may be null → 0).
const validYear = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
function hasExplicitYear(req) {
  return validYear(req.query.year) || validYear(req.get("X-Academic-Year")) || validYear(req.body?.year);
}
router.use(async (req, _res, next) => {
  try {
    if (!hasExplicitYear(req)) {
      const pool = req.app.locals.pool;
      const { institutionId } = await resolveDeptContext(pool, req);
      // M-2 — active → latest real academic year (no calendar drift when year-aware).
      req.institutionAcademicYear = await resolveOperatingYear(pool, institutionId);
    }
  } catch {
    /* leave req.institutionAcademicYear undefined → calendar-year fallback */
  }
  next();
});

// Form CONFIGURATION (create/edit schema, deadline, lock, archive, carry-forward)
// is done by Department Admins and Department Nodal Officers. Contributors never
// configure forms — they only enter data (see routes/departmentFormData.js).
const WRITE_ROLES = ["department_admin", "nodal_officer"];

/* Department forms are ALWAYS restricted to this fixed set of roles. The per-form
   "Roles with access" picker was removed — every form is accessible only to
   Contributors, Department Nodal Officers, and Department Admins. */
const FIXED_FORM_ROLES = ["department_admin", "nodal_officer", "contributor", "pg_student"];

/* Selected academic-year (start year int): ?year → X-Academic-Year header →
   body.year → institution's active year (inherited) → current calendar year.
   Mirrors how the institution side reads the top-bar year. */
function resolveYear(req) {
  if (validYear(req.query.year)) return Number(req.query.year);
  if (validYear(req.get("X-Academic-Year"))) return Number(req.get("X-Academic-Year"));
  if (validYear(req.body?.year)) return Number(req.body?.year);
  // Bug 16 — inherit the institution's ACTIVE academic year (computed by the
  // middleware above) before falling back to the calendar year as a LAST resort.
  if (Number.isInteger(req.institutionAcademicYear)) return req.institutionAcademicYear;
  return new Date().getFullYear();
}

/* Auto-fill label.hi using Google Translate (only when translation enabled). */
async function autoFillHindiLabels(schema) {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return;
  await Promise.all(fields.map(async (field) => {
    const en = field.label?.en || field.column_name;
    if (!en || field.label?.hi) return;
    const hi = await translateSentence(en).catch(() => null);
    if (hi && hi !== en) {
      if (!field.label) field.label = {};
      field.label.hi = hi;
    }
  }));
}

/* Load a department form by id, scoped to the caller's EFFECTIVE department, then
   role-gated for non-managers. A department form is private to its department; a
   contributor may only reach one that has no role restriction OR lists one of their
   roles — identical to the records gate (departmentFormData.loadForm) and the
   /assigned list, so schema/metadata access can't bypass the same boundary by
   direct URL. Managers (department_admin / super_admin) always pass. */
async function loadOwnedForm(pool, req, id) {
  const { departmentId } = await resolveDeptContext(pool, req);
  if (!departmentId) return { error: "No department is associated with your account." };
  const { rows } = await pool.query(
    "SELECT * FROM department_table_list WHERE id = $1 AND department_id = $2",
    [id, departmentId]
  );
  if (!rows.length) return { error: "Form not found in your department." };

  // L-3 — domain isolation (form's domain = creator's domain; no domain column).
  const dom = await assertDomainOwnerAccess(pool, req, rows[0].created_by);
  if (!dom.allowed) return { error: dom.message };

  const userRoles = req.user.roles || [];
  const isManager = userRoles.includes("department_admin") || userRoles.includes("super_admin");
  if (!isManager) {
    const { rows: rr } = await pool.query(
      "SELECT role_name FROM department_form_roles WHERE department_form_id = $1",
      [id]
    );
    const allowed = rr.map((r) => r.role_name);
    if (allowed.length > 0 && !userRoles.some((r) => allowed.includes(r)))
      return { error: "You don't have access to this form." };
  }
  return { form: rows[0], departmentId };
}

/* Returns true when the department form is archived for the given academic year.
   Used to block deadline, lock, unlock, and schema edits on archived forms. */
async function isDeptFormArchivedForYear(pool, formId, year) {
  const { rows } = await pool.query(
    `SELECT is_archived FROM department_form_year_mapping
     WHERE department_form_id = $1 AND academic_year = $2`,
    [formId, year]
  );
  return rows.length > 0 && !!rows[0].is_archived;
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-forms?year=YYYY
   List the department's forms for the selected academic year, annotated
   with lifecycle status, lock state and deadline.
───────────────────────────────────────────────────────────────────── */
router.get("/", requireRole(WRITE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { departmentId, institutionId } = await resolveDeptContext(pool, req);
    if (!departmentId) return res.json({ success: true, forms: [], departmentId: null });

    const year = resolveYear(req);

    const { rows } = await pool.query(
      `SELECT dtl.id, dtl.form_name, dtl.form_description, dtl.academic_year,
              dtl.visibility, dtl.translate_enabled, dtl.created_at, dtl.updated_at,
              ym.status      AS year_status,
              COALESCE(ym.is_active,   (dtl.academic_year = $2)) AS year_active,
              COALESCE(ym.is_archived, false) AS year_archived,
              COALESCE(ym.is_locked,   false) AS year_locked,
              dc.deadline_at                  AS deadline,
              COALESCE(dc.is_locked, false)   AS deadline_locked,
              COALESCE(dc.auto_locked, false) AS auto_locked,
              dc.locked_at,
              (dc.deadline_at IS NOT NULL AND dc.deadline_at <= now()) AS deadline_expired,
              ARRAY(SELECT role_name FROM department_form_roles r WHERE r.department_form_id = dtl.id ORDER BY role_name) AS roles
         FROM department_table_list dtl
         LEFT JOIN department_form_year_mapping ym
           ON ym.department_form_id = dtl.id AND ym.academic_year = $2
         LEFT JOIN department_form_deadline_config dc
           ON dc.department_form_id = dtl.id AND dc.academic_year = $2
        WHERE dtl.department_id = $1
        ORDER BY dtl.form_name`,
      [departmentId, year]
    );

    const forms = rows.map((f) => {
      // A form's per-year status comes from its year-mapping row. When NO mapping
      // exists for the selected year, the form is active only in its creation
      // year (so the academic-year cycle works: a 2026 form shows Archived in
      // 2027 until it is carried forward / activated).
      const hasMapping = f.year_status != null;
      const isArchived = hasMapping ? !!f.year_archived : (f.academic_year !== year);
      const isLocked = !!((hasMapping && f.year_locked) || f.deadline_locked || f.deadline_expired);
      const lifecycle_status = isArchived ? "archived" : "active";
      return {
        id: f.id,
        form_name: f.form_name,
        form_description: f.form_description,
        academic_year: f.academic_year,
        visibility: f.visibility,
        translate_enabled: f.translate_enabled,
        is_locked: isLocked,
        is_archived: isArchived,
        deadline_at: f.deadline,
        auto_locked: !!f.auto_locked,
        deadline_expired: !!f.deadline_expired,
        lifecycle_status,
        roles: f.roles || [],
        created_at: f.created_at,
        updated_at: f.updated_at,
      };
    });

    return res.json({ success: true, forms, departmentId, institutionId, year });
  } catch (err) {
    logger.error("GET /api/department-forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch department forms." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   Academic-year cycle (department-scoped, independent of institution).
   GET /api/department-forms/year-preview?year=YYYY
     Lists the department's forms with their status in the previous year, so
     the UI can pre-select which forms carry forward into the target year.
───────────────────────────────────────────────────────────────────── */
router.get("/year-preview", requireRole(WRITE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { departmentId } = await resolveDeptContext(pool, req);
    if (!departmentId) return res.json({ success: true, forms: [], year: resolveYear(req) });
    const year = resolveYear(req);
    const prevYear = year - 1;

    const { rows } = await pool.query(
      `SELECT dtl.id, dtl.form_name, dtl.academic_year,
              cur.status      AS cur_status,  COALESCE(cur.is_archived, false) AS cur_archived,
              prev.status     AS prev_status, COALESCE(prev.is_active, false)  AS prev_active, prev.is_archived AS prev_archived
         FROM department_table_list dtl
         LEFT JOIN department_form_year_mapping cur  ON cur.department_form_id  = dtl.id AND cur.academic_year  = $2
         LEFT JOIN department_form_year_mapping prev ON prev.department_form_id = dtl.id AND prev.academic_year = $3
        WHERE dtl.department_id = $1
        ORDER BY dtl.form_name`,
      [departmentId, year, prevYear]
    );

    const forms = rows.map((f) => {
      const prevHas = f.prev_status != null;
      const prevActive = prevHas ? (f.prev_archived !== true) : (f.academic_year === prevYear);
      const curHas = f.cur_status != null;
      const curActive = curHas ? (f.cur_archived !== true) : (f.academic_year === year);
      return { id: f.id, form_name: f.form_name, academic_year: f.academic_year, prev_active: prevActive, current_active: curActive };
    });
    return res.json({ success: true, forms, year, previousYear: prevYear });
  } catch (err) {
    logger.error("GET /api/department-forms/year-preview", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to build year preview." });
  }
});

/* POST /api/department-forms/carry-forward   { year, activeFormIds: string[] }
   Bulk-sets the department's per-year lifecycle for `year`: the listed forms
   become Active, all others become Archived. One step instead of toggling each
   form. Independent of the institution academic year. */
router.post("/carry-forward", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const year = Number(req.body?.year) || resolveYear(req);
  const activeSet = new Set((Array.isArray(req.body?.activeFormIds) ? req.body.activeFormIds : []).map(String));
  try {
    const { departmentId } = await resolveDeptContext(pool, req);
    if (!departmentId) return res.status(400).json({ success: false, message: "No department is associated with your account." });

    const { rows: formRows } = await pool.query(
      "SELECT id FROM department_table_list WHERE department_id = $1",
      [departmentId]
    );

    const client = await pool.connect();
    let activated = 0;
    try {
      await client.query("BEGIN");
      for (const { id } of formRows) {
        const active = activeSet.has(String(id));
        if (active) activated += 1;
        await client.query(
          `INSERT INTO department_form_year_mapping
             (department_form_id, academic_year, status, is_active, is_archived, is_locked)
           VALUES ($1, $2, $3, $4, $5, false)
           ON CONFLICT (department_form_id, academic_year) DO UPDATE
             SET status = $3, is_active = $4, is_archived = $5`,
          [id, year, active ? "active" : "archived", active, !active]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_YEAR_CARRY_FORWARD",
      entityType: "department_form_year",
      entityId: null,
      newValue: { academic_year: year, activated, total: formRows.length },
    }).catch(() => {});

    return res.json({ success: true, message: `Set up ${year}–${year + 1}: ${activated} active, ${formRows.length - activated} archived.`, activated, total: formRows.length });
  } catch (err) {
    logger.error("POST /api/department-forms/carry-forward", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to set up the academic year." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-forms/assigned?year=
   Forms the CURRENT user may fill: same department, ACTIVE for the year, and
   (the form has no role restriction OR one of the user's roles is allowed).
   Used by the non-admin "fill" surface. Any authenticated dept member can call.
───────────────────────────────────────────────────────────────────── */
router.get("/assigned", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { departmentId, institutionId } = await resolveDeptContext(pool, req);
    if (!departmentId) return res.json({ success: true, forms: [], year: resolveYear(req) });
    const year = resolveYear(req);
    const userRoles = req.user.roles || [];
    const isManager = userRoles.includes("department_admin") || userRoles.includes("super_admin");

    // L-3 — viewer's business domain (null = cross-domain super/institute admin).
    // Fail-closed: an unresolvable scoped-user domain yields an empty list.
    let viewerDomain;
    try { viewerDomain = await resolveUserDomain(pool, req); }
    catch { return res.json({ success: true, forms: [], year }); }

    // Access hierarchy: SAME institution AND SAME department (then domain- + role-filtered below).
    const { rows } = await pool.query(
      `SELECT dtl.id, dtl.form_name, dtl.form_description, dtl.academic_year, dtl.translate_enabled,
              COALESCE(cu.role_domain, 'academic') AS creator_domain,
              ym.status AS year_status, COALESCE(ym.is_archived, false) AS year_archived, COALESCE(ym.is_locked, false) AS year_locked,
              dc.deadline_at AS deadline, COALESCE(dc.is_locked, false) AS deadline_locked, COALESCE(dc.auto_locked, false) AS auto_locked,
              (dc.deadline_at IS NOT NULL AND dc.deadline_at <= now()) AS deadline_expired,
              ARRAY(SELECT role_name FROM department_form_roles r WHERE r.department_form_id = dtl.id) AS roles
         FROM department_table_list dtl
         LEFT JOIN users cu ON cu.id = dtl.created_by
         LEFT JOIN department_form_year_mapping ym ON ym.department_form_id = dtl.id AND ym.academic_year = $2
         LEFT JOIN department_form_deadline_config dc ON dc.department_form_id = dtl.id AND dc.academic_year = $2
        WHERE dtl.department_id = $1 AND (dtl.institution_id = $3 OR dtl.institution_id IS NULL)
        ORDER BY dtl.form_name`,
      [departmentId, year, institutionId]
    );

    // PG students: build their assignment set FIRST so we can bypass department_form_roles.
    // An explicit form_assignment entry (from dept admin assigning the student) grants access
    // regardless of what's in department_form_roles — the two systems are orthogonal.
    let pgAssignedIds = null;
    if (isPgStudentOnly(req)) {
      pgAssignedIds = new Set(await getAssignedFormIds(pool, req.user.userId, year));
    }

    let forms = rows.filter((f) => {
      // L-3 — domain isolation: a scoped user only sees forms whose creator shares
      // their domain (Academic/Hospital/Finance kept independent). Admins see all.
      if (viewerDomain != null && (f.creator_domain || "academic") !== viewerDomain) return false;
      const hasMapping = f.year_status != null;
      const isArchived = hasMapping ? f.year_archived === true : (f.academic_year !== year);
      if (isArchived) return false;                 // non-admins see only active forms
      // PG students: explicit assignment overrides any role restriction on the form.
      if (pgAssignedIds !== null) return pgAssignedIds.has(String(f.id));
      const allowed = f.roles || [];
      if (isManager || allowed.length === 0) return true;
      return userRoles.some((r) => allowed.includes(r));
    }).map((f) => ({
      id: f.id,
      form_name: f.form_name,
      form_description: f.form_description,
      translate_enabled: f.translate_enabled,
      is_locked: !!(f.year_locked || f.deadline_locked || f.deadline_expired),
      deadline_at: f.deadline,
      deadline_expired: !!f.deadline_expired,
    }));

    return res.json({ success: true, forms, year });
  } catch (err) {
    logger.error("GET /api/department-forms/assigned", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch assigned forms." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-forms/:id/schema?year=YYYY
   Creation year → base schema (physical columns).
   Subsequent years → base fields merged with year-specific extra fields.
───────────────────────────────────────────────────────────────────── */
router.get("/:id/schema", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { form, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });

    const year = resolveYear(req);
    const creationYear = form.academic_year;
    const isCreationYear = year === creationYear;

    let schema = form.schema;
    if (!isCreationYear) {
      const { rows: schemaRows } = await pool.query(
        `SELECT academic_year, schema, is_base FROM department_form_schemas
         WHERE department_form_id = $1 AND (is_base = true OR academic_year = $2)`,
        [form.id, year]
      );
      const baseRow = schemaRows.find((r) => r.is_base);
      const yearRow = schemaRows.find((r) => r.academic_year === year && !r.is_base);
      const baseSchema = baseRow?.schema || form.schema || { fields: [] };
      const baseFields = baseSchema?.fields || [];
      const baseColSet = new Set(baseFields.map((f) => f.column_name));
      const extraFields = (yearRow?.schema?.fields || []).filter((f) => !baseColSet.has(f.column_name));
      schema = { ...baseSchema, fields: [...baseFields, ...extraFields] };
    }

    return res.json({
      success: true,
      schema,
      form_name: form.form_name,
      academic_year: form.academic_year,
      translate_enabled: form.translate_enabled,
      is_creation_year: isCreationYear,
    });
  } catch (err) {
    logger.error("GET /api/department-forms/:id/schema", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch schema." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/department-forms/:id/roles  — role access list for a form
───────────────────────────────────────────────────────────────────── */
router.get("/:id/roles", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const { rows } = await pool.query(
      "SELECT role_name FROM department_form_roles WHERE department_form_id = $1 ORDER BY role_name",
      [req.params.id]
    );
    return res.json({ success: true, roles: rows.map((r) => r.role_name) });
  } catch (err) {
    logger.error("GET /api/department-forms/:id/roles", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch roles." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-forms
   Create a department form: register in department_table_list, create the
   shared dept_form_<slug> table, seed the year mapping (active for the
   selected year), lock config, and role access.
   Body: { form_name, form_description?, schema, year?, deadline? }
───────────────────────────────────────────────────────────────────── */
router.post("/", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const { form_name, form_description = null, schema, deadline } = req.body;

  if (!form_name || !String(form_name).trim())
    return res.status(400).json({ success: false, message: "form_name is required." });
  if (!schema || typeof schema !== "object")
    return res.status(400).json({ success: false, message: "schema is required." });

  const slug = slugify(form_name);
  if (!/^[a-z][a-z0-9_]*$/.test(slug))
    return res.status(400).json({ success: false, message: "form_name must start with a letter and contain only letters, digits, and underscores." });

  // Optional deadline supplied from the create flow ("Enable Deadline"). Scoped
  // to the creation year. Invalid date → ignored (form still created).
  let createDeadline = null;
  if (deadline != null && String(deadline).trim() !== "") {
    const d = new Date(deadline);
    if (!isNaN(d.getTime())) createDeadline = d.toISOString();
  }

  // Runtime record translation is not supported for department forms.
  const translateEnabled = false;
  const year = resolveYear(req);
  let table; // set after department is resolved (table is namespaced per department)

  try {
    const { institutionId, departmentId } = await resolveDeptContext(pool, req);
    if (!departmentId)
      return res.status(400).json({ success: false, message: "No department is associated with your account." });

   table = deptRecordsTable(departmentId, slug);

// ----------------------------------------------------
// Manual English / Hindi labels
// Supports BOTH old frontend and new frontend
// ----------------------------------------------------

for (const field of (schema.fields || [])) {

    const english =
        typeof field.label === "object"
            ? (field.label.en || "")
            : (field.label || "");

    const hindi =
        typeof field.label === "object"
            ? (field.label.hi || "")
            : (field.label_hi || "");

    field.label = {
        en: english,
        hi: hindi
    };

    delete field.label_hi;
}

const usedColNames = collectColumnNames(schema.fields);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: insRows } = await client.query(
        `INSERT INTO department_table_list
           (form_name, form_description, department_id, institution_id, academic_year,
            visibility, translate_enabled, schema, used_column_names, created_by)
         VALUES ($1,$2,$3,$4,$5,'department',$6,$7::jsonb,$8,$9)
         ON CONFLICT (department_id, form_name) DO NOTHING
         RETURNING id`,
        [slug, form_description, departmentId, institutionId, year,
         translateEnabled, JSON.stringify(schema), usedColNames, req.user.userId]
      );
      if (!insRows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: `A form named "${slug}" already exists in your department.` });
      }
      const formId = insRows[0].id;

      await ensureDeptYearRow(client, { departmentFormId: formId, academicYear: year, active: true });

      // Seed the base (creation-year) schema row for year-aware schema tracking.
      await client.query(
        `INSERT INTO department_form_schemas
           (department_form_id, academic_year, schema, is_base, created_by)
         VALUES ($1, $2, $3::jsonb, true, $4)
         ON CONFLICT (department_form_id, academic_year) DO NOTHING`,
        [formId, year, JSON.stringify(schema), req.user.userId]
      );

      await client.query(
        `INSERT INTO department_form_lock_config (department_form_id, department_id, is_locked, auto_locked)
         VALUES ($1, $2, false, false)
         ON CONFLICT (department_form_id) DO NOTHING`,
        [formId, departmentId]
      );

      // Year-scoped deadline (only when the create flow enabled one).
      if (createDeadline) {
        await client.query(
          `INSERT INTO department_form_deadline_config
             (department_form_id, institution_id, department_id, academic_year, deadline_at, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (department_form_id, academic_year) DO NOTHING`,
          [formId, institutionId, departmentId, year, createDeadline, req.user.userId]
        );
      }

      // Access is fixed (no per-form role selection): always grant the standard set.
      for (const rn of FIXED_FORM_ROLES) {
        await client.query(
          `INSERT INTO department_form_roles (department_form_id, role_name, institution_id, department_id, academic_year)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (department_form_id, role_name) DO NOTHING`,
          [formId, rn, institutionId, departmentId, year]
        );
      }

      // Shared physical table (IF NOT EXISTS), then add any new custom columns.
      await client.query(buildDeptRecordsTableDDL(table, schema.fields || []));
      for (const field of (schema.fields || [])) {
        const col = field.column_name.trim().toLowerCase().replace(/\s+/g, "_");
        if (/^[a-z][a-z0-9_]*$/.test(col)) {
          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${quoteIdent(col)} ${pgType(field.type)}`);
        }
      }

      // Bug 14 — index the fresh department-records table (empty → instant).
      await ensureRecordsIndexes(client, table);

      await client.query("COMMIT");

      await writeAuditLog(req, {
        actionType: "CREATE_DEPARTMENT_FORM",
        entityType: "department_form",
        entityId: formId,
        newValue: { form_name: slug, table, department_id: departmentId, academic_year: year },
      });

      // Notify department admins and nodal officers in this department (fire-and-forget).
      setImmediate(async () => {
        try {
          const { rows: creatorRows } = await pool.query(
            `SELECT full_name FROM users WHERE id = $1`, [req.user.userId]
          );
          const createdByName = creatorRows[0]?.full_name || "System";

          const { rows: deptRows } = await pool.query(
            `SELECT name FROM departments WHERE department_id = $1`, [departmentId]
          );
          const departmentName = deptRows[0]?.name || "Your Department";

          // Notify department_admin and nodal_officer roles — not contributors (too many).
          const notifyRoles = ["department_admin", "nodal_officer"];
          let recipients;
          const { rows: roleRows } = await pool.query(
            `SELECT DISTINCT u.id, u.full_name, u.email
             FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE u.department_id = $1
               AND u.institution_id = $2
               AND u.account_status = 'ACTIVE'
               AND r.name = ANY($3::text[])
               AND ur.revoked_at IS NULL
               AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
            [departmentId, institutionId, notifyRoles]
          );
          recipients = roleRows.length > 0 ? roleRows : await pool.query(
            `SELECT id, full_name, email FROM users WHERE id = $1`, [req.user.userId]
          ).then((r) => r.rows);

          const academicYear = `${year}-${year + 1}`;
          const loginUrl     = process.env.APP_LOGIN_URL || "http://localhost:5173/login";
          const deadlineStr  = createDeadline
            ? new Date(createDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : null;

          await Promise.all(recipients.map((r) =>
            enqueueEmail(pool, {
              eventId:         "department_form_created",
              recipientEmail:  r.email,
              recipientUserId: r.id,
              payload: {
                full_name:       r.full_name,
                form_name:       slug,
                department_name: departmentName,
                academic_year:   academicYear,
                created_by_name: createdByName,
                deadline:        deadlineStr,
                login_url:       loginUrl,
              },
            })
          ));
          logger.info(`Enqueued department_form_created for ${recipients.length} recipient(s) — form "${slug}"`);
        } catch (err) {
          logger.error("Failed to enqueue department_form_created email", { stack: err.stack });
        }
      });

      return res.json({ success: true, message: `Department form "${slug}" created.`, id: formId, table });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("POST /api/department-forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create department form." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/department-forms/:id/schema   — update schema (edit)
   Body: { schema, year? }
   Creation year → ALTER TABLE for new physical columns (same as before).
   Subsequent years → extra fields saved to department_form_schemas JSONB only.
───────────────────────────────────────────────────────────────────── */
router.put("/:id/schema", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const { schema } = req.body;
  if (!schema) return res.status(400).json({ success: false, message: "schema is required." });

  const year = resolveYear(req);

  try {
    const { form, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });

    if (await isDeptFormArchivedForYear(pool, form.id, year))
      return res.status(409).json({ success: false, message: "This form is archived for the selected academic year. Archived forms cannot be modified." });

    const creationYear = form.academic_year;
    const isCreationYear = year === creationYear;
    const table = deptRecordsTable(form.department_id, form.form_name);

    // Build the set of currently active column names for this (form, year).
    // For non-creation years also include year-specific extras already saved.
    const baseFieldNames = new Set((form.schema?.fields || []).map((f) => f.column_name));
    const currentNames = new Set(baseFieldNames);
    if (!isCreationYear) {
      const { rows: yrRows } = await pool.query(
        `SELECT schema FROM department_form_schemas
         WHERE department_form_id = $1 AND academic_year = $2 AND is_base = false`,
        [form.id, year]
      );
      for (const f of (yrRows[0]?.schema?.fields || [])) currentNames.add(f.column_name);
    }

    // Bug 8 — a previously-used (now deleted) column name must not be reintroduced.
    const usedColumnNames = new Set(form.used_column_names || []);
    const excludedIncoming = new Set(schema.excluded_fixed_columns || []);
    const reused = (schema.fields || [])
      .filter((f) => !excludedIncoming.has(f.column_name))
      .map((f) => f.column_name?.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter((col) => col && usedColumnNames.has(col) && !currentNames.has(col));
    if (reused.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Column name(s) were previously used and cannot be reused: ${reused.join(", ")}. Choose a different name to avoid exposing old data.`,
      });
    }

    // Bug 9 — an existing field's TYPE is immutable.
    const existingTypeByCol = new Map((form.schema?.fields || []).map((f) => [f.column_name, f.type]));
    for (const f of (schema.fields || [])) {
      if (existingTypeByCol.has(f.column_name)) f.type = existingTypeByCol.get(f.column_name);
    }

    const mergedUsed = Array.from(new Set([
    ...(form.used_column_names || []),
    ...collectColumnNames(schema.fields)
]));

// ----------------------------------------------------
// Manual English / Hindi labels
// Supports BOTH old frontend and new frontend
// ----------------------------------------------------

for (const field of (schema.fields || [])) {

    const english =
        typeof field.label === "object"
            ? (field.label.en || "")
            : (field.label || "");

    const hindi =
        typeof field.label === "object"
            ? (field.label.hi || "")
            : (field.label_hi || "");

    // English label is mandatory
    if (!english.trim()) {
        return res.status(400).json({
            success: false,
            message: `${field.column_name} English label is required`
        });
    }

    field.label = {
        en: english.trim(),
        hi: hindi.trim()
    };

    delete field.label_hi;
}


    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (isCreationYear) {
        // Creation year: update main schema + base schema row + ALTER TABLE for new columns.
        await client.query(
          `UPDATE department_table_list
             SET schema = $1::jsonb, used_column_names = $2, updated_by = $3, updated_at = now()
           WHERE id = $4`,
          [JSON.stringify(schema), mergedUsed, req.user.userId, form.id]
        );
        await client.query(
          `INSERT INTO department_form_schemas
             (department_form_id, academic_year, schema, is_base, created_by, updated_by)
           VALUES ($1, $2, $3::jsonb, true, $4, $4)
           ON CONFLICT (department_form_id, academic_year) DO UPDATE
             SET schema = EXCLUDED.schema, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [form.id, year, JSON.stringify(schema), req.user.userId]
        );
        const excluded = new Set(schema.excluded_fixed_columns || []);
        for (const field of (schema.fields || [])) {
          if (excluded.has(field.column_name) || baseFieldNames.has(field.column_name)) continue;
          const col = field.column_name.trim().toLowerCase().replace(/\s+/g, "_");
          if (/^[a-z][a-z0-9_]*$/.test(col)) {
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${quoteIdent(col)} ${pgType(field.type)}`);
          }
        }
      } else {
        // Non-creation year: extra (non-base) fields go to JSONB only — no ALTER TABLE.
        const extraFields = (schema.fields || []).filter((f) => !baseFieldNames.has(f.column_name));
        const yearSchema = { ...schema, fields: extraFields };
        await client.query(
          `INSERT INTO department_form_schemas
             (department_form_id, academic_year, schema, is_base, created_by, updated_by)
           VALUES ($1, $2, $3::jsonb, false, $4, $4)
           ON CONFLICT (department_form_id, academic_year) DO UPDATE
             SET schema = EXCLUDED.schema, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [form.id, year, JSON.stringify(yearSchema), req.user.userId]
        );
        await client.query(
          `UPDATE department_table_list SET used_column_names = $1, updated_by = $2, updated_at = now() WHERE id = $3`,
          [mergedUsed, req.user.userId, form.id]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_SCHEMA_UPDATED",
      entityType: "department_form",
      entityId: form.id,
      newValue: { form_name: form.form_name, academic_year: year, is_creation_year: isCreationYear },
      message: `Department form schema updated - "${form.form_name}" for ${year}`,
    }).catch(() => {});

    return res.json({ success: true, message: "Schema updated successfully." });
  } catch (err) {
    logger.error("PUT /api/department-forms/:id/schema", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update schema." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/department-forms/:id/roles   — replace role access list
   Body: { roles: string[] }
───────────────────────────────────────────────────────────────────── */
router.put("/:id/roles", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  try {
    const { form, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM department_form_roles WHERE department_form_id = $1", [form.id]);
      for (const rn of roles) {
        if (!rn || typeof rn !== "string") continue;
        await client.query(
          `INSERT INTO department_form_roles (department_form_id, role_name, institution_id, department_id, academic_year)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (department_form_id, role_name) DO NOTHING`,
          [form.id, rn, form.institution_id, form.department_id, form.academic_year]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType: "DEPARTMENT_FORM_ROLES_UPDATED",
      entityType: "department_form",
      entityId: form.id,
      newValue: { form_name: form.form_name, roles },
      message: `Department form roles updated - "${form.form_name}"`,
    }).catch(() => {});

    return res.json({ success: true, message: "Role access updated." });
  } catch (err) {
    logger.error("PUT /api/department-forms/:id/roles", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update roles." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PUT /api/department-forms/:id/deadline   — set / clear deadline
   Body: { deadline }  (ISO string to set; null/"" to clear). Mirrors the
   institution deadline upsert: clearing a future deadline lifts auto-locks.
───────────────────────────────────────────────────────────────────── */
router.put("/:id/deadline", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const { deadline } = req.body;
  let newDeadline = null;
  if (deadline != null && String(deadline).trim() !== "") {
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: "Invalid deadline date." });
    newDeadline = d.toISOString();
  }
  try {
    const { form, departmentId, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });

    // Deadline is scoped to the SELECTED academic year — a deadline set for one
    // year is never inherited by another (year isolation). Keyed per (form, year).
    const year = resolveYear(req);

    if (await isDeptFormArchivedForYear(pool, form.id, year))
      return res.status(409).json({ success: false, message: "This form is archived for the selected academic year. Archived forms cannot be modified." });

    const { rows } = await pool.query(
      `INSERT INTO department_form_deadline_config
         (department_form_id, institution_id, department_id, academic_year, deadline_at, is_locked, auto_locked, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, false, false, $6, $6)
       ON CONFLICT (department_form_id, academic_year) DO UPDATE SET
         deadline_at = $5,
         is_locked   = CASE WHEN department_form_deadline_config.auto_locked AND ($5 IS NULL OR $5 > NOW())
                            THEN false ELSE department_form_deadline_config.is_locked END,
         auto_locked = CASE WHEN $5 IS NULL OR $5 > NOW()
                            THEN false ELSE department_form_deadline_config.auto_locked END,
         updated_by  = $6,
         updated_at  = now()
       RETURNING deadline_at AS deadline, is_locked, auto_locked, academic_year`,
      [form.id, form.institution_id, departmentId, year, newDeadline, req.user.userId]
    );
    await client_safe_audit(req, form, newDeadline, year);
    return res.json({ success: true, message: newDeadline ? "Deadline saved." : "Deadline removed.", ...rows[0] });
  } catch (err) {
    logger.error("PUT /api/department-forms/:id/deadline", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update deadline." });
  }
});

async function client_safe_audit(req, form, newDeadline, academicYear) {
  try {
    await writeAuditLog(req, {
      actionType: newDeadline ? "SET_DEPARTMENT_FORM_DEADLINE" : "REMOVE_DEPARTMENT_FORM_DEADLINE",
      entityType: "department_form",
      entityId: form.id,
      newValue: { form_name: form.form_name, academic_year: academicYear, deadline_at: newDeadline },
    });
  } catch { /* audit must never block the request */ }
}

/* ─────────────────────────────────────────────────────────────────────
   POST /api/department-forms/:id/lock   — lock the SELECTED academic year
   POST /api/department-forms/:id/unlock
───────────────────────────────────────────────────────────────────── */
router.post("/:id/lock", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  return setYearLock(req, res, true);
});
router.post("/:id/unlock", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  return setYearLock(req, res, false);
});

async function setYearLock(req, res, locked) {
  const pool = req.app.locals.pool;
  try {
    const { form, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const year = resolveYear(req);

    if (await isDeptFormArchivedForYear(pool, form.id, year))
      return res.status(409).json({ success: false, message: "This form is archived for the selected academic year. Archived forms cannot be modified." });

    // Block unlock when the deadline has already passed — the deadline-based
    // lock is still active regardless of the manual is_locked flag, so
    // "unlocking" would show success but the form stays locked. User must
    // remove the deadline first.
    if (!locked) {
      const { rows: dlRows } = await pool.query(
        `SELECT deadline_at FROM department_form_deadline_config
         WHERE department_form_id = $1 AND academic_year = $2 LIMIT 1`,
        [form.id, year]
      );
      if (dlRows.length && dlRows[0].deadline_at && new Date(dlRows[0].deadline_at) <= new Date()) {
        return res.status(409).json({
          success: false,
          message: "Cannot unlock: the submission deadline has expired. Remove the deadline first, then unlock the form.",
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDeptYearRow(client, { departmentFormId: form.id, academicYear: year, active: true });
      await client.query(
        `UPDATE department_form_year_mapping SET is_locked = $1
         WHERE department_form_id = $2 AND academic_year = $3`,
        [locked, form.id, year]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType: locked ? "LOCK_DEPARTMENT_FORM" : "UNLOCK_DEPARTMENT_FORM",
      entityType: "department_form",
      entityId: form.id,
      newValue: { form_name: form.form_name, academic_year: year, is_locked: locked },
    }).catch(() => {});

    return res.json({ success: true, message: `Form "${form.form_name}" ${locked ? "locked" : "unlocked"} for ${year}–${year + 1}.` });
  } catch (err) {
    logger.error("POST /api/department-forms/:id/(un)lock", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update lock." });
  }
}

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/department-forms/:id/archive   — archive / restore for the year
   Body: { archived: boolean }
───────────────────────────────────────────────────────────────────── */
router.patch("/:id/archive", requireRole(WRITE_ROLES), requireActiveDepartment, async (req, res) => {
  const pool = req.app.locals.pool;
  const archived = req.body?.archived === true;
  try {
    const { form, error } = await loadOwnedForm(pool, req, req.params.id);
    if (error) return res.status(404).json({ success: false, message: error });
    const year = resolveYear(req);

    const { rows: ymBefore } = await pool.query(
      `SELECT is_archived FROM department_form_year_mapping WHERE department_form_id = $1 AND academic_year = $2`,
      [form.id, year]
    );
    const oldArchived = ymBefore[0]?.is_archived ?? false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDeptYearRow(client, { departmentFormId: form.id, academicYear: year, active: !archived });
      await client.query(
        `UPDATE department_form_year_mapping
           SET is_archived = $1, is_active = $2, status = $3
         WHERE department_form_id = $4 AND academic_year = $5`,
        [archived, !archived, archived ? "archived" : "active", form.id, year]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog(req, {
      actionType:    archived ? "DEPARTMENT_FORM_ARCHIVED" : "DEPARTMENT_FORM_UNARCHIVED",
      entityType:    "DEPARTMENT_FORM",
      entityId:      form.id,
      oldValue:      { form_name: form.form_name, academic_year: year, is_archived: oldArchived },
      newValue:      { form_name: form.form_name, academic_year: year, is_archived: archived },
      changedFields: ["is_archived"],
      status:        "SUCCESS",
      message:       `Department form "${form.form_name}" ${archived ? "archived" : "unarchived"} for academic year ${year}`,
      metadata:      { department_id: form.department_id, changed_by: req.user.userId },
    }).catch(() => {});

    return res.json({ success: true, message: `Form "${form.form_name}" ${archived ? "archived" : "activated"} for ${year}–${year + 1}.` });
  } catch (err) {
    logger.error("PATCH /api/department-forms/:id/archive", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update archive state." });
  }
});

module.exports = router;
