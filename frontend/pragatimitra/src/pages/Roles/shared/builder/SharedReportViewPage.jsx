import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApi } from "../../../../hooks/useApi";
import { BlockEditor } from "./BlockEditors";

const SLUG = "shared-reports";

const STATUS_COLORS = {
  DRAFT:     { bg: "#fef3c7", text: "#92400e" },
  PUBLISHED: { bg: "#d1fae5", text: "#065f46" },
  ARCHIVED:  { bg: "#f3f4f6", text: "#6b7280" },
};

/* ── Section row — lazy-loads blocks when expanded ─────────────────────────── */
function SectionRow({ section, apiFetch }) {
  const [open,    setOpen]    = useState(false);
  const [blocks,  setBlocks]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (blocks !== null) return; // already loaded
    setLoading(true); setError("");
    try {
      const res  = await apiFetch(`/api/builder/sections/${section.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load section");
      setBlocks(data.data.blocks || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const statusColor = { NOT_STARTED:"#94a3b8", IN_PROGRESS:"#f59e0b", SUBMITTED:"#3b82f6", APPROVED:"#22c55e", UNDER_REVIEW:"#8b5cf6", SENT_BACK:"#ef4444" };
  const statusDot   = statusColor[section.status] || "#cbd5e1";

  return (
    <div style={{
      border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden",
      background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Header row */}
      <button
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "13px 16px",
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: statusDot, flexShrink: 0,
        }} />
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#111827" }}>
          {section.title || "Untitled Section"}
        </span>
        <span style={{ fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>
          {section.status?.replace(/_/g, " ") || "Not Started"}
        </span>
        <span style={{ fontSize: 16, color: "#6b7280", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Blocks content */}
      {open && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 20px", background: "#fafafa" }}>
          {loading && (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>Loading content…</div>
          )}
          {error && (
            <div style={{ color: "#ef4444", fontSize: 13, padding: "8px 0" }}>Error: {error}</div>
          )}
          {blocks !== null && blocks.length === 0 && !loading && (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>No content in this section yet.</div>
          )}
          {blocks !== null && blocks.map(block => (
            <div key={block.id} style={{ marginBottom: 16 }}>
              <BlockEditor
                block={{
                  ...block,
                  translations: block.translations || {},
                }}
                onChange={() => {}}
                readOnly={true}
                lang="en"
                apiFetch={apiFetch}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main shared report view ────────────────────────────────────────────────── */
export default function SharedReportViewPage() {
  const { apiFetch } = useApi();
  const navigate     = useNavigate();
  const location     = useLocation();

  const reportId    = location.state?.reportId    || null;
  const reportTitle = location.state?.reportTitle || "Report";

  const [report,   setReport]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    if (!reportId) { setError("No report selected."); setLoading(false); return; }
    try {
      const res  = await apiFetch(`/api/builder/reports/${reportId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load report");
      setReport(data.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, reportId]);

  useEffect(() => { load(); }, [load]);

  if (!reportId) {
    navigate(`/${SLUG}`, { replace: true });
    return null;
  }

  if (loading) return (
    <div style={{ padding: 32, color: "#94a3b8", fontSize: 14 }}>Loading report…</div>
  );
  if (error) return (
    <div style={{ padding: 32 }}>
      <button
        onClick={() => navigate(`/${SLUG}`)}
        style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}
      >
        ← Back to Shared Reports
      </button>
      <div style={{ color: "#ef4444", fontSize: 14 }}>Error: {error}</div>
    </div>
  );

  const sc       = STATUS_COLORS[report?.status] || STATUS_COLORS.DRAFT;
  const sections = report?.sections || [];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 860, margin: "0 auto" }}>
      {/* Breadcrumb / back */}
      <button
        onClick={() => navigate(`/${SLUG}`)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#6366f1", fontSize: 13, fontWeight: 600, padding: 0,
          marginBottom: 20, fontFamily: "inherit",
        }}
      >
        ← Shared Reports
      </button>

      {/* Report header */}
      <div style={{
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
        padding: "20px 24px", marginBottom: 24,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
              {report.title}
            </h2>
            {report.description && (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>{report.description}</p>
            )}
          </div>
          <span style={{
            background: sc.bg, color: sc.text,
            fontSize: 12, fontWeight: 700, padding: "3px 10px",
            borderRadius: 20, whiteSpace: "nowrap",
          }}>
            {report.status ? report.status.charAt(0) + report.status.slice(1).toLowerCase() : "Draft"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
          {report.academic_year && <span>Year: <strong style={{ color: "#374151" }}>{report.academic_year}</strong></span>}
          {report.report_type   && <span>Type: <strong style={{ color: "#374151" }}>{report.report_type}</strong></span>}
          {report.created_by_name && <span>Created by: <strong style={{ color: "#374151" }}>{report.created_by_name}</strong></span>}
        </div>
      </div>

      {/* Sections */}
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#374151" }}>
        Sections ({sections.length})
      </h3>

      {sections.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 0",
          border: "1.5px dashed #e2e8f0", borderRadius: 10,
          color: "#94a3b8", fontSize: 13,
        }}>
          This report has no sections yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map(section => (
            <SectionRow
              key={section.id}
              section={section}
              apiFetch={apiFetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
