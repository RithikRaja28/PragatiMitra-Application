import React, { useState, useEffect, useCallback } from "react";
import { useApi }  from "../../../../hooks/useApi";
import SectionEditorPage from "./SectionEditorPage";

const STATUS_CFG = {
  NOT_STARTED:  { bg: "#f1f5f9", color: "#64748b",  label: "Not Started",  icon: "📋" },
  IN_PROGRESS:  { bg: "#dbeafe", color: "#1d4ed8",  label: "In Progress",  icon: "✏️" },
  SUBMITTED:    { bg: "#fef3c7", color: "#d97706",  label: "Submitted",    icon: "📤" },
  UNDER_REVIEW: { bg: "#ede9fe", color: "#6d28d9",  label: "Under Review", icon: "🔍" },
  APPROVED:     { bg: "#dcfce7", color: "#15803d",  label: "Approved",     icon: "✅" },
  SENT_BACK:    { bg: "#fee2e2", color: "#b91c1c",  label: "Sent Back",    icon: "🔄" },
  LOCKED:       { bg: "#e2e8f0", color: "#475569",  label: "Locked",       icon: "🔒" },
};

const ROLE_CFG = {
  OWNER:       { bg: "#ede9fe", color: "#6d28d9" },
  CONTRIBUTOR: { bg: "#dbeafe", color: "#1d4ed8" },
  REVIEWER:    { bg: "#dcfce7", color: "#15803d" },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.NOT_STARTED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = ROLE_CFG[role] || ROLE_CFG.CONTRIBUTOR;
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.5,
      background: r.bg, color: r.color,
    }}>
      {role || "CONTRIBUTOR"}
    </span>
  );
}

function DueBadge({ dueAt }) {
  if (!dueAt) return null;
  const d    = new Date(dueAt);
  const now  = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  const overdue = diff < 0;
  const soon    = diff >= 0 && diff <= 3;
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: overdue ? "#fee2e2" : soon ? "#fff7ed" : "#f1f5f9",
      color: overdue ? "#b91c1c" : soon ? "#c2410c" : "#64748b",
    }}>
      {overdue ? `${Math.abs(diff)}d overdue` : diff === 0 ? "Due today" : `Due in ${diff}d`}
    </span>
  );
}

function SectionCard({ section, onEdit }) {
  const sc     = STATUS_CFG[section.status] || STATUS_CFG.NOT_STARTED;
  const canEdit = ["NOT_STARTED", "IN_PROGRESS", "SENT_BACK"].includes(section.status);

  return (
    <div style={{
      background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 12,
      padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ width: 4, height: 50, borderRadius: 99, background: sc.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{section.title}</span>
          <StatusBadge status={section.status} />
          <RoleBadge role={section.assignment_role} />
          <DueBadge dueAt={section.due_at} />
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {section.report_title}
          {section.report_type && ` · ${section.report_type}`}
          {section.academic_year && ` · ${section.academic_year}`}
        </div>
        {section.status === "SENT_BACK" && (
          <div style={{ marginTop: 5, fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
            🔄 Sent back — please update and resubmit
          </div>
        )}
      </div>

      <button
        onClick={() => onEdit(section)}
        style={{
          padding: "8px 18px",
          background: canEdit ? "#7c3aed" : "#f1f5f9",
          color: canEdit ? "#fff" : "#64748b",
          border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: "pointer", flexShrink: 0,
        }}
      >
        {canEdit ? "Edit" : "View"}
      </button>
    </div>
  );
}

export default function MyAssignedSectionsPage() {
  const { apiFetch } = useApi();

  const [sections,     setSections]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState("");
  const [editing,      setEditing]      = useState(null);
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res  = await apiFetch("/api/builder/sections/assigned");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setSections(json.data || []);
    } catch (ex) {
      setErr(ex.message || "Failed to load your sections");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  if (editing) {
    return (
      <SectionEditorPage
        sectionId={editing.id}
        reportTitle={editing.report_title}
        onBack={() => { setEditing(null); load(); }}
      />
    );
  }

  const filtered = filterStatus ? sections.filter(s => s.status === filterStatus) : sections;

  const byReport = filtered.reduce((acc, s) => {
    const key = s.report_id;
    if (!acc[key]) acc[key] = {
      report_title:  s.report_title,
      report_type:   s.report_type,
      academic_year: s.academic_year,
      sections: [],
    };
    acc[key].sections.push(s);
    return acc;
  }, {});

  const groups = Object.values(byReport);

  const counts  = sections.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
  const pending = (counts.NOT_STARTED || 0) + (counts.IN_PROGRESS || 0) + (counts.SENT_BACK || 0);

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 900 }}>

      {/* header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#ede9fe", borderRadius: 8, padding: "3px 10px", marginBottom: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1 }}>
            My Sections
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.3px", marginBottom: 4 }}>
          My Assigned Sections
        </h1>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          Report sections assigned directly to you
        </p>
      </div>

      {/* summary chips */}
      {!loading && sections.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total",     value: sections.length,       bg: "#f1f5f9", color: "#475569" },
            { label: "Action needed", value: pending,           bg: pending ? "#fff7ed" : "#f1f5f9", color: pending ? "#c2410c" : "#94a3b8" },
            { label: "Submitted", value: counts.SUBMITTED || 0, bg: "#dbeafe", color: "#1d4ed8" },
            { label: "Approved",  value: counts.APPROVED  || 0, bg: "#dcfce7", color: "#15803d" },
          ].map(c => (
            <div key={c.label} style={{ padding: "8px 16px", borderRadius: 10, background: c.bg, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</span>
              <span style={{ fontSize: 12, color: c.color, fontWeight: 500 }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* status filter */}
      {!loading && sections.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "SENT_BACK"].map(s => {
            const cfg    = s ? STATUS_CFG[s] : null;
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: active ? "none" : "1px solid #e2e8f0",
                background: active ? (cfg?.bg || "#1e293b") : "#fff",
                color: active ? (cfg?.color || "#fff") : "#64748b",
                cursor: "pointer",
              }}>
                {s ? (STATUS_CFG[s]?.label || s) : "All"}
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>
          Loading your sections…
        </div>
      )}

      {!loading && err && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, fontSize: 14 }}>
          {err}
        </div>
      )}

      {!loading && !err && sections.length === 0 && (
        <div style={{
          background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
          borderRadius: 14, padding: "60px 40px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            No sections assigned yet
          </div>
          <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 360, margin: "0 auto" }}>
            When an administrator assigns you to a report section, it will appear here.
          </p>
        </div>
      )}

      {!loading && !err && groups.map(group => (
        <div key={group.report_title} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: 17 }}>📄</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{group.report_title}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {[group.report_type, group.academic_year].filter(Boolean).join(" · ") || "Report"}
              </div>
            </div>
            <span style={{
              marginLeft: "auto", padding: "2px 10px", background: "#f1f5f9",
              borderRadius: 20, fontSize: 11, color: "#64748b", fontWeight: 600,
            }}>
              {group.sections.length} section{group.sections.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {group.sections.map(s => (
              <SectionCard key={s.id} section={s} onEdit={setEditing} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
