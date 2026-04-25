import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";

/* ── Helpers ─────────────────────────────────────────────────── */
function formatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name = "") {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED"];

const STATUS_STYLE = {
  ACTIVE:    { dot: "#10b981", label: "#059669" },
  INACTIVE:  { dot: "#cbd5e1", label: "#94a3b8" },
  SUSPENDED: { dot: "#f87171", label: "#dc2626" },
};

const ROLE_COLORS = {
  super_admin:        { bg: "#dbeafe", color: "#1d4ed8" },
  institute_admin:    { bg: "#ede9fe", color: "#6d28d9" },
  publication_cell:   { bg: "#fce7f3", color: "#9d174d" },
  department_admin:   { bg: "#d1fae5", color: "#065f46" },
  head_of_department: { bg: "#fef3c7", color: "#92400e" },
  nodal_officer:      { bg: "#fee2e2", color: "#991b1b" },
  contributor:        { bg: "#dcfce7", color: "#166534" },
  reviewer:           { bg: "#eff6ff", color: "#1e40af" },
  finance_officer:    { bg: "#fff7ed", color: "#9a3412" },
  directors_office:   { bg: "#fdf4ff", color: "#7e22ce" },
};

/* ── Sub-components ──────────────────────────────────────────── */
function RoleBadge({ name, display_name }) {
  const s = ROLE_COLORS[name] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, letterSpacing: 0.2, whiteSpace: "nowrap",
    }}>
      {display_name || name}
    </span>
  );
}

function StatusDot({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.INACTIVE;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: s.label }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 32, height: 32, border: "3px solid #e2e8f0",
        borderTopColor: "#2563eb", borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 700, color: "#64748b", display: "block",
      marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6,
    }}>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
  borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box",
  background: "#fff", color: "#1e293b",
};

