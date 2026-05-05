import React, { useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#1d4ed8",
  primaryLt: "#dbeafe",
  text:      "#0f172a",
  textSub:   "#64748b",
  border:    "rgba(29,78,216,0.12)",
  bg:        "#f0f4ff",
  surface:   "#ffffff",
};

const STATUS_STYLE = {
  "Pending Review": { bg: "#fef3c7", color: "#92400e" },
  "Under Review":   { bg: "#dbeafe", color: "#1e40af" },
  "Approved":       { bg: "#dcfce7", color: "#166534" },
  "Sent Back":      { bg: "#fee2e2", color: "#991b1b" },
};

const QUEUE = [
  { id: 1, section: "Samhita Siddhanta — Research",  dept: "Samhita",      submittedBy: "Dr. Rao",    date: "2026-04-28", deadline: "2026-05-05", stage: "Director Review", status: "Pending Review" },
  { id: 2, section: "Dravyaguna — Annual Analysis",  dept: "Dravyaguna",   submittedBy: "R. Menon",   date: "2026-04-26", deadline: "2026-05-03", stage: "Director Review", status: "Under Review"   },
  { id: 3, section: "Kaumarabhrtiya — Child Health", dept: "Kaumarabhrt.", submittedBy: "A. Pillai",  date: "2026-04-22", deadline: "2026-04-30", stage: "Director Review", status: "Pending Review" },
];

const MOCK_CONTENT = [
  { type: "para", id: "p1",
    text: "The Department of Samhita Siddhanta has completed the annual review of classical texts for the academic year 2025-26. A total of 42 students participated in research activities across three major sub-sections." },
  { type: "para", id: "p2",
    text: "Research outcomes demonstrate a 15% improvement in comprehension metrics compared to the previous year. Faculty publications increased from 8 to 12 peer-reviewed papers." },
  { type: "table", id: "t1",
    headers: ["Sub-section", "Students", "Publications", "Status"],
    rows: [
      ["Classical Texts",  "18", "5", "Completed"],
      ["Research Papers",  "14", "4", "Completed"],
      ["Field Studies",    "10", "3", "In Progress"],
    ]},
  { type: "para", id: "p3",
    text: "The department requests an additional allocation of ₹1,20,000 for laboratory equipment and reference materials for the upcoming academic year." },
];

