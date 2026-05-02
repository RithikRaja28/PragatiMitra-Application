import React, { useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#d97706",
  primaryLt: "#fef3c7",
  text:      "#1c1917",
  textSub:   "#78716c",
  border:    "rgba(217,119,6,0.13)",
  bg:        "#fffbeb",
  surface:   "#ffffff",
};

const STAGE_ORDER = ["Draft", "HoD Review", "Publication Review", "Director Review", "Approved"];

const STAGE_STYLE = {
  "HoD Review":        { bg: "#dbeafe", color: "#1e40af" },
  "Publication Review":{ bg: "#ede9fe", color: "#5b21b6" },
  "Director Review":   { bg: "#fef3c7", color: "#92400e" },
  "Approved":          { bg: "#dcfce7", color: "#166534" },
  "Sent Back":         { bg: "#fee2e2", color: "#991b1b" },
};

const STATUS_STYLE = {
  "Pending":   { bg: "#fef3c7", color: "#92400e" },
  "Approved":  { bg: "#dcfce7", color: "#166534" },
  "Sent Back": { bg: "#fee2e2", color: "#991b1b" },
  "In Review": { bg: "#dbeafe", color: "#1e40af" },
};

const SUBMISSIONS = [
  {
    id: 1, section: "Lab Reports", date: "2026-04-25", stage: "Approved", status: "Approved",
    timeline: [
      { stage: "Draft",              date: "Apr 15", actor: "A. Pillai",       done: true  },
      { stage: "HoD Review",        date: "Apr 17", actor: "Dept. HoD",      done: true  },
      { stage: "Publication Review", date: "Apr 20", actor: "Pub. Cell",      done: true  },
      { stage: "Director Review",   date: "Apr 25", actor: "Director",        done: true  },
      { stage: "Approved",          date: "Apr 25", actor: "Director",        done: true  },
    ],
  },
  {
    id: 2, section: "Ayurvedic Principles", date: "2026-04-29", stage: "Publication Review", status: "In Review",
    timeline: [
      { stage: "Draft",              date: "Apr 20", actor: "Dr. Rao",        done: true  },
      { stage: "HoD Review",        date: "Apr 23", actor: "Dept. HoD",      done: true  },
      { stage: "Publication Review", date: "Apr 29", actor: "Pub. Cell",      done: false },
      { stage: "Director Review",   date: "—",      actor: "Director",        done: false },
      { stage: "Approved",          date: "—",      actor: "Director",        done: false },
    ],
  },
  {
    id: 3, section: "Clinical Studies", date: "2026-04-22", stage: "HoD Review", status: "Sent Back",
    timeline: [
      { stage: "Draft",              date: "Apr 18", actor: "R. Menon",       done: true  },
      { stage: "HoD Review",        date: "Apr 22", actor: "Dept. HoD",      done: true, sentBack: true },
      { stage: "Publication Review", date: "—",      actor: "Pub. Cell",      done: false },
      { stage: "Director Review",   date: "—",      actor: "Director",        done: false },
      { stage: "Approved",          date: "—",      actor: "Director",        done: false },
    ],
    sentBackReason: "Patient data anonymization required.",
  },
];

