import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";

/* ─── Shared style tokens ────────────────────────────────────── */
const S = {
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  input: (hasError) => ({
    width: "100%",
    padding: "9px 12px",
    border: `1.5px solid ${hasError ? "#f87171" : "#e2e8f0"}`,
    borderRadius: 9,
    fontSize: 13,
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    transition: "border-color .15s",
  }),
  errorText: {
    fontSize: 11,
    color: "#dc2626",
    marginTop: 4,
  },
  btnPrimary: (disabled) => ({
    padding: "9px 22px",
    borderRadius: 9,
    border: "none",
    background: disabled ? "#93c5fd" : "#2563eb",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  btnGhost: {
    padding: "9px 20px",
    borderRadius: 9,
    border: "1.5px solid #e2e8f0",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
  },
};

/* ─── Helpers ────────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function isAuthError(err) {
  const m = err?.message || "";
  return (
    m.includes("Session expired") ||
    m.includes("signed in from another device") ||
    m.includes("sign in again")
  );
}

/* ─── Toast ─────────────────────────────────────────────────── */
function Toast({ message, type }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        background: type === "error" ? "#dc2626" : "#1e293b",
        color: "#fff",
        padding: "13px 20px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        maxWidth: 440,
        lineHeight: 1.55,
      }}
    >
      {type === "error" ? "✕  " : "✓  "}
      {message}
    </div>
  );
}

