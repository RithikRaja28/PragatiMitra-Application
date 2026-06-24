import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../../../store/AuthContext";
import { useApi }  from "../../../../hooks/useApi";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { t } from "../../../../i18n/translations";
import PageHeader from "../../../../ui/PageHeader";
import FormScreen              from "../../../../components/shared/FormScreen";
import { S }                  from "../../../../components/shared/formUtils";
import CollaborativeEditorPage   from "./CollaborativeEditorPage";
import CreateReportWizardPage    from "./CreateReportWizardPage";
import ReportStructurePage       from "./ReportStructurePage";
import AssignSectionsPage        from "./AssignSectionsPage";
import ReviewSectionPage         from "./ReviewSectionPage";
import CompileReportPage         from "./CompileReportPage";
import ReportDashboardPage       from "./ReportDashboardPage";

const SLUG = "report-builder";

/* ─── helpers ───────────────────────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ─── status meta ────────────────────────────────────────────────────────── */
const STATUS_META = {
  DRAFT:     { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8",  bar: "#94a3b8", label: "Draft"     },
  PUBLISHED: { bg: "#dcfce7", color: "#15803d", dot: "#22c55e",  bar: "#22c55e", label: "Published" },
  ARCHIVED:  { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444",  bar: "#ef4444", label: "Archived"  },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: m.bg, color: m.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

/* ─── type badge ─────────────────────────────────────────────────────────── */
const TYPE_COLORS = {
  NAAC:          { bg: "#ede9fe", color: "#5b21b6" },
  Annual:        { bg: "#dbeafe", color: "#1e40af" },
  Department:    { bg: "#fce7f3", color: "#9d174d" },
  Accreditation: { bg: "#fef3c7", color: "#92400e" },
  Research:      { bg: "#d1fae5", color: "#065f46" },
  Other:         { bg: "#f1f5f9", color: "#475569" },
};
function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.Other;
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      background: c.bg, color: c.color, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {type}
    </span>
  );
}

/* ─── progress bar ───────────────────────────────────────────────────────── */
function ProgressBar({ prog }) {
  const pct      = prog?.completion_pct ?? 0;
  const inReview = (prog?.submitted ?? 0) + (prog?.under_review ?? 0);
  const col      = pct === 100 ? "#22c55e" : pct > 60 ? "#3b82f6" : pct > 30 ? "#f59e0b" : "#e2e8f0";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Completion</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: pct === 100 ? "#22c55e" : "#1e293b" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: col,
          borderRadius: 99, transition: "width 0.4s ease",
        }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Pip label="Approved"    val={prog?.approved    ?? 0} col="#22c55e" />
        <Pip label="In Review"   val={inReview}               col="#3b82f6" />
        <Pip label="Not Started" val={prog?.not_started ?? 0} col="#e2e8f0" textCol="#94a3b8" />
      </div>
    </div>
  );
}
function Pip({ label, val, col, textCol }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: textCol || "#64748b" }}>{val} {label}</span>
    </div>
  );
}

/* ─── trash icon SVG ─────────────────────────────────────────────────────── */
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

