import React, { useState, useEffect, useCallback } from "react";
import {
  ClipboardList, DoorOpen, Lock, Clock, CalendarRange, ArrowRight, FileText,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useAcademicYear } from "../../../store/AcademicYearContext";
import KpiDashboardPanel from "../../../components/KPI/KpiDashboardPanel";
import PageHeader from "../../../components/shared/PageHeader";
import { isAuthError } from "../../../components/shared/formUtils";

/* Enterprise SaaS palette — shared with Institution Admin. */
const C = {
  primary: "#2563eb",
  success: "#16a34a",
  warning: "#f59e0b",
  danger:  "#dc2626",
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  bg:      "#f5f7fa",
  surface: "#ffffff",
};

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
};

function titleCase(s = "") {
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DeptAdminDashboardPage() {
  const { lang } = useLanguage();
  const { apiFetch } = useApi();
  const { user } = useAuth() || {};
  const { academicYear, selectedYear, years } = useAcademicYear() || {};

  const [forms, setForms]     = useState([]);
  const [loading, setLoading] = useState(true);

  const yearAware = (years?.length || 0) > 0;

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const qs   = selectedYear != null ? `?year=${selectedYear}` : "";
      const res  = await apiFetch(`/api/forms/institution-forms${qs}`);
      const data = await res.json();
      if (data.success) {
        const all = data.forms || [];
        setForms(yearAware ? all.filter((f) => (f.lifecycle_status ?? "active") === "active") : all);
      }
    } catch (err) {
      if (!isAuthError(err)) { /* dashboard stays empty on error */ }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedYear, yearAware]);

  useEffect(() => { loadForms(); }, [loadForms]);

  /* ── Derived, real status counts (mirrors the Forms & Data page) ── */
  const now       = Date.now();
  const isExpired = (f) => f.deadline_at && new Date(f.deadline_at).getTime() <= now;
  const total   = forms.length;
  const locked  = forms.filter((f) => f.is_locked).length;
  const expired = forms.filter((f) => !f.is_locked && isExpired(f)).length;
  const open    = forms.filter((f) => !f.is_locked && !isExpired(f)).length;

  const deptName =
    user?.department?.name || user?.departmentName || user?.department_name ||
    user?.department || "Your Department";
  const personName = user?.name || user?.fullName || "there";

  const stats = [
    { label: "Assigned Forms", value: total,   color: C.primary, bg: "#eff4ff", Icon: ClipboardList, hint: "Accessible to your dept" },
    { label: "Open",           value: open,    color: C.success, bg: "#f0fdf4", Icon: DoorOpen,      hint: "Available to fill" },
    { label: "Locked",         value: locked,  color: C.danger,  bg: "#fef2f2", Icon: Lock,          hint: "View-only" },
    { label: "Expired",        value: expired, color: C.warning, bg: "#fffbeb", Icon: Clock,         hint: "Past deadline" },
  ];

  /* Up-next: nearest open deadlines first, then the rest. */
  const upcoming = [...forms]
    .sort((a, b) => {
      const ad = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity;
      const bd = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity;
      return ad - bd;
    })
    .slice(0, 6);

  function statusBadge(f) {
    if (f.is_locked)   return { label: "LOCKED",  color: C.danger,  bg: "#fef2f2" };
    if (isExpired(f))  return { label: "EXPIRED", color: C.warning, bg: "#fffbeb" };
    return { label: "OPEN", color: C.success, bg: "#f0fdf4" };
  }

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", background: C.bg, minHeight: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), t("Dashboard", lang)]}
        title={t("Department Dashboard", lang)}
        description={`${titleCase(deptName)}${academicYear ? ` · Academic Year ${academicYear}` : ""}`}
      />

      {/* Welcome banner */}
      <div style={{ ...card, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>
            Welcome back, {personName}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Here’s what needs your attention in {titleCase(deptName)}.
          </div>
        </div>
        {academicYear && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#eff4ff", color: C.primary, border: `1px solid ${C.primary}22`, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700 }}>
            <CalendarRange size={16} /> {academicYear}
          </div>
        )}
      </div>

      {/* Stat cards — real form counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {stats.map(({ label, value, color, bg, Icon, hint }) => (
          <div key={label} style={{ ...card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} strokeWidth={1.9} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1, letterSpacing: -0.5 }}>
                {loading ? "—" : value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 5 }}>{t(label, lang)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{t(hint, lang)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* KPI panel — real, configurable charts */}
      <div style={{ ...card, padding: "18px 20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("KPI Overview", lang)}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          Charts from KPIs pinned to the dashboard — configure in KPI Charts.
        </div>
        <KpiDashboardPanel />
      </div>

      {/* Up next — real forms with deadlines/status */}
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid #eef2f6`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t("Your Forms", lang)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {loading ? "Loading…" : `${total} form${total !== 1 ? "s" : ""}`}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>Loading forms…</div>
        ) : upcoming.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 24px", color: C.muted }}>
            <div style={{ width: 52, height: 52, borderRadius: 13, margin: "0 auto 14px", background: "#f1f5f9", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={24} strokeWidth={1.6} color={C.muted} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#475569", marginBottom: 4 }}>No forms assigned yet</div>
            <div style={{ fontSize: 12.5 }}>Forms shared with your department will appear here.</div>
          </div>
        ) : (
          <div>
            {upcoming.map((f, i) => {
              const b = statusBadge(f);
              const deadline = f.deadline_at
                ? new Date(f.deadline_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : "No deadline";
              return (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eff4ff", color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                    {String(f.form_name).slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {titleCase(f.form_name)}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
                      <Clock size={12} /> {deadline}
                    </div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: b.bg, color: b.color, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.color }} />
                    {b.label}
                  </span>
                </div>
              );
            })}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted }}>
              <span>Open <strong style={{ color: C.text }}>Form Data</strong> from the sidebar to fill or manage records</span>
              <ArrowRight size={14} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
