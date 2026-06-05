"use strict";

/**
 * routes/academicYear.js  →  mounted at /api/academic-years
 * ─────────────────────────────────────────────────────────────
 * Academic-Year-aware form lifecycle management (Phase 1).
 *
 * Status model (per institution + academic year), stored in
 * academic_year_form_config:
 *   active   → form id in active_forms_json
 *   archived → form id in archived_forms_json
 *   disabled → form id in disabled (jsonb array)
 *
 * Open / Close (submission gating) is NOT duplicated here — it reuses the
 * existing form_lock_config (locked = Closed). The settings UI calls the
 * existing /api/forms/:formName/lock|unlock endpoints for that.
 *
 * Shared forms (table_list.share_table = true): when a form's lifecycle is set
 * for a year, the same classification is propagated to every linked institution
 * (table_list.institute_access) for the same academic year. Forms are never
 * duplicated — only their id is referenced.
 */

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const logger = require("../utils/logger");
const { formatAcademicYear, parseStartYear } = require("../services/academicYearService");
const { sendAcademicYearActivatedEmail } = require("../services/mailService");

const router = express.Router();
router.use(verifyToken);

const MANAGE_ROLES = ["super_admin", "institute_admin"];

/* ── institution scope (same rule as forms.js) ── */
async function resolveInstitutionId(pool, req) {
  const isSuperAdmin = (req.user.roles || []).includes("super_admin");
  if (isSuperAdmin) return req.body.institution_id || req.query.institution_id || null;
  const { rows } = await pool.query(
    "SELECT institution_id FROM users WHERE id = $1",
    [req.user.userId]
  );
  return rows[0]?.institution_id || null;
}

/* All forms accessible to an institution (same access filter as institution-forms). */
async function getInstitutionForms(pool, institutionId) {
  const { rows } = await pool.query(
    `SELECT tl.id, tl.form_name, COALESCE(tl.share_table, false) AS share_table,
            COALESCE(tl.institute_access, '{}'::uuid[]) AS institute_access
     FROM table_list tl
     WHERE $1::uuid = ANY(COALESCE(tl.institute_access, '{}'::uuid[]))
     ORDER BY tl.form_name`,
    [institutionId]
  );
  return rows;
}

/* Read the form-config row for (institution, year); returns null if none. */
async function getConfig(pool, institutionId, academicYear) {
  const { rows } = await pool.query(
    `SELECT * FROM academic_year_form_config
     WHERE institution_id = $1 AND academic_year = $2`,
    [institutionId, academicYear]
  );
  return rows[0] || null;
}

