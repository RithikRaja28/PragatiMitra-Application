import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";
import { S, Toast } from "../../../components/shared/formUtils";
import FormScreen from "../../../components/shared/FormScreen";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import ImportWizard from "../../../components/shared/ImportWizard";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Constants & pure helpers ──────────────────────────────────── */
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
        borderTopColor: "#2563eb", borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PasswordInput({ value, onChange, hasError }) {
  const { lang } = useLanguage();
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
        {show ? t("Hide", lang) : t("Show", lang)}
      </button>
    </div>
  );
}

/* ── UserForm (create + edit) ────────────────────────────────────── */
const EMPTY_FORM = {
  full_name: "", email: "", password: "",
  institution_id: "", department_id: "", role_name: "",
};

function validateForm(form, isEdit) {
  const errs = {};
  if (!form.full_name.trim())          errs.full_name      = "Full name is required.";
  if (!form.email.trim())              errs.email          = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
                                       errs.email          = "Enter a valid email address.";
  if (!isEdit) {
    if (!form.password)                errs.password       = "Password is required.";
    else if (form.password.length < 8) errs.password       = "Password must be at least 8 characters.";
    if (!form.role_name)               errs.role_name      = "Please select a role.";
  }
  if (!form.institution_id)            errs.institution_id = "Please select an institution.";
  return errs;
}

