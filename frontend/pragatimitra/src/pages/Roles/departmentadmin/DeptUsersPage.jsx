import React, { useState, useCallback } from "react";
import FormScreen from "../../../components/shared/FormScreen";
import { S, Toast } from "../../../components/shared/formUtils";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#059669",
  primaryLt: "#d1fae5",
  text:      "#052e16",
  textSub:   "#6b7280",
  border:    "rgba(5,150,105,0.12)",
  bg:        "#f0fdf4",
  surface:   "#ffffff",
};

const DEPT_ROLES = ["department_nodal_officer", "contributor", "reviewer"];
const DEPT_SECTIONS = ["Ayurvedic Principles", "Clinical Studies", "Research Publications", "Lab Reports", "Annual Statistics", "Patient Case Studies"];

const STATUS_STYLE = {
  active:   { bg: "#d1fae5", color: "#065f46" },
  inactive: { bg: "#f1f5f9", color: "#475569" },
};

const ROLE_LABELS = {
  department_nodal_officer: "Nodal Officer",
  contributor: "Contributor",
  reviewer: "Reviewer",
};

const INIT_USERS = [
  { id: 1, full_name: "Dr. Rao",    email: "dr.rao@inst.edu",    role: "department_nodal_officer", sections: ["Ayurvedic Principles", "Clinical Studies"],    status: "active" },
  { id: 2, full_name: "R. Menon",   email: "r.menon@inst.edu",   role: "contributor",              sections: ["Research Publications"],                       status: "active" },
  { id: 3, full_name: "M. Nair",    email: "m.nair@inst.edu",    role: "contributor",              sections: ["Lab Reports", "Annual Statistics"],            status: "active" },
  { id: 4, full_name: "Dr. Sharma", email: "sharma@inst.edu",    role: "reviewer",                 sections: ["Clinical Studies", "Patient Case Studies"],    status: "active" },
  { id: 5, full_name: "A. Pillai",  email: "a.pillai@inst.edu",  role: "contributor",              sections: ["Patient Case Studies"],                        status: "inactive" },
];

function validate(form, isEdit) {
  const errs = {};
  if (!form.full_name?.trim()) errs.full_name = "Full name is required.";
  if (!form.email?.trim())     errs.email     = "Email is required.";
  else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email.";
  if (!isEdit && !form.password?.trim()) errs.password = "Password is required.";
  if (!form.role) errs.role = "Select a role.";
  return errs;
}

