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
  primary: "#4f8ef7", primaryLt: "#e8f0fe",
  success: "#43a047", successLt: "#e8f5e9",
  danger:  "#e53935", dangerLt:  "#fef2f2",
  warning: "#f9a825", warningLt: "#fffde7",
  purple:  "#7c4dff", purpleLt:  "#ede7f6",
  text:    "#1a1a2e", textSub:   "#555",
  border:  "#e0e4ea", bg:        "#f7f8fa", surface: "#fff",
};

const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  color: "#64748b", bg: "#f1f5f9" },
  IN_PROGRESS:  { label: "In Progress",  color: C.primary, bg: C.primaryLt },
  SUBMITTED:    { label: "Submitted",    color: C.warning, bg: C.warningLt },
  UNDER_REVIEW: { label: "Under Review", color: C.purple,  bg: C.purpleLt  },
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
      const headers = c.headers || [];
      const rows    = c.rows    || [];
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
                  {row.map((cell, ci) => <td key={ci} style={cellSt}>{cell}</td>)}
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
    case "DIVIDER":
      return <hr style={{ border: "none", borderTop: "1px solid #9ca3af", margin: "10px 0 12px" }} />;
    case "FILE":
      return (
        <div style={{ fontFamily: DOC_FONT, fontSize: 10, margin: "6px 0 10px", padding: "5px 10px",
          background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 2,
          display: "flex", alignItems: "center", gap: 5 }}>
          <span>📎</span>
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

  const [section,  setSection]  = useState(null);
  const [blocks,   setBlocks]   = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [busy,     setBusy]     = useState(false);

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
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── header ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "14px 32px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button style={{ background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: C.primary, flexShrink: 0 }} onClick={onBack}>←</button>
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
            {pipeline?.current_step && (
              <span style={{ color: C.primary, fontWeight: 600 }}>
                Step: {pipeline.current_step.step_name}
              </span>
            )}
          </div>
        </div>
        {canReview && !showReview && (
          <button onClick={() => setShowReview(true)}
            style={{ padding: "9px 20px", background: C.success, color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13,
              fontWeight: 700, flexShrink: 0 }}>
            Review this Section
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
                isLast={i === (pipeline?.steps?.length || 1) - 1} />
            ))}
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
            ) : (
              blocks.map(b => <WordBlock key={b.id} block={b} />)
            )}

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
            <div style={{ background: "#f0f9f0", border: `1px solid ${C.success}44`,
              borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.success, marginBottom: 4 }}>
                You can review this section
              </div>
              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                Read the document, then click "Review this Section" to approve or send it back
                with comments.
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
                <span style={{ fontSize: 14 }}>💬</span>
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

          {/* recent approvals thread */}
          {history.filter(h => h.event === "APPROVED").length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                background: "#f0fdf4", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>✅</span>
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
