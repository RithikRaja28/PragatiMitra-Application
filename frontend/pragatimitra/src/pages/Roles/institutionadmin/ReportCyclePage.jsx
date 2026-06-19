import { useState, useEffect, useCallback, useRef } from "react";
import { useApi }  from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import FormScreen  from "../../../components/shared/FormScreen";
import { S, Toast, ConfirmDialog, isAuthError } from "../../../components/shared/formUtils";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import PageHeader from "../../../ui/PageHeader";

/* ─── Design tokens ────────────────────────────────────────────── */
const C = {
  primary:   "#2563eb",
  primaryLt: "#dbeafe",
  text:      "#1e293b",
  textSub:   "#64748b",
  border:    "rgba(37,99,235,0.12)",
  bg:        "#f8f9fb",
  surface:   "#ffffff",
  danger:    "#ef4444",
  dangerLt:  "#fef2f2",
  success:   "#059669",
  successLt: "#d1fae5",
  amber:     "#d97706",
  amberLt:   "#fef3c7",
};

const card = {
  background:   C.surface,
  border:       `1px solid rgba(0,0,0,0.07)`,
  borderRadius: 14,
  boxShadow:    "0 1px 6px rgba(99,102,241,0.07)",
};

/* ─── Helpers ──────────────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toLocalDTInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localDTToISO(val) {
  if (!val) return null;
  return new Date(val).toISOString();
}

const STATUS_META = {
  ACTIVE:   { label: "Active",   bg: "#d1fae5", color: "#065f46" },
  CLOSED:   { label: "Closed",   bg: "#fef3c7", color: "#92400e" },
  ARCHIVED: { label: "Archived", bg: "#f1f5f9", color: "#64748b" },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.ACTIVE;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: m.bg, color: m.color, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {m.label}
    </span>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────── */
