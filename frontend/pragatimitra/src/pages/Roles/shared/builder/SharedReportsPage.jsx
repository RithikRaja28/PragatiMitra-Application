import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../../../hooks/useApi";

const SLUG = "shared-reports";

const STATUS_COLORS = {
  DRAFT:     { bg: "#fef3c7", text: "#92400e" },
  PUBLISHED: { bg: "#d1fae5", text: "#065f46" },
  ARCHIVED:  { bg: "#f3f4f6", text: "#6b7280" },
};

function statusLabel(s) {
  if (!s) return "Draft";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function SharedReportsPage() {
  const { apiFetch } = useApi();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res  = await apiFetch("/api/builder/reports/shared");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load");
        setReports(data.data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [apiFetch]);

  function openReport(report) {
    navigate(`/${SLUG}/view`, { state: { reportId: report.id, reportTitle: report.title } });
  }

  if (loading) return (
    <div style={{ padding: 32, color: "#94a3b8", fontSize: 14 }}>Loading shared reports…</div>
  );
  if (error) return (
    <div style={{ padding: 32, color: "#ef4444", fontSize: 14 }}>Error: {error}</div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>
          Shared Reports
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          Reports shared with your role for view-only access.
        </p>
      </div>

      {reports.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 0",
          border: "1.5px dashed #e2e8f0", borderRadius: 12,
          color: "#94a3b8", fontSize: 14,
        }}>
          No reports have been shared with your role yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
          {reports.map(r => {
            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.DRAFT;
            return (
              <div key={r.id} style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "18px 20px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", lineHeight: 1.4 }}>
                    {r.title}
                  </div>
                  <span style={{
                    flexShrink: 0,
                    background: sc.bg, color: sc.text,
                    fontSize: 11, fontWeight: 700, padding: "2px 8px",
                    borderRadius: 20, whiteSpace: "nowrap",
                  }}>
                    {statusLabel(r.status)}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 3 }}>
                  {r.academic_year && (
                    <span>Year: <strong style={{ color: "#374151" }}>{r.academic_year}</strong></span>
                  )}
                  {r.cycle_name && (
                    <span>Cycle: <strong style={{ color: "#374151" }}>{r.cycle_name}</strong></span>
                  )}
                  {r.created_by_name && (
                    <span>By: <strong style={{ color: "#374151" }}>{r.created_by_name}</strong></span>
                  )}
                  {r.report_type && (
                    <span>Type: <strong style={{ color: "#374151" }}>{r.report_type}</strong></span>
                  )}
                </div>

                <button
                  onClick={() => openReport(r)}
                  style={{
                    marginTop: "auto",
                    padding: "7px 0", borderRadius: 8,
                    border: "1.5px solid #6366f1",
                    background: "#fff", color: "#6366f1",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit", transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#6366f1"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#6366f1"; }}
                >
                  View Report
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
