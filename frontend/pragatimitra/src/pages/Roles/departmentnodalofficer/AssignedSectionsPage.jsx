import React, { useState } from "react";

const C = {
  primary:   "#d97706",
  primaryLt: "#fef3c7",
  primaryMid:"#f59e0b",
  text:      "#1c1917",
  textSub:   "#78716c",
  border:    "rgba(217,119,6,0.13)",
  bg:        "#fffbeb",
  surface:   "#ffffff",
};

const STATUS_STYLE = {
  "Draft":        { bg: "#f1f5f9", color: "#475569" },
  "In Progress":  { bg: "#fef3c7", color: "#92400e" },
  "In Review":    { bg: "#dbeafe", color: "#1e40af" },
  "Sent Back":    { bg: "#fee2e2", color: "#991b1b" },
  "Overdue":      { bg: "#fee2e2", color: "#991b1b" },
  "Completed":    { bg: "#dcfce7", color: "#166534" },
  "Submitted":    { bg: "#dcfce7", color: "#166534" },
};

const SECTIONS = [
  {
    id: "s1", name: "Ayurvedic Principles", status: "In Progress", deadline: "2026-05-10", completion: 65,
    subsections: [
      { id: "ss1", title: "Classical References",   status: "Draft",     content: "The classical references section covers all primary texts reviewed during 2025-26.\n\nKey texts: Charaka Samhita, Sushruta Samhita, Ashtanga Hridayam.\n\nTotal references compiled: 48.\nNew additions this year: 12." },
      { id: "ss2", title: "Research Methodology",   status: "In Review", content: "This section outlines the mixed-method research approach adopted for the annual report.\n\nQuantitative analysis: 234 data points collected across 3 sub-departments.\nQualitative review: 18 faculty interviews conducted in Q4 2025." },
    ],
    comments: [
      { id: "c1", author: "Dr. Rao",          text: "Please verify the reference count in section 1.1.",   time: "Apr 29, 10:30 AM", resolved: false },
      { id: "c2", author: "Publication Cell", text: "Methodology alignment needs more detail.",             time: "Apr 28, 2:00 PM",  resolved: true  },
    ],
    versions: [
      { version: "v1.0", date: "Apr 20, 2026", editedBy: "Dr. Rao", note: "Initial draft submitted" },
      { version: "v1.1", date: "Apr 24, 2026", editedBy: "M. Nair", note: "Added references list"   },
      { version: "v1.2", date: "Apr 27, 2026", editedBy: "Dr. Rao", note: "Revised methodology"     },
    ],
    files: [{ name: "references_list.pdf", size: "124 KB" }, { name: "research_notes.docx", size: "86 KB" }],
  },
  {
    id: "s2", name: "Clinical Studies", status: "Sent Back", deadline: "2026-05-03", completion: 45,
    subsections: [
      { id: "ss3", title: "Patient Data Summary", status: "Sent Back", content: "Clinical data for 2025-26.\n\nTotal patients: 234\nSuccessful treatments: 198\nOngoing cases: 36\n\nNote: Anonymization pending per HoD feedback." },
    ],
    comments: [
      { id: "c3", author: "HoD", text: "Patient data must be anonymized before submission. Refer to compliance guidelines section 4.2.", time: "Apr 30, 9:00 AM", resolved: false },
    ],
    versions: [
      { version: "v1.0", date: "Apr 18, 2026", editedBy: "R. Menon", note: "Initial draft" },
    ],
    files: [],
  },
  {
    id: "s3", name: "Research Publications", status: "Overdue", deadline: "2026-04-28", completion: 20,
    subsections: [
      { id: "ss4", title: "Publication List", status: "Draft", content: "List of department publications for 2025-26.\n\n[Work in progress — needs faculty input]" },
    ],
    comments: [],
    versions: [
      { version: "v1.0", date: "Apr 15, 2026", editedBy: "M. Nair", note: "Initial draft" },
    ],
    files: [],
  },
];