function StatCard({ label, value, icon, color }) {
  return (
    <div style={{
      ...card, padding: "18px 22px",
      display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 150,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 11, flexShrink: 0,
        background: color + "22", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 18,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: C.textSub, marginTop: 2, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

/* ─── Skeleton row ──────────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      {[200, 100, 120, 110, 110, 90, 100].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{
            height: 13, width: w, borderRadius: 6, background: "#f1f5f9",
            animation: "pulse 1.4s ease-in-out infinite",
          }} />
        </td>
      ))}
    </tr>
  );
}

/* ─── Year option generator ─────────────────────────────────────── */
function generateYearOptions() {
  const cur = new Date().getFullYear();
  const opts = [];
  for (let y = cur - 3; y <= cur + 5; y++) opts.push(`${y}-${y + 1}`);
  return opts;
}
const YEAR_OPTIONS = generateYearOptions();

/* ─── CycleForm ─────────────────────────────────────────────────── */
function CycleForm({ mode, entity, onCreated, onSaved, onBack }) {
  const { apiFetch } = useApi();
  const isEdit = mode === "edit";

  const EMPTY = {
    name: "", description: "", reporting_year: "",
    start_date: "", end_date: "",
    submission_deadline: "", review_deadline: "", approval_deadline: "",
  };

  const [form, setForm] = useState(() => isEdit ? {
    name:                entity.name                 || "",
    description:         entity.description          || "",
    reporting_year:      entity.reporting_year        || "",
    start_date:          entity.start_date?.slice(0, 10) || "",
    end_date:            entity.end_date?.slice(0, 10)   || "",
    submission_deadline: toLocalDTInput(entity.submission_deadline),
    review_deadline:     toLocalDTInput(entity.review_deadline),
    approval_deadline:   toLocalDTInput(entity.approval_deadline),
  } : EMPTY);

  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function set(key, value) {
    if (fieldErrors[key]) setFieldErrors(e => ({ ...e, [key]: "" }));
    if (submitError) setSubmitError("");

    // Auto-suggest reporting_year when start_date changes and year is still blank
    if (key === "start_date" && value) {
      const yr = new Date(value).getFullYear();
      const suggested = `${yr}-${yr + 1}`;
      setForm(f => ({
        ...f,
        start_date: value,
        reporting_year: f.reporting_year || suggested,
      }));
      return;
    }

    setForm(f => ({ ...f, [key]: value }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Cycle name is required.";
    if (!form.start_date)  errs.start_date = "Start date is required.";
    if (!form.end_date)    errs.end_date = "End date is required.";

    const sd  = form.start_date;           // "YYYY-MM-DD"
    const ed  = form.end_date;             // "YYYY-MM-DD"
    const sub = form.submission_deadline;  // "YYYY-MM-DDTHH:MM" or ""
    const rev = form.review_deadline;
    const app = form.approval_deadline;

    if (sd && ed && ed < sd)
      errs.end_date = "End date must be on or after the start date.";

    // Deadline chain: start < submission < review < approval < end
    if (sd && sub && sub.slice(0, 10) < sd)
      errs.submission_deadline = "Submission deadline must be after the start date.";
    if (sub && rev && rev < sub)
      errs.review_deadline = "Review deadline must be after the submission deadline.";
    if (rev && app && app < rev)
      errs.approval_deadline = "Approval deadline must be after the review deadline.";
    if (app && ed && app.slice(0, 10) > ed)
      errs.approval_deadline = (errs.approval_deadline ? errs.approval_deadline + " " : "") +
        "Approval deadline must be on or before the end date.";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const body = {
        name:                form.name.trim(),
        description:         form.description.trim() || null,
        reporting_year:      form.reporting_year.trim() || null,
        start_date:          form.start_date,
        end_date:            form.end_date,
        submission_deadline: localDTToISO(form.submission_deadline),
        review_deadline:     localDTToISO(form.review_deadline),
        approval_deadline:   localDTToISO(form.approval_deadline),
      };

      const res  = isEdit
        ? await apiFetch(`/api/builder/cycles/${entity.id}`, { method: "PUT",  body: JSON.stringify(body) })
        : await apiFetch("/api/builder/cycles",               { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();

      if (data.success) {
        if (isEdit) onSaved("Reporting cycle updated successfully.");
        else        onCreated("Reporting cycle created successfully.");
      } else {
        setSubmitError(data.message || `Failed to ${isEdit ? "update" : "create"} cycle.`);
      }
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldRow = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
  const sectionHead = {
    fontSize: 11, fontWeight: 700, color: C.textSub,
    textTransform: "uppercase", letterSpacing: "0.08em",
    marginBottom: 12, marginTop: 4,
    paddingBottom: 6, borderBottom: `1px solid ${C.border}`,
  };

  return (
    <FormScreen
      pageTitle="Reporting Cycles"
      formTitle={isEdit ? "Edit Reporting Cycle" : "New Reporting Cycle"}
      formSubtitle={isEdit
        ? "Update the cycle details or adjust deadlines."
        : "Define the reporting period and outer deadline bounds for all reports in this cycle."
      }
      icon={isEdit ? "✏️" : "📅"}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? "Save Changes" : "Create Cycle"}
      submitError={submitError}
    >
      {/* ── Basic info ── */}
      <div style={sectionHead}>Basic Information</div>

      <div>
        <label style={S.label}>Cycle Name <span style={{ color: C.danger }}>*</span></label>
        <input
          ref={nameRef}
          type="text"
          placeholder="e.g. NAAC SSR 2025-26"
          value={form.name}
          onChange={e => set("name", e.target.value)}
          disabled={submitting}
          maxLength={160}
          style={S.input(!!fieldErrors.name)}
        />
        {fieldErrors.name && <div style={S.errorText}>{fieldErrors.name}</div>}
      </div>

      <div>
        <label style={S.label}>Description</label>
        <textarea
          placeholder="Brief description of this reporting period (optional)"
          value={form.description}
          onChange={e => set("description", e.target.value)}
          disabled={submitting}
          rows={2}
          style={{
            ...S.input(false), height: "auto", padding: "9px 14px",
            resize: "vertical", fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        />
      </div>

      <div>
        <label style={S.label}>Reporting Year</label>
        <select
          value={form.reporting_year}
          onChange={e => set("reporting_year", e.target.value)}
          disabled={submitting}
          style={S.select(false)}
        >
          <option value="">— Select year —</option>
          {YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Auto-suggested from the start date. Covers the academic year this cycle belongs to.
        </div>
      </div>

      {/* ── Period ── */}
      <div style={{ ...sectionHead, marginTop: 20 }}>Reporting Period</div>

      <div style={fieldRow}>
        <div>
          <label style={S.label}>Start Date <span style={{ color: C.danger }}>*</span></label>
          <input
            type="date"
            value={form.start_date}
            onChange={e => set("start_date", e.target.value)}
            disabled={submitting}
            style={S.input(!!fieldErrors.start_date)}
          />
          {fieldErrors.start_date && <div style={S.errorText}>{fieldErrors.start_date}</div>}
        </div>
        <div>
          <label style={S.label}>End Date <span style={{ color: C.danger }}>*</span></label>
          <input
            type="date"
            value={form.end_date}
            onChange={e => set("end_date", e.target.value)}
            disabled={submitting}
            style={S.input(!!fieldErrors.end_date)}
          />
          {fieldErrors.end_date && <div style={S.errorText}>{fieldErrors.end_date}</div>}
        </div>
      </div>

      {/* ── Deadlines ── */}
      <div style={{ ...sectionHead, marginTop: 20 }}>
        Outer Deadline Bounds
        <span style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
          — no deadline anywhere below can be later than these
        </span>
      </div>

      <div style={{
        background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#92400e", lineHeight: 1.55,
        marginBottom: 14,
      }}>
        These act as ceiling deadlines. Report-level, department-level, section-level, and individual
        assignment deadlines must all fall within these bounds.
      </div>

      <div>
        <label style={S.label}>Submission Deadline</label>
        <input
          type="datetime-local"
          value={form.submission_deadline}
          onChange={e => set("submission_deadline", e.target.value)}
          disabled={submitting}
          style={S.input(!!fieldErrors.submission_deadline)}
        />
        {fieldErrors.submission_deadline && <div style={S.errorText}>{fieldErrors.submission_deadline}</div>}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Last date by which all section contributors must submit their content.
        </div>
      </div>

      <div>
        <label style={S.label}>Review Deadline</label>
        <input
          type="datetime-local"
          value={form.review_deadline}
          onChange={e => set("review_deadline", e.target.value)}
          disabled={submitting}
          style={S.input(!!fieldErrors.review_deadline)}
        />
        {fieldErrors.review_deadline && <div style={S.errorText}>{fieldErrors.review_deadline}</div>}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Last date by which all reviewers must complete their reviews.
        </div>
      </div>

      <div>
        <label style={S.label}>Approval Deadline</label>
        <input
          type="datetime-local"
          value={form.approval_deadline}
          onChange={e => set("approval_deadline", e.target.value)}
          disabled={submitting}
          style={S.input(!!fieldErrors.approval_deadline)}
        />
        {fieldErrors.approval_deadline && <div style={S.errorText}>{fieldErrors.approval_deadline}</div>}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Last date by which the director's office must approve all sections.
        </div>
      </div>
    </FormScreen>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
const STATUS_TABS = [
  { key: "ALL",      label: "All Cycles"  },
  { key: "ACTIVE",   label: "Active"      },
  { key: "CLOSED",   label: "Closed"      },
  { key: "ARCHIVED", label: "Archived"    },
];

export default function ReportCyclePage() {
  const { apiFetch }   = useApi();
  const { user }       = useAuth();
  const { lang }       = useLanguage();

  const [screen,   setScreen]   = useState("list"); // "list" | "create" | "edit"
  const [cycles,   setCycles]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("ALL");
  const [editItem, setEditItem] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [actioning, setActioning] = useState(null); // cycle id being actioned
  const [confirm,  setConfirm]  = useState(null);  // ConfirmDialog props | null

  const toastTimer = useRef(null);
  function showToast(message, type = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  /* ── Fetch ─────────────────────────────────────────────────── */
  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab !== "ALL" ? `?status=${tab}` : "";
      const res    = await apiFetch(`/api/builder/cycles${params}`);
      const data   = await res.json();
      if (data.success) setCycles(data.data || []);
      else showToast(data.message || "Failed to load cycles.", "error");
    } catch {
      showToast("Network error while loading cycles.", "error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, tab]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  /* ── Status transition ────────────────────────────────────── */
  function handleClose(cycle) {
    setConfirm({
      title: "Close this cycle?",
      message: `"${cycle.name}" will be moved to CLOSED status. You can reactivate it later if needed.`,
      variant: "warning",
      confirmLabel: "Close Cycle",
      onConfirm: async () => {
        setActioning(cycle.id);
        try {
          const res  = await apiFetch(`/api/builder/cycles/${cycle.id}/close`, { method: "PATCH" });
          const data = await res.json();
          if (data.success) { showToast("Cycle closed successfully."); fetchCycles(); }
          else showToast(data.message || "Failed to close cycle.", "error");
        } catch { showToast("Network error.", "error"); }
        finally { setActioning(null); }
      },
    });
  }

  function handleArchive(cycle) {
    setConfirm({
      title: "Archive this cycle?",
      message: `"${cycle.name}" will become read-only and hidden from the default list.`,
      variant: "warning",
      confirmLabel: "Archive",
      onConfirm: async () => {
        setActioning(cycle.id);
        try {
          const res  = await apiFetch(`/api/builder/cycles/${cycle.id}/archive`, { method: "PATCH" });
          const data = await res.json();
          if (data.success) { showToast("Cycle archived."); fetchCycles(); }
          else showToast(data.message || "Failed to archive cycle.", "error");
        } catch { showToast("Network error.", "error"); }
        finally { setActioning(null); }
      },
    });
  }

  function handleReactivate(cycle) {
    setConfirm({
      title: "Reactivate this cycle?",
      message: `"${cycle.name}" will be moved back to ACTIVE status.`,
      variant: "default",
      confirmLabel: "Reactivate",
      onConfirm: async () => {
        setActioning(cycle.id);
        try {
          const res  = await apiFetch(`/api/builder/cycles/${cycle.id}/reactivate`, { method: "PATCH" });
          const data = await res.json();
          if (data.success) { showToast("Cycle reactivated."); fetchCycles(); }
          else showToast(data.message || "Failed to reactivate cycle.", "error");
        } catch { showToast("Network error.", "error"); }
        finally { setActioning(null); }
      },
    });
  }

  function handleDelete(cycle) {
    setConfirm({
      title: "Delete this cycle?",
      message: `"${cycle.name}" will be permanently deleted. This cannot be undone. Cycles with existing reports cannot be deleted.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setActioning(cycle.id);
        try {
          const res  = await apiFetch(`/api/builder/cycles/${cycle.id}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) { showToast("Cycle deleted."); fetchCycles(); }
          else showToast(data.message || "Failed to delete cycle.", "error");
        } catch { showToast("Network error.", "error"); }
        finally { setActioning(null); }
      },
    });
  }

  /* ── Form callbacks ───────────────────────────────────────── */
  function onCreated(msg) { showToast(msg); fetchCycles(); setScreen("list"); }
  function onSaved(msg)   { showToast(msg); fetchCycles(); setScreen("list"); }
  function onBack()       { setScreen("list"); setEditItem(null); }

  /* ── Stats ────────────────────────────────────────────────── */
  const totalActive   = cycles.filter(c => c.status === "ACTIVE").length;
  const totalClosed   = cycles.filter(c => c.status === "CLOSED").length;
  const totalReports  = cycles.reduce((s, c) => s + Number(c.report_count || 0), 0);

  /* ── Render form screens ─────────────────────────────────── */
  if (screen === "create") {
    return <CycleForm mode="create" onCreated={onCreated} onBack={onBack} />;
  }
  if (screen === "edit" && editItem) {
    return <CycleForm mode="edit" entity={editItem} onSaved={onSaved} onBack={onBack} />;
  }

  /* ── List screen ─────────────────────────────────────────── */
  const thSt = {
    padding: "10px 16px", fontSize: 11, fontWeight: 700,
    color: C.textSub, textTransform: "uppercase",
    letterSpacing: "0.07em", whiteSpace: "nowrap",
    borderBottom: `1px solid ${C.border}`, background: "#f8fafc",
    textAlign: "left",
  };
  const tdSt = {
    padding: "14px 16px", fontSize: 13, color: C.text,
    borderBottom: "1px solid #f1f5f9", verticalAlign: "middle",
  };

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: C.bg, minHeight: "100%", padding: 28,
    }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Institute", lang), t("Report Cycles", lang)]}
        title={t("Report Cycles", lang)}
        description={t("Each reporting cycle defines the period and outer deadline bounds for all reports under it.", lang)}
        actions={
          <button
            onClick={() => setScreen("create")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: C.primary, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> {t("New Cycle", lang)}
          </button>
        }
      />

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Total Cycles"   value={cycles.length} icon="🗂️"  color="#6366f1" />
        <StatCard label="Active Cycles"  value={totalActive}   icon="✅"  color="#059669" />
        <StatCard label="Closed Cycles"  value={totalClosed}   icon="🔒"  color="#d97706" />
        <StatCard label="Total Reports"  value={totalReports}  icon="📄"  color="#2563eb" />
      </div>

      {/* ── Status tabs ── */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 4, width: "fit-content",
      }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 16px", borderRadius: 7, border: "none",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: tab === t.key ? C.primary : "transparent",
              color:      tab === t.key ? "#fff"     : C.textSub,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thSt}>Cycle Name</th>
                <th style={thSt}>Year</th>
                <th style={thSt}>Period</th>
                <th style={thSt}>Submission DL</th>
                <th style={thSt}>Review DL</th>
                <th style={thSt}>Approval DL</th>
                <th style={thSt}>Reports</th>
                <th style={thSt}>Status</th>
                <th style={{ ...thSt, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1,2,3].map(i => <SkeletonRow key={i} />)
                : cycles.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} style={{
                        padding: "56px 0", textAlign: "center",
                        color: C.textSub, fontSize: 14,
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                        {tab === "ALL"
                          ? "No reporting cycles yet. Click \"New Cycle\" to create one."
                          : `No ${tab.toLowerCase()} cycles.`}
                      </td>
                    </tr>
                  )
                  : cycles.map(cycle => {
                    const isActioning = actioning === cycle.id;
                    return (
                      <tr key={cycle.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafbff"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        {/* Name + created by */}
                        <td style={tdSt}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                            {cycle.name}
                          </div>
                          {cycle.description && (
                            <div style={{
                              fontSize: 11, color: C.textSub, marginTop: 2,
                              maxWidth: 220, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }} title={cycle.description}>
                              {cycle.description}
                            </div>
                          )}
                          {cycle.created_by_name && (
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                              By {cycle.created_by_name}
                            </div>
                          )}
                        </td>

                        {/* Year */}
                        <td style={tdSt}>
                          <span style={{
                            background: "#eff6ff", color: "#1d4ed8",
                            fontSize: 11, fontWeight: 700, borderRadius: 6,
                            padding: "3px 8px", whiteSpace: "nowrap",
                            fontFamily: "monospace", letterSpacing: 0.5,
                          }}>
                            {cycle.reporting_year || "—"}
                          </span>
                        </td>

                        {/* Period */}
                        <td style={tdSt}>
                          <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {fmtDate(cycle.start_date)}
                          </div>
                          <div style={{ fontSize: 11, color: C.textSub, whiteSpace: "nowrap" }}>
                            to {fmtDate(cycle.end_date)}
                          </div>
                        </td>

                        {/* Deadlines */}
                        <td style={{ ...tdSt, fontSize: 12, whiteSpace: "nowrap", color: C.textSub }}>
                          {cycle.submission_deadline ? (
                            <span title={fmtDT(cycle.submission_deadline)}>
                              {fmtDate(cycle.submission_deadline)}
                            </span>
                          ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                        <td style={{ ...tdSt, fontSize: 12, whiteSpace: "nowrap", color: C.textSub }}>
                          {cycle.review_deadline ? (
                            <span title={fmtDT(cycle.review_deadline)}>
                              {fmtDate(cycle.review_deadline)}
                            </span>
                          ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                        <td style={{ ...tdSt, fontSize: 12, whiteSpace: "nowrap", color: C.textSub }}>
                          {cycle.approval_deadline ? (
                            <span title={fmtDT(cycle.approval_deadline)}>
                              {fmtDate(cycle.approval_deadline)}
                            </span>
                          ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>

                        {/* Reports */}
                        <td style={{ ...tdSt, textAlign: "center" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: "50%",
                            background: Number(cycle.report_count) > 0 ? "#eff6ff" : "#f8fafc",
                            color:      Number(cycle.report_count) > 0 ? C.primary  : "#94a3b8",
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {cycle.report_count || 0}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={tdSt}>
                          <StatusBadge status={cycle.status} />
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdSt, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            {/* Edit — always available */}
                            <button
                              onClick={() => { setEditItem(cycle); setScreen("edit"); }}
                              style={{
                                padding: "5px 12px", borderRadius: 7,
                                border: "1px solid #e2e8f0", background: "#fff",
                                fontSize: 11, fontWeight: 600, color: C.primary,
                                cursor: "pointer", whiteSpace: "nowrap",
                              }}
                            >
                              Edit
                            </button>

                            {/* Close — ACTIVE only */}
                            {cycle.status === "ACTIVE" && (
                              <button
                                onClick={() => handleClose(cycle)}
                                disabled={isActioning}
                                style={{
                                  padding: "5px 12px", borderRadius: 7,
                                  border: "1px solid #fde68a", background: "#fffbeb",
                                  fontSize: 11, fontWeight: 600, color: C.amber,
                                  cursor: isActioning ? "not-allowed" : "pointer",
                                  opacity: isActioning ? 0.6 : 1, whiteSpace: "nowrap",
                                }}
                              >
                                {isActioning ? "…" : "Close"}
                              </button>
                            )}

                            {/* Reactivate — CLOSED only (toggle back to ACTIVE) */}
                            {cycle.status === "CLOSED" && (
                              <button
                                onClick={() => handleReactivate(cycle)}
                                disabled={isActioning}
                                style={{
                                  padding: "5px 12px", borderRadius: 7,
                                  border: "1px solid #bbf7d0", background: "#f0fdf4",
                                  fontSize: 11, fontWeight: 600, color: C.success,
                                  cursor: isActioning ? "not-allowed" : "pointer",
                                  opacity: isActioning ? 0.6 : 1, whiteSpace: "nowrap",
                                }}
                              >
                                {isActioning ? "…" : "Reactivate"}
                              </button>
                            )}

                            {/* Archive — CLOSED only */}
                            {cycle.status === "CLOSED" && (
                              <button
                                onClick={() => handleArchive(cycle)}
                                disabled={isActioning}
                                style={{
                                  padding: "5px 12px", borderRadius: 7,
                                  border: "1px solid #e2e8f0", background: "#f8fafc",
                                  fontSize: 11, fontWeight: 600, color: "#64748b",
                                  cursor: isActioning ? "not-allowed" : "pointer",
                                  opacity: isActioning ? 0.6 : 1, whiteSpace: "nowrap",
                                }}
                              >
                                {isActioning ? "…" : "Archive"}
                              </button>
                            )}

                            {/* Delete — no reports required */}
                            <button
                              onClick={() => handleDelete(cycle)}
                              disabled={isActioning}
                              style={{
                                padding: "5px 12px", borderRadius: 7,
                                border: "1px solid #fecaca", background: "#fef2f2",
                                fontSize: 11, fontWeight: 600, color: C.danger,
                                cursor: isActioning ? "not-allowed" : "pointer",
                                opacity: isActioning ? 0.6 : 1, whiteSpace: "nowrap",
                              }}
                            >
                              {isActioning ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        {!loading && cycles.length > 0 && (
          <div style={{
            padding: "10px 18px", borderTop: `1px solid ${C.border}`,
            fontSize: 11, color: "#94a3b8", display: "flex",
            justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{cycles.length} cycle{cycles.length !== 1 ? "s" : ""} shown</span>
            <span>
              ACTIVE ⇌ CLOSED → ARCHIVED · Delete only if no reports exist
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
