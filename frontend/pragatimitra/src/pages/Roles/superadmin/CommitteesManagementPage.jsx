import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";
import FormScreen from "../../../components/shared/FormScreen";
import { S, Toast, isAuthError, formatDate } from "../../../components/shared/formUtils";

const TYPE_COLORS = {
  GB:     { bg: "#eff6ff", text: "#2563eb" },
  EC:     { bg: "#f0fdf4", text: "#059669" },
  SFC:    { bg: "#fff7ed", text: "#ea580c" },
  ASAC:   { bg: "#fdf4ff", text: "#9333ea" },
  OTHERS: { bg: "#f8fafc", text: "#64748b" },
};
const DEFAULT_COLOR = { bg: "#f8fafc", text: "#64748b" };

/* ─── Slim overlay used only for the delete confirmation ──── */
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

/* ─── Member Editor ──────────────────────────────────────────── */
function MemberEditor({ members, onChange, disabled, error }) {
  function update(idx, field, value) {
    onChange(members.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }
  function addRow() {
    onChange([...members, { name: "", designation: "" }]);
  }
  function removeRow(idx) {
    onChange(members.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label style={S.label}>Members</label>
      {members.map((m, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            type="text"
            placeholder="Full name"
            value={m.name}
            onChange={(e) => update(i, "name", e.target.value)}
            disabled={disabled}
            maxLength={120}
            style={S.input(false)}
          />
          <input
            type="text"
            placeholder="Designation"
            value={m.designation}
            onChange={(e) => update(i, "designation", e.target.value)}
            disabled={disabled}
            maxLength={120}
            style={S.input(false)}
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            disabled={disabled || members.length === 1}
            style={{
              width: 36,
              height: 36,
              border: "1.5px solid #fecaca",
              borderRadius: 8,
              background: "#fff",
              color: "#dc2626",
              fontSize: 16,
              cursor: disabled || members.length === 1 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              opacity: members.length === 1 ? 0.4 : 1,
            }}
            title="Remove member"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        style={{
          marginTop: 2,
          padding: "6px 14px",
          border: "1.5px dashed #cbd5e1",
          borderRadius: 8,
          background: "#f8fafc",
          fontSize: 12,
          fontWeight: 600,
          color: "#2563eb",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Member
      </button>
      {error && <div style={S.errorText}>{error}</div>}
    </div>
  );
}

const emptyMember = () => ({ name: "", designation: "" });

/* ─── Committee Form (create + edit) ────────────────────────────
   Rendered as a full screen instead of an overlay modal.
─────────────────────────────────────────────────────────────── */
function CommitteeForm({
  mode,
  entity,
  institutions,
  defaultInstituteId,
  committeeTypes,
  positions,
  financeYears,
  onCreated,
  onSaved,
  onBack,
}) {
  const { apiFetch } = useApi();
  const isEdit = mode === "edit";

  const [form, setForm] = useState({
    institute_id:   entity?.institute_id   ?? defaultInstituteId ?? "",
    finance_year:   entity?.finance_year   ?? financeYears[0]    ?? "",
    committee_type: entity?.committee_type ?? "",
    position:       entity?.position       ?? "",
    contact:        entity?.contact        ?? "",
    members: entity?.members?.length ? entity.members : [emptyMember()],
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setFieldErrors({});
    try {
      const res = isEdit
        ? await apiFetch(`/api/committees/${entity.id}`, {
            method: "PUT",
            body: JSON.stringify(form),
          })
        : await apiFetch("/api/committees", {
            method: "POST",
            body: JSON.stringify({
              ...form,
              institute_id: form.institute_id || defaultInstituteId,
            }),
          });
      const data = await res.json();
      if (data.success) {
        if (isEdit) {
          onSaved(data.message);
        } else {
          const targetId = form.institute_id || defaultInstituteId;
          onCreated(targetId, data.message);
        }
      } else if (data.errors) {
        setFieldErrors(data.errors);
      } else {
        setSubmitError(data.message || `Failed to ${isEdit ? "update" : "create"} committee.`);
      }
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScreen
      pageTitle="Committees"
      formTitle={isEdit ? "Edit Committee" : "New Committee"}
      formSubtitle="Fill in the details below."
      icon={isEdit ? "✏️" : "🏛️"}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? "Save Changes" : "Create Committee"}
      submitError={submitError}
    >
      {/* Institution — create only */}
      {!isEdit && institutions?.length > 0 && (
        <div>
          <label style={S.label}>Institution</label>
          <select
            ref={firstRef}
            value={form.institute_id}
            onChange={(e) => set("institute_id", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.institute_id)}
          >
            {institutions.map((inst) => (
              <option key={inst.institution_id} value={inst.institution_id}>
                {inst.institution_name}
              </option>
            ))}
          </select>
          {fieldErrors.institute_id && (
            <div style={S.errorText}>{fieldErrors.institute_id}</div>
          )}
        </div>
      )}

      {/* Finance Year + Committee Type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={S.label}>Finance Year</label>
          <select
            ref={isEdit ? firstRef : undefined}
            value={form.finance_year}
            onChange={(e) => set("finance_year", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.finance_year)}
          >
            <option value="">Select year</option>
            {financeYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {fieldErrors.finance_year && (
            <div style={S.errorText}>{fieldErrors.finance_year}</div>
          )}
        </div>

        <div>
          <label style={S.label}>Committee Type</label>
          <select
            value={form.committee_type}
            onChange={(e) => set("committee_type", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.committee_type)}
          >
            <option value="">Select type</option>
            {committeeTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {fieldErrors.committee_type && (
            <div style={S.errorText}>{fieldErrors.committee_type}</div>
          )}
        </div>
      </div>

      {/* Position + Contact */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={S.label}>Position</label>
          <select
            value={form.position}
            onChange={(e) => set("position", e.target.value)}
            disabled={submitting}
            style={S.select(!!fieldErrors.position)}
          >
            <option value="">Select position</option>
            {positions.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {fieldErrors.position && <div style={S.errorText}>{fieldErrors.position}</div>}
        </div>

        <div>
          <label style={S.label}>
            Contact{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              (optional)
            </span>
          </label>
          <input
            type="text"
            placeholder="Phone / email"
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            disabled={submitting}
            maxLength={100}
            style={S.input(!!fieldErrors.contact)}
          />
          {fieldErrors.contact && <div style={S.errorText}>{fieldErrors.contact}</div>}
        </div>
      </div>

      {/* Members */}
      <MemberEditor
        members={form.members}
        onChange={(v) => {
          setForm((f) => ({ ...f, members: v }));
          if (fieldErrors.members) setFieldErrors((e) => ({ ...e, members: "" }));
        }}
        disabled={submitting}
        error={fieldErrors.members}
      />
    </FormScreen>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────────────── */
function DeleteModal({ committee, onClose, onConfirm, deleting, getTypeLabel }) {
  return (
    <Overlay>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#fef2f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              margin: "0 auto 16px",
            }}
          >
            🗑️
          </div>
          <div
            style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}
          >
            Delete Committee?
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            <strong>{getTypeLabel(committee.committee_type)}</strong> (
            {committee.finance_year}) will be permanently removed. This cannot be undone.
          </div>
        </div>
        <div
          style={{
            padding: "0 28px 24px",
            display: "flex",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <button onClick={onClose} disabled={deleting} style={S.btnGhost}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              ...S.btnPrimary(deleting),
              background: deleting ? "#fca5a5" : "#dc2626",
            }}
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Committee Card ─────────────────────────────────────────── */
function CommitteeCard({
  committee,
  onEdit,
  onToggleStatus,
  onDelete,
  isToggling,
  getTypeLabel,
  getPosLabel,
}) {
  const isActive = committee.status === "ACTIVE";
  const colors = TYPE_COLORS[committee.committee_type] ?? DEFAULT_COLOR;
  const members = Array.isArray(committee.members) ? committee.members : [];

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${isActive ? "rgba(0,0,0,0.07)" : "#f1f5f9"}`,
        borderRadius: 14,
        padding: "22px 24px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        opacity: isActive ? 1 : 0.75,
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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div
            style={{
              minWidth: 44,
              height: 44,
              borderRadius: 11,
              background: colors.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 800,
              color: colors.text,
              letterSpacing: 0.3,
              padding: "0 6px",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {getTypeLabel(committee.committee_type)
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 4)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {getTypeLabel(committee.committee_type)}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {committee.finance_year} · {getPosLabel(committee.position)}
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
          marginBottom: 14,
          padding: "12px 14px",
          background: "#f8fafc",
          borderRadius: 10,
          flex: 1,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Members</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {members.length}
          </div>
        </div>
        {committee.contact && (
          <>
            <div style={{ width: 1, background: "#e2e8f0" }} />
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Contact</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                {committee.contact}
              </div>
            </div>
          </>
        )}
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Added</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
            {formatDate(committee.created_at)}
          </div>
        </div>
      </div>

      {/* Member preview */}
      {members.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {members.slice(0, 3).map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 0",
                borderBottom:
                  i < Math.min(members.length, 3) - 1 ? "1px solid #f1f5f9" : "none",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: colors.bg,
                  color: colors.text,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {m.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#1e293b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name}
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{m.designation}</div>
              </div>
            </div>
          ))}
          {members.length > 3 && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, paddingLeft: 34 }}>
              +{members.length - 3} more member{members.length - 3 > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onEdit(committee)}
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
          onClick={() => onToggleStatus(committee)}
          disabled={isToggling}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: `1.5px solid ${isActive ? "#fee2e2" : "#bbf7d0"}`,
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
        <button
          onClick={() => onDelete(committee)}
          style={{
            width: 36,
            padding: "8px 0",
            borderRadius: 8,
            border: "1.5px solid #fecaca",
            background: "#fff",
            fontSize: 14,
            color: "#dc2626",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Delete"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton + Filter Select ───────────────────────────────── */
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
      {[55, 100, 70, 40, 85].map((w, i) => (
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

function FilterSelect({ value, onChange, children, minWidth = 160 }) {
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

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function CommitteeManagementPage() {
  const { apiFetch } = useApi();

  const [committeeTypes, setCommitteeTypes] = useState([]);
  const [positions,      setPositions]      = useState([]);
  const [financeYears,   setFinanceYears]   = useState([]);
  const [loadingMeta,    setLoadingMeta]    = useState(true);
  const [metaError,      setMetaError]      = useState(null);

  const [institutions,        setInstitutions]        = useState([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState(null);
  const [committees,          setCommittees]          = useState([]);

  const [yearFilter,   setYearFilter]   = useState("ALL");
  const [typeFilter,   setTypeFilter]   = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery,  setSearchQuery]  = useState("");

  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingCommittees,   setLoadingCommittees]   = useState(false);
  const [institutionsError,   setInstitutionsError]   = useState(null);

  /* formView: null = list, { mode: 'create'|'edit', entity } = form screen */
  const [formView,      setFormView]      = useState(null);
  const [deletingItem,  setDeletingItem]  = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting,    setIsDeleting]    = useState(false);
  const [togglingId,    setTogglingId]    = useState(null);

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

  const getTypeLabel = useCallback(
    (value) =>
      committeeTypes.find((t) => t.value === value)?.label ??
      value?.replace(/_/g, " ") ??
      value,
    [committeeTypes]
  );
  const getPosLabel = useCallback(
    (value) =>
      positions.find((p) => p.value === value)?.label ??
      value?.replace(/_/g, " ") ??
      value,
    [positions]
  );

  /* ── Fetch meta ── */
  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const res  = await apiFetch("/api/committees/meta");
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setCommitteeTypes(data.data.committeeTypes ?? []);
          setPositions(data.data.positions          ?? []);
          setFinanceYears(data.data.financeYears    ?? []);
        } else {
          setMetaError(data.message || "Failed to load form options.");
        }
      } catch (err) {
        if (!cancelled && !isAuthError(err))
          setMetaError("Failed to load form options. Please refresh.");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    loadMeta();
    return () => { cancelled = true; };
  }, [apiFetch]);

  /* ── Fetch institutions ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingInstitutions(true);
      setInstitutionsError(null);
      try {
        const res  = await apiFetch("/api/departments/institutions");
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data.length > 0) {
          setInstitutions(data.data);
          setSelectedInstituteId(data.data[0].institution_id);
        } else if (data.success) {
          setInstitutions([]);
          setInstitutionsError("No institutions found in the system.");
        } else {
          setInstitutionsError(data.message || "Failed to load institutions.");
        }
      } catch (err) {
        if (!cancelled && !isAuthError(err))
          setInstitutionsError("Failed to load institutions. Please refresh the page.");
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiFetch]);

  /* ── Fetch committees ── */
  const fetchCommittees = useCallback(
    async (instituteId) => {
      if (!instituteId) return;
      setLoadingCommittees(true);
      setCommittees([]);
      try {
        const res  = await apiFetch(`/api/committees?institute_id=${instituteId}`);
        const data = await res.json();
        if (data.success) setCommittees(data.data);
        else showToast(data.message || "Failed to load committees.", "error");
      } catch (err) {
        if (!isAuthError(err)) showToast("Failed to load committees.", "error");
      } finally {
        setLoadingCommittees(false);
      }
    },
    [apiFetch, showToast]
  );

  useEffect(() => {
    fetchCommittees(selectedInstituteId);
  }, [selectedInstituteId, fetchCommittees]);

  /* ── Toggle status ── */
  async function handleToggleStatus(committee) {
    const nextStatus = committee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(committee.id);
    try {
      const res  = await apiFetch(`/api/committees/${committee.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchCommittees(selectedInstituteId);
      } else {
        showToast(data.message || "Failed to update status.", "error");
      }
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to update status.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  /* ── Delete ── */
  async function handleDelete() {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res  = await apiFetch(`/api/committees/${deletingItem.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeletingItem(null);
        setConfirmDelete(false);
        showToast(data.message, "success");
        fetchCommittees(selectedInstituteId);
      } else {
        showToast(data.message || "Failed to delete committee.", "error");
      }
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to delete committee.", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  /* ── Callbacks from CommitteeForm ── */
  function handleCreated(targetId, message) {
    setFormView(null);
    showToast(message, "success");
    if (String(targetId) === String(selectedInstituteId)) {
      fetchCommittees(selectedInstituteId);
    } else {
      setSelectedInstituteId(targetId);
    }
  }

  function handleSaved(message) {
    setFormView(null);
    showToast(message, "success");
    fetchCommittees(selectedInstituteId);
  }

  /* ── Render form screen when formView is set ── */
  if (formView) {
    return (
      <CommitteeForm
        mode={formView.mode}
        entity={formView.entity}
        institutions={institutions}
        defaultInstituteId={selectedInstituteId}
        committeeTypes={committeeTypes}
        positions={positions}
        financeYears={financeYears}
        onCreated={handleCreated}
        onSaved={handleSaved}
        onBack={() => setFormView(null)}
      />
    );
  }

  /* ── Client-side filter ── */
  const filteredCommittees = committees.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (yearFilter   !== "ALL" && c.finance_year !== yearFilter) return false;
    if (typeFilter   !== "ALL" && c.committee_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const memberText = JSON.stringify(c.members).toLowerCase();
      if (
        !getTypeLabel(c.committee_type).toLowerCase().includes(q) &&
        !getPosLabel(c.position).toLowerCase().includes(q) &&
        !(c.contact || "").toLowerCase().includes(q) &&
        !memberText.includes(q)
      )
        return false;
    }
    return true;
  });

  const availableYears = [...new Set(committees.map((c) => c.finance_year))].sort().reverse();
  const selectedInstitutionName =
    institutions.find(
      (i) => String(i.institution_id) === String(selectedInstituteId)
    )?.institution_name ?? "";
  const isReady = !loadingMeta && !loadingInstitutions;

  /* ── Meta error screen ── */
  if (metaError) {
    return (
      <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "20px 24px",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {metaError}
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.42}}`}</style>

      {/* Delete confirm overlay (stays as modal — it's a short confirm, not a form) */}
      {confirmDelete && deletingItem && (
        <DeleteModal
          committee={deletingItem}
          onClose={() => { setDeletingItem(null); setConfirmDelete(false); }}
          onConfirm={handleDelete}
          deleting={isDeleting}
          getTypeLabel={getTypeLabel}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page header */}
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
              background: "#0891b214",
              borderRadius: 8,
              padding: "4px 12px",
              marginBottom: 12,
            }}
          >
            <div
              style={{ width: 7, height: 7, borderRadius: "50%", background: "#0891b2" }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#0891b2",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Committee Management
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
            Management Committees
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Configure governing bodies, councils, and committees for each finance year.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          {isReady && !institutionsError && institutions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...S.label, marginBottom: 4 }}>Institution</span>
              <FilterSelect
                value={selectedInstituteId ?? ""}
                onChange={(v) => setSelectedInstituteId(v)}
                minWidth={220}
              >
                {institutions.map((inst) => (
                  <option key={inst.institution_id} value={inst.institution_id}>
                    {inst.institution_name}
                  </option>
                ))}
              </FilterSelect>
            </div>
          )}
          {isReady && !institutionsError && institutions.length > 0 && (
            <button
              onClick={() => setFormView({ mode: "create", entity: null })}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "#0891b2",
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
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Committee
            </button>
          )}
        </div>
      </div>

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

      {/* Filter bar */}
      {isReady && !institutionsError && (
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
            {loadingCommittees ? (
              "Loading committees…"
            ) : (
              <>
                <strong style={{ color: "#1e293b" }}>{filteredCommittees.length}</strong>{" "}
                committee{filteredCommittees.length !== 1 ? "s" : ""}
                {selectedInstitutionName && (
                  <>
                    {" "}in{" "}
                    <strong style={{ color: "#1e293b" }}>{selectedInstitutionName}</strong>
                  </>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search committees…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 9,
                fontSize: 13,
                color: "#1e293b",
                background: "#fff",
                outline: "none",
                minWidth: 180,
              }}
            />

            <FilterSelect value={yearFilter} onChange={setYearFilter} minWidth={130}>
              <option value="ALL">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </FilterSelect>

            <FilterSelect value={typeFilter} onChange={setTypeFilter} minWidth={170}>
              <option value="ALL">All Types</option>
              {committeeTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </FilterSelect>

            <FilterSelect value={statusFilter} onChange={setStatusFilter} minWidth={140}>
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </FilterSelect>
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
          gap: 16,
        }}
      >
        {loadingMeta || loadingCommittees ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filteredCommittees.length > 0 ? (
          filteredCommittees.map((c) => (
            <CommitteeCard
              key={c.id}
              committee={c}
              onEdit={(item) => setFormView({ mode: "edit", entity: item })}
              onToggleStatus={handleToggleStatus}
              onDelete={(item) => { setDeletingItem(item); setConfirmDelete(true); }}
              isToggling={togglingId === c.id}
              getTypeLabel={getTypeLabel}
              getPosLabel={getPosLabel}
            />
          ))
        ) : (
          isReady && (
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
                {typeFilter !== "ALL" ||
                yearFilter !== "ALL" ||
                statusFilter !== "ALL" ||
                searchQuery
                  ? "No committees match the current filters"
                  : "No committees yet"}
              </div>
              <div style={{ fontSize: 13 }}>
                {typeFilter === "ALL" &&
                yearFilter === "ALL" &&
                statusFilter === "ALL" &&
                !searchQuery
                  ? 'Click "New Committee" to add the first one.'
                  : "Try adjusting the filters above."}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