/* ─── skeleton card ──────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{
      background: "#fff", border: "1.5px solid rgba(0,0,0,0.06)",
      borderRadius: 16, overflow: "hidden",
    }}>
      <div style={{ height: 4, background: "#f1f5f9" }} />
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[60, 55, 70].map((w, i) => (
            <div key={i} style={{ height: 20, width: w, borderRadius: 6, background: "#f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }} />
          ))}
        </div>
        <div style={{ height: 16, width: "80%", borderRadius: 6, background: "#f1f5f9", marginBottom: 8, animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 12, width: "55%", borderRadius: 6, background: "#f1f5f9", marginBottom: 18, animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 6, width: "100%", borderRadius: 99, background: "#f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }} />
      </div>
      <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
        <div style={{ flex: 1, height: 32, borderRadius: 8, background: "#f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ width: 56, height: 32, borderRadius: 8, background: "#f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ width: 36, height: 32, borderRadius: 8, background: "#f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

/* ─── report card ────────────────────────────────────────────────────────── */
function ReportCard({ report, prog, onOpen, onEdit, onStats, onDelete, deleting }) {
  const [hover,       setHover]       = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const meta    = STATUS_META[report.status] || STATUS_META.DRAFT;
  const hasData = prog != null;
  const pct     = prog?.completion_pct ?? 0;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        background: "#fff",
        border: `1.5px solid ${hover ? "rgba(37,99,235,0.25)" : "rgba(0,0,0,0.07)"}`,
        borderRadius: 16,
        boxShadow: hover
          ? "0 8px 28px rgba(37,99,235,0.10)"
          : "0 1px 6px rgba(0,0,0,0.05)",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex", flexDirection: "column",
        transition: "border-color 0.18s, box-shadow 0.18s",
      }}
    >
      {/* Status accent bar */}
      <div style={{ height: 4, background: meta.bar, flexShrink: 0 }} />

      {/* Body */}
      <div style={{ padding: "18px 20px 14px", flex: 1 }}>

        {/* Badges row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          {report.report_type && <TypeBadge type={report.report_type} />}
          {report.academic_year && (
            <span style={{
              padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: "#f0f9ff", color: "#0369a1", letterSpacing: "0.04em",
            }}>
              {report.academic_year}
            </span>
          )}
          <div style={{ marginLeft: "auto" }}>
            <StatusBadge status={report.status} />
          </div>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 15, fontWeight: 700, color: "#1e293b",
          lineHeight: 1.45, marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {report.title}
        </div>

        {/* Meta */}
        <div style={{
          fontSize: 11, color: "#94a3b8", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {report.created_by_name || "Unknown"}
          </span>
          <span style={{ color: "#e2e8f0" }}>·</span>
          <span>{fmtDate(report.created_at)}</span>
          {report.cycle_name && (
            <>
              <span style={{ color: "#e2e8f0" }}>·</span>
              <span style={{ color: "#2563eb", fontWeight: 600 }}>{report.cycle_name}</span>
            </>
          )}
        </div>

        {/* Progress */}
        {hasData
          ? <ProgressBar prog={prog} />
          : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99 }} />
              <span style={{ fontSize: 10, color: "#cbd5e1" }}>Loading…</span>
            </div>
          )
        }
      </div>

      {/* Completion % chip at bottom of body */}
      {hasData && pct === 100 && (
        <div style={{
          margin: "0 20px 12px",
          background: "#dcfce7", borderRadius: 8, padding: "5px 10px",
          fontSize: 11, fontWeight: 700, color: "#15803d",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span>✓</span> All sections approved
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid #f1f5f9",
        display: "flex", gap: 8, alignItems: "center",
        background: hover ? "#f0f7ff" : "#fff",
        transition: "background 0.18s",
      }}>
        {/* Open */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          style={{
            flex: 1, padding: "7px 0", borderRadius: 8, border: "none",
            background: hover ? "#2563eb" : "#dbeafe",
            color: hover ? "#fff" : "#1d4ed8",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            transition: "background 0.18s, color 0.18s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}
        >
          Open
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Edit (DRAFT only) */}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{
              padding: "7px 12px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff",
              fontSize: 11, fontWeight: 600, color: "#2563eb",
              cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", gap: 4,
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.background = "#eff6ff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
            title="Continue editing this draft"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Edit
          </button>
        )}

        {/* Stats */}
        <button
          onClick={(e) => { e.stopPropagation(); onStats(); }}
          style={{
            padding: "7px 12px", borderRadius: 8,
            border: "1px solid #e2e8f0", background: "#fff",
            fontSize: 11, fontWeight: 600, color: "#64748b",
            cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 4,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.color = "#1d4ed8"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round"/>
          </svg>
          Stats
        </button>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={deleting}
          onMouseEnter={() => setDeleteHover(true)}
          onMouseLeave={() => setDeleteHover(false)}
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            border: `1.5px solid ${deleteHover ? "#fca5a5" : "#e2e8f0"}`,
            background: deleteHover ? "#fef2f2" : "#fff",
            color: deleteHover ? "#ef4444" : "#cbd5e1",
            cursor: deleting ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
            opacity: deleting ? 0.5 : 1,
          }}
          title="Delete report"
        >
          {deleting
            ? <div style={{ width: 13, height: 13, border: "2px solid #e2e8f0", borderTop: "2px solid #ef4444", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            : <TrashIcon />
          }
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREATE REPORT FORM  (full-page via FormScreen)
═══════════════════════════════════════════════════════════════════════════ */
function CreateReportForm({ onBack, onCreate }) {
  const [form,   setForm]   = useState({ title: "", report_type: "", academic_year: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((e2) => ({ ...e2, [k]: "" })); };

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true); setSubmitError("");
    try { await onCreate(form); }
    catch (ex) { setSubmitError(ex.message || "Failed to create report"); }
    finally { setSaving(false); }
  }

  return (
    <FormScreen
      pageTitle="Reports"
      formTitle="New Report"
      formSubtitle="Create a new collaborative institutional report"
      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="1.8"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>}
      iconBg="#dbeafe"
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={saving}
      submitLabel="Create Report"
      submitError={submitError}
    >
      {/* Title */}
      <div>
        <label style={S.label}>Report Title *</label>
        <input
          value={form.title}
          onChange={set("title")}
          placeholder="e.g. NAAC Self-Study Report 2025-26"
          autoFocus
          style={S.input(!!errors.title)}
        />
        {errors.title && <div style={S.errorText}>{errors.title}</div>}
      </div>

      {/* Type + Year side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={S.label}>Report Type</label>
          <select value={form.report_type} onChange={set("report_type")} style={S.select(false)}>
            <option value="">Select type…</option>
            {["NAAC", "Annual", "Department", "Accreditation", "Research", "Other"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Academic Year</label>
          <input
            value={form.academic_year}
            onChange={set("academic_year")}
            placeholder="e.g. 2025-26"
            style={S.input(false)}
          />
        </div>
      </div>
    </FormScreen>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPORT BUILDER LIST PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function ReportBuilderListPage() {
  const navFn    = useNavigate();
  const location = useLocation();
  const { user }     = useAuth();
  const { lang }     = useLanguage();
  const { apiFetch } = useApi();

  const listPath  = `/${SLUG}`;
  const pathname  = location.pathname;
  const isCreate    = pathname.endsWith("/create");
  const isStructure = pathname.endsWith("/structure");
  const isEditor    = pathname.endsWith("/editor");
  const isAssign    = pathname.endsWith("/assign");
  const isCompile   = pathname.endsWith("/compile");
  const isDashboard = pathname.endsWith("/dashboard");
  const isReview    = pathname.endsWith("/review");
  const reportEntity = location.state?.entity ?? null; // { id, title }
  const sectionEntity = isReview ? location.state?.entity : null; // { id }

  const [reports,        setReports]        = useState([]);
  const [progress,       setProgress]       = useState({});
  const [loading,        setLoading]        = useState(true);
  const [err,            setErr]            = useState("");
  const [search,         setSearch]         = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [deletingId,     setDeletingId]     = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);

  const roleNames    = new Set((user?.roles || []).map((r) => r.name || r));
  const isSuperAdmin = roleNames.has("super_admin");
  const canCreate    = isSuperAdmin || roleNames.has("institute_admin");

  /* ── fetch list ── */
  const fetchReports = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res  = await apiFetch(`/api/builder/reports?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setReports(json.data || []);
      for (const r of json.data || []) {
        apiFetch(`/api/builder/reports/${r.id}/progress`).then((pr) => pr.json()).then((pd) => {
          if (pd.success) setProgress((prev) => ({ ...prev, [r.id]: pd.data }));
        }).catch(() => {});
      }
    } catch (ex) {
      setErr(ex.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filterStatus]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /* ── create ── */
  async function handleCreate(form) {
    const res  = await apiFetch("/api/builder/reports", { method: "POST", body: JSON.stringify(form) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to create");
    navFn(listPath);
    fetchReports();
  }

  /* ── delete ── */
  async function handleDelete(id, title) {
    if (!window.confirm(`Delete report "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/builder/reports/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (ex) { alert(ex.message || "Failed to delete"); }
    finally { setDeletingId(null); }
  }

  /* ── sub-views ── */
  if (editingReportId) {
    return (
      <CreateReportWizardPage
        initialReportId={editingReportId}
        onCreated={() => { setEditingReportId(null); fetchReports(); }}
        onCancel={() => setEditingReportId(null)}
      />
    );
  }

  if (isCreate) {
    return (
      <CreateReportWizardPage
        onCreated={(report) => {
          fetchReports();
          navFn(`${listPath}/structure`, { state: { entity: { id: report.id, title: report.title } } });
        }}
        onCancel={() => navFn(listPath)}
      />
    );
  }

  if (isStructure) {
    if (!reportEntity) return <Navigate to={listPath} replace />;
    return (
      <ReportStructurePage
        reportId={reportEntity.id}
        onNavigate={(viewName, id) => {
          if (viewName === "review") {
            navFn(`${listPath}/review`, { state: { entity: { id } } });
          } else if (viewName === "list") {
            navFn(listPath);
          } else {
            navFn(`${listPath}/${viewName}`, { state: { entity: reportEntity } });
          }
        }}
      />
    );
  }

  if (isEditor) {
    if (!reportEntity) return <Navigate to={listPath} replace />;
    return (
      <CollaborativeEditorPage
        reportId={reportEntity.id}
        reportTitle={reportEntity.title}
        onBack={() => { fetchReports(); navFn(listPath); }}
      />
    );
  }

  if (isAssign) {
    if (!reportEntity) return <Navigate to={listPath} replace />;
    return (
      <AssignSectionsPage
        reportId={reportEntity.id}
        onBack={() => navFn(`${listPath}/structure`, { state: { entity: reportEntity } })}
      />
    );
  }

  if (isCompile) {
    if (!reportEntity) return <Navigate to={listPath} replace />;
    return (
      <CompileReportPage
        reportId={reportEntity.id}
        onBack={() => navFn(`${listPath}/structure`, { state: { entity: reportEntity } })}
      />
    );
  }

  if (isDashboard) {
    if (!reportEntity) return <Navigate to={listPath} replace />;
    return (
      <ReportDashboardPage
        reportId={reportEntity.id}
        onNavigate={(viewName, id) => {
          if (viewName === "list") navFn(listPath);
          else navFn(`${listPath}/${viewName}`, { state: { entity: reportEntity } });
        }}
      />
    );
  }

  if (isReview) {
    if (!sectionEntity) return <Navigate to={listPath} replace />;
    return (
      <ReviewSectionPage
        sectionId={sectionEntity.id}
        onBack={() => navFn(listPath)}
      />
    );
  }

  /* ── filter ── */
  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) ||
      (r.report_type || "").toLowerCase().includes(q) ||
      (r.academic_year || "").includes(q);
  });

  const totalDraft     = reports.filter(r => r.status === "DRAFT").length;
  const totalPublished = reports.filter(r => r.status === "PUBLISHED").length;
  const totalArchived  = reports.filter(r => r.status === "ARCHIVED").length;

  return (
    <div style={{
      padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: "transparent", minHeight: "100%",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes spin   { to { transform: rotate(360deg) } }
      `}</style>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Report Builder", lang)]}
        title={t("Collaborative Reports", lang)}
        description={t("Create and manage institutional reports with section-level collaboration", lang)}
        actions={canCreate && (
          <button
            onClick={() => navFn(`${listPath}/create`)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 20px",
              background: "#2563eb", color: "#fff", border: "none", borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
              boxShadow: "0 2px 10px rgba(37,99,235,0.28)",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span> {t("New Report", lang)}
          </button>
        )}
      />

      {/* ── Stat chips ── */}
      {!loading && reports.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
          {[
            { label: "Total",     val: reports.length, bg: "#f8fafc",  color: "#1e293b", dot: "#2563eb" },
            { label: "Draft",     val: totalDraft,     bg: "#f8fafc",  color: "#475569", dot: "#94a3b8" },
            { label: "Published", val: totalPublished, bg: "#f0fdf4",  color: "#15803d", dot: "#22c55e" },
            { label: "Archived",  val: totalArchived,  bg: "#fff1f2",  color: "#b91c1c", dot: "#ef4444" },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setFilterStatus(s.label === "Total" ? "" : s.label.toUpperCase())}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "7px 14px", borderRadius: 20,
                border: `1.5px solid ${
                  filterStatus === (s.label === "Total" ? "" : s.label.toUpperCase()) ? s.dot : "rgba(0,0,0,0.08)"
                }`,
                background: filterStatus === (s.label === "Total" ? "" : s.label.toUpperCase()) ? s.bg : "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 700, color: s.color,
                transition: "all 0.15s",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot }} />
              {s.val} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 22,
        background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 12, padding: "12px 16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, type, or year…"
            style={{
              ...S.input(false), paddingLeft: 32, height: 36,
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            ...S.select(false), width: 150, height: 36,
            background: "#f8fafc url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\") no-repeat right 12px center",
            border: "1px solid #e2e8f0",
          }}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(""); setFilterStatus(""); }}
            style={{
              padding: "0 12px", height: 36, borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff",
              fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {!loading && err && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5",
          color: "#b91c1c", padding: "14px 18px", borderRadius: 12,
          fontSize: 13, marginBottom: 20,
        }}>
          {err}
        </div>
      )}

      {/* ── Loading skeleton grid ── */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 18 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !err && filtered.length === 0 && (
        <div style={{
          background: "#fff", border: "1.5px solid rgba(0,0,0,0.07)",
          borderRadius: 16, padding: "64px 40px", textAlign: "center",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        }}>
          <div style={{ width: 56, height: 56, background: "#f1f5f9", borderRadius: 14, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            {search || filterStatus ? "No reports match your filters" : "No reports yet"}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>
            {search || filterStatus
              ? "Try a different search or clear the filters."
              : "Start by creating your first institutional report."}
          </div>
          {!search && !filterStatus && canCreate && (
            <button
              onClick={() => navFn(`${listPath}/create`)}
              style={{
                padding: "10px 24px", background: "#2563eb", color: "#fff",
                border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 2px 10px rgba(37,99,235,0.28)",
              }}
            >
              ＋ Create First Report
            </button>
          )}
        </div>
      )}

      {/* ── Card grid ── */}
      {!loading && !err && filtered.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 18 }}>
            {filtered.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                prog={progress[r.id]}
                onOpen={() => navFn(`${listPath}/structure`, { state: { entity: { id: r.id, title: r.title } } })}
                onEdit={r.status === "DRAFT" ? () => setEditingReportId(r.id) : null}
                onStats={() => navFn(`${listPath}/dashboard`, { state: { entity: { id: r.id, title: r.title } } })}
                onDelete={() => handleDelete(r.id, r.title)}
                deleting={deletingId === r.id}
              />
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Showing {filtered.length} of {reports.length} report{reports.length !== 1 ? "s" : ""}
          </div>
        </>
      )}
    </div>
  );
}
