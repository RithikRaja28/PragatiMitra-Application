import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { PageContainer, PageHeader, Button, Card, EmptyState } from "../../../ui";
import { Select } from "../../../components/shared/ui";
import { Plus, Star, AlertTriangle } from "lucide-react";
import { S, Toast, ConfirmDialog, isAuthError } from "../../../components/shared/formUtils";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t as translate } from "../../../i18n/translations";

/**
 * Roles that are institution-wide — not scoped to any single department.
 * Matches on role.name (machine key) or role.display_name (for display-only labels).
 */
function isInstituteWideRole(role) {
  if (!role) return false;
  const n = (role.name || "").toLowerCase();
  const d = (role.display_name || "").toLowerCase();
  return (
    n === "super_admin" ||
    n === "institute_admin" ||
    n === "finance_admin" ||
    d.includes("director") ||
    d.includes("publication")
  );
}

/* Roles selectable as a workflow step's approver — must actually be able to act
   on a review (has a Review Queue in the app and is matched by the backend's
   approval logic in routes/builder/approvals.js). directors_office is excluded
   separately: director approval is a fixed final gate after the whole chain
   (section.needs_director_approval), not a configurable step. */
const WORKFLOW_STEP_ASSIGNABLE_ROLES = new Set(["department_admin", "institute_admin", "reviewer"]);

/* ─── Design tokens ────────────────────────────────────────────── */
const C = {
  primary: "#2563eb",
  primaryLt: "#dbeafe",
  text: "#1e293b",
  textSub: "#64748b",
  border: "rgba(37,99,235,0.12)",
  bg: "#f8f9fb",
  surface: "#ffffff",
  danger: "#ef4444",
  dangerLt: "#fef2f2",
  success: "#059669",
  successLt: "#d1fae5",
};

const card = {
  background: C.surface,
  border: "1px solid rgba(0,0,0,0.07)",
  borderRadius: 14,
  boxShadow: "0 1px 6px rgba(99,102,241,0.07)",
};

/* ─── Local ID counter (for step keys only) ─────────────────────── */
let _uid = 0;
const uid = () => `s_${++_uid}`;

/* ─── Fresh blank step ──────────────────────────────────────────── */
const blankStep = () => ({
  _id: uid(), name: "", assignType: "ROLE",
  role: "", roleDept: "",    // for ROLE mode: role + optional dept scope
  deptFilter: "", userId: "", // for USER mode: dept filter + specific user
});

/* ─── Map existing DB step → local state ───────────────────────── */
function dbStepToLocal(s) {
  return {
    _id: uid(),
    dbId: s.id,
    name: s.step_name || "",
    assignType: s.approver_user_id ? "USER" : "ROLE",
    role: s.approver_role || "",
    roleDept: s.approver_department_id || "",  // dept scope for ROLE type
    userId: s.approver_user_id || "",
    deptFilter: s.approver_department_id || "",  // pre-fill dept filter for USER type
    approverName: s.approver_name || "",
    approverDeptName: s.approver_department_name || "",
  };
}

