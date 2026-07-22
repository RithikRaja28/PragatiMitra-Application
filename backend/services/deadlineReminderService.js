"use strict";

/**
 * services/deadlineReminderService.js
 * ─────────────────────────────────────────────────────────────────────────
 * Daily scheduler that sends deadline reminder emails for:
 *   • Institute forms  (form_lock_config + form_year_deadlines)
 *   • Department forms (department_form_deadline_config)
 *
 * Reminder windows: 7 days, 3 days, 1 day, deadline day (0 days).
 * Deduplication: form_deadline_reminder_log — ON CONFLICT DO NOTHING.
 *
 * Recipients mirror the corresponding form_created notification:
 *   • Institute form  → Institute Admins of the creator institution
 *   • Department form → Users in the dept with the configured form roles
 *                       (falls back to Dept Admins when no roles set)
 */

const logger     = require("../utils/logger");
const { enqueueEmail } = require("./mailService");

const REMINDER_DAYS    = [7, 3, 1, 0];
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/* ── Helpers ── */
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function daysUntil(deadlineAt) {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineAt); deadline.setHours(0, 0, 0, 0);
  return Math.round((deadline - today) / (1000 * 60 * 60 * 24));
}

/* Insert a log row — returns true only when the row did not already exist.
   The UNIQUE constraint prevents duplicate sends even under concurrent ticks. */
async function logReminder(pool, { formKey, reminderType, recipientEmail }) {
  const { rowCount } = await pool.query(
    `INSERT INTO form_deadline_reminder_log (form_key, reminder_type, recipient_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (form_key, reminder_type, recipient_email) DO NOTHING`,
    [formKey, reminderType, recipientEmail]
  );
  return rowCount > 0;
}

/* ── Recipient resolvers ── */
async function getInstituteAdmins(pool, institutionId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.full_name, u.email
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id        = ur.role_id
     WHERE u.institution_id = $1
       AND u.account_status = 'ACTIVE'
       AND r.name           = 'institute_admin'
       AND ur.revoked_at IS NULL
       AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
    [institutionId]
  );
  return rows;
}

async function getDeptFormRecipients(pool, deptFormId, departmentId, institutionId) {
  const { rows: roleRows } = await pool.query(
    `SELECT role_name FROM department_form_roles WHERE department_form_id = $1`,
    [deptFormId]
  );

  if (roleRows.length > 0) {
    const roles = roleRows.map((r) => r.role_name);
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r       ON r.id        = ur.role_id
       WHERE u.department_id  = $1
         AND u.institution_id = $2
         AND u.account_status = 'ACTIVE'
         AND r.name           = ANY($3::text[])
         AND ur.revoked_at IS NULL
         AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
      [departmentId, institutionId, roles]
    );
    return rows;
  }

  // No roles configured — fall back to Dept Admins
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.full_name, u.email
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id        = ur.role_id
     WHERE u.department_id  = $1
       AND u.institution_id = $2
       AND u.account_status = 'ACTIVE'
       AND r.name           = 'department_admin'
       AND ur.revoked_at IS NULL
       AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
    [departmentId, institutionId]
  );
  return rows;
}

/* ── Institute form reminder job ── */
async function runInstituteFormReminders(pool) {
  const loginUrl = process.env.APP_LOGIN_URL || "http://localhost:5173/login";

  // Form-wide deadlines (form_lock_config)
  const { rows: flcRows } = await pool.query(`
    SELECT flc.form_name,
           flc.institution_id,
           flc.deadline_at,
           NULL::integer     AS academic_year,
           i.institution_name
    FROM form_lock_config flc
    JOIN institutions i ON i.institution_id = flc.institution_id
    WHERE flc.deadline_at IS NOT NULL
      AND flc.is_locked    = false
      AND flc.auto_locked  = false
      AND flc.deadline_at::date IN (
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '1 day',
        CURRENT_DATE + INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '7 days'
      )
  `);

  // Per-year deadline overrides (form_year_deadlines)
  const { rows: fydRows } = await pool.query(`
    SELECT fyd.form_name,
           fyd.institution_id,
           fyd.deadline_at,
           fyd.academic_year,
           i.institution_name
    FROM form_year_deadlines fyd
    JOIN institutions i ON i.institution_id = fyd.institution_id
    WHERE fyd.deadline_at IS NOT NULL
      AND fyd.is_locked    = false
      AND fyd.auto_locked  = false
      AND fyd.deadline_at::date IN (
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '1 day',
        CURRENT_DATE + INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '7 days'
      )
  `);

  let sent = 0;

  for (const form of [...flcRows, ...fydRows]) {
    const days = daysUntil(form.deadline_at);
    if (!REMINDER_DAYS.includes(days)) continue;

    const rType   = `${days}d`;
    const formKey = form.academic_year
      ? `inst-yr:${form.form_name}:${form.institution_id}:${form.academic_year}`
      : `inst:${form.form_name}:${form.institution_id}`;

    const academicYear = form.academic_year
      ? `${form.academic_year}-${form.academic_year + 1}`
      : "N/A";

    const recipients = await getInstituteAdmins(pool, form.institution_id);

    for (const r of recipients) {
      const inserted = await logReminder(pool, { formKey, reminderType: rType, recipientEmail: r.email });
      if (!inserted) continue;

      await enqueueEmail(pool, {
        eventId:         "form_deadline_reminder",
        recipientEmail:  r.email,
        recipientUserId: r.id,
        payload: {
          full_name:        r.full_name,
          form_name:        form.form_name,
          academic_year:    academicYear,
          institution_name: form.institution_name,
          department_name:  null,
          deadline:         fmtDate(form.deadline_at),
          days_remaining:   days,
          form_type:        "Institute Form",
          login_url:        loginUrl,
        },
      });
      sent++;
    }
  }

  return sent;
}

