"use strict";

/**
 * departmentFormService.js
 * ─────────────────────────────────────────────────────────────────────────
 * Department-scoped form management — a fully ISOLATED parallel of the
 * institution form system (routes/forms.js + form_lock_config +
 * academic_year_form_config). Nothing here touches the institution tables.
 *
 * New tables (all additive, CREATE TABLE IF NOT EXISTS → backward compatible):
 *   • department_table_list          — one row per (department, form)
 *   • department_form_lock_config     — deadline + lock state per dept form
 *   • department_form_year_mapping    — per-(form, academic_year) lifecycle
 *   • department_form_roles           — which roles may see/fill the form
 *
 * Physical records live in a shared `dept_form_<slug>` table, with every row
 * tagged department_id + institution_id + academic_year + role_name + language
 * (the same "shared table, scoped rows" approach the institution side uses).
 * ───────────────────────────────────────────────────────────────────────── */

const logger = require("../utils/logger");
const { resolveEffectiveDepartment } = require("./departmentContext");

/* Safely quote a SQL identifier (column name). Field column names are
   user-defined and may collide with PostgreSQL reserved words (e.g. "column",
   "desc", "order", "user"); without quoting, the generated DDL/DML is a syntax
   error. Quoting lowercase identifiers is harmless and matches the existing
   (unquoted → lowercase-folded) columns, so already-created tables still work. */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/* Map a schema field type → PostgreSQL column type (mirrors forms.js). */
function pgType(fieldType) {
  const map = {
    text: "TEXT", textarea: "TEXT", description: "TEXT", email: "TEXT",
    phone: "TEXT", document: "TEXT", number: "NUMERIC",
    date: "DATE", boolean: "BOOLEAN",
  };
  return map[fieldType] || "TEXT";
}

/* "Student Feedback" → "student_feedback" */
function slugify(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_");
}

/* Physical records table for a department form — NAMESPACED PER DEPARTMENT so
   two departments that pick the same form name never share a table (guarantees
   department-internal isolation; no cross-department column-type clashes).
   Shape: dept_form_<dep12>_<slug> — a valid, deterministic SQL identifier ≤63 chars. */
function deptRecordsTable(departmentId, slug) {
  const dep = String(departmentId || "").replace(/[^0-9a-fA-F]/g, "").slice(0, 12).toLowerCase() || "x";
  const s = String(slug || "").slice(0, 35);
  return `dept_form_${dep}_${s}`;
}

