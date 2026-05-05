"use strict";

const nodemailer = require("nodemailer");
const fs         = require("fs");
const path       = require("path");
const logger     = require("../utils/logger");

/* ── Transport ──────────────────────────────────────────────────── */
function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 587, secure: false,
    auth: { user: "moul22058.it@rmkec.ac.in", pass: "mllwygzomfkbsjyb" },
  });
}

/* ── Token resolver ─────────────────────────────────────────────── */
function resolveTokens(str = "", data = {}) {
  let out = str;
  Object.entries(data).forEach(([key, value]) => {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value ?? "");
    out = out.replace(new RegExp(`\\{${key}\\}`,       "g"), value ?? "");
  });
  return out;
}

/* ── HTML layout loader ─────────────────────────────────────────── */
function loadHtmlLayout(templateData = {}) {
  const layoutPath = path.join(__dirname, "../templates/user.html");
  if (!fs.existsSync(layoutPath)) throw new Error(`Email layout not found: ${layoutPath}`);
  let html = fs.readFileSync(layoutPath, "utf-8");
  Object.entries(templateData).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g"), value ?? "");
  });
  return html;
}

/* ── Fetch template from DB ─────────────────────────────────────── */
async function getTemplateFromDB(pool, eventId) {
  const { rows } = await pool.query(
    `SELECT email_subject, email_body, email_enabled, app_message, app_enabled
     FROM notification_templates WHERE event_id = $1`,
    [eventId]
  );
  if (!rows.length) throw new Error(`No DB template found for event: ${eventId}`);
  return rows[0];
}

/* ── Core send ──────────────────────────────────────────────────── */
async function sendMail({ to, subject, html }) {
  const transport = createTransport();
  const info = await transport.sendMail({
    from: { name: "AIIA", address: "moul22058.it@rmkec.ac.in" },
    to, subject, html,
  });
  return info;
}

