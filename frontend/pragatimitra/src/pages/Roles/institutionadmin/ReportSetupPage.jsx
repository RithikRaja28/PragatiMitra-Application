import { useState, useRef, useEffect } from "react";

let _id = 0;
const uid = () => `id_${++_id}`;

const SEED = [
  {
    id: uid(), name: "Research Activities", expanded: true,
    subsections: [
      { id: uid(), name: "Publications", type: "Subsection", dataSource: "Manual" },
      { id: uid(), name: "Patents",      type: "Subsection", dataSource: "API"    },
    ],
  },
  {
    id: uid(), name: "Financial Summary", expanded: false,
    subsections: [
      { id: uid(), name: "Budget Report", type: "Subsection", dataSource: "Manual" },
    ],
  },
  {
    id: uid(), name: "HR Report", expanded: false,
    subsections: [
      { id: uid(), name: "Staff Summary", type: "Subsection", dataSource: "Excel Import" },
    ],
  },
];

const YEARS     = Array.from({ length: 11 }, (_, i) => 2020 + i);
const DATA_SRC  = ["Manual", "API", "Excel Import", "Database"];
const WORKFLOWS = ["Standard Review", "Fast Track", "Committee Review", "Director Approval"];

/* ── Design tokens ── */
const C = {
  primary:    "#6366f1",
  primaryLt:  "#ede9fe",
  primaryMid: "#818cf8",
  text:       "#1e1b4b",
  textMid:    "#4338ca",
  textSub:    "#6b7280",
  border:     "rgba(99,102,241,0.15)",
  borderSoft: "rgba(0,0,0,0.07)",
  bg:         "#f5f3ff",
  surface:    "#ffffff",
  danger:     "#ef4444",
  dangerLt:   "#fef2f2",
  success:    "#10b981",
};

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "0 1px 6px rgba(99,102,241,0.07)",
};

const panelHead = {
  padding: "11px 16px",
  borderBottom: `0.5px solid ${C.border}`,
  display: "flex", alignItems: "center", gap: 8,
  background: "linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)",
};

const panelBody = { padding: "14px 16px" };

const inputSt = {
  width: "100%", boxSizing: "border-box",
  border: `0.5px solid rgba(99,102,241,0.25)`,
  borderRadius: 8, padding: "7px 11px",
  fontSize: 12, color: C.text, background: "#fafafa",
  outline: "none", fontFamily: "'Plus Jakarta Sans', sans-serif",
  transition: "border-color 0.15s",
};

const btn = (v = "ghost") => ({
  border: "none", cursor: "pointer", borderRadius: 8,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 11, fontWeight: 600,
  padding: "5px 11px",
  display: "inline-flex", alignItems: "center", gap: 4,
  transition: "opacity 0.15s",
  ...(v === "primary"  ? { background: C.primary,  color: "#fff"       } :
      v === "danger"   ? { background: C.dangerLt, color: C.danger     } :
      v === "outline"  ? { background: "transparent", color: C.primary, border: `0.5px solid ${C.primary}` } :
                         { background: C.primaryLt, color: C.textMid   }),
});

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.textSub,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Badge({ children, color = C.primary, bg = C.primaryLt }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color }}>
      {children}
    </span>
  );
}

function YearScroller({ value, onChange }) {
  const ref = useRef(null);
  const H = 30;
  useEffect(() => {
    const idx = YEARS.indexOf(value);
    if (ref.current) ref.current.scrollTop = idx * H;
  }, [value]);
  const onScroll = () => {
    const idx = Math.round(ref.current.scrollTop / H);
    onChange(YEARS[Math.min(Math.max(idx, 0), YEARS.length - 1)]);
  };
  return (
    <div style={{ position: "relative", height: 90, border: `0.5px solid rgba(99,102,241,0.25)`, borderRadius: 8, overflow: "hidden", background: "#fafafa" }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: H,
        transform: "translateY(-50%)", background: "rgba(99,102,241,0.08)",
        borderTop: `1px solid rgba(99,102,241,0.2)`, borderBottom: `1px solid rgba(99,102,241,0.2)`,
        pointerEvents: "none", zIndex: 1 }} />
      <div ref={ref} onScroll={onScroll}
        style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none" }}>
        <div style={{ height: H }} />
        {YEARS.map(y => (
          <div key={y} onClick={() => onChange(y)}
            style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center",
              scrollSnapAlign: "center", fontSize: 13, cursor: "pointer",
              fontWeight: y === value ? 700 : 400,
              color: y === value ? C.primary : C.textSub }}>
            {y}
          </div>
        ))}
        <div style={{ height: H }} />
      </div>
    </div>
  );
}

