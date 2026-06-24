import { useState, useEffect } from "react";
import { FileStack, Unlock, Lock, AlertCircle, ClipboardList, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useAcademicYear } from "../../../store/AcademicYearContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { PageContainer, PageHeader, Card, ErrorState } from "../../../ui";

const C = {
  text:    "#1e293b",
  textSub: "#64748b",
  border:  "rgba(37,99,235,0.12)",
  surface: "#ffffff",
  primary: "#2563eb",
};

const card = {
  background: C.surface, border: `0.5px solid ${C.border}`,
  borderRadius: 14, padding: "16px 18px",
  boxShadow: "0 1px 6px rgba(99,102,241,0.07)",
};

function Skel({ w = "100%", h = 14, r = 6, mb = 0 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: "#f1f5f9", marginBottom: mb,
      animation: "ctSkPulse 1.4s ease-in-out infinite" }} />
  );
}

export default function ContributorDashboardPage() {
  const { apiFetch }     = useApi();
  const { user }         = useAuth();
  const { lang }         = useLanguage();
  const navigate         = useNavigate();
  const { selectedYear } = useAcademicYear() || {};

  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");

    apiFetch("/api/form-assignments/dashboard-stats")
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d.success) setStats(d.data);
        else setError(d.message || "Failed to load dashboard.");
      })
      .catch(() => { if (alive) setError("Failed to load dashboard."); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [apiFetch, selectedYear]);

  const s = stats || {};
  const yearLabel = selectedYear ? `${selectedYear}–${Number(selectedYear) + 1}` : null;

  const cards = [
    { label: "Assigned Forms", value: s.assigned_forms ?? 0, icon: <FileStack size={18} />,   color: "#2563eb", bg: "#dbeafe" },
    { label: "Pending Forms",  value: s.pending_forms  ?? 0, icon: <Unlock size={18} />,       color: "#059669", bg: "#ecfdf5" },
    { label: "Locked Forms",   value: s.locked_forms   ?? 0, icon: <Lock size={18} />,         color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Expired Forms",  value: s.expired_forms  ?? 0, icon: <AlertCircle size={18} />,  color: "#dc2626", bg: "#fef2f2" },
  ];

  return (
    <PageContainer style={{ gap: 14 }}>

      <style>{`@keyframes ctSkPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Dashboard", lang)]}
        title={t("Dashboard", lang)}
        description={user?.institutionName || t("Contributor", lang)}
      />

      {error && (
        <Card padding={0}>
          <ErrorState title={t("Failed to load dashboard.", lang)} description={error} />
        </Card>
      )}

      {/* Stat cards — live data from /api/form-assignments/dashboard-stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: c.bg, color: c.color,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                {loading ? <Skel w={36} h={26} r={6} /> : Number(c.value)}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textSub, marginTop: 3 }}>
                {t(c.label, lang)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick access panel */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ClipboardList size={15} color={C.primary} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("Quick Access", lang)}</div>
          {yearLabel && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1e40af",
              background: "#dbeafe", padding: "2px 8px", borderRadius: 20, marginLeft: "auto" }}>
              {yearLabel}
            </span>
          )}
        </div>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2].map(i => <Skel key={i} h={52} r={10} />)}
          </div>
        )}

        {!loading && !error && (s.assigned_forms ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.textSub }}>
            <FileStack size={32} color="#cbd5e1" style={{ display: "block", margin: "0 auto 10px" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {t("No forms assigned yet", lang)}
            </div>
            <div style={{ fontSize: 12, maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
              {t("Your Department Admin will assign forms to you for the selected academic year. Check back after your admin has configured the reporting year.", lang)}
            </div>
          </div>
        )}

        {!loading && !error && (s.assigned_forms ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Forms & Data Entry",  slug: "form-data",      desc: `${s.pending_forms ?? 0} ${t("forms open for data entry", lang)}`,   color: "#059669", bg: "#ecfdf5" },
              { label: "Department Forms",     slug: "form-management",desc: `${t("View and fill department-level forms", lang)}`,               color: "#7c3aed", bg: "#f5f3ff" },
              { label: "My Sections",          slug: "my-sections",    desc: `${t("View your assigned report sections", lang)}`,                  color: "#0891b2", bg: "#ecfeff" },
            ].map((item) => (
              <button
                key={item.slug}
                onClick={() => navigate(`../${item.slug}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  border: `0.5px solid ${C.border}`, borderRadius: 10,
                  padding: "12px 16px", background: "#f8faff",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: item.bg,
                  color: item.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ClipboardList size={15} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{t(item.label, lang)}</div>
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{item.desc}</div>
                </div>
                <ArrowRight size={14} color={C.textSub} />
              </button>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