/* ─── Step card ─────────────────────────────────────────────────── */
function StepCard({ step, index, total, roles, departments, allUsers, onChange, onRemove, onMoveUp, onMoveDown, error, readOnly }) {
  const deptName = departments.find(d => d.department_id === step.deptFilter)?.name;
  const filtered = step.deptFilter
    ? allUsers.filter(u => u.department_name === deptName)
    : allUsers;

  const iconBtn = {
    width: 26, height: 26, borderRadius: 6,
    border: "1px solid #e2e8f0", background: "#f8fafc",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 12, flexShrink: 0,
    transition: "background 0.12s, border-color 0.12s",
  };

  return (
    <div style={{
      background: error ? "#fff8f8" : "#f8fafc",
      border: `1.5px solid ${error ? "#fca5a5" : C.border}`,
      borderRadius: 12, padding: "14px 16px", position: "relative",
    }}>
      {/* Row 1: Number badge + name input + controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          background: C.primary, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800,
        }}>
          {index + 1}
        </div>
        <input
          type="text"
          placeholder={`Step ${index + 1} name, e.g. Department Head Review`}
          value={step.name}
          onChange={e => onChange({ name: e.target.value })}
          disabled={readOnly}
          readOnly={readOnly}
          style={{
            ...S.input(!!error), flex: 1, height: 34,
            ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}),
          }}
        />
        {!readOnly && (
          <>
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}
              title="Move step up"
            >↑</button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              style={{ ...iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}
              title="Move step down"
            >↓</button>
            <button
              onClick={onRemove}
              style={{ ...iconBtn, borderColor: "#fee2e2", color: C.danger }}
              title="Remove step"
            >✕</button>
          </>
        )}
      </div>

      {/* Row 2: Assign-to toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textSub, alignSelf: "center", marginRight: 4 }}>
          Assign to:
        </span>
        {[
          { key: "ROLE", label: "Role (any user)" },
          { key: "USER", label: "Specific user" },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => !readOnly && onChange({ assignType: opt.key, role: "", roleDept: "", userId: "", deptFilter: "" })}
            disabled={readOnly}
            style={{
              padding: "4px 13px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              border: `1.5px solid ${step.assignType === opt.key ? C.primary : "#e2e8f0"}`,
              background: step.assignType === opt.key ? "#eff6ff" : "#fff",
              color: step.assignType === opt.key ? "#1d4ed8" : C.textSub,
              cursor: readOnly ? "default" : "pointer", transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Row 3: ROLE mode — role + optional department scope */}
      {step.assignType === "ROLE" && (() => {
        const selectedRole = roles.find(r => r.name === step.role);
        const instWide = isInstituteWideRole(selectedRole);
        return (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                Role <span style={{ color: "#ef4444" }}>*</span>
              </div>
              <Select
                value={step.role}
                onChange={e => {
                  const r = roles.find(ro => ro.name === e.target.value);
                  onChange({ role: e.target.value, roleDept: isInstituteWideRole(r) ? "" : step.roleDept });
                }}
                disabled={readOnly}
              >
                <option value="">— Select a role —</option>
                {roles.filter(r => WORKFLOW_STEP_ASSIGNABLE_ROLES.has(r.name)).map(r => (
                  <option key={r.id} value={r.name}>{r.display_name}</option>
                ))}
              </Select>
            </div>

            {/* Department scope — hidden for institution-wide roles */}
            {!instWide ? (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                  In department <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
                </div>
                <select
                  value={step.roleDept}
                  onChange={e => onChange({ roleDept: e.target.value })}
                  disabled={readOnly}
                  style={{ ...S.select(false), ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}) }}
                >
                  <option value="">All departments</option>
                  {departments.map(d => (
                    <option key={d.department_id} value={d.department_id}>{d.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{
                  padding: "8px 12px", borderRadius: 8, fontSize: 11, lineHeight: 1.4,
                  background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1",
                }}>
                  Institution-wide role — not scoped to a department.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Row 3: USER mode — dept filter + specific user */}
      {step.assignType === "USER" && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Filter by dept
            </div>
            <select
              value={step.deptFilter}
              onChange={e => onChange({ deptFilter: e.target.value, userId: "" })}
              disabled={readOnly}
              style={{ ...S.select(false), ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}) }}
            >
              <option value="">All departments</option>
              {departments.map(d => (
                <option key={d.department_id} value={d.department_id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Select user <span style={{ color: "#ef4444" }}>*</span>
            </div>
            <select
              value={step.userId}
              onChange={e => onChange({ userId: e.target.value })}
              disabled={readOnly}
              style={{ ...S.select(false), ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}) }}
            >
              <option value="">— Select a user —</option>
              {filtered.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                  {u.role_display_name && u.role_display_name !== "No Role" ? ` (${u.role_display_name})` : ""}
                  {u.department_name ? ` · ${u.department_name}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

/* ─── Workflow form (Create / Edit / View) ──────────────────────── */
function WorkflowForm({ mode, entity, onSaved, onBack }) {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const instId = user?.institutionId;
  const isEdit = mode === "edit";
  const isView = mode === "view";
  const readOnly = isView;

  const [form, setForm] = useState({ name: entity?.name || "", description: entity?.description || "" });
  const [steps, setSteps] = useState(() =>
    (isEdit || isView) && entity?.steps?.length
      ? entity.steps.map(dbStepToLocal)
      : [blankStep()]
  );
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [stepErrors, setStepErrors] = useState({});
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  /* Load reference data */
  useEffect(() => {
    if (!instId) return;
    setLoadingData(true);
    Promise.all([
      apiFetch("/api/builder/workflows/roles").then(r => r.json()),
      apiFetch(`/api/lookup/departments?institution_id=${instId}`).then(r => r.json()),
      apiFetch(`/api/lookup/users?institution_id=${instId}&exclude_roles=super_admin`).then(r => r.json()),
    ]).then(([rolesData, deptsData, usersData]) => {
      if (rolesData.success) setRoles(rolesData.data || []);
      if (deptsData.success) setDepartments(deptsData.departments || []);
      if (usersData.success) setAllUsers(usersData.users || []);
    }).catch(() => { }).finally(() => setLoadingData(false));
  }, [instId]);

  function setF(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (submitError) setSubmitError("");
  }

  function updateStep(idx, patch) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
    if (stepErrors[idx]) setStepErrors(e => { const n = { ...e }; delete n[idx]; return n; });
  }
  function addStep() { setSteps(prev => [...prev, blankStep()]); }
  function removeStep(idx) { setSteps(prev => prev.filter((_, i) => i !== idx)); }
  function moveStep(idx, dir) {
    const to = idx + dir;
    if (to < 0 || to >= steps.length) return;
    setSteps(prev => {
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) { setSubmitError("Workflow name is required."); return false; }
    if (steps.length === 0) { setSubmitError("Add at least one approval step."); return false; }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.name.trim()) { errs[i] = "Step name is required."; continue; }
      if (s.assignType === "ROLE" && !s.role) errs[i] = "Select a role for this step.";
      if (s.assignType === "USER" && !s.userId) errs[i] = "Select a user for this step.";
    }
    setStepErrors(errs);
    if (Object.keys(errs).length) { setSubmitError("Fix the errors in the steps below."); return false; }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isEdit && Number(entity?.usage_count || 0) > 0) {
      setSubmitError("This workflow is in use and cannot be modified.");
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const stepsPayload = steps.map(s => ({
        step_name: s.name.trim(),
        approver_role: s.assignType === "ROLE" ? s.role : null,
        approver_user_id: s.assignType === "USER" ? s.userId : null,
        approver_department_id: s.assignType === "ROLE" ? (s.roleDept || null)
          : s.assignType === "USER" ? (s.deptFilter || null)
            : null,
      }));

      if (!isEdit) {
        /* ── CREATE ── */
        const res = await apiFetch("/api/builder/workflows", {
          method: "POST",
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, steps: stepsPayload }),
        });
        const data = await res.json();
        if (!data.success) { setSubmitError(data.message || "Failed to create workflow."); return; }
        onSaved("Workflow template created successfully.");
      } else {
        /* ── EDIT ──
           1. Update metadata
           2. Delete old steps
           3. Re-insert new steps in order  */
        const metaRes = await apiFetch(`/api/builder/workflows/${entity.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null }),
        });
        const metaData = await metaRes.json();
        if (!metaData.success) { setSubmitError(metaData.message || "Failed to update workflow."); return; }

        for (const s of (entity.steps || [])) {
          await apiFetch(`/api/builder/workflows/${entity.id}/steps/${s.id}`, { method: "DELETE" });
        }
        for (const s of stepsPayload) {
          await apiFetch(`/api/builder/workflows/${entity.id}/steps`, {
            method: "POST",
            body: JSON.stringify(s),
          });
        }
        onSaved("Workflow template updated.");
      }
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionHead = {
    fontSize: 11, fontWeight: 700, color: C.textSub,
    textTransform: "uppercase", letterSpacing: "0.08em",
    marginBottom: 12, paddingBottom: 6,
    borderBottom: `1px solid ${C.border}`,
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: "transparent", minHeight: "100%", padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid #e2e8f0", background: "#fff",
            fontSize: 12, fontWeight: 600, color: C.textSub, cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <div style={{ marginLeft: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
            {isView ? "View Workflow Template" : isEdit ? "Edit Workflow Template" : "New Workflow Template"}
          </div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
            {isView
              ? "Read-only view — this workflow is in use and cannot be modified."
              : isEdit
                ? "Update the name/description and step configuration."
                : "Define a reusable approval chain. Each step represents one review/approval stage."}
          </div>
        </div>
      </div>

      {/* Read-only notice for view mode */}
      {isView && (
        <div style={{
          background: "#f0f9ff", border: "1px solid #bae6fd",
          borderRadius: 12, padding: "14px 20px", marginBottom: 24,
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          <div style={{ fontSize: 13, color: "#0369a1", lineHeight: 1.5 }}>
            <strong>Read-only view.</strong> This workflow is assigned to{" "}
            <strong>{entity?.usage_count} section{Number(entity?.usage_count) !== 1 ? "s" : ""}</strong> and cannot be modified.
            Create a new workflow template to make changes for future sections.
          </div>
        </div>
      )}

      {/* Hard block if edit mode somehow reached for in-use workflow */}
      {isEdit && Number(entity?.usage_count || 0) > 0 && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 12, padding: "18px 22px", marginBottom: 24,
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 2 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
              This workflow cannot be edited
            </div>
            <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.6 }}>
              <strong>"{entity.name}"</strong> is assigned to{" "}
              <strong>{entity.usage_count} section{Number(entity.usage_count) !== 1 ? "s" : ""}</strong>.
              Modifying it would affect all those sections' approval chains.
              To make changes, create a new workflow template.
            </div>
            <button
              onClick={onBack}
              style={{
                marginTop: 12, padding: "7px 16px", borderRadius: 8,
                border: "1px solid #fca5a5", background: "#fff",
                fontSize: 12, fontWeight: 600, color: "#b91c1c", cursor: "pointer",
              }}
            >
              ← Go Back
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>

          {/* ── Left: metadata ── */}
          <div style={{ ...card, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={sectionHead}>Template Details</div>

            <div>
              <label style={S.label}>
                Template Name <span style={{ color: C.danger }}>*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                placeholder="e.g. Standard 3-Level Approval"
                value={form.name}
                onChange={e => setF("name", e.target.value)}
                disabled={submitting || readOnly}
                readOnly={readOnly}
                maxLength={160}
                style={{ ...S.input(false), ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}) }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                A clear name helps contributors understand which workflow they're under.
              </div>
            </div>

            <div>
              <label style={S.label}>Description</label>
              <textarea
                placeholder="Optional: describe when to use this workflow…"
                value={form.description}
                onChange={e => setF("description", e.target.value)}
                disabled={submitting || readOnly}
                readOnly={readOnly}
                rows={3}
                style={{
                  ...S.input(false), height: "auto", padding: "9px 14px",
                  resize: readOnly ? "none" : "vertical",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  ...(readOnly ? { background: "#f8fafc", color: "#475569" } : {}),
                }}
              />
            </div>

            {/* Step chain preview */}
            {steps.length > 0 && steps.some(s => s.name) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, marginBottom: 8 }}>
                  APPROVAL CHAIN PREVIEW
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {steps.map((s, i) => (
                    <div key={s._id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        background: "#eff6ff", border: `1px solid ${C.primaryLt}`,
                        borderRadius: 8, padding: "4px 10px",
                        fontSize: 11, fontWeight: 600, color: "#1d4ed8",
                      }}>
                        <span style={{ opacity: 0.6, marginRight: 4 }}>{i + 1}.</span>
                        {s.name || "…"}
                        {s.assignType === "ROLE" && s.role && (
                          <span style={{ opacity: 0.65, marginLeft: 4, fontSize: 10 }}>
                            [{roles.find(r => r.name === s.role)?.display_name || s.role}
                            {s.roleDept ? ` @ ${departments.find(d => d.department_id === s.roleDept)?.name || ""}` : ""}]
                          </span>
                        )}
                        {s.assignType === "USER" && s.userId && (
                          <span style={{ opacity: 0.65, marginLeft: 4, fontSize: 10 }}>
                            [{allUsers.find(u => u.id === s.userId)?.full_name || "User"}]
                          </span>
                        )}
                      </div>
                      {i < steps.length - 1 && (
                        <span style={{ color: "#94a3b8", fontSize: 14 }}>→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit error */}
            {submitError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 12, color: "#b91c1c", lineHeight: 1.55,
              }}>
                {submitError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              {readOnly ? (
                <button type="button" onClick={onBack} style={S.btnGhost}>← Close</button>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={S.btnPrimary(submitting)}
                  >
                    {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Workflow"}
                  </button>
                  <button type="button" onClick={onBack} style={S.btnGhost}>Cancel</button>
                </>
              )}
            </div>
          </div>

          {/* ── Right: step builder ── */}
          <div style={{ ...card, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={sectionHead}>
                Approval Steps
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "#94a3b8" }}>
                  {steps.length} step{steps.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div style={{
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1d4ed8",
              lineHeight: 1.5, display: "flex", alignItems: "center", gap: 10
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span><strong>Note:</strong> The final review will be conducted by the <strong>Director Office</strong>.</span>
            </div>

            {loadingData && (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.textSub, fontSize: 13 }}>
                <div style={{ marginBottom: 8 }}>Loading roles and users…</div>
                <div style={{
                  width: 20, height: 20, border: "2px solid #e2e8f0",
                  borderTop: `2px solid ${C.primary}`, borderRadius: "50%",
                  margin: "0 auto", animation: "spin 0.7s linear infinite",
                }} />
              </div>
            )}

            {!loadingData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {steps.map((step, i) => (
                  <StepCard
                    key={step._id}
                    step={step}
                    index={i}
                    total={steps.length}
                    roles={roles}
                    departments={departments}
                    allUsers={allUsers}
                    onChange={patch => !readOnly && updateStep(i, patch)}
                    onRemove={() => !readOnly && removeStep(i)}
                    onMoveUp={() => !readOnly && moveStep(i, -1)}
                    onMoveDown={() => !readOnly && moveStep(i, 1)}
                    error={stepErrors[i]}
                    readOnly={readOnly}
                  />
                ))}

                {!readOnly && (
                  <button
                    type="button"
                    onClick={addStep}
                    style={{
                      padding: "9px 0", borderRadius: 10,
                      border: `1.5px dashed ${C.primary}`,
                      background: "#f0f7ff",
                      fontSize: 12, fontWeight: 700, color: C.primary,
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 6, transition: "background 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>＋</span> Add Approval Step
                  </button>
                )}

                {steps.length === 0 && (
                  <div style={{
                    textAlign: "center", padding: "24px 0",
                    color: "#94a3b8", fontSize: 13,
                  }}>
                    {readOnly ? "No steps configured." : `No steps yet. Click "Add Approval Step" to begin.`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

/* ─── Template card (list view) ─────────────────────────────────── */
function TemplateCard({ template, onEdit, onView, onSetDefault, onDelete, settingDefault, deleting }) {
  const steps = template.steps || [];
  const inUse = Number(template.usage_count || 0) > 0;
  const useCount = Number(template.usage_count || 0);

  return (
    <div style={{
      ...card, padding: "20px 22px",
      opacity: deleting ? 0.5 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{template.name}</div>
            {template.is_default && (
              <span style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: "#fef3c7", color: "#92400e", flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <Star size={11} fill="currentColor" /> Default
              </span>
            )}
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
              background: "#eff6ff", color: "#1d4ed8", flexShrink: 0,
            }}>
              {template.step_count || steps.length} step{Number(template.step_count || steps.length) !== 1 ? "s" : ""}
            </span>
            {inUse && (
              <span style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: "#f0fdf4", color: "#166534", flexShrink: 0,
              }}>
                In use · {useCount} section{useCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {template.description && (
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 1.5 }}>
              {template.description}
            </div>
          )}
          {template.created_by_name && (
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              Created by {template.created_by_name}
            </div>
          )}
        </div>
      </div>

      {/* Step chain */}
      {steps.length > 0 && (
        <div style={{
          background: "#f8fafc", borderRadius: 10,
          padding: "12px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Approval Chain
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {steps.map((s, i) => (
              <div key={s.id || i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: C.primary, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, flexShrink: 0,
                    }}>
                      {s.step_order || i + 1}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                      {s.step_name}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: C.textSub, marginLeft: 23, marginTop: 1 }}>
                    {s.approver_user_id
                      ? <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>{s.approver_name || "Specific user"}</span>
                      : s.approver_role
                        ? <span>
                          {s.approver_role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          {s.approver_department_name
                            ? <span style={{ color: "#94a3b8" }}> @ {s.approver_department_name}</span>
                            : <span style={{ color: "#cbd5e1" }}> (all depts)</span>
                          }
                        </span>
                        : null
                    }
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <span style={{ color: "#94a3b8", fontSize: 14, marginBottom: 8 }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {steps.length === 0 && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 10, padding: "10px 14px",
          fontSize: 12, color: "#92400e", marginBottom: 14,
        }}>
          <AlertTriangle size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} />No steps configured — add steps before assigning to a section.
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {inUse ? (
          <button
            onClick={() => onView(template)}
            style={{
              flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 8,
              border: "1.5px solid #bae6fd", background: "#f0f9ff",
              fontSize: 12, fontWeight: 600, color: "#0369a1", cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> View
          </button>
        ) : (
          <button
            onClick={() => onEdit(template)}
            style={{
              flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 8,
              border: "1.5px solid #e2e8f0", background: "#fff",
              fontSize: 12, fontWeight: 600, color: C.primary, cursor: "pointer",
            }}
          >
            Edit
          </button>
        )}

        {!template.is_default && (
          <button
            onClick={() => onSetDefault(template)}
            disabled={settingDefault}
            style={{
              flex: 1, minWidth: 90, padding: "7px 0", borderRadius: 8,
              border: "1.5px solid #fde68a", background: "#fffbeb",
              fontSize: 12, fontWeight: 600, color: "#92400e",
              cursor: settingDefault ? "not-allowed" : "pointer",
              opacity: settingDefault ? 0.6 : 1,
            }}
          >
            {settingDefault ? "…" : "Set Default"}
          </button>
        )}

        {/* Delete hidden when workflow is in use */}
        {!inUse && (
          <button
            onClick={() => onDelete(template)}
            disabled={deleting}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1.5px solid #fee2e2", background: "#fff",
              fontSize: 12, fontWeight: 600, color: C.danger,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/* In-use notice */}
      {inUse && (
        <div style={{
          marginTop: 10, padding: "7px 12px", borderRadius: 8,
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          fontSize: 11, color: "#166534", lineHeight: 1.5,
        }}>
          This workflow is assigned to {useCount} section{useCount !== 1 ? "s" : ""} and cannot be edited or deleted.
          Create a new template for future changes.
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton ────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{ ...card, padding: "20px 22px" }}>
      {[60, 100, 80].map((w, i) => (
        <div key={i} style={{
          height: i === 1 ? 54 : 14, width: `${w}%`,
          background: "#f1f5f9", borderRadius: 8, marginBottom: 14,
          animation: "pulse 1.4s ease-in-out infinite",
        }} />
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 32, flex: 1, background: "#f1f5f9", borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function WorkflowTemplatePage() {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();

  const [screen, setScreen] = useState("list");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [actioning, setActioning] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const toastTimer = useRef(null);
  function showToast(message, type = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  /* ── Fetch ────────────────────────────────────────────────── */
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/builder/workflows");
      const data = await res.json();
      if (data.success) setTemplates(data.data || []);
      else showToast(data.message || "Failed to load templates.", "error");
    } catch { showToast("Network error.", "error"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ── Delete ───────────────────────────────────────────────── */
  function handleDelete(template) {
    setConfirm({
      title: "Delete this workflow?",
      message: `"${template.name}" will be permanently deleted. This cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setActioning(template.id);
        try {
          const res = await apiFetch(`/api/builder/workflows/${template.id}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) { showToast("Workflow deleted."); fetchTemplates(); }
          else showToast(data.message || "Failed to delete.", "error");
        } catch { showToast("Network error.", "error"); }
        finally { setActioning(null); }
      },
    });
  }

  /* ── Set default ──────────────────────────────────────────── */
  async function handleSetDefault(template) {
    setActioning(template.id + "_default");
    try {
      const res = await apiFetch(`/api/builder/workflows/${template.id}/default`, { method: "PATCH" });
      const data = await res.json();
      if (data.success) { showToast(`"${template.name}" is now the default workflow.`); fetchTemplates(); }
      else showToast(data.message || "Failed to set default.", "error");
    } catch { showToast("Network error.", "error"); }
    finally { setActioning(null); }
  }

  /* ── Form callbacks ───────────────────────────────────────── */
  function onSaved(msg) { showToast(msg); fetchTemplates(); setScreen("list"); setEditItem(null); }
  function onBack() { setScreen("list"); setEditItem(null); }

  /* ── Form screens ─────────────────────────────────────────── */
  if (screen === "create") return <WorkflowForm mode="create" onSaved={onSaved} onBack={onBack} />;
  if (screen === "edit" && editItem) return <WorkflowForm mode="edit" entity={editItem} onSaved={onSaved} onBack={onBack} />;
  if (screen === "view" && editItem) return <WorkflowForm mode="view" entity={editItem} onBack={onBack} />;

  /* ── List screen ──────────────────────────────────────────── */
  const defaultTemplate = templates.find(t => t.is_default);
  const totalSteps = templates.reduce((s, t) => s + Number(t.step_count || 0), 0);

  return (
    <PageContainer>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <PageHeader
        breadcrumb={[translate("Home", lang), translate("Institute", lang), translate("Workflow Templates", lang)]}
        title={translate("Workflow Templates", lang)}
        description={translate("Reusable approval chains — assign any template to any report section. Different sections can use different workflows.", lang)}
        actions={
          <Button variant="primary" icon={<Plus size={18} strokeWidth={2.2} />} onClick={() => setScreen("create")}>
            {translate("New Workflow", lang)}
          </Button>
        }
      />

      {/* ── Summary stats ── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Templates", value: templates.length, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>, color: "#6366f1" },
          { label: "Total Steps (all)", value: totalSteps, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>, color: C.primary },
          { label: "Default Template", value: defaultTemplate?.name || "—", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>, color: "#d97706", isText: true },
        ].map(s => (
          <div key={s.label} style={{
            ...card, padding: "16px 20px", flex: 1, minWidth: 180,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: s.color + "22", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: s.color, flexShrink: 0,
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{
                fontSize: s.isText ? 12 : 22, fontWeight: 800,
                color: C.text, lineHeight: 1.2,
                maxWidth: 180, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Info banner ── */}
      <div style={{
        background: "#f0f9ff", border: "1px solid #bae6fd",
        borderRadius: 10, padding: "11px 16px",
        fontSize: 12, color: "#0369a1", marginBottom: 22, lineHeight: 1.6,
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>ℹ</span>
        <div>
          <strong>Immutability note:</strong> Once a workflow template is assigned to a section and that section has activity,
          avoid modifying its steps. Instead, create a new template (new version) and assign it to future sections.
          The "Edit" button will still work — but be cautious with active templates.
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : templates.length === 0 ? (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            }
            title="No workflow templates yet"
            description="Create your first workflow to define the approval chain for report sections."
            action={
              <Button variant="primary" onClick={() => setScreen("create")}>Create First Workflow</Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={item => { setEditItem(item); setScreen("edit"); }}
              onView={item => { setEditItem(item); setScreen("view"); }}
              onSetDefault={handleSetDefault}
              onDelete={handleDelete}
              settingDefault={actioning === t.id + "_default"}
              deleting={actioning === t.id}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
