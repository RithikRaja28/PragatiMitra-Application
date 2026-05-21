import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { S, Toast } from "../../../components/shared/formUtils";
import FormScreen from "../../../components/shared/FormScreen";

/* ── Constants ──────────────────────────────────────────────────── */
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

const ACCENT = "#059669";

function formatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name = "") {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ── Shared UI atoms ─────────────────────────────────────────────── */
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
        borderTopColor: ACCENT, borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PasswordInput({ value, onChange, hasError }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        placeholder="Min 8 characters"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...S.input(hasError), paddingRight: 44 }}
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

/* ── Locked field chip (non-editable institution / department) ───── */
function LockedField({ label, value, accentColor = ACCENT }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{
        ...S.input(false),
        display: "flex", alignItems: "center", gap: 8,
        background: "#f8fafc", color: "#475569",
        cursor: "not-allowed", userSelect: "none",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
        {value || "—"}
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 600,
          color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          Auto-assigned
        </span>
      </div>
    </div>
  );
}

/* ── UserForm ────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  full_name: "", email: "", password: "", role_name: "",
};

function validateForm(form, isEdit) {
  const errs = {};
  if (!form.full_name.trim())          errs.full_name = "Full name is required.";
  if (!form.email.trim())              errs.email     = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
                                       errs.email     = "Enter a valid email address.";
  if (!isEdit) {
    if (!form.password)                errs.password  = "Password is required.";
    else if (form.password.length < 8) errs.password  = "Password must be at least 8 characters.";
    if (!form.role_name)               errs.role_name = "Please select a role.";
  }
  return errs;
}

function UserForm({
  mode, entity, onCreated, onSaved, onBack, apiFetch,
  institutionId, institutionName, departmentId, departmentName,
}) {
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? {
          full_name:      entity.full_name,
          email:          entity.email,
          account_status: entity.account_status,
        }
      : { ...EMPTY_FORM }
  );
  const [fieldErrs,   setFieldErrs]   = useState({});
  const [roles,       setRoles]       = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!isEdit) {
      apiFetch("/api/lookup/roles")
        .then((r) => r.json())
        .then((d) => { if (d.success) setRoles(d.roles); })
        .catch(() => {});
    }
  }, [apiFetch, isEdit]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrs((e) => ({ ...e, [key]: undefined }));
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateForm(form, isEdit);
    if (Object.keys(errs).length) { setFieldErrs(errs); return; }

    setSaving(true);
    setServerError("");

    try {
      if (isEdit) {
        const res = await apiFetch(`/api/users/${entity.id}`, {
          method: "PUT",
          body: JSON.stringify({
            full_name:      form.full_name,
            email:          form.email,
            institution_id: institutionId,
            department_id:  departmentId,
            account_status: form.account_status,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setServerError(data.message || "Update failed."); setSaving(false); return; }
        onSaved("User updated successfully.");
      } else {
        const res = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({
            full_name:      form.full_name,
            email:          form.email,
            password:       form.password,
            institution_id: institutionId,
            department_id:  departmentId,
            role_name:      form.role_name,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setServerError(data.message || "Failed to create user."); setSaving(false); return; }
        onCreated(`User "${form.full_name}" created successfully.`);
      }
    } catch {
      setServerError("Network error. Please try again.");
      setSaving(false);
    }
  };

  return (
    <FormScreen
      pageTitle="User Management"
      formTitle={isEdit ? "Edit User" : "New User"}
      formSubtitle={isEdit ? entity.full_name : "Add a new user to your department"}
      icon="👤"
      iconBg="#d1fae5"
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={saving}
      submitLabel={isEdit ? "Save Changes" : "Create User"}
      submitError={serverError}
    >
      {/* Full Name */}
      <div>
        <label style={S.label}>Full Name *</label>
        <input
          style={S.input(!!fieldErrs.full_name)}
          placeholder="e.g. Arun Kumar"
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
        />
        {fieldErrs.full_name && <span style={S.errorText}>{fieldErrs.full_name}</span>}
      </div>

      {/* Email */}
      <div>
        <label style={S.label}>Email Address *</label>
        <input
          style={S.input(!!fieldErrs.email)}
          type="email"
          placeholder="e.g. arun@aiia.edu.in"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
        {fieldErrs.email && <span style={S.errorText}>{fieldErrs.email}</span>}
      </div>

      {/* Password — create only */}
      {!isEdit && (
        <div>
          <label style={S.label}>Temporary Password *</label>
          <PasswordInput
            value={form.password}
            onChange={(v) => set("password", v)}
            hasError={!!fieldErrs.password}
          />
          {fieldErrs.password
            ? <span style={S.errorText}>{fieldErrs.password}</span>
            : <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                Min 8 characters. User will be prompted to change on first login.
              </span>
          }
        </div>
      )}

      {/* Institution — locked */}
      <LockedField label="Institution" value={institutionName} />

      {/* Department — locked */}
      <LockedField label="Department" value={departmentName} />

      {/* Role (create) or Account Status (edit) */}
      <div>
        {isEdit ? (
          <>
            <label style={S.label}>Account Status</label>
            <select
              style={S.select(false)}
              value={form.account_status}
              onChange={(e) => set("account_status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label style={S.label}>Role *</label>
            <select
              style={S.select(!!fieldErrs.role_name)}
              value={form.role_name}
              onChange={(e) => set("role_name", e.target.value)}
            >
              <option value="">— Select Role —</option>
              {roles
                .filter((r) => !["super_admin", "institute_admin", "finance_officer", "directors_office", "publication_cell"].includes(r.name))
                .map((r) => (
                  <option key={r.id} value={r.name}>{r.display_name}</option>
                ))}
            </select>
            {fieldErrs.role_name && <span style={S.errorText}>{fieldErrs.role_name}</span>}
          </>
        )}
      </div>
    </FormScreen>
  );
}

