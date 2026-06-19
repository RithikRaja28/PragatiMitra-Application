# Form Module — SQL Schema & Interaction Reference

> **Purpose:** Complete reference for every table, column, relationship, and query pattern used by the form module. Written to support integration of the report module.

---

## Table of Contents

1. [Institution Forms — Core Tables](#1-institution-forms--core-tables)
2. [Dynamic Records Tables](#2-dynamic-records-tables)
3. [Department Forms Tables](#3-department-forms-tables)
4. [Dynamic Department Records Tables](#4-dynamic-department-records-tables)
5. [Supporting Tables](#5-supporting-tables)
6. [Entity Relationship Map](#6-entity-relationship-map)
7. [Key Query Patterns](#7-key-query-patterns)
8. [Lock & Deadline Decision Logic](#8-lock--deadline-decision-logic)
9. [English ↔ Hindi Row Linking](#9-english--hindi-row-linking)
10. [Academic Year Scoping](#10-academic-year-scoping)
11. [Transaction Flows](#11-transaction-flows)
12. [Endpoint → Table Reference](#12-endpoint--table-reference)

---

## 1. Institution Forms — Core Tables

### `table_list` — Form Registry

Stores one row per form (global). The entry point for any form lookup.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Internal form identifier |
| `form_name` | TEXT (UNIQUE) | URL-safe slug — pattern `^[a-z][a-z0-9_]*$` |
| `share_table` | BOOLEAN | If `true`, this form is a shared template accessible by all institutions |
| `institute_access` | UUID[] | Array of institution IDs allowed to access this form |
| `created_by` | UUID | User who created the form |
| `translate_to_hindi` | BOOLEAN (DEFAULT true) | Whether Hindi translation is enabled for this form |
| `form_domain` | TEXT (DEFAULT 'academic') | Domain classification: `academic` \| `hospital` \| `finance` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Key access patterns:**
```sql
-- All forms accessible to an institution in a domain
SELECT * FROM table_list
WHERE $institutionId = ANY(institute_access)
  AND COALESCE(form_domain, 'academic') = $domain;

-- Is Hindi translation on?
SELECT COALESCE(translate_to_hindi, true) AS enabled
FROM table_list WHERE form_name = $1;

-- Shared templates
SELECT * FROM table_list WHERE share_table = true;
```

---

### `custom_field_schemas` — Form Structure (Field Definitions)

Stores the field/column definitions for each form, scoped per institution and per academic year.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Schema row identifier |
| `form_name` | TEXT | References `table_list.form_name` |
| `institution_id` | UUID | Which institution this schema belongs to |
| `year` | INT | Academic start year (e.g., `2025` for 2025–2026) |
| `schema` | JSONB | Full field definitions: `{ fields: [...], excluded_fixed_columns: [...] }` |
| `is_active` | BOOLEAN | Whether this is the currently active schema |
| `used_column_names` | TEXT[] | All column names ever used (including deleted ones — prevents reuse) |
| `created_by` | UUID | |
| `updated_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `source_form_id` | UUID | (Shared forms) `table_list.id` of the creator institution's form |
| `source_institution_id` | UUID | (Shared forms) Creator institution |
| `published_at` | TIMESTAMPTZ | (Shared forms) When the snapshot was published |
| `schema_snapshot_version` | INT | (Shared forms) Which immutable snapshot was cloned from |

**Schema JSONB structure:**
```json
{
  "fields": [
    {
      "name": "student_name",
      "label": "Student Name",
      "type": "text",
      "required": true,
      "order": 1
    }
  ],
  "excluded_fixed_columns": ["department_id"]
}
```

**Field types and their PostgreSQL column types:**

| Field type | PostgreSQL type |
|---|---|
| `text`, `textarea`, `description`, `email`, `phone`, `document` | TEXT |
| `number` | NUMERIC |
| `date` | DATE |
| `boolean` | BOOLEAN |

**Key access patterns:**
```sql
-- Active schema for a specific institution + year (primary lookup)
SELECT * FROM custom_field_schemas
WHERE form_name = $1 AND institution_id = $2 AND is_active = true
ORDER BY year DESC LIMIT 1;

-- Fallback for shared forms: canonical (creator's) schema
SELECT cfs.* FROM custom_field_schemas cfs
JOIN table_list tl ON tl.form_name = cfs.form_name
WHERE cfs.form_name = $1 AND tl.share_table = true AND cfs.is_active = true
ORDER BY cfs.created_at ASC NULLS LAST, cfs.year ASC LIMIT 1;

-- All institutions that have a schema for a form
SELECT DISTINCT institution_id FROM custom_field_schemas
WHERE form_name = $1 AND is_active = true;
```

---

### `form_lock_config` — Manual Lock & Form-Wide Deadline

One row per (form, institution). Controls whether a form is locked for data entry.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `form_name` | TEXT | |
| `institution_id` | UUID | |
| `is_locked` | BOOLEAN | Manual admin lock (overrides everything) |
| `locked_by` | UUID | User who manually locked |
| `locked_at` | TIMESTAMPTZ | |
| `deadline_at` | TIMESTAMPTZ | Form-wide auto-lock deadline (legacy; per-year rows override this) |
| `auto_locked` | BOOLEAN | Set `true` once the deadline checker auto-locks |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Key access patterns:**
```sql
SELECT is_locked, auto_locked, deadline_at, locked_by, locked_at
FROM form_lock_config
WHERE form_name = $1 AND institution_id = $2;
```

---

### `form_year_deadlines` — Per-Year Deadlines

When a row exists for a specific (form, institution, year), it overrides the form-wide `form_lock_config` deadline for that year only.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `form_name` | TEXT | |
| `institution_id` | UUID | |
| `academic_year` | INT | Academic start year (e.g., `2025`) |
| `deadline_at` | TIMESTAMPTZ | When this year's data entry auto-locks |
| `is_locked` | BOOLEAN | Whether this year is locked |
| `auto_locked` | BOOLEAN | Auto-locked by deadline expiry |
| `locked_at` | TIMESTAMPTZ | |
| `locked_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

```sql
-- Fetch year-scoped deadline
SELECT is_locked, auto_locked, deadline_at FROM form_year_deadlines
WHERE form_name = $1 AND institution_id = $2 AND academic_year = $3;
```

> **Rule:** A deadline for year Y never affects year Y±1.

---

### `academic_year_form_config` — Form Lifecycle Per Year

Tracks whether a form is active, archived, or disabled for a given institution in a given academic year.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `institution_id` | UUID | |
| `academic_year` | TEXT | Format `"YYYY–YYYY"` e.g. `"2025–2026"` |
| `active_forms_json` | JSONB | Array of form IDs marked active |
| `archived_forms_json` | JSONB | Array of form IDs marked archived |
| `disabled` | JSONB | Array of form IDs marked disabled |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `shared_form_snapshots` — Immutable Publish Snapshot

When a shared template is created, its schema is frozen here. Consumer institutions clone from this snapshot, not from the creator's live schema.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `source_form_id` | UUID | `table_list.id` of the shared form |
| `version` | INT | Always `1` (single snapshot per form, immutable) |
| `form_name` | TEXT | |
| `schema` | JSONB | Frozen field definitions |
| `used_column_names` | TEXT[] | |
| `created_by` | UUID | |
| `published_at` | TIMESTAMPTZ | |

---

### `schema_propagation_log` — Audit Trail

Records when a missing schema row is cloned for a consumer institution.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `form_name` | TEXT | |
| `institution_id` | UUID | |
| `academic_year` | INT | |
| `action` | TEXT | e.g., `"inserted_missing_schema"` |
| `created_at` | TIMESTAMPTZ | |

---

## 2. Dynamic Records Tables

### `<formName>_records` — Form Submissions

A physical table is created for each form (e.g., `student_details_records`, `faculty_list_records`). All submission rows live here.

**Fixed columns (always present):**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | `DEFAULT gen_random_uuid()` |
| `form_name` | TEXT | Denormalized form slug |
| `institution_id` | UUID | Scoping — which institution |
| `department_id` | UUID | Scoping — nullable for institution-wide forms |
| `year` | INT | Academic start year |
| `schema_id` | UUID | `custom_field_schemas.id` — which schema version this row follows |
| `status` | TEXT | Submission status (reserved for future use) |
| `order_index` | INT | Display ordering |
| `custom_fields` | JSONB | Reserved for alternative field storage |
| `language` | TEXT | `'en'` or `'hi'` |
| `source_row_id` | UUID | For Hindi rows: foreign key to the English row's `id` |
| `created_by` | UUID | User who submitted |
| `updated_by` | UUID | |
| `created_at` | TIMESTAMPTZ | `DEFAULT now()` |
| `updated_at` | TIMESTAMPTZ | `DEFAULT now()` |

**Dynamic columns** — one per field in the schema, added via `ALTER TABLE`:
```sql
ALTER TABLE <formName>_records ADD COLUMN <col_name> TEXT;      -- text fields
ALTER TABLE <formName>_records ADD COLUMN <col_name> NUMERIC;   -- number fields
ALTER TABLE <formName>_records ADD COLUMN <col_name> DATE;      -- date fields
ALTER TABLE <formName>_records ADD COLUMN <col_name> BOOLEAN;   -- boolean fields
```

**Key access patterns:**
```sql
-- All English records for an institution + year
SELECT * FROM <formName>_records
WHERE institution_id = $1 AND year = $2
  AND (language = 'en' OR language IS NULL);

-- Hindi mirror for a specific English row
SELECT * FROM <formName>_records WHERE source_row_id = $1;

-- Delete English + all linked Hindi mirrors
DELETE FROM <formName>_records WHERE id = $1 OR source_row_id = $1;

-- Records for a specific department
SELECT * FROM <formName>_records
WHERE institution_id = $1 AND department_id = $2 AND year = $3
  AND (language = 'en' OR language IS NULL);
```

**How to enumerate all form tables in the database:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%_records'
  AND table_name NOT LIKE 'dept_form_%';
```

---

## 3. Department Forms Tables

### `department_table_list` — Department Form Registry

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Form identifier — used everywhere in department form routes |
| `form_name` | TEXT | Form slug |
| `form_description` | TEXT | |
| `department_id` | UUID | Owning department |
| `institution_id` | UUID | Parent institution (nullable, inherited) |
| `academic_year` | INT | Creation year |
| `visibility` | TEXT | e.g., `'department'` |
| `translate_enabled` | BOOLEAN | Hindi translation toggle |
| `schema` | JSONB | Full field definitions (stored directly, not in a separate table) |
| `used_column_names` | TEXT[] | Column name history |
| `created_by` | UUID | |
| `updated_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

> **Key difference from institution forms:** The schema is stored directly in `department_table_list.schema` rather than in a separate `custom_field_schemas`-style table.

---

### `department_form_year_mapping` — Dept Form Lifecycle Per Year

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `department_form_id` | UUID | References `department_table_list.id` |
| `academic_year` | INT | |
| `status` | TEXT | `'active'` or `'archived'` |
| `is_active` | BOOLEAN | |
| `is_archived` | BOOLEAN | |
| `is_locked` | BOOLEAN | Year-scoped lock (NOT a manual admin lock) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `department_form_deadline_config` — Dept Form Deadlines

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `department_form_id` | UUID | References `department_table_list.id` |
| `institution_id` | UUID | |
| `department_id` | UUID | |
| `academic_year` | INT | |
| `deadline_at` | TIMESTAMPTZ | |
| `is_locked` | BOOLEAN | |
| `auto_locked` | BOOLEAN | |
| `created_by` | UUID | |
| `updated_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `department_form_roles` — Role-Based Access Control

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `department_form_id` | UUID | |
| `role_name` | TEXT | Role required to access this form |
| `institution_id` | UUID | |
| `department_id` | UUID | |
| `academic_year` | INT | |

---

## 4. Dynamic Department Records Tables

### `dept_form_<departmentId>_<formSlug>` — Dept Form Submissions

Named pattern: `dept_form_${departmentId}_${formSlug}` (e.g., `dept_form_abc123_quarterly_report`).

**Fixed columns:**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | `DEFAULT gen_random_uuid()` |
| `form_name` | TEXT | Form slug |
| `department_id` | UUID | |
| `institution_id` | UUID | |
| `academic_year` | INT | |
| `role_name` | TEXT | Which role submitted this row |
| `schema_id` | UUID | `department_table_list.id` |
| `language` | TEXT | `'en'` or `'hi'` |
| `source_row_id` | UUID | For Hindi rows: FK to English row's `id` |
| `created_by` | UUID | |
| `updated_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Dynamic columns** follow the same type-mapping rules as institution records.

**How to enumerate all dept form tables:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'dept_form_%';
```

---

## 5. Supporting Tables

These are not form-specific but are joined in form queries.

| Table | Used For | Key Columns |
|---|---|---|
| `users` | Resolve institution_id, department_id, role, role_domain per request | `id`, `institution_id`, `department_id`, `roles`, `role_domain` |
| `institutions` | Distribute shared forms to all institutions | `institution_id` |
| `departments` | Resolve department names in exports and institute-admin views | `department_id`, `institution_id`, `name`, `name_hi`, `status` |
| `supported_languages` | List available UI languages | `code`, `name` |

---

## 6. Entity Relationship Map

```
institutions
  │
  ├──< table_list (form_name, institute_access[])
  │       │
  │       ├──< custom_field_schemas (form_name, institution_id, year)
  │       │       └── schema JSONB (field definitions)
  │       │
  │       ├──< form_lock_config (form_name, institution_id)
  │       │
  │       ├──< form_year_deadlines (form_name, institution_id, academic_year)
  │       │
  │       ├──1 shared_form_snapshots (source_form_id = table_list.id, version=1)
  │       │
  │       └──< <formName>_records (institution_id, department_id, year)
  │               ├── language='en'  →  id
  │               └── language='hi'  →  source_row_id (FK to English id)
  │
  ├──< academic_year_form_config (institution_id, academic_year)
  │
  └──< departments
          │
          └──< department_table_list (department_id)
                  │
                  ├──< department_form_year_mapping (department_form_id, academic_year)
                  │
                  ├──< department_form_deadline_config (department_form_id, academic_year)
                  │
                  ├──< department_form_roles (department_form_id)
                  │
                  └──< dept_form_<slug> (department_id, academic_year)
                          ├── language='en'  →  id
                          └── language='hi'  →  source_row_id
```

---

## 7. Key Query Patterns

### Resolve active schema (institution form)
```sql
-- Step 1: try institution-specific row
SELECT * FROM custom_field_schemas
WHERE form_name = $formName
  AND institution_id = $institutionId
  AND is_active = true
ORDER BY year DESC LIMIT 1;

-- Step 2 (fallback — shared forms only): canonical creator row
SELECT cfs.* FROM custom_field_schemas cfs
JOIN table_list tl ON tl.form_name = cfs.form_name
WHERE cfs.form_name = $formName
  AND tl.share_table = true
  AND cfs.is_active = true
ORDER BY cfs.created_at ASC NULLS LAST, cfs.year ASC
LIMIT 1;
```

### Get all records for reporting (institution form)
```sql
SELECT r.*, u.name AS submitted_by_name, d.name AS department_name
FROM <formName>_records r
LEFT JOIN users u ON u.id = r.created_by
LEFT JOIN departments d ON d.department_id = r.department_id
WHERE r.institution_id = $institutionId
  AND r.year = $academicYear
  AND (r.language = 'en' OR r.language IS NULL)
ORDER BY r.created_at DESC;
```

### Get all form names available to an institution
```sql
SELECT tl.form_name, tl.form_domain, tl.share_table, tl.translate_to_hindi
FROM table_list tl
WHERE $institutionId = ANY(tl.institute_access)
  AND COALESCE(tl.form_domain, 'academic') = $domain;
```

### Get field definitions for a form (for dynamic column building)
```sql
SELECT schema->'fields' AS fields
FROM custom_field_schemas
WHERE form_name = $formName
  AND institution_id = $institutionId
  AND is_active = true
ORDER BY year DESC LIMIT 1;
```

### Check if a physical records table exists
```sql
SELECT 1 FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = $formName || '_records';
```

### Get all columns in a records table (for dynamic SELECT building)
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = $formName || '_records'
ORDER BY ordinal_position;
```

---

## 8. Lock & Deadline Decision Logic

```
getLockBlock(form_name, institution_id, year?)
│
├─ Fetch form_lock_config WHERE form_name=$1 AND institution_id=$2
│
├─ LEGACY RESULT (always computed):
│   is_locked=true AND auto_locked=true  → LOCKED: "deadline expired"
│   is_locked=true AND deadline_at<=NOW() → LOCKED: "deadline expired"
│   is_locked=true                        → LOCKED: "manually locked by admin"
│   else                                  → UNLOCKED
│
└─ PER-YEAR OVERRIDE (if year header present):
    Fetch form_year_deadlines WHERE form_name=$1 AND institution_id=$2 AND academic_year=$3
    │
    ├─ Row exists:
    │   is_locked=true AND auto_locked=true  → LOCKED: "deadline expired"
    │   is_locked=true AND deadline_at<=NOW() → LOCKED: "deadline expired"
    │   is_locked=true (manual)              → LOCKED: "manually locked by admin"
    │   else                                  → UNLOCKED
    │
    └─ No row → use LEGACY RESULT above
```

**For reports:** A locked form can still be read — the lock only blocks writes (`POST`, `PUT`, `DELETE` on records). Always read regardless of lock state.

---

## 9. English ↔ Hindi Row Linking

Every form submission creates two rows (when `translate_to_hindi = true`):

```
English row:  id = 'uuid-en-123',  language = 'en',  source_row_id = NULL
Hindi row:    id = 'uuid-hi-456',  language = 'hi',  source_row_id = 'uuid-en-123'
```

**Rules:**
- The Hindi row is created asynchronously after the English row is inserted.
- To get all display rows: fetch English rows + any English rows that have no Hindi mirror yet.
- To get the Hindi counterpart: `SELECT * FROM <formName>_records WHERE source_row_id = $englishId`.
- Deleting English row must also delete Hindi mirrors: `DELETE WHERE id = $1 OR source_row_id = $1`.

**For reports:** Query only `language = 'en' OR language IS NULL` to avoid duplicate counting.

---

## 10. Academic Year Scoping

- Year is always stored as an **integer start year** (e.g., `2025` for 2025–2026).
- The `X-Academic-Year` request header (or `?year=` query param or `body.year`) determines which year's records and schema to use.
- If no year is supplied, the system defaults to the **current calendar year**.
- `custom_field_schemas.year`, `<formName>_records.year`, `form_year_deadlines.academic_year`, and `department_form_year_mapping.academic_year` all use this integer convention.

---

## 11. Transaction Flows

### Create Institution Form
```
BEGIN
  INSERT table_list (form_name, share_table, institute_access, translate_to_hindi, form_domain)
  -- ON CONFLICT on form_name: update institute_access to include this institution
  INSERT custom_field_schemas (form_name, institution_id, year, schema, is_active, created_by, used_column_names)
  INSERT form_lock_config (form_name, institution_id, is_locked=false, deadline_at=NULL)
    -- if share_table: INSERT for ALL institutions from institutions table
  CREATE TABLE IF NOT EXISTS <formName>_records (id UUID, form_name TEXT, institution_id UUID, ...)
  ALTER TABLE <formName>_records ADD COLUMN <fieldName> <pgType>   -- one per schema field
  INSERT academic_year_form_config (mark creator active, consumers archived)
  -- if share_table=true:
  INSERT shared_form_snapshots (source_form_id, version=1, schema, used_column_names)
COMMIT
```

### Submit a Record
```
INSERT <formName>_records (all columns, language='en')  -- synchronous
→ setImmediate (async, non-blocking):
    INSERT <formName>_records (all columns, language='hi', source_row_id=<english_id>)
```

### Bulk Import Records
```
BEGIN
  ALTER TABLE <formName>_records ADD COLUMN IF NOT EXISTS source_row_id UUID
  FOR EACH row in chunk:
    -- duplicateHandling='skip':   INSERT ... ON CONFLICT DO NOTHING
    -- duplicateHandling='update': INSERT ... ON CONFLICT DO UPDATE SET ...
    -- duplicateHandling='error':  INSERT (let conflict throw)
COMMIT
→ setImmediate (async):
    FOR EACH newly inserted English row:
      INSERT <formName>_records (Hindi mirror, source_row_id=<english_id>)
```

### Update Schema (Add Fields)
```
BEGIN
  UPDATE custom_field_schemas SET schema=$newSchema, used_column_names=$updated, updated_by=...
  UPDATE table_list SET translate_to_hindi=..., updated_at=...
  ALTER TABLE <formName>_records ADD COLUMN IF NOT EXISTS <newCol> <pgType>  -- new fields only
  -- Removed columns are NEVER dropped from the physical table (data preservation)
COMMIT
```

---

## 12. Endpoint → Table Reference

### Institution Forms (`/api/forms`)

| Endpoint | Method | Tables Read | Tables Written |
|---|---|---|---|
| `/institution-forms` | GET | `table_list`, `custom_field_schemas`, `form_lock_config`, `form_year_deadlines`, `academic_year_form_config` | — |
| `/templates` | GET | `table_list` | — |
| `/my-forms` | GET | `custom_field_schemas`, `table_list`, `form_lock_config` | — |
| `/:formName/schema` | GET | `custom_field_schemas`, `table_list` | — |
| `/:formName/table-columns` | GET | `information_schema.columns` | — |
| `/:formName/lock-status` | GET | `form_lock_config` | — |
| `/:formName/deadline` | GET | `form_lock_config`, `form_year_deadlines` | — |
| `/:formName/institution-records` | GET | `custom_field_schemas`, `<formName>_records`, `departments`, `form_lock_config` | — |
| `/` | POST | `institutions` | `table_list`, `custom_field_schemas`, `form_lock_config`, `<formName>_records` (CREATE+ALTER), `shared_form_snapshots`, `academic_year_form_config` |
| `/adopt` | POST | — | `table_list`, `custom_field_schemas`, `form_lock_config` |
| `/:formName/schema` | PUT | `custom_field_schemas` | `custom_field_schemas`, `table_list`, `<formName>_records` (ALTER) |
| `/:formName/deadline` | PUT | — | `form_year_deadlines`, `form_lock_config` |
| `/:formName/lock` | POST | — | `form_lock_config` |
| `/:formName/unlock` | POST | — | `form_lock_config` |

### Form Data (`/api/form-data`)

| Endpoint | Method | Tables Read | Tables Written |
|---|---|---|---|
| `/:formName/records` | GET | `custom_field_schemas`, `<formName>_records`, `form_lock_config`, `form_year_deadlines` | — |
| `/:formName/records/:id/counterpart` | GET | `<formName>_records` | — |
| `/:formName/records` | POST | `form_lock_config`, `form_year_deadlines`, `custom_field_schemas` | `<formName>_records` (EN + HI) |
| `/:formName/records/:id` | PUT | `form_lock_config`, `form_year_deadlines` | `<formName>_records` (EN + HI) |
| `/:formName/records/:id` | DELETE | — | `<formName>_records` (EN + HI mirrors) |
| `/:formName/records/bulk-delete` | DELETE | — | `<formName>_records` (EN + HI mirrors) |

### Import / Export (`/api/form-data`)

| Endpoint | Method | Tables Read | Tables Written |
|---|---|---|---|
| `/:formName/import/parse` | POST | `custom_field_schemas`, `form_lock_config` | — |
| `/:formName/import/execute-chunk` | POST | `custom_field_schemas`, `form_lock_config`, `form_year_deadlines` | `<formName>_records` (bulk EN + async HI) |
| `/:formName/export` | GET | `custom_field_schemas`, `<formName>_records`, `departments` | — |
| `/:formName/export/sample` | GET | `custom_field_schemas` | — |

### Department Forms (`/api/department-forms`)

| Endpoint | Method | Tables Read | Tables Written |
|---|---|---|---|
| `/` | GET | `department_table_list`, `department_form_year_mapping`, `department_form_deadline_config`, `department_form_roles` | — |
| `/assigned` | GET | `department_table_list`, `department_form_year_mapping`, `department_form_deadline_config`, `department_form_roles` | — |
| `/:id/schema` | GET | `department_table_list` | — |
| `/:id/roles` | GET | `department_form_roles` | — |
| `/` | POST | — | `department_table_list`, `department_form_year_mapping`, `department_form_deadline_config`, `department_form_roles`, `dept_form_<slug>` (CREATE+ALTER) |
| `/:id/schema` | PUT | `department_table_list` | `department_table_list`, `dept_form_<slug>` (ALTER) |
| `/:id/roles` | PUT | — | `department_form_roles` (DELETE + INSERT) |
| `/:id/deadline` | PUT | — | `department_form_deadline_config` |
| `/:id/lock` | POST | — | `department_form_year_mapping` |
| `/:id/archive` | PATCH | — | `department_form_year_mapping` |
| `/carry-forward` | POST | `department_table_list` | `department_form_year_mapping` |

### Department Form Data (`/api/department-form-data`)

| Endpoint | Method | Tables Read | Tables Written |
|---|---|---|---|
| `/:id/records` | GET | `department_table_list`, `dept_form_<slug>`, `department_form_year_mapping`, `department_form_deadline_config` | — |
| `/:id/records/:recordId/counterpart` | GET | `dept_form_<slug>` | — |
| `/:id/records` | POST | `department_table_list`, `department_form_year_mapping`, `department_form_deadline_config` | `dept_form_<slug>` (EN + HI) |
| `/:id/records/:recordId` | PUT | — | `dept_form_<slug>` (EN + HI) |
| `/:id/records/:recordId` | DELETE | — | `dept_form_<slug>` (EN + HI mirrors) |
| `/:id/export` | GET | `department_table_list`, `dept_form_<slug>` | — |

---

## Quick Reference for Report Module Integration

| What you need | Where to get it |
|---|---|
| List of all form names | `SELECT form_name FROM table_list WHERE $institutionId = ANY(institute_access)` |
| Field definitions for a form | `custom_field_schemas.schema->>'fields'` (active row) |
| All submitted records | `SELECT * FROM <formName>_records WHERE institution_id=$1 AND year=$2 AND (language='en' OR language IS NULL)` |
| Department name for a record | JOIN `departments` on `<formName>_records.department_id = departments.department_id` |
| Submitter name for a record | JOIN `users` on `<formName>_records.created_by = users.id` |
| Check if table exists | `information_schema.tables WHERE table_name = '<formName>_records'` |
| All columns in a records table | `information_schema.columns WHERE table_name = '<formName>_records'` |
| Department form records | `SELECT * FROM dept_form_<deptId>_<formSlug> WHERE academic_year=$1 AND (language='en' OR language IS NULL)` |
| All dept form tables | `information_schema.tables WHERE table_name LIKE 'dept_form_%'` |
