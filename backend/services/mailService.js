"use strict";

const nodemailer = require("nodemailer");
const fs         = require("fs");
const path       = require("path");
const logger     = require("../utils/logger");

/* ═══════════════════════════════════════════════════════════════════
   TRANSPORT & HELPERS
═══════════════════════════════════════════════════════════════════ */

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function resolveTokens(str = "", data = {}) {
  let out = str;
  Object.entries(data).forEach(([key, value]) => {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value ?? "");
    out = out.replace(new RegExp(`\\{${key}\\}`,       "g"), value ?? "");
  });
  return out;
}

function loadNotificationLayout(templateData = {}) {
  const layoutPath = path.join(__dirname, "../templates/notification.html");
  if (!fs.existsSync(layoutPath)) throw new Error(`Notification layout not found: ${layoutPath}`);
  let html = fs.readFileSync(layoutPath, "utf-8");
  Object.entries(templateData).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g"), value ?? "");
  });
  return html;
}

function _detailRow(label, value) {
  return `<tr><td style="padding:14px 24px;border-bottom:1px solid #f1f5f9;">` +
    `<div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${label}</div>` +
    `<div style="font-size:14px;font-weight:600;color:#1e293b;">${value}</div>` +
    `</td></tr>`;
}

function _detailsTable(rows) {
  if (!rows || !rows.length) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px;">` +
    `<tr><td style="padding:14px 24px;border-bottom:1px solid #e2e8f0;">` +
    `<span style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Details</span>` +
    `</td></tr>${rows.map(([l, v]) => _detailRow(l, v)).join("")}</table>`;
}

function _ctaButton(url, label = "Log In to Your Account →") {
  if (!url) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td align="center">` +
    `<a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:50px;letter-spacing:0.3px;">${label}</a>` +
    `</td></tr></table>`;
}

async function getTemplateFromDB(pool, eventId) {
  const { rows } = await pool.query(
    `SELECT email_subject, email_body, email_enabled, app_message, app_enabled
     FROM notification_templates WHERE event_id = $1`,
    [eventId]
  );
  if (!rows.length) throw new Error(`No DB template found for event: ${eventId}`);
  return rows[0];
}

async function sendMail({ to, subject, html }) {
  const transport = createTransport();
  return transport.sendMail({
    from: {
      name:    process.env.SMTP_FROM_NAME  || "AIIA",
      address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    },
    to, subject, html,
  });
}

