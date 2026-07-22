import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useApi } from "../../../hooks/useApi";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import ReviewSectionPage from "../shared/builder/ReviewSectionPage";
import { PageContainer, PageHeader, Toolbar, SearchInput, Select, Card, EmptyState, ErrorState } from "../../../ui";

const SLUG = "review-queue";

const C = {
  primary:   "#2563eb",
  primaryLt: "#dbeafe",
  text:      "#0f172a",
  textSub:   "#64748b",
  border:    "rgba(37,99,235,0.12)",
  bg:        "#f0f6ff",
  surface:   "#ffffff",
};

const STATUS_STYLE = {
  SUBMITTED:    { bg: "#fef3c7", color: "#92400e",  label: "Submitted" },
  UNDER_REVIEW: { bg: "#dbeafe", color: "#1e40af",  label: "Under Review" },
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiFetch }  = useApi();
  const { lang }      = useLanguage();
  const [queue,       setQueue]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("");

  const isReview = location.pathname.endsWith("/review");
  const listPath = `/${SLUG}`;
  const sectionId = isReview ? (location.state?.entity?.id ?? null) : null;

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res  = await apiFetch("/api/builder/sections/review-queue");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setQueue(json.data || []);
    } catch (ex) {
      setErr(ex.message || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  if (isReview) {
    if (!sectionId) return <Navigate to={listPath} replace />;
    return (
      <ReviewSectionPage
        sectionId={sectionId}
        onBack={() => navigate(listPath)}
      />
    );
  }

  const filtered = queue.filter(q => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (search && !q.title?.toLowerCase().includes(search.toLowerCase()) &&
                  !q.report_title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pending        = queue.filter(q => q.status === "SUBMITTED" && !q.needs_director_approval).length;
  const underReview    = queue.filter(q => q.status === "UNDER_REVIEW").length;
  const finalApproval  = queue.filter(q => q.needs_director_approval).length;

  return (
    <PageContainer>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Director's Office", lang), t("Review Queue", lang)]}
        title={t("Review Queue", lang)}
        description={t("Sections awaiting your review and approval decision.", lang)}
      />

      {/* summary chips */}
      {!loading && queue.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total",          value: queue.length,   bg: "#f1f5f9", color: "#475569" },
            { label: "Needs review",   value: pending,        bg: pending ? "#fef3c7" : "#f1f5f9", color: pending ? "#92400e" : "#94a3b8" },
            { label: "Under review",   value: underReview,    bg: "#dbeafe", color: "#1e40af" },
            { label: "Final approval", value: finalApproval,  bg: finalApproval ? "#fae8ff" : "#f1f5f9", color: finalApproval ? "#7e22ce" : "#94a3b8" },
          ].map(c => (
            <div key={c.label} style={{ padding: "8px 16px", borderRadius: 10, background: c.bg, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</span>
              <span style={{ fontSize: 12, color: c.color, fontWeight: 500 }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* filters — standardized toolbar */}
      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by section or report name…"
          style={{ flex: 1, width: "auto" }}
        />
        <Select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 170, height: 40 }}
        >
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
        </Select>
      </Toolbar>

      {/* loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.textSub, fontSize: 14 }}>
          Loading review queue…
        </div>
      )}

      {/* error */}
      {!loading && err && (
        <Card padding={0}>
          <ErrorState title="Couldn’t load review queue" description={err} />
        </Card>
      )}

      {/* empty */}
      {!loading && !err && queue.length === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            title="All clear"
            description="No sections are currently awaiting your review."
          />
        </Card>
      )}

      {/* table */}
      {!loading && !err && filtered.length > 0 && (
        <Card padding={0} style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Section", "Report", "Step", "Submitted", "Status", ""].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "12px 16px", textAlign: "left",
                    borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => {
                const st = STATUS_STYLE[q.status] || STATUS_STYLE.SUBMITTED;
                return (
                  <tr
                    key={q.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => navigate(`${listPath}/review`, { state: { entity: { id: q.id } } })}
                  >
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 13, fontWeight: 600, color: C.text }}>
                      {q.title}
                    </td>
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: C.textSub }}>
                      <div>{q.report_title}</div>
                      {q.academic_year && <div style={{ fontSize: 11, color: "#94a3b8" }}>{q.academic_year}</div>}
                    </td>
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: C.textSub }}>
                      {q.needs_director_approval
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
                            background: "#fae8ff", color: "#7e22ce", border: "1px solid #e9d5ff" }}>
                            Director Final Approval
                          </span>
                        : q.current_step_name
                          ? <span>{q.current_step_name} <span style={{ color: "#94a3b8" }}>#{q.current_step_order}</span></span>
                          : <span style={{ color: "#94a3b8" }}>No workflow</span>}
                    </td>
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: C.textSub }}>
                      <div>{timeAgo(q.submitted_at)}</div>
                      {q.submitted_by_name && <div style={{ fontSize: 11, color: "#94a3b8" }}>by {q.submitted_by_name}</div>}
                    </td>
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                        background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                      fontSize: 12, color: C.primary, fontWeight: 600, whiteSpace: "nowrap" }}>
                      Review →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* no filter results */}
      {!loading && !err && queue.length > 0 && filtered.length === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            title="No sections match the current filters."
          />
        </Card>
      )}
    </PageContainer>
  );
}
