import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import FormScreen from "../../../components/shared/FormScreen";
import {
  PageHeader, Button, Badge, EmptyState,
  DataTable, Dropdown, MenuItem,
} from "../../../ui";
import { Building, Pencil, Power, PowerOff, MoreHorizontal, Plus } from "lucide-react";
import { S, Toast, isAuthError, formatDate } from "../../../components/shared/formUtils";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

/* ─── Department Form ────────────────────────────────────────────
   Institution is always locked to the logged-in admin's institution.
   Create mode → locked institution display.
   Edit mode   → status selector.
─────────────────────────────────────────────────────────────── */
function DepartmentForm({
  mode,
  entity,
  institutionId,
  institutionName,
  onCreated,
  onSaved,
  onBack,
}) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? { name: entity.name || "", name_hi: entity.name_hi || "", code: entity.code || "", status: entity.status || "ACTIVE" }
      : { name: "", name_hi: "", code: "" }
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  function clientValidate() {
    const errs = {};
    if (!form.name.trim()) errs.name = t("Department name is required.", lang);
    if (!form.code.trim()) errs.code = t("Department code is required.", lang);
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim()))
      errs.code = "Only letters, digits, hyphens, and underscores allowed.";
    if (isEdit && !["ACTIVE", "INACTIVE"].includes(form.status))
      errs.status = "Status must be Active or Inactive.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientValidate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = isEdit
        ? await apiFetch(`/api/departments/${entity.department_id}`, {
            method: "PUT",
            body: JSON.stringify({
              name:    form.name.trim(),
              name_hi: form.name_hi.trim() || undefined,
              code:    form.code.trim().toUpperCase(),
              status:  form.status,
            }),
          })
        : await apiFetch("/api/departments", {
            method: "POST",
            body: JSON.stringify({
              name:           form.name.trim(),
              name_hi:        form.name_hi.trim() || undefined,
              code:           form.code.trim().toUpperCase(),
              institution_id: institutionId,
            }),
          });

      const data = await res.json();
      if (data.success) {
        if (isEdit) onSaved(data.message);
        else        onCreated(data.message);
      } else if (data.errors) {
        setFieldErrors(data.errors);
      } else {
        setSubmitError(data.message || `Failed to ${isEdit ? "update" : "create"} department.`);
      }
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const goingInactive = isEdit && entity.status === "ACTIVE" && form.status === "INACTIVE";

  return (
    <FormScreen
      pageTitle={t("Departments", lang)}
      formTitle={isEdit ? t("Edit Department", lang) : t("New Department", lang)}
      formSubtitle={isEdit ? "Update name, code, or status." : "Fill in the details below to add a department."}
      icon={isEdit ? <Pencil size={20} color="#d97706" strokeWidth={2} /> : <Building size={20} color="#2563eb" strokeWidth={2} />}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? t("Save Changes", lang) : t("Create Department", lang)}
      submitError={submitError}
    >
      {/* Institution — locked read-only display (create mode only) */}
      {!isEdit && (
        <div>
          <label style={S.label}>{t("Institution", lang)}</label>
          <div style={{
            ...S.input(false),
            display: "flex", alignItems: "center", gap: 8,
            background: "#f8fafc", color: "#475569",
            cursor: "not-allowed", userSelect: "none",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
            {institutionName || "—"}
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Your institution
            </span>
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label style={S.label}>{t("Department Name", lang)}</label>
        <input
          ref={nameRef}
          type="text"
          placeholder="e.g. Computer Science"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          disabled={submitting}
          maxLength={120}
          style={S.input(!!fieldErrors.name)}
        />
        {fieldErrors.name && <div style={S.errorText}>{fieldErrors.name}</div>}
      </div>

      {/* Hindi name */}
      <div>
        <label style={S.label}>विभाग का नाम (हिंदी)</label>
        <input
          type="text"
          placeholder="e.g. कंप्यूटर विज्ञान"
          value={form.name_hi}
          onChange={(e) => set("name_hi", e.target.value)}
          disabled={submitting}
          maxLength={120}
          style={{ ...S.input(false), fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Optional — used in Hindi exports.
        </div>
      </div>

      {/* Code */}
      <div>
        <label style={S.label}>{t("Department Code", lang)}</label>
        <input
          type="text"
          placeholder="e.g. CS or COMP_SCI"
          value={form.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          disabled={submitting}
          maxLength={20}
          style={{ ...S.input(!!fieldErrors.code), fontFamily: "monospace", letterSpacing: 1 }}
        />
        {fieldErrors.code ? (
          <div style={S.errorText}>{fieldErrors.code}</div>
        ) : (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {t("Auto-uppercased.", lang)} Letters, digits, hyphens, underscores only.
          </div>
        )}
      </div>

      {/* Status (edit only) */}
      {isEdit && (
        <div>
          <label style={S.label}>{t("Status", lang)}</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.status)}
          >
            <option value="ACTIVE">{t("Active", lang)}</option>
            <option value="INACTIVE">{t("Inactive", lang)}</option>
          </select>
          {fieldErrors.status && <div style={S.errorText}>{fieldErrors.status}</div>}
          {goingInactive && (
            <div style={{
              marginTop: 8, padding: "8px 12px",
              background: "#fffbeb", border: "1px solid #fcd34d",
              borderRadius: 8, fontSize: 12, color: "#92400e", lineHeight: 1.5,
            }}>
              Deactivating will fail unless every member of this department is already inactive.
            </div>
          )}
        </div>
      )}
    </FormScreen>
  );
}

/* ─── Styled select (filter bar only) ───────────────────────── */
function StyledSelect({ value, onChange, children, minWidth = 180 }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...S.select(false), width: "auto", minWidth }}
    >
      {children}
    </select>
  );
}

