import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";
import ReviewSectionPage from "../shared/builder/ReviewSectionPage";

const C = {
  primary:   "#1d4ed8",
  primaryLt: "#dbeafe",
  text:      "#0f172a",
  textSub:   "#64748b",
  border:    "rgba(29,78,216,0.12)",
  bg:        "#f0f4ff",
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
  const { apiFetch }  = useApi();
  const [queue,       setQueue]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [reviewing,   setReviewing]   = useState(null); // section id

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

  /* open ReviewSectionPage for a section */
  if (reviewing) {
    return (
      <ReviewSectionPage
        sectionId={reviewing}
        onBack={() => { setReviewing(null); load(); }}
      />
    );
  }

  const filtered = queue.filter(q => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (search && !q.title?.toLowerCase().includes(search.toLowerCase()) &&
                  !q.report_title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pending      = queue.filter(q => q.status === "SUBMITTED").length;
  const underReview  = queue.filter(q => q.status === "UNDER_REVIEW").length;

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", background: C.bg, minHeight: "100vh" }}>

      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Review Queue
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>
          Section Review Queue
        </h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>
          Sections awaiting your review — click a row to begin
        </p>
      </div>

      {/* summary chips */}
      {!loading && queue.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total",        value: queue.length, bg: "#f1f5f9", color: "#475569" },
            { label: "Needs review", value: pending,      bg: pending ? "#fef3c7" : "#f1f5f9", color: pending ? "#92400e" : "#94a3b8" },
            { label: "Under review", value: underReview,  bg: "#dbeafe", color: "#1e40af" },
          ].map(c => (
            <div key={c.label} style={{ padding: "8px 16px", borderRadius: 10, background: c.bg, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</span>
              <span style={{ fontSize: 12, color: c.color, fontWeight: 500 }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by section or report name…"
          style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, fontFamily: "inherit" }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            cursor: "pointer", fontFamily: "inherit", appearance: "none" }}>
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
        </select>
      </div>

      {/* loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.textSub, fontSize: 14 }}>
          Loading review queue…
        </div>
      )}

      {/* error */}
      {!loading && err && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, fontSize: 14 }}>
          {err}
        </div>
      )}

      {/* empty */}
      {!loading && !err && queue.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 14, padding: "60px 40px", textAlign: "center",
          border: `0.5px solid ${C.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>All clear</div>
          <p style={{ fontSize: 13, color: C.textSub, maxWidth: 340, margin: "0 auto" }}>
            No sections are currently awaiting your review.
          </p>
        </div>
      )}

      {/* table */}
      {!loading && !err && filtered.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
          boxShadow: "0 1px 6px rgba(29,78,216,0.06)", overflow: "hidden" }}>
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
                    onClick={() => setReviewing(q.id)}
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
                      {q.current_step_name
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
        </div>
      )}

      {/* no filter results */}
      {!loading && !err && queue.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: C.textSub, fontSize: 13 }}>
          No sections match the current filters.
        </div>
      )}
    </div>
  );
}
