import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import FormBuilderPage from "./FormBuilderPage";
import InstituteFormRecordsPage from "./InstituteFormRecordsPage";

const ACCENT = "#0891b2";

/* ── Icons ── */
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconUnlock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/* Returns deadline display info: formatted date + status badge props. */
function deadlineInfo(form) {
  if (!form.deadline_at) {
    return { dateText: "—", status: null };
  }
  const d = new Date(form.deadline_at);
  const dateText = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const now = new Date();
  const msLeft = d.getTime() - now.getTime();
  const expired = msLeft <= 0;

  if (expired) {
    return { dateText, status: { label: "Expired", color: "#dc2626" } };
  }
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft <= 3) {
    return { dateText, status: { label: `${daysLeft}d left`, color: "#d97706" } };
  }
  return { dateText, status: { label: `${daysLeft}d left`, color: "#16a34a" } };
}

function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: color + "18", color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No forms available</div>
      <div style={{ fontSize: 13 }}>Create a new form or contact your super admin to share one with your institution.</div>
    </div>
  );
}

/* ── Deadline management modal — institution-specific ── */
function DeadlineModal({ form, onClose, onSaved, showToast }) {
  const { apiFetch } = useApi();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [current, setCurrent]   = useState({ deadline_at: null, auto_locked: false, is_locked: false });
  const [dateVal, setDateVal]   = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res  = await apiFetch(`/api/forms/${form.form_name}/deadline`);
        const data = await res.json();
        if (alive && data.success) {
          setCurrent(data);
          setDateVal(data.deadline_at ? new Date(data.deadline_at).toISOString().slice(0, 10) : "");
        }
      } catch {
        /* ignore — modal shows "no deadline" */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [apiFetch, form.form_name]);

  async function save(remove) {
    setSaving(true);
    try {
      const deadlineIso = remove
        ? null
        : (dateVal ? new Date(dateVal + "T23:59:59").toISOString() : null);
      const res  = await apiFetch(`/api/forms/${form.form_name}/deadline`, {
        method: "PUT",
        body: JSON.stringify({ deadline_at: deadlineIso }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(remove ? "Deadline removed." : "Deadline saved.");
        onSaved();
        onClose();
      } else {
        showToast(data.message || "Failed to save deadline.", "error");
      }
    } catch {
      showToast("Failed to save deadline.", "error");
    } finally {
      setSaving(false);
    }
  }

  const formTitle = form.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const todayStr  = new Date().toISOString().slice(0, 10);
  const hasDeadline = !!current.deadline_at;
  const expired   = hasDeadline && new Date(current.deadline_at).getTime() <= Date.now();

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: ACCENT }}><IconCalendar /></span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Manage Deadline</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{formTitle} · your institution only</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding: "20px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {/* current status */}
              <div style={{
                background: hasDeadline ? (expired ? "#fef2f2" : "#f0f9ff") : "#f8fafc",
                border: `1px solid ${hasDeadline ? (expired ? "#fecaca" : "#bae6fd") : "#e2e8f0"}`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 18,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                  Current Status
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: hasDeadline ? (expired ? "#b91c1c" : "#0369a1") : "#64748b" }}>
                  {hasDeadline
                    ? `Deadline: ${new Date(current.deadline_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${expired ? " · Expired" : ""}`
                    : "No deadline set"}
                </div>
                {current.is_locked && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                    {current.auto_locked ? "Auto-locked after deadline." : "Manually locked by admin."}
                  </div>
                )}
              </div>

              {/* date picker */}
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>
                {hasDeadline ? "Update Deadline Date" : "Add Deadline Date"}
              </label>
              <input
                type="date"
                value={dateVal}
                min={todayStr}
                onChange={(e) => setDateVal(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
                  borderRadius: 9, fontSize: 13, color: "#1e293b", outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                The form auto-locks for your institution after this date. Departments can still view records.
              </div>
            </>
          )}
        </div>

        {/* footer */}
        {!loading && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <button
              onClick={() => save(true)}
              disabled={saving || !hasDeadline}
              style={{
                padding: "9px 16px", borderRadius: 9, border: "1.5px solid #fecaca",
                background: "#fff", fontSize: 13, fontWeight: 700,
                color: hasDeadline ? "#dc2626" : "#cbd5e1",
                cursor: saving || !hasDeadline ? "not-allowed" : "pointer",
              }}
            >
              Remove Deadline
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} disabled={saving} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => save(false)}
                disabled={saving || !dateVal}
                style={{
                  padding: "9px 22px", borderRadius: 9, border: "none",
                  background: saving || !dateVal ? "#93c5fd" : ACCENT,
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  cursor: saving || !dateVal ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : hasDeadline ? "Update" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   InstituteFormManagementPage
   Lists forms from table_list that this institution has access to.
   Provides "Manage" to edit field schema and "Create Form" button.
═══════════════════════════════════════════════════════════════════ */
export default function InstituteFormManagementPage() {
  const { apiFetch } = useApi();

  const [view, setView]               = useState("list"); // "list" | "builder" | "records"
  const [builderMode, setBuilderMode] = useState(null);   // "create" | "edit"
  const [selectedForm, setSelectedForm] = useState(null);

  const [forms, setForms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [toast, setToast]     = useState(null);
  const [lockTogglingForm, setLockTogglingForm] = useState(null);
  const [deadlineForm, setDeadlineForm] = useState(null); // form whose deadline modal is open

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await apiFetch("/api/forms/institution-forms");
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setError(data.message || "Failed to load forms.");
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load forms.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function handleToggleLock(form) {
    const action = form.is_locked ? "unlock" : "lock";
    setLockTogglingForm(form.form_name);
    try {
      const res  = await apiFetch(`/api/forms/${form.form_name}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setForms((prev) =>
          prev.map((f) =>
            f.form_name === form.form_name
              ? { ...f, is_locked: !form.is_locked, locked_by: data.lock?.locked_by ?? null, locked_at: data.lock?.locked_at ?? null }
              : f
          )
        );
        showToast(`Form ${action === "lock" ? "locked" : "unlocked"} successfully.`);
      } else {
        showToast(data.message || `Failed to ${action} form.`, "error");
      }
    } catch {
      showToast(`Failed to ${action} form.`, "error");
    } finally {
      setLockTogglingForm(null);
    }
  }

  function openCreate() {
    setSelectedForm(null);
    setBuilderMode("create");
    setView("builder");
  }

  function openManage(form) {
    setSelectedForm(form);
    setBuilderMode("edit");
    setView("builder");
  }

  function openRecords(form) {
    setSelectedForm(form);
    setView("records");
  }

  function backToList() {
    setView("list");
    setSelectedForm(null);
    // Refresh the form list so the lock badge reflects any changes made inside View Records.
    load();
  }

  function onBuilderDone(message) {
    setView("list");
    showToast(message || "Form saved successfully.");
    load();
  }

  function onBuilderBack() {
    setView("list");
  }

  if (view === "builder") {
    return (
      <FormBuilderPage
        mode={builderMode}
        initialData={selectedForm}
        isSuperAdmin={false}
        onDone={onBuilderDone}
        onBack={onBuilderBack}
      />
    );
  }

  if (view === "records" && selectedForm) {
    return (
      <InstituteFormRecordsPage
        form={selectedForm}
        onBack={backToList}
      />
    );
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {deadlineForm && (
        <DeadlineModal
          form={deadlineForm}
          onClose={() => setDeadlineForm(null)}
          onSaved={load}
          showToast={showToast}
        />
      )}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: ACCENT + "12", borderRadius: 8, padding: "4px 12px", marginBottom: 10,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
              Form Management
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: "0 0 6px" }}>
            Institution Forms
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            Manage data collection forms available to your institution.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={load}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconRefresh /> Refresh
          </button>
          <button
            onClick={openCreate}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: ACCENT, color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: `0 2px 8px ${ACCENT}40`,
            }}
          >
            <IconPlus /> Create Form
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* Forms table card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Available Forms</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {loading ? "Loading…" : `${forms.length} form${forms.length !== 1 ? "s" : ""} accessible to your institution`}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <EmptyState />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Form Name", "Visibility", "Institutions", "Deadline", "Lock Status", "Action"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 20px", textAlign: h === "Action" ? "right" : "left",
                    fontSize: 11, fontWeight: 700, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: 0.6,
                    borderBottom: "1px solid #f1f5f9",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map((form, i) => (
                <tr
                  key={form.id}
                  style={{
                    borderBottom: i < forms.length - 1 ? "1px solid #f8fafc" : "none",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        background: ACCENT + "18",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, color: ACCENT, fontWeight: 700, flexShrink: 0,
                      }}>
                        {form.form_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {form.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                          {form.form_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    {form.share_table ? (
                      <Badge label="Shared" color="#0891b2" />
                    ) : (
                      <Badge label="Private" color="#64748b" />
                    )}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>
                      {(form.institute_access || []).length} institution{(form.institute_access || []).length !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    {(() => {
                      const { dateText, status } = deadlineInfo(form);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{dateText}</span>
                          {status && <Badge label={status.label} color={status.color} />}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {form.is_locked ? (
                        <Badge label="Locked" color="#dc2626" />
                      ) : (
                        <Badge label="Open" color="#16a34a" />
                      )}
                      <button
                        onClick={() => handleToggleLock(form)}
                        disabled={lockTogglingForm === form.form_name}
                        title={form.is_locked ? "Unlock this form" : "Lock this form"}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: form.is_locked ? "#fef2f2" : "#f0fdf4",
                          color: form.is_locked ? "#dc2626" : "#16a34a",
                          border: `1px solid ${form.is_locked ? "#fecaca" : "#bbf7d0"}`,
                          borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700,
                          cursor: lockTogglingForm === form.form_name ? "not-allowed" : "pointer",
                          opacity: lockTogglingForm === form.form_name ? 0.6 : 1,
                        }}
                      >
                        {form.is_locked ? <><IconUnlock /> Unlock</> : <><IconLock /> Lock</>}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setDeadlineForm(form)}
                        title="Manage this form's deadline for your institution"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: "#fffbeb", color: "#d97706",
                          border: "1px solid #fde68a", borderRadius: 8,
                          padding: "7px 14px", fontSize: 12, fontWeight: 700,
                          cursor: "pointer", transition: "background .15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fef3c7")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fffbeb")}
                      >
                        <IconCalendar /> Deadline
                      </button>
                      <button
                        onClick={() => openRecords(form)}
                        title="View all department records for this form"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: "#f5f3ff", color: "#7c3aed",
                          border: "1px solid #ddd6fe", borderRadius: 8,
                          padding: "7px 14px", fontSize: 12, fontWeight: 700,
                          cursor: "pointer", transition: "background .15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#ede9fe")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f3ff")}
                      >
                        <IconEye /> View Records
                      </button>
                      <button
                        onClick={() => openManage(form)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: "#f0f9ff", color: ACCENT,
                          border: `1px solid ${ACCENT}30`, borderRadius: 8,
                          padding: "7px 14px", fontSize: 12, fontWeight: 700,
                          cursor: "pointer", transition: "background .15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT + "18")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                      >
                        <IconSettings /> Manage
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