/* All schema column names (normalized), including hidden — mirrors forms.js. */
function collectColumnNames(fields) {
  return (fields || [])
    .map((f) => f.column_name?.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

/* CREATE TABLE DDL for a department form's physical records table.
   Standard columns are department-scoped; fixed columns come from the schema. */
function buildDeptRecordsTableDDL(tableName, fields) {
  const standard = [
    "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
    "form_name TEXT",
    "department_id UUID",
    "institution_id UUID",
    "academic_year INT",
    "role_name TEXT",
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
    return `${quoteIdent(col)} ${pgType(f.type)}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${[...standard, ...fixed].join(",\n  ")}\n)`;
}

/* Ensure all department-form tables exist. Safe to call on every boot. */
async function ensureDepartmentFormTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_table_list (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_name         TEXT NOT NULL,
      form_description  TEXT,
      department_id     UUID NOT NULL,
      institution_id    UUID,
      academic_year     INT  NOT NULL,
      visibility        TEXT DEFAULT 'department',
      translate_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      deadline_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
      is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
      is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
      schema            JSONB,
      used_column_names TEXT[],
      created_by        UUID,
      updated_by        UUID,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_id, form_name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_form_lock_config (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_form_id UUID NOT NULL REFERENCES department_table_list(id) ON DELETE CASCADE,
      department_id      UUID NOT NULL,
      deadline           TIMESTAMPTZ,
      is_locked          BOOLEAN NOT NULL DEFAULT FALSE,
      auto_locked        BOOLEAN NOT NULL DEFAULT FALSE,
      locked_by          UUID,
      locked_at          TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_form_id)
    )
  `);

  /* Year-scoped deadline config (ownership: institution → department → academic
     year → form). UNIQUE per (form, academic_year) so switching the academic
     year never inherits another year's deadline. Fully additive — the older
     department_form_lock_config is left untouched. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_form_deadline_config (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_form_id UUID NOT NULL REFERENCES department_table_list(id) ON DELETE CASCADE,
      institution_id     UUID,
      department_id      UUID,
      academic_year      INT  NOT NULL,
      deadline_at        TIMESTAMPTZ,
      is_locked          BOOLEAN NOT NULL DEFAULT FALSE,
      auto_locked        BOOLEAN NOT NULL DEFAULT FALSE,
      locked_at          TIMESTAMPTZ,
      created_by         UUID,
      updated_by         UUID,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_form_id, academic_year)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_dfdc_form_year ON department_form_deadline_config (department_form_id, academic_year)`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_form_year_mapping (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_form_id UUID NOT NULL REFERENCES department_table_list(id) ON DELETE CASCADE,
      academic_year      INT  NOT NULL,
      status             TEXT NOT NULL DEFAULT 'active',
      is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
      is_active          BOOLEAN NOT NULL DEFAULT TRUE,
      is_locked          BOOLEAN NOT NULL DEFAULT FALSE,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_form_id, academic_year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_form_roles (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_form_id UUID NOT NULL REFERENCES department_table_list(id) ON DELETE CASCADE,
      role_name          TEXT NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_form_id, role_name)
    )
  `);

  /* Scope columns (additive): role assignment belongs to one institution +
     department + academic year, per the department access hierarchy. role_id
     is optional metadata; access matching uses role_name (the JWT carries
     role names, not ids). */
  for (const col of [
    "institution_id UUID",
    "department_id UUID",
    "academic_year INT",
    "role_id UUID",
  ]) {
    await pool.query(`ALTER TABLE department_form_roles ADD COLUMN IF NOT EXISTS ${col}`);
  }

  /* Year-scoped schema storage. Mirrors institution custom_field_schemas:
     - is_base = true  → creation-year schema (physical columns)
     - is_base = false → subsequent-year extra fields (stored in custom_fields JSONB)
     UNIQUE (department_form_id, academic_year) — one row per (form, year). */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_form_schemas (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_form_id UUID NOT NULL REFERENCES department_table_list(id) ON DELETE CASCADE,
      academic_year      INT  NOT NULL,
      schema             JSONB,
      is_base            BOOLEAN NOT NULL DEFAULT FALSE,
      created_by         UUID,
      updated_by         UUID,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (department_form_id, academic_year)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_dfs_form_year ON department_form_schemas (department_form_id, academic_year)`
  );

  logger.info("department_form tables ensured");
}

/* Department forms are always restricted to this fixed role set — Contributors,
   Department Nodal Officers, and Department Admins. Kept in sync with
   FIXED_FORM_ROLES in routes/departmentForms.js. */
const FIXED_FORM_ROLES = ["department_admin", "nodal_officer", "contributor"];

/* Reconcile every existing department form to the fixed role set: insert the
   three standard roles (carrying the form's institution/department/year) and
   remove any other role rows. Idempotent — safe to run on every boot. This
   replaces the removed per-form "Roles with access" picker so old forms that
   were open to the whole department (or to ad-hoc roles) become restricted too. */
async function backfillFixedFormRoles(pool) {
  await pool.query(
    `INSERT INTO department_form_roles
       (department_form_id, role_name, institution_id, department_id, academic_year)
     SELECT dtl.id, r.role_name, dtl.institution_id, dtl.department_id, dtl.academic_year
       FROM department_table_list dtl
       CROSS JOIN (VALUES ('department_admin'), ('nodal_officer'), ('contributor')) AS r(role_name)
     ON CONFLICT (department_form_id, role_name) DO NOTHING`
  );
  const { rowCount } = await pool.query(
    `DELETE FROM department_form_roles WHERE role_name <> ALL($1::text[])`,
    [FIXED_FORM_ROLES]
  );
  logger.info("department_form_roles reconciled to fixed set", { removedNonFixed: rowCount });
}

/* Resolve the institution + department for the requesting user.
   Department Admins always have a department_id on their users row. */
async function resolveDeptContext(pool, req) {
 const { rows } = await pool.query(
    "SELECT institution_id, department_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  return {
    institutionId: rows[0]?.institution_id || null,
    departmentId:  rows[0]?.department_id || null,
  };
}

/* Ensure a year-mapping row exists for (form, year). */
async function ensureDeptYearRow(client, { departmentFormId, academicYear, active = true }) {
  await client.query(
    `INSERT INTO department_form_year_mapping
       (department_form_id, academic_year, status, is_active, is_archived, is_locked)
     VALUES ($1, $2, $3, $4, $5, false)
     ON CONFLICT (department_form_id, academic_year) DO NOTHING`,
    [departmentFormId, academicYear, active ? "active" : "archived", active, !active]
  );
}

module.exports = {
  ensureDepartmentFormTables,
  backfillFixedFormRoles,
  FIXED_FORM_ROLES,
  quoteIdent,
  resolveDeptContext,
  ensureDeptYearRow,
  pgType,
  slugify,
  deptRecordsTable,
  collectColumnNames,
  buildDeptRecordsTableDDL,
};
