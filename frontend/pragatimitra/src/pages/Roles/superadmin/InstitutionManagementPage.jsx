import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";
import FormScreen from "../../../components/shared/FormScreen";
import { S, Toast, isAuthError, formatDate } from "../../../components/shared/formUtils";

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
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientValidate()) return;
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

  return (
    <FormScreen
      pageTitle="Institutions"
      formTitle={isEdit ? "Edit Institution" : "New Institution"}
      formSubtitle={
        isEdit
          ? "Update name, code, address or status."
          : "Fill in the details below to add an institution."
      }
      icon={isEdit ? "✏️" : "🏫"}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? "Save Changes" : "Create Institution"}
      submitError={submitError}
    >
      {/* Institution Name */}
      <div>
        <label style={S.label}>Institution Name</label>
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

      {/* Code + Email Domain */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={S.label}>Institution Code</label>
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
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Auto-uppercased.</div>
          )}
        </div>
        <div>
          <label style={S.label}>Email Domain</label>
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

      {/* Address Line 1 */}
      <div>
        <label style={S.label}>Address Line 1</label>
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

      {/* Address Line 2 */}
      <div>
        <label style={S.label}>
          Address Line 2{" "}
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

      {/* City + Pincode */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={S.label}>City</label>
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
          <label style={S.label}>Pincode</label>
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

      {/* State + Country */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={S.label}>State</label>
          <select
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.state)}
          >
            <option value="">— Select State —</option>
            {INDIA_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {fieldErrors.state && <div style={S.errorText}>{fieldErrors.state}</div>}
        </div>
        <div>
          <label style={S.label}>Country</label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
            disabled={submitting}
            style={S.input(false)}
          />
        </div>
      </div>

      {/* Status (edit only) */}
      {isEdit && (
        <div>
          <label style={S.label}>Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.status)}
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
              Deactivating will fail unless every user of this institution is already inactive.
            </div>
          )}
        </div>
      )}
    </FormScreen>
  );
}

/* ─── Institution Card ───────────────────────────────────────── */
function InstitutionCard({ inst, onEdit, onToggleStatus, isToggling }) {
  const isActive = inst.status === "ACTIVE";
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
            {inst.code || "—"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {inst.institution_name}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Since {formatDate(inst.created_at)}
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

      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
        📍 {inst.city}, {inst.state}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>
        ✉️ @{inst.email_domain}
      </div>

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
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Departments</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {Number(inst.department_count || 0)}
          </div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Users</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {Number(inst.user_count || 0)}
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
            {inst.code || "—"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onEdit(inst)}
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
        >
          Edit
        </button>
        <button
          onClick={() => onToggleStatus(inst)}
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
        >
          {isToggling ? "…" : isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton Card ──────────────────────────────────────────── */
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

/* ─── Main Page ──────────────────────────────────────────────── */
export default function InstitutionManagementPage() {
  const { apiFetch } = useApi();
  const [institutions, setInstitutions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  /* ── List view ── */
  const filtered =
    statusFilter === "ALL"
      ? institutions
      : institutions.filter((i) => i.status === statusFilter);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page Header */}
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
              background: "#2563eb14",
              borderRadius: 8,
              padding: "4px 12px",
              marginBottom: 12,
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#2563eb",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Institution Management
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
            Institutions
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create and manage institutions on the platform.
          </p>
        </div>
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
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Institution
        </button>
      </div>

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
            {loading ? (
              "Loading institutions…"
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
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </StyledSelect>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length > 0 ? (
          filtered.map((inst) => (
            <InstitutionCard
              key={inst.institution_id}
              inst={inst}
              onEdit={(i) => setFormView({ mode: "edit", entity: i })}
              onToggleStatus={handleToggleStatus}
              isToggling={togglingId === inst.institution_id}
            />
          ))
        ) : (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "64px 0",
              color: "#94a3b8",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
            <div
              style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}
            >
              {statusFilter !== "ALL"
                ? `No ${statusFilter.toLowerCase()} institutions`
                : "No institutions yet"}
            </div>
            <div style={{ fontSize: 13 }}>
              {statusFilter === "ALL"
                ? 'Click "New Institution" to add the first one.'
                : 'Try switching the filter to "All Statuses".'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
