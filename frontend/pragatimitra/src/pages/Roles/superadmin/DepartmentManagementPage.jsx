import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building, Pencil, MoreHorizontal, Power, PowerOff,
  Plus, Upload, Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import FormScreen from "../../../components/shared/FormScreen";
import FormWizard, { ReviewGroup, ReviewItem } from "../../../components/shared/FormWizard";
import ImportWizard from "../../../components/shared/ImportWizard";
import { S, Toast, isAuthError, formatDate } from "../../../components/shared/formUtils";
import PageHeader from "../../../components/shared/PageHeader";
import { Button, Badge, EmptyState, DataTable, Dropdown, MenuItem, MenuLabel } from "../../../ui";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ─── Department Form (create + edit) ───────────────────────────
   Rendered as a full screen instead of an overlay modal.
   mode === 'create' → shows institution selector, no status field
   mode === 'edit'   → shows status dropdown, no institution selector
─────────────────────────────────────────────────────────────── */
function DepartmentForm({
  mode,
  entity,
  institutions,
  defaultInstitutionId,
  onCreated,
  onSaved,
  onBack,
}) {
  const { lang } = useLanguage();
  const { apiFetch } = useApi();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? { name: entity.name || "", name_hi: entity.name_hi || "", code: entity.code || "", status: entity.status || "ACTIVE" }
      : {
          name: "",
          name_hi: "",
          code: "",
          institution_id: defaultInstitutionId || institutions[0]?.institution_id || "",
        }
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  function computeErrors() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Department name is required.";
    if (!form.code.trim()) errs.code = "Department code is required.";
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim()))
      errs.code = "Only letters, digits, hyphens, and underscores allowed.";
    if (!isEdit && !form.institution_id) errs.institution_id = "Please select an institution.";
    if (isEdit && !["ACTIVE", "INACTIVE"].includes(form.status))
      errs.status = "Status must be Active or Inactive.";
    return errs;
  }

  /* Fields owned by each create-wizard step (only step 0 collects input). */
  const STEP_FIELDS = [["institution_id", "name", "code"]];

  function validateStep(s) {
    const errs = computeErrors();
    const stepErrs = {};
    (STEP_FIELDS[s] || []).forEach((f) => { if (errs[f]) stepErrs[f] = errs[f]; });
    if (Object.keys(stepErrs).length) {
      setFieldErrors((prev) => ({ ...prev, ...stepErrs }));
      return false;
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = computeErrors();
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      if (!isEdit) {
        const bad = STEP_FIELDS.findIndex((fields) => fields.some((f) => errs[f]));
        if (bad >= 0) setStep(bad);
      }
      return;
    }
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
              institution_id: form.institution_id,
            }),
          });
      const data = await res.json();
      if (data.success) {
        if (isEdit) onSaved(data.message);
        else onCreated(form.institution_id, data.message);
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

  /* ── Field blocks (shared by the edit FormScreen and the create wizard) ── */
  const fldInstitution = !isEdit && (
    <div>
      <label style={S.label}>{t("Institution", lang)}</label>
      <select
        value={form.institution_id}
        onChange={(e) => set("institution_id", e.target.value)}
        disabled={submitting}
        style={S.select(!!fieldErrors.institution_id)}
      >
        {institutions.map((inst) => (
          <option key={inst.institution_id} value={inst.institution_id}>
            {inst.institution_name}
          </option>
        ))}
      </select>
      {fieldErrors.institution_id && (
        <div style={S.errorText}>{fieldErrors.institution_id}</div>
      )}
    </div>
  );

  const fldName = (
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
  );

  const fldNameHi = (
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
  );

  const fldCode = (
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
  );

  const fldStatus = isEdit && (
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
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            fontSize: 12,
            color: "#92400e",
            lineHeight: 1.5,
          }}
        >
          Deactivating will fail unless every member of this department is already inactive.
        </div>
      )}
    </div>
  );

  /* ── Edit: single-page form ── */
  if (isEdit) {
    return (
      <FormScreen
        pageTitle={t("Departments", lang)}
        formTitle={t("Edit Department", lang)}
        formSubtitle="Update name, code, or status."
        icon={<Pencil size={20} color="#d97706" strokeWidth={2} />}
        iconBg="#fef3c7"
        onBack={onBack}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={t("Save Changes", lang)}
        submitError={submitError}
      >
        {fldName}
        {fldNameHi}
        {fldCode}
        {fldStatus}
      </FormScreen>
    );
  }

  /* ── Create: multi-step wizard ── */
  const selectedInst = institutions.find((i) => String(i.institution_id) === String(form.institution_id));

  return (
    <FormWizard
      pageTitle={t("Departments", lang)}
      formTitle="Create Department"
      formSubtitle="Create a department within the institution."
      icon={<Building size={20} color="#2563eb" strokeWidth={2} />}
      iconBg="#eff6ff"
      steps={[t("Department Details", lang), t("Review & Create", lang)]}
      step={step}
      onStepChange={setStep}
      canAdvance={validateStep}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create Department"
      submitError={submitError}
    >
      {(s) =>
        s === 0 ? (
          <>
            {fldInstitution}
            {fldName}
            {fldNameHi}
            {fldCode}
          </>
        ) : (
          <ReviewGroup title={t("Department Details", lang)}>
            <ReviewItem label={t("Institution", lang)} value={selectedInst?.institution_name} />
            <ReviewItem label={t("Department Name", lang)} value={form.name} />
            {form.name_hi && <ReviewItem label="विभाग का नाम (हिंदी)" value={form.name_hi} />}
            <ReviewItem label={t("Department Code", lang)} value={form.code} />
          </ReviewGroup>
        )
      }
    </FormWizard>
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

/* ─── Icon-only, viewport-aware export menu (shared Dropdown) ─── */
function ExportMenu({ selectedInstitutionId }) {
  function triggerDownload(url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const exportUrl = selectedInstitutionId
    ? `${API_BASE}/api/departments/export?institution_id=${selectedInstitutionId}`
    : `${API_BASE}/api/departments/export`;

  return (
    <Dropdown
      align="right"
      width={240}
      button={({ toggle }) => (
        <Button variant="secondary" iconOnly icon={<Download size={18} strokeWidth={1.9} />} onClick={toggle} aria-label="Export" title="Export" />
      )}
    >
      <MenuLabel>Export</MenuLabel>
      <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={1.9} />} onClick={() => triggerDownload(exportUrl)}>Export Departments (.xlsx)</MenuItem>
      <MenuItem icon={<FileText size={16} strokeWidth={1.9} />} onClick={() => triggerDownload(`${API_BASE}/api/departments/export/sample`)}>Download Import Template</MenuItem>
    </Dropdown>
  );
}

/* ─── Pagination ─────────────────────────────────────────────── */
function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 20,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          style={{
            padding: "4px 8px",
            borderRadius: 7,
            border: "1.5px solid #e2e8f0",
            fontSize: 13,
            color: "#1e293b",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {[10, 25, 100, 500].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 13, color: "#64748b" }}>
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            fontSize: 13,
            fontWeight: 600,
            color: page <= 1 ? "#cbd5e1" : "#1e293b",
            cursor: page <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ← Prev
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            fontSize: 13,
            fontWeight: 600,
            color: page >= totalPages ? "#cbd5e1" : "#1e293b",
            cursor: page >= totalPages ? "not-allowed" : "pointer",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function DepartmentManagementPage() {
  const { lang } = useLanguage();
  const { apiFetch } = useApi();

  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [institutionsError, setInstitutionsError] = useState(null);

  /* formView: null = list, { mode: 'create'|'edit', entity } = form screen */
  const [formView, setFormView] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  /* Pagination */
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(
      () => setToast(null),
      type === "error" ? 5500 : 3000
    );
  }, []);

  /* Reset to page 1 when filter changes — MUST be before any early return */
  useEffect(() => { setPage(1); }, [statusFilter, selectedInstitutionId]);

  /* ── Load institutions once ── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingInstitutions(true);
      setInstitutionsError(null);
      try {
        const res = await apiFetch("/api/departments/institutions");
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data.length > 0) {
          setInstitutions(data.data);
          setSelectedInstitutionId(data.data[0].institution_id);
        } else if (data.success) {
          setInstitutions([]);
          setInstitutionsError("No institutions found in the system.");
        } else {
          setInstitutionsError(data.message || "Failed to load institutions.");
        }
      } catch (err) {
        if (!cancelled && !isAuthError(err)) {
          setInstitutionsError("Failed to load institutions. Please refresh the page.");
        }
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiFetch]);

  /* ── Load departments when institution changes ── */
  const fetchDepartments = useCallback(
    async (institutionId) => {
      if (!institutionId) return;
      setLoadingDepts(true);
      setDepartments([]);
      try {
        const res = await apiFetch(`/api/departments?institution_id=${institutionId}`);
        const data = await res.json();
        if (data.success) {
          setDepartments(data.data);
        } else {
          showToast(data.message || "Failed to load departments.", "error");
        }
      } catch (err) {
        if (!isAuthError(err)) {
          showToast("Failed to load departments.", "error");
        }
      } finally {
        setLoadingDepts(false);
      }
    },
    [apiFetch, showToast]
  );

  useEffect(() => {
    fetchDepartments(selectedInstitutionId);
  }, [selectedInstitutionId, fetchDepartments]);

  /* ── Quick toggle status ── */
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
        fetchDepartments(selectedInstitutionId);
      } else {
        showToast(
          data.message ||
            (nextStatus === "INACTIVE"
              ? "Failed to deactivate department."
              : "Failed to activate department."),
          "error"
        );
      }
    } catch (err) {
      if (!isAuthError(err)) {
        showToast("Failed to update department status.", "error");
      }
    } finally {
      setTogglingId(null);
    }
  }

  /* ── Callbacks from DepartmentForm ── */
  function handleCreated(institutionId, message) {
    setFormView(null);
    showToast(message, "success");
    if (institutionId === selectedInstitutionId) {
      fetchDepartments(institutionId);
    } else {
      setSelectedInstitutionId(institutionId);
    }
  }

  function handleSaved(message) {
    setFormView(null);
    showToast(message, "success");
    fetchDepartments(selectedInstitutionId);
  }

  /* ── Render form screen when formView is set ── */
  if (formView) {
    return (
      <DepartmentForm
        mode={formView.mode}
        entity={formView.entity}
        institutions={institutions}
        defaultInstitutionId={selectedInstitutionId}
        onCreated={handleCreated}
        onSaved={handleSaved}
        onBack={() => setFormView(null)}
      />
    );
  }

  /* ── Render import wizard ── */
  if (showImport) {
    const selectedInstitutionName =
      institutions.find((i) => i.institution_id === selectedInstitutionId)?.institution_name || "";

    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <ImportWizard
          apiPath="/api/departments"
          entityLabel="Departments"
          entityIcon={<Building size={22} strokeWidth={1.8} color="#2563eb" />}
          onBack={() => setShowImport(false)}
          onSuccess={(result) => {
            setShowImport(false);
            fetchDepartments(selectedInstitutionId);
            showToast(
              `Import complete: ${result.imported} department${result.imported !== 1 ? "s" : ""} added${result.updated ? `, ${result.updated} updated` : ""}.`,
              "success"
            );
          }}
          extraImportBody={{ defaultInstitutionId: selectedInstitutionId }}
          extraSettingsSlot={
            selectedInstitutionName ? (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "#eff6ff",
                  border: "1.5px solid #bfdbfe",
                  borderRadius: 9,
                  fontSize: 12,
                  color: "#1d4ed8",
                  lineHeight: 1.55,
                }}
              >
                <strong>Default institution:</strong> {selectedInstitutionName}
                <br />
                Rows without an <code>institution_name</code> column will use this institution.
              </div>
            ) : null
          }
        />
      </>
    );
  }

  /* ── List view ── */
  const filteredDepts =
    statusFilter === "ALL"
      ? departments
      : departments.filter((d) => d.status === statusFilter);

  const totalPages  = Math.max(1, Math.ceil(filteredDepts.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const paginated   = filteredDepts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedInstitutionName =
    institutions.find((i) => i.institution_id === selectedInstitutionId)?.institution_name || "";

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Header ── */}
      <PageHeader
        breadcrumb={[t("Home", lang), t("Dept Management", lang), t("Departments", lang)]}
        title={t("Departments", lang)}
        description="Create and manage departments across institutions."
        actions={
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            {/* Institution selector */}
            {!loadingInstitutions && !institutionsError && institutions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...S.label, marginBottom: 4 }}>{t("Institution", lang)}</span>
                <StyledSelect
                  value={selectedInstitutionId ?? ""}
                  onChange={(v) => setSelectedInstitutionId(v)}
                  minWidth={220}
                >
                  {institutions.map((inst) => (
                    <option key={inst.institution_id} value={inst.institution_id}>
                      {inst.institution_name}
                    </option>
                  ))}
                </StyledSelect>
              </div>
            )}

            {!loadingInstitutions && !institutionsError && institutions.length > 0 && (
              <>
                <ExportMenu selectedInstitutionId={selectedInstitutionId} />
                <Button variant="secondary" icon={<Upload size={17} strokeWidth={1.9} />} onClick={() => setShowImport(true)}>
                  {t("Import", lang)}
                </Button>
                <Button variant="primary" icon={<Plus size={17} strokeWidth={2} />} onClick={() => setFormView({ mode: "create", entity: null })}>
                  {t("New Department", lang)}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Institution load error */}
      {institutionsError && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "16px 20px",
            color: "#b91c1c",
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {institutionsError}
        </div>
      )}

      {/* ── Filter bar ── */}
      {!institutionsError && !loadingInstitutions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {loadingDepts ? (
              t("Loading departments…", lang)
            ) : (
              <>
                <strong style={{ color: "#1e293b" }}>{filteredDepts.length}</strong>{" "}
                {statusFilter === "ALL"
                  ? "department(s)"
                  : `${statusFilter.toLowerCase()} department(s)`}
                {selectedInstitutionName && (
                  <>
                    {" "}in{" "}
                    <strong style={{ color: "#1e293b" }}>{selectedInstitutionName}</strong>
                  </>
                )}
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
        loading={loadingDepts || loadingInstitutions}
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
            render: (dept) => <span style={{ fontSize: 12.5, color: "#64748b" }}>{t("Since", lang)} {formatDate(dept.created_at)}</span>,
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
            title={statusFilter !== "ALL" ? `No ${statusFilter.toLowerCase()} departments` : "No departments yet"}
            description={statusFilter === "ALL"
              ? 'Click "New Department" to add the first one.'
              : 'Try switching the filter to "All Statuses".'}
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
