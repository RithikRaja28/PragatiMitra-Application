import React, { useState, useEffect, useCallback } from "react";
import { User, Building, Landmark, Shield, FileText, Lock } from "lucide-react";
import { useAuth } from "../../../store/AuthContext";
import PageHeader from "../../../components/shared/PageHeader";
import { tableCardStyle } from "../../../components/shared/ui";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION CONFIG — category groups + per-entity chips
═══════════════════════════════════════════════════════════════ */
const CATEGORY_GROUPS = [
  {
    key: null, label: "All Logs",
    accent: "#475569", bg: "#f1f5f9", lightBg: "#f8fafc",
    icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>),
    entityKeys: [],
  },
  {
    key: "ADMINISTRATION", label: "Administration",
    accent: "#6d28d9", bg: "#ede9fe", lightBg: "#f5f3ff",
    icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
    entityKeys: ["USER", "DEPARTMENT", "INSTITUTION", "ROLE", "COMMITTEE"],
  },
  {
    key: "FORMS", label: "Forms",
    accent: "#0e7490", bg: "#cffafe", lightBg: "#ecfeff",
    icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>),
    entityKeys: ["FORM", "FORM_DATA"],
  },
  {
    key: "KPI", label: "KPI",
    accent: "#059669", bg: "#d1fae5", lightBg: "#ecfdf5",
    icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
    entityKeys: ["KPI"],
  },
  {
    key: "SESSIONS", label: "Sessions",
    accent: "#0369a1", bg: "#e0f2fe", lightBg: "#f0f9ff",
    icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
    entityKeys: ["SESSION"],
  },
];

const ALL_ENTITY_CARDS = [
  { key: "USER",        category: "ADMINISTRATION", label: "Users",        accent: "#6d28d9", bg: "#ede9fe", description: "User created, updated, deactivated" },
  { key: "DEPARTMENT",  category: "ADMINISTRATION", label: "Departments",  accent: "#065f46", bg: "#d1fae5", description: "Dept created, settings changed" },
  { key: "INSTITUTION", category: "ADMINISTRATION", label: "Institutions", accent: "#1d4ed8", bg: "#dbeafe", description: "Institution registered or updated" },
  { key: "ROLE",        category: "ADMINISTRATION", label: "Roles",        accent: "#d97706", bg: "#fef3c7", description: "Role created, permissions changed" },
  { key: "COMMITTEE",   category: "ADMINISTRATION", label: "Committees",   accent: "#be123c", bg: "#fff1f2", description: "Committee created, updated" },
  { key: "FORM",        category: "FORMS",          label: "Form Config",  accent: "#0e7490", bg: "#cffafe", description: "Form created, updated, locked" },
  { key: "FORM_DATA",   category: "FORMS",          label: "Form Data",    accent: "#7c3aed", bg: "#ede9fe", description: "Data added, updated, deleted, imported, exported" },
  { key: "KPI",         category: "KPI",            label: "KPI",          accent: "#059669", bg: "#d1fae5", description: "KPI charts created" },
  { key: "SESSION",     category: "SESSIONS",       label: "Sessions",     accent: "#0369a1", bg: "#e0f2fe", description: "Logins, logouts, failed attempts" },
];

