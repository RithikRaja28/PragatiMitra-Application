import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";

/* ── Capability definitions ──────────────────────────────────────── */
const CAPABILITY_GROUPS = [
  {
    label: "User Management",
    icon: "👤",
    caps: [
      { key: "assign_roles_institute", label: "Assign roles & link users to departments (institute-wide)", desc: "Can map any user to any role and department across the institute.", badge: "Restricted" },
      { key: "manage_dept_users",      label: "Add, update, and deactivate users within own department",  desc: "Department-scoped user management only." },
      { key: "delegate_nodal",         label: "Delegate nodal officer rights to another staff member",    desc: "Can hand over section responsibility for a specific reporting year." },
    ],
  },
  {
    label: "Form Access",
    icon: "📋",
    caps: [
      { key: "fill_dept_forms",      label: "Fill departmental forms",   desc: "OPD/IPD stats, academic data, research, library, pharmacovigilance, Rajbhasha." },
      { key: "fill_institute_forms", label: "Fill institute-wide forms", desc: "Committees, governance records, general administration." },
    ],
  },
  {
    label: "Report",
    icon: "📊",
    caps: [
      { key: "manage_cycles",       label: "Create and manage reporting cycles",              desc: "Define reporting year, deadlines, approval workflow, and lock/archive cycles.", badge: "Restricted" },
      { key: "configure_templates", label: "Configure section templates and field formats",   desc: "Build or clone the section tree and define field types for each section.", badge: "Admin" },
      { key: "write_narrative",     label: "Write and edit narrative content",                desc: "Use the rich text editor to author section narratives, insert tables and upload annexures." },
      { key: "submit_for_review",   label: "Submit content for review",                       desc: "Mark a section as ready and push it to the next stage in the review chain." },
      { key: "review_content",      label: "Review content — read-only; can comment, approve or send back", desc: "Cannot edit content directly." },
      { key: "final_signoff",       label: "Final sign-off (Director level)",                 desc: "Last approval step before a section is locked.", badge: "Restricted" },
      { key: "compile_report",      label: "Compile the final report and manage bilingual output", desc: "Trigger one-click compilation; generate English and Hindi exports.", badge: "Admin" },
    ],
  },
  {
    label: "Finance",
    icon: "💰",
    caps: [
      { key: "fill_finance_forms",  label: "Fill finance forms and enter budget data",   desc: "Budget estimates, revised estimates, and actual expenditure.", badge: "Finance" },
      { key: "upload_statements",   label: "Upload audited financial statements",         desc: "Balance sheet, I&E statements and schedules (PDF / Excel).", badge: "Finance" },
    ],
  },
  {
    label: "Administration & Audit",
    icon: "🛡️",
    caps: [
      { key: "master_data",  label: "Manage master data",                      desc: "Departments, designations, KPI definitions, notification templates, and access policies.", badge: "Restricted" },
      { key: "audit_logs",   label: "View audit logs and progress dashboards",  desc: "Login history, edit/approval actions, and section completion across departments." },
    ],
  },
];

const ALL_CAP_KEYS = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));

const TEMPLATES = {
  super_admin:      ["assign_roles_institute","manage_dept_users","delegate_nodal","manage_cycles","configure_templates","fill_dept_forms","fill_institute_forms","write_narrative","submit_for_review","review_content","final_signoff","fill_finance_forms","upload_statements","compile_report","master_data","audit_logs"],
  institute_admin:  ["manage_cycles","configure_templates","audit_logs","master_data"],
  publication_cell: ["configure_templates","compile_report","review_content","audit_logs"],
  dept_admin:       ["manage_dept_users"],
  hod:              ["delegate_nodal","review_content","submit_for_review"],
  nodal_officer:    ["fill_dept_forms","write_narrative","submit_for_review"],
  contributor:      ["fill_dept_forms","write_narrative"],
  reviewer:         ["review_content"],
  finance_officer:  ["fill_finance_forms","upload_statements"],
  director:         ["final_signoff","review_content"],
};

const BADGE_STYLES = {
  Restricted: { background: "#fee2e2", color: "#b91c1c" },
  Admin:      { background: "#fef3c7", color: "#92400e" },
  Finance:    { background: "#fef3c7", color: "#92400e" },
};

