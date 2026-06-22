import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../../store/AuthContext";
import { useApi }  from "../../../../hooks/useApi";
import FormScreen        from "../../../../components/shared/FormScreen";
import { S }             from "../../../../components/shared/formUtils";
import { useToast }      from "../../../../components/shared/Toast";
import ReportPreviewPage from "./ReportPreviewPage";

/* ── status palette ─────────────────────────────────────────────────────── */
const STATUS_CFG = {
  DRAFT:             { bg: "#f1f5f9", color: "#64748b",  label: "Draft" },
  SUBMITTED:         { bg: "#dbeafe", color: "#1d4ed8",  label: "Submitted" },
  UNDER_REVIEW:      { bg: "#fef3c7", color: "#d97706",  label: "Under Review" },
  APPROVED:          { bg: "#dcfce7", color: "#15803d",  label: "Approved" },
  REJECTED:          { bg: "#fee2e2", color: "#b91c1c",  label: "Rejected" },
  REVISION_REQUIRED: { bg: "#fff7ed", color: "#c2410c",  label: "Revision Required" },
};

function StatusBadge({ status, tiny }) {
  const s = STATUS_CFG[status] || STATUS_CFG.DRAFT;
  return (
    <span style={{
      padding: tiny ? "1px 7px" : "3px 10px",
      borderRadius: 20, fontSize: tiny ? 9 : 10, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.5,
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

const ROLE_BADGE = {
  OWNER:       { bg: "#ede9fe", color: "#6d28d9" },
  CONTRIBUTOR: { bg: "#dbeafe", color: "#1d4ed8" },
  REVIEWER:    { bg: "#dcfce7", color: "#15803d" },
};

const arrowBtn = {
  background: "none", border: "none", cursor: "pointer",
  color: "#94a3b8", fontSize: 11, padding: "1px 3px", borderRadius: 4, lineHeight: 1,
};

/* ── Section tree item ──────────────────────────────────────────────────── */
function SectionItem({ section, depth, selected, onClick, onMoveUp, onMoveDown, isFirst, isLast }) {
  const s = STATUS_CFG[section.status] || STATUS_CFG.DRAFT;
  const isSel = selected?.id === section.id;
  return (
    <div
      onClick={() => onClick(section)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: `7px 10px 7px ${10 + depth * 14}px`,
        borderRadius: 7, marginBottom: 2, cursor: "pointer",
        background: isSel ? "#ede9fe" : "transparent",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f8fafc"; }}
      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: s.color }} />
      <span style={{
        flex: 1, fontSize: 13, fontWeight: isSel ? 600 : 400,
        color: isSel ? "#7c3aed" : "#1e293b",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {section.title}
      </span>
      <div style={{ display: "flex", gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {!isFirst && <button onClick={() => onMoveUp(section)}  style={arrowBtn}>↑</button>}
        {!isLast  && <button onClick={() => onMoveDown(section)} style={arrowBtn}>↓</button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSIGN FORM PAGE  (full-page overlay)
═══════════════════════════════════════════════════════════════════════════ */
const ROLE_DESC = {
  OWNER:       "Full responsibility — manages the section end-to-end",
  CONTRIBUTOR: "Can add and edit content blocks",
  REVIEWER:    "Can review content and leave feedback",
};

function AssignFormPage({ sectionId, sectionTitle, reportTitle, apiFetch, onBack, onAssigned }) {
  const [assignType,   setAssignType]   = useState("USER");   // "USER"|"ROLE"|"DEPT"
  const [allUsers,     setAllUsers]     = useState([]);
  const [allDepts,     setAllDepts]     = useState([]);
  const [allRoles,     setAllRoles]     = useState([]);
  const [userAssigns,  setUserAssigns]  = useState([]);
  const [roleAssigns,  setRoleAssigns]  = useState([]);
  const [deptAssigns,  setDeptAssigns]  = useState([]);
  /* user fields */
  const [search,       setSearch]       = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [role,         setRole]         = useState("CONTRIBUTOR");
  const [showDropdown, setShowDropdown] = useState(false);
  /* role/dept fields */
  const [selRoleName,  setSelRoleName]  = useState("");
  const [selDeptId,    setSelDeptId]    = useState("");
  /* shared */
  const [saving,       setSaving]       = useState(false);
  const [loadingData,  setLoadingData]  = useState(true);
  const [submitErr,    setSubmitErr]    = useState("");
  const searchRef   = useRef(null);
  const dropdownRef = useRef(null);

  const reload = () => {
    setLoadingData(true);
    Promise.all([
      apiFetch(`/api/builder/assignments/section/${sectionId}`).then((r) => r.json()),
      apiFetch("/api/users").then((r) => r.json()),
      apiFetch("/api/departments").then((r) => r.json()),
      apiFetch("/api/roles").then((r) => r.json()),
    ]).then(([asgn, users, depts, roles]) => {
      if (asgn.success) {
        setUserAssigns(asgn.data?.users || []);
        setRoleAssigns(asgn.data?.roles || []);
        setDeptAssigns(asgn.data?.departments || []);
      }
      if (users.success)  setAllUsers(users.users || []);
      if (depts.success)  setAllDepts(depts.data  || []);
      if (roles.success)  setAllRoles(roles.data  || []);
    }).catch(() => {}).finally(() => setLoadingData(false));
  };

  useEffect(() => { reload(); }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          searchRef.current   && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const assignedUserIds = new Set(userAssigns.map((a) => a.user_id));
  const filteredUsers   = allUsers.filter((u) => {
    if (assignedUserIds.has(u.id)) return false;
    const q = search.toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setSubmitErr("");
    try {
      if (assignType === "USER") {
        if (!selectedUser) throw new Error("Please select a user");
        const res  = await apiFetch(`/api/builder/assignments/section/${sectionId}`, {
          method: "POST",
          body:   JSON.stringify({ assignee_type: "USER", user_id: selectedUser.id, role }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setSelectedUser(null); setSearch("");
        onAssigned && onAssigned(selectedUser.full_name, role);
      } else if (assignType === "ROLE") {
        if (!selRoleName) throw new Error("Please select a role");
        const res  = await apiFetch(`/api/builder/assignments/section/${sectionId}`, {
          method: "POST",
          body:   JSON.stringify({ assignee_type: "ROLE", role_name: selRoleName }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setSelRoleName("");
      } else if (assignType === "DEPT") {
        if (!selDeptId) throw new Error("Please select a department");
        const res  = await apiFetch(`/api/builder/assignments/section/${sectionId}`, {
          method: "POST",
          body:   JSON.stringify({ assignee_type: "DEPARTMENT", department_id: selDeptId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setSelDeptId("");
      }
      reload();
    } catch (ex) { setSubmitErr(ex.message || "Failed to assign"); }
    finally { setSaving(false); }
  }

  async function removeUser(assignId) {
    try {
      const res = await apiFetch(`/api/builder/assignments/${assignId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
      setUserAssigns((prev) => prev.filter((a) => a.id !== assignId));
    } catch (ex) { setSubmitErr(ex.message || "Failed to remove"); }
  }

  async function removeWorkflow(swaId) {
    try {
      const res = await apiFetch(`/api/builder/assignments/workflow/${swaId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
      reload();
    } catch (ex) { setSubmitErr(ex.message || "Failed to remove"); }
  }

  const totalCount = userAssigns.length + roleAssigns.length + deptAssigns.length;

  const typeBtn = (t, label) => (
    <button type="button" onClick={() => { setAssignType(t); setSubmitErr(""); }}
      style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
               background: assignType === t ? "#7c3aed" : "#f1f5f9", color: assignType === t ? "#fff" : "#64748b" }}>
      {label}
    </button>
  );

  const submitLabel = saving ? "Assigning…"
    : assignType === "USER" && selectedUser ? `Assign ${selectedUser.full_name}`
    : assignType === "ROLE" && selRoleName ? `Assign ${selRoleName} role`
    : assignType === "DEPT" && selDeptId ? `Assign department`
    : "Assign";

  return (
    <FormScreen
      pageTitle={reportTitle || "Report"}
      formTitle="Assign Section"
      formSubtitle={sectionTitle ? `Section: ${sectionTitle}` : "Assign by user, role, or department"}
      icon="👥" iconBg="#ede9fe"
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={saving}
      submitLabel={submitLabel}
      submitError={submitErr}
    >
      {/* Type switcher */}
      <div>
        <label style={S.label}>Assign Type</label>
        <div style={{ display: "flex", gap: 6 }}>
          {typeBtn("USER", "👤 User")}
          {typeBtn("ROLE", "🏷 Role")}
          {typeBtn("DEPT", "🏢 Department")}
        </div>
      </div>

      {/* USER form */}
      {assignType === "USER" && (
        <>
          <div>
            <label style={S.label}>Team Member *</label>
            {selectedUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "2px solid #7c3aed", background: "#faf5ff" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#7c3aed", flexShrink: 0 }}>
                  {selectedUser.full_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{selectedUser.full_name}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{selectedUser.email}</div>
                </div>
                <button type="button" onClick={() => { setSelectedUser(null); setSearch(""); setTimeout(() => searchRef.current?.focus(), 60); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18 }}>✕</button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input ref={searchRef} value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by name or email…"
                  style={S.input(false)} autoComplete="off" />
                {showDropdown && (
                  <div ref={dropdownRef} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.10)", zIndex: 50, maxHeight: 210, overflowY: "auto" }}>
                    {loadingData && <div style={{ padding: "13px 16px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>Loading…</div>}
                    {!loadingData && filteredUsers.length === 0 && <div style={{ padding: "13px 16px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>No matching users</div>}
                    {filteredUsers.slice(0, 25).map((u) => (
                      <div key={u.id}
                        onMouseDown={(e) => { e.preventDefault(); setSelectedUser(u); setSearch(""); setShowDropdown(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f8fafc" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#7c3aed", flexShrink: 0 }}>
                          {u.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{u.full_name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label style={S.label}>Section Role</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["OWNER", "CONTRIBUTOR", "REVIEWER"].map((r) => {
                const rb = ROLE_BADGE[r]; const active = role === r;
                return (
                  <div key={r} onClick={() => setRole(r)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: `1.5px solid ${active ? "#7c3aed" : "#e2e8f0"}`, borderRadius: 10, cursor: "pointer", background: active ? "#faf5ff" : "#fff" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: `2px solid ${active ? "#7c3aed" : "#cbd5e1"}`, background: active ? "#7c3aed" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: rb.color, background: rb.bg, padding: "2px 9px", borderRadius: 20 }}>{r}</span>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{ROLE_DESC[r]}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ROLE form */}
      {assignType === "ROLE" && (
        <div>
          <label style={S.label}>System Role *</label>
          <select value={selRoleName} onChange={(e) => setSelRoleName(e.target.value)} style={S.input(false)}>
            <option value="">— Select a role —</option>
            {allRoles.map((r) => (
              <option key={r.id || r.name} value={r.name}>{r.display_name || r.name}</option>
            ))}
          </select>
          {selRoleName && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: 8 }}>
              All members with role <strong>{selRoleName}</strong> will be able to access this section.
            </div>
          )}
        </div>
      )}

      {/* DEPT form */}
      {assignType === "DEPT" && (
        <div>
          <label style={S.label}>Department *</label>
          <select value={selDeptId} onChange={(e) => setSelDeptId(e.target.value)} style={S.input(false)}>
            <option value="">— Select a department —</option>
            {allDepts.map((d) => (
              <option key={d.department_id || d.id} value={d.department_id || d.id}>{d.name || d.department_name}</option>
            ))}
          </select>
          {selDeptId && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: 8 }}>
              All members of this department will be able to access this section.
            </div>
          )}
        </div>
      )}

      {/* Current assignments */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ ...S.label, marginBottom: 0 }}>Current Assignments</label>
          <span style={{ padding: "1px 8px", background: "#f1f5f9", borderRadius: 20, fontSize: 11, color: "#64748b", fontWeight: 600 }}>{totalCount}</span>
        </div>
        {totalCount === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", background: "#f8fafc", borderRadius: 10, border: "1px dashed #e2e8f0" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>👥</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>No assignments yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {userAssigns.map((a) => {
              const rb = ROLE_BADGE[a.role] || ROLE_BADGE.CONTRIBUTOR;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #f1f5f9", background: "#fafafa" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#7c3aed", flexShrink: 0 }}>
                    {a.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.full_name || "Unknown"}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.email}</div>
                  </div>
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: rb.bg, color: rb.color, flexShrink: 0 }}>{a.role}</span>
                  <button type="button" onClick={() => removeUser(a.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, flexShrink: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>✕</button>
                </div>
              );
            })}
            {roleAssigns.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #f1f5f9", background: "#fafafa" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🏷</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.role_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Role assignment</div>
                </div>
                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", flexShrink: 0 }}>ROLE</span>
                <button type="button" onClick={() => removeWorkflow(a.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>✕</button>
              </div>
            ))}
            {deptAssigns.map((a) => (
              <div key={a.department_id || a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #f1f5f9", background: "#fafafa" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🏢</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.department_name || a.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Department assignment</div>
                </div>
                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#d1fae5", color: "#15803d", flexShrink: 0 }}>DEPT</span>
                <button type="button" onClick={() => {
                  apiFetch(`/api/builder/assignments/section/${sectionId}/departments/${a.department_id}`, { method: "DELETE" })
                    .then(r => r.ok && reload())
                    .catch(() => {});
                }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormScreen>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERSION HISTORY PAGE
═══════════════════════════════════════════════════════════════════════════ */
const EVT_STYLE = {
  SUBMITTED: { bg: "#dbeafe", color: "#1d4ed8" }, APPROVED: { bg: "#dcfce7", color: "#15803d" },
  REJECTED: { bg: "#fee2e2", color: "#b91c1c" }, RESTORED: { bg: "#fef3c7", color: "#d97706" },
  REVISION_REQUIRED: { bg: "#fff7ed", color: "#c2410c" }, MANUAL: { bg: "#f1f5f9", color: "#64748b" },
};

/* ── Simple block renderer for snapshot preview ── */
function SnapshotPreview({ blocks }) {
  if (!blocks || !blocks.length) {
    return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No content blocks in this snapshot.</div>;
  }
  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: 13, lineHeight: 1.7, color: "#1e293b" }}>
      {blocks.map((b, i) => {
        const c = b.content || {};
        switch (b.block_type) {
          case "PARAGRAPH":
            return <div key={i} style={{ marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: c.html || c.text || "" }} />;
          case "HEADING": {
            const lvl = c.level || 2;
            const fs = lvl === 1 ? 18 : lvl === 2 ? 15 : 13;
            return <div key={i} style={{ fontWeight: 700, fontSize: fs, marginTop: 10, marginBottom: 4, color: "#1F3864", borderBottom: lvl === 1 ? "1.5px solid #1F3864" : "none", paddingBottom: lvl === 1 ? 3 : 0 }}>{c.text || ""}</div>;
          }
          case "LIST": {
            const Tag = c.ordered ? "ol" : "ul";
            return <Tag key={i} style={{ paddingLeft: 20, marginBottom: 8 }}>{(c.items || []).map((item, j) => <li key={j}>{item}</li>)}</Tag>;
          }
          case "DIVIDER":
            return <hr key={i} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />;
          case "KPI":
            return <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 12 }}>
              <strong>{c.kpi_title || c.label || "KPI"}:</strong> {String(c.value ?? c.kpi_value ?? "—")} {c.unit || ""}
            </div>;
          case "TABLE": {
            const hdrs = c.headers || [];
            if (!hdrs.length) return null;
            return <table key={i} style={{ borderCollapse: "collapse", width: "100%", fontSize: 11, marginBottom: 8 }}>
              <thead><tr>{hdrs.map((h, j) => <th key={j} style={{ background: "#e2e8f0", padding: "4px 8px", border: "1px solid #cbd5e1", textAlign: "left" }}>{h}</th>)}</tr></thead>
              <tbody>{(c.rows || []).map((row, ri) => <tr key={ri}>{(Array.isArray(row) ? row : hdrs.map(() => "")).map((v, ci) => <td key={ci} style={{ border: "1px solid #e2e8f0", padding: "3px 8px" }}>{String(v ?? "")}</td>)}</tr>)}</tbody>
            </table>;
          }
          case "IMAGE":
            return <div key={i} style={{ margin: "8px 0", fontSize: 12, color: "#64748b" }}>
              📷 {c.caption || c.url || "Image"}
            </div>;
          default:
            return null;
        }
      })}
    </div>
  );
}

function VersionHistoryPage({ sectionId, sectionTitle, reportTitle, apiFetch, isAdmin, onBack, onRestored }) {
  const [versions,   setVersions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [restoring,  setRestoring]  = useState(null);
  const [restoreErr, setRestoreErr] = useState("");
  const [viewSnap,   setViewSnap]   = useState(null);   // { vNum, section, blocks }
  const [viewLoading,setViewLoading]= useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/builder/versions/section/${sectionId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setVersions(d.data || []); })
      .finally(() => setLoading(false));
  }, [sectionId]);

  async function viewVersion(vNum) {
    setViewLoading(true);
    try {
      const res  = await apiFetch(`/api/builder/versions/section/${sectionId}/${vNum}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      const snap = json.data?.snapshot || {};
      setViewSnap({ vNum, section: snap.section || {}, blocks: snap.blocks || [] });
    } catch (ex) { setRestoreErr(ex.message || "Failed to load snapshot"); }
    finally { setViewLoading(false); }
  }

  async function restore(vNum) {
    if (!window.confirm(`Restore to version ${vNum}? Current content will be archived first.`)) return;
    setRestoring(vNum); setRestoreErr("");
    try {
      const res  = await apiFetch(`/api/builder/versions/section/${sectionId}/${vNum}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      onRestored(); onBack();
    } catch (ex) { setRestoreErr(ex.message || "Restore failed"); setRestoring(null); }
  }

  /* ── Snapshot preview modal ── */
  if (viewSnap) {
    return (
      <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
        <button type="button" onClick={() => setViewSnap(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#2563eb", cursor: "pointer", padding: 0, marginBottom: 20 }}>
          ← Back to History
        </button>
        <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📄</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Version {viewSnap.vNum} Preview</div>
              {viewSnap.section?.title && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Section: {viewSnap.section.title}</div>}
            </div>
            {isAdmin && (
              <button onClick={() => { setViewSnap(null); restore(viewSnap.vNum); }} disabled={!!restoring}
                style={{ marginLeft: "auto", padding: "7px 16px", border: "1.5px solid #7c3aed", borderRadius: 8, background: "#faf5ff", fontSize: 12, fontWeight: 600, color: "#7c3aed", cursor: restoring ? "not-allowed" : "pointer" }}>
                Restore this version
              </button>
            )}
          </div>
          <div style={{ padding: "24px 28px" }}>
            <SnapshotPreview blocks={viewSnap.blocks} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      <button type="button" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#2563eb", cursor: "pointer", padding: 0, marginBottom: 24 }}>
        ← Back to {reportTitle || "Report"}
      </button>
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🕐</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Version History</div>
            {sectionTitle && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>Section: {sectionTitle}</div>}
          </div>
        </div>
        <div style={{ padding: "20px 28px 28px" }}>
          {restoreErr && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16 }}>{restoreErr}</div>}
          {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>Loading history…</div>}
          {!loading && versions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>No versions yet</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Submit the section for review to create the first snapshot.</div>
            </div>
          )}
          {!loading && versions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {versions.map((v, idx) => {
                const es = EVT_STYLE[v.event] || EVT_STYLE.MANUAL;
                return (
                  <div key={v.id} style={{ display: "flex", gap: 16, paddingBottom: 20, paddingTop: idx === 0 ? 0 : 20, borderBottom: idx < versions.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: es.bg, border: `2px solid ${es.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: es.color }}>v{v.version_num}</div>
                      {idx < versions.length - 1 && <div style={{ width: 2, flex: 1, background: "#f1f5f9", marginTop: 6 }} />}
                    </div>
                    <div style={{ flex: 1, paddingTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, background: es.bg, color: es.color }}>{v.event?.replace("_", " ")}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(v.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", marginBottom: v.meta?.reason ? 4 : 0 }}>By <strong>{v.created_by_name || "System"}</strong></div>
                      {v.meta?.reason && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, padding: "6px 10px", background: "#f8fafc", borderRadius: 6, borderLeft: `3px solid ${es.color}` }}>{v.meta.reason}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button onClick={() => viewVersion(v.version_num)} disabled={viewLoading}
                          style={{ padding: "5px 13px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", fontSize: 12, fontWeight: 600, color: "#2563eb", cursor: viewLoading ? "not-allowed" : "pointer", opacity: viewLoading ? 0.7 : 1 }}>
                          {viewLoading ? "Loading…" : "View"}
                        </button>
                        {isAdmin && v.event !== "RESTORED" && (
                          <button onClick={() => restore(v.version_num)} disabled={!!restoring}
                            style={{ padding: "5px 13px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: restoring === v.version_num ? "#f8fafc" : "#fff", fontSize: 12, fontWeight: 600, color: "#7c3aed", cursor: restoring ? "not-allowed" : "pointer" }}>
                            {restoring === v.version_num ? "Restoring…" : "Restore"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION DETAIL PANEL  (right side of main layout)
═══════════════════════════════════════════════════════════════════════════ */
function SectionDetailPanel({ section, sections, apiFetch, isAdmin, onAssign, onVersions, onDelete, onAddSubsection, onSelectSection, assignmentsData, loadingAssignments, onRemoveAssignment, allWorkflows, onSectionUpdate }) {
  const [editingField, setEditingField] = useState(null);
  const [editVal,      setEditVal]      = useState("");
  const [saving,       setSaving]       = useState(false);
  const [wfDraft,      setWfDraft]      = useState(section.workflow_template_id || "");
  const [wfSaving,     setWfSaving]     = useState(false);

  useEffect(() => {
    setWfDraft(section.workflow_template_id || "");
  }, [section.id, section.workflow_template_id]);

  async function saveWorkflow() {
    setWfSaving(true);
    try {
      const res = await apiFetch(`/api/builder/sections/${section.id}`, {
        method: "PUT",
        body:   JSON.stringify({ workflow_template_id: wfDraft || null }),
      });
      if (res.ok) onSectionUpdate(section.id, { workflow_template_id: wfDraft || null });
    } catch {}
    setWfSaving(false);
  }

  async function saveField(field, value) {
    if (!value?.trim() || value.trim() === section[field]) { setEditingField(null); return; }
    setSaving(true);
    try {
      const res  = await apiFetch(`/api/builder/sections/${section.id}`, {
        method: "PUT",
        body:   JSON.stringify({ [field]: value.trim() }),
      });
      if (res.ok) section[field] = value.trim(); // optimistic local update
    } catch {}
    setSaving(false);
    setEditingField(null);
  }

  const subsections = sections.filter((s) => s.parent_id === section.id);

  const sc = STATUS_CFG[section.status] || STATUS_CFG.DRAFT;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc" }}>

      {/* ── Section header card ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "20px 28px" }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            {editingField === "title" ? (
              <input
                autoFocus value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={() => saveField("title", editVal)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("title", editVal); if (e.key === "Escape") setEditingField(null); }}
                style={{ width: "100%", fontSize: 18, fontWeight: 700, color: "#1e293b", border: "1.5px solid #7c3aed", borderRadius: 8, padding: "6px 10px", outline: "none", boxSizing: "border-box" }}
              />
            ) : (
              <div
                onClick={() => { if (isAdmin) { setEditingField("title"); setEditVal(section.title); } }}
                title={isAdmin ? "Click to edit title" : ""}
                style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", lineHeight: 1.3, cursor: isAdmin ? "text" : "default", display: "flex", alignItems: "center", gap: 6 }}
              >
                {section.title}
                {isAdmin && <span style={{ fontSize: 11, color: "#cbd5e1", flexShrink: 0 }}>✏</span>}
              </div>
            )}
          </div>
          <StatusBadge status={section.status} />
        </div>

        {/* Description */}
        {editingField === "description" ? (
          <textarea
            autoFocus value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={() => saveField("description", editVal)}
            rows={3}
            style={{ width: "100%", fontSize: 13, color: "#475569", border: "1.5px solid #7c3aed", borderRadius: 8, padding: "8px 10px", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        ) : (
          <div
            onClick={() => { if (isAdmin) { setEditingField("description"); setEditVal(section.description || ""); } }}
            title={isAdmin ? "Click to edit description" : ""}
            style={{ fontSize: 13, color: section.description ? "#475569" : "#cbd5e1", fontStyle: section.description ? "normal" : "italic", cursor: isAdmin ? "text" : "default", marginBottom: 12, lineHeight: 1.6 }}
          >
            {section.description || (isAdmin ? "Click to add a description…" : "No description")}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onVersions} style={{ padding: "6px 13px", border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", fontSize: 12, color: "#64748b", cursor: "pointer" }}>
            History
          </button>
          {isAdmin && (
            <button onClick={onAssign} style={{ padding: "6px 13px", border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", fontSize: 12, color: "#64748b", cursor: "pointer" }}>
              + Assign Member
            </button>
          )}
          {isAdmin && (
            <button onClick={() => onDelete(section)}
              style={{ padding: "6px 13px", border: "1px solid #fecaca", borderRadius: 7, background: "#fff", fontSize: 12, color: "#ef4444", cursor: "pointer", marginLeft: "auto" }}>
              Delete Section
            </button>
          )}
        </div>

        {saving && <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>Saving…</div>}
      </div>

      {/* ── Workflow panel ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "18px 28px", marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
          Workflow Template
        </div>
        {isAdmin ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={wfDraft}
              onChange={(e) => setWfDraft(e.target.value)}
              style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, color: "#1e293b", background: "#fff" }}
            >
              <option value="">— No workflow —</option>
              {(allWorkflows || []).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {wfDraft !== (section.workflow_template_id || "") && (
              <button
                onClick={saveWorkflow}
                disabled={wfSaving}
                style={{ padding: "8px 16px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: wfSaving ? "not-allowed" : "pointer", opacity: wfSaving ? 0.7 : 1 }}
              >
                {wfSaving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#475569" }}>
            {(allWorkflows || []).find(w => w.id === section.workflow_template_id)?.name || (
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>No workflow assigned</span>
            )}
          </div>
        )}
      </div>

      {/* ── Assignments panel ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "18px 28px", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Team Assignments
          </div>
          <span style={{ padding: "1px 8px", background: "#f1f5f9", borderRadius: 20, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
            {assignmentsData.length}
          </span>
        </div>

        {loadingAssignments ? (
          <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>Loading…</div>
        ) : assignmentsData.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            No members assigned to this section yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignmentsData.map((a) => {
              const rb = ROLE_BADGE[a.role] || ROLE_BADGE.CONTRIBUTOR;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #f1f5f9" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#7c3aed", flexShrink: 0 }}>
                    {a.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.full_name || "Unknown"}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</div>
                  </div>
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: rb.bg, color: rb.color, flexShrink: 0 }}>
                    {a.role}
                  </span>
                  {isAdmin && (
                    <button onClick={() => onRemoveAssignment(a.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: "2px 4px", flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                      title="Remove">✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Subsections panel ── */}
      <div style={{ background: "#fff", padding: "18px 28px", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Subsections
          </div>
          <span style={{ padding: "1px 8px", background: "#f1f5f9", borderRadius: 20, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
            {subsections.length}
          </span>
        </div>

        {subsections.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            No subsections yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {subsections.map((sub) => {
              const sc2 = STATUS_CFG[sub.status] || STATUS_CFG.DRAFT;
              return (
                <div key={sub.id} onClick={() => onSelectSection(sub)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.12s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#ede9fe22")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc2.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{sub.title}</span>
                  <StatusBadge status={sub.status} tiny />
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <button onClick={onAddSubsection}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px dashed #c4b5fd", borderRadius: 7, background: "#faf5ff", fontSize: 12, color: "#7c3aed", cursor: "pointer", fontWeight: 600 }}>
            + Add Subsection
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function CollaborativeEditorPage({ reportId, reportTitle, onBack }) {
  const { user }     = useAuth();
  const { apiFetch } = useApi();
  const showToast    = useToast();
  const roleNames    = new Set((user?.roles || []).map((r) => r.name || r));
  const isAdmin      = roleNames.has("super_admin") || roleNames.has("institute_admin");

  const [report,       setReport]       = useState(null);
  const [sections,     setSections]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [allWorkflows, setAllWorkflows] = useState([]);

  const [assignments,       setAssignments]       = useState([]);
  const [loadingAssignments,setLoadingAssignments] = useState(false);

  const [showNewSection,    setShowNewSection]    = useState(false);
  const [newSectionParentId,setNewSectionParentId]= useState(null);
  const [showAssign,        setShowAssign]        = useState(false);
  const [showVersions,      setShowVersions]      = useState(false);
  const [showPreview,       setShowPreview]       = useState(false);
  const [publishing,        setPublishing]        = useState(false);

  const [secForm,      setSecForm]      = useState({ title: "", description: "" });
  const [secErrors,    setSecErrors]    = useState({});
  const [creatingSec,  setCreatingSec]  = useState(false);
  const [createSecErr, setCreateSecErr] = useState("");

  /* ── load report + sections + workflows ── */
  useEffect(() => {
    apiFetch(`/api/builder/reports/${reportId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setReport(d.data);
          const flat = flattenTree(d.data.sections || []);
          setSections(flat);
        }
      });

    apiFetch("/api/builder/workflows")
      .then((r) => r.json())
      .then((d) => { if (d.success) setAllWorkflows(d.data || []); })
      .catch(() => {});
  }, [reportId]);

  function flattenTree(tree) {
    const out = [];
    function walk(nodes, depth) {
      for (const n of nodes) {
        out.push({ ...n, _depth: depth || 0 });
        if (n.children?.length) walk(n.children, (depth || 0) + 1);
      }
    }
    walk(tree);
    return out;
  }

  function selectSection(section) {
    setSelected(section);
    setLoadingAssignments(true);
    apiFetch(`/api/builder/assignments/section/${section.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setAssignments(d.data?.users || []); })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }

  function reloadAssignments() {
    if (!selected) return;
    setLoadingAssignments(true);
    apiFetch(`/api/builder/assignments/section/${selected.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setAssignments(d.data?.users || []); })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }

  function updateSection(sectionId, updates) {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, ...updates } : s));
    setSelected((s) => s?.id === sectionId ? { ...s, ...updates } : s);
  }

  async function removeAssignment(assignId) {
    try {
      const res = await apiFetch(`/api/builder/assignments/${assignId}`, { method: "DELETE" });
      if (!res.ok) return;
      setAssignments((prev) => prev.filter((a) => a.id !== assignId));
    } catch {}
  }

  async function moveSection(section, dir) {
    const siblings = sections.filter((s) => (s.parent_id || null) === (section.parent_id || null));
    const idx    = siblings.findIndex((s) => s.id === section.id);
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const swapped = [...siblings];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    const items = swapped.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    setSections((prev) => {
      const others = prev.filter((s) => (s.parent_id || null) !== (section.parent_id || null));
      return [...others, ...swapped.map((s, i) => ({ ...s, order_index: i + 1 }))].sort((a, b) => a.order_index - b.order_index);
    });
    apiFetch("/api/builder/sections/reorder", { method: "POST", body: JSON.stringify({ items }) });
  }

  async function handleDeleteSection(section) {
    if (!window.confirm(`Delete section "${section.title}"? This cannot be undone.`)) return;
    await apiFetch(`/api/builder/sections/${section.id}`, { method: "DELETE" });
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    if (selected?.id === section.id) setSelected(null);
  }

  async function handleCreateSection(e) {
    e.preventDefault();
    const errs = {};
    if (!secForm.title.trim()) errs.title = "Section title is required";
    if (Object.keys(errs).length) { setSecErrors(errs); return; }
    setCreatingSec(true); setCreateSecErr("");
    try {
      const res  = await apiFetch("/api/builder/sections", {
        method: "POST",
        body:   JSON.stringify({
          report_id:   reportId,
          parent_id:   newSectionParentId || null,
          title:       secForm.title.trim(),
          description: secForm.description.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setSections((prev) => [...prev, { ...json.data, _depth: newSectionParentId ? 1 : 0 }]);
      setShowNewSection(false);
      setNewSectionParentId(null);
      setSecForm({ title: "", description: "" });
      setSecErrors({});
      selectSection(json.data);
    } catch (ex) { setCreateSecErr(ex.message || "Failed to create section"); }
    finally { setCreatingSec(false); }
  }

  async function handlePublish() {
    if (!window.confirm("Publish this report? It will be marked as published for all assigned users.")) return;
    setPublishing(true);
    try {
      const res  = await apiFetch(`/api/builder/reports/${reportId}`, { method: "PUT", body: JSON.stringify({ status: "PUBLISHED" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setReport((r) => ({ ...r, status: "PUBLISHED" }));
      showToast("Report published successfully!", "success");
    } catch (ex) { showToast(ex.message || "Failed to publish", "error"); }
    finally { setPublishing(false); }
  }

  /* ── early-return overlays ── */
  if (showPreview) {
    return <ReportPreviewPage reportId={reportId} reportTitle={report?.title || reportTitle} onBack={() => setShowPreview(false)} />;
  }

  if (showNewSection) {
    const isSubsection = !!newSectionParentId;
    const parentTitle  = isSubsection ? sections.find((s) => s.id === newSectionParentId)?.title : null;
    return (
      <FormScreen
        pageTitle={report?.title || reportTitle}
        formTitle={isSubsection ? "New Subsection" : "New Section"}
        formSubtitle={isSubsection ? `Under: ${parentTitle}` : "Add a section to structure your report"}
        icon="📑" iconBg="#ede9fe"
        onBack={() => { setShowNewSection(false); setNewSectionParentId(null); setSecForm({ title: "", description: "" }); setSecErrors({}); setCreateSecErr(""); }}
        onSubmit={handleCreateSection}
        submitting={creatingSec}
        submitLabel="Create"
        submitError={createSecErr}
      >
        <div>
          <label style={S.label}>{isSubsection ? "Subsection" : "Section"} Title *</label>
          <input value={secForm.title}
            onChange={(e) => { setSecForm((f) => ({ ...f, title: e.target.value })); setSecErrors((er) => ({ ...er, title: "" })); }}
            placeholder="e.g. Executive Summary"
            autoFocus style={S.input(!!secErrors.title)} />
          {secErrors.title && <div style={S.errorText}>{secErrors.title}</div>}
        </div>
        <div>
          <label style={S.label}>Description <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span></label>
          <textarea value={secForm.description}
            onChange={(e) => setSecForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Brief description…" rows={3}
            style={{ ...S.input(false), resize: "vertical" }} />
        </div>
      </FormScreen>
    );
  }

  if (showVersions && selected) {
    return (
      <VersionHistoryPage
        sectionId={selected.id} sectionTitle={selected.title}
        reportTitle={report?.title || reportTitle}
        apiFetch={apiFetch} isAdmin={isAdmin}
        onBack={() => setShowVersions(false)}
        onRestored={() => {}}
      />
    );
  }

  if (showAssign && selected) {
    return (
      <AssignFormPage
        sectionId={selected.id} sectionTitle={selected.title}
        reportTitle={report?.title || reportTitle}
        apiFetch={apiFetch}
        onBack={() => { setShowAssign(false); reloadAssignments(); }}
        onAssigned={(name, role) => showToast(`${name} assigned as ${role}`, "success")}
      />
    );
  }

  /* ── top-level sections only (for sidebar) ── */
  const rootSections = sections.filter((s) => !s.parent_id);

  /* ── layout ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#f8fafc" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #e2e8f0", borderRadius: 7, padding: "5px 12px", fontSize: 12, color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
          ← Reports
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {report?.title || reportTitle}
          </div>
          {report?.report_type && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {report.report_type}{report.academic_year ? ` · ${report.academic_year}` : ""}
            </div>
          )}
        </div>

        <button onClick={() => setShowPreview(true)} style={{ padding: "6px 13px", border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", fontSize: 12, color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
          Preview
        </button>

        {isAdmin && report && (
          report.status === "PUBLISHED" ? (
            <span style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "#dcfce7", color: "#15803d", flexShrink: 0 }}>
              Published
            </span>
          ) : (
            <button onClick={handlePublish} disabled={publishing} style={{ padding: "6px 14px", background: publishing ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: publishing ? "not-allowed" : "pointer", flexShrink: 0 }}>
              {publishing ? "Publishing…" : "Publish Report"}
            </button>
          )
        )}
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar: section tree ── */}
        <div style={{ width: 260, flexShrink: 0, background: "#fff", borderRight: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Sections ({sections.length})
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
            {sections.map((s) => {
              const siblings = sections.filter((x) => (x.parent_id || null) === (s.parent_id || null));
              const sibIdx   = siblings.findIndex((x) => x.id === s.id);
              return (
                <SectionItem
                  key={s.id} section={s} depth={s._depth || 0}
                  selected={selected}
                  onClick={selectSection}
                  onMoveUp={() => moveSection(s, -1)}
                  onMoveDown={() => moveSection(s, 1)}
                  isFirst={sibIdx === 0}
                  isLast={sibIdx === siblings.length - 1}
                />
              );
            })}

            {sections.length === 0 && (
              <div style={{ margin: "16px 8px", padding: "20px 14px", textAlign: "center", background: "#faf5ff", border: "1px dashed #c4b5fd", borderRadius: 10 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📑</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#7c3aed", marginBottom: 4 }}>No sections yet</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Add sections to structure your report</div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div style={{ padding: "10px", borderTop: "1px solid #f1f5f9" }}>
              <button
                onClick={() => { setNewSectionParentId(null); setShowNewSection(true); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#6d28d9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#7c3aed")}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Section
              </button>
            </div>
          )}
        </div>

        {/* ── Right: section detail or empty state ── */}
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", padding: "60px 40px", maxWidth: 400 }}>
              {sections.length === 0 ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Start building your report</div>
                  <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
                    Add sections to organise your report. Each section can be assigned to team members who will fill in the content.
                  </p>
                  {isAdmin && (
                    <button onClick={() => { setNewSectionParentId(null); setShowNewSection(true); }}
                      style={{ padding: "10px 24px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      + Add First Section
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👈</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>Select a section</div>
                  <p style={{ fontSize: 13, color: "#94a3b8" }}>
                    Click a section on the left to view its details, manage assignments, and add subsections.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <SectionDetailPanel
            section={selected}
            sections={sections}
            apiFetch={apiFetch}
            isAdmin={isAdmin}
            onAssign={() => setShowAssign(true)}
            onVersions={() => setShowVersions(true)}
            onDelete={handleDeleteSection}
            onAddSubsection={() => { setNewSectionParentId(selected.id); setShowNewSection(true); }}
            onSelectSection={selectSection}
            assignmentsData={assignments}
            loadingAssignments={loadingAssignments}
            onRemoveAssignment={removeAssignment}
            allWorkflows={allWorkflows}
            onSectionUpdate={updateSection}
          />
        )}
      </div>
    </div>
  );
}