/* ── Department form reminder job ── */
async function runDeptFormReminders(pool) {
  const loginUrl = process.env.APP_LOGIN_URL || "http://localhost:5173/login";

  const { rows: deptForms } = await pool.query(`
    SELECT ddc.department_form_id,
           ddc.institution_id,
           ddc.department_id,
           ddc.academic_year,
           ddc.deadline_at,
           dtl.form_name,
           d.name            AS department_name,
           i.institution_name
    FROM department_form_deadline_config ddc
    JOIN department_table_list dtl ON dtl.id               = ddc.department_form_id
    JOIN departments           d   ON d.department_id      = ddc.department_id
    JOIN institutions          i   ON i.institution_id     = ddc.institution_id
    LEFT JOIN department_form_lock_config lc
           ON lc.department_form_id = ddc.department_form_id
    WHERE ddc.deadline_at IS NOT NULL
      AND COALESCE(lc.is_locked, false) = false
      AND ddc.deadline_at::date IN (
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '1 day',
        CURRENT_DATE + INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '7 days'
      )
  `);

  let sent = 0;

  for (const form of deptForms) {
    const days = daysUntil(form.deadline_at);
    if (!REMINDER_DAYS.includes(days)) continue;

    const rType      = `${days}d`;
    const formKey    = `dept:${form.department_form_id}:${form.academic_year}`;
    const academicYear = `${form.academic_year}-${form.academic_year + 1}`;

    const recipients = await getDeptFormRecipients(
      pool, form.department_form_id, form.department_id, form.institution_id
    );

    for (const r of recipients) {
      const inserted = await logReminder(pool, { formKey, reminderType: rType, recipientEmail: r.email });
      if (!inserted) continue;

      await enqueueEmail(pool, {
        eventId:         "form_deadline_reminder",
        recipientEmail:  r.email,
        recipientUserId: r.id,
        payload: {
          full_name:        r.full_name,
          form_name:        form.form_name,
          academic_year:    academicYear,
          institution_name: form.institution_name,
          department_name:  form.department_name,
          deadline:         fmtDate(form.deadline_at),
          days_remaining:   days,
          form_type:        "Department Form",
          login_url:        loginUrl,
        },
      });
      sent++;
    }
  }

  return sent;
}

/* ── Main tick ── */
async function runDeadlineReminders(pool) {
  try {
    const instSent = await runInstituteFormReminders(pool);
    const deptSent = await runDeptFormReminders(pool);
    const total    = instSent + deptSent;
    if (total > 0) {
      logger.info(`deadlineReminder: queued ${total} reminder(s) — ${instSent} institute, ${deptSent} dept`);
    }
    return total;
  } catch (err) {
    logger.error("deadlineReminder: tick failed", { stack: err.stack });
    return 0;
  }
}

/* ── Start daily scheduler ── */
function startDeadlineReminderJob(pool) {
  logger.info("deadlineReminder: started — runs every 24 hours");
  runDeadlineReminders(pool); // run once immediately to catch any backlog
  const timer = setInterval(() => runDeadlineReminders(pool), POLL_INTERVAL_MS);
  timer.unref(); // don't hold the process open
  return timer;
}

module.exports = { runDeadlineReminders, startDeadlineReminderJob };
