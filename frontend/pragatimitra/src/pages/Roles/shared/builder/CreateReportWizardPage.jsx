import { useState, useEffect, useRef } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import { useShell } from "../../../../components/Dashboard/shellContext";
import Toast from "../../../../components/shared/Toast";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function fmtAcYear(y) { return `${y}-${String(y + 1).slice(-2)}`; }
function genAcYears() {
  const cur = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => fmtAcYear(cur - 2 + i));
}
async function apj(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(res.ok ? "Server returned unexpected response" : `Server error (${res.status}) — restart the backend`); }
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}
function buildTree(flat) {
  const map = {};
  const roots = [];
  for (const s of flat) map[s.id] = { ...s, subsections: [] };
  for (const s of flat) {
    if (s.parent_id && map[s.parent_id]) map[s.parent_id].subsections.push(map[s.id]);
    else roots.push(map[s.id]);
  }
  roots.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  for (const r of roots) r.subsections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  return roots;
}

/* ── colour tokens ───────────────────────────────────────────────────────── */
const C = {
  primary: "#4f46e5", primaryDk: "#3730a3", primaryLt: "#eef2ff", primaryMid: "#818cf8",
  success: "#16a34a", successLt: "#f0fdf4",
  danger:  "#dc2626", dangerLt:  "#fef2f2",
  warning: "#d97706", warningLt: "#fffbeb",
  text:    "#0f172a", textSub: "#64748b", textMuted: "#94a3b8",
  border:  "#e2e8f0", bg: "#f8fafc", surface: "#fff",
};
const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 13px", fontSize: 13,
  border: `1.5px solid ${C.border}`, borderRadius: 8, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const lbl = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};