export default function AssignedSectionsPage() {
  const [filters,        setFilters]        = useState({ search: "", status: "" });
  const [selectedSection, setSelectedSection] = useState(null);
  const [activeTab,      setActiveTab]      = useState("content");
  const [activeSubIdx,   setActiveSubIdx]   = useState(0);
  const [editContent,    setEditContent]    = useState("");
  const [editing,        setEditing]        = useState(false);
  const [newComment,     setNewComment]     = useState("");
  const [compareVers,    setCompareVers]    = useState([null, null]);
  const [saveFlash,      setSaveFlash]      = useState(false);

  const filteredSections = SECTIONS.filter(s => {
    if (filters.search && !s.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.status && s.status !== filters.status) return false;
    return true;
  });

  const openSection = (sec) => {
    setSelectedSection(sec);
    setActiveTab("content");
    setActiveSubIdx(0);
    setEditContent(sec.subsections[0]?.content || "");
    setEditing(false);
    setNewComment("");
    setCompareVers([null, null]);
  };

  const handleSave = () => {
    setEditing(false);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  };

  const toggleCompare = (ver, checked) => {
    if (checked) {
      if (!compareVers[0]) setCompareVers([ver, null]);
      else if (!compareVers[1]) setCompareVers([compareVers[0], ver]);
    } else {
      setCompareVers(prev => prev.map(v => v === ver ? null : v));
    }
  };

  /* ── Section detail view ── */
  if (selectedSection) {
    const sub = selectedSection.subsections[activeSubIdx];
    const unresolvedCount = selectedSection.comments.filter(c => !c.resolved).length;

    return (
      <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
        background: C.bg, minHeight: "100vh" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <button onClick={() => setSelectedSection(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textSub,
              fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
            ← Assigned Sections
          </button>
          <span style={{ color: C.textSub }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{selectedSection.name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20, marginLeft: 4,
            background: STATUS_STYLE[selectedSection.status]?.bg,
            color: STATUS_STYLE[selectedSection.status]?.color }}>
            {selectedSection.status}
          </span>
          {saveFlash && (
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "#059669",
              background: "#dcfce7", padding: "3px 10px", borderRadius: 20 }}>
              ✓ Saved
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "#fff", padding: 4,
          borderRadius: 10, border: `0.5px solid ${C.border}`, width: "fit-content" }}>
          {[
            { id: "content",  label: "Edit Content" },
            { id: "comments", label: `Comments${unresolvedCount > 0 ? ` (${unresolvedCount})` : ""}` },
            { id: "versions", label: "Version History" },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "7px 18px", borderRadius: 8, border: "none",
                background: activeTab === t.id ? C.primary : "transparent",
                color: activeTab === t.id ? "#fff" : C.textSub,
                fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .12s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content tab */}
        {activeTab === "content" && (
          <div style={{ display: "grid", gridTemplateColumns: "196px 1fr", gap: 14 }}>
            {/* Subsection sidebar */}
            <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
              padding: "10px 8px", height: "fit-content" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                letterSpacing: "0.07em", padding: "4px 8px 8px" }}>Subsections</div>
              {selectedSection.subsections.map((ss, i) => (
                <button key={ss.id} onClick={() => { setActiveSubIdx(i); setEditContent(ss.content); setEditing(false); }}
                  style={{ display: "block", width: "100%", padding: "8px 10px", borderRadius: 8, border: "none",
                    background: activeSubIdx === i ? C.primaryLt : "transparent", cursor: "pointer",
                    textAlign: "left", marginBottom: 3, transition: "background .1s" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3,
                    color: activeSubIdx === i ? C.primary : C.text }}>{ss.title}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20,
                    background: STATUS_STYLE[ss.status]?.bg, color: STATUS_STYLE[ss.status]?.color }}>
                    {ss.status}
                  </span>
                </button>
              ))}
            </div>

            {/* Editor panel */}
            <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{sub?.title}</div>
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                    Status: <span style={{ fontWeight: 600, color: STATUS_STYLE[sub?.status]?.color }}>{sub?.status}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Status update */}
                  <select style={{ padding: "6px 28px 6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                    fontSize: 12, color: C.text, background: "#fff", cursor: "pointer", outline: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none" }}>
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="In Review">In Review</option>
                    <option value="Completed">Completed</option>
                  </select>
                  {!editing ? (
                    <button onClick={() => setEditing(true)}
                      style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
                        background: C.primaryLt, color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Edit
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setEditing(false)}
                        style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                          background: "#fff", color: C.textSub, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Cancel
                      </button>
                      <button onClick={handleSave}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "none",
                          background: C.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editing ? (
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                  style={{ width: "100%", minHeight: 300, fontSize: 13, lineHeight: 1.75,
                    padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${C.primary}`,
                    outline: "none", resize: "vertical", boxSizing: "border-box",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.text,
                    background: "#fffbeb" }} />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.85, color: C.text, whiteSpace: "pre-line",
                  minHeight: 200, padding: "4px 0" }}>
                  {editContent}
                </div>
              )}

              {/* Attachments */}
              <div style={{ marginTop: 20, borderTop: `0.5px solid ${C.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.07em", marginBottom: 10 }}>Attachments</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedSection.files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                      borderRadius: 8, background: C.primaryLt, border: `0.5px solid ${C.border}`, cursor: "pointer" }}>
                      <span style={{ fontSize: 15 }}>📎</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.primary }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: C.textSub }}>{f.size}</div>
                      </div>
                    </div>
                  ))}
                  <button style={{ padding: "6px 14px", borderRadius: 8, border: `1px dashed ${C.border}`,
                    background: "transparent", color: C.textSub, fontSize: 11, cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    + Upload file
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comments tab */}
        {activeTab === "comments" && (
          <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
            padding: "20px 24px", maxWidth: 680 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>
              Threaded Comments ({selectedSection.comments.length})
            </div>

            {selectedSection.comments.length === 0 && (
              <div style={{ color: C.textSub, fontSize: 13, padding: "16px 0" }}>No comments yet.</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {selectedSection.comments.map(c => (
                <div key={c.id} style={{ padding: "12px 14px", borderRadius: 10,
                  background: c.resolved ? "#f8fafc" : C.primaryLt,
                  border: `0.5px solid ${c.resolved ? "#e2e8f0" : C.border}`,
                  opacity: c.resolved ? 0.65 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{c.author}</span>
                      <span style={{ fontSize: 11, color: C.textSub, marginLeft: 8 }}>{c.time}</span>
                    </div>
                    {c.resolved && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#166534",
                        background: "#dcfce7", padding: "2px 8px", borderRadius: 20 }}>Resolved</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: C.text, marginTop: 4, lineHeight: 1.55 }}>{c.text}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 8 }}>Add Comment</div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Write a comment…" rows={3}
                  style={{ flex: 1, fontSize: 12, padding: "10px 12px", borderRadius: 9,
                    border: `1.5px solid ${C.border}`, outline: "none", resize: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.text }} />
                <button onClick={() => setNewComment("")}
                  style={{ alignSelf: "flex-end", padding: "9px 18px", borderRadius: 9,
                    border: "none", background: C.primary, color: "#fff",
                    fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Post
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Versions tab */}
        {activeTab === "versions" && (
          <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
            padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Version History</div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>Read only — select two versions to compare</div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
              <thead>
                <tr>
                  {["Version", "Date", "Edited By", "Note", "Compare"].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      padding: "0 0 10px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSection.versions.map((v, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 0", borderTop: `0.5px solid ${C.border}`,
                      fontSize: 12, fontWeight: 700, color: C.primary }}>{v.version}</td>
                    <td style={{ padding: "10px 0", borderTop: `0.5px solid ${C.border}`,
                      fontSize: 12, color: C.textSub }}>{v.date}</td>
                    <td style={{ padding: "10px 0", borderTop: `0.5px solid ${C.border}`,
                      fontSize: 12, color: C.text }}>{v.editedBy}</td>
                    <td style={{ padding: "10px 0", borderTop: `0.5px solid ${C.border}`,
                      fontSize: 12, color: C.textSub }}>{v.note}</td>
                    <td style={{ padding: "10px 0", borderTop: `0.5px solid ${C.border}` }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="checkbox"
                          checked={compareVers.includes(v.version)}
                          disabled={!compareVers.includes(v.version) && compareVers[0] !== null && compareVers[1] !== null}
                          onChange={e => toggleCompare(v.version, e.target.checked)}
                          style={{ width: 13, height: 13, cursor: "pointer", accentColor: C.primary }} />
                        <span style={{ fontSize: 11, color: C.textSub }}>Select</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {compareVers[0] && compareVers[1] && (
              <div style={{ padding: "16px", background: C.primaryLt, borderRadius: 10,
                border: `0.5px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>
                    Comparing {compareVers[0]} → {compareVers[1]}
                  </div>
                  <button onClick={() => setCompareVers([null, null])}
                    style={{ padding: "4px 12px", borderRadius: 7, border: "none",
                      background: C.primary, color: "#fff", fontSize: 11, cursor: "pointer" }}>
                    Clear
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {compareVers.map((ver, idx) => {
                    const v = selectedSection.versions.find(x => x.version === ver);
                    return (
                      <div key={idx} style={{ background: "#fff", borderRadius: 9, padding: "12px 14px",
                        border: `0.5px solid ${C.border}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 4 }}>
                          {ver} — {v?.date}
                        </div>
                        <div style={{ fontSize: 12, color: C.text }}>{v?.note}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>Edited by {v?.editedBy}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Section list view ── */
  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: C.bg, minHeight: "100vh" }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Assigned Sections</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>My Assigned Sections</h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Click any section to edit content, view comments, or compare versions</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder="Search sections…"
          style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
          <option value="">All Statuses</option>
          <option value="In Progress">In Progress</option>
          <option value="Sent Back">Sent Back</option>
          <option value="Overdue">Overdue</option>
          <option value="Submitted">Submitted</option>
        </select>
      </div>

      {/* Section cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredSections.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: 13, color: C.textSub,
            background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}` }}>
            No sections match the current filters.
          </div>
        ) : filteredSections.map(sec => (
          <div key={sec.id} onClick={() => openSection(sec)}
            style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12,
              padding: "16px 20px", cursor: "pointer", boxShadow: "0 1px 4px rgba(217,119,6,0.05)",
              transition: "box-shadow .15s, border-color .15s" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(217,119,6,0.12)"; e.currentTarget.style.borderColor = C.primaryMid; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(217,119,6,0.05)"; e.currentTarget.style.borderColor = C.border; }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{sec.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                    background: STATUS_STYLE[sec.status]?.bg, color: STATUS_STYLE[sec.status]?.color }}>
                    {sec.status}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Deadline</div>
                    <div style={{ fontSize: 12, fontWeight: 600,
                      color: new Date(sec.deadline) < new Date() ? "#dc2626" : C.text }}>{sec.deadline}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Completion</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 88, height: 6, background: "#e0e7ff", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${sec.completion}%`, borderRadius: 3,
                          background: sec.completion === 100 ? "#059669" : sec.completion >= 50 ? C.primary : "#dc2626" }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.textSub }}>{sec.completion}%</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Subsections</div>
                    <div style={{ fontSize: 12, color: C.text }}>{sec.subsections.length}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 16 }}>
                {sec.comments.filter(c => !c.resolved).length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: "#fef3c7", color: "#92400e" }}>
                    {sec.comments.filter(c => !c.resolved).length} comment{sec.comments.filter(c => !c.resolved).length > 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ fontSize: 14, color: C.primary }}>→</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
