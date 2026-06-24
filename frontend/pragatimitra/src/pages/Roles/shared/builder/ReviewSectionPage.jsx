import { useState, useEffect, useCallback } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

/* ── colours ─────────────────────────────────────────────────────────────── */
const C = {
  primary: "#2563eb", primaryLt: "#dbeafe",
  success: "#16a34a", successLt: "#dcfce7",
  danger:  "#dc2626", dangerLt:  "#fee2e2",
  warning: "#d97706", warningLt: "#fef3c7",
  purple:  "#6366f1", purpleLt:  "#e0e7ff",
  text:    "#0f172a", textSub:   "#64748b",
  border:  "#e2e8f0", bg:        "#f8fafc", surface: "#fff",
};

const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  color: "#64748b", bg: "#f1f5f9" },
  IN_PROGRESS:  { label: "In Progress",  color: C.primary, bg: C.primaryLt },
  SUBMITTED:    { label: "Submitted",    color: C.warning, bg: C.warningLt },
  UNDER_REVIEW: { label: "Under Review", color: "#1e40af", bg: "#dbeafe"   },
  APPROVED:     { label: "Approved",     color: C.success, bg: C.successLt },
  SENT_BACK:    { label: "Sent Back",    color: C.danger,  bg: C.dangerLt  },
  LOCKED:       { label: "Locked",       color: "#555",    bg: "#e0e0e0"   },
};

/* ── Word-doc font — matches SectionEditorPage exactly ───────────────────── */
const DOC_FONT = "'Calibri', 'Segoe UI', Arial, sans-serif";

