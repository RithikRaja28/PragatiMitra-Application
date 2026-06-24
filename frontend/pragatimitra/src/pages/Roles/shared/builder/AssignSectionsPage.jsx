import { useState, useEffect, useCallback } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import Toast from "../../../../components/shared/Toast";
import BuilderHeader from "./BuilderHeader";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

const C = {
  primary: "#2563eb", primaryDark: "#1d4ed8", primaryLt: "#dbeafe",
  success: "#16a34a", successLt: "#dcfce7",
  danger: "#dc2626", dangerLt: "#fef2f2",
  warning: "#d97706", warningLt: "#fef3c7",
  text: "#111827", textSub: "#6b7280", border: "#e5e7eb",
  bg: "#f8fafc", surface: "#fff",
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
  border: `1.5px solid ${C.border}`, borderRadius: 8, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const primaryBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "0 18px", height: 38,
  background: C.primary, color: "#fff",
  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
};

/* Build recursive tree from flat sections array */
function buildTree(flat, parentId = null) {
  return flat
    .filter(s => (s.parent_id || null) === parentId)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map(s => ({ ...s, children: buildTree(flat, s.id) }));
}

/* Flatten tree to a plain ordered array (preserves depth info) */
function flattenTree(nodes, depth = 0) {
  const result = [];
  for (const n of nodes) {
    result.push({ ...n, _depth: depth });
    result.push(...flattenTree(n.children || [], depth + 1));
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function AssignSectionsPage({ reportId, onBack }) {
  const { apiFetch }       = useApi();
  const { user: authUser } = useAuth();
  const [flatSections, setFlatSections] = useState([]);
  const [tree,         setTree]         = useState([]);
  const [users,        setUsers]        = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [roles,        setRoles]        = useState([]);
  const [selected,     setSelected]     = useState(new Set());
  const [assignments,  setAssignments]  = useState({});
  const [loading,      setLoading]      = useState(true);
  const [toast,        setToast]        = useState(null);
  const [busy,         setBusy]         = useState(false);

  /* assignment form state */
  const [assignType,   setAssignType]   = useState("user");  // "user"|"role"|"dept"
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole,   setAssignRole]   = useState("CONTRIBUTOR");
  const [assignDeptId, setAssignDeptId] = useState("");
  const [assignRoleName, setAssignRoleName] = useState("");
  const [assignDue,    setAssignDue]    = useState("");
  const [userSearch,   setUserSearch]   = useState("");
  const [activeTab,    setActiveTab]    = useState("user");
  const [selSection,   setSelSection]   = useState(null);

  /* ── load ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const instId = authUser?.institutionId || authUser?.institution_id || "";
      const deptUrl = instId ? `/api/departments?institution_id=${instId}` : "/api/departments";

      const [repRes, userRes, deptRes, roleRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/reports/${reportId}`),
        apiJson(apiFetch, "/api/users"),
        apiJson(apiFetch, deptUrl),
        apiJson(apiFetch, "/api/roles").catch(() => ({ data: [] })),
      ]);

      const raw = repRes.data?.sections || [];
      setFlatSections(raw);
      setTree(buildTree(raw));
      setUsers(userRes.users || userRes.data || []);
      setDepartments(deptRes.data || []);
      setRoles(roleRes.data || []);
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
  }, [apiFetch]);

  useEffect(() => { if (selSection) loadAssignments(selSection); }, [selSection, loadAssignments]);

  /* ── selection helpers ── */
  const getAllIds = useCallback(() => flattenTree(tree).map(s => s.id), [tree]);

  const toggle = (id) => setSelected(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => {
    const all = getAllIds();
    setSelected(selected.size === all.length ? new Set() : new Set(all));
  };

  /* Select all children of a section recursively */
  const toggleSubtree = (node) => {
    const ids = flattenTree([node]).map(s => s.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };

  /* ── bulk assign ── */
  const handleBulkAssign = async () => {
    if (!selected.size) return setToast({ type: "error", message: "Select at least one section" });
    if (assignType === "user"  && !assignUserId)   return setToast({ type: "error", message: "Select a user" });
    if (assignType === "role"  && !assignRoleName) return setToast({ type: "error", message: "Select a role" });
    if (assignType === "dept"  && !assignDeptId)   return setToast({ type: "error", message: "Select a department" });
    setBusy(true);
    try {
      await apiJson(apiFetch, `/api/builder/assignments/report/${reportId}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_ids:   [...selected],
          user_id:       assignType === "user" ? assignUserId   : undefined,
          department_id: assignType === "dept" ? assignDeptId   : undefined,
          role_name:     assignType === "role" ? assignRoleName : undefined,
          role:          assignRole,
          due_at:        assignDue || undefined,
        }),
      });
      setToast({ type: "success", message: `Assigned to ${selected.size} section(s)` });
      setSelected(new Set());
      setAssignUserId(""); setAssignDeptId(""); setAssignRoleName(""); setAssignDue(""); setUserSearch("");
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
      } else if (type === "workflow") {
        await apiJson(apiFetch, `/api/builder/assignments/workflow/${assignId}`, { method: "DELETE" });
      } else {
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

  const allIds = getAllIds();

  /* ── find section title for selected section panel ── */
  const selSectionTitle = selSection
    ? flattenTree(tree).find(s => s.id === selSection)?.title
    : null;

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, color: C.textSub }}>Loading assignment data…</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* header */}
      <BuilderHeader
        onBack={onBack}
        breadcrumb={["Report Builder", "Assign Sections"]}
        title="Assign Sections"
        right={selected.size > 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 20,
            background: C.primaryLt, color: C.primary,
            fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
            {selected.size} section{selected.size !== 1 ? "s" : ""} selected
          </div>
        )}
      />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "flex", gap: 24 }}>

        {/* ── LEFT: section tree ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", gap: 12 }}>
              <input type="checkbox"
                checked={allIds.length > 0 && selected.size === allIds.length}
                onChange={toggleAll} style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Section Tree</span>
              <span style={{ fontSize: 11, color: C.textSub, marginLeft: "auto" }}>
                {allIds.length} section{allIds.length !== 1 ? "s" : ""} total
              </span>
            </div>

            <div style={{ padding: 10 }}>
              {tree.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: C.textSub }}>
                  No sections found in this report.
                </div>
              )}
              {tree.map(sec => (
                <SectionTreeNode
                  key={sec.id}
                  node={sec}
                  depth={0}
                  selected={selected}
                  onToggle={toggle}
                  onToggleSubtree={toggleSubtree}
                  selSection={selSection}
                  onSelect={id => setSelSection(id === selSection ? null : id)}
                />
              ))}
            </div>
          </div>

          {/* ── assignments for selected section ── */}
          {selSection && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                          marginTop: 16, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                Assignments — {selSectionTitle}
              </div>

              {!assignments[selSection] ? (
                <div style={{ fontSize: 12, color: C.textSub, textAlign: "center", padding: "12px 0" }}>
                  Loading…
                </div>
              ) : (
                <>
                  <Tabs active={activeTab} onChange={setActiveTab}
                    tabs={[
                      { id: "user", label: `Users (${assignments[selSection]?.users?.length || 0})` },
                      { id: "role", label: `Roles (${assignments[selSection]?.roles?.length || 0})` },
                      { id: "dept", label: `Depts (${assignments[selSection]?.departments?.length || 0})` },
                    ]} />

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

                  {activeTab === "role" && (
                    <div style={{ marginTop: 12 }}>
                      {!assignments[selSection]?.roles?.length && (
                        <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "20px 0" }}>No role assignments</div>
                      )}
                      {assignments[selSection]?.roles?.map(r => (
                        <AssignmentRow key={r.id} name={r.role_name} role="ROLE"
                          due={r.due_at}
                          onRemove={() => removeAssignment(r.id, "workflow")} />
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
                </>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: assignment form ── */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
              Bulk Assign
            </div>

            {/* Assign type switcher */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Assign By</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[["user","User"],["role","Role"],["dept","Dept"]].map(([t, label]) => (
                  <button key={t} type="button"
                    onClick={() => { setAssignType(t); setAssignUserId(""); setAssignRoleName(""); setAssignDeptId(""); setUserSearch(""); }}
                    style={{ flex: 1, padding: "6px 4px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700,
                             background: assignType === t ? C.primary : "#f1f5f9", color: assignType === t ? "#fff" : C.textSub }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* USER fields */}
            {assignType === "user" && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>User</label>
                  <input style={inp} placeholder="Search user…" value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); if (!e.target.value) setAssignUserId(""); }} />
                  {userSearch && (
                    <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, marginTop: 4 }}>
                      {filteredUsers.slice(0, 12).map(u => (
                        <div key={u.id}
                          style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, color: C.text,
                                   background: assignUserId === u.id ? C.primaryLt : "transparent",
                                   borderBottom: `1px solid ${C.border}` }}
                          onClick={() => { setAssignUserId(u.id); setUserSearch(u.full_name); }}>
                          <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                          <div style={{ color: C.textSub, fontSize: 11 }}>{u.email}</div>
                        </div>
                      ))}
                      {filteredUsers.length === 0 && (
                        <div style={{ padding: "10px", fontSize: 12, color: C.textSub, textAlign: "center" }}>No users found</div>
                      )}
                    </div>
                  )}
                  {assignUserId && (
                    <div style={{ marginTop: 4, fontSize: 11, color: C.primary }}>
                      ✓ {users.find(u => u.id === assignUserId)?.full_name || "User selected"}
                      <button onClick={() => { setAssignUserId(""); setUserSearch(""); }}
                        style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: C.danger, fontSize: 11 }}>✕</button>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Section Role</label>
                  <select style={inp} value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                    <option value="OWNER">Owner</option>
                    <option value="CONTRIBUTOR">Contributor</option>
                    <option value="REVIEWER">Reviewer</option>
                  </select>
                </div>
              </>
            )}

            {/* ROLE fields */}
            {assignType === "role" && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>System Role</label>
                <select style={inp} value={assignRoleName} onChange={e => setAssignRoleName(e.target.value)}>
                  <option value="">— Select a role —</option>
                  {roles.map(r => (
                    <option key={r.id || r.name} value={r.name}>{r.display_name || r.name}</option>
                  ))}
                </select>
                {assignRoleName && (
                  <div style={{ marginTop: 4, fontSize: 11, color: C.textSub }}>
                    All members with role <strong>{assignRoleName}</strong> will access selected sections.
                  </div>
                )}
              </div>
            )}

            {/* DEPT fields */}
            {assignType === "dept" && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Department</label>
                <select style={inp} value={assignDeptId} onChange={e => setAssignDeptId(e.target.value)}>
                  <option value="">— Select department —</option>
                  {departments.map(d => (
                    <option key={d.department_id || d.id} value={d.department_id || d.id}>
                      {d.name || d.department_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Due Date (optional)</label>
              <input type="datetime-local" style={inp} value={assignDue} onChange={e => setAssignDue(e.target.value)} />
            </div>

            <button
              style={{
                ...primaryBtn, width: "100%", height: 40,
                opacity: (busy || !selected.size) ? 0.6 : 1,
                cursor: (busy || !selected.size) ? "not-allowed" : "pointer",
                boxShadow: selected.size ? "0 2px 8px rgba(37,99,235,0.22)" : "none",
              }}
              disabled={busy || !selected.size}
              onClick={handleBulkAssign}>
              {busy ? (
                <>
                  <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                  Assigning…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Assign to {selected.size || 0} Section{selected.size !== 1 ? "s" : ""}
                </>
              )}
            </button>

            {!selected.size && (
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 8, textAlign: "center" }}>
                Select sections on the left first
              </div>
            )}

            {selected.size > 0 && (
              <div style={{ marginTop: 12, padding: "8px 10px", background: C.bg, borderRadius: 6, fontSize: 11, color: C.textSub }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Selected:</div>
                {flattenTree(tree)
                  .filter(s => selected.has(s.id))
                  .slice(0, 5)
                  .map(s => (
                    <div key={s.id} style={{ paddingLeft: s._depth * 10, marginBottom: 2 }}>
                      {s._depth > 0 ? "↳ " : "• "}{s.title}
                    </div>
                  ))}
                {selected.size > 5 && <div style={{ color: C.primary }}>+{selected.size - 5} more…</div>}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Recursive tree node ──────────────────────────────────────────────────── */
function SectionTreeNode({ node, depth, selected, onToggle, onToggleSubtree, selSection, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children?.length > 0;
  const isActive    = selSection === node.id;
  const isSelected  = selected.has(node.id);

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 10px", borderRadius: 7, marginBottom: 2,
          marginLeft: depth * 20,
          cursor: "pointer",
          background: isActive ? C.primaryLt : isSelected ? "#f5f7ff" : "transparent",
          border: `1px solid ${isActive ? C.primary : isSelected ? C.primary + "44" : "transparent"}`,
          transition: "background 0.1s",
        }}
        onClick={() => onSelect(node.id)}
      >
        {/* expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textSub,
                     fontSize: 10, padding: "0 2px", flexShrink: 0, width: 16, textAlign: "center" }}>
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* checkbox */}
        <input type="checkbox" checked={isSelected}
          onChange={e => { e.stopPropagation(); onToggle(node.id); }}
          style={{ cursor: "pointer", flexShrink: 0 }} />

        {/* depth indicator */}
        {depth > 0 && (
          <span style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {"└".repeat(1)}
          </span>
        )}

        {/* title */}
        <span style={{
          flex: 1, fontSize: depth === 0 ? 13 : 12,
          fontWeight: depth === 0 ? 700 : 500,
          color: isActive ? C.primary : C.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {node.title}
        </span>

        {/* subsection badge */}
        {depth > 0 && (
          <span style={{ fontSize: 9, color: "#7c3aed", background: "#ede9fe",
                         padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
            sub
          </span>
        )}

        {/* status badge */}
        <span style={{
          padding: "1px 7px", borderRadius: 8, fontSize: 9, fontWeight: 700, flexShrink: 0,
          color: (STATUS_META[node.status] || STATUS_META.NOT_STARTED).color,
          background: (STATUS_META[node.status] || STATUS_META.NOT_STARTED).bg,
        }}>
          {(STATUS_META[node.status] || STATUS_META.NOT_STARTED).label}
        </span>

        {/* select all children button */}
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); onToggleSubtree(node); }}
            title="Select this section and all its subsections"
            style={{
              background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
              cursor: "pointer", fontSize: 9, color: C.textSub,
              padding: "1px 5px", flexShrink: 0, fontFamily: "inherit",
            }}>
            all
          </button>
        )}
      </div>

      {/* children */}
      {hasChildren && expanded && node.children.map(child => (
        <SectionTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selected={selected}
          onToggle={onToggle}
          onToggleSubtree={onToggleSubtree}
          selSection={selSection}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const lbl = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151",
  marginBottom: 5,
};

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
        style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", padding: "3px 4px", borderRadius: 5, lineHeight: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = C.danger}
        onMouseLeave={e => e.currentTarget.style.color = "#cbd5e1"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>
  );
}

function Tabs({ active, onChange, tabs }) {
  return (
    <div style={{ display: "flex", borderBottom: `2px solid ${C.border}` }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
            borderBottom: active === t.id ? `2px solid ${C.primary}` : "2px solid transparent",
            background: "none", color: active === t.id ? C.primary : C.textSub, marginBottom: -2,
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