export default function ReviewQueuePage() {
  const { lang } = useLanguage();
  const [filters,      setFilters]      = useState({ section: "", status: "" });
  const [selected,     setSelected]     = useState(null);
  const [comments,     setComments]     = useState({});
  const [activeBlock,  setActiveBlock]  = useState(null);
  const [commentInput, setCommentInput] = useState("");
  const [decision,     setDecision]     = useState(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [signed,       setSigned]       = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  const filtered = QUEUE.filter(q => {
    if (filters.section && !q.section.toLowerCase().includes(filters.section.toLowerCase())) return false;
    if (filters.status  && q.status !== filters.status) return false;
    return true;
  });

  const addComment = (blockId) => {
    if (!commentInput.trim()) return;
    setComments(prev => ({
      ...prev,
      [blockId]: [...(prev[blockId] || []), {
        author: "Director",
        text: commentInput.trim(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }],
    }));
    setCommentInput("");
    setActiveBlock(null);
  };

  const submitDecision = () => {
    if (!signed || !decision) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false); setSelected(null); setDecision(null);
      setDecisionNote(""); setComments({}); setActiveBlock(null); setSigned(false);
    }, 2200);
  };

  /* ── Review detail view ── */
  if (selected) {
    const timestamp = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const totalComments = Object.values(comments).reduce((s, a) => s + a.length, 0);

    return (
      <div style={{ display: "flex", height: "calc(100vh - 56px)", fontFamily: "'Plus Jakarta Sans', sans-serif", background: C.bg }}>

        {/* Content pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <button onClick={() => { setSelected(null); setDecision(null); setDecisionNote(""); setComments({}); setSigned(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.textSub,
                fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
              {t("← Back to Queue", lang)}
            </button>
            <span style={{ color: C.textSub }}>·</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{selected.section}</span>
          </div>

          <div style={{ background: C.surface, borderRadius: 14, border: `0.5px solid ${C.border}`,
            padding: "24px 28px", boxShadow: "0 1px 6px rgba(29,78,216,0.06)" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{selected.section}</div>
              <div style={{ fontSize: 12, color: C.textSub }}>
                Submitted by <b>{selected.submittedBy}</b> · {selected.date} · Deadline: <b style={{ color: new Date(selected.deadline) < new Date() ? "#dc2626" : C.text }}>{selected.deadline}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                  background: STATUS_STYLE[selected.status]?.bg, color: STATUS_STYLE[selected.status]?.color }}>
                  {selected.status}
                </span>
              </div>
            </div>

            <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 4 }}>{t("Section Content", lang)}</div>
              <p style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>
                {t("Click any block to add an inline comment", lang)}
              </p>

              {MOCK_CONTENT.map(block => (
                <div key={block.id} style={{ marginBottom: 12, position: "relative" }}>
                  <div
                    onClick={() => setActiveBlock(activeBlock === block.id ? null : block.id)}
                    style={{
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: activeBlock === block.id
                        ? `1.5px solid ${C.primary}`
                        : comments[block.id]?.length ? "1.5px solid #fde68a" : "1.5px solid transparent",
                      background: activeBlock === block.id ? "#eff6ff"
                        : comments[block.id]?.length ? "#fffbeb" : "transparent",
                      transition: "all .15s",
                    }}>
                    {block.type === "para" ? (
                      <p style={{ fontSize: 13, lineHeight: 1.75, color: C.text, margin: 0 }}>{block.text}</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {block.headers.map(h => (
                              <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                                padding: "5px 8px", textAlign: "left", borderBottom: `0.5px solid ${C.border}`,
                                textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci} style={{ fontSize: 12, padding: "7px 8px", color: C.text,
                                  borderBottom: ri < block.rows.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {comments[block.id]?.length > 0 && (
                      <div style={{ position: "absolute", top: -7, right: 10,
                        background: "#d97706", color: "#fff", fontSize: 10, fontWeight: 700,
                        borderRadius: 20, padding: "1px 7px" }}>
                        {comments[block.id].length}
                      </div>
                    )}
                  </div>

                  {activeBlock === block.id && (
                    <div style={{ marginTop: 6, background: "#fff", border: `1.5px solid ${C.primary}`,
                      borderRadius: 8, padding: "10px 12px", boxShadow: "0 2px 8px rgba(29,78,216,0.1)" }}
                      onClick={e => e.stopPropagation()}>
                      {(comments[block.id] || []).map((c, ci) => (
                        <div key={ci} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `0.5px solid ${C.border}` }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{c.author}</span>
                          <span style={{ fontSize: 11, color: C.textSub, marginLeft: 6 }}>{c.time}</span>
                          <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{c.text}</div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <textarea value={commentInput} onChange={e => setCommentInput(e.target.value)}
                          placeholder="Add a comment on this block…" rows={2}
                          style={{ flex: 1, fontSize: 12, padding: "7px 10px", borderRadius: 7,
                            border: `1px solid ${C.border}`, outline: "none", resize: "none",
                            fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.text }} />
                        <button onClick={() => addComment(block.id)}
                          style={{ background: C.primary, color: "#fff", border: "none",
                            borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {t("Add", lang)}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decision sidebar */}
        <div style={{ width: 296, borderLeft: `1px solid ${C.border}`, background: C.surface,
          overflowY: "auto", padding: "28px 18px", display: "flex", flexDirection: "column",
          gap: 16, flexShrink: 0 }}>

          {submitted ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{decision === "approve" ? "✅" : "↩️"}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: decision === "approve" ? "#166534" : "#991b1b" }}>
                {decision === "approve" ? t("Section Approved", lang) : t("Sent Back for Revision", lang)}
              </div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 6, lineHeight: 1.5 }}>
                {decision === "approve"
                  ? t("Report compilation initiated at Publication Cell.", lang)
                  : t("Revision request sent to the submitting team.", lang)}
              </div>
            </div>
          ) : (
            <>
              {/* Decision */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.07em", marginBottom: 10 }}>{t("Decision", lang)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px",
                  background: C.primaryLt, borderRadius: 8, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.primary }}>Under Review</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[
                    { id: "approve",  label: `✓ ${t("Approve", lang)}`,    active: { bg: "#dcfce7", border: "#059669", color: "#166534" } },
                    { id: "sendback", label: `↩ ${t("Send Back", lang)}`,  active: { bg: "#fee2e2", border: "#dc2626", color: "#991b1b" } },
                  ].map(btn => (
                    <button key={btn.id} onClick={() => setDecision(btn.id)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8,
                        border: `1.5px solid ${decision === btn.id ? btn.active.border : C.border}`,
                        background: decision === btn.id ? btn.active.bg : "#fff",
                        color: decision === btn.id ? btn.active.color : C.textSub,
                        fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
                {decision && (
                  <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)}
                    placeholder={decision === "approve" ? "Add a note (optional)…" : "Reason for sending back…"}
                    rows={3}
                    style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${C.border}`, outline: "none", resize: "none",
                      boxSizing: "border-box", fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.text }} />
                )}
              </div>

              {/* Digital signature */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.07em", marginBottom: 10 }}>{t("Digital Signature", lang)}</div>
                <div style={{ background: "#f8fafc", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: C.textSub, marginBottom: 4 }}>
                    <b style={{ color: C.text }}>Director</b> — PragatiMitra Institute
                  </div>
                  <div style={{ fontSize: 11, color: C.textSub }}>Timestamp: {timestamp}</div>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={signed} onChange={e => setSigned(e.target.checked)}
                    style={{ width: 14, height: 14, cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                    {t("I confirm this decision with my digital signature", lang)}
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button disabled={!decision || !signed} onClick={submitDecision}
                style={{ padding: "11px", borderRadius: 9, border: "none",
                  background: !decision || !signed ? "#93c5fd" : C.primary,
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: !decision || !signed ? "not-allowed" : "pointer",
                  boxShadow: !decision || !signed ? "none" : "0 2px 8px rgba(29,78,216,0.28)" }}>
                {decision === "approve"   ? t("Approve & Initiate Compilation", lang)
                  : decision === "sendback" ? t("Send Back for Revision", lang)
                  : t("Submit Decision", lang)}
              </button>

              {/* Comments summary */}
              {totalComments > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                    letterSpacing: "0.07em", marginBottom: 8 }}>
                    {t("Inline Comments", lang)} ({totalComments})
                  </div>
                  {Object.entries(comments).map(([blockId, cList]) =>
                    cList.map((c, ci) => (
                      <div key={`${blockId}-${ci}`} style={{ marginBottom: 7, padding: "8px 10px",
                        background: "#f8fafc", borderRadius: 8, border: `0.5px solid ${C.border}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{c.author}</span>
                        <span style={{ fontSize: 11, color: C.textSub, marginLeft: 6 }}>{c.time}</span>
                        <div style={{ fontSize: 11, color: C.text, marginTop: 3 }}>{c.text}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Queue list view ── */
  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: C.bg, minHeight: "100vh" }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Review Queue", lang)}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("Section Review Queue", lang)}</h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Sections awaiting Director review — click a row to begin</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <input value={filters.section} onChange={e => setFilters(f => ({ ...f, section: e.target.value }))}
          placeholder={t("Search by section name…", lang)}
          style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none" }}>
          <option value="">{t("All Statuses", lang)}</option>
          <option value="Pending Review">{t("Pending Review", lang)}</option>
          <option value="Under Review">{t("Under Review", lang)}</option>
          <option value="Approved">{t("Approved", lang)}</option>
          <option value="Sent Back">{t("Sent Back", lang)}</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(29,78,216,0.06)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Section Name", "Submitted By", "Date", "Deadline", "Stage", "Status", ""].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.06em", padding: "12px 16px", textAlign: "left",
                  borderBottom: `0.5px solid ${C.border}` }}>{h ? t(h, lang) : h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: C.textSub }}>
                {t("No sections match the current filters.", lang)}
              </td></tr>
            ) : filtered.map((q, i) => (
              <tr key={q.id} style={{ cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                onClick={() => setSelected(q)}>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 13, fontWeight: 600, color: C.text }}>{q.section}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{q.submittedBy}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{q.date}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, fontWeight: new Date(q.deadline) < new Date() ? 600 : 400,
                  color: new Date(q.deadline) < new Date() ? "#dc2626" : C.textSub }}>{q.deadline}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{q.stage}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: STATUS_STYLE[q.status]?.bg, color: STATUS_STYLE[q.status]?.color }}>{q.status}</span>
                </td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.primary, fontWeight: 600 }}>{t("Review →", lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