/* ─── Overlay wrapper ────────────────────────────────────────── */
function Overlay({ children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.48)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 900,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Create Department Modal ────────────────────────────────── */
function CreateDeptModal({ institutions, defaultInstitutionId, onClose, onCreated }) {
  const { apiFetch } = useApi();

  const [form, setForm] = useState({
    name: "",
    code: "",
    institution_id: defaultInstitutionId || institutions[0]?.institution_id || "",
  });
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
    if (!form.institution_id) errs.institution_id = "Please select an institution.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientValidate()) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await apiFetch("/api/departments", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          institution_id: form.institution_id,
        }),
      });
      const data = await res.json();

      if (data.success) {
        onCreated(form.institution_id, data.message);
      } else if (data.errors) {
        setFieldErrors(data.errors);
      } else {
        setSubmitError(data.message || "Failed to create department.");
      }
    } catch (err) {
      if (!isAuthError(err)) {
        setSubmitError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: "24px 28px 20px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🏛️
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
              New Department
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Fill in the details below to add a department.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              fontSize: 20,
              color: "#94a3b8",
              cursor: submitting ? "not-allowed" : "pointer",
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Institution */}
            <div>
              <label style={S.label}>Institution</label>
              <select
                value={form.institution_id}
                onChange={(e) => set("institution_id", e.target.value)}
                disabled={submitting}
                style={{
                  ...S.input(!!fieldErrors.institution_id),
                  appearance: "none",
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: 32,
                }}
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

            {/* Department Name */}
            <div>
              <label style={S.label}>Department Name</label>
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
              {fieldErrors.name && (
                <div style={S.errorText}>{fieldErrors.name}</div>
              )}
            </div>

            {/* Department Code */}
            <div>
              <label style={S.label}>Department Code</label>
              <input
                type="text"
                placeholder="e.g. CS or COMP_SCI"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                disabled={submitting}
                maxLength={20}
                style={{
                  ...S.input(!!fieldErrors.code),
                  fontFamily: "monospace",
                  letterSpacing: 1,
                }}
              />
              {fieldErrors.code ? (
                <div style={S.errorText}>{fieldErrors.code}</div>
              ) : (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Auto-uppercased. Letters, digits, hyphens, underscores only.
                </div>
              )}
            </div>

            {/* Global submit error */}
            {submitError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#b91c1c",
                }}
              >
                {submitError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 28px 24px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={S.btnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={S.btnPrimary(submitting)}
            >
              {submitting ? "Creating…" : "Create Department"}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

/* ─── Edit Department Modal ──────────────────────────────────── */
function EditDeptModal({ dept, onClose, onSaved }) {
  const { apiFetch } = useApi();

  const [form, setForm] = useState({
    name: dept.name || "",
    code: dept.code || "",
    status: dept.status || "ACTIVE",
  });
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
    if (!["ACTIVE", "INACTIVE"].includes(form.status))
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
      const res = await apiFetch(`/api/departments/${dept.department_id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          status: form.status,
        }),
      });
      const data = await res.json();

      if (data.success) {
        onSaved(data.message);
      } else if (data.errors) {
        setFieldErrors(data.errors);
      } else {
        setSubmitError(data.message || "Failed to update department.");
      }
    } catch (err) {
      if (!isAuthError(err)) {
        setSubmitError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const goingInactive = dept.status === "ACTIVE" && form.status === "INACTIVE";

  return (
    <Overlay>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 28px 20px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            ✏️
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
              Edit Department
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Update name, code, or status.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              fontSize: 20,
              color: "#94a3b8",
              cursor: submitting ? "not-allowed" : "pointer",
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Name */}
            <div>
              <label style={S.label}>Department Name</label>
              <input
                ref={nameRef}
                type="text"
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
              <label style={S.label}>Department Code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                disabled={submitting}
                maxLength={20}
                style={{
                  ...S.input(!!fieldErrors.code),
                  fontFamily: "monospace",
                  letterSpacing: 1,
                }}
              />
              {fieldErrors.code ? (
                <div style={S.errorText}>{fieldErrors.code}</div>
              ) : (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Auto-uppercased. Letters, digits, hyphens, underscores only.
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label style={S.label}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={submitting}
                style={{
                  ...S.input(!!fieldErrors.status),
                  appearance: "none",
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: 32,
                }}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
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
                  Deactivating will fail unless every member of this department
                  is already inactive.
                </div>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#b91c1c",
                }}
              >
                {submitError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "16px 28px 24px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={S.btnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={S.btnPrimary(submitting)}
            >
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

/* ─── Department Card ────────────────────────────────────────── */
function DepartmentCard({ dept, onEdit, onToggleStatus, isToggling }) {
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
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {dept.name}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Since {formatDate(dept.created_at)}
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
          {isActive ? "Active" : "Inactive"}
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
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Members</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {Number(dept.member_count)}
          </div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Code</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1e293b",
              fontFamily: "monospace",
            }}
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
          title="Edit department"
        >
          Edit
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
          title={isActive ? "Deactivate department" : "Activate department"}
        >
          {isToggling ? "…" : isActive ? "Deactivate" : "Activate"}
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

/* ─── Styled select ──────────────────────────────────────────── */
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
  const { apiFetch } = useApi();

  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [institutionsError, setInstitutionsError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
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

  /* ── Quick toggle status (Activate ⇄ Deactivate) ── */
  async function handleToggleStatus(dept) {
    const nextStatus = dept.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(dept.department_id);
    try {
      const res = await apiFetch(`/api/departments/${dept.department_id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: dept.name,
          code: dept.code,
          status: nextStatus,
        }),
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

  /* ── Edit save callback ── */
  function handleEditSaved(message) {
    setEditingDept(null);
    showToast(message, "success");
    fetchDepartments(selectedInstitutionId);
  }

  /* ── Creation callback ── */
  function handleCreated(institutionId, message) {
    setShowCreate(false);
    showToast(message, "success");
    if (institutionId === selectedInstitutionId) {
      fetchDepartments(institutionId);
    } else {
      setSelectedInstitutionId(institutionId);
    }
  }

  /* ── Client-side filter ── */
  const filteredDepts =
    statusFilter === "ALL"
      ? departments
      : departments.filter((d) => d.status === statusFilter);

  const selectedInstitutionName =
    institutions.find((i) => i.institution_id === selectedInstitutionId)
      ?.institution_name || "";

  /* ── Render ── */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {/* Modals */}
      {showCreate && (
        <CreateDeptModal
          institutions={institutions}
          defaultInstitutionId={selectedInstitutionId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {editingDept && (
        <EditDeptModal
          dept={editingDept}
          onClose={() => setEditingDept(null)}
          onSaved={handleEditSaved}
        />
      )}

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
            <div
              style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669" }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#059669",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Dept Management
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
            Departments
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create and manage departments across institutions.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          {/* Institution selector */}
          {!loadingInstitutions && !institutionsError && institutions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...S.label, marginBottom: 4 }}>Institution</span>
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
              onClick={() => setShowCreate(true)}
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
              New Department
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
              "Loading departments…"
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
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
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
              onEdit={setEditingDept}
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
              <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                {statusFilter !== "ALL"
                  ? `No ${statusFilter.toLowerCase()} departments`
                  : "No departments yet"}
              </div>
              <div style={{ fontSize: 13 }}>
                {statusFilter === "ALL"
                  ? 'Click “New Department” to add the first one.'
                  : 'Try switching the filter to “All Statuses”.'}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
