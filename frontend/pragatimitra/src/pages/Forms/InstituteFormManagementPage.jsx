import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FileText, Archive, Search } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";
import { ActionButton as StdActionButton, ActionButtonGroup } from "../../components/shared/ActionButtons";
import { StatusBadge, tableCardStyle } from "../../components/shared/ui";
import FormBuilderPage from "./FormBuilderPage";
import InstituteFormRecordsPage from "./InstituteFormRecordsPage";

const ACCENT = "#2563eb";

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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconUnlock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17" /><line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function IconLockMini() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
    return { dateText, status: { label: "EXPIRED", color: "#dc2626" } };
  }
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const label = `${daysLeft} DAY${daysLeft !== 1 ? "S" : ""} LEFT`;
  if (daysLeft <= 3) {
    return { dateText, status: { label, color: "#d97706" } };
  }
  return { dateText, status: { label, color: "#16a34a" } };
}

function titleOf(form_name) {
  return form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function institutionsLabel(form) {
  const names = form.institution_names || [];
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names.length} institutions`;
  const count = (form.institute_access || []).length;
  return count ? `${count} institution${count !== 1 ? "s" : ""}` : "—";
}

/* ── Status-dot badge ── */
function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: color + "18", color, letterSpacing: 0.3, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

/* ── Visibility badge ── */
function VisibilityBadge({ shared }) {
  return (
    <StatusBadge
      tone={shared ? "shared" : "private"}
      dot={false}
      icon={shared ? <IconShare /> : <IconLockMini />}
      style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}
    >
      {shared ? "Shared" : "Private"}
    </StatusBadge>
  );
}

/* ── Compact action button ── */
function ActionButton({ icon, label, onClick, title, disabled, iconOnly, variant }) {
  return (
    <StdActionButton
      icon={icon}
      onClick={onClick}
      title={title}
      disabled={disabled}
      iconOnly={iconOnly}
      variant={variant}
    >
      {label}
    </StdActionButton>
  );
}

/* ── Export dropdown — CSV / Excel, scoped to this institution (all depts) ── */
function ExportDropdown({ formName, accessToken }) {
  const [open, setOpen]         = useState(false);
  const [exporting, setExporting] = useState(null); // "csv" | "xlsx" | null

  async function download(format) {
    setOpen(false);
    setExporting(format);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(
        `${API_BASE}/api/form-data/${formName}/export?format=${format}`,
        { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${formName}_all.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => !exporting && setOpen((v) => !v)}
        disabled={!!exporting}
        title="Export"
        aria-label="Export"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
          background: exporting ? "#f8fafc" : "#fff",
          color: "#334155", border: "1px solid #cbd5e1",
          borderRadius: 8, padding: "0 9px", height: 40, minHeight: 40,
          cursor: exporting ? "not-allowed" : "pointer",
          opacity: exporting ? 0.6 : 1, whiteSpace: "nowrap",
          transition: "background .15s, border-color .15s",
        }}
        onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = "#f8fafc"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
      >
        <IconDownload />
        <IconChevronDown />
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 100,
            background: "#fff", borderRadius: 9, border: "1px solid #e2e8f0",
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)", minWidth: 170, overflow: "hidden",
          }}>
            <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
              All departments
            </div>
            {[
              { format: "csv",  label: "Download CSV" },
              { format: "xlsx", label: "Download Excel" },
            ].map(({ format, label }) => (
              <button
                key={format}
                onClick={() => download(format)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "9px 14px",
                  background: "none", border: "none",
                  textAlign: "left", fontSize: 12.5,
                  color: "#1e293b", cursor: "pointer", fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <IconDownload />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ archived, searching }) {
  const Icon = searching ? Search : archived ? Archive : FileText;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "56px 24px" }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, marginBottom: 16,
        background: "#f1f5f9", border: "1px solid #e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={26} strokeWidth={1.6} color="#94a3b8" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>
        {searching ? "No forms match your search" : archived ? "No archived forms" : "No forms available"}
      </div>
      <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 380 }}>
        {searching
          ? "Try a different name or clear the search."
          : archived
            ? "Forms you archive will appear here and can be restored anytime."
            : "Create a new form or contact your super admin to share one with your institution."}
      </div>
    </div>
  );
}

/* ── Deadline management modal ── */
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

  const formTitle = titleOf(form.form_name);
  const todayStr  = new Date().toISOString().slice(0, 10);
  const hasDeadline = !!current.deadline_at;
  const expired   = hasDeadline && new Date(current.deadline_at).getTime() <= Date.now();

  return createPortal(
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
    </div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   InstituteFormManagementPage
═══════════════════════════════════════════════════════════════════ */
export default function InstituteFormManagementPage() {
  const { apiFetch }    = useApi();
  const { accessToken } = useAuth();

  const [view, setView]               = useState("list");
  const [builderMode, setBuilderMode] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);

  const [forms, setForms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [toast, setToast]     = useState(null);
  const [lockTogglingForm, setLockTogglingForm] = useState(null);
  const [deadlineForm, setDeadlineForm] = useState(null);

  const [tab, setTab]       = useState("active");
  const [search, setSearch] = useState("");

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

  const visibleForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms
      .filter((f) => (tab === "archived" ? f.archived : !f.archived))
      .filter((f) => {
        if (!q) return true;
        return (
          titleOf(f.form_name).toLowerCase().includes(q) ||
          f.form_name.toLowerCase().includes(q) ||
          (f.description || "").toLowerCase().includes(q)
        );
      });
  }, [forms, tab, search]);

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

  const searching = search.trim().length > 0;

  return (
    <div style={{ padding: "20px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
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
      <PageHeader
        breadcrumb={["Home", "Forms", "Institution Forms"]}
        title="Institution Forms"
        description="Comprehensive control panel for all institutional form-based data collection."
        actions={
          <>
            <button
              onClick={load}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "#fff", color: "#475569", border: "1px solid #e2e8f0",
                borderRadius: 8, padding: "0 14px", height: 34, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <IconRefresh /> Refresh List
            </button>
            <button
              onClick={openCreate}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
                padding: "0 16px", height: 34, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                boxShadow: `0 2px 8px ${ACCENT}40`,
              }}
            >
              <IconPlus /> Create New Form
            </button>
          </>
        }
      />

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* Forms table card */}
      <div style={tableCardStyle}>
        {/* toolbar: search + tabs */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid #eef2f6",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ position: "relative", flex: "0 1 260px", maxWidth: 260 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex" }}>
              <IconSearch />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forms…"
              style={{
                width: "100%", padding: "6px 10px 6px 30px", border: "1px solid #e2e8f0",
                borderRadius: 8, fontSize: 12.5, color: "#1e293b", outline: "none", boxSizing: "border-box",
                background: "#f8fafc", height: 32,
              }}
            />
          </div>
          <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 9, padding: 3, gap: 2, background: "#fff" }}>
            {[
              { key: "active",   label: "Active" },
              { key: "archived", label: "Archived" },
            ].map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    border: "none", borderRadius: 7, padding: "6px 16px",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: on ? "#f1f5f9" : "transparent",
                    color: on ? "#1e293b" : "#94a3b8",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading forms…
          </div>
        ) : visibleForms.length === 0 ? (
          <EmptyState archived={tab === "archived"} searching={searching} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Form", "Form Name & Description", "Visibility", "Associated Institutions", "Deadline Status", "Access Status", "Actions"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 14px", textAlign: h === "Actions" ? "right" : "left",
                      fontSize: 10.5, fontWeight: 700, color: "#94a3b8",
                      textTransform: "uppercase", letterSpacing: 0.5,
                      borderBottom: "1px solid #eef2f6", whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleForms.map((form) => {
                  const { dateText, status } = deadlineInfo(form);
                  const lockBusy = lockTogglingForm === form.form_name;
                  return (
                    <tr
                      key={form.id}
                      style={{ borderBottom: "1px solid #f1f5f9", transition: "background .1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      {/* Form avatar */}
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: ACCENT + "18",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: ACCENT, fontWeight: 800, letterSpacing: 0.3,
                        }}>
                          {form.form_name.slice(0, 2).toUpperCase()}
                        </div>
                      </td>

                      {/* Name & description */}
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1e293b", letterSpacing: 0.2 }}>
                          {form.form_name.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {form.description || titleOf(form.form_name)}
                        </div>
                      </td>

                      {/* Visibility */}
                      <td style={{ padding: "8px 14px" }}>
                        <VisibilityBadge shared={!!form.share_table} />
                      </td>

                      {/* Associated institutions */}
                      <td style={{ padding: "8px 14px" }}>
                        <span style={{ fontSize: 13, color: "#475569" }}>{institutionsLabel(form)}</span>
                      </td>

                      {/* Deadline status */}
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 12.5, color: "#475569", fontWeight: 600 }}>{dateText}</span>
                          {status && <Badge label={status.label} color={status.color} />}
                        </div>
                      </td>

                      {/* Access status */}
                      <td style={{ padding: "8px 14px" }}>
                        {form.is_locked
                          ? <StatusBadge tone="locked">LOCKED</StatusBadge>
                          : <StatusBadge tone="open">OPEN</StatusBadge>}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "6px 14px", verticalAlign: "middle" }}>
                        <ActionButtonGroup justify="flex-end">
                          <ActionButton
                            icon={<IconCalendar />}
                            label="Deadline"
                            onClick={() => setDeadlineForm(form)}
                            title="Manage this form's deadline for your institution"
                          />
                          <ExportDropdown
                            formName={form.form_name}
                            accessToken={accessToken}
                          />
                          <ActionButton
                            icon={<IconEye />}
                            iconOnly
                            onClick={() => openRecords(form)}
                            title="View Records"
                          />
                          <ActionButton
                            icon={<IconSettings />}
                            iconOnly
                            onClick={() => openManage(form)}
                            title="Manage Form"
                          />
                          <ActionButton
                            icon={form.is_locked ? <IconLock /> : <IconUnlock />}
                            iconOnly
                            variant={form.is_locked ? "danger" : "success"}
                            onClick={() => handleToggleLock(form)}
                            disabled={lockBusy}
                            title={form.is_locked ? "Unlock Form" : "Lock Form"}
                          />
                        </ActionButtonGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
