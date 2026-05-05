import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";
import FormScreen from "../../../components/shared/FormScreen";
import { S, Toast, isAuthError, formatDate } from "../../../components/shared/formUtils";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

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
      ? { name: entity.name || "", code: entity.code || "", status: entity.status || "ACTIVE" }
      : {
          name: "",
          code: "",
          institution_id: defaultInstitutionId || institutions[0]?.institution_id || "",
        }
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  function clientValidate() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Department name is required.";
    if (!form.code.trim()) errs.code = "Department code is required.";
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim()))
      errs.code = "Only letters, digits, hyphens, and underscores allowed.";
    if (!isEdit && !form.institution_id) errs.institution_id = "Please select an institution.";
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
              name: form.name.trim(),
              code: form.code.trim().toUpperCase(),
              status: form.status,
            }),
          })
        : await apiFetch("/api/departments", {
            method: "POST",
            body: JSON.stringify({
              name: form.name.trim(),
              code: form.code.trim().toUpperCase(),
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

  return (
    <FormScreen
      pageTitle={t("Departments", lang)}
      formTitle={isEdit ? t("Edit Department", lang) : t("New Department", lang)}
      formSubtitle={
        isEdit
          ? "Update name, code, or status."
          : "Fill in the details below to add a department."
      }
      icon={isEdit ? "✏️" : "🏛️"}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? t("Save Changes", lang) : "Create Department"}
      submitError={submitError}
    >
      {/* Institution (create only) */}
      {!isEdit && (
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
      )}
    </FormScreen>
  );
}

/* ─── Department Card ────────────────────────────────────────── */
function DepartmentCard({ dept, onEdit, onToggleStatus, isToggling }) {
  const { lang } = useLanguage();
  const isActive = dept.status === "ACTIVE";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${isActive ? "rgba(0,0,0,0.07)" : "#f1f5f9"}`,
        borderRadius: 14,
        padding: "22px 24px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        opacity: isActive ? 1 : 0.72,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 11,
              background: isActive ? "#eff6ff" : "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 800,
              color: isActive ? "#2563eb" : "#94a3b8",
              letterSpacing: 0.5,
              fontFamily: "monospace",
            }}
          >
            {dept.code || "—"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{dept.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {t("Since", lang)} {formatDate(dept.created_at)}
            </div>
          </div>
        </div>

        <span
          style={{
            padding: "3px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: isActive ? "#d1fae5" : "#f1f5f9",
            color: isActive ? "#065f46" : "#94a3b8",
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {isActive ? t("Active", lang) : t("Inactive", lang)}
        </span>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 16,
          padding: "12px 14px",
          background: "#f8fafc",
          borderRadius: 10,
          flex: 1,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{t("Members", lang)}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {Number(dept.member_count)}
          </div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{t("Code", lang)}</div>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}
          >
            {dept.code || "—"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onEdit(dept)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            fontSize: 12,
            fontWeight: 600,
            color: "#2563eb",
            cursor: "pointer",
          }}
          title={t("Edit department", lang)}
        >
          {t("Edit", lang)}
        </button>
        <button
          onClick={() => onToggleStatus(dept)}
          disabled={isToggling}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: "1.5px solid",
            borderColor: isActive ? "#fee2e2" : "#bbf7d0",
            background: "#fff",
            fontSize: 12,
            fontWeight: 600,
            color: isActive ? "#dc2626" : "#059669",
            cursor: isToggling ? "not-allowed" : "pointer",
            opacity: isToggling ? 0.6 : 1,
          }}
          title={isActive ? t("Deactivate department", lang) : t("Activate department", lang)}
        >
          {isToggling ? "…" : isActive ? t("Deactivate", lang) : t("Activate", lang)}
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton card ──────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 14,
        padding: "22px 24px",
      }}
    >
      {[55, 100, 70, 40].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 1 ? 56 : 14,
            width: `${w}%`,
            background: "#f1f5f9",
            borderRadius: 8,
            marginBottom: 14,
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Styled select (filter bar only) ───────────────────────── */
function StyledSelect({ value, onChange, children, minWidth = 180 }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px",
        border: "1.5px solid #e2e8f0",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        color: "#1e293b",
        background: "#fff",
        outline: "none",
        cursor: "pointer",
        minWidth,
      }}
    >
      {children}
    </select>
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
  const [togglingId, setTogglingId] = useState(null);

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
    return () => {
      cancelled = true;
    };
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
        body: JSON.stringify({ name: dept.name, code: dept.code, status: nextStatus }),
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

  /* ── List view ── */
  const filteredDepts =
    statusFilter === "ALL"
      ? departments
      : departments.filter((d) => d.status === statusFilter);

  const selectedInstitutionName =
    institutions.find((i) => i.institution_id === selectedInstitutionId)?.institution_name || "";

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#05966914",
              borderRadius: 8,
              padding: "4px 12px",
              marginBottom: 12,
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#059669",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {t("Dept Management", lang)}
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
            {t("Departments", lang)}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create and manage departments across institutions.
          </p>
        </div>

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

          {/* New Department button */}
          {!loadingInstitutions && !institutionsError && institutions.length > 0 && (
            <button
              onClick={() => setFormView({ mode: "create", entity: null })}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              {t("New Department", lang)}
            </button>
          )}
        </div>
      </div>

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

      {/* ── Cards grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {loadingDepts ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filteredDepts.length > 0 ? (
          filteredDepts.map((dept) => (
            <DepartmentCard
              key={dept.department_id}
              dept={dept}
              onEdit={(d) => setFormView({ mode: "edit", entity: d })}
              onToggleStatus={handleToggleStatus}
              isToggling={togglingId === dept.department_id}
            />
          ))
        ) : (
          !loadingInstitutions && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "64px 0",
                color: "#94a3b8",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏛️</div>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}
              >
                {statusFilter !== "ALL"
                  ? `No ${statusFilter.toLowerCase()} departments`
                  : "No departments yet"}
              </div>
              <div style={{ fontSize: 13 }}>
                {statusFilter === "ALL"
                  ? 'Click "New Department" to add the first one.'
                  : 'Try switching the filter to "All Statuses".'}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
