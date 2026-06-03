import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";

const API = "http://localhost:5000/api/kpi";

// Icon map for known card categories
const CATEGORY_ICONS = {
  "Student Performance": "🎓",
  "Placement":           "💼",
  "Admission":           "📋",
  "Research & Publications": "📄",
  "Finance":             "💰",
  "Infrastructure":      "🏛️",
  "Faculty":             "👨‍🏫",
  "Examination":         "📝",
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
        Loading KPI summary…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, color: "#991b1b" }}>
        Could not load KPI summary: {error}
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
        No KPI summary cards yet. Create KPI charts and assign a Dashboard Category to show them here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          KPI Summary
        </div>
        <button
          onClick={fetchSummary}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#94a3b8", padding: "2px 6px", borderRadius: 4 }}
          title="Refresh KPI data"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Group cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: compact ? 8 : 12 }}>
        {groups.map((group, gi) => {
          const color = CARD_COLORS[gi % CARD_COLORS.length];
          const icon  = CATEGORY_ICONS[group.category] || "📊";
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
                <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
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
                          {item.row_count} data point{item.row_count !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: color.accent, fontFamily: "monospace", lineHeight: 1 }}>
                          {fmtVal(primaryVal)}
                        </div>
                        {totalVal !== null && totalVal !== primaryVal && (
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                            total {fmtVal(totalVal)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer count */}
              <div style={{ fontSize: 10, color: color.accent, opacity: 0.7, textAlign: "right" }}>
                {group.items.length} metric{group.items.length !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
