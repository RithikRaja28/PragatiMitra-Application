import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../store/AuthContext";
import { useApi }  from "../../../../hooks/useApi";
import FormScreen   from "../../../../components/shared/FormScreen";
import { S }        from "../../../../components/shared/formUtils";
import CollaborativeEditorPage   from "./CollaborativeEditorPage";
import CreateReportWizardPage    from "./CreateReportWizardPage";
import ReportStructurePage       from "./ReportStructurePage";
import AssignSectionsPage        from "./AssignSectionsPage";
import ReviewSectionPage         from "./ReviewSectionPage";
import CompileReportPage         from "./CompileReportPage";
import ReportDashboardPage       from "./ReportDashboardPage";

/* ─── status badge ────────────────────────────────────────────────────────── */
const STATUS_STYLE = {
  DRAFT:     { bg: "#f1f5f9", color: "#475569" },
  PUBLISHED: { bg: "#dcfce7", color: "#15803d" },
  ARCHIVED:  { bg: "#fee2e2", color: "#b91c1c" },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {status}
    </span>
  );
}

/* ─── progress bar ───────────────────────────────────────────────────────── */
function ProgressBar({ prog }) {
  const pct  = prog?.completion_pct ?? 0;
  const col  = pct === 100 ? "#22c55e" : pct > 50 ? "#3b82f6" : "#f59e0b";
  const inReview = (prog?.submitted ?? 0) + (prog?.under_review ?? 0);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0, minWidth: 26, textAlign: "right" }}>{pct}%</span>
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>
        {prog?.approved ?? 0}/{prog?.total ?? 0} approved
        {inReview > 0 && <span style={{ color: "#3b82f6", marginLeft: 5 }}>· {inReview} in review</span>}
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
      icon="📋"
      iconBg="#ede9fe"
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
  const { user }     = useAuth();
  const { apiFetch } = useApi();

  // view: "list" | "wizard" | "editor" | "structure" | "assign" | "compile" | "dashboard" | "review"
  const [view,       setView]       = useState("list");
  const [openReport, setOpenReport] = useState(null); // { id, title }
  const [openSection, setOpenSection] = useState(null); // sectionId for review

  const navigate = (viewName, id) => {
    if (viewName === "review") {
      setOpenSection(id);
    } else if (id && viewName !== "list") {
      setOpenReport(r => (r?.id === id ? r : { id, title: "" }));
    }
    setView(viewName);
  };

  const [reports,      setReports]      = useState([]);
  const [progress,     setProgress]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState("");
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [deletingId,   setDeletingId]   = useState(null);

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
    setView("list");
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
  if (view === "wizard") {
    return (
      <CreateReportWizardPage
        onCreated={(report) => { setOpenReport(report); setView("structure"); fetchReports(); }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "create") {
    return <CreateReportForm onBack={() => setView("list")} onCreate={handleCreate} />;
  }

  if (view === "editor" && openReport) {
    return (
      <CollaborativeEditorPage
        reportId={openReport.id}
        reportTitle={openReport.title}
        onBack={() => { setOpenReport(null); setView("list"); fetchReports(); }}
      />
    );
  }

  if (view === "structure" && openReport) {
    return (
      <ReportStructurePage
        reportId={openReport.id}
        onNavigate={navigate}
      />
    );
  }

  if (view === "assign" && openReport) {
    return (
      <AssignSectionsPage
        reportId={openReport.id}
        onBack={() => setView("structure")}
      />
    );
  }

  if (view === "compile" && openReport) {
    return (
      <CompileReportPage
        reportId={openReport.id}
        onBack={() => setView("structure")}
      />
    );
  }

  if (view === "dashboard" && openReport) {
    return (
      <ReportDashboardPage
        reportId={openReport.id}
        onNavigate={navigate}
      />
    );
  }

  if (view === "review" && openSection) {
    return (
      <ReviewSectionPage
        sectionId={openSection}
        onBack={() => setView("structure")}
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

  const card = {
    background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
    borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  };

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1100 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#ede9fe", borderRadius: 8, padding: "3px 10px", marginBottom: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1 }}>
              Report Builder
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.3px", marginBottom: 4 }}>
            Collaborative Reports
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            Create and manage institutional reports with section-level collaboration
          </p>
        </div>

        {canCreate && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setView("wizard")} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 18px",
              background: "#7c3aed", color: "#fff", border: "none", borderRadius: 9,
              fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Report
            </button>
          </div>
        )}
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
          style={{ flex: 1, ...S.input(false) }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 160, ...S.select(false) }}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {/* states */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>Loading reports…</div>
      )}
      {!loading && err && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, fontSize: 14 }}>{err}</div>
      )}

      {/* empty */}
      {!loading && !err && filtered.length === 0 && (
        <div style={{ ...card, padding: "60px 40px", overflow: "hidden", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>
            {search || filterStatus ? "No reports match your filters" : "No reports yet"}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
            {!search && !filterStatus && "Create your first report to get started."}
          </div>
          {!search && !filterStatus && canCreate && (
            <button onClick={() => setView("wizard")} style={{
              padding: "10px 22px", background: "#7c3aed", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              + New Report
            </button>
          )}
        </div>
      )}

      {/* table */}
      {!loading && !err && filtered.length > 0 && (
        <div style={card}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 110px 100px 130px 80px 36px",
            gap: 12, padding: "11px 20px",
            background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            {["Report", "Type", "Status", "Progress", "", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
            ))}
          </div>

          {filtered.map((r, idx) => {
            const prog = progress[r.id];
            return (
              <div key={r.id}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 110px 100px 130px 80px 36px",
                  gap: 12, padding: "14px 20px", alignItems: "center",
                  borderBottom: idx < filtered.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                onClick={() => { setOpenReport({ id: r.id, title: r.title }); setView("structure"); }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {r.academic_year || "—"} · Created by {r.created_by_name || "Unknown"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{r.report_type || "—"}</div>
                <div onClick={(e) => e.stopPropagation()}><StatusBadge status={r.status} /></div>
                <div>
                  {prog
                    ? <ProgressBar prog={prog} />
                    : <span style={{ fontSize: 11, color: "#cbd5e1" }}>—</span>}
                </div>
                <div onClick={(e) => { e.stopPropagation(); setOpenReport({ id: r.id, title: r.title }); setView("dashboard"); }}>
                  <button style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: "#e0e7ff",
                                   color: "#4338ca", border: "none", borderRadius: 5, cursor: "pointer" }}>
                    Stats
                  </button>
                </div>
                <div onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.title); }}>
                  <button disabled={deletingId === r.id} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#cbd5e1", padding: 4, borderRadius: 6, fontSize: 14, lineHeight: 1,
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                    title="Delete report"
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