/* ── In-app notification insert ─────────────────────────────────── */
async function insertNotification(pool, { userId, eventId, title, message }) {
  if (!userId) {
    logger.error(`insertNotification: userId is null — skipping event=${eventId}`);
    return;
  }
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, event_id, title, message)
       VALUES ($1, $2, $3, $4)`,
      [userId, eventId, title, message]
    );
    logger.info(`insertNotification OK: event=${eventId} userId=${userId}`);
  } catch (err) {
    logger.error(`insertNotification FAILED: event=${eventId} userId=${userId}: ${err.message}`);
    logger.error(err.stack);
  }
}

/* ── Resolve userId from email when caller doesn't supply it ─────── */
async function resolveUserId(pool, userId, email) {
  if (userId) return userId;
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]
  );
  return rows[0]?.id ?? null;
}

/* ══════════════════════════════════════════════════════════════
   NAMED EMAIL FUNCTIONS
══════════════════════════════════════════════════════════════ */

/* ── Welcome email ── */
async function sendWelcomeEmail(pool, { full_name, email, password, login_url, userId }) {
  const tmpl = await getTemplateFromDB(pool, "user_created");

  const tokens = {
    UserName: full_name,     FULL_NAME:          full_name,
    Email:    email,         EMAIL:              email,
    TempPassword: password,  TEMPORARY_PASSWORD: password,
    LoginURL: login_url || "http://localhost:5173/login",
    LOGIN_URL: login_url || "http://localhost:5173/login",
    AppName:  "Pragati Mitra", APP_NAME: "Pragati Mitra",
    SUPPORT_EMAIL: "moul22058.it@rmkec.ac.in",
  };

  if (tmpl.email_enabled) {
    const subject   = resolveTokens(tmpl.email_subject, tokens);
    const introText = resolveTokens(tmpl.email_body, tokens);
    await sendMail({ to: email, subject, html: loadHtmlLayout({ ...tokens, INTRO_TEXT: introText }) });
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

/* ── Password reset email ── */
async function sendPasswordResetEmail(pool, { full_name, email, reset_url, userId }) {
  const tmpl = await getTemplateFromDB(pool, "password_reset");

  const tokens = {
    UserName: full_name, FULL_NAME: full_name,
    Email: email,        EMAIL:     email,
    LoginURL: reset_url, LOGIN_URL: reset_url,
    AppName: "Pragati Mitra", APP_NAME: "Pragati Mitra",
    SUPPORT_EMAIL: "moul22058.it@rmkec.ac.in",
  };

  if (tmpl.email_enabled) {
    const subject  = resolveTokens(tmpl.email_subject, tokens);
    const bodyHtml = `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <pre style="font-family:'Segoe UI',sans-serif;white-space:pre-wrap;font-size:14px;color:#334155;line-height:1.75;">${resolveTokens(tmpl.email_body, tokens)}</pre>
    </div>`;
    await sendMail({ to: email, subject, html: bodyHtml });
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

/* ── Account suspended email ── */
async function sendAccountSuspendedEmail(pool, { full_name, email, userId }) {
  const tmpl = await getTemplateFromDB(pool, "account_suspended");

  const tokens = {
    UserName: full_name, FULL_NAME: full_name,
    Email: email,        EMAIL:     email,
    AppName: "Pragati Mitra", APP_NAME: "Pragati Mitra",
    SUPPORT_EMAIL: "moul22058.it@rmkec.ac.in",
  };

  if (tmpl.email_enabled) {
    const subject  = resolveTokens(tmpl.email_subject, tokens);
    const bodyHtml = `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <pre style="font-family:'Segoe UI',sans-serif;white-space:pre-wrap;font-size:14px;color:#334155;line-height:1.75;">${resolveTokens(tmpl.email_body, tokens)}</pre>
    </div>`;
    await sendMail({ to: email, subject, html: bodyHtml });
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

/* ── Account reactivated email ── */
async function sendAccountReactivatedEmail(pool, { full_name, email, login_url, userId }) {
  const tmpl = await getTemplateFromDB(pool, "account_reactivated");

  const tokens = {
    UserName: full_name, FULL_NAME: full_name,
    Email: email,        EMAIL:     email,
    LoginURL: login_url || "http://localhost:5173/login",
    LOGIN_URL: login_url || "http://localhost:5173/login",
    AppName: "Pragati Mitra", APP_NAME: "Pragati Mitra",
    SUPPORT_EMAIL: "moul22058.it@rmkec.ac.in",
  };

  if (tmpl.email_enabled) {
    const subject  = resolveTokens(tmpl.email_subject, tokens);
    const bodyHtml = `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <pre style="font-family:'Segoe UI',sans-serif;white-space:pre-wrap;font-size:14px;color:#334155;line-height:1.75;">${resolveTokens(tmpl.email_body, tokens)}</pre>
    </div>`;
    await sendMail({ to: email, subject, html: bodyHtml });
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

/* ── Role updated email + in-app notification ── */
async function sendRoleUpdatedEmail(pool, { full_name, email, new_role, login_url, userId }) {
  const EVENT = "user_role_updated";

  let tmpl;
  try {
    tmpl = await getTemplateFromDB(pool, EVENT);
  } catch (err) {
    logger.error(`sendRoleUpdatedEmail: template not found: ${err.message}`);
    return null;
  }

  const tokens = {
    UserName: full_name, FULL_NAME: full_name,
    Email:    email,     EMAIL:     email,
    NewRole:  new_role,
    LoginURL: login_url || "http://localhost:5173/login",
    LOGIN_URL: login_url || "http://localhost:5173/login",
    AppName:  "Pragati Mitra", APP_NAME: "Pragati Mitra",
    SUPPORT_EMAIL: "moul22058.it@rmkec.ac.in",
  };

  if (tmpl.email_enabled) {
    const subject  = resolveTokens(tmpl.email_subject, tokens);
    const bodyHtml = `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <pre style="font-family:'Segoe UI',sans-serif;white-space:pre-wrap;font-size:14px;color:#334155;line-height:1.75;">${resolveTokens(tmpl.email_body, tokens)}</pre>
    </div>`;
    await sendMail({ to: email, subject, html: bodyHtml });
  }

  if (tmpl.app_enabled) {
    // userId is already provided by roles.js — resolveUserId just returns it directly
    const uid = await resolveUserId(pool, userId, email);
    logger.info(`sendRoleUpdatedEmail: inserting notification userId=${uid} email=${email}`);
    await insertNotification(pool, {
      userId:  uid,
      eventId: EVENT,
      title:   resolveTokens(tmpl.email_subject, tokens),
      message: resolveTokens(tmpl.app_message,   tokens),
    });
  }
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAccountSuspendedEmail,
  sendAccountReactivatedEmail,
  sendRoleUpdatedEmail,
};