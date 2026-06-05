import { useState, useEffect } from "react";
import { useApi }  from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { S, Toast } from "../../shared/formUtils";

const REPORTING_YEARS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"];
const ACCENT = "#059669"; // matches Department Admin green theme

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div style={{
        width: 28, height: 28,
        border: "3px solid #e2e8f0",
        borderTopColor: ACCENT,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function avatarInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ══════════════════════════════════════════════
   ASSIGNMENT TABLE
══════════════════════════════════════════════ */
function AssignmentList({ assignments, onEdit, onToggle, onDelete, toggling, deleting }) {
  if (assignments.length === 0) {
    return (
      <div style={{
        background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
        padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 13,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        No Nodal Officer assignments yet. Click <strong>+ Add</strong> to create one.
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {["Reporting Year", "Nodal Officer", "Status", "Actions"].map(h => (
              <th key={h} style={{
                padding: "12px 16px", textAlign: "left",
                fontSize: 11, fontWeight: 700,
                color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map((a, i) => {
            const hue    = (a.user_full_name?.charCodeAt(0) ?? 0) * 37 % 360;
            const isBusy = toggling === a.id || deleting === a.id;
            return (
              <tr key={a.id} style={{
                borderBottom: i < assignments.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              }}>
                {/* Reporting Year */}
                <td style={{ padding: "14px 16px" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 20,
                    fontSize: 12, fontWeight: 600,
                    background: "#d1fae5", color: "#065f46",
                  }}>
                    {a.reporting_year}
                  </span>
                </td>

                {/* Assigned User */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `hsl(${hue},55%,85%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: `hsl(${hue},55%,30%)`,
                      flexShrink: 0,
                    }}>
                      {avatarInitials(a.user_full_name || "")}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                        {a.user_full_name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {a.user_email}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                      background: a.is_active ? "#10b981" : "#cbd5e1",
                    }} />
                    <span style={{ color: a.is_active ? ACCENT : "#94a3b8" }}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </span>
                </td>

                {/* Actions */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {/* Edit */}
                    <button
                      onClick={() => onEdit(a)}
                      disabled={isBusy}
                      style={{
                        padding: "5px 12px", borderRadius: 7,
                        border: "1.5px solid #e2e8f0",
                        background: "#fff", fontSize: 12, fontWeight: 600,
                        color: ACCENT,
                        cursor: isBusy ? "not-allowed" : "pointer",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      Edit
                    </button>

                    {/* Disable / Enable */}
                    <button
                      onClick={() => onToggle(a.id, !a.is_active)}
                      disabled={isBusy}
                      style={{
                        padding: "5px 12px", borderRadius: 7,
                        border: `1.5px solid ${a.is_active ? "#fed7aa" : "#bbf7d0"}`,
                        background: "#fff", fontSize: 12, fontWeight: 600,
                        color: a.is_active ? "#c2410c" : "#15803d",
                        cursor: isBusy ? "not-allowed" : "pointer",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {toggling === a.id ? "…" : a.is_active ? "Disable" : "Enable"}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDelete(a.id)}
                      disabled={isBusy}
                      style={{
                        padding: "5px 12px", borderRadius: 7,
                        border: "1.5px solid #fecaca",
                        background: "#fff", fontSize: 12, fontWeight: 600,
                        color: "#dc2626",
                        cursor: isBusy ? "not-allowed" : "pointer",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {deleting === a.id ? "…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SHARED FORM — used for both Add and Edit.
   In edit mode the Reporting Year is locked;
   only the assigned user can be changed.
══════════════════════════════════════════════ */
function AssignmentForm({ mode, assignment, onDone, onBack, apiFetch, institutionId, departmentId }) {
  const isEdit = mode === "edit";

  const [form, setForm] = useState({
    reporting_year: isEdit ? assignment.reporting_year : "",
    user_id:        isEdit ? assignment.user_id        : "",
  });
  const [users,        setUsers]        = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [serverError,  setServerError]  = useState("");
  const [fieldErrs,    setFieldErrs]    = useState({});

  // Load eligible department users (exclude admin/HOD roles)
  useEffect(() => {
    const params = new URLSearchParams({
      institution_id: institutionId,
      department_id:  departmentId,
      eligible_only:  "true",
    });
    setLoadingUsers(true);
    apiFetch(`/api/lookup/users?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setUsers(d.users); })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [apiFetch, institutionId, departmentId]);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setFieldErrs(e => ({ ...e, [key]: undefined }));
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEdit && !form.reporting_year) errs.reporting_year = "Please select a reporting year.";
    if (!form.user_id)                   errs.user_id        = "Please select a user.";
    if (Object.keys(errs).length) { setFieldErrs(errs); return; }

    setSaving(true);
    try {
      let res, data;
      if (isEdit) {
        res  = await apiFetch(`/api/nodal-officer-assignments/${assignment.id}`, {
          method: "PUT",
          body:   JSON.stringify({ user_id: form.user_id }),
        });
        data = await res.json();
      } else {
        res  = await apiFetch("/api/nodal-officer-assignments", {
          method: "POST",
          body:   JSON.stringify({ user_id: form.user_id, reporting_year: form.reporting_year }),
        });
        data = await res.json();
      }

      if (!res.ok) {
        setServerError(data.message || (isEdit ? "Failed to update." : "Failed to assign."));
        setSaving(false);
        return;
      }
      onDone(isEdit ? "Assignment updated." : "Nodal Officer assigned successfully.");
    } catch {
      setServerError("Network error. Please try again.");
      setSaving(false);
    }
  };

  const accentBg = isEdit ? "#d1fae5" : "#d1fae5";

  return (
    <div>
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        disabled={saving}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none",
          fontSize: 13, fontWeight: 600, color: ACCENT,
          cursor: saving ? "not-allowed" : "pointer",
          padding: 0, marginBottom: 24, opacity: saving ? 0.5 : 1,
        }}
      >
        ← Back to Nodal Officer
      </button>

      {/* Card */}
      <div style={{
        background: "#fff", borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        overflow: "hidden", maxWidth: 560,
      }}>
        {/* Card header */}
        <div style={{
          padding: "24px 28px 20px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: accentBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            {isEdit ? "✏️" : "🔗"}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
              {isEdit ? "Edit Assignment" : "Assign Nodal Officer"}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>
              {isEdit
                ? `Reporting Year ${assignment.reporting_year} — change the assigned user.`
                : "Multiple Nodal Officers can be assigned per year. Enable or disable each one independently."}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: "28px 28px 8px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Reporting Year — locked in edit mode */}
            <div>
              <label style={S.label}>Reporting Year *</label>
              {isEdit ? (
                <div style={{
                  ...S.input(false),
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#f8fafc", color: "#475569",
                  cursor: "not-allowed", userSelect: "none",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />
                  {assignment.reporting_year}
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 600,
                    color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    Locked
                  </span>
                </div>
              ) : (
                <>
                  <select
                    style={S.select(!!fieldErrs.reporting_year)}
                    value={form.reporting_year}
                    onChange={e => set("reporting_year", e.target.value)}
                  >
                    <option value="">— Select Year —</option>
                    {REPORTING_YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  {fieldErrs.reporting_year && (
                    <span style={S.errorText}>{fieldErrs.reporting_year}</span>
                  )}
                </>
              )}
            </div>

            {/* User */}
            <div>
              <label style={S.label}>Assign To *</label>
              <select
                style={S.select(!!fieldErrs.user_id)}
                value={form.user_id}
                onChange={e => set("user_id", e.target.value)}
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers ? "Loading users…" : "— Select User —"}
                </option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
              {fieldErrs.user_id && (
                <span style={S.errorText}>{fieldErrs.user_id}</span>
              )}
              {!loadingUsers && users.length === 0 && (
                <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                  No eligible users found in this department. Ensure department members exist with appropriate roles.
                </span>
              )}
            </div>

            {serverError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 13, color: "#b91c1c",
              }}>
                {serverError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "20px 28px 24px",
            display: "flex", justifyContent: "flex-end", gap: 10,
            borderTop: "1px solid #f1f5f9", marginTop: 16,
          }}>
            <button type="button" onClick={onBack} disabled={saving} style={S.btnGhost}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingUsers}
              style={{
                ...S.btnPrimary(saving),
                background: saving ? "#6ee7b7" : ACCENT,
              }}
            >
              {saving ? (isEdit ? "Saving…" : "Assigning…") : (isEdit ? "Save Changes" : "Assign")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function NodalOfficerPage() {
  const { apiFetch } = useApi();
  const { user }     = useAuth();

  const institutionId  = user?.institutionId  ?? "";
  const departmentId   = user?.departmentId   ?? "";
  const departmentName = user?.departmentName ?? "";

  // formView: null | "add" | { mode: "edit", assignment: {...} }
  const [formView,    setFormView]    = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [toggling,    setToggling]    = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [toast,       setToast]       = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch("/api/nodal-officer-assignments")
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.success) setAssignments(d.assignments);
        else setError(d.message || "Failed to load assignments.");
      })
      .catch(() => { if (!cancelled) setError("Network error. Could not load assignments."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch, refreshKey]);

  const handleToggle = async (id, nextActive) => {
    setToggling(id);
    try {
      const res  = await apiFetch(`/api/nodal-officer-assignments/${id}`, {
        method: "PUT",
        body:   JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (data.success) {
        setRefreshKey(k => k + 1);
        showToast(nextActive ? "Assignment enabled." : "Assignment disabled.");
      } else {
        showToast(data.message || "Failed to update.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    }
    setToggling(null);
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      const res  = await apiFetch(`/api/nodal-officer-assignments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAssignments(prev => prev.filter(a => a.id !== id));
        showToast("Assignment deleted.");
      } else {
        showToast(data.message || "Failed to delete.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    }
    setDeleting(null);
  };

  const handleFormDone = (msg) => {
    setFormView(null);
    showToast(msg);
    setRefreshKey(k => k + 1);
  };

  // ── Form view (Add or Edit) ──────────────────────────────────────
  if (formView) {
    const isEdit = formView !== "add";
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <AssignmentForm
          mode={isEdit ? "edit" : "add"}
          assignment={isEdit ? formView.assignment : null}
          apiFetch={apiFetch}
          institutionId={institutionId}
          departmentId={departmentId}
          onDone={handleFormDone}
          onBack={() => setFormView(null)}
        />
      </>
    );
  }

  // ── List view ────────────────────────────────────────────────────
  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page header */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", marginBottom: 28,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `${ACCENT}14`, borderRadius: 8,
            padding: "4px 12px", marginBottom: 12,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
            <span style={{
              fontSize: 11, fontWeight: 600, color: ACCENT,
              textTransform: "uppercase", letterSpacing: 1,
            }}>
              Settings · Nodal Officer
            </span>
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: "#1e293b",
            letterSpacing: "-0.4px", marginBottom: 6,
          }}>
            Nodal Officer Delegation
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Delegate Nodal Officer responsibility within{" "}
            <span style={{ color: ACCENT, fontWeight: 600 }}>{departmentName || "your department"}</span>
            {" "}per reporting year. Multiple Nodal Officers can be active simultaneously; enable or disable each one independently.
          </p>
        </div>

        <button
          onClick={() => setFormView("add")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: ACCENT, fontSize: 13, fontWeight: 700,
            color: "#fff", cursor: "pointer", flexShrink: 0, marginTop: 4,
          }}
        >
          + Add
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div style={{
          padding: 24, background: "#fef2f2", borderRadius: 10,
          color: "#dc2626", fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {error}
        </div>
      ) : (
        <AssignmentList
          assignments={assignments}
          onEdit={a => setFormView({ mode: "edit", assignment: a })}
          onToggle={handleToggle}
          onDelete={handleDelete}
          toggling={toggling}
          deleting={deleting}
        />
      )}
    </>
  );
}