/* ── WordBlock — exact copy of SectionEditorPage's WordBlock ─────────────── */
function WordBlock({ block }) {
  const c = block.content || {};
  switch (block.block_type) {
    case "PARAGRAPH":
      return (
        <div
          style={{ fontFamily: DOC_FONT, fontSize: 11, lineHeight: 1.8,
                   color: "#111827", marginBottom: 10, wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{
            __html: c.html || c.text || "<em style='color:#9ca3af'>Empty paragraph</em>",
          }}
        />
      );
    case "HEADING": {
      const lvlStyle = {
        1: { fontSize: 18, color: "#1F3864", borderBottom: "1.5px solid #1F3864", paddingBottom: 3, marginBottom: 10, marginTop: 18 },
        2: { fontSize: 14, color: "#2E4A7A", marginBottom: 6, marginTop: 14 },
        3: { fontSize: 12, color: "#374151", marginBottom: 5, marginTop: 10 },
      };
      return (
        <div style={{ fontFamily: DOC_FONT, fontWeight: 700, ...lvlStyle[c.level || 2] }}>
          {c.text || "Heading"}
        </div>
      );
    }
    case "IMAGE": {
      const w = c.widthPct ?? 100;
      const alignMap = { left: "flex-start", center: "center", right: "flex-end" };
      return (
        <div style={{ display: "flex", justifyContent: alignMap[c.align] || "center", margin: "8px 0 12px" }}>
          <div style={{ width: `${w}%` }}>
            {c.url ? (
              <img src={c.url} alt={c.alt || c.caption || ""}
                style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                onError={e => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db",
                borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: 10 }}>[Image]</div>
            )}
            {c.caption && (
              <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280",
                textAlign: "center", marginTop: 3, fontStyle: "italic" }}>{c.caption}</div>
            )}
          </div>
        </div>
      );
    }
    case "IMAGE_GRID": {
      const cols = c.cols || [];
      return (
        <div style={{ display: "grid",
          gridTemplateColumns: `repeat(${cols.length || 2}, 1fr)`, gap: 8, margin: "8px 0 12px" }}>
          {cols.map((col, i) => (
            <div key={i}>
              {col.url ? (
                <img src={col.url} alt={col.caption || `Image ${i + 1}`}
                  style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                  onError={e => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db",
                  borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#9ca3af", fontSize: 9 }}>[Image {i + 1}]</div>
              )}
              {col.caption && (
                <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280",
                  textAlign: "center", marginTop: 2, fontStyle: "italic" }}>{col.caption}</div>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "TABLE": {
      const isFormImport = c.source === "form_import";
      const headers = isFormImport ? (c.columns || []).map(col => col.label || col.key) : (c.headers || []);
      const rows    = c.rows || [];
      const cellSt  = {
        border: "1px solid #9ca3af", padding: "4px 7px",
        fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top",
      };
      return (
        <div style={{ margin: "8px 0 12px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            {headers.length > 0 && (
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{ ...cellSt, background: "#D0CECE", fontWeight: 700, textAlign: "left" }}>
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  {isFormImport
                    ? (c.columns || []).map((col, ci) => (
                        <td key={ci} style={cellSt}>{row?.[col.key] != null ? String(row[col.key]) : ""}</td>
                      ))
                    : (Array.isArray(row) ? row : []).map((cell, ci) => <td key={ci} style={cellSt}>{cell}</td>)
                  }
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "LIST": {
      const Tag = c.ordered ? "ol" : "ul";
      return (
        <Tag style={{ fontFamily: DOC_FONT, fontSize: 11, color: "#111827",
          paddingLeft: 20, lineHeight: 1.75, margin: "4px 0 10px" }}>
          {(c.items || []).map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}
        </Tag>
      );
    }
    case "KPI": {
      const opts      = c.compile_options || {};
      const showChart = opts.show_chart      !== false;
      const showTable = opts.show_data_table !== false;
      const data      = c.data || {};
      const columns   = data.columns || [];
      const series    = data.series  || [];
      const totals    = data.totals  || [];
      const cellSt = { border: "1px solid #9ca3af", padding: "4px 7px", fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top" };
      return (
        <div style={{ margin: "8px 0 12px" }}>
          {showChart && c.svg_data && (
            <div style={{ overflow: "hidden", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: c.svg_data }} />
          )}
          {showTable && columns.length > 0 && (
            <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ ...cellSt, background: "#D0CECE", fontWeight: 700, textAlign: "left" }}>Series</th>
                  {columns.map((col, i) => (
                    <th key={i} style={{ ...cellSt, background: "#D0CECE", fontWeight: 700, textAlign: "right" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s, si) => (
                  <tr key={si} style={{ background: si % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellSt, fontWeight: 600 }}>{s.display_name || s.name}</td>
                    {(s.values || []).map((v, vi) => (
                      <td key={vi} style={{ ...cellSt, textAlign: "right" }}>{v}</td>
                    ))}
                  </tr>
                ))}
                {totals.length > 0 && (
                  <tr>
                    <td style={{ ...cellSt, fontWeight: 700 }}>Total</td>
                    {totals.map((v, vi) => (
                      <td key={vi} style={{ ...cellSt, textAlign: "right", fontWeight: 700 }}>{v}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {opts.caption && (
            <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>
              {opts.caption}
            </div>
          )}
        </div>
      );
    }
    case "DIVIDER":
      return <hr style={{ border: "none", borderTop: "1px solid #9ca3af", margin: "10px 0 12px" }} />;
    case "FILE":
      return (
        <div style={{ fontFamily: DOC_FONT, fontSize: 10, margin: "6px 0 10px", padding: "5px 10px",
          background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 2,
          display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <a href={c.url || "#"} target="_blank" rel="noreferrer"
            style={{ color: "#1d4ed8", textDecoration: "underline" }}>
            {c.name || c.url || "Attachment"}
          </a>
        </div>
      );
    default:
      return null;
  }
}

/* ── main page ───────────────────────────────────────────────────────────── */
export default function ReviewSectionPage({ sectionId, onBack }) {
  const { apiFetch } = useApi();
  const { user }     = useAuth();

  const [section,       setSection]       = useState(null);
  const [blocks,        setBlocks]        = useState([]);
  const [pipeline,      setPipeline]      = useState(null);
  const [history,       setHistory]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState(null);
  const [busy,          setBusy]          = useState(false);
  const [blockComments,       setBlockComments]       = useState({});
  const [resolvingId,         setResolvingId]         = useState(null);
  const [activeCommentBlock,  setActiveCommentBlock]  = useState(null);
  const [commentDraft,        setCommentDraft]        = useState({});
  const [postingComment,      setPostingComment]      = useState(false);

  /* review form */
  const [decision,    setDecision]    = useState("APPROVED");
  const [comment,     setComment]     = useState("");
  const [showReview,  setShowReview]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [secRes, blockRes, pipeRes, histRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/sections/${sectionId}`),
        apiJson(apiFetch, `/api/builder/blocks/section/${sectionId}`),
        apiJson(apiFetch, `/api/builder/approvals/section/${sectionId}/pipeline`),
        apiJson(apiFetch, `/api/builder/approvals/section/${sectionId}`),
      ]);
      setSection(secRes.data);
      setBlocks(blockRes.data || []);
      setPipeline(pipeRes.data);
      setHistory(histRes.data || []);
      try {
        const res  = await apiFetch(`/api/builder/comments/section/${sectionId}`);
        const json = await res.json();
        if (json.success) setBlockComments(json.blocks || {});
      } catch {}
    } catch {
      setToast({ type: "error", message: "Failed to load section" });
    } finally {
      setLoading(false);
    }
  }, [sectionId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async () => {
    if (!comment.trim() && decision === "SENT_BACK")
      return setToast({ type: "error", message: "Please provide a reason for sending back" });
    setBusy(true);
    try {
      await apiJson(apiFetch, `/api/builder/approvals/section/${sectionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      setToast({
        type: "success",
        message: decision === "APPROVED" ? "Section approved!" : "Section sent back for revision",
      });
      setShowReview(false);
      setComment("");
      await load();
    } catch (err) {
      setToast({ type: "error", message: err.message || "Review failed" });
    } finally {
      setBusy(false);
    }
  };

  const refreshBlockComments = useCallback(async () => {
    try {
      const res  = await apiFetch(`/api/builder/comments/section/${sectionId}`);
      const json = await res.json();
      if (json.success) setBlockComments(json.blocks || {});
    } catch {}
  }, [sectionId, apiFetch]);

  const handleResolveBlockComment = async (id) => {
    setResolvingId(id);
    try {
      const res  = await apiFetch(`/api/builder/comments/${id}/resolve`, { method: "PATCH" });
      const json = await res.json();
      if (json.success) {
        setBlockComments(prev => {
          const next = { ...prev };
          for (const bid of Object.keys(next)) {
            const updated = next[bid].comments.map(c => c.id === id ? { ...c, is_resolved: true } : c);
            next[bid] = { ...next[bid], comments: updated, unresolved: updated.filter(c => !c.is_resolved).length };
          }
          return next;
        });
      }
    } catch {} finally { setResolvingId(null); }
  };

  const postBlockComment = async (blockId) => {
    const text = (commentDraft[blockId] || "").trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const res  = await apiFetch(`/api/builder/comments/block/${blockId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (json.success) {
        setCommentDraft(prev => ({ ...prev, [blockId]: "" }));
        await refreshBlockComments();
      } else {
        setToast({ type: "error", message: json.message || "Failed to post comment" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to post comment" });
    } finally {
      setPostingComment(false);
    }
  };

  /* only show Review button if user is designated approver AND section is reviewable */
  const canReview   = pipeline?.can_review && ["SUBMITTED", "UNDER_REVIEW"].includes(section?.status);
  const statusMeta  = STATUS_META[section?.status] || STATUS_META.NOT_STARTED;

  /* sent-back comments for the thread panel */
  const sentBackItems = history.filter(h => h.event === "SENT_BACK" && h.reviewer_comment);

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.textSub }}>
      Loading section…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── header ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "14px 32px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "6px 12px", background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#475569",
          cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {section?.title}
          </div>
          <div style={{ fontSize: 12, color: C.textSub, display: "flex",
            alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
            <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700,
              color: statusMeta.color, background: statusMeta.bg }}>{statusMeta.label}</span>
            {pipeline?.workflow_name && (
              <span style={{ color: C.textSub }}>Workflow: {pipeline.workflow_name}</span>
            )}
            {pipeline?.needs_director_approval && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: "#fae8ff", color: "#7e22ce", border: "1px solid #e9d5ff" }}>
                Director's Office Final Approval
              </span>
            )}
            {!pipeline?.needs_director_approval && pipeline?.current_step && (
              <span style={{ color: C.primary, fontWeight: 600 }}>
                Step: {pipeline.current_step.step_name}
              </span>
            )}
          </div>
        </div>
        {canReview && !showReview && (
          <button onClick={() => setShowReview(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", background: C.success, color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13,
              fontWeight: 700, flexShrink: 0, boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Review Section
          </button>
        )}
      </header>

      {/* ── body grid ── */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px",
        display: "grid", gridTemplateColumns: "220px 1fr 300px",
        gap: 20, alignItems: "start" }}>

        {/* ── COL 1: Pipeline + History ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Pipeline */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>
              Approval Pipeline
            </div>
            {(!pipeline?.steps || pipeline.steps.length === 0) && (
              <div style={{ fontSize: 11, color: "#bbb", textAlign: "center", padding: "12px 0" }}>
                No workflow configured
              </div>
            )}
            {(pipeline?.steps || []).map((step, i) => (
              <PipelineStep key={step.id || i} step={step} index={i}
                isLast={i === (pipeline?.steps?.length || 1) - 1 && !pipeline?.needs_director_approval && section?.status !== "APPROVED"} />
            ))}
            {/* Director's Office final approval step — always shown at end */}
            {(pipeline?.steps?.length > 0 || pipeline?.needs_director_approval) && (
              <DirectorStep
                active={!!pipeline?.needs_director_approval}
                done={section?.status === "APPROVED"} />
            )}
          </div>

          {/* Approval History */}
          {history.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                History
              </div>
              {history.map((h, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10,
                  borderBottom: i < history.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 700,
                    color: h.event === "APPROVED" ? C.success
                         : h.event === "SENT_BACK" ? C.danger : C.textSub }}>
                    {h.event === "SENT_BACK" ? "Sent Back" : h.event === "APPROVED" ? "Approved" : h.event}
                  </div>
                  {h.reviewer_name && (
                    <div style={{ fontSize: 10, color: C.textSub }}>by {h.reviewer_name}</div>
                  )}
                  {h.workflow_step_name && (
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>{h.workflow_step_name}</div>
                  )}
                  <div style={{ fontSize: 9, color: "#bbb", marginTop: 2 }}>
                    {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section metadata */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Section Info
            </div>
            <MetaRow k="Status" v={statusMeta.label} vColor={statusMeta.color} />
            {section?.submission_deadline && (
              <MetaRow k="Due" v={new Date(section.submission_deadline).toLocaleDateString()} />
            )}
            {pipeline?.current_step && (
              <MetaRow k="Step" v={pipeline.current_step.step_name} />
            )}
          </div>
        </div>

        {/* ── COL 2: Word-doc preview (identical to editor) ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Document Preview
          </div>

          {/* A4 paper */}
          <div style={{
            background: "#fff",
            boxShadow: "0 3px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
            borderRadius: 3,
            padding: "48px 64px 64px",
            minHeight: 600,
          }}>
            {/* running header */}
            <div style={{ borderBottom: "0.5px solid #d1d5db", paddingBottom: 6,
              marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
                {pipeline?.workflow_name || ""}
              </span>
              <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
                {section?.title}
              </span>
            </div>

            {/* section title */}
            <div style={{ fontFamily: DOC_FONT, fontSize: 18, fontWeight: 700,
              color: "#1F3864", borderBottom: "1.5px solid #1F3864",
              paddingBottom: 6, marginBottom: 18, lineHeight: 1.3 }}>
              {section?.title}
            </div>

            {section?.description && (
              <div style={{ fontFamily: DOC_FONT, fontSize: 10, color: "#6b7280",
                fontStyle: "italic", marginBottom: 16, lineHeight: 1.6 }}>
                {section.description}
              </div>
            )}

            {/* blocks */}
            {blocks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 0",
                color: "#bbb", fontSize: 12, fontFamily: DOC_FONT, fontStyle: "italic" }}>
                No content has been added to this section yet.
              </div>
            ) : blocks.map(b => {
              const bc         = blockComments[b.id];
              const unresCnt   = bc?.unresolved || 0;
              const allThreads = bc?.comments   || [];
              const isOpen     = activeCommentBlock === b.id;
              return (
                <div key={b.id}>
                  <WordBlock block={b} />
                  {/* comment toggle bar */}
                  <div
                    onClick={() => setActiveCommentBlock(isOpen ? null : b.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      marginTop: 2, marginBottom: 10, cursor: "pointer",
                      padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                      background: unresCnt > 0 ? "#fef3c7" : isOpen ? "#eef2ff" : "#f8fafc",
                      border: `1px solid ${unresCnt > 0 ? "#fcd34d" : isOpen ? "#c7d2fe" : "#e2e8f0"}`,
                      color: unresCnt > 0 ? "#92400e" : isOpen ? "#4338ca" : "#94a3b8",
                      transition: "all 0.15s",
                    }}
                  >
                    <span>💬</span>
                    <span>
                      {unresCnt > 0
                        ? `${unresCnt} unresolved`
                        : allThreads.length > 0
                        ? `${allThreads.length} comment${allThreads.length !== 1 ? "s" : ""}`
                        : "Add comment"}
                    </span>
                  </div>

                  {/* inline comment panel */}
                  {isOpen && (
                    <div style={{
                      background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "12px 14px", marginBottom: 14,
                    }}>
                      {/* existing threads */}
                      {allThreads.map(thread => (
                        <div key={thread.id} style={{
                          display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10,
                          opacity: thread.is_resolved ? 0.55 : 1,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                            background: thread.is_resolved ? "#f0fdf4" : "#dbeafe",
                            color: thread.is_resolved ? "#16a34a" : "#1d4ed8",
                            fontSize: 9, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {(thread.author_name || "?")[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 1 }}>
                              {thread.author_name || "User"}
                              {thread.is_resolved && (
                                <span style={{ fontSize: 10, fontWeight: 400, color: "#16a34a", marginLeft: 6 }}>✓ Resolved</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5, wordBreak: "break-word" }}>
                              {thread.body}
                            </div>
                            {thread.replies?.length > 0 && (
                              <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                                {thread.replies.map(reply => (
                                  <div key={reply.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                    <div style={{
                                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                                      background: "#f1f5f9", color: "#64748b",
                                      fontSize: 8, fontWeight: 700,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {(reply.author_name || "?")[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", marginBottom: 1 }}>
                                        {reply.author_name || "User"}
                                      </div>
                                      <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.5, wordBreak: "break-word" }}>
                                        {reply.body}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {!thread.is_resolved && (
                            <button
                              onClick={e => { e.stopPropagation(); handleResolveBlockComment(thread.id); }}
                              disabled={resolvingId === thread.id}
                              style={{
                                padding: "3px 9px", background: "#f0fdf4",
                                border: "1px solid #bbf7d0", borderRadius: 5,
                                cursor: resolvingId === thread.id ? "not-allowed" : "pointer",
                                fontSize: 10, color: "#15803d", flexShrink: 0,
                                fontFamily: "inherit", opacity: resolvingId === thread.id ? 0.6 : 1,
                              }}
                            >{resolvingId === thread.id ? "…" : "✓ Resolve"}</button>
                          )}
                        </div>
                      ))}

                      {/* new comment input */}
                      <div style={{ display: "flex", gap: 8, marginTop: allThreads.length ? 8 : 0 }}>
                        <textarea
                          value={commentDraft[b.id] || ""}
                          onChange={e => setCommentDraft(prev => ({ ...prev, [b.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postBlockComment(b.id); }}
                          placeholder="Add a review comment on this block… (Ctrl+Enter to send)"
                          style={{
                            flex: 1, padding: "7px 10px", fontSize: 11, lineHeight: 1.5,
                            border: "1px solid #e2e8f0", borderRadius: 6,
                            fontFamily: "inherit", resize: "none", height: 56, outline: "none",
                            background: "#fff",
                          }}
                        />
                        <button
                          onClick={() => postBlockComment(b.id)}
                          disabled={postingComment || !(commentDraft[b.id] || "").trim()}
                          style={{
                            padding: "7px 14px", background: C.primary, color: "#fff",
                            border: "none", borderRadius: 6,
                            cursor: postingComment || !(commentDraft[b.id] || "").trim() ? "not-allowed" : "pointer",
                            fontSize: 11, fontWeight: 700, alignSelf: "flex-end",
                            fontFamily: "inherit",
                            opacity: !(commentDraft[b.id] || "").trim() ? 0.45 : 1,
                          }}
                        >{postingComment ? "…" : "Comment"}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* running footer */}
            <div style={{ borderTop: "0.5px solid #d1d5db", marginTop: 40, paddingTop: 6,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
                PragatiMitra — Confidential
              </span>
              <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
                {section?.title}
              </span>
            </div>
          </div>
        </div>

        {/* ── COL 3: Review panel + Reviewer comments thread ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Review action panel */}
          {showReview && canReview && (
            <div style={{ background: C.surface, border: `2px solid ${C.primary}`,
              borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
                Submit Review
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Decision</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[["APPROVED", "Approve", "✓", C.success],
                    ["SENT_BACK", "Send Back", "↩", C.danger]].map(([v, l, icon, col]) => (
                    <button key={v} onClick={() => setDecision(v)}
                      style={{ flex: 1, padding: "10px 8px", borderRadius: 7,
                        cursor: "pointer", fontSize: 12, fontWeight: 700,
                        border: `2px solid ${decision === v ? col : C.border}`,
                        background: decision === v
                          ? (v === "APPROVED" ? C.successLt : C.dangerLt) : "transparent",
                        color: decision === v ? col : C.textSub }}>
                      {icon} {l}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>
                  Comment {decision === "SENT_BACK" ? "*" : "(optional)"}
                </label>
                <textarea
                  style={{ ...inp, height: 100, resize: "vertical" }}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={decision === "SENT_BACK"
                    ? "Reason for sending back…" : "Optional feedback…"} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ flex: 1, padding: "9px",
                    background: decision === "APPROVED" ? C.success : C.danger,
                    color: "#fff", border: "none", borderRadius: 7,
                    cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                  disabled={busy} onClick={handleReview}>
                  {busy ? "Submitting…" : decision === "APPROVED" ? "✓ Approve" : "↩ Send Back"}
                </button>
                <button
                  style={{ padding: "9px 14px", background: "none",
                    border: `1px solid ${C.border}`, borderRadius: 7,
                    cursor: "pointer", fontSize: 13, color: C.textSub }}
                  onClick={() => setShowReview(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* not yet reviewing — prompt */}
          {canReview && !showReview && (
            <div style={{ background: pipeline?.needs_director_approval ? "#faf5ff" : "#f0f9f0",
              border: `1px solid ${pipeline?.needs_director_approval ? "#7e22ce44" : C.success + "44"}`,
              borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700,
                color: pipeline?.needs_director_approval ? "#7e22ce" : C.success, marginBottom: 4 }}>
                {pipeline?.needs_director_approval
                  ? "Director's Office Final Approval"
                  : "You can review this section"}
              </div>
              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                {pipeline?.needs_director_approval
                  ? "All workflow steps have been completed. This section is awaiting your final approval as Director's Office."
                  : `Read the document, then click "Review Section" to approve or send it back with comments.`}
              </div>
            </div>
          )}

          {/* not a reviewer */}
          {!canReview && section && (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                {section.status === "APPROVED"
                  ? "This section has been fully approved."
                  : section.status === "LOCKED"
                  ? "This section is locked."
                  : "You are viewing this section in read-only mode."}
              </div>
            </div>
          )}

          {/* ── Reviewer comments thread ── */}
          {sentBackItems.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                background: "#fff9f0", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                    Reviewer Comments
                  </div>
                  <div style={{ fontSize: 10, color: "#a16207" }}>
                    {sentBackItems.length} revision request{sentBackItems.length > 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              <div style={{ padding: "0 16px" }}>
                {sentBackItems.map((h, i) => (
                  <div key={i} style={{
                    padding: "14px 0",
                    borderBottom: i < sentBackItems.length - 1 ? `1px solid ${C.border}` : "none",
                  }}>
                    {/* reviewer avatar row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%",
                        background: "#fee2e2", color: C.danger, fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0 }}>
                        {h.reviewer_name?.[0]?.toUpperCase() || "R"}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                          {h.reviewer_name || "Reviewer"}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>
                          {h.workflow_step_name && `${h.workflow_step_name} · `}
                          {new Date(h.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 12,
                        fontSize: 9, fontWeight: 700, background: C.dangerLt, color: C.danger }}>
                        Sent Back
                      </span>
                    </div>
                    {/* comment bubble */}
                    <div style={{ marginLeft: 36, padding: "10px 14px",
                      background: "#fef2f2", border: `1px solid ${C.danger}33`,
                      borderRadius: "0 8px 8px 8px", fontSize: 12, color: C.text,
                      lineHeight: 1.6, fontStyle: "italic" }}>
                      "{h.reviewer_comment}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Unresolved Block Comments ── */}
          {Object.values(blockComments).some(bg => bg.unresolved > 0) && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                background: "#fffbeb", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                    Unresolved Block Comments
                  </div>
                  <div style={{ fontSize: 10, color: "#a16207" }}>
                    {Object.values(blockComments).reduce((a, bg) => a + bg.unresolved, 0)} unresolved across {Object.values(blockComments).filter(bg => bg.unresolved > 0).length} block{Object.values(blockComments).filter(bg => bg.unresolved > 0).length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div style={{ padding: "4px 0" }}>
                {blocks.map((block, blockIdx) => {
                  const bg = blockComments[block.id];
                  if (!bg || bg.unresolved === 0) return null;
                  const unresThreads = bg.comments.filter(c => !c.is_resolved);
                  return (
                    <div key={block.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 16px" }}>
                      <div style={{
                        fontSize: 9, fontWeight: 800, color: "#818cf8",
                        background: "#eef2ff", padding: "2px 7px", borderRadius: 4,
                        display: "inline-block", textTransform: "uppercase",
                        letterSpacing: 0.5, marginBottom: 8,
                      }}>
                        Block {blockIdx + 1} · {block.block_type}
                      </div>
                      {unresThreads.map(thread => (
                        <div key={thread.id} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                              background: "#dbeafe", color: "#1d4ed8",
                              fontSize: 9, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {(thread.author_name || "?")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                                {thread.author_name || "User"}
                              </div>
                              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, wordBreak: "break-word" }}>
                                {thread.body}
                              </div>
                              {thread.replies?.length > 0 && (
                                <div style={{ fontSize: 9, color: C.textSub, marginTop: 3 }}>
                                  {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleResolveBlockComment(thread.id)}
                              disabled={resolvingId === thread.id}
                              style={{
                                padding: "3px 9px", background: "#f0fdf4",
                                border: "1px solid #bbf7d0", borderRadius: 5,
                                cursor: resolvingId === thread.id ? "not-allowed" : "pointer",
                                fontSize: 10, color: "#15803d", flexShrink: 0,
                                fontFamily: "inherit", opacity: resolvingId === thread.id ? 0.6 : 1,
                              }}
                            >{resolvingId === thread.id ? "…" : "✓"}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* recent approvals thread */}
          {history.filter(h => h.event === "APPROVED").length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                background: "#f0fdf4", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.success }}>Approvals</div>
              </div>
              <div style={{ padding: "0 16px" }}>
                {history.filter(h => h.event === "APPROVED").map((h, i, arr) => (
                  <div key={i} style={{ padding: "12px 0",
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%",
                        background: C.successLt, color: C.success, fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                          {h.reviewer_name || "Approved"}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>
                          {h.workflow_step_name && `${h.workflow_step_name} · `}
                          {new Date(h.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {h.reviewer_comment && (
                      <div style={{ marginLeft: 32, marginTop: 6, padding: "8px 12px",
                        background: C.successLt, borderRadius: "0 6px 6px 6px",
                        fontSize: 11, color: "#166534", fontStyle: "italic" }}>
                        "{h.reviewer_comment}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────── */
const lbl = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
};
const inp = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13,
  border: `1px solid ${C.border}`, borderRadius: 7, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};

function PipelineStep({ step, index, isLast }) {
  const stateColors = { COMPLETED: C.success, ACTIVE: C.primary, PENDING: "#ccc" };
  const col = stateColors[step.state] || "#ccc";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: col,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {step.state === "COMPLETED" ? "✓" : index + 1}
        </div>
        {!isLast && (
          <div style={{ width: 2, height: 28, background: col === "#ccc" ? C.border : col, opacity: 0.4 }} />
        )}
      </div>
      <div style={{ paddingTop: 4, paddingBottom: isLast ? 0 : 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: step.state === "PENDING" ? "#aaa" : C.text }}>
          {step.step_name}
        </div>
        {step.approver_role && (
          <div style={{ fontSize: 10, color: C.textSub }}>{step.approver_role}</div>
        )}
        {step.approver_name && (
          <div style={{ fontSize: 10, color: C.primary }}>{step.approver_name}</div>
        )}
        <div style={{ fontSize: 9, marginTop: 2, padding: "1px 6px", borderRadius: 4,
          display: "inline-block", background: col + "22", color: col }}>
          {step.state}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ k, v, vColor }) {
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 12, marginBottom: 6 }}>
      <span style={{ color: "#888", width: 100, flexShrink: 0 }}>{k}</span>
      <span style={{ color: vColor || C.text, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

function DirectorStep({ active, done }) {
  const col = done ? C.success : active ? "#7e22ce" : "#ccc";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: col,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, flexShrink: 0, border: active ? "2px solid #7e22ce" : "none" }}>
          {done ? "✓" : "D"}
        </div>
      </div>
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: active || done ? C.text : "#aaa" }}>
          Director's Office
        </div>
        <div style={{ fontSize: 10, color: C.textSub }}>Final Approval</div>
        <div style={{ fontSize: 9, marginTop: 2, padding: "1px 6px", borderRadius: 4,
          display: "inline-block", background: col + "22", color: col }}>
          {done ? "COMPLETED" : active ? "ACTIVE" : "PENDING"}
        </div>
      </div>
    </div>
  );
}
