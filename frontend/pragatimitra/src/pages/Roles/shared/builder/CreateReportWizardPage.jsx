import { useState, useEffect, useCallback } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

/* ── design tokens ── */
const C = {
  primary: "#4f8ef7", primaryDark: "#1565c0", primaryLt: "#e8f0fe",
  success: "#43a047", danger: "#e53935", dangerLt: "#fef2f2",
  text: "#1a1a2e", textSub: "#555", border: "#e0e4ea",
  bg: "#f7f8fa", surface: "#fff",
};

const inp = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13,
  border: `1px solid ${C.border}`, borderRadius: 8, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 };
const primaryBtn = { padding: "9px 22px", background: C.primary, color: "#fff",
                     border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const outlineBtn = { ...primaryBtn, background: "transparent", color: C.primary, border: `1px solid ${C.primary}` };
const dangerBtn  = { ...primaryBtn, background: C.danger };

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
  const [tmplMode, setTmplMode] = useState("scratch"); // 'scratch' | 'template'
  const [tmplId,   setTmplId]   = useState("");
  const [templates, setTemplates] = useState([]);

  /* Step 2 – structure */
  const [sections, setSections]   = useState([]);
  const [selSecId, setSelSecId]   = useState(null);
  const [secTitle, setSecTitle]   = useState("");
  const [secDesc,  setSecDesc]    = useState("");

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
  const [customSteps, setCustomSteps] = useState([{ step_name: "", approver_role: "" }]);
  const [wfMode,      setWfMode]      = useState("predefined"); // 'predefined' | 'custom'
  const [roles,       setRoles]       = useState([]);
  const [roleSearch,  setRoleSearch]  = useState({}); // per-step role search text
  const [roleOpen,    setRoleOpen]    = useState({}); // per-step role dropdown open
  const [roleUsers,   setRoleUsers]   = useState({}); // per-step users for selected role
  const [userSearch,  setUserSearch]  = useState({}); // per-step user search text
  const [userOpen,    setUserOpen]    = useState({}); // per-step user dropdown open

  /* Step 5 – review (no state, just display) */
  const [createdReport, setCreatedReport] = useState(null);

  /* ── load cycles + templates + workflows + roles on mount ── */
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

  /* ── when template selected, pre-populate sections ── */
  useEffect(() => {
    if (tmplMode !== "template" || !tmplId) return;
    apiJson(apiFetch, `/api/builder/templates/${tmplId}`)
      .then(r => {
        const flat = (r.data?.sections || []).filter(s => !s.parent_id);
        setSections(flat.map(s => ({
          id:          `tmpl_${s.id}`,
          title:       s.title,
          description: s.description || "",
          parent_id:   null,
          subsections: (r.data.sections || [])
            .filter(c => c.parent_id === s.id)
            .map(c => ({ id: `tmpl_${c.id}`, title: c.title, description: c.description || "" })),
        })));
      })
      .catch(() => {});
  }, [tmplId, tmplMode]);

  /* ── section helpers ── */
  const addSection = () => {
    const id = `sec_${Date.now()}`;
    setSections(p => [...p, { id, title: "New Section", description: "", subsections: [] }]);
    setSelSecId(id);
    setSecTitle("New Section");
    setSecDesc("");
  };
  const addSubsection = (parentId) => {
    setSections(p => p.map(s => s.id === parentId
      ? { ...s, subsections: [...s.subsections, { id: `sub_${Date.now()}`, title: "New Subsection", description: "" }] }
      : s
    ));
  };
  const deleteSection = (id) => {
    setSections(p => p.filter(s => s.id !== id));
    if (selSecId === id) { setSelSecId(null); setSecTitle(""); setSecDesc(""); }
  };
  const saveSelectedSection = () => {
    setSections(p => p.map(s =>
      s.id === selSecId ? { ...s, title: secTitle, description: secDesc } : s
    ));
  };
  const selectSection = (s) => { setSelSecId(s.id); setSecTitle(s.title); setSecDesc(s.description || ""); };

  /* ── custom workflow helpers ── */
  const addStep = () => setCustomSteps(p => [...p, { step_name: "", approver_role: "", approver_user_id: "" }]);
  const removeStep = (i) => {
    setCustomSteps(p => p.filter((_, idx) => idx !== i));
    setRoleSearch(p => { const n = { ...p }; delete n[i]; return n; });
    setRoleOpen(p => { const n = { ...p }; delete n[i]; return n; });
    setRoleUsers(p => { const n = { ...p }; delete n[i]; return n; });
    setUserSearch(p => { const n = { ...p }; delete n[i]; return n; });
    setUserOpen(p => { const n = { ...p }; delete n[i]; return n; });
  };

  /* fetch users for a role when the role changes on a step */
  const fetchRoleUsers = async (stepIdx, roleName) => {
    if (!roleName) { setRoleUsers(p => ({ ...p, [stepIdx]: [] })); return; }
    try {
      const res  = await apiFetch(`/api/users?role=${encodeURIComponent(roleName)}`);
      const json = await res.json();
      setRoleUsers(p => ({ ...p, [stepIdx]: json.users || json.data || [] }));
    } catch {
      setRoleUsers(p => ({ ...p, [stepIdx]: [] }));
    }
  };
  const updateStep = (i, field, val) =>
    setCustomSteps(p => p.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  /* ── submit (step 5) ── */
  const handleCreate = useCallback(async () => {
    setBusy(true);
    try {
      // 1. Create report
      const reportRes = await apiJson(apiFetch, "/api/builder/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: desc,
          report_type: repType,
          academic_year: year,
          primary_language: lang,
          cycle_id: cycleId || undefined,
          template_id: tmplMode === "template" ? tmplId || undefined : undefined,
        }),
      });
      const report = reportRes.data;

      // 2. Create sections if built from scratch
      if (tmplMode === "scratch" && sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];
          const secRes = await apiJson(apiFetch, "/api/builder/sections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              report_id: report.id,
              title:       sec.title,
              description: sec.description,
              order_index: (i + 1) * 1000,
            }),
          });
          const secId = secRes.data.id;
          for (let j = 0; j < (sec.subsections || []).length; j++) {
            const sub = sec.subsections[j];
            await apiJson(apiFetch, "/api/builder/sections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                report_id:   report.id,
                parent_id:   secId,
                title:       sub.title,
                description: sub.description,
                order_index: (j + 1) * 1000,
              }),
            });
          }
        }
      }

      // 3. Apply workflow (custom: create new template, predefined: set on report sections)
      if (wfMode === "custom" && customSteps.filter(s => s.step_name.trim()).length > 0) {
        const wfRes = await apiJson(apiFetch, "/api/builder/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${title.trim()} Workflow`,
            steps: customSteps.filter(s => s.step_name.trim()),
          }),
        });
        // Assign workflow to all sections
        const sectionsRes = await apiJson(apiFetch, `/api/builder/reports/${report.id}`);
        for (const sec of (sectionsRes.data?.sections || [])) {
          await apiJson(apiFetch, `/api/builder/sections/${sec.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow_template_id: wfRes.data.id }),
          }).catch(() => {});
        }
      }

      // 4. Create reporting cycle if deadlines set
      if (startDate && endDate && !cycleId) {
        await apiJson(apiFetch, "/api/builder/cycles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:                `${title.trim()} Cycle ${year}`,
            start_date:          startDate,
            end_date:            endDate,
            reporting_year:      year,
            submission_deadline: subDl    || undefined,
            review_deadline:     revEnd   || undefined,
            approval_deadline:   approveDl || undefined,
          }),
        }).catch(() => {});
      }

      setCreatedReport(report);
      setToast({ type: "success", message: "Report created successfully!" });
      setTimeout(() => onCreated?.(report), 1200);
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to create report" });
    } finally {
      setBusy(false);
    }
  }, [title, desc, repType, year, lang, cycleId, tmplMode, tmplId,
      sections, wfMode, wfId, customSteps, startDate, endDate, subDl, revEnd, approveDl]);

  /* ══════════════════════════════════════════════════════════════ RENDER ═══ */
  const totalSteps  = 5;
  const STEP_LABELS = ["Basics", "Structure", "Deadlines", "Workflow", "Review"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── sticky wizard header ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, height: 70, background: C.surface,
                       borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center",
                       justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>New Report Wizard</div>
        <StepIndicator current={step} total={totalSteps} labels={STEP_LABELS} />
        <button style={outlineBtn} onClick={onCancel}>Cancel</button>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 120px" }}>

        {/* ─── STEP 1 — Basics ─── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Create New Report</h2>
            <p style={{ color: C.textSub, marginBottom: 28 }}>Configure basic report details</p>
            <Divider />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Report Name *">
                  <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Annual Report 2026" />
                </Field>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Description">
                  <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description..." />
                </Field>
              </div>
              <Field label="Report Type *">
                <select style={inp} value={repType} onChange={e => setRepType(e.target.value)}>
                  {["Annual","NAAC","Department","Accreditation","Research","Compliance","Other"].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reporting Year *">
                <select style={inp} value={year} onChange={e => setYear(e.target.value)}>
                  {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i)).map(y => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default Language">
                <select style={inp} value={lang} onChange={e => setLang(e.target.value)}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </Field>
              <Field label="Reporting Cycle (optional)">
                <select style={inp} value={cycleId} onChange={e => setCycleId(e.target.value)}>
                  <option value="">— None —</option>
                  {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Report Structure">
                  <div style={{ display: "flex", gap: 24 }}>
                    {[["scratch","Start from scratch"],["template","Use existing template"]].map(([v, lbl]) => (
                      <label key={v} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                        <input type="radio" name="tmplMode" checked={tmplMode === v} onChange={() => setTmplMode(v)} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                  {tmplMode === "template" && (
                    <select style={{ ...inp, marginTop: 10 }} value={tmplId} onChange={e => setTmplId(e.target.value)}>
                      <option value="">Select template...</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
                    </select>
                  )}
                </Field>
              </div>
            </div>

            <WizardNav onNext={() => { if (!title.trim()) { setToast({ type: "error", message: "Report name is required" }); return; } setStep(2); }} showBack={false} />
          </div>
        )}

        {/* ─── STEP 2 — Structure ─── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Define Report Structure</h2>
            <p style={{ color: C.textSub, marginBottom: 28 }}>Create sections and subsections</p>
            <Divider />

            <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", minHeight: 440 }}>
              {/* Left tree */}
              <div style={{ width: 280, borderRight: `1px solid ${C.border}`, background: C.surface }}>
                <div style={{ padding: "10px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Section Tree</span>
                  <button style={{ ...primaryBtn, padding: "4px 10px", fontSize: 11 }} onClick={addSection}>+ Section</button>
                </div>
                <div style={{ padding: 8, overflowY: "auto", maxHeight: 400 }}>
                  {sections.length === 0 && (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: "#aaa", fontSize: 12 }}>
                      No sections yet.<br />Click "+ Section" to add.
                    </div>
                  )}
                  {sections.map(s => (
                    <div key={s.id}>
                      <TreeNode label={s.title} selected={selSecId === s.id} onClick={() => selectSection(s)}
                        onDelete={() => deleteSection(s.id)} onAddChild={() => addSubsection(s.id)} depth={0} />
                      {(s.subsections || []).map(sub => (
                        <TreeNode key={sub.id} label={sub.title} selected={selSecId === sub.id}
                          onClick={() => { setSelSecId(sub.id); setSecTitle(sub.title); setSecDesc(sub.description || ""); }}
                          onDelete={() => setSections(p => p.map(sec =>
                            sec.id === s.id ? { ...sec, subsections: sec.subsections.filter(x => x.id !== sub.id) } : sec
                          ))} depth={1} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right detail */}
              <div style={{ flex: 1, padding: 20 }}>
                {selSecId ? (
                  <div>
                    <Field label="Section Name">
                      <input style={inp} value={secTitle} onChange={e => setSecTitle(e.target.value)} />
                    </Field>
                    <Field label="Description">
                      <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={secDesc} onChange={e => setSecDesc(e.target.value)} />
                    </Field>
                    <button style={primaryBtn} onClick={saveSelectedSection}>Save Changes</button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", paddingTop: 60, color: "#aaa", fontSize: 13 }}>
                    Select a section to edit its details.
                  </div>
                )}
              </div>
            </div>

            <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* ─── STEP 3 — Deadlines ─── */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Set Deadlines</h2>
            <p style={{ color: C.textSub, marginBottom: 28 }}>Define submission and review timelines</p>
            <Divider />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
              <Field label="Report Start Date">
                <input type="date" style={inp} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </Field>
              <Field label="Report End Date">
                <input type="date" style={inp} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </Field>
              <Field label="Submission Deadline">
                <input type="datetime-local" style={inp} value={subDl} onChange={e => setSubDl(e.target.value)} />
              </Field>
              <Field label="Final Approval Deadline">
                <input type="datetime-local" style={inp} value={approveDl} onChange={e => setApproveDl(e.target.value)} />
              </Field>
              <Field label="Review Start Date">
                <input type="date" style={inp} value={revStart} onChange={e => setRevStart(e.target.value)} />
              </Field>
              <Field label="Review End Date">
                <input type="date" style={inp} value={revEnd} onChange={e => setRevEnd(e.target.value)} />
              </Field>
            </div>

            <InfoBox>Deadlines can be overridden per-section or per-assignee after the report is created.</InfoBox>

            <WizardNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* ─── STEP 4 — Workflow ─── */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Configure Approval Workflow</h2>
            <p style={{ color: C.textSub, marginBottom: 28 }}>Define the review chain for this report</p>
            <Divider />

            <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
              {[["predefined","Use Predefined Workflow"],["custom","Create Custom Workflow"]].map(([v, l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="wfMode" checked={wfMode === v} onChange={() => setWfMode(v)} /> {l}
                </label>
              ))}
            </div>

            {wfMode === "predefined" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {workflows.length === 0 && (
                  <div style={{ gridColumn: "1/-1", color: C.textSub, fontSize: 12 }}>
                    No predefined workflows. Create one first or use a custom workflow.
                  </div>
                )}
                {workflows.map(w => (
                  <WorkflowCard key={w.id} wf={w} selected={wfId === w.id} onClick={() => setWfId(w.id)} />
                ))}
                <WorkflowCard wf={{ id: "", name: "No Workflow", description: "Skip approval — sections go straight to admin review", steps: [] }}
                  selected={!wfId} onClick={() => setWfId("")} />
              </div>
            )}

            {wfMode === "custom" && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.text }}>Build Your Workflow</div>
                <div style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>
                  Each step requires a name and an approver role. Sections must pass all steps in order.
                </div>
                {customSteps.map((s, i) => {
                  const rSearch    = roleSearch[i] ?? (roles.find(r => r.name === s.approver_role)?.display_name ?? s.approver_role ?? "");
                  const rOpen      = !!roleOpen[i];
                  const rFiltered  = roles.filter(r =>
                    !rSearch.trim() ||
                    r.display_name?.toLowerCase().includes(rSearch.toLowerCase()) ||
                    r.name?.toLowerCase().includes(rSearch.toLowerCase())
                  );
                  const stepUsers  = roleUsers[i] || [];
                  const uSearch    = userSearch[i] ?? "";
                  const uOpen      = !!userOpen[i];
                  const uFiltered  = stepUsers.filter(u =>
                    !uSearch.trim() ||
                    u.full_name?.toLowerCase().includes(uSearch.toLowerCase()) ||
                    u.email?.toLowerCase().includes(uSearch.toLowerCase())
                  );
                  const selUser    = stepUsers.find(u => u.id === s.approver_user_id);

                  return (
                    <div key={i} style={{
                      border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px",
                      marginBottom: 10, background: "#fafbff",
                    }}>
                      {/* Row 1: step number + name + role + remove */}
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, color: "#fff",
                                       fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center",
                                       justifyContent: "center", flexShrink: 0, marginTop: 6 }}>{i + 1}</span>

                        {/* Step name */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>Step Name</div>
                          <input
                            style={inp}
                            placeholder="e.g. HoD Review"
                            value={s.step_name}
                            onChange={e => updateStep(i, "step_name", e.target.value)}
                          />
                        </div>

                        {/* Role picker */}
                        <div style={{ flex: 1, position: "relative" }}>
                          <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>Approver Role</div>
                          <input
                            style={{ ...inp, cursor: "pointer" }}
                            placeholder="Search role…"
                            value={rSearch}
                            onFocus={() => setRoleOpen(p => ({ ...p, [i]: true }))}
                            onBlur={() => setTimeout(() => setRoleOpen(p => ({ ...p, [i]: false })), 160)}
                            onChange={e => {
                              setRoleSearch(p => ({ ...p, [i]: e.target.value }));
                              updateStep(i, "approver_role", e.target.value);
                              updateStep(i, "approver_user_id", "");
                              setUserSearch(p => ({ ...p, [i]: "" }));
                              setRoleUsers(p => ({ ...p, [i]: [] }));
                              setRoleOpen(p => ({ ...p, [i]: true }));
                            }}
                          />
                          {rOpen && rFiltered.length > 0 && (
                            <div style={{
                              position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
                              background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
                              boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 180, overflowY: "auto",
                            }}>
                              {rFiltered.map(r => (
                                <div key={r.id}
                                  onMouseDown={() => {
                                    updateStep(i, "approver_role", r.name);
                                    updateStep(i, "approver_user_id", "");
                                    setRoleSearch(p => ({ ...p, [i]: r.display_name }));
                                    setRoleOpen(p => ({ ...p, [i]: false }));
                                    setUserSearch(p => ({ ...p, [i]: "" }));
                                    fetchRoleUsers(i, r.name);
                                  }}
                                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, borderBottom: `1px solid ${C.border}` }}
                                  onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                >
                                  <div style={{ fontWeight: 600, color: C.text }}>{r.display_name}</div>
                                  <div style={{ color: C.textSub, fontSize: 10 }}>{r.name}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {customSteps.length > 1 && (
                          <button style={{ ...dangerBtn, padding: "4px 10px", fontSize: 11, marginTop: 20, flexShrink: 0 }}
                            onClick={() => removeStep(i)}>×</button>
                        )}
                      </div>

                      {/* Row 2: specific user picker (shows only after role selected) */}
                      {s.approver_role && (
                        <div style={{ marginTop: 10, marginLeft: 34, position: "relative" }}>
                          <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>
                            Specific User <span style={{ fontWeight: 400, textTransform: "none" }}>(optional — leave blank to allow any {roles.find(r => r.name === s.approver_role)?.display_name || s.approver_role})</span>
                          </div>

                          {selUser ? (
                            /* selected user chip */
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                              background: C.primaryLt, borderRadius: 7, border: `1px solid ${C.primary}33`,
                              fontSize: 12, width: "fit-content" }}>
                              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary,
                                color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center",
                                justifyContent: "center", flexShrink: 0 }}>
                                {selUser.full_name?.[0]?.toUpperCase() || "?"}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: C.text }}>{selUser.full_name}</div>
                                <div style={{ fontSize: 10, color: C.textSub }}>{selUser.email}</div>
                              </div>
                              <button
                                onClick={() => { updateStep(i, "approver_user_id", ""); setUserSearch(p => ({ ...p, [i]: "" })); }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: C.textSub, fontSize: 14, padding: "0 2px" }}>×</button>
                            </div>
                          ) : (
                            /* search input */
                            <div style={{ maxWidth: 340 }}>
                              <input
                                style={{ ...inp }}
                                placeholder={stepUsers.length ? `Search among ${stepUsers.length} ${roles.find(r => r.name === s.approver_role)?.display_name || s.approver_role} users…` : "Loading users…"}
                                value={uSearch}
                                onFocus={() => {
                                  if (!stepUsers.length) fetchRoleUsers(i, s.approver_role);
                                  setUserOpen(p => ({ ...p, [i]: true }));
                                }}
                                onBlur={() => setTimeout(() => setUserOpen(p => ({ ...p, [i]: false })), 160)}
                                onChange={e => {
                                  setUserSearch(p => ({ ...p, [i]: e.target.value }));
                                  setUserOpen(p => ({ ...p, [i]: true }));
                                }}
                              />
                              {uOpen && uFiltered.length > 0 && (
                                <div style={{
                                  position: "absolute", top: "calc(100% + 2px)", left: 0,
                                  width: 340, background: "#fff", border: `1px solid ${C.border}`,
                                  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                                  zIndex: 200, maxHeight: 200, overflowY: "auto",
                                }}>
                                  {uFiltered.map(u => (
                                    <div key={u.id}
                                      onMouseDown={() => {
                                        updateStep(i, "approver_user_id", u.id);
                                        setUserSearch(p => ({ ...p, [i]: "" }));
                                        setUserOpen(p => ({ ...p, [i]: false }));
                                      }}
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
                                  position: "absolute", top: "calc(100% + 2px)", left: 0, width: 340,
                                  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
                                  padding: "10px 12px", fontSize: 11, color: C.textSub, zIndex: 200,
                                }}>
                                  No users found with this role.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button style={{ ...outlineBtn, fontSize: 11, padding: "5px 14px", marginTop: 8 }} onClick={addStep}>+ Add Step</button>
              </div>
            )}

            <WizardNav onBack={() => setStep(3)} onNext={() => setStep(5)} />
          </div>
        )}

        {/* ─── STEP 5 — Review ─── */}
        {step === 5 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Review & Create</h2>
            <p style={{ color: C.textSub, marginBottom: 28 }}>Verify all settings before creating the report</p>
            <Divider />

            <SummaryBlock label="Report Details" onEdit={() => setStep(1)}>
              <SRow k="Name" v={title} />
              <SRow k="Type" v={repType} />
              <SRow k="Year" v={year} />
              <SRow k="Language" v={lang === "en" ? "English" : "Hindi"} />
              <SRow k="Template" v={tmplMode === "template" ? (templates.find(t => t.id === tmplId)?.name || "—") : "From Scratch"} />
            </SummaryBlock>

            <SummaryBlock label="Structure" onEdit={() => setStep(2)}>
              <SRow k="Top-level Sections" v={String(sections.length)} />
              <SRow k="Total Subsections" v={String(sections.reduce((a, s) => a + (s.subsections?.length || 0), 0))} />
              {sections.slice(0, 5).map(s => <SRow key={s.id} k="" v={`• ${s.title}`} />)}
              {sections.length > 5 && <SRow k="" v={`…and ${sections.length - 5} more`} />}
            </SummaryBlock>

            <SummaryBlock label="Deadlines" onEdit={() => setStep(3)}>
              <SRow k="Report Period" v={startDate && endDate ? `${startDate} – ${endDate}` : "Not set"} />
              <SRow k="Submission Deadline" v={subDl || "Not set"} />
              <SRow k="Review Period" v={revStart && revEnd ? `${revStart} – ${revEnd}` : "Not set"} />
            </SummaryBlock>

            <SummaryBlock label="Workflow" onEdit={() => setStep(4)}>
              <SRow k="Mode" v={wfMode === "custom" ? "Custom" : "Predefined"} />
              {wfMode === "predefined" && <SRow k="Workflow" v={workflows.find(w => w.id === wfId)?.name || "None"} />}
              {wfMode === "custom" && customSteps.filter(s => s.step_name).map((s, i) => (
                <SRow key={i} k={`Step ${i + 1}`} v={`${s.step_name} (${s.approver_role || "any"})`} />
              ))}
            </SummaryBlock>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 32 }}>
              <button style={outlineBtn} onClick={() => setStep(4)}>← Back</button>
              <button style={{ ...primaryBtn, background: C.success, minWidth: 160 }}
                disabled={busy || !title.trim()} onClick={handleCreate}>
                {busy ? "Creating…" : "✓ Create Report"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════ SUB-COMPONENTS ═══════════════════ */

function StepIndicator({ current, total, labels }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {labels.map((lbl, i) => {
        const n = i + 1;
        const done   = n < current;
        const active = n === current;
        const dotBg  = done ? C.success : active ? C.primary : "#ccc";
        return (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: dotBg, color: "#fff",
                            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {done ? "✓" : n}
              </div>
              <span style={{ fontSize: 9, color: active ? C.primary : "#888", marginTop: 3, fontWeight: active ? 700 : 400 }}>{lbl}</span>
            </div>
            {n < total && (
              <div style={{ width: 40, height: 2, background: done ? C.success : "#ddd", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WizardNav({ onBack, onNext, showBack = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 32 }}>
      {showBack && onBack && <button style={outlineBtn} onClick={onBack}>← Back</button>}
      {onNext && <button style={primaryBtn} onClick={onNext}>Next →</button>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "0 0 24px" }} />;
}

function InfoBox({ children }) {
  return (
    <div style={{ background: "#e8f4fd", border: "1px solid #90caf9", borderRadius: 8,
                  padding: "10px 14px", fontSize: 12, color: "#1565c0", marginTop: 8 }}>
      ℹ {children}
    </div>
  );
}

function TreeNode({ label, selected, onClick, onDelete, onAddChild, depth = 0 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
                  borderRadius: 6, cursor: "pointer", fontSize: 12, marginLeft: depth * 16,
                  background: selected ? C.primaryLt : "transparent",
                  border: selected ? `1px solid ${C.primary}` : "1px solid transparent",
                  marginBottom: 3, transition: "all .1s" }}
      onClick={onClick}>
      <span style={{ flex: 1, fontWeight: depth === 0 ? 700 : 400, color: C.text, overflow: "hidden",
                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {onAddChild && depth === 0 && (
        <span title="Add subsection" style={{ color: C.primary, fontSize: 14, opacity: 0.7, padding: "0 2px" }}
          onClick={e => { e.stopPropagation(); onAddChild(); }}>+</span>
      )}
      {onDelete && (
        <span title="Delete" style={{ color: C.danger, fontSize: 13, opacity: 0.7, padding: "0 2px" }}
          onClick={e => { e.stopPropagation(); onDelete(); }}>🗑</span>
      )}
    </div>
  );
}

function WorkflowCard({ wf, selected, onClick }) {
  return (
    <div onClick={onClick} style={{ border: `2px solid ${selected ? C.primary : C.border}`,
                                    borderRadius: 8, padding: 16, cursor: "pointer",
                                    background: selected ? C.primaryLt : C.surface,
                                    transition: "all .15s" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{wf.name}</div>
      {wf.description && <div style={{ fontSize: 11, color: C.textSub, marginBottom: 10 }}>{wf.description}</div>}
      {(wf.steps || []).length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ padding: "3px 8px", background: "#e3f2fd", border: "1px solid #90caf9",
                             borderRadius: 4, fontSize: 10, fontWeight: 600, color: "#1565c0" }}>
                {s.step_name}
              </span>
              {i < wf.steps.length - 1 && <span style={{ color: "#ccc", fontSize: 12 }}>→</span>}
            </div>
          ))}
        </div>
      )}
      {selected && <div style={{ marginTop: 10, fontSize: 11, color: C.primary, fontWeight: 600 }}>✓ Selected</div>}
    </div>
  );
}

function SummaryBlock({ label, onEdit, children }) {
  return (
    <div style={{ borderLeft: `4px solid ${C.primary}`, background: C.bg, padding: "14px 16px",
                  marginBottom: 16, borderRadius: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
        <button style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 11 }} onClick={onEdit}>Edit</button>
      </div>
      {children}
    </div>
  );
}

function SRow({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}>
      {k && <span style={{ color: "#888", width: 160, flexShrink: 0 }}>{k}:</span>}
      <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
    </div>
  );
}
