import React, { useState, useEffect } from "react";
import { FileStack, FileCheck2, Clock, CheckCircle2, Users, Activity } from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useAcademicYear } from "../../../store/AcademicYearContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import PageHeader from "../../../components/shared/PageHeader";

/* Part 2 — data-driven Hospital / Finance dashboard. One small component, fed by
   GET /api/dashboard/summary (domain-scoped, live DB). No academic widgets, no
   static numbers. The `domain` prop only affects labels/breadcrumb; the data
   always comes from the server scoped to the logged-in user's own domain. */

const C = {
  text: "#1e293b", textSub: "#64748b", border: "rgba(37,99,235,0.12)",
  bg: "#f8f9fb", surface: "#fff",
};
const card = {
  background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14,
  padding: "16px 18px", boxShadow: "0 1px 6px rgba(99,102,241,0.07)",
};

const DOMAIN_META = {
  hospital: { module: "Hospital", title: "Hospital Dashboard", records: "Completed Records" },
  finance:  { module: "Finance",  title: "Finance Dashboard",  records: "Submitted Records" },
  academic: { module: "Institution", title: "Dashboard",       records: "Records" },
};

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function DomainDashboardPage({ domain: domainProp }) {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { selectedYear } = useAcademicYear() || {};

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    apiFetch("/api/dashboard/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.success) setData(d);
        else setError(d.message || "Failed to load dashboard.");
      })
      .catch(() => { if (alive) setError("Failed to load dashboard."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiFetch, selectedYear]);

  const domain = domainProp || data?.domain || "academic";
  const meta   = DOMAIN_META[domain] || DOMAIN_META.academic;
  const m      = data?.metrics || {};
  const subtitle = user?.institutionName || meta.module;

  const cards = [
    { label: "Total Forms",       value: m.total_forms,       icon: <FileStack size={18} />,   color: "#2563eb", bg: "#dbeafe" },
    { label: "Active Forms",      value: m.active_forms,      icon: <FileCheck2 size={18} />,  color: "#059669", bg: "#ecfdf5" },
    { label: "Pending Deadlines", value: m.pending_deadlines, icon: <Clock size={18} />,       color: "#d97706", bg: "#fffbeb" },
    { label: meta.records,        value: m.total_records,     icon: <CheckCircle2 size={18} />, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Assigned Users",    value: m.assigned_users,    icon: <Users size={18} />,       color: "#0891b2", bg: "#ecfeff" },
  ];

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column", gap: 14, background: C.bg, minHeight: "100vh" }}>

      <PageHeader
        breadcrumb={[t("Home", lang), t(meta.module, lang), t("Dashboard", lang)]}
        title={t(meta.title, lang)}
        description={subtitle}
      />

      {error && (
        <div style={{ ...card, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }}>{error}</div>
      )}

      {/* Stat cards — live, domain-scoped */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: c.bg, color: c.color,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                {loading ? "…" : Number(c.value ?? 0)}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textSub, marginTop: 3 }}>{t(c.label, lang)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Activity size={16} color="#2563eb" />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("Recent Activity", lang)}</div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12.5, color: C.textSub }}>{t("Loading", lang)}…</div>
        ) : (data?.recent_activity?.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.recent_activity.map((a, i) => (
              <div key={a.form_name + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {a.form_name.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 1 }}>
                    {Number(a.record_count || 0)} {t("records", lang)}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: C.textSub }}>{fmtDate(a.last_updated)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.textSub }}>{t("No recent activity yet.", lang)}</div>
        ))}
      </div>
    </div>
  );
}
