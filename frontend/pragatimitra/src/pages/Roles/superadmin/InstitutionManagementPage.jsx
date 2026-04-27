import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom"; 
import { useApi } from "../../../hooks/useApi";

/* ─── Shared style tokens ── */
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
  errorText: { fontSize: 11, color: "#dc2626", marginTop: 4 },
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

const SELECT_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")";

const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli",
  "Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function isAuthError(err) {
  const m = err?.message || "";
  return m.includes("Session expired") || m.includes("sign in again");
}

/* ─── Toast ── */
function Toast({ message, type }) {
  return (
    <div style={{
      position: "fixed", top: 20, right: 24,
      background: type === "error" ? "#dc2626" : "#1e293b",
      color: "#fff", padding: "13px 20px", borderRadius: 10,
      fontSize: 13, fontWeight: 500, zIndex: 9999,
      boxShadow: "0 8px 28px rgba(0,0,0,0.22)", maxWidth: 440, lineHeight: 1.55,
    }}>
      {type === "error" ? "✕  " : "✓  "}{message}
    </div>
  );
}

/*
 * ─── Overlay ─────────────────────────────────────────────────────────────────
 * The backdrop fills the full screen. Inside it we have a scroll container
 * that is also full-screen and centers the modal. When the modal is shorter
 * than the viewport it sits centered with equal space above/below. When it's
 * taller (e.g. on a small screen) the scroll container lets you scroll to see
 * the rest — no content is ever clipped and the dim backdrop fills the whole
 * viewport edge-to-edge at all times.
 */
function Overlay({ children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.48)",
        zIndex: 9000,
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function SelectInput({ value, onChange, disabled, hasError, children }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} style={{
      ...S.input(hasError),
      appearance: "none",
      backgroundImage: SELECT_BG,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 12px center",
      paddingRight: 32,
    }}>
      {children}
    </select>
  );
}

/* ─── Shared modal card wrapper ── */
function ModalCard({ children }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 18,
      width: "100%",
      maxWidth: 520,
      boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      overflow: "hidden",
      /* Let the card be exactly as tall as its content — no artificial height */
    }}>
      {children}
    </div>
  );
}

/* ─── Create Institution Modal ── */
const EMPTY = {
  institution_name: "", code: "", email_domain: "",
  address_line1: "", address_line2: "",
  city: "", state: "", country: "India", pincode: "",
};

