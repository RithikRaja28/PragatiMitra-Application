import React, { useState, useEffect } from "react";
import { useApi } from "../../../hooks/useApi";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { PageContainer, PageHeader, Toolbar, Select, Card, EmptyState, ErrorState } from "../../../ui";

const C = {
  primary:   "#2563eb",
  primaryLt: "#dbeafe",
  text:      "#1e293b",
  textSub:   "#64748b",
  border:    "rgba(37,99,235,0.12)",
  bg:        "#f8f9fb",
  surface:   "#ffffff",
};

/* Section status enum → label + badge colors (matches the builder status set). */
const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  bg: "#f1f5f9", color: "#475569" },
  IN_PROGRESS:  { label: "In Progress",  bg: "#fef3c7", color: "#92400e" },
  SUBMITTED:    { label: "Submitted",    bg: "#d1fae5", color: "#065f46" },
  UNDER_REVIEW: { label: "Under Review", bg: "#dbeafe", color: "#1e40af" },
  APPROVED:     { label: "Approved",     bg: "#dcfce7", color: "#166534" },
  SENT_BACK:    { label: "Sent Back",    bg: "#fee2e2", color: "#991b1b" },
  LOCKED:       { label: "Locked",       bg: "#e2e8f0", color: "#475569" },
};
const STATUS_FLOW = ["IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED"];

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function SubmissionsPage() {
  const { lang }     = useLanguage();
  const { apiFetch } = useApi();

  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  /* Live, user-scoped sections — same endpoint as "My Assigned Sections". */
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    apiFetch("/api/builder/sections/assigned")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.success) setSections(d.data || []);
        else setError(d.message || "Failed to load submissions.");
      })
      .catch(() => { if (alive) setError("Failed to load submissions."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiFetch]);

  const filtered = statusFilter ? sections.filter((s) => s.status === statusFilter) : sections;

  return (
    <PageContainer>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), t("Submissions", lang)]}
        title={t("My Submissions", lang)}
        description="Track your section submissions through the approval pipeline."
      />

      {/* Status flow legend (the section approval stages) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
        padding: "10px 16px", background: C.surface, borderRadius: 10, border: `0.5px solid ${C.border}`,
        overflowX: "auto" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
          letterSpacing: "0.07em", marginRight: 4, whiteSpace: "nowrap" }}>{t("Pipeline:", lang)}</span>
        {STATUS_FLOW.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
              background: STATUS_META[s].bg, color: STATUS_META[s].color }}>{STATUS_META[s].label}</span>
            {i < STATUS_FLOW.length - 1 && <span style={{ color: "#cbd5e1", fontSize: 12 }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Filters */}
      <Toolbar>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180, height: 40 }}>
          <option value="">{t("All Statuses", lang)}</option>
          {Object.entries(STATUS_META).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </Select>
      </Toolbar>

      {!loading && error && (
        <Card padding={0}><ErrorState title="Couldn’t load submissions" description={error} /></Card>
      )}

      {loading && (
        <div style={{ padding: "60px 0", textAlign: "center", fontSize: 14, color: C.textSub }}>{t("Loading", lang)}…</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" />
              </svg>
            }
            title={statusFilter ? t("No submissions match the current filter.", lang) : t("No submissions yet", lang)}
            description={statusFilter ? "" : t("Sections you work on will appear here with their approval status.", lang)}
          />
        </Card>
      )}

      {/* Table — live */}
      {!loading && !error && filtered.length > 0 && (
        <Card padding={0} style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Section", "Report", "Deadline", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "12px 16px", textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>
                    {t(h, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const m = STATUS_META[s.status] || STATUS_META.NOT_STARTED;
                const overdue = s.due_at && new Date(s.due_at).getTime() < Date.now() && s.status !== "APPROVED";
                return (
                  <tr key={s.id}>
                    <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 13, fontWeight: 600, color: C.text }}>{s.title}</td>
                    <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: C.textSub }}>
                      {s.report_title}{s.academic_year ? ` · ${s.academic_year}` : ""}
                    </td>
                    <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: overdue ? "#dc2626" : C.textSub, fontWeight: overdue ? 600 : 400 }}>
                      {fmtDate(s.due_at)}
                    </td>
                    <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                        background: m.bg, color: m.color }}>{m.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