async function insertNotification(pool, { userId, eventId, title, message }) {
  if (!userId) {
    logger.error(`insertNotification: userId is null — skipping event=${eventId}`);
    return;
  }
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, event_id, title, message) VALUES ($1, $2, $3, $4)`,
      [userId, eventId, title, message]
    );
    logger.info(`insertNotification OK: event=${eventId} userId=${userId}`);
  } catch (err) {
    logger.error(`insertNotification FAILED: event=${eventId} userId=${userId}: ${err.message}`);
  }
}

async function resolveUserId(pool, userId, email) {
  if (userId) return userId;
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
  return rows[0]?.id ?? null;
}

/* Shared token defaults used by every email function */
function baseTokens(overrides = {}) {
  return {
    AppName:       process.env.APP_NAME          || "Pragati Mitra",
    APP_NAME:      process.env.APP_NAME          || "Pragati Mitra",
    SUPPORT_EMAIL: process.env.MAIL_SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    LOGIN_URL:     process.env.APP_LOGIN_URL      || "http://localhost:5173/login",
    LoginURL:      process.env.APP_LOGIN_URL      || "http://localhost:5173/login",
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   NAMED EMAIL FUNCTIONS  (called by the queue worker)
═══════════════════════════════════════════════════════════════════ */

async function sendWelcomeEmail(pool, { full_name, email, password, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "user_created");
  const tokens = baseTokens({
    UserName:           full_name,
    FULL_NAME:          full_name,
    Email:              email,
    EMAIL:              email,
    TempPassword:       password,
    TEMPORARY_PASSWORD: password,
    LoginURL:           login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:          login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject    = resolveTokens(tmpl.email_subject, tokens);
    const introText  = resolveTokens(tmpl.email_body, tokens);
    const detailsHtml =
      `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px;">` +
      `<tr><td style="padding:14px 24px;border-bottom:1px solid #e2e8f0;"><span style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Your Login Details</span></td></tr>` +
      `<tr><td style="padding:16px 24px;border-bottom:1px solid #f1f5f9;"><table cellpadding="0" cellspacing="0" width="100%"><tr>` +
      `<td width="54" style="vertical-align:middle;padding-right:16px;"><div style="width:38px;height:38px;background:#dbeafe;border-radius:10px;text-align:center;line-height:38px;font-size:18px;">&#128100;</div></td>` +
      `<td style="vertical-align:middle;"><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Full Name</div><div style="font-size:14px;font-weight:600;color:#1e293b;">${full_name}</div></td>` +
      `</tr></table></td></tr>` +
      `<tr><td style="padding:16px 24px;border-bottom:1px solid #f1f5f9;"><table cellpadding="0" cellspacing="0" width="100%"><tr>` +
      `<td width="54" style="vertical-align:middle;padding-right:16px;"><div style="width:38px;height:38px;background:#ede9fe;border-radius:10px;text-align:center;line-height:38px;font-size:18px;">&#9993;</div></td>` +
      `<td style="vertical-align:middle;"><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Email Address</div><div style="font-size:14px;font-weight:600;color:#1e293b;">${email}</div></td>` +
      `</tr></table></td></tr>` +
      `<tr><td style="padding:16px 24px;"><table cellpadding="0" cellspacing="0" width="100%"><tr>` +
      `<td width="54" style="vertical-align:middle;padding-right:16px;"><div style="width:38px;height:38px;background:#fef3c7;border-radius:10px;text-align:center;line-height:38px;font-size:18px;">&#128273;</div></td>` +
      `<td style="vertical-align:middle;"><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Temporary Password</div>` +
      `<div style="font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:5px 12px;display:inline-block;letter-spacing:2px;">${password}</div></td>` +
      `</tr></table></td></tr>` +
      `</table>` +
      `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:10px;margin-bottom:32px;">` +
      `<tr><td style="padding:16px 18px;"><table cellpadding="0" cellspacing="0" width="100%"><tr>` +
      `<td width="34" style="vertical-align:top;padding-right:12px;font-size:22px;line-height:1;color:#f59e0b;">&#9888;</td>` +
      `<td style="vertical-align:top;"><div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:5px;">Important Security Notice</div>` +
      `<div style="font-size:13px;color:#78350f;line-height:1.55;">This is a one-time temporary password. You will be required to set a new password immediately after your first login. Do not share these credentials with anyone.</div></td>` +
      `</tr></table></td></tr></table>`;
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      INTRO_TEXT:      introText,
      HEADER_BADGE:    "Account Created",
      HEADER_TITLE:    "Your account is ready",
      HEADER_SUBTITLE: "Welcome aboard — here are your login credentials",
      DETAILS_HTML:    detailsHtml,
      CTA_HTML:        _ctaButton(tokens.LOGIN_URL, "Log In to Your Account →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "user_created",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

async function sendPasswordResetEmail(pool, { full_name, email, reset_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "password_reset");
  const tokens = baseTokens({
    UserName:  full_name, FULL_NAME: full_name,
    Email:     email,     EMAIL:     email,
    LoginURL:  reset_url, LOGIN_URL: reset_url,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Password Reset",
      HEADER_TITLE:    "Reset Your Password",
      HEADER_SUBTITLE: "Action required to restore your access",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    "",
      CTA_HTML:        _ctaButton(tokens.LOGIN_URL, "Reset My Password →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "password_reset",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

async function sendAccountSuspendedEmail(pool, { full_name, email, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "account_suspended");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name,
    Email:    email,     EMAIL:     email,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Account Suspended",
      HEADER_TITLE:    "Your Account Has Been Suspended",
      HEADER_SUBTITLE: "Access to Pragati Mitra has been restricted",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    "",
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "account_suspended",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

async function sendAccountReactivatedEmail(pool, { full_name, email, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "account_reactivated");
  const tokens = baseTokens({
    UserName:  full_name, FULL_NAME: full_name,
    Email:     email,     EMAIL:     email,
    LoginURL:  login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL: login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Account Reactivated",
      HEADER_TITLE:    "Your Account Is Active Again",
      HEADER_SUBTITLE: "Welcome back to Pragati Mitra",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    "",
      CTA_HTML:        _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "account_reactivated",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

async function sendRoleUpdatedEmail(pool, { full_name, email, new_role, login_url, userId }) {
  const EVENT  = "user_role_updated";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendRoleUpdatedEmail: template not found: ${err.message}`); return null; }

  const tokens = baseTokens({
    UserName:  full_name, FULL_NAME: full_name,
    Email:     email,     EMAIL:     email,
    NewRole:   new_role,
    LoginURL:  login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL: login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Role Updated",
      HEADER_TITLE:    "Your Role Has Been Updated",
      HEADER_SUBTITLE: "Your access permissions have changed",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["New Role", new_role]]),
      CTA_HTML:        _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    logger.info(`sendRoleUpdatedEmail: inserting notification userId=${uid} email=${email}`);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Department created — notifies Institute Admin(s) of the parent institution ── */
async function sendDepartmentCreatedEmail(pool, { full_name, email, department_name, department_code, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "department_created");
  const tokens = baseTokens({
    UserName:         full_name,     FULL_NAME:        full_name,
    Email:            email,         EMAIL:            email,
    DEPARTMENT_NAME:  department_name,
    DEPARTMENT_CODE:  department_code,
    INSTITUTION_NAME: institution_name,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Department Added",
      HEADER_TITLE:    "New Department Created",
      HEADER_SUBTITLE: "A department has been added to your institution",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Department", department_name],
        ["Code",       department_code],
        ["Institution", institution_name],
      ]),
      CTA_HTML: "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "department_created",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Nodal officer assigned — notifies the officer themselves ── */
async function sendNodalOfficerAssignedEmail(pool, { full_name, email, reporting_year, institution_name, scope, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "nodal_officer_assigned");
  const tokens = baseTokens({
    UserName:         full_name,      FULL_NAME:        full_name,
    Email:            email,          EMAIL:            email,
    REPORTING_YEAR:   reporting_year,
    INSTITUTION_NAME: institution_name,
    SCOPE:            scope,
    LoginURL:         login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:        login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Nodal Officer Assigned",
      HEADER_TITLE:    "You've Been Assigned as Nodal Officer",
      HEADER_SUBTITLE: "Your responsibilities have been updated",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Reporting Year", reporting_year],
        ["Institution",    institution_name],
        ["Scope",          scope],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "nodal_officer_assigned",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Nodal officer removed — notifies the officer when deactivated or deleted ── */
async function sendNodalOfficerRemovedEmail(pool, { full_name, email, reporting_year, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "nodal_officer_removed");
  const tokens = baseTokens({
    UserName:       full_name,     FULL_NAME:      full_name,
    Email:          email,         EMAIL:          email,
    REPORTING_YEAR: reporting_year,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Assignment Removed",
      HEADER_TITLE:    "Nodal Officer Assignment Ended",
      HEADER_SUBTITLE: "Your assignment has been updated",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Reporting Year", reporting_year]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "nodal_officer_removed",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Institution created — notifies the Super Admin creator ── */
async function sendInstitutionCreatedEmail(pool, { full_name, email, institution_name, institution_code, email_domain, city, state, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "institution_created");
  const tokens = baseTokens({
    UserName:         full_name,         FULL_NAME:        full_name,
    Email:            email,             EMAIL:            email,
    INSTITUTION_NAME: institution_name,
    INSTITUTION_CODE: institution_code,
    EMAIL_DOMAIN:     email_domain,
    CITY:             city,
    STATE:            state,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Institution Registered",
      HEADER_TITLE:    "New Institution Added",
      HEADER_SUBTITLE: "The institution has been registered successfully",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Institution",  institution_name],
        ["Code",         institution_code],
        ["Email Domain", email_domain],
        ["Location",     `${city}, ${state}`],
      ]),
      CTA_HTML: "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "institution_created",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Committee created — notifies Institute Admin(s) of the institution ── */
async function sendCommitteeCreatedEmail(pool, { full_name, email, committee_type, finance_year, position, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "committee_created");
  const tokens = baseTokens({
    UserName:         full_name,      FULL_NAME:        full_name,
    Email:            email,          EMAIL:            email,
    COMMITTEE_TYPE:   committee_type,
    FINANCE_YEAR:     finance_year,
    POSITION:         position,
    INSTITUTION_NAME: institution_name,
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Committee Added",
      HEADER_TITLE:    "New Committee Created",
      HEADER_SUBTITLE: "A management committee has been registered",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Type",         committee_type],
        ["Finance Year", finance_year],
        ["Position",     position],
        ["Institution",  institution_name],
      ]),
      CTA_HTML: "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "committee_created",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Nodal officer activated (re-enabled) — notifies the officer ── */
async function sendNodalOfficerActivatedEmail(pool, { full_name, email, reporting_year, institution_name, scope, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "nodal_officer_activated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    REPORTING_YEAR: reporting_year, INSTITUTION_NAME: institution_name, SCOPE: scope,
    LoginURL:  login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL: login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Assignment Restored",
      HEADER_TITLE:    "Nodal Officer Role Reinstated",
      HEADER_SUBTITLE: "Your assignment has been reactivated",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Reporting Year", reporting_year], ["Institution", institution_name], ["Scope", scope]]),
      CTA_HTML:        _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "nodal_officer_activated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Department activated — notifies Institute Admins ── */
async function sendDepartmentActivatedEmail(pool, { full_name, email, department_name, department_code, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "department_activated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    DEPARTMENT_NAME: department_name, DEPARTMENT_CODE: department_code, INSTITUTION_NAME: institution_name,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Department Activated",
      HEADER_TITLE:    "Department Reactivated",
      HEADER_SUBTITLE: "The department is now active",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Department", department_name], ["Code", department_code], ["Institution", institution_name]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "department_activated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Department deactivated — notifies Institute Admins ── */
async function sendDepartmentDeactivatedEmail(pool, { full_name, email, department_name, department_code, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "department_deactivated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    DEPARTMENT_NAME: department_name, DEPARTMENT_CODE: department_code, INSTITUTION_NAME: institution_name,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Department Deactivated",
      HEADER_TITLE:    "Department Deactivated",
      HEADER_SUBTITLE: "The department has been set to inactive",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Department", department_name], ["Code", department_code], ["Institution", institution_name]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "department_deactivated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Institution activated — notifies the acting Super Admin ── */
async function sendInstitutionActivatedEmail(pool, { full_name, email, institution_name, institution_code, city, state, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "institution_activated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    INSTITUTION_NAME: institution_name, INSTITUTION_CODE: institution_code, CITY: city, STATE: state,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Institution Activated",
      HEADER_TITLE:    "Institution Reactivated",
      HEADER_SUBTITLE: "The institution is now active on Pragati Mitra",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Institution", institution_name], ["Code", institution_code], ["Location", `${city}, ${state}`]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "institution_activated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Institution deactivated — notifies the acting Super Admin ── */
async function sendInstitutionDeactivatedEmail(pool, { full_name, email, institution_name, institution_code, city, state, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "institution_deactivated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    INSTITUTION_NAME: institution_name, INSTITUTION_CODE: institution_code, CITY: city, STATE: state,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Institution Deactivated",
      HEADER_TITLE:    "Institution Deactivated",
      HEADER_SUBTITLE: "The institution has been set to inactive",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Institution", institution_name], ["Code", institution_code], ["Location", `${city}, ${state}`]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "institution_deactivated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Committee activated — notifies Institute Admins ── */
async function sendCommitteeActivatedEmail(pool, { full_name, email, committee_type, finance_year, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "committee_activated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    COMMITTEE_TYPE: committee_type, FINANCE_YEAR: finance_year, INSTITUTION_NAME: institution_name,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Committee Activated",
      HEADER_TITLE:    "Committee Reactivated",
      HEADER_SUBTITLE: "The committee record is now active",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Type", committee_type], ["Finance Year", finance_year], ["Institution", institution_name]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "committee_activated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Committee deactivated — notifies Institute Admins ── */
async function sendCommitteeDeactivatedEmail(pool, { full_name, email, committee_type, finance_year, institution_name, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "committee_deactivated");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    COMMITTEE_TYPE: committee_type, FINANCE_YEAR: finance_year, INSTITUTION_NAME: institution_name,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Committee Deactivated",
      HEADER_TITLE:    "Committee Deactivated",
      HEADER_SUBTITLE: "The committee record has been set to inactive",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([["Type", committee_type], ["Finance Year", finance_year], ["Institution", institution_name]]),
      CTA_HTML:        "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "committee_deactivated",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Role created — notifies the Super Admin who created it ── */
async function sendRoleCreatedEmail(pool, { full_name, email, role_name, role_display_name, role_description, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "role_created");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    ROLE_NAME: role_name, ROLE_DISPLAY_NAME: role_display_name,
    ROLE_DESCRIPTION: role_description || "No description provided.",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Role Created",
      HEADER_TITLE:    "New Role Added",
      HEADER_SUBTITLE: "A custom role has been created successfully",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Role Name",    role_display_name],
        ["Identifier",   role_name],
        ["Description",  role_description || "—"],
      ]),
      CTA_HTML: "",
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "role_created",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Institute Form Created — notifies Institute Admins of the creator institution ── */
async function sendInstituteFormCreatedEmail(pool, { full_name, email, form_name, academic_year, institution_name, created_by_name, deadline, is_shared, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "institute_form_created");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    FORM_NAME:        form_name,
    ACADEMIC_YEAR:    academic_year,
    INSTITUTION_NAME: institution_name,
    CREATED_BY:       created_by_name,
    DEADLINE:         deadline || "Not set",
    FORM_TYPE:        is_shared ? "Shared (All Institutions)" : "Private",
    LOGIN_URL:        login_url,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Form Created",
      HEADER_TITLE:    "New Form Available",
      HEADER_SUBTITLE: `${is_shared ? "Shared" : "Private"} form for ${academic_year}`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Form Name",     form_name],
        ["Academic Year", academic_year],
        ["Institution",   institution_name],
        ["Created By",    created_by_name],
        ["Type",          is_shared ? "Shared (All Institutions)" : "Private"],
        ["Deadline",      deadline || "Not set"],
      ]),
      CTA_HTML: _ctaButton(login_url),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "institute_form_created",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Department Form Created — notifies dept role holders (or creator if no roles) ── */
async function sendDepartmentFormCreatedEmail(pool, { full_name, email, form_name, department_name, academic_year, created_by_name, deadline, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "department_form_created");
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    FORM_NAME:        form_name,
    DEPARTMENT_NAME:  department_name,
    ACADEMIC_YEAR:    academic_year,
    CREATED_BY:       created_by_name,
    DEADLINE:         deadline || "Not set",
    LOGIN_URL:        login_url,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Department Form",
      HEADER_TITLE:    "New Form Created",
      HEADER_SUBTITLE: `Form created for ${department_name}`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Form Name",     form_name],
        ["Department",    department_name],
        ["Academic Year", academic_year],
        ["Created By",    created_by_name],
        ["Deadline",      deadline || "Not set"],
      ]),
      CTA_HTML: _ctaButton(login_url),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "department_form_created",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

/* ── Form deadline reminder — sent 7d / 3d / 1d / 0d before deadline ── */
async function sendDeadlineReminderEmail(pool, { full_name, email, form_name, academic_year, institution_name, department_name, deadline, days_remaining, form_type, login_url, userId }) {
  const tmpl  = await getTemplateFromDB(pool, "form_deadline_reminder");
  const badge = days_remaining === 0 ? "Due Today" : `${days_remaining} Day${days_remaining === 1 ? "" : "s"} Left`;
  const tokens = baseTokens({
    UserName: full_name, FULL_NAME: full_name, Email: email, EMAIL: email,
    FORM_NAME:        form_name,
    ACADEMIC_YEAR:    academic_year,
    INSTITUTION_NAME: institution_name || "",
    DEPARTMENT_NAME:  department_name  || "",
    DEADLINE:         deadline,
    DAYS_REMAINING:   String(days_remaining),
    FORM_TYPE:        form_type,
    LOGIN_URL:        login_url,
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    const detailRows = [
      ["Form Name",      form_name],
      ["Academic Year",  academic_year],
      ...(department_name ? [["Department", department_name]] : []),
      ["Type",           form_type],
      ["Deadline",       deadline],
      ["Time Remaining", days_remaining === 0 ? "Due Today" : `${days_remaining} day${days_remaining === 1 ? "" : "s"}`],
    ];
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    badge,
      HEADER_TITLE:    "Form Submission Deadline",
      HEADER_SUBTITLE: `${form_name} — ${deadline}`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable(detailRows),
      CTA_HTML:        _ctaButton(login_url, "Submit Your Form →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, { userId: uid, eventId: "form_deadline_reminder",
      title: resolveTokens(tmpl.email_subject, tokens), message: resolveTokens(tmpl.app_message, tokens) });
  }
}

async function sendAcademicYearActivatedEmail(pool, { full_name, email, institution_name, academic_year, active_forms_count, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "academic_year_activated");
  const tokens = baseTokens({
    UserName:           full_name || "Team",
    FULL_NAME:          full_name || "Team",
    INSTITUTION_NAME:   institution_name,
    ACADEMIC_YEAR:      academic_year,
    ACTIVE_FORMS_COUNT: String(active_forms_count ?? 0),
    LoginURL:           login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:          login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Academic Year",
      HEADER_TITLE:    `Academic Year ${academic_year} Activated`,
      HEADER_SUBTITLE: `${active_forms_count ?? 0} form(s) now available for submission`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Institution",   institution_name],
        ["Academic Year", academic_year],
        ["Active Forms",  String(active_forms_count ?? 0)],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "View Your Forms →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "academic_year_activated",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Form assigned — notifies the contributor who was assigned a form ── */
async function sendFormAssignedEmail(pool, { full_name, email, form_name, academic_year, assigned_by_name, deadline, login_url, userId }) {
  const EVENT = "form_assigned";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendFormAssignedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:        full_name,       FULL_NAME:       full_name,
    Email:           email,           EMAIL:           email,
    FORM_NAME:       form_name,
    ACADEMIC_YEAR:   academic_year,
    ASSIGNED_BY:     assigned_by_name || "Your Department Admin",
    DEADLINE:        deadline || "Not set",
    LoginURL:        login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:       login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Form Assigned",
      HEADER_TITLE:    "A Form Has Been Assigned to You",
      HEADER_SUBTITLE: `Please complete "${form_name}" before the deadline`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Form Name",     form_name],
        ["Academic Year", academic_year],
        ["Assigned By",   assigned_by_name || "Your Department Admin"],
        ["Deadline",      deadline || "Not set"],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "Open Your Forms →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Form locked — notifies contributors that a form is now locked ── */
async function sendFormLockedEmail(pool, { full_name, email, form_name, institution_name, locked_by_name, login_url, userId }) {
  const EVENT = "form_locked";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendFormLockedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:         full_name,       FULL_NAME:        full_name,
    Email:            email,           EMAIL:            email,
    FORM_NAME:        form_name,
    INSTITUTION_NAME: institution_name || "",
    LOCKED_BY:        locked_by_name || "Administrator",
    LoginURL:         login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:        login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Form Locked",
      HEADER_TITLE:    "Form Is Now Locked",
      HEADER_SUBTITLE: `"${form_name}" — no further submissions accepted`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Form Name",   form_name],
        ["Locked By",   locked_by_name || "Administrator"],
        ["Institution", institution_name || ""],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Section submitted for review — notifies the step-1 approver ── */
async function sendFormSubmittedEmail(pool, { full_name, email, section_name, step_name, submitted_by_name, login_url, userId }) {
  const EVENT = "form_submitted";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendFormSubmittedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:       full_name,          FULL_NAME:      full_name,
    Email:          email,              EMAIL:          email,
    SECTION_NAME:   section_name,
    STEP_NAME:      step_name || "Step 1",
    SUBMITTED_BY:   submitted_by_name || "A contributor",
    LoginURL:       login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:      login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Review Requested",
      HEADER_TITLE:    "Section Awaiting Your Review",
      HEADER_SUBTITLE: `${section_name} has been submitted for approval`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Section",      section_name],
        ["Submitted By", submitted_by_name || "A contributor"],
        ["Step",         step_name || "Step 1"],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "Review Now →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Section approved — notifies the section owner ── */
async function sendFormApprovedEmail(pool, { full_name, email, section_name, approved_by_name, login_url, userId }) {
  const EVENT = "form_approved";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendFormApprovedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:        full_name,          FULL_NAME:       full_name,
    Email:           email,              EMAIL:           email,
    SECTION_NAME:    section_name,
    APPROVED_BY:     approved_by_name || "An approver",
    LoginURL:        login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:       login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Approved",
      HEADER_TITLE:    "Your Section Has Been Approved",
      HEADER_SUBTITLE: `"${section_name}" has been approved`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Section",     section_name],
        ["Approved By", approved_by_name || "An approver"],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Section sent back — notifies the section owner to revise ── */
async function sendFormRejectedEmail(pool, { full_name, email, section_name, reviewer_name, comment, login_url, userId }) {
  const EVENT = "form_rejected";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendFormRejectedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:       full_name,         FULL_NAME:      full_name,
    Email:          email,             EMAIL:          email,
    SECTION_NAME:   section_name,
    REVIEWER_NAME:  reviewer_name || "An approver",
    COMMENT:        comment || "Please review and resubmit.",
    LoginURL:       login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:      login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Sent Back",
      HEADER_TITLE:    "Your Section Requires Revision",
      HEADER_SUBTITLE: `"${section_name}" has been sent back for changes`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Section",     section_name],
        ["Reviewed By", reviewer_name || "An approver"],
        ["Feedback",    comment || "Please review and resubmit."],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "Revise & Resubmit →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Report section assigned to a user — notifies the assignee ── */
async function sendSectionAssignedEmail(pool, { full_name, email, section_name, report_name, role, due_at, login_url, userId }) {
  const EVENT = "section_assigned";
  let tmpl;
  try { tmpl = await getTemplateFromDB(pool, EVENT); }
  catch (err) { logger.error(`sendSectionAssignedEmail: template not found: ${err.message}`); return null; }
  const tokens = baseTokens({
    UserName:     full_name,
    FULL_NAME:    full_name,
    Email:        email,
    EMAIL:        email,
    SECTION_NAME: section_name,
    REPORT_NAME:  report_name || "Report",
    ROLE:         role        || "Contributor",
    DUE_AT:       due_at      || "Not set",
    LoginURL:     login_url   || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL:    login_url   || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });
  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body,    tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Section Assigned",
      HEADER_TITLE:    "A Section Has Been Assigned to You",
      HEADER_SUBTITLE: `You have been assigned to edit "${section_name}"`,
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Report",  report_name || "Report"],
        ["Section", section_name],
        ["Role",    role        || "Contributor"],
        ["Due",     due_at      || "Not set"],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "View Section →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ── Bulk import completed — notifies the admin who triggered the import ── */
async function sendImportCompletedEmail(pool, { full_name, email, imported, skipped, failed, total, login_url, userId }) {
  const tmpl   = await getTemplateFromDB(pool, "import_completed");
  const tokens = baseTokens({
    UserName:  full_name, FULL_NAME: full_name,
    Email:     email,     EMAIL:     email,
    IMPORTED:  String(imported),
    SKIPPED:   String(skipped),
    FAILED:    String(failed),
    TOTAL:     String(total),
    LoginURL:  login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
    LOGIN_URL: login_url || process.env.APP_LOGIN_URL || "http://localhost:5173/login",
  });

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body,    tokens);
    await sendMail({ to: email, subject, html: loadNotificationLayout({
      ...tokens,
      HEADER_BADGE:    "Import Complete",
      HEADER_TITLE:    "Bulk User Import Completed",
      HEADER_SUBTITLE: "Your import has been processed",
      INTRO_TEXT:      introText,
      DETAILS_HTML:    _detailsTable([
        ["Imported", String(imported)],
        ["Skipped",  String(skipped)],
        ["Failed",   String(failed)],
        ["Total",    String(total)],
      ]),
      CTA_HTML: _ctaButton(tokens.LOGIN_URL, "View Users →"),
    }) });
  }
  if (tmpl.app_enabled) {
    const uid = await resolveUserId(pool, userId, email);
    await insertNotification(pool, {
      userId: uid, eventId: "import_completed",
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EMAIL QUEUE  —  producer + worker
   Follows the same pattern as formDeadlineService:
     • enqueueEmail()      → inserts a row (called by routes)
     • startEmailWorker()  → polling loop (called once from server.js)
═══════════════════════════════════════════════════════════════════ */

/* ── Queue tuning ── */
const POLL_INTERVAL_MS = 5_000;
const BACKOFF_SECONDS  = [30, 120, 300]; // delay per failed attempt

function _backoffFor(failedAttempts) {
  return BACKOFF_SECONDS[Math.min(failedAttempts - 1, BACKOFF_SECONDS.length - 1)] ?? 300;
}

/* ── Producer: insert a job into email_queue ── */
async function enqueueEmail(pool, { eventId, recipientEmail, recipientUserId = null, payload = {} }) {
  await pool.query(
    `INSERT INTO email_queue (event_id, recipient_email, recipient_user_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [eventId, recipientEmail, recipientUserId, JSON.stringify(payload)]
  );
  logger.info(`enqueueEmail: queued event=${eventId} to=${recipientEmail}`);
}

/* ── Dispatcher: maps event_id → named send function ── */
async function _dispatchJob(pool, job) {
  const { event_id, payload, recipient_email: email, recipient_user_id: userId } = job;

  switch (event_id) {
    case "user_created":
      return sendWelcomeEmail(pool, {
        full_name: payload.full_name, email,
        password:  payload.password,
        login_url: payload.login_url,
        userId,
      });
    case "password_reset":
      return sendPasswordResetEmail(pool, {
        full_name: payload.full_name, email,
        reset_url: payload.reset_url, userId,
      });
    case "account_suspended":
      return sendAccountSuspendedEmail(pool, { full_name: payload.full_name, email, userId });
    case "account_reactivated":
      return sendAccountReactivatedEmail(pool, {
        full_name: payload.full_name, email,
        login_url: payload.login_url, userId,
      });
    case "user_role_updated":
      return sendRoleUpdatedEmail(pool, {
        full_name: payload.full_name, email,
        new_role:  payload.new_role,
        login_url: payload.login_url,
        userId,
      });
    case "academic_year_activated":
      return sendAcademicYearActivatedEmail(pool, {
        full_name:          payload.full_name,
        email,
        institution_name:   payload.institution_name,
        academic_year:      payload.academic_year,
        active_forms_count: payload.active_forms_count,
        login_url:          payload.login_url,
        userId,
      });
    case "department_created":
      return sendDepartmentCreatedEmail(pool, {
        full_name:        payload.full_name,        email,
        department_name:  payload.department_name,
        department_code:  payload.department_code,
        institution_name: payload.institution_name,
        userId,
      });
    case "nodal_officer_assigned":
      return sendNodalOfficerAssignedEmail(pool, {
        full_name:        payload.full_name,        email,
        reporting_year:   payload.reporting_year,
        institution_name: payload.institution_name,
        scope:            payload.scope,
        login_url:        payload.login_url,
        userId,
      });
    case "nodal_officer_removed":
      return sendNodalOfficerRemovedEmail(pool, {
        full_name:      payload.full_name, email,
        reporting_year: payload.reporting_year,
        userId,
      });
    case "institution_created":
      return sendInstitutionCreatedEmail(pool, {
        full_name:        payload.full_name,        email,
        institution_name: payload.institution_name,
        institution_code: payload.institution_code,
        email_domain:     payload.email_domain,
        city:             payload.city,
        state:            payload.state,
        userId,
      });
    case "committee_created":
      return sendCommitteeCreatedEmail(pool, {
        full_name:        payload.full_name,        email,
        committee_type:   payload.committee_type,
        finance_year:     payload.finance_year,
        position:         payload.position,
        institution_name: payload.institution_name,
        userId,
      });
    case "nodal_officer_activated":
      return sendNodalOfficerActivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        reporting_year:   payload.reporting_year,
        institution_name: payload.institution_name,
        scope:            payload.scope,
        login_url:        payload.login_url,
        userId,
      });
    case "department_activated":
      return sendDepartmentActivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        department_name:  payload.department_name,
        department_code:  payload.department_code,
        institution_name: payload.institution_name,
        userId,
      });
    case "department_deactivated":
      return sendDepartmentDeactivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        department_name:  payload.department_name,
        department_code:  payload.department_code,
        institution_name: payload.institution_name,
        userId,
      });
    case "institution_activated":
      return sendInstitutionActivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        institution_name: payload.institution_name,
        institution_code: payload.institution_code,
        city:             payload.city,
        state:            payload.state,
        userId,
      });
    case "institution_deactivated":
      return sendInstitutionDeactivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        institution_name: payload.institution_name,
        institution_code: payload.institution_code,
        city:             payload.city,
        state:            payload.state,
        userId,
      });
    case "committee_activated":
      return sendCommitteeActivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        committee_type:   payload.committee_type,
        finance_year:     payload.finance_year,
        institution_name: payload.institution_name,
        userId,
      });
    case "committee_deactivated":
      return sendCommitteeDeactivatedEmail(pool, {
        full_name:        payload.full_name,        email,
        committee_type:   payload.committee_type,
        finance_year:     payload.finance_year,
        institution_name: payload.institution_name,
        userId,
      });
    case "role_created":
      return sendRoleCreatedEmail(pool, {
        full_name:         payload.full_name,        email,
        role_name:         payload.role_name,
        role_display_name: payload.role_display_name,
        role_description:  payload.role_description,
        userId,
      });
    case "institute_form_created":
      return sendInstituteFormCreatedEmail(pool, {
        full_name:        payload.full_name,        email,
        form_name:        payload.form_name,
        academic_year:    payload.academic_year,
        institution_name: payload.institution_name,
        created_by_name:  payload.created_by_name,
        deadline:         payload.deadline,
        is_shared:        payload.is_shared,
        login_url:        payload.login_url,
        userId,
      });
    case "department_form_created":
      return sendDepartmentFormCreatedEmail(pool, {
        full_name:       payload.full_name,       email,
        form_name:       payload.form_name,
        department_name: payload.department_name,
        academic_year:   payload.academic_year,
        created_by_name: payload.created_by_name,
        deadline:        payload.deadline,
        login_url:       payload.login_url,
        userId,
      });
    case "form_deadline_reminder":
      return sendDeadlineReminderEmail(pool, {
        full_name:        payload.full_name,        email,
        form_name:        payload.form_name,
        academic_year:    payload.academic_year,
        institution_name: payload.institution_name,
        department_name:  payload.department_name,
        deadline:         payload.deadline,
        days_remaining:   payload.days_remaining,
        form_type:        payload.form_type,
        login_url:        payload.login_url,
        userId,
      });
    case "import_completed":
      return sendImportCompletedEmail(pool, {
        full_name:  payload.full_name,  email,
        imported:   payload.imported,
        skipped:    payload.skipped,
        failed:     payload.failed,
        total:      payload.total,
        login_url:  payload.login_url,
        userId,
      });
    case "form_assigned":
      return sendFormAssignedEmail(pool, {
        full_name:        payload.full_name,  email,
        form_name:        payload.form_name,
        academic_year:    payload.academic_year,
        assigned_by_name: payload.assigned_by_name,
        deadline:         payload.deadline,
        login_url:        payload.login_url,
        userId,
      });
    case "form_locked":
      return sendFormLockedEmail(pool, {
        full_name:        payload.full_name,  email,
        form_name:        payload.form_name,
        institution_name: payload.institution_name,
        locked_by_name:   payload.locked_by_name,
        login_url:        payload.login_url,
        userId,
      });
    case "section_assigned":
      return sendSectionAssignedEmail(pool, {
        full_name:    payload.full_name,  email,
        section_name: payload.section_name,
        report_name:  payload.report_name,
        role:         payload.role,
        due_at:       payload.due_at,
        login_url:    payload.login_url,
        userId,
      });
    case "form_submitted":
      return sendFormSubmittedEmail(pool, {
        full_name:         payload.full_name,  email,
        section_name:      payload.section_name,
        step_name:         payload.step_name,
        submitted_by_name: payload.submitted_by_name,
        login_url:         payload.login_url,
        userId,
      });
    case "form_approved":
      return sendFormApprovedEmail(pool, {
        full_name:        payload.full_name,  email,
        section_name:     payload.section_name,
        approved_by_name: payload.approved_by_name,
        login_url:        payload.login_url,
        userId,
      });
    case "form_rejected":
      return sendFormRejectedEmail(pool, {
        full_name:      payload.full_name,  email,
        section_name:   payload.section_name,
        reviewer_name:  payload.reviewer_name,
        comment:        payload.comment,
        login_url:      payload.login_url,
        userId,
      });
    default:
      throw new Error(`emailWorker: unknown event_id "${event_id}"`);
  }
}