function ApprovalTimeline({ submission }) {
  const { lang } = useLanguage();
  return (
    <div style={{ padding: "14px 16px", background: "#fff",
      borderRadius: 12, border: `1px solid ${C.border}`,
      boxShadow: "0 8px 28px rgba(0,0,0,0.1)", minWidth: 300, maxWidth: 360,
      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
        {t("Approval Timeline", lang)} — {submission.section}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {submission.timeline.map((step, i) => {
          const isLast = i === submission.timeline.length - 1;
          const isCurrent = !step.done && (i === 0 || submission.timeline[i - 1].done);
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Timeline line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10,
                  background: step.done ? (step.sentBack ? "#dc2626" : "#059669") : isCurrent ? C.primary : "#e2e8f0",
                  color: step.done || isCurrent ? "#fff" : "#94a3b8",
                  fontWeight: 700 }}>
                  {step.done && !step.sentBack ? "✓" : step.sentBack ? "✕" : i + 1}
                </div>
                {!isLast && (
                  <div style={{ width: 1.5, height: 24, background: step.done ? "#059669" : "#e2e8f0" }} />
                )}
              </div>
              {/* Step content */}
              <div style={{ paddingBottom: isLast ? 0 : 8, paddingTop: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600,
                  color: step.done ? (step.sentBack ? "#dc2626" : C.text) : "#94a3b8" }}>
                  {step.stage}
                  {step.sentBack && (
                    <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 600, color: "#dc2626",
                      background: "#fee2e2", padding: "1px 6px", borderRadius: 20 }}>{t("Sent Back", lang)}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                  {step.date !== "—" ? `${step.date} · ` : ""}{step.actor}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {submission.sentBackReason && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#fef2f2",
          borderRadius: 8, border: "0.5px solid #fecdd3" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#991b1b",
            textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{t("Sent Back Reason", lang)}</div>
          <div style={{ fontSize: 11, color: "#dc2626" }}>{submission.sentBackReason}</div>
        </div>
      )}
    </div>
  );
}

export default function SubmissionsPage() {
  const { lang } = useLanguage();
  const [hoveredId, setHoveredId] = useState(null);
  const [filters,   setFilters]   = useState({ stage: "", status: "" });

  const filtered = SUBMISSIONS.filter(s => {
    if (filters.stage  && s.stage  !== filters.stage)  return false;
    if (filters.status && s.status !== filters.status) return false;
    return true;
  });

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: C.bg, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Submissions", lang)}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("My Submissions", lang)}</h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>
          Track section submissions through the approval pipeline — hover a row to see the full timeline
        </p>
      </div>

      {/* Stage progress legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
        padding: "10px 16px", background: C.surface, borderRadius: 10, border: `0.5px solid ${C.border}`,
        overflowX: "auto" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
          letterSpacing: "0.07em", marginRight: 4, whiteSpace: "nowrap" }}>{t("Pipeline:", lang)}</span>
        {STAGE_ORDER.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
              background: STAGE_STYLE[s]?.bg || "#f1f5f9",
              color: STAGE_STYLE[s]?.color || "#475569" }}>{s}</span>
            {i < STAGE_ORDER.length - 1 && (
              <span style={{ color: "#cbd5e1", fontSize: 12 }}>→</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <select value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
          <option value="">{t("All Stages", lang)}</option>
          {STAGE_ORDER.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
          <option value="">{t("All Statuses", lang)}</option>
          <option value="In Review">{t("In Review", lang)}</option>
          <option value="Approved">{t("Approved", lang)}</option>
          <option value="Sent Back">{t("Sent Back", lang)}</option>
          <option value="Pending">{t("Pending", lang)}</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(217,119,6,0.06)", overflow: "visible" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafaf9" }}>
              {["Section", "Submission Date", "Current Stage", "Status", ""].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "12px 16px", textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>
                  {h ? t(h, lang) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: C.textSub }}>
                {t("No submissions match the current filters.", lang)}
              </td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.id} style={{ position: "relative", cursor: "default" }}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}>
                <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 13, fontWeight: 600, color: C.text }}>{s.section}</td>
                <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{s.date}</td>
                <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: STAGE_STYLE[s.stage]?.bg || "#f1f5f9",
                    color: STAGE_STYLE[s.stage]?.color || "#475569" }}>{s.stage}</span>
                </td>
                <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: STATUS_STYLE[s.status]?.bg, color: STATUS_STYLE[s.status]?.color }}>
                    {s.status}
                  </span>
                </td>
                <td style={{ padding: "14px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 11, color: C.textSub, position: "relative" }}>
                  <span style={{ cursor: "pointer", textDecoration: "underline dotted" }}>
                    {t("View timeline ↗", lang)}
                  </span>
                  {hoveredId === s.id && (
                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100 }}>
                      <ApprovalTimeline submission={s} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: C.textSub, textAlign: "center" }}>
        Hover the "View timeline" cell to see the full approval trail for each section.
      </div>
    </div>
  );
}
