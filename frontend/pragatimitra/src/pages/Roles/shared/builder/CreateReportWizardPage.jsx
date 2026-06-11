import { useState, useEffect, useCallback, useRef } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

/* ── tokens ── */
const C = {
  primary:   "#4f46e5", primaryDk:  "#3730a3", primaryLt: "#eef2ff", primaryMid: "#818cf8",
  success:   "#16a34a", successLt:  "#f0fdf4",
  danger:    "#dc2626", dangerLt:   "#fef2f2",
  warning:   "#d97706",
  text:      "#0f172a", textSub: "#64748b", textMuted: "#94a3b8",
  border:    "#e2e8f0", bg: "#f8fafc", surface: "#fff",
};

const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 13px", fontSize: 13,
  border: `1.5px solid ${C.border}`, borderRadius: 8, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 };

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CreateReportWizardPage({ onCreated, onCancel }) {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const [step,  setStep]  = useState(1);
  const [toast, setToast] = useState(null);
  const [busy,  setBusy]  = useState(false);

  /* Step 1 – basics */
  const [title,    setTitle]    = useState("");
  const [desc,     setDesc]     = useState("");
  const [repType,  setRepType]  = useState("Annual");
  const [year,     setYear]     = useState(String(new Date().getFullYear()));
  const [lang,     setLang]     = useState("en");
  const [cycleId,  setCycleId]  = useState("");
  const [cycles,   setCycles]   = useState([]);
  const [tmplMode, setTmplMode] = useState("scratch");
  const [tmplId,   setTmplId]   = useState("");
  const [templates, setTemplates] = useState([]);

  /* Step 2 – structure (inline editing — changes apply immediately) */
  const [sections, setSections] = useState([]);

  /* Step 3 – deadlines */
  const [startDate,  setStartDate]  = useState("");
  const [endDate,    setEndDate]    = useState("");
  const [subDl,      setSubDl]      = useState("");
  const [revStart,   setRevStart]   = useState("");
  const [revEnd,     setRevEnd]     = useState("");
  const [approveDl,  setApproveDl]  = useState("");

  /* Step 4 – workflow */
  const [workflows,   setWorkflows]   = useState([]);
  const [wfId,        setWfId]        = useState("");
  const [customSteps, setCustomSteps] = useState([{ step_name: "", approver_role: "", approver_user_id: "" }]);
  const [wfMode,      setWfMode]      = useState("predefined");
  const [roles,       setRoles]       = useState([]);
  const [roleUsers,   setRoleUsers]   = useState({});
  const [userSearch,  setUserSearch]  = useState({});
  const [userOpen,    setUserOpen]    = useState({});

  const [createdReport, setCreatedReport] = useState(null);

  /* load on mount */
  useEffect(() => {
    Promise.all([
      apiJson(apiFetch, "/api/builder/cycles").catch(() => ({ data: [] })),
      apiJson(apiFetch, "/api/builder/templates?status=ACTIVE").catch(() => ({ data: [] })),
      apiJson(apiFetch, "/api/builder/workflows").catch(() => ({ data: [] })),
      apiJson(apiFetch, "/api/builder/workflows/roles").catch(() => ({ data: [] })),
    ]).then(([cyc, tmpl, wf, rolesRes]) => {
      setCycles(cyc.data     || []);
      setTemplates(tmpl.data || []);
      setWorkflows(wf.data   || []);
      setRoles(rolesRes.data || []);
      const def = (wf.data || []).find(w => w.is_default);
      if (def) setWfId(def.id);
    });
  }, []);

  /* template → pre-populate sections */
  useEffect(() => {
    if (tmplMode !== "template" || !tmplId) return;
    apiJson(apiFetch, `/api/builder/templates/${tmplId}`)
      .then(r => {
        const flat = (r.data?.sections || []).filter(s => !s.parent_id);
        setSections(flat.map(s => ({
          id: `tmpl_${s.id}`,
          title: s.title,
          description: s.description || "",
          subsections: (r.data.sections || [])
            .filter(c => c.parent_id === s.id)
            .map(c => ({ id: `tmpl_${c.id}`, title: c.title, description: c.description || "" })),
        })));
      }).catch(() => {});
  }, [tmplId, tmplMode]);

  /* ── section helpers — all update sections inline ── */
  const addSection = () => {
    const id = `sec_${Date.now()}`;
    setSections(p => [...p, { id, title: "", description: "", subsections: [], editing: true }]);
  };
  const addSubsection = (parentId) => {
    setSections(p => p.map(s => s.id === parentId
      ? { ...s, subsections: [...s.subsections, { id: `sub_${Date.now()}`, title: "", editing: true }] }
      : s
    ));
  };
  const updateSection = (id, field, val) =>
    setSections(p => p.map(s => s.id === id ? { ...s, [field]: val } : s));
  const updateSubsection = (parentId, subId, field, val) =>
    setSections(p => p.map(s => s.id === parentId
      ? { ...s, subsections: s.subsections.map(sub => sub.id === subId ? { ...sub, [field]: val } : sub) }
      : s
    ));
  const deleteSection = (id) => setSections(p => p.filter(s => s.id !== id));
  const deleteSubsection = (parentId, subId) =>
    setSections(p => p.map(s => s.id === parentId
      ? { ...s, subsections: s.subsections.filter(sub => sub.id !== subId) }
      : s
    ));

  /* ── workflow helpers ── */
  const addStep    = () => setCustomSteps(p => [...p, { step_name: "", approver_role: "", approver_user_id: "" }]);
  const removeStep = (i) => {
    setCustomSteps(p => p.filter((_, idx) => idx !== i));
    [setRoleUsers, setUserSearch, setUserOpen].forEach(fn =>
      fn(p => { const n = { ...p }; delete n[i]; return n; })
    );
  };
  const fetchRoleUsers = async (stepIdx, roleName) => {
    if (!roleName) { setRoleUsers(p => ({ ...p, [stepIdx]: [] })); return; }
    try {
      const res  = await apiFetch(`/api/users?role=${encodeURIComponent(roleName)}`);
      const json = await res.json();
      setRoleUsers(p => ({ ...p, [stepIdx]: json.users || json.data || [] }));
    } catch { setRoleUsers(p => ({ ...p, [stepIdx]: [] })); }
  };
  const updateStep = (i, field, val) =>
    setCustomSteps(p => p.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  /* ── submit ── */
  const handleCreate = useCallback(async () => {
    setBusy(true);
    try {
      const reportRes = await apiJson(apiFetch, "/api/builder/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), description: desc, report_type: repType,
          academic_year: year, primary_language: lang,
          cycle_id: cycleId || undefined,
          template_id: tmplMode === "template" ? tmplId || undefined : undefined,
        }),
      });
      const report = reportRes.data;

      if (tmplMode === "scratch" && sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];
          const secRes = await apiJson(apiFetch, "/api/builder/sections", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_id: report.id, title: sec.title || `Section ${i+1}`,
              description: sec.description, order_index: (i + 1) * 1000 }),
          });
          const secId = secRes.data.id;
          for (let j = 0; j < (sec.subsections || []).length; j++) {
            const sub = sec.subsections[j];
            await apiJson(apiFetch, "/api/builder/sections", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ report_id: report.id, parent_id: secId,
                title: sub.title || `Subsection ${j+1}`, description: sub.description, order_index: (j + 1) * 1000 }),
            });
          }
        }
      }

      if (wfMode === "custom" && customSteps.filter(s => s.step_name.trim()).length > 0) {
        const wfRes = await apiJson(apiFetch, "/api/builder/workflows", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${title.trim()} Workflow`, steps: customSteps.filter(s => s.step_name.trim()) }),
        });
        const sectionsRes = await apiJson(apiFetch, `/api/builder/reports/${report.id}`);
        for (const sec of (sectionsRes.data?.sections || [])) {
          await apiJson(apiFetch, `/api/builder/sections/${sec.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow_template_id: wfRes.data.id }),
          }).catch(() => {});
        }
      }

      if (startDate && endDate && !cycleId) {
        await apiJson(apiFetch, "/api/builder/cycles", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${title.trim()} Cycle ${year}`, start_date: startDate, end_date: endDate,
            reporting_year: year, submission_deadline: subDl || undefined,
            review_deadline: revEnd || undefined, approval_deadline: approveDl || undefined,
          }),
        }).catch(() => {});
      }

      setCreatedReport(report);
      setToast({ type: "success", message: "Report created successfully!" });
      setTimeout(() => onCreated?.(report), 1200);
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to create report" });
    } finally { setBusy(false); }
  }, [title, desc, repType, year, lang, cycleId, tmplMode, tmplId,
      sections, wfMode, wfId, customSteps, startDate, endDate, subDl, revEnd, approveDl]);

  /* ══════════════════════════════════════════════════════════════ RENDER ═══ */
  const STEPS = ["Basics", "Structure", "Deadlines", "Workflow", "Review"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, background: C.surface,
        borderBottom: `1px solid ${C.border}`, padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: C.primaryLt,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke={C.primary} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M10 2v4h4" stroke={C.primary} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5 8h6M5 11h4" stroke={C.primary} strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>New Report</div>
            <div style={{ fontSize: 11, color: C.textSub }}>Step {step} of {STEPS.length}</div>
          </div>
        </div>

        {/* step bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step, active = n === step;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? C.success : active ? C.primary : C.bg,
                    color: done || active ? "#fff" : C.textMuted,
                    border: `2px solid ${done ? C.success : active ? C.primary : C.border}`,
                    transition: "all 0.2s",
                  }}>
                    {done ? "✓" : n}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: active ? 700 : 400,
                    color: active ? C.primary : done ? C.success : C.textMuted, whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </div>
                {n < STEPS.length && (
                  <div style={{ width: 32, height: 2, background: done ? C.success : C.border,
                    marginBottom: 14, transition: "background 0.2s" }} />
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onCancel} style={{
          padding: "7px 16px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 8, cursor: "pointer", fontSize: 13, color: C.textSub, fontWeight: 600,
          fontFamily: "inherit",
        }}>Cancel</button>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>

        {/* ═══ STEP 1 — Basics ═══ */}
        {step === 1 && (
          <div>
            <StepHeading
              icon="📋"
              title="Report Basics"
              subtitle="Fill in the fundamental details for your new report"
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
              {/* Report name — full width */}
              <div style={{ gridColumn: "1 / -1" }}>
                <F label="Report Name *">
                  <input style={inp} value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Annual Report 2026–27" autoFocus />
                </F>
              </div>
              {/* Description — full width */}
              <div style={{ gridColumn: "1 / -1" }}>
                <F label="Description">
                  <textarea style={{ ...inp, height: 72, resize: "vertical" }} value={desc}
                    onChange={e => setDesc(e.target.value)} placeholder="Brief description (optional)…" />
                </F>
              </div>
              <F label="Report Type *">
                <select style={inp} value={repType} onChange={e => setRepType(e.target.value)}>
                  {["Annual","NAAC","Department","Accreditation","Research","Compliance","Other"].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </F>
              <F label="Reporting Year *">
                <select style={inp} value={year} onChange={e => setYear(e.target.value)}>
                  {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i)).map(y => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </F>
              <F label="Default Language">
                <select style={inp} value={lang} onChange={e => setLang(e.target.value)}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </F>
              <F label="Reporting Cycle">
                <select style={inp} value={cycleId} onChange={e => setCycleId(e.target.value)}>
                  <option value="">— None (set manually) —</option>
                  {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>

              {/* Report structure — card selector */}
              <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                <div style={lbl}>Report Structure</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { v: "scratch", icon: "✦", title: "Start from Scratch",
                      desc: "Build section structure manually in the next step" },
                    { v: "template", icon: "📂", title: "Use a Template",
                      desc: "Pre-fill sections from an existing report template" },
                  ].map(opt => (
                    <div key={opt.v} onClick={() => { setTmplMode(opt.v); if (opt.v === "scratch") setTmplId(""); }}
                      style={{
                        border: `2px solid ${tmplMode === opt.v ? C.primary : C.border}`,
                        borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                        background: tmplMode === opt.v ? C.primaryLt : C.surface,
                        transition: "all 0.15s",
                        display: "flex", alignItems: "flex-start", gap: 12,
                      }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                        background: tmplMode === opt.v ? C.primary : C.bg,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                      }}>{opt.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{opt.title}</div>
                        <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{opt.desc}</div>
                      </div>
                      <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: `2px solid ${tmplMode === opt.v ? C.primary : C.border}`,
                          background: tmplMode === opt.v ? C.primary : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {tmplMode === opt.v && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {tmplMode === "template" && (
                  <div style={{ marginTop: 10 }}>
                    <select style={inp} value={tmplId} onChange={e => setTmplId(e.target.value)}>
                      <option value="">Select template…</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <NavBar onNext={() => {
              if (!title.trim()) { setToast({ type: "error", message: "Report name is required" }); return; }
              setStep(2);
            }} showBack={false} />
          </div>
        )}

        {/* ═══ STEP 2 — Structure ═══ */}
        {step === 2 && (
          <div>
            <StepHeading
              icon="🗂"
              title="Report Structure"
              subtitle="Add sections and subsections — click a name to edit it inline"
            />

            {/* structure builder */}
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 12,
              background: C.surface, overflow: "hidden",
            }}>
              {/* toolbar */}
              <div style={{
                padding: "12px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sections </span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>
                    {sections.length} section{sections.length !== 1 ? "s" : ""} · {sections.reduce((a, s) => a + (s.subsections?.length || 0), 0)} subsection{sections.reduce((a, s) => a + (s.subsections?.length || 0), 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                <button onClick={addSection} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", background: C.primary, color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  fontFamily: "inherit",
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Section
                </button>
              </div>

              {/* section list */}
              <div style={{ padding: "12px 16px", minHeight: 200, maxHeight: 480, overflowY: "auto" }}>
                {sections.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "56px 20px" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No sections yet</div>
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 20 }}>
                      Click <b>+ Add Section</b> above to begin building your report structure.
                    </div>
                    <button onClick={addSection} style={{
                      padding: "8px 20px", background: C.primaryLt, color: C.primary,
                      border: `1.5px solid ${C.primary}`, borderRadius: 8, cursor: "pointer",
                      fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    }}>
                      + Add First Section
                    </button>
                  </div>
                ) : sections.map((sec, si) => (
                  <SectionRow
                    key={sec.id}
                    section={sec}
                    index={si}
                    onTitleChange={val => updateSection(sec.id, "title", val)}
                    onDelete={() => deleteSection(sec.id)}
                    onAddSub={() => addSubsection(sec.id)}
                    onSubTitleChange={(subId, val) => updateSubsection(sec.id, subId, "title", val)}
                    onSubDelete={(subId) => deleteSubsection(sec.id, subId)}
                  />
                ))}
              </div>
            </div>

            {sections.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button onClick={addSection} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 16px", background: "transparent", color: C.primary,
                  border: `1.5px dashed ${C.primaryMid}`, borderRadius: 8,
                  cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                }}>+ Add Another Section</button>
              </div>
            )}

            <NavBar onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* ═══ STEP 3 — Deadlines ═══ */}
        {step === 3 && (
          <div>
            <StepHeading
              icon="📅"
              title="Set Deadlines"
              subtitle="Define the report period, submission window, and review timeline"
            />

            {/* Phase 1: Report Period */}
            <DateGroup
              label="Report Period"
              color="#4f46e5"
              icon="📖"
              description="The date range this report covers"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                <DateField label="Report Start Date" value={startDate} onChange={setStartDate} type="date" />
                <DateField label="Report End Date"   value={endDate}   onChange={setEndDate}   type="date" />
              </div>
            </DateGroup>

            {/* Phase 2: Submission */}
            <DateGroup
              label="Submission"
              color="#d97706"
              icon="📤"
              description="When contributors must submit their sections"
            >
              <DateField label="Submission Deadline" value={subDl} onChange={setSubDl} type="datetime-local" />
            </DateGroup>

            {/* Phase 3: Review Period */}
            <DateGroup
              label="Review Period"
              color="#0891b2"
              icon="🔍"
              description="When reviewers will evaluate submitted sections"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                <DateField label="Review Start Date" value={revStart} onChange={setRevStart} type="date" />
                <DateField label="Review End Date"   value={revEnd}   onChange={setRevEnd}   type="date" />
              </div>
            </DateGroup>

            {/* Phase 4: Approval */}
            <DateGroup
              label="Final Approval"
              color="#16a34a"
              icon="✅"
              description="Deadline for all approvals to be completed"
            >
              <DateField label="Final Approval Deadline" value={approveDl} onChange={setApproveDl} type="datetime-local" />
            </DateGroup>

            <div style={{ marginTop: 12, padding: "10px 14px", background: "#eff6ff",
              border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
              ℹ&nbsp; All deadlines are optional and can be adjusted per-section after the report is created.
            </div>

            <NavBar onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* ═══ STEP 4 — Workflow ═══ */}
        {step === 4 && (
          <div>
            <StepHeading
              icon="⚙"
              title="Approval Workflow"
              subtitle="Define how sections move through review before final approval"
            />

            {/* mode toggle */}
            <div style={{
              display: "flex", background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 4, gap: 4, marginBottom: 24, width: "fit-content",
            }}>
              {[["predefined","Use Predefined Workflow"],["custom","Create Custom Workflow"]].map(([v, l]) => (
                <button key={v} onClick={() => setWfMode(v)} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
                  background: wfMode === v ? C.primary : "transparent",
                  color: wfMode === v ? "#fff" : C.textSub,
                  boxShadow: wfMode === v ? "0 1px 4px rgba(79,70,229,0.25)" : "none",
                }}>{l}</button>
              ))}
            </div>

            {wfMode === "predefined" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <WorkflowCard
                  wf={{ id: "", name: "No Workflow", description: "Sections go straight to admin review without approval steps", steps: [] }}
                  selected={!wfId} onClick={() => setWfId("")}
                />
                {workflows.length === 0 && (
                  <div style={{ padding: "24px 20px", textAlign: "center", color: C.textSub, fontSize: 12,
                    background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                    No saved workflows yet.<br />Switch to Custom to build one.
                  </div>
                )}
                {workflows.map(w => (
                  <WorkflowCard key={w.id} wf={w} selected={wfId === w.id} onClick={() => setWfId(w.id)} />
                ))}
              </div>
            )}

            {wfMode === "custom" && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div style={{ padding: "14px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, borderRadius: "10px 10px 0 0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Build Approval Chain</div>
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                    Sections must pass all steps in order. Each step needs a name and an approver role.
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  {customSteps.map((s, i) => {
                    const stepUsers = roleUsers[i] || [];
                    const uSearch   = userSearch[i] ?? "";
                    const uOpen     = !!userOpen[i];
                    const uFiltered = stepUsers.filter(u =>
                      !uSearch.trim() ||
                      u.full_name?.toLowerCase().includes(uSearch.toLowerCase()) ||
                      u.email?.toLowerCase().includes(uSearch.toLowerCase())
                    );
                    const selUser = stepUsers.find(u => u.id === s.approver_user_id);

                    return (
                      <div key={i} style={{ display: "flex", gap: 0, marginBottom: 12 }}>
                        {/* step connector */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40, flexShrink: 0 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%", background: C.primary, color: "#fff",
                            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{i + 1}</div>
                          {i < customSteps.length - 1 && (
                            <div style={{ flex: 1, width: 2, background: C.border, margin: "4px 0", minHeight: 16 }} />
                          )}
                        </div>

                        {/* step card */}
                        <div style={{
                          flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
                          padding: "14px 16px", background: "#fafbff",
                          marginLeft: 8,
                        }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                            {/* Step name */}
                            <div style={{ flex: 1 }}>
                              <div style={{ ...lbl }}>Step Name</div>
                              <input style={inp} placeholder="e.g. HoD Review"
                                value={s.step_name} onChange={e => updateStep(i, "step_name", e.target.value)} />
                            </div>

                            {/* Role picker — native select, never clips */}
                            <div style={{ flex: 1 }}>
                              <div style={{ ...lbl }}>Approver Role</div>
                              <select
                                style={{ ...inp, cursor: "pointer" }}
                                value={s.approver_role}
                                onChange={e => {
                                  const role = e.target.value;
                                  updateStep(i, "approver_role", role);
                                  updateStep(i, "approver_user_id", "");
                                  setUserSearch(p => ({ ...p, [i]: "" }));
                                  setRoleUsers(p => ({ ...p, [i]: [] }));
                                  if (role) fetchRoleUsers(i, role);
                                }}
                              >
                                <option value="">— Select role —</option>
                                {roles.map(r => (
                                  <option key={r.id ?? r.name} value={r.name}>
                                    {r.display_name || r.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {customSteps.length > 1 && (
                              <button onClick={() => removeStep(i)} title="Remove step" style={{
                                width: 28, height: 28, background: C.dangerLt, border: `1px solid #fca5a5`,
                                borderRadius: 7, cursor: "pointer", color: C.danger, fontSize: 14,
                                display: "flex", alignItems: "center", justifyContent: "center", marginTop: 20, flexShrink: 0,
                              }}>×</button>
                            )}
                          </div>

                          {/* Specific user picker */}
                          {s.approver_role && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.border}`, position: "relative" }}>
                              <div style={{ ...lbl, marginBottom: 6 }}>
                                Specific User
                                <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 6, color: C.textMuted }}>
                                  — optional, leave blank to allow any {roles.find(r => r.name === s.approver_role)?.display_name || s.approver_role}
                                </span>
                              </div>
                              {selUser ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
                                  background: C.primaryLt, borderRadius: 8, border: `1px solid ${C.primaryMid}44`, fontSize: 12 }}>
                                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary,
                                    color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {selUser.full_name?.[0]?.toUpperCase() || "?"}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, color: C.text }}>{selUser.full_name}</div>
                                    <div style={{ fontSize: 10, color: C.textSub }}>{selUser.email}</div>
                                  </div>
                                  <button onClick={() => { updateStep(i, "approver_user_id", ""); setUserSearch(p => ({ ...p, [i]: "" })); }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: C.textSub, fontSize: 15, padding: "0 2px" }}>×</button>
                                </div>
                              ) : (
                                <div style={{ maxWidth: 320 }}>
                                  <input style={inp}
                                    placeholder={stepUsers.length ? `Search among ${stepUsers.length} users…` : "Loading users…"}
                                    value={uSearch}
                                    onFocus={() => { if (!stepUsers.length) fetchRoleUsers(i, s.approver_role); setUserOpen(p => ({ ...p, [i]: true })); }}
                                    onBlur={() => setTimeout(() => setUserOpen(p => ({ ...p, [i]: false })), 160)}
                                    onChange={e => { setUserSearch(p => ({ ...p, [i]: e.target.value })); setUserOpen(p => ({ ...p, [i]: true })); }}
                                  />
                                  {uOpen && uFiltered.length > 0 && (
                                    <div style={{
                                      position: "absolute", top: "calc(100% + 2px)", left: 0, width: 320,
                                      background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
                                      boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 200, overflowY: "auto",
                                    }}>
                                      {uFiltered.map(u => (
                                        <div key={u.id}
                                          onMouseDown={() => { updateStep(i, "approver_user_id", u.id); setUserSearch(p => ({ ...p, [i]: "" })); setUserOpen(p => ({ ...p, [i]: false })); }}
                                          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, borderBottom: `1px solid ${C.border}` }}
                                          onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                        >
                                          <div style={{ fontWeight: 600, color: C.text }}>{u.full_name}</div>
                                          <div style={{ color: C.textSub, fontSize: 10 }}>{u.email}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {uOpen && stepUsers.length === 0 && (
                                    <div style={{
                                      position: "absolute", top: "calc(100% + 2px)", left: 0, width: 320,
                                      background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
                                      padding: "10px 12px", fontSize: 11, color: C.textSub, zIndex: 200,
                                    }}>No users found with this role.</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={addStep} style={{
                    display: "flex", alignItems: "center", gap: 6, marginLeft: 48,
                    padding: "7px 16px", background: C.primaryLt, color: C.primary,
                    border: `1.5px dashed ${C.primaryMid}`, borderRadius: 8,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  }}>+ Add Step</button>
                </div>
              </div>
            )}

            <NavBar onBack={() => setStep(3)} onNext={() => setStep(5)} />
          </div>
        )}

        {/* ═══ STEP 5 — Review & Create ═══ */}
        {step === 5 && (
          <div>
            <StepHeading
              icon="✅"
              title="Review & Create"
              subtitle="Verify all settings below before creating the report"
            />

            {/* Summary cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>

              {/* Report Details */}
              <ReviewCard label="Report Details" icon="📋" color={C.primary} onEdit={() => setStep(1)}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                  <ReviewRow k="Name"      v={title || "—"} highlight={!title} />
                  <ReviewRow k="Type"      v={repType} />
                  <ReviewRow k="Year"      v={year} />
                  <ReviewRow k="Language"  v={lang === "en" ? "English" : "Hindi"} />
                  {desc && <div style={{ gridColumn: "1/-1" }}><ReviewRow k="Description" v={desc} /></div>}
                  <ReviewRow k="Structure" v={tmplMode === "template"
                    ? (templates.find(t => t.id === tmplId)?.name || "Template selected")
                    : "From Scratch"} />
                </div>
              </ReviewCard>

              {/* Structure */}
              <ReviewCard label="Structure" icon="🗂" color="#0891b2" onEdit={() => setStep(2)}>
                {sections.length === 0 ? (
                  <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>No sections added</span>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 10 }}>
                      <b style={{ color: C.text }}>{sections.length}</b> section{sections.length !== 1 ? "s" : ""} · <b style={{ color: C.text }}>{sections.reduce((a, s) => a + (s.subsections?.length || 0), 0)}</b> subsections
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {sections.slice(0, 8).map((s, i) => (
                        <div key={s.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 5, background: "#e0e7ff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 9, fontWeight: 700, color: C.primary, flexShrink: 0 }}>{i + 1}</div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.title || "(untitled)"}</span>
                            {(s.subsections?.length || 0) > 0 && (
                              <span style={{ fontSize: 10, color: C.textMuted }}>+{s.subsections.length} sub</span>
                            )}
                          </div>
                          {(s.subsections?.length || 0) > 0 && (
                            <div style={{ marginLeft: 28, marginTop: 2 }}>
                              {s.subsections.slice(0, 3).map(sub => (
                                <div key={sub.id} style={{ fontSize: 11, color: C.textSub, padding: "1px 0" }}>
                                  └ {sub.title || "(untitled)"}
                                </div>
                              ))}
                              {s.subsections.length > 3 && (
                                <div style={{ fontSize: 11, color: C.textMuted }}>└ +{s.subsections.length - 3} more…</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {sections.length > 8 && (
                        <div style={{ fontSize: 11, color: C.textMuted, paddingLeft: 28 }}>…and {sections.length - 8} more sections</div>
                      )}
                    </div>
                  </>
                )}
              </ReviewCard>

              {/* Deadlines */}
              <ReviewCard label="Deadlines" icon="📅" color="#d97706" onEdit={() => setStep(3)}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                  <ReviewRow k="Report Period" v={startDate && endDate ? `${startDate} – ${endDate}` : "Not set"} muted={!startDate || !endDate} />
                  <ReviewRow k="Submission"    v={subDl || "Not set"}                             muted={!subDl} />
                  <ReviewRow k="Review Period" v={revStart && revEnd ? `${revStart} – ${revEnd}` : "Not set"} muted={!revStart || !revEnd} />
                  <ReviewRow k="Final Approval" v={approveDl || "Not set"}                        muted={!approveDl} />
                </div>
              </ReviewCard>

              {/* Workflow */}
              <ReviewCard label="Approval Workflow" icon="⚙" color="#16a34a" onEdit={() => setStep(4)}>
                {wfMode === "predefined" ? (
                  <ReviewRow k="Mode" v={workflows.find(w => w.id === wfId)?.name || "No Workflow (direct admin review)"} />
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 8 }}>Custom workflow — {customSteps.filter(s => s.step_name.trim()).length} step{customSteps.filter(s => s.step_name.trim()).length !== 1 ? "s" : ""}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {customSteps.filter(s => s.step_name.trim()).map((s, i, arr) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            padding: "4px 12px", background: C.primaryLt, border: `1px solid ${C.primaryMid}`,
                            borderRadius: 20, fontSize: 11, fontWeight: 600, color: C.primary,
                          }}>
                            {s.step_name}
                            {s.approver_role && <span style={{ color: C.textSub, fontWeight: 400 }}> · {s.approver_role}</span>}
                          </div>
                          {i < arr.length - 1 && <span style={{ color: C.textMuted, fontSize: 14 }}>→</span>}
                        </div>
                      ))}
                      {customSteps.filter(s => s.step_name.trim()).length === 0 && (
                        <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>No steps defined</span>
                      )}
                    </div>
                  </>
                )}
              </ReviewCard>
            </div>

            {/* Create button */}
            <div style={{
              padding: "20px 24px", background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  Ready to create "{title || "Untitled Report"}"?
                </div>
                <div style={{ fontSize: 12, color: C.textSub }}>
                  This will set up your report structure and workflow. You can edit details afterwards.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <button onClick={() => setStep(4)} style={{
                  padding: "10px 20px", background: "transparent", border: `1.5px solid ${C.border}`,
                  borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
                }}>← Back</button>
                <button
                  disabled={busy || !title.trim()}
                  onClick={handleCreate}
                  style={{
                    padding: "10px 28px", background: busy || !title.trim() ? "#86efac" : C.success,
                    border: "none", borderRadius: 9, cursor: busy || !title.trim() ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "inherit",
                    boxShadow: busy || !title.trim() ? "none" : "0 2px 8px rgba(22,163,74,0.3)",
                    minWidth: 160,
                  }}>
                  {busy ? "Creating…" : "✓ Create Report"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════ SUB-COMPONENTS ═══════════════════ */

/* Section row with inline editing — name changes reflect immediately */
function SectionRow({ section, index, onTitleChange, onDelete, onAddSub, onSubTitleChange, onSubDelete }) {
  const [editingTitle, setEditingTitle] = useState(!section.title); // open if title is blank (new)
  const [subsOpen,     setSubsOpen]     = useState(true);
  const inputRef = useRef();

  useEffect(() => {
    if (editingTitle && inputRef.current) inputRef.current.focus();
  }, [editingTitle]);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section header row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderRadius: 9,
        background: C.bg, border: `1.5px solid ${C.border}`,
        transition: "border-color 0.15s",
      }}
        onMouseEnter={e => { if (!editingTitle) e.currentTarget.style.borderColor = C.primaryMid; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
      >
        {/* index badge */}
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.primary, color: "#fff",
          fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {index + 1}
        </div>

        {/* title — inline editable */}
        {editingTitle ? (
          <input
            ref={inputRef}
            value={section.title}
            onChange={e => onTitleChange(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false); }}
            placeholder="Section name…"
            style={{ ...inp, flex: 1, padding: "4px 8px", fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${C.primary}`, borderRadius: 6 }}
          />
        ) : (
          <span
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
            style={{ flex: 1, fontSize: 13, fontWeight: 600, color: section.title ? C.text : C.textMuted,
              cursor: "text", userSelect: "none", lineHeight: 1.4 }}>
            {section.title || <em>Click to set section name…</em>}
          </span>
        )}

        {/* subsection count badge */}
        {(section.subsections?.length || 0) > 0 && (
          <div
            onClick={() => setSubsOpen(o => !o)}
            title={subsOpen ? "Collapse" : "Expand subsections"}
            style={{ fontSize: 10, color: C.textSub, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 20, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
            {section.subsections.length} sub {subsOpen ? "▾" : "▸"}
          </div>
        )}

        {/* add subsection */}
        <button
          onClick={onAddSub}
          title="Add subsection"
          style={{ padding: "4px 10px", background: "#e0e7ff", border: "none", borderRadius: 7,
            cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.primary, fontFamily: "inherit",
            whiteSpace: "nowrap" }}>
          + Sub
        </button>

        {/* delete section */}
        <button
          onClick={onDelete}
          title="Delete section"
          style={{ width: 28, height: 28, background: C.dangerLt, border: `1px solid #fca5a5`,
            borderRadius: 7, cursor: "pointer", color: C.danger, fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          ×
        </button>
      </div>

      {/* Subsections */}
      {subsOpen && (section.subsections || []).map(sub => (
        <SubRow
          key={sub.id}
          sub={sub}
          onTitleChange={val => onSubTitleChange(sub.id, val)}
          onDelete={() => onSubDelete(sub.id)}
        />
      ))}
    </div>
  );
}

function SubRow({ sub, onTitleChange, onDelete }) {
  const [editing, setEditing] = useState(!sub.title);
  const inputRef = useRef();

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8,
      marginLeft: 32, marginTop: 4, padding: "8px 12px",
      borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
    }}>
      {/* indent line */}
      <div style={{ width: 14, height: 1, background: C.border, flexShrink: 0 }} />
      <div style={{ width: 14, height: 14, borderRadius: 4, background: C.primaryLt, flexShrink: 0,
        border: `1px solid ${C.primaryMid}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.primary }} />
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={sub.title}
          onChange={e => onTitleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={e => { if (e.key === "Enter") setEditing(false); }}
          placeholder="Subsection name…"
          style={{ ...inp, flex: 1, padding: "3px 8px", fontSize: 12,
            border: `1.5px solid ${C.primary}`, borderRadius: 6 }}
        />
      ) : (
        <span onClick={() => setEditing(true)} title="Click to rename"
          style={{ flex: 1, fontSize: 12, color: sub.title ? C.text : C.textMuted,
            cursor: "text", userSelect: "none" }}>
          {sub.title || <em>Click to set name…</em>}
        </span>
      )}

      <button onClick={onDelete} title="Delete subsection"
        style={{ width: 24, height: 24, background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 6, cursor: "pointer", color: C.danger, fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
        ×
      </button>
    </div>
  );
}

/* Workflow selection card */
function WorkflowCard({ wf, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      border: `2px solid ${selected ? C.primary : C.border}`, borderRadius: 10, padding: "14px 16px",
      cursor: "pointer", background: selected ? C.primaryLt : C.surface, transition: "all 0.15s",
      position: "relative",
    }}>
      {selected && (
        <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18,
          borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, paddingRight: 24 }}>{wf.name}</div>
      {wf.description && <div style={{ fontSize: 11, color: C.textSub, marginBottom: 10, lineHeight: 1.5 }}>{wf.description}</div>}
      {(wf.steps || []).length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ padding: "2px 8px", background: "#e0e7ff", border: "1px solid #c7d2fe",
                borderRadius: 4, fontSize: 10, fontWeight: 600, color: C.primary }}>{s.step_name}</span>
              {i < wf.steps.length - 1 && <span style={{ color: C.textMuted, fontSize: 11 }}>→</span>}
            </div>
          ))}
        </div>
      )}
      {(wf.steps || []).length === 0 && (
        <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>No approval steps</div>
      )}
    </div>
  );
}

/* Date group block for step 3 */
function DateGroup({ label, color, icon, description, children }) {
  return (
    <div style={{ marginBottom: 16, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: `${color}08`,
        borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{description}</div>
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function DateField({ label, value, onChange, type = "date" }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ ...lbl }}>{label}</label>
      <input type={type} style={inp} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/* Review card for step 5 */
function ReviewCard({ label, icon, color, onEdit, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
        </div>
        <button onClick={onEdit} style={{
          padding: "3px 12px", background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
        }}>Edit</button>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function ReviewRow({ k, v, muted = false, highlight = false }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4, alignItems: "flex-start" }}>
      <span style={{ color: C.textMuted, flexShrink: 0, minWidth: 120 }}>{k}:</span>
      <span style={{ color: highlight ? C.danger : muted ? C.textMuted : C.text,
        fontWeight: muted ? 400 : 600, fontStyle: muted ? "italic" : "normal" }}>{v}</span>
    </div>
  );
}

function StepHeading({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.3px" }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.textSub, margin: 0, paddingLeft: 34 }}>{subtitle}</p>
      <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginTop: 16 }} />
    </div>
  );
}

function NavBar({ onBack, onNext, showBack = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 32 }}>
      {showBack && onBack && (
        <button onClick={onBack} style={{
          padding: "9px 22px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: C.textSub, fontFamily: "inherit",
        }}>← Back</button>
      )}
      {onNext && (
        <button onClick={onNext} style={{
          padding: "9px 24px", background: C.primary, border: "none", borderRadius: 9,
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#fff",
          fontFamily: "inherit", boxShadow: "0 2px 6px rgba(79,70,229,0.3)",
        }}>Next →</button>
      )}
    </div>
  );
}

function F({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}