function Avatar({ name, size = 32 }) {
  const colors = ["#6366f1","#8b5cf6","#a78bfa","#818cf8","#4f46e5"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {name.slice(0,2).toUpperCase()}
    </div>
  );
}

function SectionItem({ section, selected, onSelect, onUpdate, onDelete, onSelectSub, selectedSub }) {
  const [editName, setEditName]   = useState(false);
  const [draft, setDraft]         = useState(section.name);
  const [newSub, setNewSub]       = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [editSubId, setEditSubId] = useState(null);
  const [editSubDraft, setEditSubDraft] = useState("");

  const commitName = () => {
    onUpdate({ ...section, name: draft.trim() || section.name });
    setEditName(false);
  };
  const addSub = () => {
    if (!newSub.trim()) return;
    onUpdate({ ...section, subsections: [...section.subsections, { id: uid(), name: newSub.trim(), type: "Subsection", dataSource: "Manual" }] });
    setNewSub(""); setAddingSub(false);
  };
  const delSub   = id  => onUpdate({ ...section, subsections: section.subsections.filter(s => s.id !== id) });
  const commitSub = sub => {
    onUpdate({ ...section, subsections: section.subsections.map(s => s.id === sub.id ? { ...s, name: editSubDraft.trim() || s.name } : s) });
    setEditSubId(null);
  };

  const isSelected = selected?.id === section.id;

  return (
    <div style={{ marginBottom: 3 }}>
      <div onClick={() => { onSelect(section); onUpdate({ ...section, expanded: !section.expanded }); }}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 9, cursor: "pointer",
          background: isSelected ? C.primaryLt : "transparent",
          border: `0.5px solid ${isSelected ? C.primaryMid : "transparent"}`,
          transition: "background 0.15s" }}>
        <span style={{ fontSize: 9, color: C.primary, width: 10, flexShrink: 0 }}>{section.expanded ? "▼" : "▶"}</span>
        {editName
          ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={commitName} onKeyDown={e => e.key === "Enter" && commitName()}
              onClick={e => e.stopPropagation()}
              style={{ ...inputSt, padding: "3px 7px", fontSize: 12, flex: 1 }} />
          : <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{section.name}</span>
        }
        <button onClick={e => { e.stopPropagation(); setEditName(true); setDraft(section.name); }}
          style={{ ...btn(), padding: "2px 7px", fontSize: 10 }}>✎</button>
        <button onClick={e => { e.stopPropagation(); onDelete(section.id); }}
          style={{ ...btn("danger"), padding: "2px 7px", fontSize: 10 }}>✕</button>
      </div>

      {section.expanded && (
        <div style={{ paddingLeft: 18, marginTop: 2 }}>
          {section.subsections.map(sub => (
            <div key={sub.id} onClick={() => onSelectSub(section, sub)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 7, cursor: "pointer", marginBottom: 1,
                background: selectedSub?.id === sub.id ? "rgba(99,102,241,0.06)" : "transparent" }}>
              <span style={{ fontSize: 10, color: C.primaryMid, flexShrink: 0 }}>├</span>
              {editSubId === sub.id
                ? <input autoFocus value={editSubDraft} onChange={e => setEditSubDraft(e.target.value)}
                    onBlur={() => commitSub(sub)} onKeyDown={e => e.key === "Enter" && commitSub(sub)}
                    onClick={e => e.stopPropagation()}
                    style={{ ...inputSt, padding: "2px 7px", fontSize: 11, flex: 1 }} />
                : <span style={{ flex: 1, fontSize: 11, color: "#374151" }}>{sub.name}</span>
              }
              <button onClick={e => { e.stopPropagation(); setEditSubId(sub.id); setEditSubDraft(sub.name); }}
                style={{ ...btn(), padding: "2px 6px", fontSize: 10 }}>✎</button>
              <button onClick={e => { e.stopPropagation(); delSub(sub.id); }}
                style={{ ...btn("danger"), padding: "2px 6px", fontSize: 10 }}>✕</button>
            </div>
          ))}

          {addingSub
            ? <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                <input autoFocus value={newSub} onChange={e => setNewSub(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSub()}
                  placeholder="Subsection name…"
                  style={{ ...inputSt, flex: 1, padding: "5px 8px", fontSize: 11 }} />
                <button onClick={addSub} style={btn("primary")}>Add</button>
                <button onClick={() => setAddingSub(false)} style={btn()}>✕</button>
              </div>
            : <button onClick={e => { e.stopPropagation(); setAddingSub(true); }}
                style={{ ...btn("outline"), marginTop: 4, fontSize: 10, width: "100%", justifyContent: "flex-start", borderRadius: 7 }}>
                + Add Subsection
              </button>
          }
        </div>
      )}
    </div>
  );
}