function UserForm({ mode, entity, onCreated, onSaved, onBack, apiFetch }) {
  const { lang } = useLanguage();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? {
          full_name:      entity.full_name,
          email:          entity.email,
          institution_id: entity.institution_id || "",
          department_id:  entity.department_id  || "",
          account_status: entity.account_status,
        }
      : { ...EMPTY_FORM }
  );
  const [fieldErrs,    setFieldErrs]    = useState({});
  const [institutions, setInstitutions] = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [roles,        setRoles]        = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [serverError,  setServerError]  = useState("");

  useEffect(() => {
    apiFetch("/api/lookup/institutions")
      .then((r) => r.json())
      .then((d) => { if (d.success) setInstitutions(d.institutions); })
      .catch(() => {});

    if (!isEdit) {
      apiFetch("/api/lookup/roles")
        .then((r) => r.json())
        .then((d) => { if (d.success) setRoles(d.roles); })
        .catch(() => {});
    }
  }, [apiFetch, isEdit]);

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
            institution_id: form.institution_id,
            department_id:  form.department_id || null,
            account_status: form.account_status,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setServerError(data.message || "Update failed."); setSaving(false); return; }
        onSaved("User updated successfully.");
      } else {
        const res = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ ...form, department_id: form.department_id || null }),
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
      pageTitle={t("Users", lang)}
      formTitle={isEdit ? t("Edit User", lang) : t("New User", lang)}
      formSubtitle={isEdit ? entity.full_name : "Add a new user to the platform"}
      icon="👤"
      iconBg="#ede9fe"
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={saving}
      submitLabel={isEdit ? t("Save Changes", lang) : t("Create User", lang)}
      submitError={serverError}
    >
      {/* Full Name */}
      <div>
        <label style={S.label}>{t("Full Name *", lang)}</label>
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
        <label style={S.label}>{t("Email Address *", lang)}</label>
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
          <label style={S.label}>{t("Temporary Password *", lang)}</label>
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

      {/* Institution */}
      <div>
        <label style={S.label}>{t("Institution *", lang)}</label>
        <select
          style={S.select(!!fieldErrs.institution_id)}
          value={form.institution_id}
          onChange={(e) => {
            setForm((f) => ({ ...f, institution_id: e.target.value, department_id: "" }));
            setFieldErrs((errs) => ({ ...errs, institution_id: undefined }));
            setServerError("");
          }}
        >
          <option value="">{t("— Select Institution —", lang)}</option>
          {institutions.map((i) => (
            <option key={i.institution_id} value={i.institution_id}>
              {i.institution_name}
            </option>
          ))}
        </select>
        {fieldErrs.institution_id && <span style={S.errorText}>{fieldErrs.institution_id}</span>}
      </div>

      {/* Department + Role/Status grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={S.label}>
            Department{" "}
            <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>(optional)</span>
          </label>
          <select
            style={S.select(false)}
            value={form.department_id}
            onChange={(e) => set("department_id", e.target.value)}
            disabled={!form.institution_id || loadingDepts}
          >
            <option value="">
              {loadingDepts
                ? "Loading…"
                : !form.institution_id
                  ? t("Select institution first", lang)
                  : t("— Select Department —", lang)}
            </option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>

        {isEdit ? (
          <div>
            <label style={S.label}>{t("Account Status", lang)}</label>
            <select
              style={S.select(false)}
              value={form.account_status}
              onChange={(e) => set("account_status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label style={S.label}>{t("Role *", lang)}</label>
            <select
              style={S.select(!!fieldErrs.role_name)}
              value={form.role_name}
              onChange={(e) => set("role_name", e.target.value)}
            >
              <option value="">{t("— Select Role —", lang)}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>{r.display_name}</option>
              ))}
            </select>
            {fieldErrs.role_name && <span style={S.errorText}>{fieldErrs.role_name}</span>}
          </div>
        )}
      </div>
    </FormScreen>
  );
}

/* ── User List ───────────────────────────────────────────────────── */
function UserList({ apiFetch, onEdit }) {
  const { lang } = useLanguage();
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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
      {/* Filters */}
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
              {["User", "Institution", "Department", "Role(s)", "Status", "Last Login", "Actions"].map((h) => (
                <th key={h} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8,
                }}>
                  {t(h, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} style={{
                borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              }}>
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
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>
                  {u.institution_name || "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>
                  {u.department_name || "—"}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(u.roles || []).length > 0
                      ? u.roles.map((r) => <RoleBadge key={r.name} {...r} />)
                      : <span style={{ fontSize: 12, color: "#cbd5e1" }}>{t("No role", lang)}</span>
                    }
                  </div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <StatusDot status={u.account_status} />
                </td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: "#94a3b8" }}>
                  {formatDate(u.last_login_at)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onEdit(u)} style={{
                      padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0",
                      background: "#fff", fontSize: 12, fontWeight: 600,
                      color: "#2563eb", cursor: "pointer",
                    }}>
                      {t("Edit", lang)}
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
                      {toggling === u.id ? "…" : u.account_status === "ACTIVE" ? t("Deactivate", lang) : t("Activate", lang)}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  {t("No users match your filters.", lang)}
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
export default function UserManagementPage() {
  const { lang } = useLanguage();
  const [formView,   setFormView]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { apiFetch }      = useApi();
  const [toast,           setToast]           = useState(null);
  const [showImport,      setShowImport]      = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExport = async (format) => {
    setExportingFormat(format);
    try {
      const res  = await apiFetch(`/api/users/export?format=${format}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `users_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Export failed. Please try again.", "error");
    } finally {
      setExportingFormat(null);
    }
  };

  if (formView) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <UserForm
          mode={formView.mode}
          entity={formView.entity}
          apiFetch={apiFetch}
          onCreated={(msg) => { setFormView(null); showToast(msg); setRefreshKey((k) => k + 1); }}
          onSaved={(msg)   => { setFormView(null); showToast(msg); setRefreshKey((k) => k + 1); }}
          onBack={() => setFormView(null)}
        />
      </>
    );
  }

  if (showImport) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <ImportWizard
          onBack={() => setShowImport(false)}
          onSuccess={(result) => {
            setRefreshKey((k) => k + 1);
            showToast(`Import complete: ${result.imported} user${result.imported !== 1 ? "s" : ""} imported.`);
          }}
        />
      </>
    );
  }

  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#7c3aed14",
              borderRadius: 8,
              padding: "4px 12px",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#7c3aed",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#7c3aed",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {t("User Management", lang)}
            </span>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#1e293b",
              letterSpacing: "-0.4px",
              marginBottom: 6,
            }}
          >
            {t("Users", lang)}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create, edit, activate/deactivate, and manage roles for all platform
            users.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          {/* Export dropdown */}
          <div style={{ position: "relative" }}>
            <ExportMenu loading={exportingFormat} onExport={handleExport} />
          </div>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1.5px solid #2563eb",
              background: "#eff6ff",
              fontSize: 13,
              fontWeight: 700,
              color: "#2563eb",
              cursor: "pointer",
            }}
          >
            ↑ Import
          </button>

          {/* New user button */}
          <button
            onClick={() => setFormView({ mode: "create", entity: null })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              flexShrink: 0,
              marginTop: 4,
            }}
          >
            {t("+ New User", lang)}
          </button>
        </div>
      </div>

      <UserList
        key={refreshKey}
        apiFetch={apiFetch}
        onEdit={(u) => setFormView({ mode: "edit", entity: u })}
      />
    </div>
  );
}

/* ── Export dropdown menu ────────────────────────────────────────── */
function ExportMenu({ loading, onExport }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 18px", borderRadius: 10,
          border: "1.5px solid #e2e8f0", background: "#fff",
          fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Exporting…" : "↓ Export"} ▾
      </button>
      {open && (
        <>
          {/* click-away overlay */}
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
            background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 160, overflow: "hidden",
          }}>
            {[
              { fmt: "csv",  label: "Export as CSV" },
              { fmt: "xlsx", label: "Export as Excel" },
            ].map(({ fmt, label }) => (
              <button key={fmt}
                onClick={() => { setOpen(false); onExport(fmt); }}
                style={{
                  display: "block", width: "100%", padding: "10px 16px",
                  background: "none", border: "none", textAlign: "left",
                  fontSize: 13, color: "#1e293b", cursor: "pointer",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