/* Normalise a jsonb id list to an array of strings. */
function idList(json) {
  if (!Array.isArray(json)) return [];
  return json.map((x) => String(x));
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/academic-years
   List every academic year the institution has created (newest first),
   each with its active flag.
─────────────────────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.json({ success: true, years: [] });

    const { rows } = await pool.query(
      `SELECT id, academic_year, start_year, active,
              COALESCE(is_locked, false) AS is_locked,
              COALESCE(is_archived, false) AS is_archived,
              locked_at, archived_at, created_at
       FROM academic_year_master
       WHERE institution_id = $1
       ORDER BY start_year DESC`,
      [institutionId]
    );
    return res.json({ success: true, years: rows });
  } catch (err) {
    logger.error("GET /api/academic-years", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load academic years." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/academic-years/current
   The institution's currently-active academic year (or null).
─────────────────────────────────────────────────────────────────────── */
router.get("/current", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId) return res.json({ success: true, current: null });

    const { rows } = await pool.query(
      `SELECT id, academic_year, start_year, active,
              COALESCE(is_locked, false) AS is_locked,
              COALESCE(is_archived, false) AS is_archived,
              locked_at, archived_at, created_at
       FROM academic_year_master
       WHERE institution_id = $1 AND active = true
       ORDER BY start_year DESC
       LIMIT 1`,
      [institutionId]
    );
    return res.json({ success: true, current: rows[0] || null });
  } catch (err) {
    logger.error("GET /api/academic-years/current", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load current year." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/academic-years/preview?startYear=2025
   Create-new-year review screen. Computes the label ("2025–2026") and loads
   the PREVIOUS year's form classification so the admin can confirm/adjust:
     previouslyActive   → checked by default  → active in the new year
     previouslyArchived → unchecked           → archived in the new year
   When there is no previous config (first year ever), every accessible form is
   treated as "previously active".
─────────────────────────────────────────────────────────────────────── */
router.get("/preview", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const startYear = Number(req.query.startYear);
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100)
      return res.status(400).json({ success: false, message: "A valid start year is required." });

    const academicYear = formatAcademicYear(startYear);

    const existing = await getConfig(pool, institutionId, academicYear);
    const alreadyExists = !!existing;

    const prevYear   = formatAcademicYear(startYear - 1);
    const prevConfig = await getConfig(pool, institutionId, prevYear);

    const forms = await getInstitutionForms(pool, institutionId);
    const byId  = new Map(forms.map((f) => [String(f.id), f]));

    let activeIds, archivedIds;
    if (prevConfig) {
      activeIds   = idList(prevConfig.active_forms_json).filter((id) => byId.has(id));
      archivedIds = idList(prevConfig.archived_forms_json).filter((id) => byId.has(id));
    } else {
      // No history → everything accessible counts as "previously active".
      activeIds   = forms.map((f) => String(f.id));
      archivedIds = [];
    }

    const toForm = (id) => {
      const f = byId.get(id);
      return f ? { id: String(f.id), form_name: f.form_name, share_table: f.share_table } : null;
    };

    return res.json({
      success: true,
      academicYear,
      startYear,
      previousYear: prevConfig ? prevYear : null,
      alreadyExists,
      previouslyActive:   activeIds.map(toForm).filter(Boolean),
      previouslyArchived: archivedIds.map(toForm).filter(Boolean),
    });
  } catch (err) {
    logger.error("GET /api/academic-years/preview", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to build preview." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/academic-years
   Body: { startYear, activeFormIds: [], archivedFormIds: [], makeCurrent? }
   Creates the master row + form-config row for the new year, flags it as the
   institution's current year, and propagates shared forms to linked
   institutions for the same academic year.
─────────────────────────────────────────────────────────────────────── */
router.post("/", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { startYear, activeFormIds = [], archivedFormIds = [], makeCurrent = true } = req.body || {};

  if (!Number.isInteger(Number(startYear)))
    return res.status(400).json({ success: false, message: "A valid start year is required." });

  const academicYear = formatAcademicYear(Number(startYear));
  const createdBy = req.user.userId || null;

  const client = await pool.connect();
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    // Validate the supplied ids against forms actually accessible to this institution.
    const forms = await getInstitutionForms(pool, institutionId);
    const valid = new Set(forms.map((f) => String(f.id)));
    const active   = [...new Set(activeFormIds.map(String).filter((id) => valid.has(id)))];
    const archived = [...new Set(archivedFormIds.map(String).filter((id) => valid.has(id) && !active.includes(id)))];

    await client.query("BEGIN");

    // Master row — create (or reuse) and optionally make it current.
    const { rows: masterRows } = await client.query(
      `INSERT INTO academic_year_master (institution_id, academic_year, start_year, active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (institution_id, academic_year)
       DO UPDATE SET active = EXCLUDED.active OR academic_year_master.active
       RETURNING id`,
      [institutionId, academicYear, Number(startYear), !!makeCurrent, createdBy]
    );

    if (makeCurrent) {
      await client.query(
        `UPDATE academic_year_master SET active = (academic_year = $2)
         WHERE institution_id = $1`,
        [institutionId, academicYear]
      );
    }

    // Form-config row for this institution + year.
    await client.query(
      `INSERT INTO academic_year_form_config
         (institution_id, academic_year, active_forms_json, archived_forms_json, created_by, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
       ON CONFLICT (institution_id, academic_year)
       DO UPDATE SET active_forms_json = EXCLUDED.active_forms_json,
                     archived_forms_json = EXCLUDED.archived_forms_json,
                     updated_at = now()`,
      [institutionId, academicYear, JSON.stringify(active), JSON.stringify(archived), createdBy]
    );

    // Shared-form propagation: mirror each shared form's classification into the
    // same academic year for every other linked institution.
    await propagateSharedForms(client, {
      forms, active, archived, academicYear, startYear: Number(startYear), createdBy, selfInstitution: institutionId,
    });

    await client.query("COMMIT");

    // Fire-and-forget activation email to all department HODs / Nodal Officers.
    // Async, never blocks the response; each send is retried and audit-logged.
    notifyAcademicYearActivated(pool, { institutionId, academicYear, activeFormsCount: active.length });

    return res.json({ success: true, academicYear, masterId: masterRows[0]?.id, activeCount: active.length, archivedCount: archived.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/academic-years", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create academic year." });
  } finally {
    client.release();
  }
});

/* ─────────────────────────────────────────────────────────────────────
   notifyAcademicYearActivated — async email fan-out + audit logging.
   Recipients: every ACTIVE Head of Department / Nodal Officer in the
   institution (resolved from user_roles — never hardcoded). Each email is
   retried once on failure and written to academic_year_notification_logs.
─────────────────────────────────────────────────────────────────────── */
function notifyAcademicYearActivated(pool, { institutionId, academicYear, activeFormsCount }) {
  setImmediate(async () => {
    try {
      const { rows: instRows } = await pool.query(
        `SELECT institution_name FROM institutions WHERE institution_id = $1`,
        [institutionId]
      );
      const institutionName = instRows[0]?.institution_name || "Your Institution";

      // Department leads under this institution: Head of Department, Nodal
      // Officer, and Department Admin (the department head in practice).
      const { rows: recipients } = await pool.query(
        `SELECT DISTINCT u.email
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r       ON r.id = ur.role_id
         WHERE u.institution_id = $1
           AND u.account_status = 'ACTIVE'
           AND u.email IS NOT NULL
           AND r.name IN ('head_of_department', 'nodal_officer', 'department_admin')`,
        [institutionId]
      );

      for (const { email } of recipients) {
        let ok = false, lastErr = null;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            await sendAcademicYearActivatedEmail({ to: email, institutionName, academicYear, activeFormsCount });
            ok = true;
          } catch (e) {
            lastErr = e.message || String(e);
          }
        }
        await pool.query(
          `INSERT INTO academic_year_notification_logs
             (institution_id, academic_year, recipient, status, sent_at, error)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [institutionId, academicYear, email, ok ? "sent" : "failed", ok ? new Date() : null, ok ? null : lastErr]
        );
      }
      logger.info(`Academic year ${academicYear} activation emails processed for ${recipients.length} recipient(s).`);
    } catch (err) {
      logger.error("notifyAcademicYearActivated failed", { stack: err.stack });
    }
  });
}

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/academic-years/:academicYear/lock   Body: { locked: boolean }
   Institution-scoped view-only toggle. Only this institution's row changes.
─────────────────────────────────────────────────────────────────────── */
router.patch("/:academicYear/lock", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  const locked = req.body?.locked !== false; // default → lock
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rowCount } = await pool.query(
      `UPDATE academic_year_master
       SET is_locked = $3,
           locked_at = CASE WHEN $3 THEN now() ELSE NULL END,
           locked_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       WHERE institution_id = $1 AND academic_year = $2`,
      [institutionId, academicYear, locked, req.user.userId || null]
    );
    if (!rowCount)
      return res.status(404).json({ success: false, message: "Academic year not found." });

    return res.json({ success: true, academicYear, is_locked: locked });
  } catch (err) {
    logger.error("PATCH /api/academic-years/:academicYear/lock", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update lock state." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/academic-years/:academicYear/archive  Body: { archived: boolean }
   Hides the year from the top bar / create / reports (records preserved).
─────────────────────────────────────────────────────────────────────── */
router.patch("/:academicYear/archive", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  const archived = req.body?.archived !== false; // default → archive
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rowCount } = await pool.query(
      `UPDATE academic_year_master
       SET is_archived = $3,
           archived_at = CASE WHEN $3 THEN now() ELSE NULL END,
           archived_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
           active = CASE WHEN $3 THEN false ELSE active END
       WHERE institution_id = $1 AND academic_year = $2`,
      [institutionId, academicYear, archived, req.user.userId || null]
    );
    if (!rowCount)
      return res.status(404).json({ success: false, message: "Academic year not found." });

    return res.json({ success: true, academicYear, is_archived: archived });
  } catch (err) {
    logger.error("PATCH /api/academic-years/:academicYear/archive", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update archive state." });
  }
});

/* Propagate shared forms (share_table = true) into linked institutions for the
   same academic year. Each linked institution gets a form-config row (created if
   absent) with the shared form placed into the matching active/archived list.
   A master row is also ensured (inactive — the linked institution keeps its own
   current-year choice). Non-shared forms are ignored. */
async function propagateSharedForms(client, { forms, active, archived, academicYear, startYear, createdBy, selfInstitution }) {
  const activeSet   = new Set(active);
  const archivedSet = new Set(archived);

  for (const form of forms) {
    if (!form.share_table) continue;
    const fid = String(form.id);
    const isActive   = activeSet.has(fid);
    const isArchived = archivedSet.has(fid);
    if (!isActive && !isArchived) continue;

    const targets = (form.institute_access || [])
      .map(String)
      .filter((inst) => inst && inst !== String(selfInstitution));

    for (const inst of targets) {
      // Ensure a (inactive) master row exists for the linked institution.
      await client.query(
        `INSERT INTO academic_year_master (institution_id, academic_year, start_year, active, created_by)
         VALUES ($1, $2, $3, false, $4)
         ON CONFLICT (institution_id, academic_year) DO NOTHING`,
        [inst, academicYear, startYear, createdBy]
      );
      // Ensure a config row exists, then move the form into the right list.
      await client.query(
        `INSERT INTO academic_year_form_config (institution_id, academic_year, created_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (institution_id, academic_year) DO NOTHING`,
        [inst, academicYear, createdBy]
      );
      const targetList = isActive ? "active_forms_json" : "archived_forms_json";
      const otherList  = isActive ? "archived_forms_json" : "active_forms_json";
      await client.query(
        `UPDATE academic_year_form_config
         SET ${targetList} = (
               SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
               FROM jsonb_array_elements_text(${targetList} || to_jsonb($3::text)) AS e
             ),
             ${otherList} = (
               SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
               FROM jsonb_array_elements_text(${otherList}) AS e
               WHERE e <> $3::text
             ),
             updated_at = now()
         WHERE institution_id = $1 AND academic_year = $2`,
        [inst, academicYear, fid]
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/academic-years/:academicYear/forms
   The lifecycle view for a single year: every accessible form resolved with
   its status (active | archived | disabled; default archived if unseen) and
   its current submission state (open/closed) from form_lock_config.
─────────────────────────────────────────────────────────────────────── */
router.get("/:academicYear/forms", async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const forms  = await getInstitutionForms(pool, institutionId);
    const config = await getConfig(pool, institutionId, academicYear);

    const activeSet   = new Set(idList(config?.active_forms_json));
    const archivedSet = new Set(idList(config?.archived_forms_json));
    const disabledSet = new Set(idList(config?.disabled));

    // Lock state (Closed = locked) for these forms in this institution.
    const { rows: lockRows } = await pool.query(
      `SELECT form_name, COALESCE(is_locked, false) AS is_locked
       FROM form_lock_config WHERE institution_id = $1`,
      [institutionId]
    );
    const lockByName = new Map(lockRows.map((r) => [r.form_name, r.is_locked]));

    const out = forms.map((f) => {
      const id = String(f.id);
      let status = "archived";
      if (disabledSet.has(id)) status = "disabled";
      else if (activeSet.has(id)) status = "active";
      else if (archivedSet.has(id)) status = "archived";
      else if (!config) status = "archived"; // no config yet → treat as archived
      const isClosed = lockByName.get(f.form_name) === true;
      return {
        id,
        form_name: f.form_name,
        share_table: f.share_table,
        status,
        submission: isClosed ? "closed" : "open",
      };
    });

    return res.json({ success: true, academicYear, hasConfig: !!config, forms: out });
  } catch (err) {
    logger.error("GET /api/academic-years/:academicYear/forms", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load forms for year." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/academic-years/:academicYear/forms/:formId/status
   Body: { status: "active" | "archived" | "disabled" }
   Moves a form between lifecycle lists for the year (+ shared propagation).
─────────────────────────────────────────────────────────────────────── */
router.patch("/:academicYear/forms/:formId/status", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear, formId } = req.params;
  const { status } = req.body || {};

  if (!["active", "archived", "disabled"].includes(status))
    return res.status(400).json({ success: false, message: "status must be active, archived or disabled." });

  const client = await pool.connect();
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const forms = await getInstitutionForms(pool, institutionId);
    const form  = forms.find((f) => String(f.id) === String(formId));
    if (!form)
      return res.status(404).json({ success: false, message: "Form not accessible to this institution." });

    await client.query("BEGIN");

    // Ensure both master + config rows exist for this year.
    const startYear = parseStartYear(academicYear);
    await client.query(
      `INSERT INTO academic_year_master (institution_id, academic_year, start_year, active, created_by)
       VALUES ($1, $2, $3, false, $4)
       ON CONFLICT (institution_id, academic_year) DO NOTHING`,
      [institutionId, academicYear, startYear, req.user.userId || null]
    );
    await client.query(
      `INSERT INTO academic_year_form_config (institution_id, academic_year, created_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (institution_id, academic_year) DO NOTHING`,
      [institutionId, academicYear, req.user.userId || null]
    );

    await applyStatus(client, institutionId, academicYear, String(formId), status);

    // Shared propagation: mirror the status to linked institutions.
    if (form.share_table) {
      const targets = (form.institute_access || [])
        .map(String)
        .filter((inst) => inst && inst !== String(institutionId));
      for (const inst of targets) {
        await client.query(
          `INSERT INTO academic_year_form_config (institution_id, academic_year, created_by, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (institution_id, academic_year) DO NOTHING`,
          [inst, academicYear, req.user.userId || null]
        );
        await applyStatus(client, inst, academicYear, String(formId), status);
      }
    }

    await client.query("COMMIT");
    return res.json({ success: true, academicYear, formId: String(formId), status });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/academic-years/:academicYear/forms/:formId/status", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update form status." });
  } finally {
    client.release();
  }
});

/* Place `formId` into the list for `status` and remove it from the other two,
   for one (institution, year) config row. */
async function applyStatus(client, institutionId, academicYear, formId, status) {
  const columns = {
    active:   "active_forms_json",
    archived: "archived_forms_json",
    disabled: "disabled",
  };
  const target = columns[status];
  const others = Object.values(columns).filter((c) => c !== target);

  // Add to target (distinct), remove from the other two.
  await client.query(
    `UPDATE academic_year_form_config
     SET ${target} = (
           SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${target} || to_jsonb($3::text)) AS e
         ),
         ${others[0]} = (
           SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${others[0]}) AS e WHERE e <> $3::text
         ),
         ${others[1]} = (
           SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements_text(${others[1]}) AS e WHERE e <> $3::text
         ),
         updated_at = now()
     WHERE institution_id = $1 AND academic_year = $2`,
    [institutionId, academicYear, formId]
  );
}

/* ─────────────────────────────────────────────────────────────────────
   PATCH /api/academic-years/:academicYear/activate
   Make the given year the institution's current (active) academic year.
─────────────────────────────────────────────────────────────────────── */
router.patch("/:academicYear/activate", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rowCount } = await pool.query(
      `UPDATE academic_year_master SET active = (academic_year = $2)
       WHERE institution_id = $1`,
      [institutionId, academicYear]
    );
    if (!rowCount)
      return res.status(404).json({ success: false, message: "No academic years to activate." });

    return res.json({ success: true, current: academicYear });
  } catch (err) {
    logger.error("PATCH /api/academic-years/:academicYear/activate", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to set current year." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/academic-years/:academicYear/notifications
   Activation-email audit for this institution + year (for the Mail Status UI):
   per-recipient status (sent/failed) + a rollup summary.
─────────────────────────────────────────────────────────────────────── */
router.get("/:academicYear/notifications", async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rows } = await pool.query(
      `SELECT recipient, status, error, sent_at, created_at
       FROM academic_year_notification_logs
       WHERE institution_id = $1 AND academic_year = $2
       ORDER BY created_at DESC`,
      [institutionId, academicYear]
    );
    const summary = {
      total:  rows.length,
      sent:   rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
    return res.json({ success: true, academicYear, summary, logs: rows });
  } catch (err) {
    logger.error("GET /api/academic-years/:academicYear/notifications", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to load notification status." });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/academic-years/:academicYear/notifications/retry
   Re-sends ONLY the failed activation emails for this institution + year and
   updates their log rows. Returns the refreshed summary.
─────────────────────────────────────────────────────────────────────── */
router.post("/:academicYear/notifications/retry", requireRole(MANAGE_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const { academicYear } = req.params;
  try {
    const institutionId = await resolveInstitutionId(pool, req);
    if (!institutionId)
      return res.status(400).json({ success: false, message: "Institution ID required." });

    const { rows: failed } = await pool.query(
      `SELECT id, recipient FROM academic_year_notification_logs
       WHERE institution_id = $1 AND academic_year = $2 AND status = 'failed'`,
      [institutionId, academicYear]
    );

    if (failed.length) {
      const { rows: instRows } = await pool.query(
        `SELECT institution_name FROM institutions WHERE institution_id = $1`,
        [institutionId]
      );
      const institutionName = instRows[0]?.institution_name || "Your Institution";
      const { rows: cfgRows } = await pool.query(
        `SELECT active_forms_json FROM academic_year_form_config
         WHERE institution_id = $1 AND academic_year = $2`,
        [institutionId, academicYear]
      );
      const activeFormsCount = Array.isArray(cfgRows[0]?.active_forms_json)
        ? cfgRows[0].active_forms_json.length : 0;

      for (const row of failed) {
        let ok = false, errMsg = null;
        try {
          await sendAcademicYearActivatedEmail({ to: row.recipient, institutionName, academicYear, activeFormsCount });
          ok = true;
        } catch (e) { errMsg = e.message || String(e); }
        await pool.query(
          `UPDATE academic_year_notification_logs
           SET status = $2, sent_at = $3, error = $4 WHERE id = $1`,
          [row.id, ok ? "sent" : "failed", ok ? new Date() : null, ok ? null : errMsg]
        );
      }
    }

    const { rows: all } = await pool.query(
      `SELECT status FROM academic_year_notification_logs
       WHERE institution_id = $1 AND academic_year = $2`,
      [institutionId, academicYear]
    );
    const summary = {
      total:  all.length,
      sent:   all.filter((r) => r.status === "sent").length,
      failed: all.filter((r) => r.status === "failed").length,
    };
    return res.json({ success: true, retried: failed.length, summary });
  } catch (err) {
    logger.error("POST /api/academic-years/:academicYear/notifications/retry", { stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to retry notifications." });
  }
});

module.exports = router;