function UserForm({ mode, entity, onSaved, onBack }) {
  const { lang } = useLanguage();
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    full_name: entity?.full_name  || "",
    email:     entity?.email      || "",
    password:  "",
    role:      entity?.role       || "",
    sections:  entity?.sections   || [],
    status:    entity?.status     || "active",
  });
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  const toggleSection = (sec) => {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(sec)
        ? f.sections.filter(s => s !== sec)
        : [...f.sections, sec],
    }));
  };

  const handleSubmit = async () => {
    const errs = validate(form, isEdit);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    onSaved(`User ${isEdit ? "updated" : "created"} successfully.`, form);
  };

  return (
    <FormScreen
      pageTitle={t("Department Users", lang)}
      formTitle={isEdit ? t("Edit User", lang) : t("Add New User", lang)}
      formSubtitle={isEdit ? `Updating profile for ${entity?.full_name}` : "Create a department user account"}
      icon="Users"
      iconBg={C.primaryLt}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? t("Save Changes", lang) : "Create User"}
    >
      {/* Full Name */}
      <div>
        <label style={S.label}>{t("Full Name", lang)}</label>
        <input value={form.full_name} onChange={e => set("full_name", e.target.value)}
          placeholder="e.g. Dr. Anand Rao"
          style={S.input(!!errors.full_name)} />
        {errors.full_name && <div style={S.errorText}>{errors.full_name}</div>}
      </div>

      {/* Email */}
      <div>
        <label style={S.label}>{t("Email", lang)}</label>
        <input value={form.email} onChange={e => set("email", e.target.value)}
          type="email" placeholder="user@institution.edu"
          style={S.input(!!errors.email)} />
        {errors.email && <div style={S.errorText}>{errors.email}</div>}
      </div>

      {/* Password (create only) */}
      {!isEdit && (
        <div>
          <label style={S.label}>{t("Password", lang)}</label>
          <input value={form.password} onChange={e => set("password", e.target.value)}
            type="password" placeholder="Temporary password"
            style={S.input(!!errors.password)} />
          {errors.password && <div style={S.errorText}>{errors.password}</div>}
        </div>
      )}

      {/* Role */}
      <div>
        <label style={S.label}>{t("Role", lang)}</label>
        <select value={form.role} onChange={e => set("role", e.target.value)}
          style={S.select(!!errors.role)}>
          <option value="">{t("Select role…", lang)}</option>
          {DEPT_ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {errors.role && <div style={S.errorText}>{errors.role}</div>}
      </div>

      {/* Assign Sections */}
      <div>
        <label style={S.label}>{t("Assign Sections", lang)}</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
          {DEPT_SECTIONS.map(sec => (
            <label key={sec} style={{ display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              border: `1.5px solid ${form.sections.includes(sec) ? "#059669" : "#e2e8f0"}`,
              background: form.sections.includes(sec) ? C.primaryLt : "#fff",
              transition: "all .12s" }}>
              <input type="checkbox" checked={form.sections.includes(sec)}
                onChange={() => toggleSection(sec)}
                style={{ width: 13, height: 13, cursor: "pointer", accentColor: C.primary }} />
              <span style={{ fontSize: 12, fontWeight: 500,
                color: form.sections.includes(sec) ? "#065f46" : "#1e293b" }}>{sec}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Account Status (edit only) */}
      {isEdit && (
        <div>
          <label style={S.label}>{t("Account Status", lang)}</label>
          <select value={form.status} onChange={e => set("status", e.target.value)}
            style={S.select(false)}>
            <option value="active">{t("Active", lang)}</option>
            <option value="inactive">{t("Inactive", lang)}</option>
          </select>
        </div>
      )}
    </FormScreen>
  );
}

function UserList({ users, onEdit, onDeactivate, filters, setFilters }) {
  const { lang } = useLanguage();
  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder={t("Search by name or email…", lang)}
          style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
        <select value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
          style={S.select(false)}>
          <option value="">{t("All Roles", lang)}</option>
          {DEPT_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={S.select(false)}>
          <option value="">{t("All Statuses", lang)}</option>
          <option value="active">{t("Active", lang)}</option>
          <option value="inactive">{t("Inactive", lang)}</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(5,150,105,0.06)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Email", "Role", "Sections", "Status", "Actions"].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "12px 16px", textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>
                  {t(h, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: C.textSub }}>
                {t("No users match the current filters.", lang)}
              </td></tr>
            ) : users.map((u, i) => (
              <tr key={u.id}
                onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                      color: "#fff", background: `hsl(${u.full_name.charCodeAt(0) * 53 % 360}, 55%, 52%)` }}>
                      {u.full_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.full_name}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{u.email}</td>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.text }}>{ROLE_LABELS[u.role] || u.role}</td>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {u.sections.slice(0, 2).map(s => (
                      <span key={s} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px",
                        borderRadius: 20, background: C.primaryLt, color: "#065f46" }}>
                        {s.split(" ")[0]}
                      </span>
                    ))}
                    {u.sections.length > 2 && (
                      <span style={{ fontSize: 10, color: C.textSub }}>+{u.sections.length - 2}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: STATUS_STYLE[u.status]?.bg, color: STATUS_STYLE[u.status]?.color }}>
                    {u.status === "active" ? t("Active", lang) : t("Inactive", lang)}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onEdit(u)}
                      style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
                        background: "#fff", color: C.primary, fontSize: 11, fontWeight: 600,
                        cursor: "pointer" }}>
                      {t("Edit", lang)}
                    </button>
                    <button onClick={() => onDeactivate(u.id)}
                      style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #fee2e2",
                        background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 600,
                        cursor: "pointer" }}>
                      {u.status === "active" ? t("Deactivate", lang) : t("Activate", lang)}
                    </button>
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

export default function DeptUsersPage() {
  const { lang } = useLanguage();
  const [users,     setUsers]     = useState(INIT_USERS);
  const [formView,  setFormView]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [filters,   setFilters]   = useState({ search: "", role: "", status: "" });
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleSaved = (msg, formData) => {
    if (formView.mode === "create") {
      setUsers(prev => [...prev, { ...formData, id: Date.now() }]);
    } else {
      setUsers(prev => prev.map(u => u.id === formView.entity.id ? { ...u, ...formData } : u));
    }
    setFormView(null);
    showToast(msg);
    setRefreshKey(k => k + 1);
  };

  const handleDeactivate = (id) => {
    setUsers(prev => prev.map(u =>
      u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u
    ));
    showToast("User status updated.");
  };

  const filteredUsers = users.filter(u => {
    if (filters.search && !u.full_name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !u.email.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.role   && u.role   !== filters.role)   return false;
    if (filters.status && u.status !== filters.status) return false;
    return true;
  });

  if (formView) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <UserForm
          mode={formView.mode}
          entity={formView.entity}
          onSaved={handleSaved}
          onBack={() => setFormView(null)}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
            background: C.primaryLt, borderRadius: 8, padding: "4px 12px", marginBottom: 12 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, textTransform: "uppercase", letterSpacing: 1 }}>
              {t("Department Admin", lang)}
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
            {t("Department Users", lang)}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Manage user accounts, roles, and section assignments for Samhita Siddhanta.
          </p>
        </div>
        <button onClick={() => setFormView({ mode: "create", entity: null })}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.primary,
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(5,150,105,0.3)", whiteSpace: "nowrap" }}>
          {t("+ New User", lang)}
        </button>
      </div>

      <UserList
        key={refreshKey}
        users={filteredUsers}
        onEdit={u => setFormView({ mode: "edit", entity: u })}
        onDeactivate={handleDeactivate}
        filters={filters}
        setFilters={setFilters}
      />
    </div>
  );
}