/* ── User List ───────────────────────────────────────────────────── */
function UserList({ apiFetch, onEdit }) {
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole,   setFilterRole]   = useState("");
  const [toggling,     setToggling]     = useState(null);
  const [roles,        setRoles]        = useState([]);

  /* load role options once */
  useEffect(() => {
    apiFetch("/api/lookup/roles")
      .then((r) => r.json())
      .then((d) => { if (d.success) setRoles(d.roles); })
      .catch(() => {});
  }, [apiFetch]);

  /* fetch users whenever role filter changes */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const p = new URLSearchParams();
    if (filterRole) p.set("role", filterRole);
    const qs = p.toString();

    apiFetch(`/api/users${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setUsers(data.users);
        else setError(data.message || "Failed to load users.");
      })
      .catch(() => { if (!cancelled) setError("Network error. Could not load users."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [apiFetch, filterRole]);

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
  if (error) return (
    <div style={{ padding: 24, background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <>
      {/* Role filter row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ ...S.select(false), width: "auto", minWidth: 180 }}
        >
        <option value="">All Roles</option>
        {roles
          .filter(
            (r) =>
              !["super_admin","institute_admin","finance_officer",
                "directors_office", "publication_cell",].includes(r.name)
          )
          .map((r) => (
            <option key={r.id} value={r.name}>
              {r.display_name}
            </option>
          ))}
        </select>

        {filterRole && (
          <button
            onClick={() => setFilterRole("")}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "1.5px solid #e2e8f0", background: "#fff",
              fontSize: 12, fontWeight: 600, color: "#64748b",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Search + status filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...S.input(false), flex: 1, minWidth: 200 }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...S.select(false), width: "auto" }}
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
              {["User", "Role(s)", "Status", "Last Login", "Actions"].map((h) => (
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
                    <button onClick={() => onEdit(u)} style={{
                      padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0",
                      background: "#fff", fontSize: 12, fontWeight: 600,
                      color: ACCENT, cursor: "pointer",
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
                <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
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

/* ── Main Export ─────────────────────────────────────────────────── */
export default function DepartmentAdminUserManagementPage() {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const [formView,   setFormView]   = useState(null);
  const [toast,      setToast]      = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const institutionId   = user?.institutionId   || "";
  const institutionName = user?.institutionName || "Your Institution";
  const departmentId    = user?.departmentId    || "";
  const departmentName  = user?.departmentName  || "Your Department";

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (formView) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <UserForm
          mode={formView.mode}
          entity={formView.entity}
          apiFetch={apiFetch}
          institutionId={institutionId}
          institutionName={institutionName}
          departmentId={departmentId}
          departmentName={departmentName}
          onCreated={(msg) => { setFormView(null); showToast(msg); setRefreshKey((k) => k + 1); }}
          onSaved={(msg)   => { setFormView(null); showToast(msg); setRefreshKey((k) => k + 1); }}
          onBack={() => setFormView(null)}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `${ACCENT}14`, borderRadius: 8, padding: "4px 12px", marginBottom: 12,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
              User Management
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
            Users
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Manage users in{" "}
            <span style={{ color: ACCENT, fontWeight: 600 }}>{departmentName}</span>
            {institutionName ? (
              <>
                {" "}·{" "}
                <span style={{ color: "#64748b", fontWeight: 500 }}>{institutionName}</span>
              </>
            ) : null}
          </p>
        </div>

        <button
          onClick={() => setFormView({ mode: "create", entity: null })}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: ACCENT, fontSize: 13, fontWeight: 700,
            color: "#fff", cursor: "pointer", flexShrink: 0, marginTop: 4,
          }}
        >
          + New User
        </button>
      </div>

      <UserList
        key={refreshKey}
        apiFetch={apiFetch}
        onEdit={(u) => setFormView({ mode: "edit", entity: u })}
      />
    </div>
  );
}
