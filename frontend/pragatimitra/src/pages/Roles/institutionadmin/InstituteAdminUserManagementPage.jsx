import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  User, UsersRound, MoreHorizontal, Power, PowerOff, Pencil, Plus,
} from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { S, Toast } from "../../../components/shared/formUtils";
import FormScreen from "../../../components/shared/FormScreen";
import { Select } from "../../../components/shared/ui";
import PageHeader from "../../../components/shared/PageHeader";
import { PageContainer, Button, Badge, EmptyState, DataTable, Dropdown, MenuItem } from "../../../ui";

const SLUG = "user-management";

/* ── Constants ─────────────────────────────────────────────────── */
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED"];

const ROLE_COLORS = {
  super_admin:      { bg: "#dbeafe", color: "#1d4ed8" },
  institute_admin:  { bg: "#ede9fe", color: "#6d28d9" },
  publication_cell: { bg: "#fce7f3", color: "#9d174d" },
  department_admin: { bg: "#d1fae5", color: "#065f46" },
  nodal_officer:    { bg: "#fee2e2", color: "#991b1b" },
  contributor:      { bg: "#dcfce7", color: "#166534" },
  reviewer:         { bg: "#eff6ff", color: "#1e40af" },
  directors_office: { bg: "#fdf4ff", color: "#7e22ce" },
  finance_admin:    { bg: "#fef9c3", color: "#854d0e" },
  hospital_admin:   { bg: "#fde8e8", color: "#b91c1c" },
};

/* Roles an institute admin may assign — super_admin and institute_admin
   are intentionally absent; backend enforces this independently. */
const INST_ADMIN_ALLOWED_ROLES = new Set([
  "department_admin", "contributor", "finance_admin", "hospital_admin",
  "nodal_officer", "reviewer", "publication_cell", "directors_office",
]);

const ROLE_DOMAINS = [
  { value: "academic", label: "Academic" },
  { value: "hospital", label: "Hospital" },
  { value: "finance",  label: "Finance"  },
];

function formatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name = "") {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ── Shared atoms ──────────────────────────────────────────────── */
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
  const tone = status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral";
  return <Badge tone={tone}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 32, height: 32, border: "3px solid #e2e8f0",
        borderTopColor: "#0891b2", borderRadius: "50%",
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
        autoComplete="new-password"
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

function LockedField({ label, value }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{
        ...S.input(false), display: "flex", alignItems: "center", gap: 8,
        background: "#f8fafc", color: "#475569", cursor: "not-allowed", userSelect: "none",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0891b2", flexShrink: 0 }} />
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

/* ── Pagination ─────────────────────────────────────────────────── */
function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  const btn  = (disabled) => ({
    padding: "5px 13px", borderRadius: 7, border: "1.5px solid #e2e8f0",
    background: disabled ? "#f8fafc" : "#fff", fontSize: 13, fontWeight: 600,
    color: disabled ? "#cbd5e1" : "#1e293b", cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          style={{ padding: "4px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, color: "#1e293b", background: "#fff", cursor: "pointer" }}
        >
          {[10, 25, 100, 500].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>{from}–{to} of {total}</span>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={btn(page <= 1)}>← Prev</button>
        <span style={{ fontSize: 13, color: "#475569" }}>{page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={btn(page >= totalPages)}>Next →</button>
      </div>
    </div>
  );
}

/* ── UserForm ────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  full_name: "", email: "", password: "",
  department_id: "", role_name: "", role_domain: "academic",
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

function UserForm({ mode, entity, onCreated, onSaved, onBack, apiFetch, institutionId, institutionName }) {
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? {
          full_name:      entity.full_name,
          email:          entity.email,
          department_id:  entity.department_id || "",
          account_status: entity.account_status,
          role_domain:    entity.role_domain || "academic",
        }
      : { ...EMPTY_FORM }
  );
  const [fieldErrs,         setFieldErrs]         = useState({});
  const [roles,             setRoles]             = useState([]);
  const [departments,       setDepartments]       = useState([]);
  const [institutionDomain, setInstitutionDomain] = useState("");
  const [loadingDepts,      setLoadingDepts]      = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [serverError,       setServerError]       = useState("");

  useEffect(() => {
    if (!isEdit) {
      apiFetch("/api/lookup/roles")
        .then((r) => r.json())
        .then((d) => { if (d.success) setRoles(d.roles.filter((r) => INST_ADMIN_ALLOWED_ROLES.has(r.name))); })
        .catch(() => {});
    }

    if (!institutionId) return;

    setLoadingDepts(true);
    apiFetch(`/api/lookup/departments?institution_id=${institutionId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setDepartments(d.departments); })
      .catch(() => {})
      .finally(() => setLoadingDepts(false));

    apiFetch(`/api/lookup/institution-domain?institution_id=${institutionId}`)
      .then((r) => r.json())
      .then((d) => { setInstitutionDomain(d.success && d.email_domain ? d.email_domain : ""); })
      .catch(() => {});
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
            department_id:  form.department_id || null,
            account_status: form.account_status,
            role_domain:    form.role_domain,
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
            department_id:  form.department_id || null,
            role_name:      form.role_name,
            role_domain:    form.role_domain,
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
      pageTitle="Users"
      formTitle={isEdit ? "Edit User" : "New User"}
      formSubtitle={isEdit ? entity.full_name : "Add a new institution-level user"}
      icon={<User size={20} color="#0891b2" strokeWidth={2} />}
      iconBg="#e0f2fe"
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
          autoComplete="off"
          placeholder={institutionDomain ? `e.g. arun@${institutionDomain}` : "e.g. arun@college.edu.in"}
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
        {fieldErrs.email
          ? <span style={S.errorText}>{fieldErrs.email}</span>
          : (!isEdit && institutionDomain && (
              <span style={{ fontSize: 11, color: "#0891b2", marginTop: 4, display: "block" }}>
                Must use @{institutionDomain}
              </span>
            ))
        }
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

      {/* Department + Role/Status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={S.label}>
            Department{" "}
            <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>(optional)</span>
          </label>
          <Select
            value={form.department_id}
            onChange={(e) => set("department_id", e.target.value)}
            disabled={loadingDepts}
          >
            <option value="">{loadingDepts ? "Loading…" : "— No Department —"}</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </Select>
        </div>

        {isEdit ? (
          <div>
            <label style={S.label}>Account Status</label>
            <Select
              value={form.account_status}
              onChange={(e) => set("account_status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </Select>
          </div>
        ) : (
          <div>
            <label style={S.label}>Role *</label>
            <Select
              hasError={!!fieldErrs.role_name}
              value={form.role_name}
              onChange={(e) => set("role_name", e.target.value)}
            >
              <option value="">— Select Role —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>{r.display_name}</option>
              ))}
            </Select>
            {fieldErrs.role_name && <span style={S.errorText}>{fieldErrs.role_name}</span>}
          </div>
        )}

        <div>
          <label style={S.label}>Role Domain</label>
          <Select
            value={form.role_domain}
            onChange={(e) => set("role_domain", e.target.value)}
          >
            {ROLE_DOMAINS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </Select>
        </div>
      </div>
    </FormScreen>
  );
}

/* ── UserList ─────────────────────────────────────────────────────── */
function UserList({ apiFetch, onEdit, institutionId, onToast }) {
  const { lang } = useLanguage();

  const [users,            setUsers]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState("");
  const [search,           setSearch]           = useState("");
  const [filterStatus,     setFilterStatus]     = useState("all");
  const [filterRole,       setFilterRole]       = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [toggling,         setToggling]         = useState(null);
  const [roles,            setRoles]            = useState([]);
  const [deptOptions,      setDeptOptions]      = useState([]);
  const [page,             setPage]             = useState(1);
  const [pageSize,         setPageSize]         = useState(25);

  useEffect(() => {
    apiFetch("/api/lookup/roles")
      .then((r) => r.json())
      .then((d) => { if (d.success) setRoles(d.roles.filter((r) => INST_ADMIN_ALLOWED_ROLES.has(r.name))); })
      .catch(() => {});

    if (institutionId) {
      apiFetch(`/api/lookup/departments?institution_id=${institutionId}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setDeptOptions(d.departments); })
        .catch(() => {});
    }
  }, [apiFetch, institutionId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const p = new URLSearchParams();
    if (filterRole)       p.set("role",          filterRole);
    if (filterDepartment) p.set("department_id", filterDepartment);
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
  }, [apiFetch, filterRole, filterDepartment]);

  useEffect(() => { setPage(1); }, [search, filterStatus, filterRole, filterDepartment]);

  const hasActiveFilters = !!(filterRole || filterDepartment);
  const clearFilters = () => { setFilterRole(""); setFilterDepartment(""); };

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
        onToast(`${user.full_name} ${next === "ACTIVE" ? "activated" : "deactivated"}.`);
      }
    } catch {}
    setToggling(null);
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q);
    const matchStatus =
      filterStatus === "all" || (u.account_status || "").toUpperCase() === filterStatus;
    return matchSearch && matchStatus;
  });

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <Spinner />;
  if (error) return (
    <div style={{ padding: 24, background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <>
      {/* Server-side filter row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Select
          fullWidth={false}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.name}>{r.display_name}</option>
          ))}
        </Select>

        <Select
          fullWidth={false}
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          style={{ minWidth: 190 }}
        >
          <option value="">All Departments</option>
          {deptOptions.map((d) => (
            <option key={d.department_id} value={d.department_id}>{d.name}</option>
          ))}
        </Select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0",
              background: "#fff", fontSize: 12, fontWeight: 600, color: "#64748b",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Search + status row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder={t("Search name or email…", lang)}
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
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </Select>
      </div>

      <DataTable
        minWidth={920}
        rows={paginated}
        rowKey="id"
        columns={[
          {
            key: "user", header: t("User", lang),
            render: (u) => (
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
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.full_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
              </div>
            ),
          },
          {
            key: "institution_name", header: t("Institution", lang), width: 180, ellipsis: true,
            render: (u) => <span style={{ fontSize: 13, color: "#475569" }}>{u.institution_name || "—"}</span>,
          },
          {
            key: "department_name", header: t("Department", lang), width: 160, ellipsis: true,
            render: (u) => <span style={{ fontSize: 13, color: "#475569" }}>{u.department_name || "—"}</span>,
          },
          {
            key: "roles", header: t("Role(s)", lang), width: 200,
            render: (u) => (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(u.roles || []).length > 0
                  ? u.roles.map((r) => <RoleBadge key={r.name} {...r} />)
                  : <span style={{ fontSize: 12, color: "#cbd5e1" }}>No role</span>}
              </div>
            ),
          },
          {
            key: "status", header: t("Status", lang), width: 120,
            render: (u) => <StatusDot status={u.account_status} />,
          },
          {
            key: "last_login_at", header: t("Last Login", lang), width: 130,
            render: (u) => <span style={{ fontSize: 12, color: "#94a3b8" }}>{formatDate(u.last_login_at)}</span>,
          },
          {
            key: "actions", header: t("Actions", lang), align: "right", width: 80,
            render: (u) => {
              const busy     = toggling === u.id;
              const isActive = u.account_status === "ACTIVE";
              return (
                <Dropdown
                  align="right"
                  width={170}
                  button={({ toggle }) => (
                    <Button variant="ghost" iconOnly icon={<MoreHorizontal size={18} strokeWidth={2} />} onClick={toggle} aria-label="Row actions" />
                  )}
                >
                  <MenuItem icon={<Pencil size={16} strokeWidth={1.9} />} onClick={() => onEdit(u)}>
                    {t("Edit", lang)}
                  </MenuItem>
                  {isActive ? (
                    <MenuItem icon={<PowerOff size={16} strokeWidth={1.9} />} danger disabled={busy} onClick={() => toggleStatus(u)}>
                      {busy ? "…" : t("Deactivate", lang)}
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Power size={16} strokeWidth={1.9} />} disabled={busy} onClick={() => toggleStatus(u)}>
                      {busy ? "…" : t("Activate", lang)}
                    </MenuItem>
                  )}
                </Dropdown>
              );
            },
          },
        ]}
        empty={
          <EmptyState
            icon={<UsersRound size={26} strokeWidth={1.6} />}
            title="No users match your filters."
            description="Adjust the filters or search to see more users."
          />
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}

/* ── Main Export ─────────────────────────────────────────────────── */
export default function InstituteAdminUserManagementPage() {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const { lang }     = useLanguage();
  const navigate     = useNavigate();
  const location     = useLocation();

  const [refreshKey, setRefreshKey] = useState(0);
  const [toast,      setToast]      = useState(null);

  const isCreate = location.pathname.endsWith("/create");
  const isEdit   = location.pathname.endsWith("/edit");
  const listPath = `/${SLUG}`;
  const entity   = isEdit ? (location.state?.entity ?? null) : null;

  const institutionId   = user?.institutionId   || "";
  const institutionName = user?.institutionName || "Your Institution";

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (isEdit && !entity) return <Navigate to={listPath} replace />;

  if (isCreate || isEdit) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <UserForm
          key={isEdit ? "edit" : "create"}
          mode={isEdit ? "edit" : "create"}
          entity={entity}
          apiFetch={apiFetch}
          institutionId={institutionId}
          institutionName={institutionName}
          onCreated={(msg) => { navigate(listPath); showToast(msg); setRefreshKey((k) => k + 1); }}
          onSaved={(msg)   => { navigate(listPath); showToast(msg); setRefreshKey((k) => k + 1); }}
          onBack={() => navigate(listPath)}
        />
      </>
    );
  }

  return (
    <PageContainer>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Institute", lang), t("Users", lang)]}
        title={t("Institution Users", lang)}
        description={
          <>
            Manage users belonging to{" "}
            <strong style={{ color: "#0891b2" }}>{institutionName}</strong>
            {" — "}Super Admin and Institute Admin accounts are not shown here.
          </>
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus size={17} strokeWidth={2} />}
            onClick={() => navigate(`${listPath}/create`)}
          >
            {t("New User", lang)}
          </Button>
        }
      />

      <UserList
        key={refreshKey}
        apiFetch={apiFetch}
        institutionId={institutionId}
        onEdit={(u) => navigate(`${listPath}/edit`, { state: { entity: u } })}
        onToast={showToast}
      />
    </PageContainer>
  );
}