/* ═══════════════════════════════════════════════════════════════
   METADATA MAPS
═══════════════════════════════════════════════════════════════ */
const ACTION_META = {
  // ── User ──────────────────────────────────────────────────────
  USER_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  USER_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  USER_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  USERS_BULK_IMPORTED:      { label: "Bulk Imported",       bg: "#ede9fe", color: "#6d28d9" },
  USERS_EXPORTED:           { label: "Exported",            bg: "#d1fae5", color: "#065f46" },

  // ── Department ────────────────────────────────────────────────
  DEPT_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  DEPT_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  DEPT_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  DEPT_DEACTIVATED:         { label: "Deactivated",         bg: "#fef3c7", color: "#d97706" },
  DEPARTMENT_CREATED:       { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  DEPARTMENT_UPDATED:       { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  DEPARTMENT_DELETED:       { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },

  // ── Institution ───────────────────────────────────────────────
  INST_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  INST_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  INST_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  INSTITUTION_CREATED:      { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  INSTITUTION_UPDATED:      { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  INSTITUTION_DELETED:      { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },

  // ── Role ──────────────────────────────────────────────────────
  ROLE_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  ROLE_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  ROLE_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  ROLE_PERMISSIONS_CHANGED: { label: "Permissions Changed", bg: "#fef3c7", color: "#d97706" },
  ROLE_ASSIGNED:            { label: "Assigned to User",    bg: "#ede9fe", color: "#6d28d9" },
  ROLE_REVOKED:             { label: "Revoked from User",   bg: "#ffe4e6", color: "#be123c" },

  // ── Committee ─────────────────────────────────────────────────
  COMMITTEE_CREATED:        { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  COMMITTEE_UPDATED:        { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  COMMITTEE_DELETED:        { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  COMMITTEE_ACTIVATED:      { label: "Activated",           bg: "#d1fae5", color: "#065f46" },
  COMMITTEE_DEACTIVATED:    { label: "Deactivated",         bg: "#fef3c7", color: "#d97706" },

  // ── Session / Auth — NEW ───────────────────────────────────────
  LOGIN_SUCCESS:            { label: "Login",               bg: "#d1fae5", color: "#065f46" },
  LOGIN_FAILED:             { label: "Login Failed",        bg: "#fee2e2", color: "#b91c1c" },
  LOGOUT:                   { label: "Logout",              bg: "#f1f5f9", color: "#475569" },
  SESSION_TOKEN_REUSE:      { label: "Token Reuse",         bg: "#fef3c7", color: "#b45309" },

  // ── Form Config ───────────────────────────────────────────────
  CREATE_FORM:              { label: "Form Created",        bg: "#dcfce7", color: "#15803d" },
  UPDATE_FORM:              { label: "Form Updated",        bg: "#dbeafe", color: "#1d4ed8" },
  LOCK_FORM:                { label: "Form Locked",         bg: "#fef3c7", color: "#d97706" },
  UNLOCK_FORM:              { label: "Form Unlocked",       bg: "#d1fae5", color: "#065f46" },
  SET_FORM_DEADLINE:        { label: "Deadline Set",        bg: "#ede9fe", color: "#6d28d9" },
  FORM_DEADLINE_UPDATED:    { label: "Deadline Updated",    bg: "#dbeafe", color: "#1d4ed8" },
  REMOVE_FORM_DEADLINE:     { label: "Deadline Removed",    bg: "#fee2e2", color: "#b91c1c" },

  // ── Form Data ─────────────────────────────────────────────────
  FORM_DATA_CREATED:        { label: "Data Added",          bg: "#dcfce7", color: "#15803d" },
  FORM_DATA_UPDATED:        { label: "Data Updated",        bg: "#dbeafe", color: "#1d4ed8" },
  FORM_DATA_DELETED:        { label: "Data Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  FORM_DATA_BULK_DELETED:   { label: "Bulk Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  FORM_DATA_IMPORTED:       { label: "Data Imported",       bg: "#ede9fe", color: "#6d28d9" },
  FORM_DATA_EXPORTED:       { label: "Data Exported",       bg: "#d1fae5", color: "#065f46" },

  // ── KPI ───────────────────────────────────────────────────────
  KPI_CREATED:              { label: "KPI Created",         bg: "#dcfce7", color: "#059669" },

  DEFAULT:                  { label: "Event",               bg: "#f1f5f9", color: "#64748b" },
};

const TYPE_META = {
  USER:        { label: "User",        bg: "#ede9fe", color: "#6d28d9" },
  DEPARTMENT:  { label: "Department",  bg: "#d1fae5", color: "#065f46" },
  INSTITUTION: { label: "Institution", bg: "#dbeafe", color: "#1d4ed8" },
  ROLE:        { label: "Role",        bg: "#fef3c7", color: "#d97706" },
  COMMITTEE:   { label: "Committee",   bg: "#fff1f2", color: "#be123c" },
  SESSION:     { label: "Session",     bg: "#e0f2fe", color: "#0369a1" },
  FORM:        { label: "Form",        bg: "#cffafe", color: "#0e7490" },
  FORM_DATA:   { label: "Form Data",   bg: "#f3e8ff", color: "#7c3aed" },
  FORM_LOCK:   { label: "Form Lock",   bg: "#fef3c7", color: "#d97706" },
  KPI:         { label: "KPI",         bg: "#d1fae5", color: "#059669" },
};

const ENTITY_ICON = { USER: User, DEPARTMENT: Building, INSTITUTION: Landmark, ROLE: Shield, COMMITTEE: FileText, SESSION: Lock, FORM: FileText, FORM_DATA: FileText, FORM_LOCK: Lock, KPI: FileText };

/* ═══════════════════════════════════════════════════════════════
   BROWSER GLYPH
═══════════════════════════════════════════════════════════════ */
function BrowserGlyph({ name = "", size = 20 }) {
  const n = (name || "").toLowerCase();

  if (n.includes("chrome") && !n.includes("edge") && !n.includes("samsung"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <path d="M16 16 L16 3 A13 13 0 0 1 27.26 9.5 Z" fill="#EA4335"/>
        <path d="M16 16 L27.26 9.5 A13 13 0 0 1 27.26 22.5 Z" fill="#FBBC05"/>
        <path d="M16 16 L27.26 22.5 A13 13 0 0 1 4.74 22.5 Z" fill="#34A853"/>
        <path d="M16 16 L4.74 22.5 A13 13 0 0 1 4.74 9.5 Z" fill="#4285F4"/>
        <path d="M16 16 L4.74 9.5 A13 13 0 0 1 16 3 Z" fill="#4285F4"/>
        <circle cx="16" cy="16" r="6" fill="#fff"/>
        <circle cx="16" cy="16" r="4.5" fill="#4285F4"/>
      </svg>
    );

  if (n.includes("firefox"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <circle cx="16" cy="16" r="10" fill="#FF9500"/>
        <circle cx="16" cy="16" r="6"  fill="#FF6611"/>
        <circle cx="16" cy="16" r="3"  fill="#FFD000"/>
        <path d="M9 10 Q12 4 20 6 Q14 8 13 13 Q10 11 9 10Z" fill="#FF4500" opacity="0.7"/>
      </svg>
    );

  if (n.includes("edge"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <path d="M8 18c0-6 4-10 8-10 3 0 5.5 1.5 7 4H14c-2 0-3 1.5-3 3 0 2 1.5 4 5 4 2 0 4-0.5 5.5-2-1.5 3.5-5 5.5-9 5.5C10 22.5 8 20.5 8 18z" fill="#0078D4"/>
        <path d="M23 12c1.5 1.5 2.5 3.5 2.5 6 0 1-0.2 2-0.5 2.8C27 18.5 28 16 28 13.5 28 10 25.5 7 22 6c0.5 1.5 1 3.5 1 6z" fill="#50E6FF" opacity="0.8"/>
      </svg>
    );

  if (n.includes("safari"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <circle cx="16" cy="16" r="12" fill="none" stroke="#d1d5db" strokeWidth="0.8"/>
        <polygon points="16,6 17.5,16 16,26 14.5,16" fill="#FF3B30"/>
        <polygon points="6,16 16,14.5 26,16 16,17.5" fill="#007AFF"/>
        <circle cx="16" cy="16" r="2" fill="#1e293b"/>
      </svg>
    );

  if (n.includes("opera"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <ellipse cx="16" cy="16" rx="7" ry="11" fill="none" stroke="#FF1B2D" strokeWidth="2.5"/>
        <ellipse cx="16" cy="16" rx="3" ry="11" fill="none" stroke="#FF1B2D" strokeWidth="1.2"/>
      </svg>
    );

  if (n.includes("samsung"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
        <text x="16" y="21" textAnchor="middle" fontSize="13" fill="#1428A0" fontWeight="bold" fontFamily="sans-serif">S</text>
      </svg>
    );

  if (n.includes("postman") || n.includes("curl") || n.includes("insomnia") || n.includes("axios") || n.includes("node"))
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" fill="#f8fafc" stroke="#e5e7eb" strokeWidth="1"/>
        <polyline points="13 10 7 16 13 22" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="19 10 25 16 19 22" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#f8fafc" stroke="#e5e7eb" strokeWidth="1"/>
      <circle cx="16" cy="16" r="10" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
      <line x1="6" y1="16" x2="26" y2="16" stroke="#94a3b8" strokeWidth="1.2"/>
      <line x1="16" y1="6" x2="16" y2="26" stroke="#94a3b8" strokeWidth="1.2"/>
      <path d="M16 6 Q20 11 20 16 Q20 21 16 26 Q12 21 12 16 Q12 11 16 6Z" stroke="#94a3b8" strokeWidth="1" fill="none"/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SHARED UI ATOMS
═══════════════════════════════════════════════════════════════ */
function ActionBadge({ actionType }) {
  const meta = ACTION_META[actionType] || ACTION_META.DEFAULT;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function SectionDivider({ icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ display: "flex", color: "#64748b" }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REQUEST CONTEXT PANEL
═══════════════════════════════════════════════════════════════ */
function RequestContextPanel({ log }) {
  const { lang } = useLanguage();
  const hasAny = log.ip_address || log.browser_name || log.user_agent;
  if (!hasAny) return null;

  const Card = ({ headerIcon, label, accent, children }) => (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 11,
      padding: "11px 13px 12px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ display: "flex", flexShrink: 0, color: accent }}>{headerIcon}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase", color: "#94a3b8" }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );

  const EmptyValue = () => (
    <span style={{ fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>{t("Not available", lang)}</span>
  );

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Card
          label={t("IP Address", lang)}
          accent="#2563eb"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          }
        >
          {log.ip_address ? (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "6px 10px" }}>
              <span style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", fontWeight: 500, color: "#1e40af" }}>
                {log.ip_address}
              </span>
            </div>
          ) : <EmptyValue />}
        </Card>

        <Card
          label={t("Browser", lang)}
          accent="#7c3aed"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          }
        >
          {log.browser_name ? (
            <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 7, padding: "5px 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <BrowserGlyph name={log.browser_name} size={20} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5b21b6" }}>
                {log.browser_name}
              </span>
            </div>
          ) : <EmptyValue />}
        </Card>

        <Card
          label={t("User Agent", lang)}
          accent="#475569"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
          }
        >
          {log.user_agent ? (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 10px" }}>
              <span
                title={log.user_agent}
                style={{ display: "block", fontSize: 11, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", fontWeight: 400, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}
              >
                {log.user_agent}
              </span>
            </div>
          ) : <EmptyValue />}
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SESSION DETAIL PANEL — NEW
   Renders login/logout/failed-login detail in the expanded row.
═══════════════════════════════════════════════════════════════ */
function SessionDetail({ log }) {
  const isSuccess  = log.action_type === "LOGIN_SUCCESS";
  const isFailed   = log.action_type === "LOGIN_FAILED";
  const isLogout   = log.action_type === "LOGOUT";
  const isReuse    = log.action_type === "SESSION_TOKEN_REUSE";
  const meta       = log.metadata   || {};

  // ── Login success ─────────────────────────────────────────────
  if (isSuccess) {
    const roles = Array.isArray(meta.roles) ? meta.roles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {meta.institution && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Institution</div>
              <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{meta.institution}</div>
            </div>
          )}
          {roles.length > 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Roles</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {roles.map((r) => (
                  <span key={r} style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#15803d" }}>{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Login failed ──────────────────────────────────────────────
  if (isFailed) {
    const reasonMap = {
      user_not_found:     { label: "Email not found",           color: "#b91c1c", bg: "#fee2e2" },
      account_not_active: { label: `Account ${meta.account_status || "inactive"}`, color: "#d97706", bg: "#fef3c7" },
      invalid_password:   { label: "Incorrect password",        color: "#b91c1c", bg: "#fee2e2" },
    };
    const r = reasonMap[meta.reason] || { label: meta.reason || "Unknown reason", color: "#b91c1c", bg: "#fee2e2" };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: r.bg, border: `1px solid ${r.color}33`, borderRadius: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: r.color }}>{r.label}</div>
            {meta.attempted_email && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>{meta.attempted_email}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Logout ────────────────────────────────────────────────────
  if (isLogout) {
    return (
      <div style={{ padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
        User signed out — session terminated.
      </div>
    );
  }

  // ── Token reuse / security violation ─────────────────────────
  if (isReuse) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>Security alert — all sessions invalidated</div>
          <div style={{ fontSize: 12, color: "#92400e", marginTop: 4, lineHeight: 1.6 }}>
            A previously-rotated refresh token was replayed. This may indicate token theft. All active sessions for this user were revoked immediately.
          </div>
        </div>
      </div>
    );
  }

  return <div style={{ fontSize: 12, color: "#94a3b8" }}>No session details available.</div>;
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT / EXPORT DETAIL PANEL — NEW
   Renders for USERS_BULK_IMPORTED and USERS_EXPORTED
═══════════════════════════════════════════════════════════════ */
function ImportExportDetail({ log }) {
  const { action_type, new_value, metadata } = log;

  // ── Bulk import ───────────────────────────────────────────────
  if (action_type === "USERS_BULK_IMPORTED") {
    const v = new_value || {};
    const stats = [
      { label: "Total Rows",  value: v.total    ?? "—", color: "#1d4ed8", bg: "#dbeafe" },
      { label: "Imported",    value: v.imported  ?? v.success ?? "—", color: "#15803d", bg: "#dcfce7" },
      { label: "Skipped",     value: v.skipped   ?? "—", color: "#d97706", bg: "#fef3c7" },
      { label: "Failed",      value: v.failed    ?? "—", color: "#b91c1c", bg: "#fee2e2" },
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
        {stats.map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }

  // ── Export ────────────────────────────────────────────────────
  if (action_type === "USERS_EXPORTED") {
    const m = metadata || {};
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        {m.format && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Format</div>
            <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{m.format.toUpperCase()}</div>
          </div>
        )}
        {m.record_count !== undefined && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Records</div>
            <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{m.record_count.toLocaleString()}</div>
          </div>
        )}
        {m.exported_on && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Date</div>
            <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{m.exported_on}</div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════════
   BUSINESS DIFF COMPONENTS  (unchanged from original)
═══════════════════════════════════════════════════════════════ */
function PermissionDiffDetail({ log }) {
  const { lang } = useLanguage();
  const granted = log.metadata?.granted ?? [];
  const revoked = log.metadata?.revoked ?? [];
  const cf = log.changed_fields ?? [];
  const grantedList = granted.length ? granted : cf.filter((k) => log.new_value?.[k] === true);
  const revokedList = revoked.length  ? revoked  : cf.filter((k) => log.new_value?.[k] === false);
  if (!grantedList.length && !revokedList.length)
    return <div style={{ fontSize: 12, color: "#94a3b8" }}>{t("No permission details available.", lang)}</div>;

  const Col = ({ items, isGrant }) => (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: isGrant ? "#15803d" : "#b91c1c", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 16, height: 16, borderRadius: "50%", background: isGrant ? "#dcfce7" : "#fee2e2", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: isGrant ? "#15803d" : "#b91c1c" }}>
          {isGrant ? "✓" : "✕"}
        </span>
        {isGrant ? `Granted (${items.length})` : `Revoked (${items.length})`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((k) => (
          <div key={k} style={{ fontSize: 11.5, color: isGrant ? "#065f46" : "#991b1b", background: isGrant ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isGrant ? "#bbf7d0" : "#fecaca"}`, borderRadius: 6, padding: "4px 10px", fontFamily: "monospace", wordBreak: "break-all" }}>{k}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {grantedList.length > 0 && <Col items={grantedList} isGrant={true} />}
      {revokedList.length > 0 && <Col items={revokedList} isGrant={false} />}
    </div>
  );
}

function RoleAssignmentDetail({ log }) {
  const isAssign = log.action_type === "ROLE_ASSIGNED";
  const value    = isAssign ? log.new_value : log.old_value;
  if (!value) return <div style={{ fontSize: 12, color: "#94a3b8" }}>No details available.</div>;
  const items = [
    { label: "User",       value: value.user_name },
    { label: "Email",      value: value.user_email },
    { label: "Role",       value: value.display_name || value.role_name },
    { label: "Expires At", value: value.expires_at ? new Date(value.expires_at).toLocaleDateString("en-IN") : "Never" },
  ].filter((i) => i.value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
      {items.map(({ label, value: val }) => (
        <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function MembersDiffDetail({ oldMembers, newMembers }) {
  const oldList = Array.isArray(oldMembers) ? oldMembers : [];
  const newList = Array.isArray(newMembers) ? newMembers : [];
  const maxLen  = Math.max(oldList.length, newList.length);
  if (maxLen === 0) return <div style={{ fontSize: 12, color: "#94a3b8" }}>No member data available.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr", gap: 8, padding: "0 4px" }}>
        <div />
        <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 0.7 }}>Before</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.7 }}>After</div>
      </div>
      {Array.from({ length: maxLen }, (_, i) => {
        const oldM      = oldList[i];
        const newM      = newList[i];
        const isAdded   = !oldM && !!newM;
        const isRemoved = !!oldM && !newM;
        const isChanged = oldM && newM && (oldM.name !== newM.name || oldM.designation !== newM.designation);
        const rowBg     = isAdded ? "#f0fdf4" : isRemoved ? "#fef2f2" : isChanged ? "#fffbeb" : "transparent";
        const rowBorder = isAdded ? "1px solid #bbf7d0" : isRemoved ? "1px solid #fecaca" : isChanged ? "1px solid #fde68a" : "1px solid #f1f5f9";
        const indicator = isAdded ? "+" : isRemoved ? "−" : isChanged ? "~" : "";
        const indicatorColor = isAdded ? "#15803d" : isRemoved ? "#b91c1c" : isChanged ? "#d97706" : "#cbd5e1";

        const CellValue = ({ member, side }) => {
          if (!member) return <div style={{ fontSize: 11.5, color: "#cbd5e1", fontStyle: "italic", padding: "4px 8px" }}>—</div>;
          const nameChanged  = isChanged && oldM.name        !== newM.name;
          const desigChanged = isChanged && oldM.designation !== newM.designation;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "3px 0" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", background: nameChanged ? (side === "old" ? "#fee2e2" : "#dcfce7") : "transparent", borderRadius: 4, padding: nameChanged ? "1px 5px" : "1px 0" }}>{member.name}</span>
              <span style={{ fontSize: 10.5, color: "#64748b", background: desigChanged ? (side === "old" ? "#fee2e2" : "#dcfce7") : "transparent", borderRadius: 4, padding: desigChanged ? "1px 5px" : "1px 0" }}>{member.designation}</span>
            </div>
          );
        };

        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr", gap: 8, alignItems: "center", background: rowBg, border: rowBorder, borderRadius: 9, padding: "8px 10px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: indicatorColor, textAlign: "center", lineHeight: 1 }}>
              {indicator || <span style={{ fontSize: 10, color: "#e2e8f0" }}>#{i + 1}</span>}
            </div>
            <CellValue member={oldM} side="old" />
            <CellValue member={newM} side="new" />
          </div>
        );
      })}
      {(oldList.length !== newList.length || oldList.some((m, i) => m?.name !== newList[i]?.name || m?.designation !== newList[i]?.designation)) && (
        <div style={{ display: "flex", gap: 14, marginTop: 6, paddingLeft: 4 }}>
          {[{ sym: "+", color: "#15803d", label: "Added" }, { sym: "−", color: "#b91c1c", label: "Removed" }, { sym: "~", color: "#d97706", label: "Changed" }].map(({ sym, color, label }) => (
            <div key={sym} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{sym}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommitteeDiffDetail({ log }) {
  const { lang } = useLanguage();
  const { action_type, old_value, new_value, changed_fields } = log;

  if (action_type === "COMMITTEE_ACTIVATED" || action_type === "COMMITTEE_DEACTIVATED") {
    const isActivated = action_type === "COMMITTEE_ACTIVATED";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 11 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Before</span>
          <span style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: isActivated ? "#f1f5f9" : "#d1fae5", color: isActivated ? "#94a3b8" : "#065f46" }}>{isActivated ? "INACTIVE" : "ACTIVE"}</span>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>After</span>
          <span style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: isActivated ? "#d1fae5" : "#f1f5f9", color: isActivated ? "#065f46" : "#94a3b8" }}>{isActivated ? "ACTIVE" : "INACTIVE"}</span>
        </div>
      </div>
    );
  }

  if (action_type === "COMMITTEE_CREATED" || action_type === "COMMITTEE_DELETED") {
    const snapshot = action_type === "COMMITTEE_CREATED" ? new_value : old_value;
    const isCreate = action_type === "COMMITTEE_CREATED";
    if (!snapshot) return <div style={{ fontSize: 12, color: "#94a3b8" }}>No snapshot data available.</div>;
    const fields = [
      { key: "finance_year", label: "Finance Year" }, { key: "committee_type", label: "Committee Type" },
      { key: "position", label: "Position" }, { key: "contact", label: "Contact" }, { key: "status", label: "Status" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {fields.filter((f) => snapshot[f.key] != null && snapshot[f.key] !== "").map(({ key, label }) => (
            <div key={key} style={{ background: isCreate ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isCreate ? "#bbf7d0" : "#fecaca"}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{String(snapshot[key])}</div>
            </div>
          ))}
        </div>
        {Array.isArray(snapshot.members) && snapshot.members.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Members ({snapshot.members.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {snapshot.members.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: isCreate ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isCreate ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: isCreate ? "#bbf7d0" : "#fecaca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: isCreate ? "#15803d" : "#b91c1c", flexShrink: 0 }}>
                    {(m.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{m.name}</div>
                    <div style={{ fontSize: 10.5, color: "#64748b" }}>{m.designation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (action_type === "COMMITTEE_UPDATED") {
    if (!old_value && !new_value) return <div style={{ fontSize: 12, color: "#94a3b8" }}>No change details available.</div>;
    const fields        = changed_fields?.length ? changed_fields : Object.keys(new_value || {});
    const scalarFields  = fields.filter((f) => f !== "members");
    const membersChanged = fields.includes("members");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {scalarFields.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr", gap: 10, padding: "0 2px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("Field", lang)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("Before", lang)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("After", lang)}</div>
            </div>
            {scalarFields.map((field) => (
              <div key={field} style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr", alignItems: "start", gap: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 2 }}>{field}</div>
                <div style={{ fontSize: 11.5, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>{String(old_value?.[field] ?? "—")}</div>
                <div style={{ fontSize: 11.5, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>{String(new_value?.[field] ?? "—")}</div>
              </div>
            ))}
          </div>
        )}
        {membersChanged && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>Members — before vs after</div>
            <MembersDiffDetail oldMembers={old_value?.members} newMembers={new_value?.members} />
          </div>
        )}
      </div>
    );
  }

  return <div style={{ fontSize: 12, color: "#94a3b8" }}>No change details available.</div>;
}

function FieldDiffDetail({ log }) {
  const { lang } = useLanguage();
  const fields = log.changed_fields?.length ? log.changed_fields : Object.keys(log.new_value || {});
  if (!fields.length)
    return <div style={{ fontSize: 12, color: "#94a3b8" }}>{log.message || "No change details available."}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr", gap: 10, padding: "0 2px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("Field", lang)}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("Before", lang)}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.7 }}>{t("After", lang)}</div>
      </div>
      {fields.map((field) => (
        <div key={field} style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr", alignItems: "start", gap: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 2 }}>{field}</div>
          <div style={{ fontSize: 11.5, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>{String(log.old_value?.[field] ?? "—")}</div>
          <div style={{ fontSize: 11.5, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>{String(log.new_value?.[field] ?? "—")}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FULL EXPANDED DETAIL PANEL
═══════════════════════════════════════════════════════════════ */
function ExpandedDetailPanel({ log }) {
  const { lang } = useLanguage();

  // ── Route to the correct detail renderer ─────────────────────
  let changeContent;
  const isSessionAction      = log.entity_type === "SESSION";
  const isImportExportAction = ["USERS_BULK_IMPORTED", "USERS_EXPORTED"].includes(log.action_type);
  const isCommitteeAction    = log.action_type?.startsWith("COMMITTEE_");

  if (isSessionAction) {
    changeContent = <SessionDetail log={log} />;
  } else if (isImportExportAction) {
    changeContent = <ImportExportDetail log={log} />;
  } else {
    switch (log.action_type) {
      case "ROLE_PERMISSIONS_CHANGED":
        changeContent = <PermissionDiffDetail log={log} />;
        break;
      case "ROLE_ASSIGNED":
      case "ROLE_REVOKED":
        changeContent = <RoleAssignmentDetail log={log} />;
        break;
      default:
        changeContent = isCommitteeAction
          ? <CommitteeDiffDetail log={log} />
          : <FieldDiffDetail log={log} />;
    }
  }

  const typeMeta = TYPE_META[log.entity_type] || { label: log.entity_type, bg: "#f1f5f9", color: "#64748b" };

  return (
    <div style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0", padding: "20px 22px 24px" }}>

      {/* Actor strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: typeMeta.bg, border: `1.5px solid ${typeMeta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {(() => { const EntIcon = ENTITY_ICON[log.entity_type] || FileText; return <EntIcon size={18} strokeWidth={2} color={typeMeta.color} />; })()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>{log.actor_name || "System"}</div>
          {log.actor_email && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{log.actor_email}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <ActionBadge actionType={log.action_type} />
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: log.status === "SUCCESS" ? "#f0fdf4" : "#fef2f2", border: `1px solid ${log.status === "SUCCESS" ? "#bbf7d0" : "#fecaca"}` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: log.status === "SUCCESS" ? "#22c55e" : "#ef4444" }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: log.status === "SUCCESS" ? "#15803d" : "#b91c1c", letterSpacing: 0.3 }}>{log.status || "SUCCESS"}</span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'JetBrains Mono','Courier New',monospace", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "3px 9px", whiteSpace: "nowrap" }}>
            {new Date(log.created_at).toLocaleString("en-IN", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Changes section */}
      <SectionDivider
        label={t("Changes", lang)}
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
      />
      {changeContent}

      {/* Request context */}
      <RequestContextPanel log={log} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function AuditLogsPage() {
  const { lang } = useLanguage();
  const { accessToken } = useAuth();

  const [activeCategory,  setActiveCategory] = useState(null);
  const [activeCard,      setActiveCard]     = useState(null);
  const [logs,            setLogs]           = useState([]);
  const [summary,         setSummary]        = useState({});
  const [search,          setSearch]         = useState("");
  const [debouncedSearch, setDebounced]      = useState("");
  const [page,            setPage]           = useState(1);
  const [totalPages,      setTotalPages]     = useState(1);
  const [total,           setTotal]          = useState(0);
  const [loading,         setLoading]        = useState(false);
  const [expanded,        setExpanded]       = useState(null);
  const [error,           setError]          = useState(null);
  const LIMIT = 50;

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }), [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); setExpanded(null); }, [activeCategory, activeCard, debouncedSearch]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${BASE_URL}/audit-logs/summary`, { credentials: "include", headers: authHeaders() })
      .then((r) => r.json()).then((r) => r.success && setSummary(r.data)).catch(() => {});
  }, [accessToken, authHeaders]);

  const loadLogs = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (activeCard) {
        params.set("entity_type", activeCard);
      } else if (activeCategory !== null) {
        const catEntities = ALL_ENTITY_CARDS.filter((e) => e.category === activeCategory);
        if (catEntities.length > 0) params.set("entity_types", catEntities.map((e) => e.key).join(","));
      }
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`${BASE_URL}/audit-logs?${params}`, { credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) { setLogs(result.data); setTotalPages(result.pagination.totalPages); setTotal(result.pagination.total); }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [accessToken, activeCategory, activeCard, debouncedSearch, page, authHeaders]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const activeCategoryMeta  = CATEGORY_GROUPS.find((c) => c.key === activeCategory) || CATEGORY_GROUPS[0];
  const activeCardMeta      = ALL_ENTITY_CARDS.find((c) => c.key === activeCard);
  const visibleEntityCards  = activeCategory === null
    ? ALL_ENTITY_CARDS
    : ALL_ENTITY_CARDS.filter((e) => e.category === activeCategory);

  const totalEvents = Object.values(summary).reduce((s, n) => s + (Number(n) || 0), 0);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1200 }}>

      {/* Header */}
      <PageHeader
        breadcrumb={[t("Home", lang), t("Audit", lang), t("Logs", lang)]}
        title={t("Audit Logs", lang)}
        description="Filter by category or entity type. Full history of system events and user actions."
      />

      {/* ── Category Tabs ────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {/* Tab row */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: visibleEntityCards.length > 0 ? 14 : 0 }}>
          {CATEGORY_GROUPS.map((cat) => {
            const isActive = activeCategory === cat.key;
            const catCount = cat.key === null
              ? totalEvents
              : ALL_ENTITY_CARDS
                  .filter((e) => e.category === cat.key)
                  .reduce((s, e) => s + (Number(summary[e.key.toLowerCase()]) || 0), 0);
            return (
              <button
                key={String(cat.key)}
                onClick={() => {
                  const newCat = activeCategory === cat.key ? null : cat.key;
                  setActiveCategory(newCat);
                  // clear entity chip if it doesn't belong to new category
                  if (activeCard && newCat !== null) {
                    const belongs = ALL_ENTITY_CARDS.find((e) => e.key === activeCard)?.category === newCat;
                    if (!belongs) setActiveCard(null);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 10,
                  border: `1.5px solid ${isActive ? cat.accent : "#e2e8f0"}`,
                  background: isActive ? cat.bg : "#f8fafc",
                  color: isActive ? cat.accent : "#64748b",
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s ease",
                  boxShadow: isActive ? `0 2px 8px ${cat.accent}22` : "none",
                  outline: "none",
                }}>
                <span style={{ display: "flex", color: isActive ? cat.accent : "#94a3b8" }}>{cat.icon}</span>
                <span>{cat.label}</span>
                {catCount > 0 && (
                  <span style={{
                    padding: "1px 7px", borderRadius: 10,
                    fontSize: 11, fontWeight: 700,
                    background: isActive ? cat.accent : "#e2e8f0",
                    color: isActive ? "#fff" : "#64748b",
                  }}>{catCount.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Entity chips — only shown when there are chips to display */}
        {visibleEntityCards.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
            {visibleEntityCards.map((entity) => {
              const isSelected = activeCard === entity.key;
              const count = Number(summary[entity.key.toLowerCase()]) || 0;
              return (
                <button
                  key={entity.key}
                  onClick={() => setActiveCard(isSelected ? null : entity.key)}
                  title={entity.description}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 13px", borderRadius: 20,
                    border: `1.5px solid ${isSelected ? entity.accent : "#e2e8f0"}`,
                    background: isSelected ? entity.bg : "#fff",
                    color: isSelected ? entity.accent : "#64748b",
                    fontSize: 12, fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.12s ease",
                    boxShadow: isSelected ? `0 2px 6px ${entity.accent}22` : "none",
                    outline: "none",
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: entity.accent, display: "inline-block", opacity: isSelected ? 1 : 0.45, flexShrink: 0 }} />
                  {entity.label}
                  {count > 0 && (
                    <span style={{
                      padding: "0 6px", borderRadius: 10,
                      fontSize: 10.5, fontWeight: 700,
                      background: isSelected ? entity.accent : "#f1f5f9",
                      color: isSelected ? "#fff" : "#94a3b8",
                    }}>{count.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder={activeCard ? `Search ${activeCardMeta?.label} logs…` : activeCategory ? `Search ${activeCategoryMeta?.label} logs…` : "Search action, message, IP, browser, or actor…"}
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 14px 10px 38px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
        {(activeCard || activeCategory || search) && (
          <button onClick={() => { setActiveCard(null); setActiveCategory(null); setSearch(""); }}
            style={{ padding: "10px 16px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 13, color: "#64748b", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {t("Clear filters", lang)}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={tableCardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "32px 200px 1fr 180px 130px 160px", padding: "11px 20px", background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {["", "Actor", "Message", "Action", "Type", "Timestamp"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{h ? t(h, lang) : h}</div>
          ))}
        </div>

        {loading  && <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("Loading…", lang)}</div>}
        {!loading && error && <div style={{ padding: 40, textAlign: "center", color: "#dc2626", fontSize: 13 }}>{error}</div>}
        {!loading && !error && logs.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("No audit logs found.", lang)}</div>}

        {!loading && !error && logs.map((log, i) => {
          const typeMeta = TYPE_META[log.entity_type] || { label: log.entity_type, bg: "#f1f5f9", color: "#64748b" };
          const isOpen   = expanded === log.id;
          return (
            <div key={log.id} style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : log.id)}>
              <div
                style={{ display: "grid", gridTemplateColumns: "32px 200px 1fr 180px 130px 160px", padding: "13px 20px", alignItems: "center", background: isOpen ? "#f0f9ff" : "transparent", transition: "background 0.12s", borderLeft: isOpen ? "3px solid #3b82f6" : "3px solid transparent" }}
                onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#fafafa"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? "#f0f9ff" : "transparent"; }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: log.status === "SUCCESS" ? "#22c55e" : "#ef4444", boxShadow: log.status === "SUCCESS" ? "0 0 0 2px #dcfce7" : "0 0 0 2px #fee2e2" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{log.actor_name || "System"}</div>
                  {log.actor_email && <div style={{ fontSize: 11, color: "#94a3b8" }}>{log.actor_email.split("@")[0]}</div>}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", paddingRight: 12 }}>{log.message || "—"}</div>
                <div><ActionBadge actionType={log.action_type} /></div>
                <div><span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: typeMeta.bg, color: typeMeta.color }}>{typeMeta.label}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                    {new Date(log.created_at).toLocaleString("en-IN", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>
              {isOpen && <ExpandedDetailPanel log={log} />}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} logs</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "7px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, fontSize: 12, fontFamily: "inherit" }}>{t("← Prev", lang)}</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => { if (idx > 0 && arr[idx - 1] !== p - 1) acc.push("…"); acc.push(p); return acc; }, [])
              .map((p, i) =>
                p === "…" ? <span key={`e-${i}`} style={{ padding: "7px 4px", fontSize: 12, color: "#94a3b8" }}>…</span>
                : <button key={p} onClick={() => setPage(p)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${p === page ? "#d97706" : "#e2e8f0"}`, background: p === page ? "#d97706" : "#fff", color: p === page ? "#fff" : "#475569", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400, fontFamily: "inherit" }}>{p}</button>
              )}
            <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "7px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1, fontSize: 12, fontFamily: "inherit" }}>{t("Next →", lang)}</button>
          </div>
        </div>
      )}
      {totalPages <= 1 && logs.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", textAlign: "right" }}>Showing {logs.length} of {total} logs</div>
      )}
    </div>
  );
}