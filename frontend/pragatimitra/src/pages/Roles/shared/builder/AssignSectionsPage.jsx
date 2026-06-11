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

const C = {
  primary: "#4f8ef7", primaryDark: "#1565c0", primaryLt: "#e8f0fe",
  success: "#43a047", successLt: "#e8f5e9",
  danger: "#e53935", dangerLt: "#fef2f2",
  warning: "#f9a825", warningLt: "#fffde7",
  text: "#1a1a2e", textSub: "#555", border: "#e0e4ea",
  bg: "#f7f8fa", surface: "#fff",
};

const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  color: C.textSub,  bg: "#f0f0f0"  },
  IN_PROGRESS:  { label: "In Progress",  color: C.primary,  bg: C.primaryLt },
  SUBMITTED:    { label: "Submitted",    color: C.warning,  bg: C.warningLt },
  UNDER_REVIEW: { label: "Under Review", color: "#7c4dff",  bg: "#ede7f6"  },
  APPROVED:     { label: "Approved",     color: C.success,  bg: C.successLt },
  SENT_BACK:    { label: "Sent Back",    color: C.danger,   bg: C.dangerLt  },
  LOCKED:       { label: "Locked",       color: "#555",     bg: "#e0e0e0"   },
};

const inp = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13,
  border: `1px solid ${C.border}`, borderRadius: 7, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const primaryBtn = {
  padding: "8px 18px", background: C.primary, color: "#fff",
  border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const outlineBtn = { ...primaryBtn, background: "transparent", color: C.primary, border: `1px solid ${C.primary}` };
const dangerBtn  = { ...primaryBtn, background: C.danger };

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function AssignSectionsPage({ reportId, onBack }) {
  const { apiFetch }   = useApi();
  const { user: authUser } = useAuth();
  const [sections,    setSections]    = useState([]);
  const [users,       setUsers]       = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selected,    setSelected]    = useState(new Set()); // section ids
  const [assignments, setAssignments] = useState({}); // sectionId → { users, departments }
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState(null);
  const [busy,        setBusy]        = useState(false);

  /* assignment form state */
  const [assignUserId, setAssignUserId]   = useState("");
  const [assignRole,   setAssignRole]     = useState("CONTRIBUTOR");
  const [assignDeptId, setAssignDeptId]   = useState("");
  const [assignDue,    setAssignDue]      = useState("");
  const [userSearch,   setUserSearch]     = useState("");
  const [activeTab,    setActiveTab]      = useState("user"); // 'user' | 'dept'
  const [selSection,   setSelSection]     = useState(null); // sectionId being viewed

  /* ── load ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const instId = authUser?.institutionId || authUser?.institution_id || "";
      const deptUrl = instId
        ? `/api/departments?institution_id=${instId}`
        : "/api/departments";

      const [repRes, userRes, deptRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/reports/${reportId}`),
        apiJson(apiFetch, "/api/users"),
        apiJson(apiFetch, deptUrl),
      ]);
      const raw  = repRes.data?.sections || [];
      const tree = raw.filter(s => !s.parent_id).map(r => ({
        ...r,
        children: raw.filter(c => c.parent_id === r.id).sort((a, b) => a.order_index - b.order_index),
      }));
      setSections(tree);
      setUsers(userRes.users || userRes.data || []);
      // departments API returns { data: [ { department_id, name, ... } ] }
      setDepartments(deptRes.data || []);
    } catch {
      setToast({ type: "error", message: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }, [reportId, authUser]);

  useEffect(() => { load(); }, [load]);

  /* load assignments for a section */
  const loadAssignments = useCallback(async (secId) => {
    try {
      const res = await apiJson(apiFetch, `/api/builder/assignments/section/${secId}`);
      setAssignments(p => ({ ...p, [secId]: res.data }));
    } catch {}
  }, []);

  useEffect(() => {
    if (selSection) loadAssignments(selSection);
  }, [selSection, loadAssignments]);

  /* ── toggle selection ── */
  const toggle = (id) => setSelected(p => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleAll = () => {
    const all = getAllSectionIds();
    if (selected.size === all.length) setSelected(new Set());
    else setSelected(new Set(all));
  };

  const getAllSectionIds = () => {
    const ids = [];
    for (const s of sections) { ids.push(s.id); for (const c of s.children || []) ids.push(c.id); }
    return ids;
  };

  /* ── assign single user to selected sections ── */
  const handleBulkAssign = async () => {
    if (!selected.size) return setToast({ type: "error", message: "Select at least one section" });
    if (!assignUserId && !assignDeptId) return setToast({ type: "error", message: "Select a user or department" });
    setBusy(true);
    try {
      const secIds = [...selected];
      await apiJson(apiFetch, `/api/builder/assignments/report/${reportId}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_ids:   secIds,
          user_id:       assignUserId || undefined,
          department_id: assignDeptId || undefined,
          role:          assignRole,
          due_at:        assignDue   || undefined,
        }),
      });
      setToast({ type: "success", message: `Assigned to ${selected.size} section(s)` });
      setSelected(new Set());
      setAssignUserId("");
      setAssignDeptId("");
      setAssignDue("");
      if (selSection) await loadAssignments(selSection);
    } catch (err) {
      setToast({ type: "error", message: err.message || "Assignment failed" });
    } finally {
      setBusy(false);
    }
  };

  /* ── remove assignment ── */
  const removeAssignment = async (assignId, type) => {
    try {
      if (type === "user") {
        await apiJson(apiFetch, `/api/builder/assignments/${assignId}`, { method: "DELETE" });
      } else {
        // deptId stored in assignId for dept — use section-level delete
        const [secId, deptId] = assignId.split("::");
        await apiJson(apiFetch, `/api/builder/assignments/section/${secId}/departments/${deptId}`, { method: "DELETE" });
      }
      if (selSection) await loadAssignments(selSection);
      setToast({ type: "success", message: "Assignment removed" });
    } catch {
      setToast({ type: "error", message: "Failed to remove assignment" });
    }
  };

  const filteredUsers = users.filter(u =>
    !userSearch.trim() ||
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const allIds = getAllSectionIds();

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.textSub }}>
      Loading assignment data…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* header */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
                       padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.primary }} onClick={onBack}>←</button>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.text }}>Assign Sections</div>
        <div style={{ fontSize: 12, color: C.textSub }}>{selected.size} section(s) selected</div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "flex", gap: 24 }}>

        {/* ── LEFT: section tree ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", gap: 12 }}>
              <input type="checkbox" checked={selected.size === allIds.length && allIds.length > 0}
                onChange={toggleAll} style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Section Tree</span>
              <span style={{ fontSize: 11, color: C.textSub, marginLeft: "auto" }}>
                {allIds.length} total sections
              </span>
            </div>

            <div style={{ padding: 12 }}>
              {sections.map(sec => (
                <div key={sec.id}>
                  <SectionRow sec={sec} depth={0} selected={selected.has(sec.id)}
                    onToggle={() => toggle(sec.id)} active={selSection === sec.id}
                    onSelect={() => setSelSection(sec.id === selSection ? null : sec.id)} />
                  {(sec.children || []).map(child => (
                    <SectionRow key={child.id} sec={child} depth={1} selected={selected.has(child.id)}
                      onToggle={() => toggle(child.id)} active={selSection === child.id}
                      onSelect={() => setSelSection(child.id === selSection ? null : child.id)} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── assignments for selected section ── */}
          {selSection && assignments[selSection] && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                          marginTop: 16, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                Assignments — {sections.flatMap(s => [s, ...(s.children || [])]).find(s => s.id === selSection)?.title}
              </div>

              <Tabs active={activeTab} onChange={setActiveTab}
                tabs={[{ id: "user", label: `Users (${assignments[selSection]?.users?.length || 0})` },
                       { id: "dept", label: `Departments (${assignments[selSection]?.departments?.length || 0})` }]} />

              {activeTab === "user" && (
                <div style={{ marginTop: 12 }}>
                  {!assignments[selSection]?.users?.length && (
                    <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "20px 0" }}>No user assignments</div>
                  )}
                  {assignments[selSection]?.users?.map(a => (
                    <AssignmentRow key={a.id} name={a.full_name} email={a.email} role={a.role}
                      due={a.due_at} onRemove={() => removeAssignment(a.id, "user")} />
                  ))}
                </div>
              )}

              {activeTab === "dept" && (
                <div style={{ marginTop: 12 }}>
                  {!assignments[selSection]?.departments?.length && (
                    <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "20px 0" }}>No department assignments</div>
                  )}
                  {assignments[selSection]?.departments?.map(d => (
                    <AssignmentRow key={d.department_id} name={d.department_name || d.name} role="Dept"
                      due={d.due_at}
                      onRemove={() => removeAssignment(`${selSection}::${d.department_id}`, "dept")} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: assignment form ── */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
              Bulk Assign
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>User</label>
              <input style={inp} placeholder="Search user…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6,
                            marginTop: 4, display: userSearch ? "block" : "none" }}>
                {filteredUsers.slice(0, 12).map(u => (
                  <div key={u.id}
                    style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, color: C.text,
                             background: assignUserId === u.id ? C.primaryLt : "transparent",
                             borderBottom: `1px solid ${C.border}` }}
                    onClick={() => { setAssignUserId(u.id); setUserSearch(u.full_name); }}>
                    <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                    <div style={{ color: C.textSub }}>{u.email}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Role</label>
              <select style={inp} value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                <option value="OWNER">Owner</option>
                <option value="CONTRIBUTOR">Contributor</option>
                <option value="REVIEWER">Reviewer</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Department (optional)</label>
              <select style={inp} value={assignDeptId} onChange={e => setAssignDeptId(e.target.value)}>
                <option value="">— None —</option>
                {departments.map(d => (
                  <option key={d.department_id || d.id} value={d.department_id || d.id}>{d.name || d.department_name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Due Date (optional)</label>
              <input type="datetime-local" style={inp} value={assignDue} onChange={e => setAssignDue(e.target.value)} />
            </div>

            <button style={{ ...primaryBtn, width: "100%" }} disabled={busy || (!assignUserId && !assignDeptId) || !selected.size}
              onClick={handleBulkAssign}>
              {busy ? "Assigning…" : `Assign to ${selected.size || 0} Section(s)`}
            </button>

            {!selected.size && (
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 8, textAlign: "center" }}>
                Select sections on the left first
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 };

function SectionRow({ sec, depth, selected, onToggle, active, onSelect }) {
  const meta = STATUS_META[sec.status] || STATUS_META.NOT_STARTED;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  borderRadius: 7, marginLeft: depth * 16, marginBottom: 3, cursor: "pointer",
                  background: active ? C.primaryLt : selected ? "#f5f7ff" : "transparent",
                  border: `1px solid ${active ? C.primary : selected ? C.primary + "44" : "transparent"}` }}
      onClick={onSelect}>
      <input type="checkbox" checked={selected} onChange={e => { e.stopPropagation(); onToggle(); }}
        style={{ cursor: "pointer", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: depth === 0 ? 700 : 400, color: C.text,
                     whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {sec.title}
      </span>
      <span style={{ padding: "1px 7px", borderRadius: 8, fontSize: 9, fontWeight: 700,
                     color: meta.color, background: meta.bg, flexShrink: 0 }}>{meta.label}</span>
    </div>
  );
}

function AssignmentRow({ name, email, role, due, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
                  borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{name}</div>
        {email && <div style={{ fontSize: 10, color: C.textSub }}>{email}</div>}
        {due && <div style={{ fontSize: 10, color: C.warning }}>Due: {new Date(due).toLocaleDateString()}</div>}
      </div>
      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                     background: C.primaryLt, color: C.primary }}>{role}</span>
      <button onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", color: C.danger, fontSize: 14, padding: "0 4px" }}>
        ×
      </button>
    </div>
  );
}

function Tabs({ active, onChange, tabs }) {
  return (
    <div style={{ display: "flex", borderBottom: `2px solid ${C.border}` }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                   borderBottom: active === t.id ? `2px solid ${C.primary}` : "2px solid transparent",
                   background: "none", color: active === t.id ? C.primary : C.textSub, marginBottom: -2 }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