/* ── Claim and process one job ── */
async function _processNext(pool) {
  const client = await pool.connect();
  let job = null;

  try {
    await client.query("BEGIN");

    // Atomically claim the oldest eligible pending job.
    // FOR UPDATE SKIP LOCKED prevents two concurrent workers from picking the same row.
    const { rows } = await client.query(`
      SELECT * FROM email_queue
      WHERE  status = 'pending'
        AND  attempts < max_attempts
        AND  scheduled_at <= now()
      ORDER  BY scheduled_at ASC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    `);

    if (!rows.length) {
      await client.query("ROLLBACK");
      client.release();
      return false;
    }

    job = rows[0];

    // Flip to 'processing' inside the transaction — row is invisible to other pollers after COMMIT.
    await client.query(
      `UPDATE email_queue
       SET    status = 'processing', attempts = attempts + 1, last_attempted_at = now()
       WHERE  id = $1`,
      [job.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    throw err;
  }

  client.release();

  // Send outside any transaction — SMTP calls can take several seconds.
  try {
    await _dispatchJob(pool, job);
    await pool.query(
      `UPDATE email_queue SET status = 'sent', processed_at = now() WHERE id = $1`,
      [job.id]
    );
    logger.info(`emailWorker: sent  event=${job.event_id} to=${job.recipient_email} id=${job.id}`);

    // Audit trail — fire-and-forget so a logging failure never blocks delivery.
    pool.query(
      `INSERT INTO public.audit_logs
         (action_type, entity_type, entity_id, status, message, metadata)
       VALUES ('EMAIL_SENT', 'EMAIL_QUEUE', $1, 'SUCCESS', $2, $3)`,
      [
        job.id,
        `Email sent: ${job.event_id} to ${job.recipient_email}`,
        JSON.stringify({ event_id: job.event_id, recipient: job.recipient_email }),
      ]
    ).catch((e) => logger.error("Failed to write EMAIL_SENT audit log", { error: e.message }));
  } catch (err) {
    const failedAttempts = job.attempts + 1; // already incremented above
    const exhausted      = failedAttempts >= job.max_attempts;
    const delaySec       = _backoffFor(failedAttempts);

    await pool.query(
      `UPDATE email_queue
       SET    status       = $2,
              last_error   = $3,
              scheduled_at = CASE
                               WHEN $4 THEN scheduled_at
                               ELSE now() + ($5 * INTERVAL '1 second')
                             END
       WHERE  id = $1`,
      [job.id, exhausted ? "failed" : "pending", err.message, exhausted, delaySec]
    );

    logger.error(
      `emailWorker: FAILED event=${job.event_id} to=${job.recipient_email} ` +
      `attempt=${failedAttempts}/${job.max_attempts}` +
      `${exhausted ? " (exhausted)" : ` — retry in ${delaySec}s`}: ${err.message}`
    );

    // Write to audit_logs only when all retries are exhausted (terminal failure).
    if (exhausted) {
      pool.query(
        `INSERT INTO public.audit_logs
           (action_type, entity_type, entity_id, status, message, metadata)
         VALUES ('EMAIL_FAILED', 'EMAIL_QUEUE', $1, 'FAILURE', $2, $3)`,
        [
          job.id,
          `Email permanently failed: ${job.event_id} to ${job.recipient_email}`,
          JSON.stringify({ event_id: job.event_id, recipient: job.recipient_email, error: err.message }),
        ]
      ).catch((e) => logger.error("Failed to write EMAIL_FAILED audit log", { error: e.message }));
    }
  }

  return true;
}

/* ── Ensure report-module templates exist in notification_templates ── */
async function _seedReportTemplates(pool) {
  const templates = [
    {
      event_id:      "section_assigned",
      label:         "Report Section Assigned",
      email_enabled: true,
      app_enabled:   true,
      email_subject: "Section Assigned for Editing — {SECTION_NAME}",
      email_body:    "Hi {FULL_NAME},\n\nA section has been assigned to you for editing on {APP_NAME}.\n\nReport: {REPORT_NAME}\nSection: {SECTION_NAME}\nRole: {ROLE}\nDue: {DUE_AT}\n\nPlease complete the content and submit it for review.\n\nLog in to get started: {LOGIN_URL}\n\n— {APP_NAME} Team",
      app_message:   'Section "{SECTION_NAME}" has been assigned to you as {ROLE}.',
      role_group:    "contributor",
      category:      "Reports",
    },
  ];
  for (const t of templates) {
    await pool.query(
      `INSERT INTO public.notification_templates
         (event_id, label, email_enabled, app_enabled, email_subject, email_body, app_message, role_group, category, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
       ON CONFLICT (event_id) DO NOTHING`,
      [t.event_id, t.label, t.email_enabled, t.app_enabled,
       t.email_subject, t.email_body, t.app_message, t.role_group, t.category]
    ).catch((e) => logger.warn(`_seedReportTemplates: skipped ${t.event_id}: ${e.message}`));
  }
}

/* ── Start background polling loop (call once from server.js) ── */
function startEmailWorker(pool) {
  logger.info(`emailWorker: started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  _seedReportTemplates(pool).catch((e) => logger.warn("emailWorker: template seed failed", { err: e.message }));

  async function tick() {
    try {
      let hadWork = true;
      while (hadWork) hadWork = await _processNext(pool); // drain queue on each tick
    } catch (err) {
      logger.error("emailWorker: tick error", { stack: err.stack });
    }
  }

  tick(); // process any backlog that built up before this boot
  return setInterval(tick, POLL_INTERVAL_MS);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORTS
═══════════════════════════════════════════════════════════════════ */
module.exports = {
  /* Named send functions (used directly by the worker dispatcher above) */
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAccountSuspendedEmail,
  sendAccountReactivatedEmail,
  sendRoleUpdatedEmail,
  sendAcademicYearActivatedEmail,
  sendDepartmentCreatedEmail,
  sendNodalOfficerAssignedEmail,
  sendNodalOfficerRemovedEmail,
  sendInstitutionCreatedEmail,
  sendCommitteeCreatedEmail,
  sendNodalOfficerActivatedEmail,
  sendDepartmentActivatedEmail,
  sendDepartmentDeactivatedEmail,
  sendInstitutionActivatedEmail,
  sendInstitutionDeactivatedEmail,
  sendCommitteeActivatedEmail,
  sendCommitteeDeactivatedEmail,
  sendRoleCreatedEmail,
  sendInstituteFormCreatedEmail,
  sendDepartmentFormCreatedEmail,
  sendDeadlineReminderEmail,
  sendImportCompletedEmail,
  sendFormAssignedEmail,
  sendFormLockedEmail,
  sendSectionAssignedEmail,
  sendFormSubmittedEmail,
  sendFormApprovedEmail,
  sendFormRejectedEmail,
  /* Queue interface */
  enqueueEmail,
  startEmailWorker,
};