const EMPTY_PERMS = () => Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, false]));

/* ── helpers ─────────────────────────────────────────────────────── */
function permsToChecked(permissions = {}) {
  return Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, !!permissions[k]]));
}

/* ══════════════════════════════════════════════════════════════════
   CapabilityGroup — collapsible section of checkboxes
══════════════════════════════════════════════════════════════════ */
function CapabilityGroup({ group, checked, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e5e9", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ padding: "10px 16px", background: "#f8f9fb", borderBottom: open ? "1px solid #e2e5e9" : "none", fontWeight: 700, fontSize: 12.5, color: "#1e293b", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
      >
        <span>{group.icon}</span>
        {group.label}
        <span style={{ marginLeft: "auto", color: "#aaa", fontSize: 10, transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s" }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: "6px 0" }}>
          {group.caps.map((cap) => (
            <label
              key={cap.key}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 16px", borderBottom: "1px solid #f1f3f5", cursor: "pointer", transition: "background .1s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8faff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <input
                type="checkbox"
                checked={!!checked[cap.key]}
                onChange={(e) => onChange(cap.key, e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#3b82f6", flexShrink: 0, marginTop: 2, cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: "#1e293b", fontSize: 13 }}>{cap.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{cap.desc}</div>
              </div>
              {cap.badge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, flexShrink: 0, marginTop: 2, ...BADGE_STYLES[cap.badge] }}>
                  {cap.badge}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RoleEditor — create or edit a single role
══════════════════════════════════════════════════════════════════ */
function RoleEditor({ role, onSave, onCancel, saving }) {
  const isNew = !role;
  const [name, setName]         = useState(role?.name ?? "");
  const [displayName, setDN]    = useState(role?.display_name ?? "");
  const [description, setDesc]  = useState(role?.description ?? "");
  const [checked, setChecked]   = useState(isNew ? EMPTY_PERMS() : permsToChecked(role.permissions));
  const [nameErr, setNameErr]   = useState("");

  function applyTemplate(tplKey) {
    if (!tplKey) { setChecked(EMPTY_PERMS()); return; }
    const caps = TEMPLATES[tplKey] ?? [];
    setChecked(Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, caps.includes(k)])));
  }

  function toggleCap(key, val) {
    setChecked((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    if (!displayName.trim()) return;
    if (isNew) {
      if (!name.trim()) { setNameErr("Required"); return; }
      if (!/^[a-z][a-z0-9_]*$/.test(name)) { setNameErr("Lowercase snake_case only (e.g. dept_viewer)"); return; }
    }
    setNameErr("");
    const permissions = Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, !!checked[k]]));
    onSave({ name: name.trim(), display_name: displayName.trim(), description: description.trim() || null, permissions });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: 0 }}>
          {isNew ? "Create Role" : `Edit: ${role.display_name}`}
        </h2>
        {role?.is_system && (
          <span style={{ fontSize: 11, fontWeight: 600, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 99 }}>System</span>
        )}
      </div>

      {/* Role metadata */}
      <div style={{ background: "#fff", border: "1px solid #e2e5e9", borderRadius: 8, padding: "18px 22px", marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap" }}>
        {isNew && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: .5 }}>Role Key *</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameErr(""); }}
              placeholder="e.g. dept_viewer"
              style={{ border: `1px solid ${nameErr ? "#ef4444" : "#d1d5db"}`, borderRadius: 5, padding: "8px 11px", fontSize: 13, outline: "none" }}
            />
            {nameErr && <span style={{ fontSize: 11, color: "#ef4444" }}>{nameErr}</span>}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: .5 }}>Display Name *</label>
          <input
            value={displayName}
            onChange={(e) => setDN(e.target.value)}
            placeholder="e.g. Department Viewer"
            style={{ border: `1px solid ${!displayName.trim() ? "#ef4444" : "#d1d5db"}`, borderRadius: 5, padding: "8px 11px", fontSize: 13, outline: "none" }}
          />
        </div>
        {isNew && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: .5 }}>Based on template</label>
            <select onChange={(e) => applyTemplate(e.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 5, padding: "8px 11px", fontSize: 13, outline: "none" }}>
              <option value="">— Start from scratch —</option>
              {Object.keys(TEMPLATES).map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 2, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: .5 }}>Description</label>
          <input
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional description"
            style={{ border: "1px solid #d1d5db", borderRadius: 5, padding: "8px 11px", fontSize: 13, outline: "none" }}
          />
        </div>
      </div>

      {/* Capability groups */}
      {CAPABILITY_GROUPS.map((g) => (
        <CapabilityGroup key={g.label} group={g} checked={checked} onChange={toggleCap} />
      ))}

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSave}
          disabled={saving || !displayName.trim()}
          style={{ padding: "9px 24px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", background: "#2563eb", color: "#fff", border: "none", opacity: saving || !displayName.trim() ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : isNew ? "Create Role" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "9px 24px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#374151", border: "1px solid #d1d5db" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RoleList — table of all roles
══════════════════════════════════════════════════════════════════ */
function RoleList({ roles, onEdit, onDelete, onCreate, deleting }) {
  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: 0 }}>Role & Access Control</h2>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>Manage what each role can access and do.</p>
        </div>
        <button
          onClick={onCreate}
          style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#2563eb", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 6 }}
        >
          + Create Role
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e2e5e9", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8f9fb" }}>
              {["Display Name", "Key", "Description", "Type", "Actions"].map((h) => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: .5, borderBottom: "1px solid #e2e5e9" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: i < roles.length - 1 ? "1px solid #f1f3f5" : "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8faff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{r.display_name}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{r.name}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8", maxWidth: 260 }}>{r.description || "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  {r.is_system
                    ? <span style={{ fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 99 }}>System</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: 99 }}>Custom</span>
                  }
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => onEdit(r)}
                      style={{ padding: "5px 14px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#f1f5f9", color: "#1e293b", border: "1px solid #e2e8f0" }}
                    >
                      Edit
                    </button>
                    {!r.is_system && (
                      <button
                        onClick={() => onDelete(r)}
                        disabled={deleting === r.id}
                        style={{ padding: "5px 14px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: deleting === r.id ? "not-allowed" : "pointer", background: "#fff", color: "#ef4444", border: "1px solid #fecaca", opacity: deleting === r.id ? 0.5 : 1 }}
                      >
                        {deleting === r.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RoleAccessPage — top-level orchestrator
══════════════════════════════════════════════════════════════════ */
export default function RoleAccessPage() {
  const { apiFetch } = useApi();

  const [roles, setRoles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState("list"); // "list" | "edit" | "create"
  const [editing, setEditing]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast]       = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/roles");
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setRoles(data.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  async function handleSave(payload) {
    setSaving(true);
    try {
      const isNew = view === "create";
      const res = await apiFetch(
        isNew ? "/api/roles" : `/api/roles/${editing.id}`,
        { method: isNew ? "POST" : "PUT", body: JSON.stringify(payload) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await loadRoles();
      setView("list");
      setEditing(null);
      showToast(isNew ? "Role created successfully." : "Role updated successfully.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role) {
    if (!window.confirm(`Delete role "${role.display_name}"? This cannot be undone.`)) return;
    setDeleting(role.id);
    try {
      const res = await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      showToast("Role deleted.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 860 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: toast.type === "error" ? "#fee2e2" : "#dcfce7", color: toast.type === "error" ? "#b91c1c" : "#15803d", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast.type === "error" ? "✕ " : "✓ "}{toast.msg}
        </div>
      )}

      {loading && (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading roles…</div>
      )}

      {!loading && error && (
        <div style={{ color: "#ef4444", fontSize: 13 }}>{error} <button onClick={loadRoles} style={{ marginLeft: 8, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Retry</button></div>
      )}

      {!loading && !error && view === "list" && (
        <RoleList
          roles={roles}
          onEdit={(r) => { setEditing(r); setView("edit"); }}
          onDelete={handleDelete}
          onCreate={() => { setEditing(null); setView("create"); }}
          deleting={deleting}
        />
      )}

      {!loading && !error && (view === "edit" || view === "create") && (
        <RoleEditor
          role={view === "edit" ? editing : null}
          onSave={handleSave}
          onCancel={() => { setView("list"); setEditing(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