/* ─── Pagination ─────────────────────────────────────────────── */
function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          style={{ padding: "4px 8px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#1e293b", background: "#fff", cursor: "pointer" }}
        >
          {[10, 25, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 13, color: "#64748b" }}>
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {[
          { label: "← Prev", disabled: page <= 1, onClick: () => onPage(page - 1) },
          { label: "Next →", disabled: page >= totalPages, onClick: () => onPage(page + 1) },
        ].map(({ label, disabled, onClick }) => (
          <button key={label} onClick={onClick} disabled={disabled} style={{
            padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0",
            background: "#fff", fontSize: 13, fontWeight: 600,
            color: disabled ? "#cbd5e1" : "#1e293b",
            cursor: disabled ? "not-allowed" : "pointer",
          }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function InstituteAdminDepartmentPage() {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const { lang }     = useLanguage();

  const institutionId   = user?.institutionId   || "";
  const institutionName = user?.institutionName || "Your Institution";

  const [departments,  setDepartments]  = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadError,    setLoadError]    = useState(null);

  const [formView,   setFormView]   = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [toast,     setToast]  = useState(null);
  const toastTimer             = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), type === "error" ? 5500 : 3000);
  }, []);

  useEffect(() => { setPage(1); }, [statusFilter]);

  /* ── Load departments for this institution ── */
  const fetchDepartments = useCallback(async () => {
    if (!institutionId) return;
    setLoadingDepts(true);
    setLoadError(null);
    setDepartments([]);
    try {
      const res  = await apiFetch(`/api/departments?institution_id=${institutionId}`);
      const data = await res.json();
      if (data.success) {
        setDepartments(data.data);
      } else {
        setLoadError(data.message || "Failed to load departments.");
      }
    } catch (err) {
      if (!isAuthError(err)) setLoadError("Failed to load departments. Please refresh the page.");
    } finally {
      setLoadingDepts(false);
    }
  }, [apiFetch, institutionId]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  /* ── Quick toggle Active ↔ Inactive ── */
  async function handleToggleStatus(dept) {
    const nextStatus = dept.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(dept.department_id);
    try {
      const res = await apiFetch(`/api/departments/${dept.department_id}`, {
        method: "PUT",
        body: JSON.stringify({ name: dept.name, name_hi: dept.name_hi || undefined, code: dept.code, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchDepartments();
      } else {
        showToast(
          data.message || (nextStatus === "INACTIVE" ? "Failed to deactivate department." : "Failed to activate department."),
          "error"
        );
      }
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to update department status.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  /* ── Callbacks from DepartmentForm ── */
  function handleCreated(message) { setFormView(null); showToast(message, "success"); fetchDepartments(); }
  function handleSaved(message)   { setFormView(null); showToast(message, "success"); fetchDepartments(); }

  /* ── Render form screen ── */
  if (formView) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <DepartmentForm
          mode={formView.mode}
          entity={formView.entity}
          institutionId={institutionId}
          institutionName={institutionName}
          onCreated={handleCreated}
          onSaved={handleSaved}
          onBack={() => setFormView(null)}
        />
      </>
    );
  }

  /* ── List view ── */
  const filteredDepts =
    statusFilter === "ALL"
      ? departments
      : departments.filter((d) => d.status === statusFilter);

  const totalPages = Math.max(1, Math.ceil(filteredDepts.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filteredDepts.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Header ── */}
      <PageHeader
        breadcrumb={[t("Home", lang), t("Institute", lang), t("Departments", lang)]}
        title={t("Departments", lang)}
        description={<>Manage departments in <span style={{ color: "#059669", fontWeight: 600 }}>{institutionName}</span>.</>}
        actions={institutionId && !loadError && (
          <Button variant="primary" icon={<Plus size={17} strokeWidth={2} />} onClick={() => setFormView({ mode: "create", entity: null })}>
            {t("New Department", lang)}
          </Button>
        )}
      />

      {/* Load error */}
      {loadError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 20px", color: "#b91c1c", fontSize: 14, marginBottom: 24 }}>
          {loadError}
        </div>
      )}

      {/* ── Filter bar ── */}
      {!loadError && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {loadingDepts ? (
              t("Loading departments…", lang)
            ) : (
              <>
                <strong style={{ color: "#1e293b" }}>{filteredDepts.length}</strong>{" "}
                {statusFilter === "ALL"
                  ? "department(s)"
                  : `${statusFilter.toLowerCase()} department(s)`}
                {" "}in{" "}
                <strong style={{ color: "#1e293b" }}>{institutionName}</strong>
              </>
            )}
          </div>

          <StyledSelect value={statusFilter} onChange={setStatusFilter} minWidth={150}>
            <option value="ALL">{t("All Statuses", lang)}</option>
            <option value="ACTIVE">{t("Active", lang)}</option>
            <option value="INACTIVE">{t("Inactive", lang)}</option>
          </StyledSelect>
        </div>
      )}

      {/* ── Departments table ── */}
      <DataTable
        minWidth={880}
        loading={loadingDepts}
        rows={paginated}
        rowKey="department_id"
        columns={[
          {
            key: "code", header: t("Code", lang), width: 120,
            render: (dept) => (
              <span style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, color: dept.status === "ACTIVE" ? "#2563eb" : "#94a3b8" }}>
                {dept.code || "—"}
              </span>
            ),
          },
          {
            key: "name", header: t("Department Name", lang), ellipsis: true,
            render: (dept) => <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b" }}>{dept.name}</span>,
          },
          {
            key: "created_at", header: t("Creation Date", lang), width: 180,
            render: (dept) => <span style={{ fontSize: 12.5, color: "#64748b" }}>{t("Since", lang)} {formatDate(dept.created_at, lang)}</span>,
          },
          {
            key: "member_count", header: t("Members", lang), width: 110,
            render: (dept) => <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b" }}>{Number(dept.member_count)}</span>,
          },
          {
            key: "status", header: t("Status", lang), width: 120,
            render: (dept) => (
              <Badge tone={dept.status === "ACTIVE" ? "success" : "neutral"}>
                {dept.status === "ACTIVE" ? t("Active", lang) : t("Inactive", lang)}
              </Badge>
            ),
          },
          {
            key: "actions", header: t("Actions", lang), align: "right", width: 90,
            render: (dept) => {
              const isActive = dept.status === "ACTIVE";
              const busy = togglingId === dept.department_id;
              return (
                <Dropdown
                  align="right"
                  width={200}
                  button={({ toggle }) => (
                    <Button variant="ghost" iconOnly icon={<MoreHorizontal size={18} strokeWidth={2} />} onClick={toggle} aria-label="Row actions" />
                  )}
                >
                  <MenuItem icon={<Pencil size={16} strokeWidth={1.9} />} onClick={() => setFormView({ mode: "edit", entity: dept })}>
                    {t("Edit", lang)}
                  </MenuItem>
                  {isActive ? (
                    <MenuItem icon={<PowerOff size={16} strokeWidth={1.9} />} danger disabled={busy} onClick={() => handleToggleStatus(dept)}>
                      {busy ? "…" : t("Deactivate", lang)}
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Power size={16} strokeWidth={1.9} />} disabled={busy} onClick={() => handleToggleStatus(dept)}>
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
            icon={<Building size={26} strokeWidth={1.6} />}
            title={statusFilter !== "ALL" ? `No ${statusFilter.toLowerCase()} departments` : t("No departments yet", lang)}
            description={
              statusFilter === "ALL"
                ? t('Click "New Department" to add the first one.', lang)
                : t('Try switching the filter to "All Statuses".', lang)
            }
            action={statusFilter === "ALL" && institutionId && !loadError
              ? <Button variant="primary" icon={<Plus size={16} strokeWidth={2} />} onClick={() => setFormView({ mode: "create", entity: null })}>{t("New Department", lang)}</Button>
              : undefined
            }
          />
        }
      />

      {/* ── Pagination ── */}
      {!loadingDepts && filteredDepts.length > pageSize && (
        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={filteredDepts.length}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      )}
    </div>
  );
}
