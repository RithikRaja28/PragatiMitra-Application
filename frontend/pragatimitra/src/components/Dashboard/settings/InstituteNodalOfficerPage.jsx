import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApi }      from "../../../hooks/useApi";
import { useAuth }     from "../../../store/AuthContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t }           from "../../../i18n/translations";
import { S, Toast }    from "../../shared/formUtils";

const ACCENT = "#0891b2";

/* Canonical "YYYY-YYYY" format — must match RootLayout's toReportingYear and
   the backend's reporting_year validator (nodalOfficerAssignments.js). */
const toReportingYear = (startYear) =>
  `${startYear}-${Number(startYear) + 1}`;

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: ACCENT, borderRadius: "50%", animation: "ino-spin 0.7s linear infinite" }} />
      <style>{`@keyframes ino-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function avatarInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ══════════════════════════════════════════════
   ASSIGNMENT TABLE
══════════════════════════════════════════════ */
function AssignmentList({ assignments, onEdit, onToggle, onDelete, toggling, deleting, loading }) {
  const { lang } = useLanguage();

  if (loading) return <Spinner />;

  if (assignments.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {t("No Nodal Officer assignments yet. Click + Add to create one.", lang)}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {[t("Reporting Year", lang), t("Nodal Officer", lang), t("Status", lang), t("Actions", lang)].map(h => (
              <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>
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
              <tr key={a.id} style={{ borderBottom: i < assignments.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#e0f2fe", color: "#0369a1" }}>
                    {a.reporting_year}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `hsl(${hue},55%,85%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: `hsl(${hue},55%,30%)`, flexShrink: 0 }}>
                      {avatarInitials(a.user_full_name || "")}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.user_full_name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.user_email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: a.is_active ? "#10b981" : "#cbd5e1" }} />
                    <span style={{ color: a.is_active ? ACCENT : "#94a3b8" }}>
                      {a.is_active ? t("Active", lang) : t("Inactive", lang)}
                    </span>
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onEdit(a)} disabled={isBusy} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, color: ACCENT, cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1 }}>
                      {t("Edit", lang)}
                    </button>
                    <button onClick={() => onToggle(a.id, !a.is_active)} disabled={isBusy} style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${a.is_active ? "#fed7aa" : "#bbf7d0"}`, background: "#fff", fontSize: 12, fontWeight: 600, color: a.is_active ? "#c2410c" : "#15803d", cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1 }}>
                      {toggling === a.id ? "…" : a.is_active ? t("Disable", lang) : t("Enable", lang)}
                    </button>
                    <button onClick={() => onDelete(a.id)} disabled={isBusy} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #fecaca", background: "#fff", fontSize: 12, fontWeight: 600, color: "#dc2626", cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1 }}>
                      {deleting === a.id ? "…" : t("Delete", lang)}
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
   ADD / EDIT MODAL
══════════════════════════════════════════════ */
function AssignmentModal({ mode, assignment, onDone, onClose, apiFetch, institutionId, institutionName }) {
  const isEdit   = mode === "edit";
  const { lang } = useLanguage();

  const [form, setForm] = useState({
    reporting_year: isEdit ? assignment.reporting_year : "",
    user_id:        isEdit ? assignment.user_id        : "",
  });

  const [academicYears, setAcademicYears] = useState([]);
  const [loadingYears,  setLoadingYears]  = useState(!isEdit);
  const [users,         setUsers]         = useState([]);
  const [loadingUsers,  setLoadingUsers]  = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [serverError,   setServerError]   = useState("");
  const [fieldErrs,     setFieldErrs]     = useState({});

  /* Academic years from Academic Year Management */
  useEffect(() => {
    if (isEdit) return;
    setLoadingYears(true);
    apiFetch("/api/academic-years")
      .then(r => r.json())
      .then(d => { if (d.success) setAcademicYears(d.years || []); })
      .catch(() => {})
      .finally(() => setLoadingYears(false));
  }, [apiFetch, isEdit]);

  /* Load all institution users once a reporting year is selected.
     In edit mode the year is pre-set, so this fires immediately. */
  useEffect(() => {
    if (!form.reporting_year) { setUsers([]); return; }
    const params = new URLSearchParams({ institution_id: institutionId, exclude_roles: "super_admin" });
    setLoadingUsers(true);
    apiFetch(`/api/lookup/users?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setUsers(d.users); })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [form.reporting_year, apiFetch, institutionId]);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setFieldErrs(e => ({ ...e, [key]: undefined }));
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEdit && !form.reporting_year) errs.reporting_year = t("Please select a reporting year.", lang);
    if (!form.user_id)                   errs.user_id        = t("Please select a user.", lang);
    if (Object.keys(errs).length) { setFieldErrs(errs); return; }

    setSaving(true);
    try {
      const res = isEdit
        ? await apiFetch(`/api/nodal-officer-assignments/${assignment.id}`, {
            method: "PUT",
            body: JSON.stringify({ user_id: form.user_id }),
          })
        : await apiFetch("/api/nodal-officer-assignments", {
            method: "POST",
            body: JSON.stringify({ user_id: form.user_id, reporting_year: form.reporting_year }),
          });
      const data = await res.json();
      if (data.success) {
        onDone(isEdit ? t("Assignment updated.", lang) : t("Nodal Officer assigned successfully.", lang));
      } else {
        setServerError(data.message || "An error occurred.");
        setSaving(false);
      }
    } catch {
      setServerError("Network error. Please try again.");
      setSaving(false);
    }
  };

  const overlay = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafafa", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>
                {isEdit ? t("Edit Assignment", lang) : t("Assign Nodal Officer", lang)}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                {isEdit
                  ? `${t("Reporting Year", lang)} ${assignment.reporting_year} — ${t("Reporting Year — change the assigned user", lang)}`
                  : `${t("Institution-wide assignment for", lang)} ${institutionName || "—"}`}
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: saving ? "not-allowed" : "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>

          {/* Reporting Year */}
          <div>
            <label style={S.label}>{t("Reporting Year *", lang)}</label>
            {isEdit ? (
              <div style={{ ...S.input(false), display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", color: "#475569", cursor: "not-allowed", userSelect: "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />
                {assignment.reporting_year}
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("Locked", lang)}</span>
              </div>
            ) : (
              <>
                <select
                  style={S.select(!!fieldErrs.reporting_year)}
                  value={form.reporting_year}
                  onChange={e => set("reporting_year", e.target.value)}
                  disabled={loadingYears}
                >
                  <option value="">{loadingYears ? t("Loading years…", lang) : t("— Select Academic Year —", lang)}</option>
                  {academicYears.map(y => (
                    <option key={y.id ?? y.start_year} value={toReportingYear(y.start_year)}>
                      {y.academic_year}
                    </option>
                  ))}
                </select>
                {!loadingYears && academicYears.length === 0 && (
                  <span style={{ fontSize: 11, color: "#f97316", marginTop: 4, display: "block" }}>
                    {t("No academic years found. Ask the Institute Admin to create academic years under Settings → Academic Year Management first.", lang)}
                  </span>
                )}
                {fieldErrs.reporting_year && <span style={S.errorText}>{fieldErrs.reporting_year}</span>}
              </>
            )}
          </div>

          {/* User — loaded only after year is selected */}
          <div>
            <label style={S.label}>{t("Assign To *", lang)}</label>
            <select
              style={S.select(!!fieldErrs.user_id)}
              value={form.user_id}
              onChange={e => set("user_id", e.target.value)}
              disabled={!form.reporting_year || loadingUsers}
            >
              <option value="">
                {!form.reporting_year
                  ? t("— Select Reporting Year first —", lang)
                  : loadingUsers
                    ? t("Loading…", lang)
                    : t("— Select User —", lang)}
              </option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                  {u.role_display_name ? ` · ${u.role_display_name}` : ""}
                  {u.department_name   ? ` (${u.department_name})`   : ""}
                </option>
              ))}
            </select>
            {fieldErrs.user_id && <span style={S.errorText}>{fieldErrs.user_id}</span>}
            {form.reporting_year && !loadingUsers && users.length === 0 && (
              <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                {t("No users found in this institution.", lang)}
              </span>
            )}
          </div>

          {serverError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" }}>
              {serverError}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9", marginTop: 4 }}>
            <button type="button" onClick={onClose} disabled={saving} style={S.btnGhost}>
              {t("Cancel", lang)}
            </button>
            <button type="submit" disabled={saving || (!form.reporting_year) || loadingUsers} style={{ ...S.btnPrimary(saving), background: saving ? "#67e8f9" : ACCENT }}>
              {saving
                ? (isEdit ? t("Saving…", lang) : t("Assigning…", lang))
                : (isEdit ? t("Save Changes", lang) : t("Assign", lang))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function InstituteNodalOfficerPage() {
  const { apiFetch }    = useApi();
  const { user }        = useAuth();
  const { lang }        = useLanguage();
  const institutionId   = user?.institutionId   ?? "";
  const institutionName = user?.institutionName ?? "";

  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [toggling,    setToggling]    = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [formView,    setFormView]    = useState(null);
  const [toast,       setToast]       = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const showToast = (msg, type = "success") => {
    setToast({ message: msg, type });
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
      .catch(() => { if (!cancelled) setError("Network error."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch, refreshKey]);

  const handleToggle = async (id, nextActive) => {
    setToggling(id);
    try {
      const res  = await apiFetch(`/api/nodal-officer-assignments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (data.success) {
        setRefreshKey(k => k + 1);
        showToast(nextActive ? t("Assignment enabled.", lang) : t("Assignment disabled.", lang));
      } else showToast(data.message || "Failed to update.", "error");
    } catch { showToast("Network error.", "error"); }
    setToggling(null);
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      const res  = await apiFetch(`/api/nodal-officer-assignments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAssignments(prev => prev.filter(a => a.id !== id));
        showToast(t("Assignment deleted.", lang));
      } else showToast(data.message || "Failed to delete.", "error");
    } catch { showToast("Network error.", "error"); }
    setDeleting(null);
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${ACCENT}14`, borderRadius: 8, padding: "4px 12px", marginBottom: 12 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
              {t("Settings · Nodal Officer", lang)}
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
            {t("Nodal Officer Delegation", lang)}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            {t("Delegate Nodal Officer responsibility across", lang)}{" "}
            <span style={{ color: ACCENT, fontWeight: 600 }}>{institutionName || "—"}</span>
            {" "}{t("per reporting year.", lang)}
          </p>
        </div>

        <button
          onClick={() => setFormView("add")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: ACCENT, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0, marginTop: 4 }}
        >
          {t("+ Add", lang)}
        </button>
      </div>

      {/* List */}
      {error ? (
        <div style={{ padding: 24, background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 13 }}>{error}</div>
      ) : (
        <AssignmentList
          assignments={assignments}
          loading={loading}
          onEdit={a => setFormView({ mode: "edit", assignment: a })}
          onToggle={handleToggle}
          onDelete={handleDelete}
          toggling={toggling}
          deleting={deleting}
        />
      )}

      {/* Modal */}
      {formView && (
        <AssignmentModal
          mode={formView === "add" ? "add" : "edit"}
          assignment={formView === "add" ? null : formView.assignment}
          apiFetch={apiFetch}
          institutionId={institutionId}
          institutionName={institutionName}
          onDone={(msg) => { setFormView(null); showToast(msg); setRefreshKey(k => k + 1); }}
          onClose={() => setFormView(null)}
        />
      )}
    </>
  );
}