const STEPS = ["Details", "Structure", "Access", "Dept. Deadlines", "Assignments", "Summary"];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CreateReportWizardPage({ onCreated, onCancel, initialReportId }) {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const shell        = useShell();

  const [step,     setStep]    = useState(1);
  const [toast,    setToast]   = useState(null);
  const [busy,     setBusy]    = useState(false);
  const [reportId, setReportId] = useState(null);

  /* prefetched */
  const [cycles,       setCycles]       = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [tmplFetchErr, setTmplFetchErr] = useState("");
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [allRoles,     setAllRoles]     = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [users,        setUsers]        = useState([]);

  /* ── step 1 ─────────────────────────────────────────────────── */
  const [title,       setTitle]       = useState("");
  const [desc,        setDesc]        = useState("");
  const [repType,     setRepType]     = useState("Annual");
  const [acYear,      setAcYear]      = useState(fmtAcYear(new Date().getFullYear()));
  const [lang,        setLang]        = useState("en");
  const [cycleId,     setCycleId]     = useState("");
  const [tmplId,      setTmplId]      = useState("");
  const [defaultWfId, setDefaultWfId] = useState("");
  const [subDl,       setSubDl]       = useState("");
  const [revDl,       setRevDl]       = useState("");
  const [appDl,       setAppDl]       = useState("");

  /* ── step 2 ─────────────────────────────────────────────────── */
  const [sections,    setSections]    = useState([]);
  const [secFetched,  setSecFetched]  = useState(false);
  const [secFetchErr, setSecFetchErr] = useState("");

  /* ── step 3 ─────────────────────────────────────────────────── */
  const [grantedRoles,  setGrantedRoles]  = useState(new Set());
  const [accessTab,     setAccessTab]     = useState("3a");
  const [sectionAccess, setSectionAccess] = useState({});
  // { [section_id]: [{ localId, type: 'ROLE'|'USER'|'DEPT', roleName:'', userId:'', deptId:'' }] }

  /* ── step 4 ─────────────────────────────────────────────────── */
  const [deptDl, setDeptDl] = useState({}); /* {deptId:{sub,rev,app}} */

  /* ── step 5 ─────────────────────────────────────────────────── */
  const [wfDetail,        setWfDetail]        = useState(null);
  const [assigns,         setAssigns]         = useState({});
  const [secWorkflows,    setSecWorkflows]    = useState({});  // { [secId]: wfId }
  const [secWfSteps,      setSecWfSteps]      = useState({});  // { [wfId]: [steps] }
  const [brandingFiles, setBrandingFiles] = useState({ COVER_IMAGE: null, LOGO: null, BG_IMAGE: null });
  const [brandingUrls,  setBrandingUrls]  = useState({ COVER_IMAGE: "", LOGO: "", BG_IMAGE: "" });
  /* assigns: {sectionId: {auth:{type,userId,deptId,roleName,dueAt}, steps:{stepId:{...}}}} */

  /* ── mount: prefetch ────────────────────────────────────────── */
  useEffect(() => {
    const instId = user?.institutionId;
    // Fetch templates separately so errors surface instead of silently returning empty
    apj(apiFetch, "/api/builder/templates?status=ACTIVE")
      .then(d => setTemplates(d.data || []))
      .catch(e => setTmplFetchErr(e.message || "Could not load templates"));

    apj(apiFetch, "/api/users").then(d => setUsers(d.users || [])).catch(() => {});

    Promise.all([
      apj(apiFetch, "/api/builder/cycles").catch(() => ({ data: [] })),
      apj(apiFetch, "/api/builder/workflows").catch(() => ({ data: [] })),
      apj(apiFetch, "/api/builder/workflows/roles").catch(() => ({ data: [] })),
      instId ? apj(apiFetch, `/api/departments?institution_id=${instId}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([cyc, wf, roles, depts]) => {
      setCycles(cyc.data || []);
      setAllWorkflows(wf.data || []);
      setAllRoles(roles.data || []);
      setDepartments(depts.data || []);
      const def = (wf.data || []).find(w => w.is_default);
      if (def) setDefaultWfId(def.id);
    });
  }, [apiFetch]);

  /* ── load sections after report created ─────────────────────── */
  useEffect(() => {
    if (!reportId || secFetched) return;
    setSecFetchErr("");
    apj(apiFetch, `/api/builder/reports/${reportId}`)
      .then(r => {
        const tree = buildTree(r.data?.sections || []);
        const loaded = tree.map((s, i) => ({ ...s, order_index: (i + 1) * 1000, isNew: false }));
        setSections(loaded);
        // Pre-populate per-section workflow from stamped data
        const wfMap = {};
        for (const s of r.data?.sections || []) {
          if (s.workflow_template_id) wfMap[s.id] = s.workflow_template_id;
        }
        setSecWorkflows(wfMap);
        setSecFetched(true);
      }).catch(err => {
        setSecFetchErr(err.message || "Failed to load sections");
        setSecFetched(true);
      });
  }, [reportId, secFetched]);

  /* ── load existing draft report for editing/continuing ──────── */
  useEffect(() => {
    if (!initialReportId) return;
    setReportId(initialReportId);

    // Step 1 fields
    apj(apiFetch, `/api/builder/reports/${initialReportId}`)
      .then(r => {
        const d = r.data || {};
        if (d.title)               setTitle(d.title);
        if (d.description)         setDesc(d.description || "");
        if (d.report_type)         setRepType(d.report_type);
        if (d.academic_year)       setAcYear(d.academic_year);
        if (d.primary_language)    setLang(d.primary_language);
        if (d.cycle_id)            setCycleId(d.cycle_id);
        if (d.template_id)         setTmplId(d.template_id);
        if (d.default_workflow_id) setDefaultWfId(d.default_workflow_id);
        if (d.submission_deadline) setSubDl(d.submission_deadline.slice(0, 16));
        if (d.review_deadline)     setRevDl(d.review_deadline.slice(0, 16));
        if (d.approval_deadline)   setAppDl(d.approval_deadline.slice(0, 16));
      }).catch(() => {});

    // Step 3 — access grants
    apj(apiFetch, `/api/builder/reports/${initialReportId}/access`)
      .then(ac => {
        const roles = (ac.data || []).map(r => r.role_name).filter(Boolean);
        if (roles.length) setGrantedRoles(new Set(roles));
      }).catch(() => {});

    // Step 4 — dept deadlines
    apj(apiFetch, `/api/builder/reports/${initialReportId}/department-deadlines`)
      .then(dd => {
        const dlMap = {};
        for (const row of (dd.data || [])) {
          dlMap[row.department_id] = {
            sub: row.submission_deadline ? row.submission_deadline.slice(0, 16) : "",
            rev: row.review_deadline     ? row.review_deadline.slice(0, 16)     : "",
            app: row.approval_deadline   ? row.approval_deadline.slice(0, 16)   : "",
          };
        }
        if (Object.keys(dlMap).length) setDeptDl(dlMap);
      }).catch(() => {});

    // Step 5 — workflow assignments (author + review steps)
    apj(apiFetch, `/api/builder/reports/${initialReportId}/workflow-assignments`)
      .then(wa => {
        const rows = wa.data || [];
        const newAssigns = {};
        for (const a of rows) {
          const sid = a.section_id;
          if (!newAssigns[sid]) newAssigns[sid] = { auth: {}, steps: {} };
          const typeMap = { USER: "USER", DEPARTMENT: "DEPT", ROLE: "ROLE" };
          const t = typeMap[a.assignee_type] || a.assignee_type;
          const entry = {
            type:     t,
            userId:   a.user_id        || "",
            deptId:   a.department_id  || "",
            roleName: a.role_name      || "",
            dueAt:    a.due_at ? a.due_at.slice(0, 16) : "",
          };
          if (!a.workflow_step_id) {
            newAssigns[sid].auth = entry;
          } else {
            newAssigns[sid].steps[a.workflow_step_id] = entry;
          }
        }
        if (Object.keys(newAssigns).length) setAssigns(newAssigns);
      }).catch(() => {});
  }, [initialReportId, apiFetch]);

  /* ── load workflow steps when defaultWfId changes ───────────── */
  useEffect(() => {
    if (!defaultWfId) { setWfDetail(null); return; }
    apj(apiFetch, `/api/builder/workflows/${defaultWfId}`)
      .then(r => setWfDetail(r.data || null))
      .catch(() => setWfDetail(null));
  }, [defaultWfId]);

  /* ══ section helpers ════════════════════════════════════════════ */
  const addSection = () => setSections(p => [
    ...p, { id: `new_${Date.now()}`, title: "", desc: "", order_index: (p.length + 1) * 1000, isNew: true, subsections: [] },
  ]);
  const addSub = (pid) => setSections(p => p.map(s =>
    s.id === pid ? { ...s, subsections: [...s.subsections, { id: `nsub_${Date.now()}`, title: "", isNew: true }] } : s
  ));
  const updSec = (id, k, v)  => setSections(p => p.map(s => s.id === id ? { ...s, [k]: v } : s));
  const updSub = (pid, sid, k, v) => setSections(p => p.map(s =>
    s.id === pid ? { ...s, subsections: s.subsections.map(sub => sub.id === sid ? { ...sub, [k]: v } : sub) } : s
  ));
  const delSec = (id) => {
    const sec = sections.find(s => s.id === id);
    if (sec && !sec.isNew) apj(apiFetch, `/api/builder/sections/${id}`, { method: "DELETE" }).catch(() => {});
    setSections(p => p.filter(s => s.id !== id));
  };
  const delSub = (pid, sid) => {
    const par = sections.find(s => s.id === pid);
    const sub = par?.subsections.find(s => s.id === sid);
    if (sub && !sub.isNew) apj(apiFetch, `/api/builder/sections/${sid}`, { method: "DELETE" }).catch(() => {});
    setSections(p => p.map(s => s.id === pid ? { ...s, subsections: s.subsections.filter(sub => sub.id !== sid) } : s));
  };
  const mvUp   = (i) => setSections(p => { if (i === 0) return p; const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; });
  const mvDown = (i) => setSections(p => { if (i >= p.length - 1) return p; const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; });

  /* ══ step 3 helpers ═════════════════════════════════════════════ */
  const toggleRole = (name) => setGrantedRoles(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const addSecAccess = (secId) => setSectionAccess(p => ({
    ...p, [secId]: [...(p[secId]||[]), { localId: Date.now(), type: "", roleName: "", userId: "", deptId: "" }]
  }));
  const updSecAccess = (secId, localId, k, v) => setSectionAccess(p => ({
    ...p, [secId]: (p[secId]||[]).map(a => a.localId === localId ? {...a, [k]: v} : a)
  }));
  const delSecAccess = (secId, localId) => setSectionAccess(p => ({
    ...p, [secId]: (p[secId]||[]).filter(a => a.localId !== localId)
  }));

  /* ══ step 4 helpers ═════════════════════════════════════════════ */
  const setDeptField = (deptId, field, val) => setDeptDl(p => ({ ...p, [deptId]: { ...(p[deptId] || {}), [field]: val } }));
  const prefillDepts = () => {
    const f = {};
    for (const d of departments) f[d.department_id] = { sub: subDl, rev: revDl, app: appDl };
    setDeptDl(f);
  };

  /* ══ step 5 helpers ═════════════════════════════════════════════ */
  const setAuth  = (sid, k, v) => setAssigns(p => ({ ...p, [sid]: { ...(p[sid]||{}), auth: { ...(p[sid]?.auth||{}), [k]: v } } }));
  const setStepA = (sid, wsId, k, v) => setAssigns(p => {
    const sec = p[sid] || {};
    return { ...p, [sid]: { ...sec, steps: { ...(sec.steps||{}), [wsId]: { ...(sec.steps?.[wsId]||{}), [k]: v } } } };
  });

  const loadSecWfSteps = async (wfId) => {
    if (!wfId || secWfSteps[wfId]) return;
    const d = await apj(apiFetch, `/api/builder/workflows/${wfId}`).catch(() => null);
    if (d?.data?.steps) setSecWfSteps(p => ({ ...p, [wfId]: d.data.steps }));
  };

  /* ── navigate to workflow templates page, saving draft first if needed ─ */
  const navigateToWorkflowTemplates = async () => {
    if (!reportId) {
      if (!title.trim()) {
        setToast({ type: "error", message: "Enter a report name first, then try again." });
        return;
      }
      const ok = await saveStep1();
      if (!ok) return;
    }
    shell?.setActiveId("ia-workflow-templates");
  };

  /* ══ save functions ═════════════════════════════════════════════ */
  const saveStep1 = async () => {
    if (!title.trim()) { setToast({ type: "error", message: "Report name is required" }); return false; }
    setBusy(true);
    try {
      const body = {
        title: title.trim(), description: desc || null,
        report_type: repType, academic_year: acYear, primary_language: lang,
        cycle_id: cycleId || undefined,
        template_id: tmplId ? tmplId : undefined,
        default_workflow_id: defaultWfId || undefined,
        submission_deadline: subDl || undefined,
        review_deadline:     revDl || undefined,
        approval_deadline:   appDl || undefined,
      };
      if (reportId) {
        await apj(apiFetch, `/api/builder/reports/${reportId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        const r = await apj(apiFetch, "/api/builder/reports", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        setReportId(r.data.id);
      }
      return true;
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to save report" });
      return false;
    } finally { setBusy(false); }
  };

  const saveStep2 = async () => {
    if (!reportId) return true;
    setBusy(true);
    try {
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        if (s.isNew) {
          const r = await apj(apiFetch, "/api/builder/sections", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_id: reportId, title: s.title || `Section ${i+1}`, description: s.desc || null, order_index: (i+1)*1000 }),
          });
          for (let j = 0; j < (s.subsections||[]).length; j++) {
            const sub = s.subsections[j];
            await apj(apiFetch, "/api/builder/sections", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ report_id: reportId, parent_id: r.data.id, title: sub.title || `Sub ${j+1}`, order_index: (j+1)*1000 }),
            });
          }
        } else {
          await apj(apiFetch, `/api/builder/sections/${s.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_index: (i+1)*1000 }),
          }).catch(() => {});
        }
      }
      /* reload to get real UUIDs */
      const r2 = await apj(apiFetch, `/api/builder/reports/${reportId}`);
      const tree = buildTree(r2.data?.sections || []);
      setSections(tree.map((s, i) => ({ ...s, order_index: (i+1)*1000, isNew: false })));
      return true;
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to save sections" });
      return false;
    } finally { setBusy(false); }
  };

  const saveStep3 = async () => {
    if (!reportId) return true;
    setBusy(true);
    try {
      await apj(apiFetch, `/api/builder/reports/${reportId}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_names: Array.from(grantedRoles) }),
      });
      // Save section-specific access (best-effort)
      for (const [secId, grants] of Object.entries(sectionAccess)) {
        const valid = grants.filter(g => g.type && (g.roleName || g.userId || g.deptId));
        if (!valid.length) continue;
        await apj(apiFetch, `/api/builder/sections/${secId}/access`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grants: valid.map(g => ({
              role_name:     g.type === "ROLE" ? g.roleName : null,
              user_id:       g.type === "USER" ? g.userId   : null,
              department_id: g.type === "DEPT" ? g.deptId   : null,
            }))
          }),
        }).catch(() => {}); // best-effort, endpoint may not exist yet
      }
      return true;
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to save access" });
      return false;
    } finally { setBusy(false); }
  };

  const saveStep4 = async () => {
    if (!reportId) return true;
    setBusy(true);
    try {
      const deadlines = departments
        .map(d => ({
          department_id:       d.department_id,
          submission_deadline: deptDl[d.department_id]?.sub || null,
          review_deadline:     deptDl[d.department_id]?.rev || null,
          approval_deadline:   deptDl[d.department_id]?.app || null,
        }))
        .filter(d => d.submission_deadline || d.review_deadline || d.approval_deadline);
      await apj(apiFetch, `/api/builder/reports/${reportId}/department-deadlines`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deadlines }),
      });
      return true;
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to save dept deadlines" });
      return false;
    } finally { setBusy(false); }
  };

  const saveStep5 = async () => {
    if (!reportId) return true;
    setBusy(true);
    try {
      const allSecs = sections.flatMap(s => [s, ...(s.subsections || [])]);
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUUID = v => typeof v === "string" && UUID_RE.test(v);

      // Save per-section workflow — explicit override OR fall back to report default
      for (const sec of allSecs) {
        const wfId = secWorkflows[sec.id] || defaultWfId;
        if (wfId && !sec.isNew) {
          await apj(apiFetch, `/api/builder/sections/${sec.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow_template_id: wfId }),
          }).catch(() => {});
        }
      }

      const flat = [];
      for (const sec of allSecs) {
        const a = assigns[sec.id] || {};
        const auth = a.auth || {};
        if (auth.type === "ROLE" && auth.roleName) {
          flat.push({ section_id: sec.id, workflow_step_id: null, assignee_type: "ROLE", role_name: auth.roleName, due_at: auth.dueAt || null });
        } else if (auth.type === "DEPT" && isUUID(auth.deptId)) {
          flat.push({ section_id: sec.id, workflow_step_id: null, assignee_type: "DEPARTMENT", department_id: auth.deptId, due_at: auth.dueAt || null });
        } else if (auth.type === "USER" && isUUID(auth.userId)) {
          flat.push({ section_id: sec.id, workflow_step_id: null, assignee_type: "USER", user_id: auth.userId, due_at: auth.dueAt || null });
        }
        for (const [wsId, sa] of Object.entries(a.steps || {})) {
          if (!isUUID(wsId)) continue;
          if (sa.type === "ROLE" && sa.roleName) {
            flat.push({ section_id: sec.id, workflow_step_id: wsId, assignee_type: "ROLE", role_name: sa.roleName, due_at: sa.dueAt || null });
          } else if (sa.type === "DEPT" && isUUID(sa.deptId)) {
            flat.push({ section_id: sec.id, workflow_step_id: wsId, assignee_type: "DEPARTMENT", department_id: sa.deptId, due_at: sa.dueAt || null });
          } else if (sa.type === "USER" && isUUID(sa.userId)) {
            flat.push({ section_id: sec.id, workflow_step_id: wsId, assignee_type: "USER", user_id: sa.userId, due_at: sa.dueAt || null });
          }
        }
      }
      await apj(apiFetch, `/api/builder/reports/${reportId}/workflow-assignments`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: flat }),
      });

      // Upload branding files to S3 and save public URLs (best-effort)
      const uploadedUrls = { ...brandingUrls };
      for (const [assetType, file] of Object.entries(brandingFiles)) {
        if (!file) continue;
        try {
          const presign = await apj(apiFetch, "/api/upload/presign", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, folder: "branding" }),
          });
          await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          uploadedUrls[assetType] = presign.publicUrl;
          setBrandingUrls(p => ({ ...p, [assetType]: presign.publicUrl }));
        } catch { /* best-effort */ }
      }
      if (Object.values(uploadedUrls).some(u => u)) {
        await apj(apiFetch, `/api/builder/reports/${reportId}/branding`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cover_image_url: uploadedUrls.COVER_IMAGE || null,
            logo_url:        uploadedUrls.LOGO || null,
            bg_image_url:    uploadedUrls.BG_IMAGE || null,
          }),
        }).catch(() => {});
      }

      return true;
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to save assignments" });
      return false;
    } finally { setBusy(false); }
  };

  const goNext = async () => {
    let ok = true;
    if (step === 1) ok = await saveStep1();
    if (step === 2) ok = await saveStep2();
    if (step === 3) ok = await saveStep3();
    if (step === 4) ok = await saveStep4();
    if (step === 5) ok = await saveStep5();
    if (ok) setStep(s => s + 1);
  };
  const goBack = () => setStep(s => s - 1);
  const finish = () => onCreated?.({ id: reportId, title });

  /* ══════════════════════════════════════════════ RENDER ═══════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── sticky header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, background: C.surface,
        borderBottom: `1px solid ${C.border}`, padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: C.primaryLt,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
                stroke={C.primary} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M10 2v4h4" stroke={C.primary} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5 8h6M5 11h4" stroke={C.primary} strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {reportId ? "Configure Report" : "New Report"}
            </div>
            <div style={{ fontSize: 11, color: C.textSub }}>Step {step} of {STEPS.length} — {STEPS[step-1]}</div>
          </div>
        </div>

        {/* step indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step, active = n === step;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? C.success : active ? C.primary : C.bg,
                    color: done || active ? "#fff" : C.textMuted,
                    border: `2px solid ${done ? C.success : active ? C.primary : C.border}`,
                  }}>{done ? "✓" : n}</div>
                  <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, whiteSpace: "nowrap",
                    color: active ? C.primary : done ? C.success : C.textMuted }}>{label}</span>
                </div>
                {n < STEPS.length && <div style={{ width: 20, height: 2, marginBottom: 14, background: done ? C.success : C.border }} />}
              </div>
            );
          })}
        </div>

        <button onClick={onCancel} style={{
          padding: "7px 16px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 8, cursor: "pointer", fontSize: 13, color: C.textSub, fontWeight: 600, fontFamily: "inherit",
        }}>Cancel</button>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 100px" }}>

        {/* ═══ STEP 1 — Report Details ═══ */}
        {step === 1 && (
          <div>
            <StepHeading icon="📋" title="Report Details"
              subtitle={reportId ? "Update report details below." : "A draft report will be created when you click Next."} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
              <div style={{ gridColumn: "1/-1" }}>
                <F label="Report Name *">
                  <input style={inp} value={title} autoFocus onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Annual Quality Report 2026–27" />
                </F>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <F label="Description">
                  <textarea style={{ ...inp, height: 64, resize: "vertical" }} value={desc}
                    onChange={e => setDesc(e.target.value)} placeholder="Brief scope or purpose…" />
                </F>
              </div>
              <F label="Report Type *">
                <select style={inp} value={repType} onChange={e => setRepType(e.target.value)}>
                  {["Annual","NAAC","Department","Accreditation","Research","Compliance","Other"].map(t =>
                    <option key={t}>{t}</option>)}
                </select>
              </F>
              <F label="Academic Year *">
                <select style={inp} value={acYear} onChange={e => setAcYear(e.target.value)}>
                  {genAcYears().map(y => <option key={y}>{y}</option>)}
                </select>
              </F>
              <F label="Primary Language">
                <select style={inp} value={lang} onChange={e => setLang(e.target.value)}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                </select>
              </F>
              <F label="Reporting Cycle">
                <select style={inp} value={cycleId} onChange={e => setCycleId(e.target.value)}>
                  <option value="">— Not linked to a cycle —</option>
                  {cycles.filter(c => c.status !== "ARCHIVED").map(c =>
                    <option key={c.id} value={c.id}>{c.name} ({c.reporting_year || c.status})</option>)}
                </select>
              </F>
              <F label="Default Workflow">
                <select style={inp} value={defaultWfId} onChange={e => setDefaultWfId(e.target.value)}>
                  <option value="">— No workflow —</option>
                  {allWorkflows.map(w =>
                    <option key={w.id} value={w.id}>{w.name}{w.is_default ? " ★" : ""} ({w.step_count} steps)</option>)}
                </select>
                {allWorkflows.length === 0 && (
                  <button type="button" onClick={navigateToWorkflowTemplates} style={{
                    marginTop: 6, background: "none", border: "none", padding: 0,
                    fontSize: 12, color: C.primary, cursor: "pointer", textDecoration: "underline",
                    fontFamily: "inherit",
                  }}>No workflows yet — Create a workflow template →</button>
                )}
              </F>

              {/* Template picker — always show, no scratch/template toggle */}
              <div style={{ gridColumn: "1/-1", marginTop: 4 }}>
                <div style={lbl}>Report Template</div>
                {tmplFetchErr ? (
                  <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5",
                    borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
                    Failed to load templates: {tmplFetchErr}
                  </div>
                ) : (
                  <>
                    <select
                      value={tmplId}
                      onChange={e => setTmplId(e.target.value)}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 8,
                        border: `1.5px solid ${tmplId ? C.primary : C.border}`,
                        background: C.surface, color: tmplId ? C.text : C.textMuted,
                        fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer",
                      }}
                    >
                      <option value="">— Select a template —</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.report_type ? ` (${t.report_type})` : ""}{t.version ? ` · v${t.version}` : ""}
                          {t.section_count != null ? ` · ${t.section_count} section${Number(t.section_count) !== 1 ? "s" : ""}` : ""}
                        </option>
                      ))}
                    </select>
                    {templates.length === 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#92400e", padding: "10px 14px",
                        background: C.warningLt, border: "1px solid #fde68a", borderRadius: 8 }}>
                        No active templates found. Ask the Publication Cell to publish a template first.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Deadlines */}
              <div style={{ gridColumn: "1/-1", marginTop: 16 }}>
                <div style={{ ...lbl, marginBottom: 10 }}>Report-Level Deadlines <span style={{ fontWeight: 400, textTransform: "none" }}>(optional — used as defaults)</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Submission Deadline", val: subDl, set: setSubDl, color: "#d97706" },
                    { label: "Review Deadline",     val: revDl, set: setRevDl, color: "#0891b2" },
                    { label: "Approval Deadline",   val: appDl, set: setAppDl, color: "#16a34a" },
                  ].map(({ label, val, set, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 4 }}>{label}</div>
                      <input type="datetime-local" style={inp} value={val} onChange={e => set(e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <NavBar showBack={false} onNext={goNext} busy={busy}
              nextLabel={reportId ? "Update & Continue →" : "Create Draft & Continue →"} />
          </div>
        )}

        {/* ═══ STEP 2 — Section Structure ═══ */}
        {step === 2 && (
          <div>
            <StepHeading icon="🗂" title="Section Structure"
              subtitle="Sections pre-loaded from template. Reorder, add, or remove as needed." />

            {!secFetched && (
              <div style={{ textAlign: "center", padding: "48px", color: C.textSub, fontSize: 13 }}>
                Loading sections…
              </div>
            )}

            {secFetched && secFetchErr && (
              <div style={{
                padding: "12px 16px", marginBottom: 16,
                background: C.dangerLt, border: `1px solid #fca5a5`,
                borderRadius: 8, fontSize: 13, color: C.danger,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>Could not load existing sections: {secFetchErr}</span>
                <button onClick={() => { setSecFetched(false); setSecFetchErr(""); }} style={{
                  padding: "5px 12px", background: "transparent", border: `1px solid ${C.danger}`,
                  borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.danger,
                  fontFamily: "inherit", fontWeight: 600,
                }}>Retry</button>
              </div>
            )}

            {secFetched && (
              <>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{
                    padding: "12px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sections </span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>
                        {sections.length} section{sections.length !== 1 ? "s" : ""} · {sections.reduce((a, s) => a + (s.subsections?.length || 0), 0)} subsections
                      </span>
                    </div>
                    <button onClick={addSection} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                      background: C.primary, color: "#fff", border: "none", borderRadius: 8,
                      cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    }}>+ Add Section</button>
                  </div>
                  <div style={{ padding: "12px 16px", minHeight: 200, maxHeight: 520, overflowY: "auto" }}>
                    {sections.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "56px 20px" }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>No sections yet</div>
                        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16 }}>
                          Click <b>+ Add Section</b> to build the report structure.
                        </div>
                        <button onClick={addSection} style={{
                          padding: "8px 20px", background: C.primaryLt, color: C.primary,
                          border: `1.5px solid ${C.primary}`, borderRadius: 8,
                          cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                        }}>+ Add First Section</button>
                      </div>
                    ) : sections.map((sec, si) => (
                      <SectionRow
                        key={sec.id}
                        section={sec} index={si} total={sections.length}
                        onTitleChange={v => updSec(sec.id, "title", v)}
                        onDelete={() => delSec(sec.id)}
                        onAddSub={() => addSub(sec.id)}
                        onMoveUp={() => mvUp(si)}
                        onMoveDown={() => mvDown(si)}
                        onSubTitleChange={(sid, v) => updSub(sec.id, sid, "title", v)}
                        onSubDelete={sid => delSub(sec.id, sid)}
                      />
                    ))}
                  </div>
                </div>
                {sections.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                    <button onClick={addSection} style={{
                      padding: "6px 16px", background: "transparent", color: C.primary,
                      border: `1.5px dashed ${C.primaryMid}`, borderRadius: 8,
                      cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    }}>+ Add Another Section</button>
                  </div>
                )}
              </>
            )}
            <NavBar onBack={goBack} onNext={goNext} busy={busy} />
          </div>
        )}

        {/* ═══ STEP 3 — Access ═══ */}
        {step === 3 && (
          <div>
            <StepHeading icon="🔐" title="Access Configuration"
              subtitle="Choose which roles can view this report. Institute Admins always have full access." />

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 20 }}>
              {[
                { id: "3a", label: "3a · Report Access" },
                { id: "3b", label: "3b · Section Access" },
              ].map(tab => (
                <button key={tab.id} onClick={() => setAccessTab(tab.id)} style={{
                  padding: "9px 20px", border: "none", borderBottom: `2px solid ${accessTab === tab.id ? C.primary : "transparent"}`,
                  marginBottom: -2, background: "transparent", cursor: "pointer",
                  fontSize: 13, fontWeight: accessTab === tab.id ? 700 : 500,
                  color: accessTab === tab.id ? C.primary : C.textSub,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}>{tab.label}</button>
              ))}
            </div>

            {/* 3a — Report-wide role access */}
            {accessTab === "3a" && (
              <>
                <div style={{
                  padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: 8, fontSize: 12, color: "#1e40af", marginBottom: 20,
                }}>
                  Role grants here allow that role to view the report and its sections. Per-section write
                  assignments are configured in Step 5 and can also be managed after creation.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allRoles.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px", color: C.textSub, fontSize: 13 }}>
                      No roles available. Access can be configured after creation.
                    </div>
                  )}
                  {allRoles.map(role => {
                    const granted = grantedRoles.has(role.name);
                    return (
                      <div key={role.id || role.name} onClick={() => toggleRole(role.name)} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                        border: `1.5px solid ${granted ? C.primary : C.border}`,
                        background: granted ? C.primaryLt : C.surface, transition: "all 0.15s",
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{role.display_name || role.name}</div>
                          {role.description && <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{role.description}</div>}
                        </div>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          background: granted ? C.primary : C.bg,
                          border: `2px solid ${granted ? C.primary : C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {granted && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {grantedRoles.size > 0 && (
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.textSub }}>Granted to:</span>
                    {Array.from(grantedRoles).map(rn => {
                      const r = allRoles.find(x => x.name === rn);
                      return (
                        <span key={rn} style={{
                          padding: "3px 10px", background: C.primaryLt, color: C.primary,
                          borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${C.primaryMid}`,
                        }}>{r?.display_name || rn}</span>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 3b — Section-specific access */}
            {accessTab === "3b" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {sections.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px", color: C.textSub, fontSize: 13 }}>
                    No sections defined yet. Add sections in Step 2 first.
                  </div>
                ) : sections.map(sec => {
                  const grants = sectionAccess[sec.id] || [];
                  return (
                    <div key={sec.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sec.title || "(untitled)"}</span>
                        <button onClick={() => addSecAccess(sec.id)} style={{
                          padding: "5px 12px", background: C.primaryLt, color: C.primary,
                          border: `1px solid ${C.primaryMid}`, borderRadius: 7,
                          cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                        }}>+ Add Access</button>
                      </div>
                      <div style={{ padding: "12px 16px" }}>
                        {grants.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
                            No section-specific access — inherits report-level access.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {grants.map(grant => (
                              <div key={grant.localId} style={{ display: "grid", gridTemplateColumns: "140px 1fr 36px", gap: 10, alignItems: "end" }}>
                                <div>
                                  <div style={lbl}>Type</div>
                                  <select style={{ ...inp, padding: "7px 10px" }}
                                    value={grant.type}
                                    onChange={e => updSecAccess(sec.id, grant.localId, "type", e.target.value)}>
                                    <option value="">— Select —</option>
                                    <option value="ROLE">Role</option>
                                    <option value="USER">User</option>
                                    <option value="DEPT">Department</option>
                                  </select>
                                </div>
                                <div>
                                  {grant.type === "ROLE" && (
                                    <>
                                      <div style={lbl}>Role</div>
                                      <select style={{ ...inp, padding: "7px 10px" }}
                                        value={grant.roleName}
                                        onChange={e => updSecAccess(sec.id, grant.localId, "roleName", e.target.value)}>
                                        <option value="">— Select role —</option>
                                        {allRoles.map(r => <option key={r.id || r.name} value={r.name}>{r.display_name || r.name}</option>)}
                                      </select>
                                    </>
                                  )}
                                  {grant.type === "USER" && (
                                    <>
                                      <div style={lbl}>User</div>
                                      <select style={{ ...inp, padding: "7px 10px" }}
                                        value={grant.userId}
                                        onChange={e => updSecAccess(sec.id, grant.localId, "userId", e.target.value)}>
                                        <option value="">— Select user —</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                                      </select>
                                    </>
                                  )}
                                  {grant.type === "DEPT" && (
                                    <>
                                      <div style={lbl}>Department</div>
                                      <select style={{ ...inp, padding: "7px 10px" }}
                                        value={grant.deptId}
                                        onChange={e => updSecAccess(sec.id, grant.localId, "deptId", e.target.value)}>
                                        <option value="">— Select department —</option>
                                        {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                                      </select>
                                    </>
                                  )}
                                  {!grant.type && <div />}
                                </div>
                                <div style={{ paddingBottom: 2 }}>
                                  <button onClick={() => delSecAccess(sec.id, grant.localId)} style={{
                                    width: 32, height: 34, background: C.dangerLt, border: `1px solid #fca5a5`,
                                    borderRadius: 7, cursor: "pointer", color: C.danger, fontSize: 16,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>×</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <NavBar onBack={goBack} onNext={goNext} busy={busy} />
          </div>
        )}

        {/* ═══ STEP 4 — Dept Deadlines ═══ */}
        {step === 4 && (
          <div>
            <StepHeading icon="📅" title="Department Deadlines"
              subtitle="Set default deadlines per department. Leave blank to inherit the report-level deadlines." />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.textSub }}>
                {departments.length} department{departments.length !== 1 ? "s" : ""}
                {!subDl && !revDl && !appDl && (
                  <span style={{ color: C.warning, marginLeft: 8 }}>
                    — No report-level deadlines set. Go back to Step 1 to add them.
                  </span>
                )}
              </div>
              {(subDl || revDl || appDl) && (
                <button onClick={prefillDepts} style={{
                  padding: "6px 14px", background: C.primaryLt, color: C.primary,
                  border: `1px solid ${C.primaryMid}`, borderRadius: 8,
                  cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                }}>Pre-fill all from report deadlines</button>
              )}
            </div>
            {departments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: C.textSub, fontSize: 13 }}>
                No departments found. Skipping this step is fine.
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: C.textSub,
                        textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left",
                        borderBottom: `1px solid ${C.border}` }}>Department</th>
                      {[["Submission", "#d97706"], ["Review", "#0891b2"], ["Approval", "#16a34a"]].map(([label, color]) => (
                        <th key={label} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700,
                          color, textTransform: "uppercase", letterSpacing: "0.07em",
                          borderBottom: `1px solid ${C.border}` }}>{label} DL</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept, i) => {
                      const dl = deptDl[dept.department_id] || {};
                      return (
                        <tr key={dept.department_id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "#fff" : C.bg }}>
                          <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>
                            {dept.name}
                            {dept.code && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>{dept.code}</span>}
                          </td>
                          {[["sub","#d97706"],["rev","#0891b2"],["app","#16a34a"]].map(([key, color]) => (
                            <td key={key} style={{ padding: "8px 10px" }}>
                              <input type="datetime-local" value={dl[key] || ""} style={{
                                ...inp, padding: "6px 8px", fontSize: 11,
                                borderColor: dl[key] ? color : C.border,
                              }} onChange={e => setDeptField(dept.department_id, key, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <NavBar onBack={goBack} onNext={goNext} busy={busy} />
          </div>
        )}

        {/* ═══ STEP 5 — Assignments ═══ */}
        {step === 5 && (
          <div>
            <StepHeading icon="⚙" title="Workflow Assignments"
              subtitle="Assign who authors each section and who reviews it at each workflow step." />

            {!defaultWfId && (
              <div style={{
                padding: "10px 14px", background: C.warningLt, border: "1px solid #fde68a",
                borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 16,
              }}>
                No workflow selected. You can assign authors here; review steps require a workflow template.
                Set one in Step 1 before configuring step-level assignments.
              </div>
            )}

            {sections.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: C.textSub, fontSize: 13 }}>
                No sections to assign. Add sections in Step 2 first.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sections.flatMap(s => [s, ...(s.subsections || []).map(sub => ({ ...sub, _indent: true }))]).map(sec => {
                  const secWfId = secWorkflows[sec.id] || defaultWfId || "";
                  const secSteps = secWfSteps[secWfId] || wfDetail?.steps || [];
                  return (
                    <div key={sec.id} style={{
                      border: `1.5px solid ${assigns[sec.id]?.auth?.type ? C.primary : C.border}`,
                      borderRadius: 10, overflow: "hidden",
                      marginLeft: sec._indent ? 32 : 0,
                    }}>
                      {/* Section header with per-section workflow selector */}
                      <div style={{ padding: "10px 16px", background: assigns[sec.id]?.auth?.type ? C.primaryLt : C.bg,
                        borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: sec._indent ? 12 : 13, fontWeight: 700, color: C.text, flex: 1 }}>
                          {sec._indent ? "↳ " : ""}{sec.title || "(untitled)"}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>Workflow:</span>
                          <select
                            style={{ ...inp, width: "auto", padding: "5px 10px", fontSize: 12, minWidth: 180 }}
                            value={secWfId}
                            onChange={e => {
                              const val = e.target.value;
                              setSecWorkflows(p => ({ ...p, [sec.id]: val }));
                              loadSecWfSteps(val);
                            }}
                          >
                            <option value="">— No workflow —</option>
                            {allWorkflows.map(w => (
                              <option key={w.id} value={w.id}>{w.name}{w.is_default ? " ★" : ""}</option>
                            ))}
                          </select>
                          {allWorkflows.length === 0 && (
                            <button type="button" onClick={navigateToWorkflowTemplates} style={{
                              background: "none", border: "none", padding: 0,
                              fontSize: 11, color: C.primary, cursor: "pointer",
                              textDecoration: "underline", fontFamily: "inherit", flexShrink: 0,
                            }}>Create one →</button>
                          )}
                        </div>
                      </div>
                      <SectionAssignPanel
                        section={sec}
                        wfSteps={secSteps}
                        assigns={assigns[sec.id] || {}}
                        departments={departments}
                        roles={allRoles}
                        users={users}
                        onAuthChange={(k, v) => setAuth(sec.id, k, v)}
                        onStepChange={(wsId, k, v) => setStepA(sec.id, wsId, k, v)}
                        inlineHeader
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Branding — direct file upload */}
            <div style={{ marginTop: 28, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>🖼</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Branding Assets</span>
                <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>(optional — uploaded to S3 on save)</span>
              </div>
              <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {[
                  { key: "COVER_IMAGE", label: "Cover Image", icon: "🖼" },
                  { key: "LOGO",        label: "Logo",        icon: "🏷" },
                  { key: "BG_IMAGE",    label: "Background",  icon: "🎨" },
                ].map(asset => (
                  <div key={asset.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                      letterSpacing: "0.07em", marginBottom: 6 }}>{asset.icon} {asset.label}</div>
                    <label style={{ display: "block", cursor: "pointer" }}>
                      <div style={{
                        border: `1.5px dashed ${brandingFiles[asset.key] ? C.primary : C.border}`,
                        borderRadius: 8, padding: "10px 12px", fontSize: 12,
                        color: brandingFiles[asset.key] ? C.primary : C.textMuted,
                        background: brandingFiles[asset.key] ? C.primaryLt : C.bg,
                        transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {brandingFiles[asset.key] ? brandingFiles[asset.key].name : "Click to upload…"}
                        </span>
                      </div>
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={e => {
                          const f = e.target.files[0];
                          if (f) setBrandingFiles(p => ({ ...p, [asset.key]: f }));
                        }} />
                    </label>
                    {brandingUrls[asset.key] && (
                      <div style={{ fontSize: 10, color: C.success, marginTop: 3 }}>✓ Uploaded</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <NavBar onBack={goBack} onNext={goNext} busy={busy} nextLabel="Save & Review →" />
          </div>
        )}

        {/* ═══ STEP 6 — Summary ═══ */}
        {step === 6 && (
          <div>
            <StepHeading icon="✅" title="Summary" subtitle="Report created. Review the configuration below." />

            <div style={{
              padding: "16px 20px", background: C.successLt, border: "1px solid #86efac",
              borderRadius: 10, marginBottom: 24, display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 28 }}>🎉</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.success }}>
                  "{title}" created as Draft
                </div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>
                  Open it from the Reports list to manage sections, assign contributors, and publish.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SumCard label="Report Details" icon="📋">
                <SumRow k="Name"          v={title} />
                <SumRow k="Type"          v={repType} />
                <SumRow k="Academic Year" v={acYear} />
                <SumRow k="Language"      v={{ en: "English", hi: "Hindi", ta: "Tamil" }[lang] || lang} />
                <SumRow k="Cycle"         v={cycles.find(c => c.id === cycleId)?.name || "—"} />
                <SumRow k="Workflow"      v={allWorkflows.find(w => w.id === defaultWfId)?.name || "None"} />
                <SumRow k="Structure"     v={templates.find(t => t.id === tmplId)?.name || "None"} />
              </SumCard>

              <SumCard label="Structure" icon="🗂">
                <SumRow k="Total sections"
                  v={`${sections.length} section${sections.length!==1?"s":""}, ${sections.reduce((a,s)=>a+(s.subsections?.length||0),0)} subsections`} />
                {sections.slice(0, 6).map((s, i) => (
                  <div key={s.id} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
                    <span style={{ minWidth: 18, fontSize: 11, color: C.textMuted }}>{i+1}.</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                      {s.title || "(untitled)"}
                      {(s.subsections?.length||0) > 0 && <span style={{ color: C.textMuted, fontWeight: 400 }}> +{s.subsections.length} sub</span>}
                    </span>
                  </div>
                ))}
                {sections.length > 6 && <div style={{ fontSize: 11, color: C.textMuted }}>…and {sections.length - 6} more</div>}
              </SumCard>

              <SumCard label="Access" icon="🔐">
                {grantedRoles.size === 0
                  ? <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>No additional roles granted</span>
                  : Array.from(grantedRoles).map(rn => {
                    const r = allRoles.find(x => x.name === rn);
                    return <SumRow key={rn} k="Role" v={r?.display_name || rn} />;
                  })}
              </SumCard>

              <SumCard label="Dept. Deadlines" icon="📅">
                {Object.entries(deptDl).filter(([, dl]) => dl?.sub || dl?.rev || dl?.app).length === 0
                  ? <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>None configured</span>
                  : Object.entries(deptDl).filter(([, dl]) => dl?.sub || dl?.rev || dl?.app).map(([id, dl]) => {
                    const d = departments.find(x => x.department_id === id);
                    return (
                      <div key={id} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{d?.name || id}</div>
                        {dl.sub && <SumRow k="  Submission" v={dl.sub.replace("T", " ")} />}
                        {dl.rev && <SumRow k="  Review"     v={dl.rev.replace("T", " ")} />}
                        {dl.app && <SumRow k="  Approval"   v={dl.app.replace("T", " ")} />}
                      </div>
                    );
                  })}
              </SumCard>

              <SumCard label="Assignments" icon="⚙">
                {(() => {
                  const withAuth = sections.filter(s => assigns[s.id]?.auth?.type).length;
                  const noAuth   = sections.filter(s => !assigns[s.id]?.auth?.type).length;
                  return (
                    <>
                      <SumRow k="Sections with author" v={`${withAuth} / ${sections.length}`} />
                      {noAuth > 0 && (
                        <div style={{ padding: "6px 10px", background: C.warningLt, border: "1px solid #fde68a",
                          borderRadius: 6, fontSize: 11, color: "#92400e", marginTop: 8 }}>
                          {noAuth} section{noAuth !== 1 ? "s" : ""} without an author — assign later from the Report Dashboard.
                        </div>
                      )}
                    </>
                  );
                })()}
              </SumCard>
            </div>

            <div style={{
              marginTop: 28, padding: "20px 24px", background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Ready to go</div>
                <div style={{ fontSize: 12, color: C.textSub }}>
                  Click Done to return to the reports list. The report is saved as Draft.
                </div>
              </div>
              <button onClick={finish} style={{
                padding: "11px 28px", background: C.success, border: "none",
                borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700,
                color: "#fff", fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
              }}>Done ✓</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ══ Section row ══════════════════════════════════════════════════════════ */
function SectionRow({ section, index, total, onTitleChange, onDelete, onAddSub,
    onMoveUp, onMoveDown, onSubTitleChange, onSubDelete }) {
  const [editing, setEditing] = useState(!section.title);
  const inputRef = useRef();
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        borderRadius: 9, background: C.bg, border: `1.5px solid ${C.border}`,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.primary, color: "#fff",
          fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {index + 1}
        </div>
        {editing ? (
          <input ref={inputRef} value={section.title}
            onChange={e => onTitleChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => e.key === "Enter" && setEditing(false)}
            placeholder="Section name…"
            style={{ ...inp, flex: 1, padding: "4px 8px", fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${C.primary}`, borderRadius: 6 }} />
        ) : (
          <span onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 13, fontWeight: 600,
            cursor: "text", color: section.title ? C.text : C.textMuted }}>
            {section.title || <em>Click to name…</em>}
            {section.isNew && <span style={{ fontSize: 9, color: C.primaryMid, marginLeft: 6, fontWeight: 400 }}>new</span>}
          </span>
        )}
        {(section.subsections?.length || 0) > 0 && (
          <span style={{ fontSize: 10, color: C.textSub }}>{section.subsections.length} sub</span>
        )}
        <button onClick={onMoveUp} disabled={index === 0} style={arrowBtn(index === 0)}>↑</button>
        <button onClick={onMoveDown} disabled={index === total - 1} style={arrowBtn(index === total - 1)}>↓</button>
        <button onClick={onAddSub} style={{ padding: "3px 9px", background: "#e0e7ff", border: "none",
          borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.primary, fontFamily: "inherit" }}>
          + Sub
        </button>
        <button onClick={onDelete} style={{ width: 26, height: 26, background: C.dangerLt,
          border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer", color: C.danger,
          fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
      </div>
      {(section.subsections || []).map(sub => (
        <SubRow key={sub.id} sub={sub}
          onChange={v => onSubTitleChange(sub.id, v)}
          onDelete={() => onSubDelete(sub.id)} />
      ))}
    </div>
  );
}

function SubRow({ sub, onChange, onDelete }) {
  const [editing, setEditing] = useState(!sub.title);
  const ref = useRef();
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 32, marginTop: 4,
      padding: "7px 10px", borderRadius: 7, background: C.surface, border: `1px solid ${C.border}` }}>
      <div style={{ width: 12, height: 1, background: C.border }} />
      <div style={{ width: 12, height: 12, borderRadius: 3, background: C.primaryLt,
        border: `1px solid ${C.primaryMid}55`, flexShrink: 0 }} />
      {editing ? (
        <input ref={ref} value={sub.title}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={e => e.key === "Enter" && setEditing(false)}
          placeholder="Subsection name…"
          style={{ ...inp, flex: 1, padding: "3px 7px", fontSize: 12, border: `1.5px solid ${C.primary}`, borderRadius: 5 }} />
      ) : (
        <span onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 12, cursor: "text",
          color: sub.title ? C.text : C.textMuted }}>
          {sub.title || <em>Click to name…</em>}
        </span>
      )}
      <button onClick={onDelete} style={{ width: 22, height: 22, background: "transparent",
        border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", color: C.danger,
        fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
    </div>
  );
}

function arrowBtn(disabled) {
  return {
    width: 26, height: 26, background: disabled ? C.bg : "#e0e7ff",
    border: `1px solid ${disabled ? C.border : C.primaryMid}`,
    borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
    color: disabled ? C.textMuted : C.primary, fontSize: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

/* ══ Section assignment panel ════════════════════════════════════════════ */
function SectionAssignPanel({ section, wfSteps, assigns, departments, roles, users, onAuthChange, onStepChange, inlineHeader }) {
  const [open, setOpen] = useState(false);
  const auth  = assigns.auth  || {};
  const steps = assigns.steps || {};
  const hasAuth = !!auth.type;
  const assignedSteps = wfSteps.filter(ws => !!steps[ws.id]?.type).length;

  // When rendered with inlineHeader=true, the outer border/header is managed by the parent
  // We just render the collapsible body with a minimal trigger row
  if (inlineHeader) {
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: hasAuth ? C.primaryLt : C.surface, cursor: "pointer", borderTop: `1px solid ${C.border}`,
        }} onClick={() => setOpen(o => !o)}>
          <div style={{ flex: 1, display: "flex", gap: 6 }}>
            <Chip color={hasAuth ? C.primary : C.textMuted}>
              {hasAuth ? (auth.type === "ROLE" ? `Role: ${auth.roleName || "…"}` : auth.type === "USER" ? "User assigned" : "Dept assigned") : "No author set"}
            </Chip>
            {wfSteps.length > 0 && (
              <Chip color={assignedSteps === wfSteps.length ? C.success : C.textMuted}>
                {assignedSteps}/{wfSteps.length} steps
              </Chip>
            )}
          </div>
          <span style={{ fontSize: 13, color: C.textSub }}>{open ? "▾" : "▸"} {open ? "Collapse" : "Configure"}</span>
        </div>
        {open && (
          <div style={{ padding: "16px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...lbl, marginBottom: 10 }}>Authoring — who writes this section?</div>
              <AssignRow val={auth} onChange={onAuthChange} departments={departments} roles={roles} users={users} />
            </div>
            {wfSteps.length > 0 && (
              <div>
                <div style={{ ...lbl, marginBottom: 10 }}>Review steps</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {wfSteps.map((ws, i) => (
                    <div key={ws.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px",
                      background: steps[ws.id]?.type ? "#fafbff" : C.surface }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.primary,
                          color: "#fff", fontSize: 10, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{ws.step_name}</span>
                        {ws.approver_role && (
                          <span style={{ fontSize: 10, color: C.textSub }}>
                            template: {ws.approver_role}
                            {ws.approver_department_name ? ` @ ${ws.approver_department_name}` : ""}
                          </span>
                        )}
                      </div>
                      <AssignRow val={steps[ws.id] || {}} onChange={(k, v) => onStepChange(ws.id, k, v)}
                        departments={departments} roles={roles} users={users} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      border: `1.5px solid ${hasAuth ? C.primary : C.border}`,
      borderRadius: 10, overflow: "hidden",
      marginLeft: section._indent ? 32 : 0,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: hasAuth ? C.primaryLt : C.bg, cursor: "pointer",
      }} onClick={() => setOpen(o => !o)}>
        <div style={{ fontSize: section._indent ? 12 : 13, fontWeight: 700, color: C.text, flex: 1 }}>
          {section._indent ? "↳ " : ""}{section.title || "(untitled)"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip color={hasAuth ? C.primary : C.textMuted}>
            {hasAuth ? (auth.type === "ROLE" ? `Role: ${auth.roleName || "…"}` : auth.type === "USER" ? "User assigned" : "Dept assigned") : "No author"}
          </Chip>
          {wfSteps.length > 0 && (
            <Chip color={assignedSteps === wfSteps.length ? C.success : C.textMuted}>
              {assignedSteps}/{wfSteps.length} steps
            </Chip>
          )}
        </div>
        <span style={{ fontSize: 14, color: C.textSub }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...lbl, marginBottom: 10 }}>Authoring — who writes this section?</div>
            <AssignRow val={auth} onChange={onAuthChange} departments={departments} roles={roles} users={users} />
          </div>
          {wfSteps.length > 0 && (
            <div>
              <div style={{ ...lbl, marginBottom: 10 }}>Review steps</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {wfSteps.map((ws, i) => (
                  <div key={ws.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px",
                    background: steps[ws.id]?.type ? "#fafbff" : C.surface }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.primary,
                        color: "#fff", fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{ws.step_name}</span>
                      {ws.approver_role && (
                        <span style={{ fontSize: 10, color: C.textSub }}>
                          template: {ws.approver_role}
                          {ws.approver_department_name ? ` @ ${ws.approver_department_name}` : ""}
                        </span>
                      )}
                    </div>
                    <AssignRow val={steps[ws.id] || {}} onChange={(k, v) => onStepChange(ws.id, k, v)}
                      departments={departments} roles={roles} users={users} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssignRow({ val, onChange, departments, roles, users }) {
  const { type = "", deptId = "", roleName = "", userId = "", dueAt = "" } = val;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 170px", gap: 10, alignItems: "end" }}>
      <div>
        <div style={lbl}>Assignee type</div>
        <select style={{ ...inp, padding: "7px 10px" }} value={type}
          onChange={e => { onChange("type", e.target.value); onChange("deptId", ""); onChange("roleName", ""); onChange("userId", ""); }}>
          <option value="">— Skip —</option>
          <option value="ROLE">By Role</option>
          <option value="DEPT">By Department</option>
          <option value="USER">By User</option>
        </select>
      </div>
      <div>
        {type === "ROLE" && (
          <>
            <div style={lbl}>Role</div>
            <select style={{ ...inp, padding: "7px 10px" }} value={roleName} onChange={e => onChange("roleName", e.target.value)}>
              <option value="">— Select role —</option>
              {roles.map(r => <option key={r.id || r.name} value={r.name}>{r.display_name || r.name}</option>)}
            </select>
          </>
        )}
        {type === "DEPT" && (
          <>
            <div style={lbl}>Department</div>
            <select style={{ ...inp, padding: "7px 10px" }} value={deptId} onChange={e => onChange("deptId", e.target.value)}>
              <option value="">— Select department —</option>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
            </select>
          </>
        )}
        {type === "USER" && (
          <>
            <div style={lbl}>User</div>
            <select style={{ ...inp, padding: "7px 10px" }} value={userId} onChange={e => onChange("userId", e.target.value)}>
              <option value="">— Select user —</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </>
        )}
        {!type && <div />}
      </div>
      <div>
        <div style={lbl}>Due at</div>
        <input type="datetime-local" style={{ ...inp, padding: "7px 10px" }} value={dueAt}
          onChange={e => onChange("dueAt", e.target.value)} />
      </div>
    </div>
  );
}

function Chip({ children, color }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}44`,
    }}>{children}</span>
  );
}

/* ══ Shared micro-components ═════════════════════════════════════════════ */
function SumCard({ label, icon, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
      </div>
      <div style={{ padding: "12px 16px" }}>{children}</div>
    </div>
  );
}
function SumRow({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4, alignItems: "flex-start" }}>
      <span style={{ color: C.textMuted, minWidth: 130, flexShrink: 0 }}>{k}:</span>
      <span style={{ color: C.text, fontWeight: 600 }}>{String(v ?? "—")}</span>
    </div>
  );
}
function StepHeading({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.textSub, margin: 0, paddingLeft: 34 }}>{subtitle}</p>
      <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginTop: 16 }} />
    </div>
  );
}
function NavBar({ onBack, onNext, busy, showBack = true, nextLabel = "Next →" }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 32 }}>
      {showBack && onBack && (
        <button onClick={onBack} disabled={busy} style={{
          padding: "9px 22px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 9, cursor: busy ? "not-allowed" : "pointer",
          fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
        }}>← Back</button>
      )}
      {onNext && (
        <button onClick={onNext} disabled={busy} style={{
          padding: "9px 24px", background: busy ? C.primaryMid : C.primary,
          border: "none", borderRadius: 9, cursor: busy ? "not-allowed" : "pointer",
          fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit",
          boxShadow: "0 2px 6px rgba(79,70,229,0.3)", minWidth: 140,
        }}>{busy ? "Saving…" : nextLabel}</button>
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
