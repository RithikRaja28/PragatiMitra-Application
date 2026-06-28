import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";

const SLUG = "user-management";
import { S, Toast } from "../../../components/shared/formUtils";
import FormScreen from "../../../components/shared/FormScreen";
import { PageContainer, PageHeader, Toolbar, SearchInput, Button, Card, ErrorState } from "../../../ui";
import { ActionButton, ActionButtonGroup } from "../../../components/shared/ActionButtons";
import { StatusBadge, Select } from "../../../components/shared/ui";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

/* ── Constants ──────────────────────────────────────────────────── */
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];

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
  nodal_officer:      { bg: "#fee2e2", color: "#991b1b" },
  contributor:        { bg: "#dcfce7", color: "#166534" },
  reviewer:           { bg: "#eff6ff", color: "#1e40af" },
  directors_office:   { bg: "#fdf4ff", color: "#7e22ce" },
};

const ROLE_LABELS = {
  department_nodal_officer: "Nodal Officer",
  contributor: "Contributor",
  reviewer: "Reviewer",
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

function PasswordInput({ value, onChange, hasError, lang }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        autoComplete="new-password"
        placeholder={t("Min 8 characters", lang)}
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

/* ── Locked field chip (non-editable institution / department) ───── */
function LockedField({ label, value, accentColor = ACCENT, lang }) {
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
          {t("Auto-assigned", lang)}
        </span>
      </div>
    </div>
  );
}

/* ── UserForm ────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  full_name: "", email: "", password: "", role_name: "",
};

function validateForm(form, isEdit, institutionDomain) {
  const errs = {};
  if (!form.full_name.trim())          errs.full_name = "Full name is required.";
  if (!form.email.trim())              errs.email     = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
                                       errs.email     = "Enter a valid email address.";
  else if (!isEdit && institutionDomain) {
    const emailDomain = form.email.trim().split("@")[1]?.toLowerCase() || "";
    if (emailDomain !== institutionDomain)
      errs.email = `Invalid email domain. Please use your institution domain (@${institutionDomain}).`;
  }
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
  const { lang } = useLanguage();
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
  const [fieldErrs,         setFieldErrs]         = useState({});
  const [roles,             setRoles]             = useState([]);
  const [institutionDomain, setInstitutionDomain] = useState("");
  const [saving,            setSaving]            = useState(false);
  const [serverError,       setServerError]       = useState("");

  useEffect(() => {
    if (!isEdit) {
      apiFetch("/api/lookup/roles")
        .then((r) => r.json())
        .then((d) => { if (d.success) setRoles(d.roles.filter((r) => r.name !== "nodal_officer")); })
        .catch(() => {});
    }

    if (institutionId) {
      apiFetch(`/api/lookup/institution-domain?institution_id=${institutionId}`)
        .then((r) => r.json())
        .then((d) => { setInstitutionDomain(d.success && d.email_domain ? d.email_domain : ""); })
        .catch(() => {});
    }
  }, [apiFetch, isEdit, institutionId]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setServerError("");
    if (key === "email" && !isEdit && institutionDomain && value.includes("@")) {
      const typed = value.split("@")[1]?.toLowerCase() || "";
      setFieldErrs((e) => ({
        ...e,
        email: typed && typed !== institutionDomain
          ? `Invalid email domain. Please use your institution domain (@${institutionDomain}).`
          : undefined,
      }));
    } else {
      setFieldErrs((e) => ({ ...e, [key]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateForm(form, isEdit, institutionDomain);
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
      pageTitle={t("User Management", lang)}
      formTitle={isEdit ? t("Edit User", lang) : t("New User", lang)}
      formSubtitle={isEdit ? entity.full_name : t("Add a new user to your department", lang)}
      icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
      iconBg="#d1fae5"
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
          placeholder={t("e.g. Arun Kumar", lang)}
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
          autoComplete="off"
          placeholder={institutionDomain ? `e.g. arun@${institutionDomain}` : t("e.g. arun@aiia.edu.in", lang)}
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
        {fieldErrs.email
          ? <span style={S.errorText}>{fieldErrs.email}</span>
          : (!isEdit && institutionDomain && (
              <span style={{ fontSize: 11, color: ACCENT, marginTop: 4, display: "block" }}>
                Must use @{institutionDomain}
              </span>
            ))
        }
      </div>

      {/* Password — create only */}
      {!isEdit && (
        <div>
          <label style={S.label}>{t("Temporary Password *", lang)}</label>
          <PasswordInput
            value={form.password}
            onChange={(v) => set("password", v)}
            hasError={!!fieldErrs.password}
            lang={lang}
          />
          {fieldErrs.password
            ? <span style={S.errorText}>{fieldErrs.password}</span>
            : <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                {t("Min 8 characters. User will be prompted to change on first login.", lang)}
              </span>
          }
        </div>
      )}

      {/* Institution — locked */}
      <LockedField label={t("Institution", lang)} value={institutionName} lang={lang} />

      {/* Department — locked */}
      <LockedField label={t("Department", lang)} value={departmentName} lang={lang} />

      {/* Role (create) or Account Status (edit) */}
      <div>
        {isEdit ? (
          <>
            <label style={S.label}>{t("Account Status", lang)}</label>
            <Select
              value={form.account_status}
              onChange={(e) => set("account_status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(s.charAt(0) + s.slice(1).toLowerCase(), lang)}</option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <label style={S.label}>{t("Role *", lang)}</label>
            <Select
              hasError={!!fieldErrs.role_name}
              value={form.role_name}
              onChange={(e) => set("role_name", e.target.value)}
            >
              <option value="">{t("— Select Role —", lang)}</option>
              {/* Dept admins / nodal officers may only assign the Contributor
                  role — every other role is intentionally hidden here. */}
              {roles
                .filter((r) => r.name === "contributor")
                .map((r) => (
                  <option key={r.id} value={r.name}>{r.display_name}</option>
                ))}
            </Select>
            {fieldErrs.role_name && <span style={S.errorText}>{fieldErrs.role_name}</span>}
          </>
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
    const q = search.toLowerCase();
    const matchSearch =
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || (u.account_status || "") === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <Spinner />;
  if (error) return (
    <Card padding={0}>
      <ErrorState title={t("Couldn’t load users", lang)} description={error} />
    </Card>
  );

  return (
    <>
      {/* Role filter row */}
      <Toolbar style={{ marginBottom: 12 }}>
        <Select
          fullWidth={false}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ minWidth: 180 }}
        >
        <option value="">{t("All Roles", lang)}</option>
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
        </Select>

        {filterRole && (
          <Button variant="secondary" onClick={() => setFilterRole("")}>Clear Filter</Button>
        )}
      </Toolbar>

      {/* Search + status filter */}
      <Toolbar>
        <SearchInput
          placeholder={t("Search by name or email…", lang)}
          value={search}
          onChange={setSearch}
          style={{ flex: 1, width: "auto" }}
        />
        <Select
          fullWidth={false}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ minWidth: 150 }}
        >
          <option value="all">{t("All Status", lang)}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{t(s.charAt(0) + s.slice(1).toLowerCase(), lang)}</option>
          ))}
        </Select>
      </Toolbar>

      {/* Table */}
      <Card padding={0} style={{ overflow: "hidden" }}>
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
      </Card>
    </>
  );
}

