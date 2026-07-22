import { useState, useEffect } from "react";
import { FileStack, Unlock, Lock, AlertCircle, Activity, BarChart2 } from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useAcademicYear } from "../../../store/AcademicYearContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { PageContainer, PageHeader, Card, ErrorState } from "../../../ui";
import KpiDashboardPanel from "../../../components/KPI/KpiDashboardPanel";

const C = {
  text:    "#1e293b",
  textSub: "#64748b",
  border:  "rgba(37,99,235,0.12)",
  surface: "#ffffff",
};

const card = {
  background:   C.surface,
  border:       `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding:      "16px 18px",
  boxShadow:    "0 1px 6px rgba(99,102,241,0.07)",
};

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function InstitutionAdminOverviewPage() {
  const { apiFetch }                   = useApi();
  const { user }                       = useAuth();
  const { lang }                       = useLanguage();
  const { selectedYear, academicYear } = useAcademicYear() || {};

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  /* Re-fetch whenever academic year changes — apiFetch sends X-Academic-Year
     header automatically from AcademicYearContext so the backend year-scopes
     all metrics without an extra query param. */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
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

  const m = data?.metrics || {};

  const cards = [
    { label: "Assigned Forms", value: m.assigned_forms ?? m.total_forms,  icon: <FileStack size={18} />,   color: "#2563eb", bg: "#dbeafe" },
    { label: "Open Forms",     value: m.open_forms     ?? m.active_forms, icon: <Unlock size={18} />,      color: "#059669", bg: "#ecfdf5" },
    { label: "Locked Forms",   value: m.locked_forms   ?? 0,              icon: <Lock size={18} />,        color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Expired Forms",  value: m.expired_forms  ?? 0,              icon: <AlertCircle size={18} />, color: "#dc2626", bg: "#fef2f2" },
  ];

  return (
    <PageContainer style={{ gap: 14 }}>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Institution", lang), t("Dashboard", lang)]}
        title={t("Institution Overview", lang)}
        description={user?.institutionName || (academicYear ? `Academic Year ${academicYear}` : "Institution Dashboard")}
      />

      {error && (
        <Card padding={0}>
          <ErrorState title={t("Failed to load dashboard.", lang)} description={error} />
        </Card>
      )}

      {/* 4 form-stat cards — live from /api/dashboard/summary, refreshes on year change */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, background: c.bg, color: c.color,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                {loading ? "…" : Number(c.value ?? 0)}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textSub, marginTop: 3 }}>
                {t(c.label, lang)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity — live from /api/dashboard/summary.recent_activity */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Activity size={16} color="#2563eb" />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("Recent Activity", lang)}</div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12.5, color: C.textSub }}>{t("Loading", lang)}…</div>
        ) : data?.recent_activity?.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.recent_activity.map((a, i) => (
              <div
                key={a.form_name + i}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                }}
              >
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
        )}
      </div>

      {/* KPI Dashboard Panel — institution-scoped, year-aware */}
      <div style={{ ...card, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <BarChart2 size={15} color="#2563eb" />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("KPI Overview", lang)}</div>
        </div>
        <div style={{ fontSize: 11, color: C.textSub, marginBottom: 12 }}>
          {t("Charts from KPIs pinned to the dashboard — configure in KPI Charts", lang)}
        </div>
        <KpiDashboardPanel scope="institute" />
      </div>

    </PageContainer>
  );
}