function CreateInstitutionModal({ onClose, onCreated }) {
  const { apiFetch } = useApi();
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  function clientValidate() {
    const errs = {};
    if (!form.institution_name.trim()) errs.institution_name = "Institution name is required.";
    if (!form.code.trim()) errs.code = "Code is required.";
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim())) errs.code = "Letters, digits, hyphens, underscores only.";
    if (!form.email_domain.trim()) errs.email_domain = "Email domain is required.";
    else if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.email_domain.trim())) errs.email_domain = "e.g. college.edu.in";
    if (!form.address_line1.trim()) errs.address_line1 = "Address is required.";
    if (!form.city.trim()) errs.city = "City is required.";
    if (!form.state) errs.state = "State is required.";
    if (!form.pincode.trim()) errs.pincode = "Pincode is required.";
    else if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "Must be 6 digits.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientValidate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await apiFetch("/api/institutions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          code: form.code.trim().toUpperCase(),
          email_domain: form.email_domain.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (data.success) onCreated(data.message);
      else if (data.errors) setFieldErrors(data.errors);
      else setSubmitError(data.message || "Failed to create institution.");
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay>
      <ModalCard>
        {/* Header */}
        <div style={{
          padding: "24px 28px 20px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, background: "#eff6ff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
          }}>🏫</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>New Institution</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Fill in the details below to add an institution.</div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{
            marginLeft: "auto", background: "none", border: "none",
            fontSize: 20, color: "#94a3b8",
            cursor: submitting ? "not-allowed" : "pointer",
            lineHeight: 1, padding: 4,
          }} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: "28px 28px 4px", display: "flex", flexDirection: "column", gap: 18 }}>

            <div>
              <label style={S.label}>Institution Name</label>
              <input ref={nameRef} type="text" placeholder="e.g. All India Institute of Ayurveda"
                value={form.institution_name} onChange={(e) => set("institution_name", e.target.value)}
                disabled={submitting} maxLength={200} style={S.input(!!fieldErrors.institution_name)} />
              {fieldErrors.institution_name && <div style={S.errorText}>{fieldErrors.institution_name}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>Institution Code</label>
                <input type="text" placeholder="e.g. AIIA"
                  value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())}
                  disabled={submitting} maxLength={20}
                  style={{ ...S.input(!!fieldErrors.code), fontFamily: "monospace", letterSpacing: 1 }} />
                {fieldErrors.code
                  ? <div style={S.errorText}>{fieldErrors.code}</div>
                  : <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Auto-uppercased.</div>}
              </div>
              <div>
                <label style={S.label}>Email Domain</label>
                <input type="text" placeholder="e.g. aiia.edu.in"
                  value={form.email_domain} onChange={(e) => set("email_domain", e.target.value.toLowerCase())}
                  disabled={submitting} style={S.input(!!fieldErrors.email_domain)} />
                {fieldErrors.email_domain && <div style={S.errorText}>{fieldErrors.email_domain}</div>}
              </div>
            </div>

            <div>
              <label style={S.label}>Address Line 1</label>
              <input type="text" placeholder="Street / Building name"
                value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)}
                disabled={submitting} style={S.input(!!fieldErrors.address_line1)} />
              {fieldErrors.address_line1 && <div style={S.errorText}>{fieldErrors.address_line1}</div>}
            </div>

            <div>
              <label style={S.label}>
                Address Line 2{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>(optional)</span>
              </label>
              <input type="text" placeholder="Area / Landmark"
                value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)}
                disabled={submitting} style={S.input(false)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>City</label>
                <input type="text" placeholder="e.g. Delhi"
                  value={form.city} onChange={(e) => set("city", e.target.value)}
                  disabled={submitting} style={S.input(!!fieldErrors.city)} />
                {fieldErrors.city && <div style={S.errorText}>{fieldErrors.city}</div>}
              </div>
              <div>
                <label style={S.label}>Pincode</label>
                <input type="text" placeholder="6-digit pincode"
                  value={form.pincode}
                  onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={submitting} maxLength={6} style={S.input(!!fieldErrors.pincode)} />
                {fieldErrors.pincode && <div style={S.errorText}>{fieldErrors.pincode}</div>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>State</label>
                <SelectInput value={form.state} onChange={(e) => set("state", e.target.value)}
                  disabled={submitting} hasError={!!fieldErrors.state}>
                  <option value="">— Select State —</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectInput>
                {fieldErrors.state && <div style={S.errorText}>{fieldErrors.state}</div>}
              </div>
              <div>
                <label style={S.label}>Country</label>
                <input type="text" value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  disabled={submitting} style={S.input(false)} />
              </div>
            </div>

            {submitError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, color: "#b91c1c",
              }}>{submitError}</div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "20px 28px 24px", marginTop: 16,
            display: "flex", justifyContent: "flex-end", gap: 10,
            borderTop: "1px solid #f1f5f9",
          }}>
            <button type="button" onClick={onClose} disabled={submitting} style={S.btnGhost}>Cancel</button>
            <button type="submit" disabled={submitting} style={S.btnPrimary(submitting)}>
              {submitting ? "Creating…" : "Create Institution"}
            </button>
          </div>
        </form>
      </ModalCard>
    </Overlay>
  );
}