export default function ReportSetupPage() {
  const [sections, setSections]     = useState(SEED);
  const [selected, setSelected]     = useState(SEED[0]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [newSecName, setNewSecName] = useState("");
  const [addingTop, setAddingTop]   = useState(false);

  const [reportName,   setReportName]   = useState("Annual Report 2026");
  const [year,         setYear]         = useState(2026);
  const [startDate,    setStartDate]    = useState("2026-01-01");
  const [endDate,      setEndDate]      = useState("2026-12-31");
  const [submissionDL, setSubmissionDL] = useState("2026-11-30");
  const [reviewStart,  setReviewStart]  = useState("2026-12-01");
  const [reviewEnd,    setReviewEnd]    = useState("2026-12-15");
  const [workflow,     setWorkflow]     = useState(WORKFLOWS[0]);

  const [secName,    setSecName]    = useState(selected?.name || "");
  const [secType,    setSecType]    = useState("Section");
  const [secDataSrc, setSecDataSrc] = useState("Manual");

  useEffect(() => {
    if (selectedSub) { setSecName(selectedSub.name); setSecType(selectedSub.type); setSecDataSrc(selectedSub.dataSource); }
    else if (selected) { setSecName(selected.name); setSecType("Section"); setSecDataSrc("Manual"); }
  }, [selected, selectedSub]);

  const updateSection = (u) => {
    setSections(p => p.map(s => s.id === u.id ? u : s));
    if (selected?.id === u.id) setSelected(u);
  };
  const deleteSection = (id) => {
    setSections(p => p.filter(s => s.id !== id));
    if (selected?.id === id) { setSelected(null); setSelectedSub(null); }
  };
  const addSection = () => {
    if (!newSecName.trim()) return;
    const s = { id: uid(), name: newSecName.trim(), expanded: true, subsections: [] };
    setSections(p => [...p, s]); setSelected(s); setSelectedSub(null);
    setNewSecName(""); setAddingTop(false);
  };
  const handleSelectSub = (sec, sub) => { setSelected(sec); setSelectedSub(sub); };
  const saveSectionConfig = () => {
    if (selectedSub) {
      const u = { ...selected, subsections: selected.subsections.map(s => s.id === selectedSub.id ? { ...s, name: secName, type: secType, dataSource: secDataSrc } : s) };
      updateSection(u); setSelectedSub({ ...selectedSub, name: secName, type: secType, dataSource: secDataSrc });
    } else if (selected) {
      updateSection({ ...selected, name: secName });
    }
  };

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column", gap: 18, minHeight: "100vh", background: C.bg }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Report Setup</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>Report Configuration</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Manage sections, subsections, dates and workflow</p>
        </div>
        <button style={{ ...btn("primary"), padding: "10px 20px", fontSize: 12, borderRadius: 9,
          boxShadow: "0 2px 8px rgba(99,102,241,0.3)" }}>
          ✦ Save Report
        </button>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[
          { label: "Report", value: reportName },
          { label: "Year",   value: year },
          { label: "Deadline", value: submissionDL },
          { label: "Workflow", value: workflow },
          { label: "Sections", value: sections.length },
        ].map(p => (
          <div key={p.label} style={{ background: C.surface, border: `0.5px solid ${C.border}`,
            borderRadius: 20, padding: "5px 14px", display: "flex", gap: 7, alignItems: "center",
            boxShadow: "0 1px 3px rgba(99,102,241,0.07)" }}>
            <span style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.label}</span>
            <span style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* 3-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 1fr", gap: 14, alignItems: "start" }}>

        {/* Col 1 — Section Tree */}
        <div style={{ ...card, display: "flex", flexDirection: "column" }}>
          <div style={panelHead}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Section Tree</span>
            <span style={{ marginLeft: "auto", fontSize: 10, background: C.primaryLt, color: C.primary,
              fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{sections.length}</span>
          </div>
          <div style={{ ...panelBody, flex: 1 }}>
            {sections.map(sec => (
              <SectionItem key={sec.id} section={sec}
                selected={selected} selectedSub={selectedSub}
                onSelect={s => { setSelected(s); setSelectedSub(null); }}
                onUpdate={updateSection} onDelete={deleteSection}
                onSelectSub={handleSelectSub} />
            ))}
            {addingTop
              ? <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input autoFocus value={newSecName} onChange={e => setNewSecName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSection()}
                    placeholder="Section name…"
                    style={{ ...inputSt, flex: 1, padding: "6px 9px", fontSize: 12 }} />
                  <button onClick={addSection} style={btn("primary")}>Add</button>
                  <button onClick={() => setAddingTop(false)} style={btn()}>✕</button>
                </div>
              : <button onClick={() => setAddingTop(true)}
                  style={{ ...btn("primary"), marginTop: 10, width: "100%", justifyContent: "center",
                    borderRadius: 8, padding: "8px 10px", boxShadow: "0 2px 6px rgba(99,102,241,0.25)" }}>
                  + Add Section
                </button>
            }
          </div>
        </div>

        {/* Col 2 — Report Settings */}
        <div style={{ ...card }}>
          <div style={panelHead}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="2" stroke={C.primary} strokeWidth="1.5"/><path d="M5 5h6M5 8h6M5 11h4" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Report Settings</span>
          </div>
          <div style={panelBody}>

            <Field label="Report Name">
              <input value={reportName} onChange={e => setReportName(e.target.value)} style={inputSt} />
            </Field>

            <Field label="Year">
              <YearScroller value={year} onChange={setYear} />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Start Date">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputSt} />
              </Field>
              <Field label="End Date">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputSt} />
              </Field>
            </div>

            <Field label="Submission Deadline">
              <input type="date" value={submissionDL} onChange={e => setSubmissionDL(e.target.value)} style={inputSt} />
            </Field>

            <Field label="Review Window">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="date" value={reviewStart} onChange={e => setReviewStart(e.target.value)} style={inputSt} />
                <input type="date" value={reviewEnd} onChange={e => setReviewEnd(e.target.value)} style={inputSt} />
              </div>
            </Field>

            <Field label="Workflow">
              <select value={workflow} onChange={e => setWorkflow(e.target.value)}
                style={{ ...inputSt, cursor: "pointer" }}>
                {WORKFLOWS.map(w => <option key={w}>{w}</option>)}
              </select>
            </Field>

            {/* Timeline visual */}
            <div style={{ marginTop: 4, padding: "12px 14px", background: C.primaryLt,
              borderRadius: 10, border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 10 }}>Timeline</div>
              <div style={{ position: "relative", height: 6, background: "rgba(99,102,241,0.2)", borderRadius: 3 }}>
                <div style={{ position: "absolute", left: "0%", right: "8%", top: 0, bottom: 0,
                  background: C.primary, borderRadius: 3 }} />
                {[{ pos: "0%", label: "Start" }, { pos: "76%", label: "Deadline" }, { pos: "92%", label: "Review" }].map(m => (
                  <div key={m.label} style={{ position: "absolute", left: m.pos, top: -2, width: 10, height: 10,
                    borderRadius: "50%", background: "#fff", border: `2px solid ${C.primary}`, transform: "translateX(-50%)" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                {["Start", "Deadline", "Review End"].map(l => (
                  <span key={l} style={{ fontSize: 10, color: C.primary, fontWeight: 600 }}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Col 3 — Section Config + Assignments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={card}>
            <div style={{ ...panelHead }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke={C.primary} strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Section Config</span>
              {selected && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: C.textSub, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedSub ? `${selected.name} › ${selectedSub.name}` : selected.name}
                </span>
              )}
            </div>
            <div style={panelBody}>
              {selected ? (
                <>
                  {/* Breadcrumb */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 14,
                    padding: "6px 10px", background: C.primaryLt, borderRadius: 7 }}>
                    <span style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>{selected.name}</span>
                    {selectedSub && <>
                      <span style={{ fontSize: 10, color: C.textSub }}>›</span>
                      <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>{selectedSub.name}</span>
                    </>}
                  </div>

                  <Field label="Name">
                    <input value={secName} onChange={e => setSecName(e.target.value)} style={inputSt} />
                  </Field>
                  <Field label="Type">
                    <select value={secType} onChange={e => setSecType(e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
                      {["Section", "Subsection", "Chapter", "Annex"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Data Source">
                    <select value={secDataSrc} onChange={e => setSecDataSrc(e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
                      {DATA_SRC.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>

                  {!selectedSub && selected.subsections.length > 0 && (
                    <Field label={`Subsections (${selected.subsections.length})`}>
                      <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                        {selected.subsections.map((sub, i) => (
                          <div key={sub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "7px 11px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none", fontSize: 11 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primaryMid }} />
                              <span style={{ color: "#374151" }}>{sub.name}</span>
                            </div>
                            <Badge color={C.textMid} bg={C.primaryLt}>{sub.dataSource}</Badge>
                          </div>
                        ))}
                      </div>
                    </Field>
                  )}

                  <button onClick={saveSectionConfig}
                    style={{ ...btn("primary"), width: "100%", justifyContent: "center", padding: "10px",
                      borderRadius: 9, fontSize: 12, boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}>
                    ✓ Apply Changes
                  </button>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "36px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🗂</div>
                  <div style={{ fontSize: 13, color: C.textSub }}>Select a section from the tree</div>
                </div>
              )}
            </div>
          </div>

          {/* Assignments */}
          <div style={card}>
            <div style={panelHead}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke={C.primary} strokeWidth="1.5"/><path d="M1 14c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="5" r="2" stroke={C.primary} strokeWidth="1.5"/><path d="M14 14c0-2.209-1.343-4-3-4" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Assignments</span>
              <span style={{ marginLeft: "auto", fontSize: 10, background: C.primaryLt, color: C.primary,
                fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                {sections.flatMap(s => s.subsections).length} items
              </span>
            </div>
            <div style={panelBody}>
              {sections.flatMap(s => s.subsections).length === 0
                ? <p style={{ fontSize: 12, color: C.textSub, textAlign: "center", padding: "14px 0" }}>No subsections yet.</p>
                : sections.flatMap(s => s.subsections).slice(0, 5).map((sub, i) => (
                    <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 0", borderBottom: i < 4 ? `0.5px solid ${C.border}` : "none" }}>
                      <Avatar name={sub.name} size={28} />
                      <span style={{ flex: 1, fontSize: 11, color: "#374151", fontWeight: 500 }}>{sub.name}</span>
                      <select style={{ ...inputSt, width: "auto", padding: "3px 8px", fontSize: 11 }}>
                        <option>Unassigned</option>
                        <option>Dr. Sharma</option>
                        <option>R. Patel</option>
                        <option>M. Nair</option>
                        <option>S. Kumar</option>
                      </select>
                    </div>
                  ))
              }
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}