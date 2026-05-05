import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../store/AuthContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ═══════════════════════════════════════════════════════════════
   ENTITY CARDS CONFIG
═══════════════════════════════════════════════════════════════ */
const ENTITY_CARDS = [
  {
    key: "USER", label: "Users",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
    bg: "#ede9fe", accent: "#6d28d9", lightBg: "#f5f3ff",
    description: "User created, updated, deactivated",
  },
  {
    key: "DEPARTMENT", label: "Departments",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>),
    bg: "#d1fae5", accent: "#065f46", lightBg: "#ecfdf5",
    description: "Dept created, settings changed",
  },
  {
    key: "INSTITUTION", label: "Institutions",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>),
    bg: "#dbeafe", accent: "#1d4ed8", lightBg: "#eff6ff",
    description: "Institution registered or updated",
  },
  {
    key: "ROLE", label: "Roles",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
    bg: "#fef3c7", accent: "#d97706", lightBg: "#fffbeb",
    description: "Role created, permissions changed, assigned/revoked",
  },
];

/* ═══════════════════════════════════════════════════════════════
   METADATA MAPS
═══════════════════════════════════════════════════════════════ */
const ACTION_META = {
  USER_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  USER_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  USER_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  DEPT_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  DEPT_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  DEPT_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  DEPT_DEACTIVATED:         { label: "Deactivated",         bg: "#fef3c7", color: "#d97706" },
  DEPARTMENT_CREATED:       { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  DEPARTMENT_UPDATED:       { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  DEPARTMENT_DELETED:       { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  INST_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  INST_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  INST_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  INSTITUTION_CREATED:      { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  INSTITUTION_UPDATED:      { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  INSTITUTION_DELETED:      { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  ROLE_CREATED:             { label: "Created",             bg: "#dcfce7", color: "#15803d" },
  ROLE_UPDATED:             { label: "Updated",             bg: "#dbeafe", color: "#1d4ed8" },
  ROLE_DELETED:             { label: "Deleted",             bg: "#fee2e2", color: "#b91c1c" },
  ROLE_PERMISSIONS_CHANGED: { label: "Permissions Changed", bg: "#fef3c7", color: "#d97706" },
  ROLE_ASSIGNED:            { label: "Assigned to User",    bg: "#ede9fe", color: "#6d28d9" },
  ROLE_REVOKED:             { label: "Revoked from User",   bg: "#ffe4e6", color: "#be123c" },
  DEFAULT:                  { label: "Event",               bg: "#f1f5f9", color: "#64748b" },
};

const TYPE_META = {
  USER:        { label: "User",        bg: "#ede9fe", color: "#6d28d9" },
  DEPARTMENT:  { label: "Department",  bg: "#d1fae5", color: "#065f46" },
  INSTITUTION: { label: "Institution", bg: "#dbeafe", color: "#1d4ed8" },
  ROLE:        { label: "Role",        bg: "#fef3c7", color: "#d97706" },
};

const ENTITY_EMOJI = { USER: "👤", DEPARTMENT: "🏢", INSTITUTION: "🏛️", ROLE: "🛡️" };

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
   3-column flat card grid: IP Address | Browser | User Agent
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

      {/* ── 3-column flat card grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>

        {/* ── 1. IP Address ─────────────────────────────────── */}
        <Card
          label={t("IP Address", lang)}
          accent="#2563eb"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
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

        {/* ── 2. Browser ────────────────────────────────────── */}
        <Card
          label={t("Browser", lang)}
          accent="#7c3aed"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
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

        {/* ── 3. User Agent ─────────────────────────────────── */}
        <Card
          label={t("User Agent", lang)}
          accent="#475569"
          headerIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
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
   BUSINESS DIFF COMPONENTS
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
          <div style={{ fontSize: 11.5, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>
            {String(log.old_value?.[field] ?? "—")}
          </div>
          <div style={{ fontSize: 11.5, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 9px", wordBreak: "break-all", fontFamily: "monospace" }}>
            {String(log.new_value?.[field] ?? "—")}
          </div>
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
  let changeContent;
  switch (log.action_type) {
    case "ROLE_PERMISSIONS_CHANGED": changeContent = <PermissionDiffDetail log={log} />; break;
    case "ROLE_ASSIGNED":
    case "ROLE_REVOKED":            changeContent = <RoleAssignmentDetail log={log} />; break;
    default:                        changeContent = <FieldDiffDetail log={log} />;
  }

  const typeMeta = TYPE_META[log.entity_type] || { label: log.entity_type, bg: "#f1f5f9", color: "#64748b" };

  return (
    <div style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0", padding: "20px 22px 24px" }}>

      {/* Actor strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: typeMeta.bg, border: `1.5px solid ${typeMeta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {ENTITY_EMOJI[log.entity_type] || "📋"}
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

      {/* Changes */}
      <SectionDivider
        label={t("Changes", lang)}
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
      />
      {changeContent}

      {/* Request Context */}
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

  const [activeCard,      setActiveCard]  = useState(null);
  const [logs,            setLogs]        = useState([]);
  const [summary,         setSummary]     = useState({});
  const [search,          setSearch]      = useState("");
  const [debouncedSearch, setDebounced]   = useState("");
  const [page,            setPage]        = useState(1);
  const [totalPages,      setTotalPages]  = useState(1);
  const [total,           setTotal]       = useState(0);
  const [loading,         setLoading]     = useState(false);
  const [expanded,        setExpanded]    = useState(null);
  const [error,           setError]       = useState(null);
  const LIMIT = 15;

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }), [accessToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); setExpanded(null); }, [activeCard, debouncedSearch]);

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
      if (activeCard)      params.set("entity_type", activeCard);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`${BASE_URL}/audit-logs?${params}`, { credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) { setLogs(result.data); setTotalPages(result.pagination.totalPages); setTotal(result.pagination.total); }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [accessToken, activeCard, debouncedSearch, page, authHeaders]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const activeCardMeta = ENTITY_CARDS.find((c) => c.key === activeCard);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#dc262614", borderRadius: 8, padding: "4px 12px", marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>{t("Audit", lang)}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: 0 }}>{t("Audit Logs", lang)}</h1>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: "6px 0 0" }}>Click a card to filter by entity. Full history of system events and user actions.</p>
      </div>

      {/* Entity cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {ENTITY_CARDS.map((card) => {
          const count    = summary[card.key.toLowerCase()] ?? "—";
          const isActive = activeCard === card.key;
          return (
            <button key={card.key} onClick={() => setActiveCard((p) => (p === card.key ? null : card.key))}
              style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 22px", borderRadius: 14, border: `2px solid ${isActive ? card.accent : "#e2e8f0"}`, background: isActive ? card.bg : "#fff", cursor: "pointer", textAlign: "left", outline: "none", transition: "all 0.18s ease", boxShadow: isActive ? `0 4px 16px ${card.accent}22` : "0 1px 4px rgba(0,0,0,0.05)", transform: isActive ? "translateY(-2px)" : "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: isActive ? card.accent : card.lightBg, color: isActive ? "#fff" : card.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>{card.icon}</div>
                <span style={{ fontSize: 26, fontWeight: 700, color: isActive ? card.accent : "#1e293b", lineHeight: 1 }}>{count}</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isActive ? card.accent : "#1e293b", marginBottom: 3 }}>{card.label}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{card.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder={activeCard ? `Search ${activeCardMeta?.label} logs…` : "Search action, message, IP, browser, or actor…"}
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 14px 10px 38px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
        {(activeCard || search) && (
          <button onClick={() => { setActiveCard(null); setSearch(""); }}
            style={{ padding: "10px 16px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 13, color: "#64748b", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {t("Clear filters", lang)}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
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