/* ── Edit Modal ─────────────────────────────────────────────── */
function EditModal({ user, onClose, onSave, apiFetch }) {
  const [form, setForm] = useState({
    full_name:      user.full_name,
    email:          user.email,
    institution_id: user.institution_id || "",
    department_id:  user.department_id  || "",
    account_status: user.account_status,
  });
  const [institutions, setInstitutions] = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    apiFetch("/api/lookup/institutions")
      .then((r) => r.json())
      .then((d) => { if (d.success) setInstitutions(d.institutions); });
  }, [apiFetch]);

  useEffect(() => {
    if (!form.institution_id) { setDepartments([]); return; }
    apiFetch(`/api/lookup/departments?institution_id=${form.institution_id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setDepartments(d.departments); });
  }, [form.institution_id, apiFetch]);

  const handleInstitutionChange = (e) => {
    setForm((f) => ({ ...f, institution_id: e.target.value, department_id: "" }));
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res  = await apiFetch(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Update failed."); setSaving(false); return; }
      onSave();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 32,
        width: 460, maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 22 }}>
          Edit User
        </h3>

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
            padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626",
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Full Name</FieldLabel>
          <input style={inputStyle} value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Email</FieldLabel>
          <input style={inputStyle} type="email" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Institution</FieldLabel>
          <select style={inputStyle} value={form.institution_id} onChange={handleInstitutionChange}>
            <option value="">— Select Institution —</option>
            {institutions.map((i) => (
              <option key={i.institution_id} value={i.institution_id}>
                {i.institution_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Department</FieldLabel>
          <select style={inputStyle} value={form.department_id}
            onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
            disabled={!form.institution_id}>
            <option value="">— Select Department —</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Account Status</FieldLabel>
          <select style={inputStyle} value={form.account_status}
            onChange={(e) => setForm((f) => ({ ...f, account_status: e.target.value }))}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: "9px 20px", borderRadius: 9, border: "1.5px solid #e2e8f0",
            background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: "#2563eb", fontSize: 13, fontWeight: 600,
            color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── User List Tab ───────────────────────────────────────────── */
function UserListTab({ apiFetch }) {
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editing,      setEditing]      = useState(null);
  const [toggling,     setToggling]     = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await apiFetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
      else setError(data.message || "Failed to load users.");
    } catch {
      setError("Network error. Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toggleStatus = async (user) => {
    const next = user.account_status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setToggling(user.id);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name:      user.full_name,
          email:          user.email,
          institution_id: user.institution_id,
          department_id:  user.department_id,
          account_status: next,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers((us) => us.map((u) => u.id === user.id ? { ...u, account_status: next } : u));
      }
    } catch {}
    setToggling(null);
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || u.account_status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <Spinner />;
  if (error)   return (
    <div style={{ padding: 24, background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <>
      {editing && (
        <EditModal
          user={editing}
          apiFetch={apiFetch}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); loadUsers(); }}
        />
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              {["User", "Institution", "Department", "Role(s)", "Status", "Last Login", "Actions"].map((h) => (
                <th key={h} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} style={{
                borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                background: "transparent",
              }}>
                {/* User */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `hsl(${u.full_name.charCodeAt(0) * 37 % 360}, 55%, 85%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                      color: `hsl(${u.full_name.charCodeAt(0) * 37 % 360}, 55%, 30%)`,
                      flexShrink: 0,
                    }}>
                      {initials(u.full_name)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{u.full_name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                {/* Institution */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>
                  {u.institution_name || "—"}
                </td>
                {/* Department */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>
                  {u.department_name || "—"}
                </td>
                {/* Roles */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(u.roles || []).length > 0
                      ? u.roles.map((r) => <RoleBadge key={r.name} {...r} />)
                      : <span style={{ fontSize: 12, color: "#cbd5e1" }}>No role</span>
                    }
                  </div>
                </td>
                {/* Status */}
                <td style={{ padding: "14px 16px" }}>
                  <StatusDot status={u.account_status} />
                </td>
                {/* Last Login */}
                <td style={{ padding: "14px 16px", fontSize: 12, color: "#94a3b8" }}>
                  {formatDate(u.last_login_at)}
                </td>
                {/* Actions */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setEditing(u)} style={{
                      padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0",
                      background: "#fff", fontSize: 12, fontWeight: 600,
                      color: "#2563eb", cursor: "pointer",
                    }}>
                      Edit
                    </button>
                    <button
                      onClick={() => toggleStatus(u)}
                      disabled={toggling === u.id}
                      style={{
                        padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0",
                        background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        color: u.account_status === "ACTIVE" ? "#dc2626" : "#059669",
                        opacity: toggling === u.id ? 0.6 : 1,
                      }}
                    >
                      {toggling === u.id ? "…" : u.account_status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No users match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Create User Tab ─────────────────────────────────────────── */
const EMPTY_FORM = {
  full_name: "", email: "", password: "",
  institution_id: "", department_id: "", role_name: "",
};

function validate(form) {
  const errs = {};
  if (!form.full_name.trim())          errs.full_name      = "Full name is required.";
  if (!form.email.trim())              errs.email          = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
                                       errs.email          = "Enter a valid email address.";
  if (!form.password)                  errs.password       = "Password is required.";
  else if (form.password.length < 8)   errs.password       = "Password must be at least 8 characters.";
  if (!form.institution_id)            errs.institution_id = "Please select an institution.";
  if (!form.role_name)                 errs.role_name      = "Please select a role.";
  return errs;
}

function CreateUserTab({ apiFetch }) {
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [fieldErrs,    setFieldErrs]    = useState({});
  const [institutions, setInstitutions] = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [roles,        setRoles]        = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [serverError,  setServerError]  = useState("");
  const [created,      setCreated]      = useState(null);

  useEffect(() => {
    apiFetch("/api/lookup/institutions")
      .then((r) => r.json())
      .then((d) => { if (d.success) setInstitutions(d.institutions); })
      .catch(() => {});

    apiFetch("/api/lookup/roles")
      .then((r) => r.json())
      .then((d) => { if (d.success) setRoles(d.roles); })
      .catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    if (!form.institution_id) { setDepartments([]); return; }
    setLoadingDepts(true);
    apiFetch(`/api/lookup/departments?institution_id=${form.institution_id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setDepartments(d.departments); })
      .catch(() => {})
      .finally(() => setLoadingDepts(false));
  }, [form.institution_id, apiFetch]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrs((e) => ({ ...e, [key]: undefined }));
    setServerError("");
  };

  const handleSubmit = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length) { setFieldErrs(errs); return; }

    setSaving(true);
    setServerError("");
    setCreated(null);

    try {
      const res  = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          department_id: form.department_id || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.message || "Failed to create user.");
        setSaving(false);
        return;
      }

      setCreated({ fullName: form.full_name, email: form.email });
      setForm(EMPTY_FORM);
      setFieldErrs({});
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const errStyle = { fontSize: 11, color: "#ef4444", marginTop: 4, display: "block" };
  const fieldBorder = (key) => ({ ...inputStyle, borderColor: fieldErrs[key] ? "#f87171" : "#e2e8f0" });

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Success banner */}
      {created && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12,
          padding: "16px 20px", marginBottom: 24, display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              ✓ User created successfully
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 3 }}>
              {created.fullName} &nbsp;·&nbsp; {created.email}
            </div>
          </div>
          <button onClick={() => setCreated(null)} style={{
            background: "none", border: "none", color: "#15803d",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {/* Server error banner */}
      {serverError && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#dc2626",
        }}>
          {serverError}
        </div>
      )}

      {/* Full Name */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Full Name *</FieldLabel>
        <input
          style={fieldBorder("full_name")}
          placeholder="e.g. Arun Kumar"
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
        />
        {fieldErrs.full_name && <span style={errStyle}>{fieldErrs.full_name}</span>}
      </div>

      {/* Email */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Email Address *</FieldLabel>
        <input
          style={fieldBorder("email")}
          type="email"
          placeholder="e.g. arun@aiia.edu.in"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
        {fieldErrs.email && <span style={errStyle}>{fieldErrs.email}</span>}
      </div>

      {/* Password */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Temporary Password *</FieldLabel>
        <PasswordInput
          value={form.password}
          onChange={(v) => set("password", v)}
          hasError={!!fieldErrs.password}
        />
        {fieldErrs.password
          ? <span style={errStyle}>{fieldErrs.password}</span>
          : <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
              Min 8 characters. User will be prompted to change on first login.
            </span>
        }
      </div>

      {/* Institution */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Institution *</FieldLabel>
        <select
          style={fieldBorder("institution_id")}
          value={form.institution_id}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, institution_id: v, department_id: "" }));
            setFieldErrs((errs) => ({ ...errs, institution_id: undefined }));
            setServerError("");
          }}
        >
          <option value="">— Select Institution —</option>
          {institutions.map((i) => (
            <option key={i.institution_id} value={i.institution_id}>
              {i.institution_name}
            </option>
          ))}
        </select>
        {fieldErrs.institution_id && <span style={errStyle}>{fieldErrs.institution_id}</span>}
      </div>

      {/* Department + Role side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <FieldLabel>Department <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span></FieldLabel>
          <select
            style={{ ...inputStyle, color: !form.institution_id ? "#94a3b8" : "#1e293b" }}
            value={form.department_id}
            onChange={(e) => set("department_id", e.target.value)}
            disabled={!form.institution_id || loadingDepts}
          >
            <option value="">
              {loadingDepts ? "Loading…" : !form.institution_id ? "Select institution first" : "— Select Department —"}
            </option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Role *</FieldLabel>
          <select
            style={fieldBorder("role_name")}
            value={form.role_name}
            onChange={(e) => set("role_name", e.target.value)}
          >
            <option value="">— Select Role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.name}>{r.display_name}</option>
            ))}
          </select>
          {fieldErrs.role_name && <span style={errStyle}>{fieldErrs.role_name}</span>}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{
          padding: "11px 32px", borderRadius: 10, border: "none",
          background: saving ? "#93c5fd" : "#2563eb",
          fontSize: 14, fontWeight: 700, color: "#fff",
          cursor: saving ? "not-allowed" : "pointer",
          transition: "background 0.2s",
        }}
      >
        {saving ? "Creating…" : "Create User"}
      </button>
    </div>
  );
}

/* ── Password input with show/hide toggle ────────────────────── */
function PasswordInput({ value, onChange, hasError }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        placeholder="Min 8 characters"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          paddingRight: 44,
          borderColor: hasError ? "#f87171" : "#e2e8f0",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        style={{
          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "#94a3b8", fontSize: 12, fontWeight: 600, padding: "2px 4px",
        }}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/* ── Main Export ─────────────────────────────────────────────── */
export default function UserManagementPage() {
  const [activeTab, setActiveTab] = useState("list");
  const { apiFetch } = useApi();

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "#7c3aed14", borderRadius: 8, padding: "4px 12px", marginBottom: 12,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#7c3aed" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1 }}>
            User Management
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
          Users
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          Create, edit, activate/deactivate, and manage roles for all platform users.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10,
        padding: 4, width: "fit-content", marginBottom: 24,
      }}>
        {[["list", "User List"], ["create", "Create User"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13,
            fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            background: activeTab === key ? "#fff" : "transparent",
            color:      activeTab === key ? "#1e293b" : "#94a3b8",
            boxShadow:  activeTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "list"
        ? <UserListTab   apiFetch={apiFetch} />
        : <CreateUserTab apiFetch={apiFetch} />
      }
    </div>
  );
}
