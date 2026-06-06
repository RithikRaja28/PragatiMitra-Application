import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2, Pencil, Landmark, MoreHorizontal, Power, PowerOff,
  Plus, Upload, Download, FileText, FileSpreadsheet,
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

const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli",
  "Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

/* ─── Institution Form (create + edit) ──────────────────────────
   Rendered as a full screen instead of an overlay modal.
   mode === 'create' → no status field
   mode === 'edit'   → includes status + inactive warning
─────────────────────────────────────────────────────────────── */
const EMPTY = {
  institution_name: "", code: "", email_domain: "",
  address_line1: "", address_line2: "",
  city: "", state: "", country: "India", pincode: "",
};

function InstitutionForm({ mode, entity, onCreated, onSaved, onBack }) {
  const { lang } = useLanguage();
  const { apiFetch } = useApi();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(
    isEdit
      ? {
          institution_name: entity.institution_name || "",
          code: entity.code || "",
          email_domain: entity.email_domain || "",
          address_line1: entity.address_line1 || "",
          address_line2: entity.address_line2 || "",
          city: entity.city || "",
          state: entity.state || "",
          country: entity.country || "India",
          pincode: entity.pincode || "",
          status: entity.status || "ACTIVE",
        }
      : { ...EMPTY }
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
    if (!form.institution_name.trim()) errs.institution_name = "Institution name is required.";
    if (!form.code.trim()) errs.code = "Code is required.";
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim()))
      errs.code = "Letters, digits, hyphens, underscores only.";
    if (!form.email_domain.trim()) errs.email_domain = "Email domain is required.";
    else if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.email_domain.trim()))
      errs.email_domain = "e.g. college.edu.in";
    if (!form.address_line1.trim()) errs.address_line1 = "Address is required.";
    if (!form.city.trim()) errs.city = "City is required.";
    if (!form.state) errs.state = "State is required.";
    if (!form.pincode.trim()) errs.pincode = "Pincode is required.";
    else if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "Must be 6 digits.";
    if (isEdit && !["ACTIVE", "INACTIVE"].includes(form.status))
      errs.status = "Invalid status.";
    return errs;
  }

  /* Fields owned by each create-wizard step (for per-step gating). */
  const STEP_FIELDS = [
    ["institution_name", "code", "email_domain"],
    ["address_line1", "city", "state", "pincode"],
  ];

  /* Validate just the current step before letting the wizard advance. */
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
      // In the create wizard, surface the earliest step that has an error.
      if (!isEdit) {
        const bad = STEP_FIELDS.findIndex((fields) => fields.some((f) => errs[f]));
        if (bad >= 0) setStep(bad);
      }
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        email_domain: form.email_domain.trim().toLowerCase(),
      };
      const res = isEdit
        ? await apiFetch(`/api/institutions/${entity.institution_id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/institutions", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (data.success) {
        if (isEdit) onSaved(data.message);
        else onCreated(data.message);
      } else if (data.errors) {
        setFieldErrors(data.errors);
      } else {
        setSubmitError(data.message || `Failed to ${isEdit ? "update" : "create"} institution.`);
      }
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const goingInactive = isEdit && entity.status === "ACTIVE" && form.status === "INACTIVE";

  /* ── Field blocks (shared by the edit FormScreen and the create wizard) ── */
  const fldName = (
    <div>
      <label style={S.label}>{t("Institution Name", lang)}</label>
      <input
        ref={nameRef}
        type="text"
        placeholder="e.g. All India Institute of Ayurveda"
        value={form.institution_name}
        onChange={(e) => set("institution_name", e.target.value)}
        disabled={submitting}
        maxLength={200}
        style={S.input(!!fieldErrors.institution_name)}
      />
      {fieldErrors.institution_name && (
        <div style={S.errorText}>{fieldErrors.institution_name}</div>
      )}
    </div>
  );

  const fldCodeEmail = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
      <div>
        <label style={S.label}>{t("Institution Code", lang)}</label>
        <input
          type="text"
          placeholder="e.g. AIIA"
          value={form.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          disabled={submitting}
          maxLength={20}
          style={{ ...S.input(!!fieldErrors.code), fontFamily: "monospace", letterSpacing: 1 }}
        />
        {fieldErrors.code ? (
          <div style={S.errorText}>{fieldErrors.code}</div>
        ) : (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{t("Auto-uppercased.", lang)}</div>
        )}
      </div>
      <div>
        <label style={S.label}>{t("Email Domain", lang)}</label>
        <input
          type="text"
          placeholder="e.g. aiia.edu.in"
          value={form.email_domain}
          onChange={(e) => set("email_domain", e.target.value.toLowerCase())}
          disabled={submitting}
          style={S.input(!!fieldErrors.email_domain)}
        />
        {fieldErrors.email_domain && (
          <div style={S.errorText}>{fieldErrors.email_domain}</div>
        )}
      </div>
    </div>
  );

  const fldAddress1 = (
    <div>
      <label style={S.label}>{t("Address Line 1", lang)}</label>
      <input
        type="text"
        placeholder="Street / Building name"
        value={form.address_line1}
        onChange={(e) => set("address_line1", e.target.value)}
        disabled={submitting}
        style={S.input(!!fieldErrors.address_line1)}
      />
      {fieldErrors.address_line1 && (
        <div style={S.errorText}>{fieldErrors.address_line1}</div>
      )}
    </div>
  );

  const fldAddress2 = (
    <div>
      <label style={S.label}>
        {t("Address Line 2", lang)}{" "}
        <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>
          (optional)
        </span>
      </label>
      <input
        type="text"
        placeholder="Area / Landmark"
        value={form.address_line2}
        onChange={(e) => set("address_line2", e.target.value)}
        disabled={submitting}
        style={S.input(false)}
      />
    </div>
  );

  const fldCityPincode = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
      <div>
        <label style={S.label}>{t("City", lang)}</label>
        <input
          type="text"
          placeholder="e.g. Delhi"
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          disabled={submitting}
          style={S.input(!!fieldErrors.city)}
        />
        {fieldErrors.city && <div style={S.errorText}>{fieldErrors.city}</div>}
      </div>
      <div>
        <label style={S.label}>{t("Pincode", lang)}</label>
        <input
          type="text"
          placeholder="6-digit pincode"
          value={form.pincode}
          onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={submitting}
          maxLength={6}
          style={S.input(!!fieldErrors.pincode)}
        />
        {fieldErrors.pincode && <div style={S.errorText}>{fieldErrors.pincode}</div>}
      </div>
    </div>
  );

  const fldStateCountry = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
      <div>
        <label style={S.label}>{t("State", lang)}</label>
        <select
          value={form.state}
          onChange={(e) => set("state", e.target.value)}
          disabled={submitting}
          style={S.select(!!fieldErrors.state)}
        >
          <option value="">{t("— Select State —", lang)}</option>
          {INDIA_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {fieldErrors.state && <div style={S.errorText}>{fieldErrors.state}</div>}
      </div>
      <div>
        <label style={S.label}>{t("Country", lang)}</label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => set("country", e.target.value)}
          disabled={submitting}
          style={S.input(false)}
        />
      </div>
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
          Deactivating will fail unless every user of this institution is already inactive.
        </div>
      )}
    </div>
  );

  /* ── Edit: single-page form ── */
  if (isEdit) {
    return (
      <FormScreen
        pageTitle={t("Institutions", lang)}
        formTitle={t("Edit Institution", lang)}
        formSubtitle="Update name, code, address or status."
        icon={<Pencil size={20} color="#d97706" strokeWidth={2} />}
        iconBg="#fef3c7"
        onBack={onBack}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={t("Save Changes", lang)}
        submitError={submitError}
      >
        {fldName}
        {fldCodeEmail}
        {fldAddress1}
        {fldAddress2}
        {fldCityPincode}
        {fldStateCountry}
        {fldStatus}
      </FormScreen>
    );
  }

  /* ── Create: multi-step wizard ── */
  return (
    <FormWizard
      pageTitle={t("Institutions", lang)}
      formTitle="Create Institution"
      formSubtitle="Register a new institution in the platform."
      icon={<Building2 size={20} color="#2563eb" strokeWidth={2} />}
      iconBg="#eff6ff"
      steps={[t("Institution Details", lang), t("Address Information", lang), t("Review & Create", lang)]}
      step={step}
      onStepChange={setStep}
      canAdvance={validateStep}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create Institution"
      submitError={submitError}
    >
      {(s) =>
        s === 0 ? (
          <>
            {fldName}
            {fldCodeEmail}
          </>
        ) : s === 1 ? (
          <>
            {fldAddress1}
            {fldAddress2}
            {fldCityPincode}
            {fldStateCountry}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ReviewGroup title={t("Institution Details", lang)}>
              <ReviewItem label={t("Institution Name", lang)} value={form.institution_name} />
              <ReviewItem label={t("Institution Code", lang)} value={form.code} />
              <ReviewItem label={t("Email Domain", lang)} value={form.email_domain} />
            </ReviewGroup>
            <ReviewGroup title={t("Address Information", lang)}>
              <ReviewItem label={t("Address Line 1", lang)} value={form.address_line1} />
              <ReviewItem label={t("Address Line 2", lang)} value={form.address_line2} />
              <ReviewItem label={t("City", lang)} value={form.city} />
              <ReviewItem label={t("State", lang)} value={form.state} />
              <ReviewItem label={t("Pincode", lang)} value={form.pincode} />
              <ReviewItem label={t("Country", lang)} value={form.country} />
            </ReviewGroup>
          </div>
        )
      }
    </FormWizard>
  );
}


/* Icon-only, viewport-aware export menu (shared Dropdown → never clipped). */
function ExportMenu({ loading, onExport }) {
  return (
    <Dropdown
      align="right"
      width={200}
      button={({ toggle }) => (
        <Button variant="secondary" iconOnly loading={!!loading} icon={<Download size={18} strokeWidth={1.9} />} onClick={toggle} aria-label="Export" title="Export" />
      )}
    >
      <MenuLabel>Export</MenuLabel>
      <MenuItem icon={<FileText size={16} strokeWidth={1.9} />} onClick={() => onExport("csv")}>Export as CSV</MenuItem>
      <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={1.9} />} onClick={() => onExport("xlsx")}>Export as Excel</MenuItem>
    </Dropdown>
  );
}

function InstPagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  const btnStyle = (disabled) => ({
    padding: "5px 13px", borderRadius: 7, border: "1.5px solid #e2e8f0",
    background: disabled ? "#f8fafc" : "#fff", fontSize: 13, fontWeight: 600,
    color: disabled ? "#cbd5e1" : "#1e293b", cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
        <span>Cards per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{ padding: "4px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, color: "#1e293b", background: "#fff", cursor: "pointer" }}
        >
          {[10, 25, 100, 500].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>{from}–{to} of {total}</span>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={btnStyle(page <= 1)}>← Prev</button>
        <span style={{ fontSize: 13, color: "#475569" }}>{page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={btnStyle(page >= totalPages)}>Next →</button>
      </div>
    </div>
  );
}

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

/* ─── Main Page ──────────────────────────────────────────────── */
export default function InstitutionManagementPage() {
  const { lang } = useLanguage();
  const { apiFetch } = useApi();
  const [institutions, setInstitutions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* formView: null = list, { mode: 'create'|'edit', entity } = form screen */
  const [formView, setFormView] = useState(null);
  const [togglingId,      setTogglingId]      = useState(null);
  const [toast,           setToast]           = useState(null);
  const [showImport,      setShowImport]      = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [page,            setPage]            = useState(1);
  const [pageSize,        setPageSize]        = useState(25);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(
      () => setToast(null),
      type === "error" ? 5500 : 3000
    );
  }, []);

  const handleExport = async (format) => {
    setExportingFormat(format);
    try {
      const res  = await apiFetch(`/api/institutions/export?format=${format}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `institutions_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Export failed. Please try again.", "error");
    } finally {
      setExportingFormat(null);
    }
  };

  const fetchInstitutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/institutions");
      const data = await res.json();
      if (data.success) setInstitutions(data.data);
      else setError(data.message || "Failed to load institutions.");
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load institutions. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  // Must be before any early returns — React Rules of Hooks
  useEffect(() => { setPage(1); }, [statusFilter]);

  async function handleToggleStatus(inst) {
    const nextStatus = inst.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(inst.institution_id);
    try {
      const res = await apiFetch(`/api/institutions/${inst.institution_id}`, {
        method: "PUT",
        body: JSON.stringify({ ...inst, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchInstitutions();
      } else {
        showToast(data.message || "Failed to update status.", "error");
      }
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to update institution status.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  /* ── Callbacks from InstitutionForm ── */
  function handleCreated(message) {
    setFormView(null);
    showToast(message, "success");
    fetchInstitutions();
  }

  function handleSaved(message) {
    setFormView(null);
    showToast(message, "success");
    fetchInstitutions();
  }

  /* ── Render form screen when formView is set ── */
  if (formView) {
    return (
      <InstitutionForm
        mode={formView.mode}
        entity={formView.entity}
        onCreated={handleCreated}
        onSaved={handleSaved}
        onBack={() => setFormView(null)}
      />
    );
  }

  if (showImport) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <ImportWizard
          apiPath="/api/institutions"
          entityLabel="Institutions"
          entityIcon={<Landmark size={22} strokeWidth={1.8} color="#2563eb" />}
          onBack={() => setShowImport(false)}
          onSuccess={(result) => {
            setShowImport(false);
            fetchInstitutions();
            showToast(
              `Import complete: ${result.imported} institution${result.imported !== 1 ? "s" : ""} imported.`,
              "success"
            );
          }}
        />
      </>
    );
  }

  /* ── List view ── */
  const filtered =
    statusFilter === "ALL"
      ? institutions
      : institutions.filter((i) => i.status === statusFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page Header */}
      <PageHeader
        breadcrumb={[t("Home", lang), t("Institution Management", lang), t("Institutions", lang)]}
        title={t("Institutions", lang)}
        description="Create and manage institutions on the platform."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ExportMenu loading={exportingFormat} onExport={handleExport} />
            <Button variant="secondary" icon={<Upload size={17} strokeWidth={1.9} />} onClick={() => setShowImport(true)}>
              {t("Import", lang)}
            </Button>
            <Button variant="primary" icon={<Plus size={17} strokeWidth={2} />} onClick={() => setFormView({ mode: "create", entity: null })}>
              {t("New Institution", lang)}
            </Button>
          </div>
        }
      />

      {error && (
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
          {error}
        </div>
      )}

      {!error && (
        <DataTable
          minWidth={940}
          loading={loading}
          rows={paginated}
          rowKey="institution_id"
          toolbar={
            <>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {loading ? (
                  t("Loading institutions…", lang)
                ) : (
                  <>
                    <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>{" "}
                    {statusFilter === "ALL"
                      ? "institution(s)"
                      : `${statusFilter.toLowerCase()} institution(s)`}
                  </>
                )}
              </div>
              <StyledSelect value={statusFilter} onChange={setStatusFilter} minWidth={150}>
                <option value="ALL">{t("All Statuses", lang)}</option>
                <option value="ACTIVE">{t("Active", lang)}</option>
                <option value="INACTIVE">{t("Inactive", lang)}</option>
              </StyledSelect>
            </>
          }
          columns={[
            {
              key: "code", header: t("Code", lang), width: 120,
              render: (inst) => (
                <span style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, color: inst.status === "ACTIVE" ? "#2563eb" : "#94a3b8" }}>
                  {inst.code || "—"}
                </span>
              ),
            },
            {
              key: "institution_name", header: t("Institution Name", lang),
              render: (inst) => (
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b" }}>{inst.institution_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {t("Since", lang)} {formatDate(inst.created_at)} · @{inst.email_domain}
                  </div>
                </div>
              ),
            },
            {
              key: "location", header: t("Location", lang), width: 200, ellipsis: true,
              render: (inst) => (
                <span style={{ fontSize: 12.5, color: "#64748b" }}>
                  {[inst.city, inst.state].filter(Boolean).join(", ") || "—"}
                </span>
              ),
            },
            {
              key: "department_count", header: t("Departments", lang), width: 120,
              render: (inst) => <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b" }}>{Number(inst.department_count || 0)}</span>,
            },
            {
              key: "user_count", header: t("Users", lang), width: 100,
              render: (inst) => <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b" }}>{Number(inst.user_count || 0)}</span>,
            },
            {
              key: "status", header: t("Status", lang), width: 120,
              render: (inst) => (
                <Badge tone={inst.status === "ACTIVE" ? "success" : "neutral"}>
                  {inst.status === "ACTIVE" ? t("Active", lang) : t("Inactive", lang)}
                </Badge>
              ),
            },
            {
              key: "actions", header: t("Actions", lang), align: "right", width: 90,
              render: (inst) => {
                const isActive = inst.status === "ACTIVE";
                const busy = togglingId === inst.institution_id;
                return (
                  <Dropdown
                    align="right"
                    width={190}
                    button={({ toggle }) => (
                      <Button variant="ghost" iconOnly icon={<MoreHorizontal size={18} strokeWidth={2} />} onClick={toggle} aria-label="Row actions" />
                    )}
                  >
                    <MenuItem icon={<Pencil size={16} strokeWidth={1.9} />} onClick={() => setFormView({ mode: "edit", entity: inst })}>
                      {t("Edit", lang)}
                    </MenuItem>
                    {isActive ? (
                      <MenuItem icon={<PowerOff size={16} strokeWidth={1.9} />} danger disabled={busy} onClick={() => handleToggleStatus(inst)}>
                        {busy ? "…" : t("Deactivate", lang)}
                      </MenuItem>
                    ) : (
                      <MenuItem icon={<Power size={16} strokeWidth={1.9} />} disabled={busy} onClick={() => handleToggleStatus(inst)}>
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
              icon={<Landmark size={26} strokeWidth={1.6} />}
              title={statusFilter !== "ALL" ? `No ${statusFilter.toLowerCase()} institutions` : "No institutions yet"}
              description={statusFilter === "ALL"
                ? 'Click "New Institution" to add the first one.'
                : 'Try switching the filter to "All Statuses".'}
            />
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <InstPagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      )}
    </div>
  );
}
