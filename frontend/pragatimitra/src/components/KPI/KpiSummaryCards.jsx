import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
import api from "../../services/api";

const API = api.apiUrl("/api/kpi");

// Icon map for known card categories
const CATEGORY_ICONS = {
  "Student Performance":     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
  "Placement":               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  "Admission":               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
  "Research & Publications": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  "Finance":                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  "Infrastructure":          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  "Faculty":                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  "Examination":             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};

const CARD_COLORS = [
  { bg: "#eff6ff", border: "#bfdbfe", accent: "#1d4ed8", light: "#dbeafe" },
  { bg: "#ecfdf5", border: "#a7f3d0", accent: "#059669", light: "#d1fae5" },
  { bg: "#f5f3ff", border: "#c4b5fd", accent: "#7c3aed", light: "#ede9fe" },
  { bg: "#fff7ed", border: "#fed7aa", accent: "#c2410c", light: "#ffedd5" },
  { bg: "#f0f9ff", border: "#bae6fd", accent: "#0369a1", light: "#e0f2fe" },
  { bg: "#fdf2f8", border: "#f9a8d4", accent: "#be185d", light: "#fce7f3" },
];

function fmtVal(v) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + "K";
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

/**
 * KpiSummaryCards
 * Renders grouped KPI metric cards on Institute Admin / Dept Admin dashboards.
 *
 * @param {{ scope?: 'institute'|'department', compact?: boolean }} props
 */
export default function KpiSummaryCards({ compact = false }) {
  const { accessToken } = useAuth();
  const { lang } = useLanguage();
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res  = await fetch(`${API}/dashboard-summary`, { headers, credentials: "include" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load KPI summary");
      setGroups(json.groups || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  if (loading) {
    return (
      <div style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13 }}>
        <span style={{ display:"inline-block", width:14, height:14, borderRadius:"50%", border:"2px solid #e2e8f0", borderTopColor:"#6366f1", animation:"spin .6s linear infinite" }}/>
        {t("Loading KPI summary…", lang)}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, color: "#991b1b" }}>
        {t("Could not load KPI summary: ", lang)}{error}
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
        {t("No KPI summary cards yet. Create KPI charts and assign a Dashboard Category to show them here.", lang)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {t("KPI Summary", lang)}
        </div>
        <button
          onClick={fetchSummary}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#94a3b8", padding: "2px 6px", borderRadius: 4 }}
          title={t("Refresh", lang)}
        >
          ↻ {t("Refresh", lang)}
        </button>
      </div>

      {/* Group cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: compact ? 8 : 12 }}>
        {groups.map((group, gi) => {
          const color = CARD_COLORS[gi % CARD_COLORS.length];
          const icon  = CATEGORY_ICONS[group.category] || <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
          return (
            <div
              key={group.category}
              style={{
                background: color.bg,
                border: `1px solid ${color.border}`,
                borderRadius: 12,
                padding: compact ? "14px 16px" : "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", color: color.accent }}>{icon}</span>
                <div style={{ fontSize: 12, fontWeight: 700, color: color.accent, letterSpacing: "-0.01em" }}>
                  {group.category}
                </div>
              </div>

              {/* Metrics */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map((item) => {
                  const primaryVal = item.primary?.avg ?? null;
                  const totalVal   = item.primary?.total ?? null;
                  return (
                    <div
                      key={item.config_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px 10px",
                        background: "#ffffff",
                        borderRadius: 8,
                        border: `1px solid ${color.border}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                          {lang === "hi"
                            ? `${item.row_count} डेटा बिंदु`
                            : `${item.row_count} data point${item.row_count !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: color.accent, fontFamily: "monospace", lineHeight: 1 }}>
                          {fmtVal(primaryVal)}
                        </div>
                        {totalVal !== null && totalVal !== primaryVal && (
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                            {lang === "hi" ? `कुल ${fmtVal(totalVal)}` : `total ${fmtVal(totalVal)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer count */}
              <div style={{ fontSize: 10, color: color.accent, opacity: 0.7, textAlign: "right" }}>
                {lang === "hi"
                  ? `${group.items.length} मेट्रिक`
                  : `${group.items.length} metric${group.items.length !== 1 ? "s" : ""}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