/* ── Main Export ─────────────────────────────────────────────────── */
export default function DepartmentAdminUserManagementPage() {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const { lang }     = useLanguage();
  const navigate     = useNavigate();
  const location     = useLocation();

  const isCreate = location.pathname.endsWith("/create");
  const isEdit   = location.pathname.endsWith("/edit");
  const listPath = `/${SLUG}`;
  const entity   = isEdit ? (location.state?.entity ?? null) : null;

  const [toast, setToast] = useState(location.state?.toast ?? null);

  const institutionId   = user?.institutionId   || "";
  const institutionName = user?.institutionName || "Your Institution";
  const departmentId    = user?.departmentId    || "";
  const departmentName  = user?.departmentName  || "Your Department";

  if (isEdit && !entity) return <Navigate to={listPath} replace />;

  if (isCreate || isEdit) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <UserForm
          mode={isEdit ? "edit" : "create"}
          entity={entity}
          apiFetch={apiFetch}
          institutionId={institutionId}
          institutionName={institutionName}
          departmentId={departmentId}
          departmentName={departmentName}
          onCreated={(msg) => navigate(listPath, { state: { toast: { message: msg, type: "success" } } })}
          onSaved={(msg)   => navigate(listPath, { state: { toast: { message: msg, type: "success" } } })}
          onBack={() => navigate(listPath)}
        />
      </>
    );
  }

  return (
    <PageContainer>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), t("Users", lang)]}
        title={t("Department Users", lang)}
        description={
          <>
            {t("Manage users in", lang)}{" "}
            <span style={{ color: ACCENT, fontWeight: 600 }}>{departmentName}</span>
            {institutionName && (
              <>{" · "}<span style={{ color: "#64748b", fontWeight: 500 }}>{institutionName}</span></>
            )}
          </>
        }
        actions={
          <ActionButton
            variant="primary"
            onClick={() => navigate(`${listPath}/create`)}
            style={{ height: 38 }}
          >
            {t("+ New User", lang)}
          </ActionButton>
        }
      />

      <UserList
        apiFetch={apiFetch}
        onEdit={(u) => navigate(`${listPath}/edit`, { state: { entity: u } })}
      />
    </PageContainer>
  );
}