/* ─── Edit Institution Modal ── */
function EditInstitutionModal({ inst, onClose, onSaved }) {
  const { apiFetch } = useApi();
  const [form, setForm] = useState({
    institution_name: inst.institution_name || "",
    code: inst.code || "",
    email_domain: inst.email_domain || "",
    address_line1: inst.address_line1 || "",
    address_line2: inst.address_line2 || "",
    city: inst.city || "",
    state: inst.state || "",
    country: inst.country || "India",
    pincode: inst.pincode || "",
    status: inst.status || "ACTIVE",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  function clientValidate() {
    const errs = {};
    if (!form.institution_name.trim()) errs.institution_name = "Institution name is required.";
    if (!form.code.trim()) errs.code = "Code is required.";
    if (!form.email_domain.trim()) errs.email_domain = "Email domain is required.";
    if (!form.address_line1.trim()) errs.address_line1 = "Address is required.";
    if (!form.city.trim()) errs.city = "City is required.";
    if (!form.state) errs.state = "State is required.";
    if (!form.pincode.trim()) errs.pincode = "Pincode is required.";
    else if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "Must be 6 digits.";
    if (!["ACTIVE", "INACTIVE"].includes(form.status)) errs.status = "Invalid status.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientValidate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await apiFetch(`/api/institutions/${inst.institution_id}`, {
        method: "PUT",
        body: JSON.stringify({ ...form, code: form.code.toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) onSaved(data.message);
      else if (data.errors) setFieldErrors(data.errors);
      else setSubmitError(data.message || "Failed to update institution.");
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const goingInactive = inst.status === "ACTIVE" && form.status === "INACTIVE";

  return (
    <Overlay>
      <ModalCard>
        {/* Header */}
        <div style={{
          padding: "24px 28px 20px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, background: "#fef3c7",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
          }}>✏️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Edit Institution</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Update name, code, address or status.</div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{
            marginLeft: "auto", background: "none", border: "none",
            fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1, padding: 4,
          }} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: "28px 28px 4px", display: "flex", flexDirection: "column", gap: 18 }}>

            <div>
              <label style={S.label}>Institution Name</label>
              <input ref={nameRef} type="text" value={form.institution_name}
                onChange={(e) => set("institution_name", e.target.value)}
                disabled={submitting} maxLength={200} style={S.input(!!fieldErrors.institution_name)} />
              {fieldErrors.institution_name && <div style={S.errorText}>{fieldErrors.institution_name}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>Code</label>
                <input type="text" value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  disabled={submitting} maxLength={20}
                  style={{ ...S.input(!!fieldErrors.code), fontFamily: "monospace", letterSpacing: 1 }} />
                {fieldErrors.code && <div style={S.errorText}>{fieldErrors.code}</div>}
              </div>
              <div>
                <label style={S.label}>Email Domain</label>
                <input type="text" value={form.email_domain}
                  onChange={(e) => set("email_domain", e.target.value.toLowerCase())}
                  disabled={submitting} style={S.input(!!fieldErrors.email_domain)} />
                {fieldErrors.email_domain && <div style={S.errorText}>{fieldErrors.email_domain}</div>}
              </div>
            </div>

            <div>
              <label style={S.label}>Address Line 1</label>
              <input type="text" value={form.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
                disabled={submitting} style={S.input(!!fieldErrors.address_line1)} />
              {fieldErrors.address_line1 && <div style={S.errorText}>{fieldErrors.address_line1}</div>}
            </div>

            <div>
              <label style={S.label}>
                Address Line 2{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>(optional)</span>
              </label>
              <input type="text" value={form.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
                disabled={submitting} style={S.input(false)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>City</label>
                <input type="text" value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  disabled={submitting} style={S.input(!!fieldErrors.city)} />
                {fieldErrors.city && <div style={S.errorText}>{fieldErrors.city}</div>}
              </div>
              <div>
                <label style={S.label}>Pincode</label>
                <input type="text" value={form.pincode}
                  onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={submitting} maxLength={6} style={S.input(!!fieldErrors.pincode)} />
                {fieldErrors.pincode && <div style={S.errorText}>{fieldErrors.pincode}</div>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={S.label}>State</label>
                <SelectInput value={form.state} onChange={(e) => set("state", e.target.value)}
                  disabled={submitting} hasError={!!fieldErrors.state}>
                  <option value="">— Select State —</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectInput>
                {fieldErrors.state && <div style={S.errorText}>{fieldErrors.state}</div>}
              </div>
              <div>
                <label style={S.label}>Status</label>
                <SelectInput value={form.status} onChange={(e) => set("status", e.target.value)}
                  disabled={submitting} hasError={!!fieldErrors.status}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </SelectInput>
                {fieldErrors.status && <div style={S.errorText}>{fieldErrors.status}</div>}
              </div>
            </div>

            {goingInactive && (
              <div style={{
                padding: "8px 12px", background: "#fffbeb",
                border: "1px solid #fcd34d", borderRadius: 8,
                fontSize: 12, color: "#92400e", lineHeight: 1.5,
              }}>
                Deactivating will fail unless every user of this institution is already inactive.
              </div>
            )}

            {submitError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, color: "#b91c1c",
              }}>{submitError}</div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "20px 28px 24px", marginTop: 16,
            display: "flex", justifyContent: "flex-end", gap: 10,
            borderTop: "1px solid #f1f5f9",
          }}>
            <button type="button" onClick={onClose} disabled={submitting} style={S.btnGhost}>Cancel</button>
            <button type="submit" disabled={submitting} style={S.btnPrimary(submitting)}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </ModalCard>
    </Overlay>
  );
}

/* ─── Institution Card ── */
function InstitutionCard({ inst, onEdit, onToggleStatus, isToggling }) {
  const isActive = inst.status === "ACTIVE";
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${isActive ? "rgba(0,0,0,0.07)" : "#f1f5f9"}`,
      borderRadius: 14, padding: "22px 24px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      opacity: isActive ? 1 : 0.72,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: isActive ? "#eff6ff" : "#f1f5f9",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800,
            color: isActive ? "#2563eb" : "#94a3b8",
            letterSpacing: 0.5, fontFamily: "monospace",
          }}>{inst.code || "—"}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{inst.institution_name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Since {formatDate(inst.created_at)}</div>
          </div>
        </div>
        <span style={{
          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: isActive ? "#d1fae5" : "#f1f5f9",
          color: isActive ? "#065f46" : "#94a3b8",
          whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8,
        }}>{isActive ? "Active" : "Inactive"}</span>
      </div>

      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>📍 {inst.city}, {inst.state}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>✉️ @{inst.email_domain}</div>

      <div style={{
        display: "flex", gap: 16, marginBottom: 16,
        padding: "12px 14px", background: "#f8fafc", borderRadius: 10, flex: 1,
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Departments</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{Number(inst.department_count || 0)}</div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Users</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{Number(inst.user_count || 0)}</div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Code</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{inst.code || "—"}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onEdit(inst)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid #e2e8f0",
          background: "#fff", fontSize: 12, fontWeight: 600, color: "#2563eb", cursor: "pointer",
        }}>Edit</button>
        <button onClick={() => onToggleStatus(inst)} disabled={isToggling} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid",
          borderColor: isActive ? "#fee2e2" : "#bbf7d0",
          background: "#fff", fontSize: 12, fontWeight: 600,
          color: isActive ? "#dc2626" : "#059669",
          cursor: isToggling ? "not-allowed" : "pointer",
          opacity: isToggling ? 0.6 : 1,
        }}>{isToggling ? "…" : isActive ? "Deactivate" : "Activate"}</button>
      </div>
    </div>
  );
}

/* ─── Skeleton Card ── */
function SkeletonCard() {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, padding: "22px 24px" }}>
      {[55, 100, 70, 40].map((w, i) => (
        <div key={i} style={{
          height: i === 1 ? 56 : 14, width: `${w}%`,
          background: "#f1f5f9", borderRadius: 8, marginBottom: 14,
          animation: "pulse 1.4s ease-in-out infinite",
        }} />
      ))}
    </div>
  );
}

function StyledSelect({ value, onChange, children, minWidth = 180 }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9,
      fontSize: 13, fontWeight: 500, color: "#1e293b", background: "#fff",
      outline: "none", cursor: "pointer", minWidth,
    }}>{children}</select>
  );
}

/* ─── Main Page ── */
export default function InstitutionManagementPage() {
  const { apiFetch } = useApi();
  const [institutions, setInstitutions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingInst, setEditingInst] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), type === "error" ? 5500 : 3000);
  }, []);

  const fetchInstitutions = useCallback(async () => {
    setLoading(true); setError(null);
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

  useEffect(() => { fetchInstitutions(); }, [fetchInstitutions]);

  async function handleToggleStatus(inst) {
    const nextStatus = inst.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(inst.institution_id);
    try {
      const res = await apiFetch(`/api/institutions/${inst.institution_id}`, {
        method: "PUT",
        body: JSON.stringify({ ...inst, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) { showToast(data.message, "success"); fetchInstitutions(); }
      else showToast(data.message || "Failed to update status.", "error");
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to update institution status.", "error");
    } finally { setTogglingId(null); }
  }

  const filtered = statusFilter === "ALL"
    ? institutions
    : institutions.filter((i) => i.status === statusFilter);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {showCreate && (
        <CreateInstitutionModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => { setShowCreate(false); showToast(msg, "success"); fetchInstitutions(); }}
        />
      )}
      {editingInst && (
        <EditInstitutionModal
          inst={editingInst}
          onClose={() => setEditingInst(null)}
          onSaved={(msg) => { setEditingInst(null); showToast(msg, "success"); fetchInstitutions(); }}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2563eb14", borderRadius: 8, padding: "4px 12px", marginBottom: 12 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: 1 }}>Institution Management</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>Institutions</h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Create and manage institutions on the platform.</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: "10px 20px", borderRadius: 10, border: "none",
          background: "#2563eb", fontSize: 13, fontWeight: 700, color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Institution
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 20px", color: "#b91c1c", fontSize: 14, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {!error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {loading ? "Loading institutions…" : (
              <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong>{" "}
              {statusFilter === "ALL" ? "institution(s)" : `${statusFilter.toLowerCase()} institution(s)`}</>
            )}
          </div>
          <StyledSelect value={statusFilter} onChange={setStatusFilter} minWidth={150}>
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </StyledSelect>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length > 0 ? (
          filtered.map((inst) => (
            <InstitutionCard key={inst.institution_id} inst={inst}
              onEdit={setEditingInst} onToggleStatus={handleToggleStatus}
              isToggling={togglingId === inst.institution_id} />
          ))
        ) : (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "64px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
              {statusFilter !== "ALL" ? `No ${statusFilter.toLowerCase()} institutions` : "No institutions yet"}
            </div>
            <div style={{ fontSize: 13 }}>
              {statusFilter === "ALL" ? 'Click "New Institution" to add the first one.' : 'Try switching the filter to "All Statuses".'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}