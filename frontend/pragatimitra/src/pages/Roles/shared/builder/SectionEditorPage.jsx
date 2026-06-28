/**
 * SectionEditorPage.jsx
 * Two-panel layout: left = block editor, right = paginated Word-like preview.
 * Preview is hidden when section is under review / submitted.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Paperclip, Archive, TrendingUp, AlertTriangle } from "lucide-react";
import { useAuth } from "../../../../store/AuthContext";
import { useApi }  from "../../../../hooks/useApi";
import { BLOCK_ICONS, BlockEditor, DEFAULT_CONTENT } from "./BlockEditors";
import { generateSectionDocx, downloadBlob, printSectionAsPdf } from "./sectionToDocx";
import FormImportWizard from "./FormImportWizard";
import KpiImportWizard  from "./KpiImportWizard";

/* ═══════════════════════════════════════════════════════════════════════════
   BLOCK COMMENTS SIDEBAR — threaded inline comments per content block
═══════════════════════════════════════════════════════════════════════════ */
const AVATAR_COLORS = ["#2563eb","#0891b2","#16a34a","#d97706","#dc2626","#7c3aed","#db2777"];
function avatarColor(id) {
  const n = (id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)  return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function BlockCommentsSidebar({
  sectionId, blockId, blocks, blockCounts,
  currentUserId, apiFetch,
  onClose, showBackToPreview,
  onBlockSelect, onCountRefresh,
}) {
  const [threads,      setThreads]      = useState([]);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [posting,      setPosting]      = useState(false);
  const [replyTo,      setReplyTo]      = useState(null);
  const [replyInput,   setReplyInput]   = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [blocksOpen,   setBlocksOpen]   = useState(false);
  const inputRef     = useRef(null);
  const replyInputRef = useRef(null);
  const threadRef    = useRef(null);

  const load = useCallback(async () => {
    if (!blockId) return;
    setLoading(true);
    try {
      const res  = await apiFetch(`/api/builder/comments/block/${blockId}`);
      const json = await res.json();
      if (json.success) setThreads(json.data || []);
    } catch { setThreads([]); } finally { setLoading(false); }
  }, [blockId, apiFetch]);

  useEffect(() => { load(); setInput(""); setReplyTo(null); setReplyInput(""); }, [load]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [threads]);

  const postComment = async () => {
    const text = input.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const res  = await apiFetch(`/api/builder/comments/block/${blockId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (json.success) {
        setThreads(prev => [...prev, { ...json.data, replies: [] }]);
        setInput("");
        onCountRefresh?.();
      }
    } catch {} finally { setPosting(false); }
  };

  const postReply = async (parentId) => {
    const text = replyInput.trim();
    if (!text || postingReply) return;
    setPostingReply(true);
    try {
      const res  = await apiFetch(`/api/builder/comments/${parentId}/replies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (json.success) {
        setThreads(prev => prev.map(t =>
          t.id === parentId ? { ...t, replies: [...(t.replies || []), json.data] } : t
        ));
        setReplyInput(""); setReplyTo(null);
      }
    } catch {} finally { setPostingReply(false); }
  };

  const resolveComment = async (id) => {
    try {
      const res  = await apiFetch(`/api/builder/comments/${id}/resolve`, { method: "PATCH" });
      const json = await res.json();
      if (json.success) {
        setThreads(prev => prev.map(t =>
          t.id === id ? { ...t, is_resolved: true, resolved_by_name: json.data.resolved_by_name } : t
        ));
        onCountRefresh?.();
      }
    } catch {}
  };

  const reopenComment = async (id) => {
    try {
      const res  = await apiFetch(`/api/builder/comments/${id}/reopen`, { method: "PATCH" });
      const json = await res.json();
      if (json.success) {
        setThreads(prev => prev.map(t =>
          t.id === id ? { ...t, is_resolved: false, resolved_by: null, resolved_by_name: null } : t
        ));
        onCountRefresh?.();
      }
    } catch {}
  };

  const currentBlock  = blocks.find(b => b.id === blockId);
  const blockLabel    = currentBlock ? `${BLOCK_ICONS[currentBlock.block_type] || ""} ${currentBlock.block_type}` : "Block";
  const unresolvedCnt = threads.filter(t => !t.is_resolved).length;
  const totalCnt      = threads.length;
  const totalUnresAcrossSection = Object.values(blockCounts).reduce((a, c) => a + (c.unresolved || 0), 0);

  const BC = {
    border: "#e2e8f0", surface: "#fff", bg: "#f8fafc",
    primary: "#2563eb", primaryLt: "#eff6ff",
    text: "#0f172a", textSub: "#64748b", muted: "#94a3b8",
    success: "#16a34a", successLt: "#f0fdf4",
  };

  if (!blockId) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        background: BC.surface, borderLeft: `1px solid ${BC.border}`,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        <div style={{ marginBottom: 6 }}><MessageSquare size={30} color="#cbd5e1" /></div>
        <div style={{ fontSize: 13, color: BC.textSub, textAlign: "center", padding: "0 20px", lineHeight: 1.6 }}>
          Click the comment icon on any block to view its thread
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: BC.surface, borderLeft: `1px solid ${BC.border}`,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`@keyframes bcDot{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      {/* ── Header ── */}
      <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${BC.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
            display: "inline-block", animation: "bcDot 2s ease-in-out infinite", flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: BC.text, flex: 1 }}>Block Comments</span>
          <button onClick={load} title="Refresh" style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: BC.muted, padding: "2px 4px", borderRadius: 4,
          }}>↻</button>
          {showBackToPreview ? (
            <button onClick={onClose} style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#f1f5f9", border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, color: "#475569",
              padding: "4px 9px", borderRadius: 6, fontFamily: "inherit",
            }}>← Preview</button>
          ) : (
            <button onClick={onClose} style={{
              background: "#f1f5f9", border: "none", cursor: "pointer",
              fontSize: 13, color: BC.textSub, padding: "4px 7px", borderRadius: 6,
            }}>✕</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, color: "#60a5fa", background: "#eff6ff",
            padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5,
          }}>{blockLabel}</span>
          {unresolvedCnt > 0 ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 7px", borderRadius: 10 }}>
              {unresolvedCnt} unresolved
            </span>
          ) : totalCnt > 0 ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: BC.success, background: BC.successLt, padding: "1px 7px", borderRadius: 10 }}>
              All resolved
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Block selector ── */}
      {blocks.length > 1 && (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${BC.border}` }}>
          <button onClick={() => setBlocksOpen(o => !o)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 7,
            padding: "7px 14px", background: "#fafbfc",
            border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 11, color: BC.textSub, fontWeight: 600, textAlign: "left",
          }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
              <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
            Switch block
            {totalUnresAcrossSection > 0 && (
              <span style={{ fontSize: 9, color: "#b45309", background: "#fef3c7", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>
                {totalUnresAcrossSection} unresolved
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 10, color: BC.muted }}>{blocksOpen ? "▲" : "▼"}</span>
          </button>
          {blocksOpen && (
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#fafbfc" }}>
              {blocks.map((b, i) => {
                const cnt   = blockCounts[b.id] || { total: 0, unresolved: 0 };
                const isCur = b.id === blockId;
                return (
                  <div key={b.id}
                    onClick={() => { onBlockSelect(b.id); setBlocksOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 14px", cursor: "pointer",
                      background: isCur ? "#eff6ff" : "transparent",
                      borderLeft: isCur ? "3px solid #2563eb" : "3px solid transparent",
                    }}
                    onMouseEnter={e => { if (!isCur) e.currentTarget.style.background = "#f4f6fa"; }}
                    onMouseLeave={e => { if (!isCur) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{
                      fontSize: 8, fontWeight: 800,
                      color: isCur ? "#2563eb" : "#94a3b8",
                      background: isCur ? "#eff6ff" : "#f1f5f9",
                      padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", flexShrink: 0,
                    }}>{BLOCK_ICONS[b.block_type]} {b.block_type}</span>
                    <span style={{ fontSize: 10, color: isCur ? "#312e81" : BC.textSub, flex: 1 }}>Block {i + 1}</span>
                    {cnt.unresolved > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 5px", borderRadius: 8 }}>{cnt.unresolved}</span>
                    )}
                    {cnt.total > 0 && !cnt.unresolved && (
                      <span style={{ fontSize: 9, color: BC.muted, background: "#f1f5f9", padding: "1px 5px", borderRadius: 8 }}>{cnt.total}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Thread list ── */}
      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px", minHeight: 0 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: BC.muted, fontSize: 12 }}>Loading…</div>
        )}
        {!loading && threads.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <div style={{ marginBottom: 10 }}><MessageSquare size={26} color="#cbd5e1" /></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: BC.text, marginBottom: 4 }}>No comments yet</div>
            <div style={{ fontSize: 11, color: BC.muted }}>Add the first comment on this block below.</div>
          </div>
        )}
        {!loading && threads.map(thread => (
          <BlockCommentThread
            key={thread.id}
            thread={thread}
            currentUserId={currentUserId}
            replyTo={replyTo}
            replyInput={replyInput}
            setReplyInput={setReplyInput}
            postingReply={postingReply}
            replyInputRef={replyInputRef}
            onReply={t => { setReplyTo(t); setReplyInput(""); setTimeout(() => replyInputRef.current?.focus(), 50); }}
            onCancelReply={() => setReplyTo(null)}
            onPostReply={postReply}
            onResolve={resolveComment}
            onReopen={reopenComment}
          />
        ))}
      </div>

      {/* ── New comment input ── */}
      <div style={{ padding: "9px 11px 12px", borderTop: `1px solid ${BC.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
            placeholder="Add a comment on this block…"
            rows={2}
            style={{
              flex: 1, resize: "none", border: "1.5px solid #e2e8f0", borderRadius: 10,
              padding: "7px 11px", fontSize: 12, fontFamily: "inherit",
              color: "#1e293b", outline: "none", lineHeight: 1.5, minHeight: 38, maxHeight: 100,
              transition: "border-color 0.15s", background: "#fff",
            }}
            onFocus={e => e.target.style.borderColor = "#60a5fa"}
            onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
          />
          <button onClick={postComment} disabled={!input.trim() || posting} style={{
            width: 34, height: 34, borderRadius: 9, border: "none",
            background: !input.trim() || posting ? "#bfdbfe" : "#2563eb",
            color: "#fff", cursor: !input.trim() || posting ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M13 7L1 1l2 6-2 6 12-6z" fill="white"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 9, color: BC.muted, marginTop: 4, paddingLeft: 2 }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

function BlockCommentThread({
  thread, currentUserId,
  replyTo, replyInput, setReplyInput, postingReply, replyInputRef,
  onReply, onCancelReply, onPostReply, onResolve, onReopen,
}) {
  const [repliesExpanded, setRepliesExpanded] = useState(true);
  const isReplying  = replyTo?.id === thread.id;
  const authorName  = thread.author_name || "User";
  const avColor     = avatarColor(thread.created_by);
  const ts          = thread.created_at ? timeAgo(thread.created_at) : "";

  const BC = {
    border: "#e2e8f0", text: "#0f172a", textSub: "#64748b", muted: "#94a3b8",
    success: "#16a34a", successLt: "#f0fdf4",
  };

  return (
    <div style={{
      marginBottom: 12,
      border: `1px solid ${thread.is_resolved ? "#e8edf3" : "#dde3ec"}`,
      borderRadius: 10, background: thread.is_resolved ? "#f9fafb" : "#fff",
      overflow: "hidden",
    }}>
      {thread.is_resolved && (
        <div style={{
          padding: "4px 12px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 10, color: BC.success }}>✓</span>
          <span style={{ fontSize: 10, color: BC.success, fontWeight: 600, flex: 1 }}>
            Resolved{thread.resolved_by_name ? ` by ${thread.resolved_by_name}` : ""}
          </span>
          <button onClick={() => onReopen(thread.id)} style={{
            background: "none", border: "1px solid #d1d5db", borderRadius: 4,
            cursor: "pointer", fontSize: 9, color: "#6b7280",
            padding: "1px 7px", fontFamily: "inherit",
          }}>Reopen</button>
        </div>
      )}

      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: avColor, color: "#fff", fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{initials(authorName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: BC.text }}>{authorName}</span>
              <span style={{ fontSize: 10, color: BC.muted }}>{ts}</span>
            </div>
            <div style={{
              fontSize: 12, color: thread.is_resolved ? BC.muted : BC.text,
              lineHeight: 1.6, wordBreak: "break-word",
              fontStyle: thread.is_resolved ? "italic" : "normal",
            }}>{thread.body}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 7, paddingLeft: 36, alignItems: "center" }}>
          <button onClick={() => onReply(thread)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: BC.textSub, padding: "1px 4px", fontFamily: "inherit",
          }}>↩ Reply</button>
          {thread.replies?.length > 0 && (
            <button onClick={() => setRepliesExpanded(o => !o)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 10, color: BC.textSub, padding: "1px 4px", fontFamily: "inherit",
            }}>
              {repliesExpanded ? "▲" : "▼"} {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
          {!thread.is_resolved && (
            <button onClick={() => onResolve(thread.id)} style={{
              marginLeft: "auto", background: "none",
              border: "1px solid #d1fae5", borderRadius: 4,
              cursor: "pointer", fontSize: 9, color: BC.success,
              padding: "1px 8px", fontFamily: "inherit",
            }}>✓ Resolve</button>
          )}
        </div>
      </div>

      {repliesExpanded && thread.replies?.length > 0 && (
        <div style={{ borderTop: `1px solid ${BC.border}`, background: "#fafbfc", padding: "8px 12px 8px 40px" }}>
          {thread.replies.map(reply => {
            const rName  = reply.author_name || "User";
            const rColor = avatarColor(reply.created_by);
            const rTs    = reply.created_at ? timeAgo(reply.created_at) : "";
            return (
              <div key={reply.id} style={{ display: "flex", gap: 7, marginBottom: 8, alignItems: "flex-start" }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: rColor, color: "#fff", fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{initials(rName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: BC.text }}>{rName}</span>
                    <span style={{ fontSize: 9, color: BC.muted }}>{rTs}</span>
                  </div>
                  <div style={{ fontSize: 11, color: BC.text, lineHeight: 1.5, wordBreak: "break-word" }}>{reply.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isReplying && (
        <div style={{ borderTop: `1px solid ${BC.border}`, padding: "8px 12px", background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              ref={replyInputRef}
              value={replyInput}
              onChange={e => setReplyInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onPostReply(thread.id); }
                if (e.key === "Escape") onCancelReply();
              }}
              placeholder={`Reply to ${authorName}…`}
              rows={2}
              style={{
                flex: 1, resize: "none", border: "1.5px solid #bfdbfe", borderRadius: 8,
                padding: "6px 10px", fontSize: 11, fontFamily: "inherit",
                color: "#1e293b", outline: "none", lineHeight: 1.5, background: "#fff",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => onPostReply(thread.id)} disabled={!replyInput.trim() || postingReply} style={{
                width: 30, height: 30, borderRadius: 7, border: "none",
                background: !replyInput.trim() || postingReply ? "#bfdbfe" : "#2563eb",
                color: "#fff", cursor: !replyInput.trim() || postingReply ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <path d="M13 7L1 1l2 6-2 6 12-6z" fill="white"/>
                </svg>
              </button>
              <button onClick={onCancelReply} style={{
                width: 30, height: 30, borderRadius: 7,
                border: "1px solid #e2e8f0", background: "#fff",
                cursor: "pointer", color: BC.textSub, fontSize: 11,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── status config ────────────────────────────────────────────────────────── */
const STATUS_STYLE = {
  NOT_STARTED:  { bg: "#f1f5f9", color: "#64748b",  label: "Not Started" },
  IN_PROGRESS:  { bg: "#dbeafe", color: "#1d4ed8",  label: "In Progress" },
  SUBMITTED:    { bg: "#fef3c7", color: "#d97706",  label: "Submitted" },
  UNDER_REVIEW: { bg: "#ede9fe", color: "#6d28d9",  label: "Under Review" },
  APPROVED:     { bg: "#dcfce7", color: "#15803d",  label: "Approved" },
  SENT_BACK:    { bg: "#fee2e2", color: "#b91c1c",  label: "Sent Back" },
  LOCKED:       { bg: "#e2e8f0", color: "#475569",  label: "Locked" },
};

function StatusBadge({ status, tiny }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.NOT_STARTED;
  return (
    <span style={{
      padding: tiny ? "1px 7px" : "3px 11px",
      borderRadius: 20, fontSize: tiny ? 9 : 11,
      fontWeight: 700, textTransform: "uppercase",
      letterSpacing: 0.5, background: s.bg, color: s.color,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

const ROLE_BADGE = {
  OWNER:       { bg: "#ede9fe", color: "#6d28d9" },
  CONTRIBUTOR: { bg: "#dbeafe", color: "#1d4ed8" },
  REVIEWER:    { bg: "#dcfce7", color: "#15803d" },
};

const arrowBtn = {
  background: "none", border: "none", cursor: "pointer",
  color: "#94a3b8", fontSize: 13, padding: "2px 5px", borderRadius: 4,
};

/* ═══════════════════════════════════════════════════════════════════════════
   WORD-LIKE DOCUMENT PREVIEW (paginated A4)
═══════════════════════════════════════════════════════════════════════════ */
const DOC_FONT = "'Calibri', 'Segoe UI', Arial, sans-serif";

/* A4 page at 96 dpi: 794 × 1123 px  |  margins: 72 px each side */
const A4_W  = 794;
const A4_H  = 1123;
const MARG  = 72;
const CON_W = A4_W  - MARG * 2;   // 650 px content width
const CON_H = A4_H  - MARG * 2;   // 979 px content height (page body)
const TITLE_H = 110;               // approximate height taken by title block on page 1

/* ── render one block in Word style ── */
function WordBlock({ block, lang = "en", measureIdx = null }) {
  const c    = block.content || {};
  const isHi = lang === "hi";
  // Block translations live in block.translations[language] (block_translations table),
  // mirroring only the translatable text fields of `content`. Fall back to English
  // whenever the active language has no translation row yet, or the field is empty.
  const t    = isHi ? (block.translations?.hi || {}) : null;
  const pick = (hiVal, enVal) => (isHi && hiVal) ? hiVal : enVal;

  switch (block.block_type) {

    case "PARAGRAPH":
      return (
        <div
          style={{ fontFamily: DOC_FONT, fontSize: 11, lineHeight: 1.8, color: "#111827", marginBottom: 10, wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: pick(t?.html, c.html || c.text) || "<em style='color:#9ca3af'>Empty paragraph</em>" }}
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
          {pick(t?.text, c.text) || "Heading"}
        </div>
      );
    }

    case "IMAGE": {
      const w = c.widthPct ?? 100;
      const alignMap = { left: "flex-start", center: "center", right: "flex-end" };
      const alt     = pick(t?.alt, c.alt);
      const caption = pick(t?.caption, c.caption);
      return (
        <div style={{ display: "flex", justifyContent: alignMap[c.align] || "center", margin: "8px 0 12px" }}>
          <div style={{ width: `${w}%` }}>
            {c.url ? (
              <img src={c.url} alt={alt || caption || ""} style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 10 }}>
                [Image]
              </div>
            )}
            {caption && (
              <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 3, fontStyle: "italic" }}>
                {caption}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "IMAGE_GRID": {
      const cols   = c.cols || [];
      const hiCols = t?.cols || [];
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length || 2}, 1fr)`, gap: 8, margin: "8px 0 12px" }}>
          {cols.map((col, i) => {
            const hiCol   = hiCols[i] || {};
            const alt     = pick(hiCol.alt, col.alt);
            const caption = pick(hiCol.caption, col.caption);
            return (
              <div key={i}>
                {col.url ? (
                  <img src={col.url} alt={alt || caption || `Image ${i + 1}`} style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 9 }}>[Image {i + 1}]</div>
                )}
                {caption && (
                  <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 2, fontStyle: "italic" }}>{caption}</div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "TABLE": {
      const isFormImport = c.source === "form_import";
      const dataLanguage = c.language === "hi" ? "hi" : "en";
      const useTranslation = isHi && lang !== dataLanguage && t;
      const fmtColumns = (isFormImport && useTranslation && t.columns) || c.columns || [];
      const fmtRows    = (isFormImport && useTranslation && t.rows)    || c.rows    || [];
      const headers = isFormImport
        ? fmtColumns.map(col => col.label || col.key)
        : (pick(t?.headers, c.headers) || []);
      const allRows = isFormImport ? fmtRows : (pick(t?.rows, c.rows) || []);

      // Virtual split block props — set by distribution algorithm for row-level page splitting
      const rowStart    = block._rowStart ?? 0;
      const rowEnd      = block._rowEnd   != null ? block._rowEnd : allRows.length;
      const displayRows = allRows.slice(rowStart, rowEnd);
      const isCont      = !!block._isContinuation;
      const noBottomMg  = !!block._noBottomMargin;

      const cell = { border: "1px solid #9ca3af", padding: "4px 7px", fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top" };
      const theadProps = measureIdx != null ? { "data-table-header": measureIdx } : {};
      return (
        <div style={{ margin: `8px 0 ${noBottomMg ? 2 : 12}px`, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            {headers.length > 0 && (
              <thead {...theadProps}>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} style={{ ...cell, background: "#D0CECE", fontWeight: 700, textAlign: "left" }}>
                      {h || `Col ${hi + 1}`}
                      {isCont && hi === 0 && (
                        <span style={{ fontSize: 8, color: "#9ca3af", fontStyle: "italic", marginLeft: 6 }}>(contd.)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {displayRows.map((row, ri) => {
                const absRi   = rowStart + ri;
                const rowProps = measureIdx != null ? { "data-table-row": `${measureIdx}-${ri}` } : {};
                return (
                  <tr key={ri} style={{ background: absRi % 2 === 0 ? "#fff" : "#f9fafb" }} {...rowProps}>
                    {isFormImport
                      ? fmtColumns.map((col, ci) => (
                          <td key={ci} style={cell}>{row?.[col.key] != null ? String(row[col.key]) : ""}</td>
                        ))
                      : (Array.isArray(row) ? row : []).map((cell_val, ci) => (
                          <td key={ci} style={cell}>{cell_val}</td>
                        ))
                    }
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case "LIST": {
      const items = pick(t?.items, c.items) || [];
      const Tag   = c.ordered ? "ol" : "ul";
      const fs    = c.fontSize  || 11;
      const fc    = c.fontColor || "#111827";
      return (
        <Tag style={{ fontFamily: DOC_FONT, fontSize: fs, color: fc, paddingLeft: 24, lineHeight: 1.8, margin: "4px 0 10px" }}>
          {items.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
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
      const cell = { border: "1px solid #9ca3af", padding: "4px 7px", fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top" };
      return (
        <div style={{ margin: "8px 0 12px" }}>
          {showChart && c.svg_data && (
            <div style={{ overflow: "hidden", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: c.svg_data }} />
          )}
          {showTable && columns.length > 0 && (
            <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, background: "#D0CECE", fontWeight: 700, textAlign: "left" }}>Series</th>
                  {columns.map((col, i) => (
                    <th key={i} style={{ ...cell, background: "#D0CECE", fontWeight: 700, textAlign: "right" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s, si) => (
                  <tr key={si} style={{ background: si % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cell, fontWeight: 600 }}>{s.display_name || s.name}</td>
                    {(s.values || []).map((v, vi) => (
                      <td key={vi} style={{ ...cell, textAlign: "right" }}>{v}</td>
                    ))}
                  </tr>
                ))}
                {totals.length > 0 && (
                  <tr>
                    <td style={{ ...cell, fontWeight: 700 }}>Total</td>
                    {totals.map((v, vi) => (
                      <td key={vi} style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{v}</td>
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
          {!c.svg_data && !showTable && (
            <div style={{ fontFamily: DOC_FONT, fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>[KPI chart not yet imported]</div>
          )}
        </div>
      );
    }

    case "DIVIDER":
      return <hr style={{ border: "none", borderTop: "1px solid #9ca3af", margin: "10px 0 12px" }} />;

    case "FILE":
      return (
        <div style={{ fontFamily: DOC_FONT, fontSize: 10, margin: "6px 0 10px", padding: "5px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 2, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ display: "inline-flex" }}><Paperclip size={13} /></span>
          <a href={c.url || "#"} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
            {c.name || c.url || "Attachment"}
          </a>
        </div>
      );

    default:
      return null;
  }
}

/* ── A4 Page shell ── */
function A4Page({ children, pageNum, totalPages, sectionTitle, reportTitle, scale, isFirst, reportMeta }) {
  return (
    <div style={{
      width: A4_W,
      minHeight: A4_H,
      background: "#fff",
      boxShadow: "0 3px 16px rgba(0,0,0,0.45)",
      position: "relative",
      boxSizing: "border-box",
      flexShrink: 0,
    }}>
      {/* Running page header */}
      <div style={{
        position: "absolute", top: 24, left: MARG, right: MARG,
        borderBottom: "0.5px solid #d1d5db", paddingBottom: 5,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {reportMeta?.report_type || ""}  {reportMeta?.academic_year || ""}
        </span>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {reportTitle || reportMeta?.title || ""}
        </span>
      </div>

      {/* Content area */}
      <div style={{ padding: `${MARG}px ${MARG}px ${MARG + 20}px` }}>

        {/* Document title block — first page only */}
        {isFirst && reportMeta && (
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #1F3864" }}>
            <div style={{ fontFamily: DOC_FONT, fontSize: 20, fontWeight: 700, color: "#1F3864", textAlign: "center", lineHeight: 1.3, marginBottom: 4 }}>
              {reportMeta.title}
            </div>
            {(reportMeta.report_type || reportMeta.academic_year) && (
              <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center" }}>
                {[reportMeta.report_type, reportMeta.academic_year].filter(Boolean).join("  ·  ")}
              </div>
            )}
          </div>
        )}

        {/* Section heading */}
        {sectionTitle && (
          <div style={{
            fontFamily: DOC_FONT, fontSize: 14, fontWeight: 700, color: "#1F3864",
            borderBottom: "1px solid #d1d5db", paddingBottom: 5, marginBottom: 14,
          }}>
            {sectionTitle}{!isFirst ? " (continued)" : ""}
          </div>
        )}

        {children}
      </div>

      {/* Running page footer */}
      <div style={{
        position: "absolute", bottom: 24, left: MARG, right: MARG,
        borderTop: "0.5px solid #d1d5db", paddingTop: 5,
        display: "flex", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>{sectionTitle}</span>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {pageNum}{totalPages > 1 ? ` / ${totalPages}` : ""}
        </span>
      </div>
    </div>
  );
}

/* ── Paginated Word Document Preview ── */
function WordDocumentPreview({ reportMeta, section, blocks, reportSections, currentSectionId, canvasRef, lang = "en" }) {
  const containerRef  = useRef(null);
  const measureRef    = useRef(null);

  const containerCallbackRef = useCallback((el) => {
    containerRef.current = el;
    if (canvasRef) canvasRef.current = el;
  }, [canvasRef]);
  const [scale, setScale]       = useState(0.6);
  const [pageGroups, setPageGroups] = useState([]);

  /* Compute scale based on container width */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 32; // 16px padding each side
      setScale(Math.min(available / A4_W, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Distribute blocks across pages with per-row table splitting */
  useEffect(() => {
    if (!measureRef.current || !blocks.length) {
      setPageGroups([blocks]);
      return;
    }

    requestAnimationFrame(() => {
      const root = measureRef.current;
      if (!root) return;
      const els = Array.from(root.querySelectorAll("[data-block-idx]"));
      if (!els.length) { setPageGroups([blocks]); return; }

      const SUBSEQ_INIT    = 40;  // subsequent pages: repeated section sub-heading
      const INTER_BLOCK    = 12;  // inter-block margin
      const TBL_HDR_REPEAT = 28;  // approx height of table header when repeated on continuation page

      const groups = [];
      let current  = [];
      let usedH    = TITLE_H; // page 1 starts with section heading

      function flushPage() {
        if (current.length) groups.push(current);
        current = [];
        usedH   = SUBSEQ_INIT;
      }

      for (const el of els) {
        const idx   = Number(el.getAttribute("data-block-idx"));
        const block = blocks[idx];

        if (block.block_type === "TABLE") {
          // Measure thead and each body row individually
          const theadEl  = root.querySelector(`thead[data-table-header="${idx}"]`);
          const theadH   = theadEl ? theadEl.offsetHeight : 28;
          const trEls    = Array.from(root.querySelectorAll(`tr[data-table-row^="${idx}-"]`));
          const rowHts   = trEls.map(tr => tr.offsetHeight || 20);

          // Fast path: entire table fits on current page
          const totalH = theadH + rowHts.reduce((s, h) => s + h, 0) + INTER_BLOCK;
          if (usedH + totalH <= CON_H) {
            current.push(block);
            usedH += totalH;
            continue;
          }

          // Slow path: split table row by row across pages
          let rowStart = 0;
          while (rowStart < rowHts.length) {
            const hdrH  = rowStart === 0 ? theadH : TBL_HDR_REPEAT;
            const avail = CON_H - usedH;

            // Flush current page if header + at least 1 row won't fit
            if (current.length > 0 && avail < hdrH + (rowHts[rowStart] || 20)) {
              flushPage();
              continue;  // retry with full page headroom
            }

            // Pack as many rows as fit in remaining space
            const avail2 = CON_H - usedH;
            let chunkH   = hdrH;
            let rowEnd   = rowStart;
            while (rowEnd < rowHts.length) {
              const rh = rowHts[rowEnd] || 20;
              if (chunkH + rh > avail2 && rowEnd > rowStart) break;
              chunkH += rh;
              rowEnd++;
            }
            if (rowEnd === rowStart) rowEnd = Math.min(rowStart + 1, rowHts.length); // force ≥1 row

            const isLastChunk = rowEnd >= rowHts.length;
            current.push({
              ...block,
              _rowStart:       rowStart,
              _rowEnd:         rowEnd,
              _isContinuation: rowStart > 0,
              _noBottomMargin: !isLastChunk,
            });
            usedH  += chunkH + (isLastChunk ? INTER_BLOCK : 0);
            rowStart = rowEnd;

            if (!isLastChunk) flushPage();
          }
        } else {
          // Non-table block: measure as a whole unit
          const h = el.offsetHeight + INTER_BLOCK;
          if (usedH + h > CON_H && current.length > 0) flushPage();
          current.push(block);
          usedH += h;
        }
      }

      if (current.length) groups.push(current);
      setPageGroups(groups.length ? groups : [blocks]);
    });
  }, [blocks, lang]);

  /* Status colours for nav strip */
  const navSectionList = reportSections;

  return (
    <div style={{ background: "#808080", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* ── Toolbar strip ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", background: "#595959", flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>
          Document Preview
        </span>
        <StatusBadge status={section?.status} tiny />
      </div>

      {/* ── Scrollable canvas ── */}
      <div ref={containerCallbackRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>

        {/* Hidden measurement div — renders blocks at real doc width */}
        <div
          ref={measureRef}
          style={{
            position: "absolute", visibility: "hidden", pointerEvents: "none",
            width: CON_W, top: 0, left: -9999,
          }}
          aria-hidden="true"
        >
          {blocks.map((b, i) => (
            <div key={b.id} data-block-idx={i}>
              <WordBlock block={b} lang={lang} measureIdx={i} />
            </div>
          ))}
        </div>

        {/* ── Pages ── */}
        {(pageGroups.length ? pageGroups : [blocks]).map((pageBlocks, pi) => (
          <div key={pi}>
            {pi > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", color: "#d1d5db", fontSize: 9 }}>
                <div style={{ flex: 1, height: 1, background: "#6b7280" }} />
                <span>Page {pi + 1}</span>
                <div style={{ flex: 1, height: 1, background: "#6b7280" }} />
              </div>
            )}

            {/* Scale wrapper */}
            <div style={{
              width: A4_W * scale,
              height: A4_H * scale,
              overflow: "hidden",
              marginBottom: 10,
            }}>
              <div style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: A4_W,
              }}>
                <A4Page
                  pageNum={pi + 1}
                  totalPages={pageGroups.length || 1}
                  sectionTitle={section?.title}
                  reportTitle={reportMeta?.title}
                  reportMeta={reportMeta}
                  isFirst={pi === 0}
                >
                  {pageBlocks.length === 0 ? (
                    <div style={{ fontFamily: DOC_FONT, fontSize: 11, color: "#9ca3af", fontStyle: "italic", textAlign: "center", paddingTop: 60 }}>
                      No content yet — add blocks using the editor on the left.
                    </div>
                  ) : (
                    pageBlocks.map((b) => <WordBlock key={b.id} block={b} lang={lang} />)
                  )}
                </A4Page>
              </div>
            </div>
          </div>
        ))}

        {/* ── Section navigation strip below pages ── */}
        {navSectionList.length > 0 && (
          <div style={{ borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
            {navSectionList.map((sec, idx) => {
              const isCurrent = sec.id === currentSectionId;
              return (
                <div key={sec.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px",
                  background: isCurrent ? "#374151" : "#4b5563",
                  borderBottom: idx < navSectionList.length - 1 ? "1px solid #6b7280" : "none",
                }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: isCurrent ? "#7c3aed" : "#6b7280",
                    color: "#fff", fontSize: 8, fontWeight: 700,
                  }}>{idx + 1}</span>
                  <span style={{
                    flex: 1, fontFamily: DOC_FONT, fontSize: 10,
                    color: isCurrent ? "#f3f4f6" : "#9ca3af",
                    fontWeight: isCurrent ? 700 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{sec.title}</span>
                  <StatusBadge status={sec.status} tiny />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Block type metadata — icons, labels, colours (shared by sidebar cards,
   the block detail header, and the add-block menu) ─────────────────────── */
function TypeGlyph({ type, size = 16 }) {
  const s = { width: size, height: size, display: "block" };
  switch (type) {
    case "PARAGRAPH":
      return <span style={{ ...s, fontWeight: 800, fontSize: size * 0.85, lineHeight: 1, textAlign: "center" }}>T</span>;
    case "HEADING":
      return <span style={{ ...s, fontWeight: 800, fontSize: size * 0.85, lineHeight: 1, textAlign: "center" }}>H</span>;
    case "TABLE":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M2.5 8h15M2.5 12.5h15M9 3.5v13"/>
        </svg>
      );
    case "IMAGE": case "IMAGE_GRID":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><circle cx="7" cy="8" r="1.4"/><path d="M3 14.5l4.5-4.5 3 3 2.5-3 4 4.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "LIST":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="3.5" cy="5" r="1"/><circle cx="3.5" cy="10" r="1"/><circle cx="3.5" cy="15" r="1"/>
          <path d="M7 5h10M7 10h10M7 15h10"/>
        </svg>
      );
    case "FILE":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3.5l2.5 2.5v9a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5v-11A1.5 1.5 0 015 2.5h9z"/>
          <path d="M7.5 9.5h5M7.5 12.5h5"/>
        </svg>
      );
    case "KPI":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 16.5h14"/><rect x="5" y="10" width="2.6" height="6.5" rx="0.5" fill="currentColor" stroke="none"/>
          <rect x="9.7" y="6" width="2.6" height="10.5" rx="0.5" fill="currentColor" stroke="none"/>
          <rect x="14.4" y="3" width="2.6" height="13.5" rx="0.5" fill="currentColor" stroke="none"/>
        </svg>
      );
    case "DIVIDER":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 10h14"/></svg>;
    default:
      return <span style={{ ...s, fontWeight: 800, fontSize: size * 0.7 }}>?</span>;
  }
}

const BLOCK_TYPE_META = {
  PARAGRAPH:  { label: "Rich Text Block", menuLabel: "Rich Text", hint: "Formatted text — font, size, color, alignment, lists, links",        color: "#1d4ed8", bg: "#eff6ff" },
  HEADING:    { label: "Heading",         menuLabel: "Heading",   hint: "Section heading (H1–H3)",                                            color: "#6d28d9", bg: "#f5f3ff" },
  TABLE:      { label: "Table",           menuLabel: "Table",     hint: "A grid of cells, or imported data from a form",                       color: "#0e7490", bg: "#ecfeff" },
  IMAGE:      { label: "Image",           menuLabel: "Image",     hint: "A single image with caption",                                        color: "#15803d", bg: "#f0fdf4" },
  IMAGE_GRID: { label: "Image Grid",      menuLabel: "Image Grid", hint: "Up to 4 images side by side",                                        color: "#15803d", bg: "#f0fdf4" },
  LIST:       { label: "List",            menuLabel: "List",      hint: "Bulleted or numbered list",                                          color: "#b45309", bg: "#fffbeb" },
  FILE:       { label: "File Attachment", menuLabel: "File",      hint: "Link to a downloadable file",                                        color: "#475569", bg: "#f1f5f9" },
  KPI:        { label: "KPI Chart",       menuLabel: "KPI Chart", hint: "A chart imported from the KPI module",                                color: "#be185d", bg: "#fdf2f8" },
  DIVIDER:    { label: "Divider",         menuLabel: "Divider",   hint: "A horizontal rule separating content",                                color: "#64748b", bg: "#f8fafc" },
};
function typeMeta(type) { return BLOCK_TYPE_META[type] || { label: type, menuLabel: type, hint: "", color: "#64748b", bg: "#f8fafc" }; }

function IconChip({ type, size = 30 }) {
  const m = typeMeta(type);
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: m.bg, color: m.color,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <TypeGlyph type={type} size={Math.round(size * 0.55)} />
    </div>
  );
}

const ADD_BLOCK_TYPES = ["PARAGRAPH", "HEADING", "TABLE", "IMAGE", "IMAGE_GRID", "LIST", "FILE", "KPI", "DIVIDER"];

/* ── Block-type picker list, shared by InlineAdder's dropdown and the big
   "+ Add Block" button below. ────────────────────────────────────────────── */
function BlockTypeMenu({ onAdd }) {
  return (
    <>
      <div style={{ width: "100%", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>
        Insert block
      </div>
      {ADD_BLOCK_TYPES.map((type) => {
        const m = typeMeta(type);
        return (
          <button
            key={type}
            onMouseDown={(e) => { e.preventDefault(); onAdd(type); }}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",
              borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff",
              fontSize: 12, color: "#374151", cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#faf5ff"; e.currentTarget.style.borderColor = "#c4b5fd"; e.currentTarget.style.color = "#7c3aed"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#374151"; }}
          >
            <IconChip type={type} size={18} />
            {m.menuLabel}
          </button>
        );
      })}
    </>
  );
}

/* ── Prominent, always-visible "+ Add Block" button — the primary, unmissable
   way to add content. Sits at the end of the block list (and doubles as the
   empty-state call-to-action) so first-time users don't have to discover the
   thin inline "+" separators to get started. ─────────────────────────────── */
function BigAddBlockButton({ onAdd, label = "+ Add Block" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "13px 16px", borderRadius: 10,
          border: `2px dashed ${open ? "#7c3aed" : "#c4b5fd"}`,
          background: open ? "#faf5ff" : "#fff", color: "#7c3aed",
          fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#faf5ff"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "#fff"; }}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,0.13)", padding: "10px 12px",
          display: "flex", flexWrap: "wrap", gap: 5, width: 308, zIndex: 100,
        }}>
          <BlockTypeMenu onAdd={(type) => { onAdd(type); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

/* ── Inline block inserter — thin separator with an always-visible "+" that
   opens a dropdown of block types to insert at that position ───────────── */
function InlineAdder({ isOpen, onToggle, onAdd }) {
  const [hovered, setHovered] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onToggle(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onToggle]);

  const show = hovered || isOpen;

  return (
    <div
      style={{ position: "relative", height: 20, display: "flex", alignItems: "center", margin: "2px 0", zIndex: isOpen ? 30 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Line */}
      <div style={{ flex: 1, height: 1.5, borderRadius: 1, background: show ? "#c4b5fd" : "#f1f5f9", transition: "background 0.15s" }} />

      {/* + button — always present so the insert affordance is discoverable without hovering */}
      <button
        title="Insert block"
        aria-label="Insert block"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!isOpen); }}
        style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          width: show ? 24 : 18, height: show ? 24 : 18, borderRadius: "50%",
          border: `1.5px solid ${isOpen ? "#7c3aed" : show ? "#c4b5fd" : "#e2e8f0"}`,
          background: isOpen ? "#7c3aed" : show ? "#faf5ff" : "#fff",
          color: isOpen ? "#fff" : show ? "#7c3aed" : "#94a3b8",
          opacity: show ? 1 : 0.6,
          fontSize: show ? 16 : 12, fontWeight: 300, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: isOpen ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
          transition: "all 0.15s",
        }}
      >
        +
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div ref={dropdownRef} style={{
          position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,0.13)", padding: "10px 12px",
          display: "flex", flexWrap: "wrap", gap: 5, width: 308, zIndex: 100,
        }}>
          <BlockTypeMenu onAdd={(type) => { onAdd(type); onToggle(false); }} />
        </div>
      )}
    </div>
  );
}

/* ── Shared neutral "tool" button — consistent ghost styling for secondary
   top-bar actions (Export, History, Preview, Comments), so colour is reserved
   for the one primary call-to-action per row. ───────────────────────────── */
function ToolBtn({ onClick, active, title, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
        border: `1.5px solid ${active ? "#60a5fa" : "#e2e8f0"}`,
        borderRadius: 8, flexShrink: 0,
        background: active ? "#eff6ff" : "#fff",
        fontSize: 12, fontWeight: 600,
        color: disabled ? "#cbd5e1" : active ? "#1d4ed8" : "#64748b",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s", fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!active && !disabled) { e.currentTarget.style.borderColor = "#bfdbfe"; e.currentTarget.style.color = "#2563eb"; }}}
      onMouseLeave={e => { if (!active && !disabled) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}}
    >
      {children}
    </button>
  );
}

/* ── "Export ▾" dropdown — merges Convert to Word / Convert to PDF into one
   tool-bar button instead of two competing full-width buttons. ──────────── */
function ExportMenu({ onWord, onPdf, exporting, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} disabled={disabled} title="Export this section">
        {exporting ? "Exporting…" : "Export"} <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </ToolBtn>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0,0,0,0.13)", padding: 6, zIndex: 100, width: 190,
        }}>
          <button
            onMouseDown={(e) => { e.preventDefault(); onWord(); setOpen(false); }}
            style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12.5, color: "#1e293b", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#047857" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M10 3v10m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Convert to Word
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); onPdf(); setOpen(false); }}
            style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12.5, color: "#1e293b", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#1d4ed8" strokeWidth="2"><path d="M7 7H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7h6" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 13v-2m0 4h.01" strokeLinecap="round"/></svg>
            Convert to PDF
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Collapsible block outline rail — icon strip by default, expands to show
   labels on hover. Click to scroll a block into view in the main column. ── */
function BlockOutlineRail({ blocks, onSelect, activeBlockId }) {
  const [expanded, setExpanded] = useState(false);
  if (!blocks.length) return null;

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width: expanded ? 196 : 40, flexShrink: 0,
        borderRight: "1px solid #e2e8f0", background: "#fff",
        overflow: "hidden", transition: "width 0.16s ease",
      }}
    >
      <div style={{ padding: "8px 0", overflowY: "auto", height: "100%" }}>
        {blocks.map((block, idx) => {
          const m        = typeMeta(block.block_type);
          const isActive = block.id === activeBlockId;
          return (
            <button
              key={block.id}
              onClick={() => onSelect(block.id)}
              title={`${idx + 1}. ${m.label}`}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: expanded ? "7px 11px" : "7px 0", justifyContent: expanded ? "flex-start" : "center",
                border: "none", background: isActive ? "#eff6ff" : "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", whiteSpace: "nowrap",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <IconChip type={block.block_type} size={20} />
              {expanded && (
                <span style={{ fontSize: 11.5, color: "#475569", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {idx + 1}. {m.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION EDITOR PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function SectionEditorPage({ sectionId, reportTitle, onBack, kpiScope = "department" }) {
  const { user }     = useAuth();
  const { apiFetch } = useApi();

  const [section,          setSection]          = useState(null);
  const [blocks,           setBlocks]           = useState([]);
  const [myRole,           setMyRole]           = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [saveLabel,        setSaveLabel]        = useState("");
  const [submitting,       setSubmitting]       = useState(false);
  const [submitMsg,        setSubmitMsg]        = useState("");
  const [err,              setErr]              = useState("");
  const [reportMeta,       setReportMeta]       = useState(null);
  const [reportSections,   setReportSections]   = useState([]);
  const [reviewerComments, setReviewerComments] = useState([]);
  const [commentsOpen,     setCommentsOpen]     = useState(true);
  const [chatOpen,         setChatOpen]         = useState(false);
  const [exporting,        setExporting]        = useState(false);
  const [blockCounts,      setBlockCounts]      = useState({});
  const [selectedBlockId,  setSelectedBlockId]  = useState(null);
  const [activeInserter,   setActiveInserter]   = useState(null);

  // Section-wide content authoring language — switches whether the block editors
  // below read/write the primary content (English) or that block's row in
  // block_translations (e.g. language="hi"). Independent from the app's own
  // UI-chrome language (useLanguage()/i18n).
  const [contentLang, setContentLang] = useState("en");

  // Live preview is a slide-over drawer, opened on demand rather than a permanent column.
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [previewWidth, setPreviewWidth] = useState(720); // user-resizable via the drag handle
  const resizingPreviewRef = useRef(false);
  // Brief highlight applied to a block card when navigated to from the outline rail.
  const [highlightedBlockId, setHighlightedBlockId] = useState(null);

  /* ── Preview drawer resize (drag the left edge) ── */
  const startPreviewResize = useCallback((e) => {
    e.preventDefault();
    resizingPreviewRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!resizingPreviewRef.current) return;
      const maxW = Math.min(1200, window.innerWidth * 0.92);
      const next = Math.min(Math.max(window.innerWidth - e.clientX, 360), maxW);
      setPreviewWidth(next);
    }
    function onUp() {
      if (!resizingPreviewRef.current) return;
      resizingPreviewRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // table type choice modal + form import wizard
  const [tableTypeModal,   setTableTypeModal]   = useState({ open: false, afterIndex: undefined });
  const [formImportWizard, setFormImportWizard] = useState({ open: false, afterIndex: undefined, orderIndex: undefined });

  // kpi type choice modal + kpi import wizard
  const [kpiTypeModal,   setKpiTypeModal]   = useState({ open: false, afterIndex: undefined });
  const [kpiImportWizard, setKpiImportWizard] = useState({ open: false, afterIndex: undefined, orderIndex: undefined });

  // dirty tracking + save description modal
  const [dirtyBlocks,       setDirtyBlocks]       = useState(new Set());
  // Pending, unsaved translation edits: { [blockId]: { [language]: partialContent } } —
  // tracked separately from dirtyBlocks (primary content) but counted as "unsaved changes"
  // too, since editing/translating Hindi content must require an explicit Save like any
  // other edit, not silently autosave.
  const [dirtyTranslations, setDirtyTranslations] = useState({});
  const [saveDescModal,     setSaveDescModal]     = useState({ open: false, desc: "", error: "" });
  // Pre-save prompt: ask whether to auto-translate updated English content into Hindi
  // for blocks that already have a Hindi translation, before the save actually runs.
  const [translatePromptModal, setTranslatePromptModal] = useState({ open: false, blocks: [] });
  const [translatingBeforeSave, setTranslatingBeforeSave] = useState(false);
  const hasUnsavedChanges = dirtyBlocks.size > 0 || Object.keys(dirtyTranslations).length > 0;
  const dirtyBlockCount   = new Set([...dirtyBlocks, ...Object.keys(dirtyTranslations)]).size;

  // submit modal
  const [submitModal,        setSubmitModal]        = useState({ open: false, desc: "", error: "", validationErrors: [], unresolvedCount: 0 });
  const [submitUnsavedWarn,  setSubmitUnsavedWarn]  = useState(false);

  // 409 conflict modal
  const [conflictModal,   setConflictModal]   = useState({ open: false, latestVersion: null });

  // version history panel
  const [versionHistOpen, setVersionHistOpen] = useState(false);
  const [versions,        setVersions]        = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null); // { version, data }

  const editorScrollRef  = useRef(null);
  const previewCanvasRef = useRef(null);

  const syncScroll = useCallback(() => {
    const ed = editorScrollRef.current;
    const pv = previewCanvasRef.current;
    if (!ed || !pv) return;
    const edMax = ed.scrollHeight - ed.clientHeight;
    if (edMax <= 0) return;
    const pct = ed.scrollTop / edMax;
    pv.scrollTop = pct * (pv.scrollHeight - pv.clientHeight);
  }, []);

  /* ── Outline rail navigation: scroll a block into view and briefly highlight it ── */
  const scrollToBlock = useCallback((blockId) => {
    const el = editorScrollRef.current?.querySelector(`[data-block-id="${blockId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedBlockId(blockId);
    setTimeout(() => setHighlightedBlockId((cur) => (cur === blockId ? null : cur)), 1400);
  }, []);

  const loadBlockCounts = useCallback(async () => {
    if (!sectionId) return;
    try {
      const res  = await apiFetch(`/api/builder/comments/section/${sectionId}/counts`);
      const json = await res.json();
      if (json.success) setBlockCounts(json.counts || {});
    } catch {}
  }, [sectionId, apiFetch]);

  useEffect(() => { loadBlockCounts(); }, [loadBlockCounts]);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setErr("");

    Promise.all([
      apiFetch(`/api/builder/sections/${sectionId}`).then((r) => r.json()),
      apiFetch(`/api/builder/assignments/section/${sectionId}`).then((r) => r.json()),
    ]).then(async ([secData, assignData]) => {
      if (!secData.success) { setErr(secData.message || "Section not found"); return; }
      setSection(secData.data);
      setBlocks(secData.data.blocks || []);

      if (assignData.success) {
        const mine = (assignData.data?.users || []).find((a) => a.user_id === user?.id);
        setMyRole(mine?.role || null);
      }

      const reportId = secData.data.report_id;
      if (reportId) {
        try {
          const rRes  = await apiFetch(`/api/builder/reports/${reportId}`);
          const rJson = await rRes.json();
          if (rJson.success) {
            setReportMeta({
              title:         rJson.data.title,
              report_type:   rJson.data.report_type,
              academic_year: rJson.data.academic_year,
            });
            setReportSections(rJson.data.sections || []);
          }
        } catch {}
      }

      /* fetch reviewer comments (sent-back history) */
      try {
        const hRes  = await apiFetch(`/api/builder/approvals/section/${sectionId}`);
        const hJson = await hRes.json();
        if (hJson.success) {
          const sentBack = (hJson.data || []).filter(h => h.decision === "SENT_BACK" && h.reviewer_comment);
          setReviewerComments(sentBack);
          setCommentsOpen(sentBack.length > 0);
        }
      } catch {}
    }).catch(() => setErr("Failed to load section"))
      .finally(() => setLoading(false));
  }, [sectionId, user?.id]);

  /* ── permissions ── */
  const roleNames  = new Set((user?.roles || []).map((r) => r.name || r));
  const isAdmin    = roleNames.has("super_admin") || roleNames.has("institute_admin");
  const canEdit    = isAdmin || (myRole && ["OWNER", "CONTRIBUTOR"].includes(myRole));
  const statusLock = !["NOT_STARTED", "IN_PROGRESS", "SENT_BACK"].includes(section?.status);
  const readOnly   = !canEdit || statusLock;
  const canSubmit  = canEdit && ["NOT_STARTED", "IN_PROGRESS", "SENT_BACK"].includes(section?.status);

  /* Hide preview when the section is in a review/submitted/approved state */
  const hidePreview = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(section?.status);

  /* ── load version history ── */
  const loadVersions = useCallback(async () => {
    if (!sectionId) return;
    setLoadingVersions(true);
    try {
      const res  = await apiFetch(`/api/builder/versions/section/${sectionId}`);
      const json = await res.json();
      if (json.success) setVersions(json.data || []);
    } catch {} finally { setLoadingVersions(false); }
  }, [sectionId, apiFetch]);

  useEffect(() => { if (versionHistOpen) loadVersions(); }, [versionHistOpen, loadVersions]);

  const loadSnapshot = async (versionNum) => {
    try {
      const res  = await apiFetch(`/api/builder/versions/section/${sectionId}/${versionNum}`);
      const json = await res.json();
      if (json.success) setViewingSnapshot({ version: versionNum, data: json.data });
    } catch {}
  };

  /* ── toggle a block's required flag — saves immediately, no dirty-tracking needed ── */
  async function toggleRequired(blockId, current) {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, is_required: !current } : b));
    try {
      await apiFetch(`/api/builder/blocks/${blockId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_required: !current }),
      });
    } catch {
      setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, is_required: current } : b));
    }
  }

  /* ── block change — mark dirty, no auto-save ── */
  function handleBlockChange(blockId, newContent) {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, content: newContent } : b));
    setDirtyBlocks((prev) => new Set([...prev, blockId]));
    setSaveLabel("Unsaved changes");
  }

  /* ── block translation change — queued like a primary-content edit; only
     persisted to block_translations when the user clicks "Save Changes". ── */
  function saveBlockTranslation(blockId, language, partialContent) {
    // Local-only update — does NOT call the API. Editing/translating Hindi content is a
    // change like any other; it's queued here and only persisted when the user clicks
    // "Save Changes", same as primary-content edits.
    setBlocks((prev) => prev.map((b) => b.id === blockId
      ? { ...b, translations: { ...b.translations, [language]: { ...(b.translations?.[language] || {}), ...partialContent } } }
      : b
    ));
    setDirtyTranslations((prev) => ({
      ...prev,
      [blockId]: {
        ...(prev[blockId] || {}),
        [language]: { ...(prev[blockId]?.[language] || {}), ...partialContent },
      },
    }));
    setSaveLabel("Unsaved changes");
  }

  /* ── Extract the English translatable text out of a block, in the shape the
     /translate endpoint and onTranslated handlers in BlockEditors.jsx expect.
     Returns null for block types with nothing to translate (DIVIDER, FILE, KPI,
     or a form-import TABLE — those already auto-fetch their own translation). ── */
  function extractTranslatableFields(block) {
    const c = block.content || {};
    switch (block.block_type) {
      case "PARAGRAPH": {
        const raw = c.html || c.text || "";
        return { kind: "html", html: raw };
      }
      case "HEADING":
        return { kind: "text", text: c.text || "" };
      case "LIST":
        return { kind: "items", items: c.items || [] };
      case "IMAGE":
        return { kind: "image", caption: c.caption || "", alt: c.alt || "" };
      case "IMAGE_GRID":
        return { kind: "image_grid", cols: (c.cols || []).map((col) => ({ caption: col.caption || "", alt: col.alt || "" })) };
      case "TABLE":
        if (c.source === "form_import") return null;
        return { kind: "table", headers: c.headers || [], rows: c.rows || [] };
      default:
        return null;
    }
  }

  /* ── Call the translate endpoint for one block's English fields and return the
     partial block_translations content to merge (or null if nothing to translate). ── */
  async function autoTranslateBlock(block) {
    const extracted = extractTranslatableFields(block);
    if (!extracted) return null;
    const translateOne = async (text) => {
      const res  = await apiFetch("/api/report-integration/translate", { method: "POST", body: JSON.stringify({ text }) });
      const data = await res.json();
      return data?.data?.hi || "";
    };
    const translateHtml = async (html) => {
      const res  = await apiFetch("/api/report-integration/translate", { method: "POST", body: JSON.stringify({ html }) });
      const data = await res.json();
      return data?.data?.hi || "";
    };
    const translateMany = async (texts) => {
      const res  = await apiFetch("/api/report-integration/translate", { method: "POST", body: JSON.stringify({ texts }) });
      const data = await res.json();
      return data?.data?.translations || texts.map(() => "");
    };

    switch (extracted.kind) {
      case "html": {
        if (!extracted.html.trim()) return null;
        return { html: await translateHtml(extracted.html), _stale: false };
      }
      case "text": {
        if (!extracted.text.trim()) return null;
        return { text: await translateOne(extracted.text), _stale: false };
      }
      case "items": {
        if (!extracted.items.some(Boolean)) return null;
        return { items: await translateMany(extracted.items), _stale: false };
      }
      case "image": {
        if (!extracted.caption && !extracted.alt) return null;
        const [capHi, altHi] = await translateMany([extracted.caption, extracted.alt]);
        return { caption: capHi, alt: altHi, _stale: false };
      }
      case "image_grid": {
        const flat = extracted.cols.flatMap((col) => [col.caption, col.alt]);
        if (!flat.some(Boolean)) return null;
        const translated = await translateMany(flat);
        const cols = extracted.cols.map((_, i) => ({ caption: translated[i * 2], alt: translated[i * 2 + 1] }));
        return { cols, _stale: false };
      }
      case "table": {
        const flat = [...extracted.headers, ...extracted.rows.flat()];
        if (!flat.some(Boolean)) return null;
        const translated = await translateMany(flat);
        const headers   = translated.slice(0, extracted.headers.length);
        const cellsFlat = translated.slice(extracted.headers.length);
        const rows = [];
        let idx = 0;
        for (const r of extracted.rows) { rows.push(cellsFlat.slice(idx, idx + r.length)); idx += r.length; }
        return { headers, rows, _stale: false };
      }
      default:
        return null;
    }
  }

  /* ── Entry point for the "Save Changes" button: if any dirty (English-edited)
     block already has a Hindi translation, ask whether to auto-translate the
     updated content before saving. Otherwise skip straight to the description modal. ── */
  function openSaveFlow() {
    const dirtyList = [...dirtyBlocks]
      .map((id) => blocks.find((b) => b.id === id))
      .filter(Boolean);
    // Blocks that already have a Hindi translation — ask whether to re-translate
    const withHindi    = dirtyList.filter((b) =>
      b.translations?.hi && Object.keys(b.translations.hi).filter(k => k !== "_stale").length > 0
      && extractTranslatableFields(b)
    );
    // Blocks with NO Hindi translation yet — ask whether to create one
    const withoutHindi = dirtyList.filter((b) =>
      (!b.translations?.hi || Object.keys(b.translations.hi).filter(k => k !== "_stale").length === 0)
      && extractTranslatableFields(b)
    );
    const allNeedingPrompt = [...withHindi, ...withoutHindi];
    if (allNeedingPrompt.length > 0) {
      setTranslatePromptModal({ open: true, blocks: allNeedingPrompt, hasNew: withoutHindi.length > 0, hasExisting: withHindi.length > 0 });
    } else {
      setSaveDescModal({ open: true, desc: "", error: "" });
    }
  }

  /* ── User chose to auto-translate the updated English content before saving. ── */
  async function handleTranslateBeforeSave() {
    const targets = translatePromptModal.blocks;
    setTranslatePromptModal({ open: false, blocks: [] });
    setTranslatingBeforeSave(true);
    try {
      for (const block of targets) {
        const partial = await autoTranslateBlock(block).catch(() => null);
        if (partial) saveBlockTranslation(block.id, "hi", partial);
      }
    } finally {
      setTranslatingBeforeSave(false);
      setSaveDescModal({ open: true, desc: "", error: "" });
    }
  }

  /* ── User chose to skip auto-translation — mark those translations stale so the
     "Translate from English" affordance reappears even though the field isn't empty. ── */
  function handleSkipTranslateBeforeSave() {
    const targets = translatePromptModal.blocks;
    setTranslatePromptModal({ open: false, blocks: [] });
    for (const block of targets) saveBlockTranslation(block.id, "hi", { _stale: true });
    setSaveDescModal({ open: true, desc: "", error: "" });
  }

  /* ── save all dirty blocks (+ pending translations) with description ── */
  async function executeSave(description) {
    if ((dirtyBlocks.size === 0 && Object.keys(dirtyTranslations).length === 0) || saving) return;
    setSaving(true);
    setSaveLabel("Saving…");
    let currentLock = section?.version_lock ?? 0;
    let conflictOccurred = false;

    try {
      for (const blockId of dirtyBlocks) {
        const block = blocks.find(b => b.id === blockId);
        if (!block) continue;
        const res  = await apiFetch(`/api/builder/blocks/${blockId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content:      block.content,
            description,
            version_lock: currentLock,
          }),
        });
        const json = await res.json();
        if (res.status === 409) {
          conflictOccurred = true;
          setConflictModal({ open: true, latestVersion: json.latest_version_num });
          break;
        }
        if (!json.success) throw new Error(json.message);
        currentLock = json.version_lock ?? currentLock;
        if (json.success && section?.status === "NOT_STARTED") {
          setSection(s => ({ ...s, status: "IN_PROGRESS", version_lock: currentLock }));
        } else {
          setSection(s => ({ ...s, version_lock: currentLock }));
        }
      }
      if (!conflictOccurred) {
        // Persist any pending translation edits alongside the primary content.
        for (const [blockId, langs] of Object.entries(dirtyTranslations)) {
          for (const [language, partial] of Object.entries(langs)) {
            await apiFetch(`/api/builder/blocks/${blockId}/translations/${language}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: partial }),
            }).catch(() => {});
          }
        }
        setDirtyBlocks(new Set());
        setDirtyTranslations({});
        setSaveLabel("✓ Saved");
        setTimeout(() => setSaveLabel(""), 2000);
        loadBlockCounts();
      }
    } catch {
      setSaveLabel("⚠ Save failed");
    } finally {
      setSaving(false);
    }
  }

  function computeOrderIndex(afterIndex) {
    const insertAfter = afterIndex !== undefined ? afterIndex : blocks.length - 1;
    if (blocks.length === 0)           return 1;
    if (insertAfter < 0)               return (blocks[0].order_index || 1) - 1;
    if (insertAfter >= blocks.length - 1) return (blocks[blocks.length - 1].order_index || blocks.length) + 1;
    return ((blocks[insertAfter].order_index || insertAfter + 1) + (blocks[insertAfter + 1].order_index || insertAfter + 2)) / 2;
  }

  async function addBlock(type, afterIndex) {
    // afterIndex: index of the block to insert AFTER (-1 = before first, undefined = after last)
    const insertAfter = afterIndex !== undefined ? afterIndex : blocks.length - 1;
    const orderIndex  = computeOrderIndex(afterIndex);

    const res  = await apiFetch(`/api/builder/blocks/section/${sectionId}`, {
      method: "POST",
      body:   JSON.stringify({ block_type: type, content: DEFAULT_CONTENT[type] || {}, order_index: orderIndex }),
    });
    const json = await res.json();
    if (json.success) {
      setBlocks((prev) => {
        const next = [...prev];
        const at   = insertAfter < 0 ? 0 : Math.min(insertAfter + 1, prev.length);
        next.splice(at, 0, json.data);
        return next;
      });
      setActiveInserter(null);
      // Scroll to bottom if inserted at/near the end
      if (insertAfter >= blocks.length - 1) {
        setTimeout(() => {
          const ed = editorScrollRef.current;
          const pv = previewCanvasRef.current;
          if (ed) ed.scrollTop = ed.scrollHeight;
          if (pv) pv.scrollTop = pv.scrollHeight;
        }, 80);
      }
    }
  }

  function handleAddBlock(type, afterIndex) {
    if (type === "TABLE") {
      setTableTypeModal({ open: true, afterIndex });
      setActiveInserter(null);
    } else if (type === "KPI") {
      setKpiTypeModal({ open: true, afterIndex });
      setActiveInserter(null);
    } else {
      addBlock(type, afterIndex);
    }
  }

  function handleFormImported(blockData) {
    const afterIndex  = formImportWizard.afterIndex;
    const insertAfter = afterIndex !== undefined ? afterIndex : blocks.length - 1;
    setBlocks((prev) => {
      const next = [...prev];
      const at   = insertAfter < 0 ? 0 : Math.min(insertAfter + 1, prev.length);
      next.splice(at, 0, blockData);
      return next;
    });
    setFormImportWizard({ open: false, afterIndex: undefined, orderIndex: undefined });
  }

  function handleKpiImported(blockData) {
    const afterIndex  = kpiImportWizard.afterIndex;
    const insertAfter = afterIndex !== undefined ? afterIndex : blocks.length - 1;
    setBlocks((prev) => {
      const next = [...prev];
      const at   = insertAfter < 0 ? 0 : Math.min(insertAfter + 1, prev.length);
      next.splice(at, 0, blockData);
      return next;
    });
    setKpiImportWizard({ open: false, afterIndex: undefined, orderIndex: undefined });
  }

  function handleBlockRefetched(blockId, newContent, translations) {
    setBlocks((prev) => prev.map((b) => b.id === blockId
      ? { ...b, content: newContent, ...(translations && Object.keys(translations).length ? { translations } : {}) }
      : b
    ));
    // Does NOT add to dirtyBlocks — DB was already updated by the refetch/reimport endpoint
  }

  async function deleteBlock(blockId) {
    if (!window.confirm("Delete this block?")) return;
    await apiFetch(`/api/builder/blocks/${blockId}`, { method: "DELETE" });
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  async function moveBlock(idx, dir) {
    const next   = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    const items = next.map((b, i) => ({ id: b.id, order_index: i + 1 }));
    setBlocks(next.map((b, i) => ({ ...b, order_index: i + 1 })));
    apiFetch("/api/builder/blocks/reorder", { method: "POST", body: JSON.stringify({ items }) });
  }

  async function handleExportDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob     = await generateSectionDocx(section, blocks, reportMeta, reportSections);
      const filename = `${(section?.title || "section").replace(/[^a-z0-9\s]/gi, "").trim()}.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error("docx export failed:", err);
      alert("Export failed: " + (err?.message || "unknown error"));
    } finally {
      setExporting(false);
    }
  }

  function handleExportPdf() {
    printSectionAsPdf(section, blocks, reportMeta);
  }

  async function handleSubmitConfirm() {
    const desc = submitModal.desc.trim();
    if (desc.length < 5) {
      setSubmitModal(m => ({ ...m, error: "Description must be at least 5 characters" }));
      return;
    }
    setSubmitting(true);
    setSubmitModal(m => ({ ...m, error: "" }));
    try {
      const res  = await apiFetch(`/api/builder/approvals/section/${sectionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.empty_blocks) {
          setSubmitModal(m => ({
            ...m,
            error: json.message,
            validationErrors: json.empty_blocks,
          }));
          return;
        }
        throw new Error(json.message);
      }
      setSection((s) => ({ ...s, status: "SUBMITTED" }));
      setSubmitModal({ open: false, desc: "", error: "", validationErrors: [], unresolvedCount: 0 });
      setSubmitMsg("✓ Submitted for review successfully!");
    } catch (ex) {
      setSubmitModal(m => ({ ...m, error: ex.message || "Submit failed" }));
    } finally {
      setSubmitting(false);
    }
  }

  function openSubmitModal() {
    if (hasUnsavedChanges) {
      setSubmitUnsavedWarn(true);
      return;
    }
    const unresCnt = Object.values(blockCounts).reduce((a, c) => a + (c.unresolved || 0), 0);
    setSubmitModal({ open: true, desc: "", error: "", validationErrors: [], unresolvedCount: unresCnt });
  }

  /* ── loading / error ── */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#94a3b8", borderRadius: "50%", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
          <div>Loading section…</div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 32, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10 }}>{err}</div>
        <button onClick={onBack} style={{ marginTop: 16, padding: "8px 16px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
          ← Back
        </button>
      </div>
    );
  }

  /* ═══ layout ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#f1f5f9",
      minHeight: 0,
    }}>

      {/* ── top bar ── */}
      <div style={{
        background: "linear-gradient(135deg, #ffffff 0%, #f8faff 100%)",
        borderBottom: "1px solid #e2e8f0",
        padding: "8px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, rowGap: 8,
        flexShrink: 0, minHeight: 56,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        {/* Back button */}
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
          border: "1.5px solid #e2e8f0", borderRadius: 8,
          background: "#fff", fontSize: 12, fontWeight: 600,
          color: "#475569", cursor: "pointer", flexShrink: 0,
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#94a3b8"; e.currentTarget.style.color = "#1e293b"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          My Sections
        </button>

        <div style={{ width: 1, height: 22, background: "#e2e8f0", flexShrink: 0 }} />

        {/* Breadcrumb + title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.2 }}>
            {reportTitle}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", overflow: "hidden" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
              {section?.title}
            </span>
            <StatusBadge status={section?.status} />
            {myRole && (
              <span style={{
                padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", flexShrink: 0,
                background: (ROLE_BADGE[myRole] || ROLE_BADGE.CONTRIBUTOR).bg,
                color:      (ROLE_BADGE[myRole] || ROLE_BADGE.CONTRIBUTOR).color,
              }}>
                {myRole}
              </span>
            )}
          </div>
        </div>

        {/* ── Group: content language ── */}
        <div
          title="Author content in English or Hindi"
          style={{ display: "flex", border: "1.5px solid #e2e8f0", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}
        >
          {[["en", "EN"], ["hi", "HI"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setContentLang(val)}
              style={{
                padding: "5px 12px", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                background: contentLang === val ? "#7c3aed" : "#fff",
                color: contentLang === val ? "#fff" : "#64748b",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "#e2e8f0", flexShrink: 0 }} />

        {/* ── Group: document tools (Export, History, Preview) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* <ExportMenu onWord={handleExportDocx} onPdf={handleExportPdf} exporting={exporting} disabled={blocks.length === 0} /> */}
          <ToolBtn onClick={() => setVersionHistOpen(o => !o)} active={versionHistOpen} title="Version history">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>
            History
          </ToolBtn>
          {!hidePreview && (
            <ToolBtn onClick={() => setPreviewOpen(o => !o)} active={previewOpen} title="Live document preview">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/></svg>
              Preview
            </ToolBtn>
          )}
        </div>

        <div style={{ width: 1, height: 22, background: "#e2e8f0", flexShrink: 0 }} />

        {/* ── Group: collaboration ── */}
        <ToolBtn onClick={() => setChatOpen(o => !o)} active={chatOpen} title={chatOpen ? "Hide comments" : "Show comments"}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3v-3H4a2 2 0 01-2-2V5z"/></svg>
          Comments
        </ToolBtn>

        <div style={{ width: 1, height: 22, background: "#e2e8f0", flexShrink: 0 }} />

        {/* ── Group: save state + the single primary action ── */}
        {saveLabel && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 11, fontWeight: 500,
            color: saveLabel.startsWith("✓") ? "#15803d" : saveLabel.startsWith("⚠") ? "#b91c1c" : saveLabel === "Unsaved changes" ? "#b45309" : "#64748b",
          }}>
            {saveLabel}
          </div>
        )}

        {canEdit && !statusLock && hasUnsavedChanges && (
          <button
            onClick={openSaveFlow}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
              background: saving ? "#a3e635" : "linear-gradient(135deg,#16a34a,#15803d)",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
              fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              flexShrink: 0, boxShadow: saving ? "none" : "0 2px 8px rgba(22,163,74,0.3)",
              transition: "all 0.15s",
            }}
          >
            {saving ? "Saving…" : `Save Changes (${dirtyBlockCount})`}
          </button>
        )}

        {canEdit && (section?.status === "NOT_STARTED" || section?.status === "IN_PROGRESS") && (
          <button onClick={openSubmitModal} disabled={submitting} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
            background: submitting ? "#93c5fd" : "linear-gradient(135deg, #2563eb, #2563eb)",
            color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
            fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
            flexShrink: 0, boxShadow: submitting ? "none" : "0 2px 8px rgba(37,99,235,0.3)",
            transition: "all 0.15s",
          }}>
            Request Review →
          </button>
        )}

        {canEdit && section?.status === "SENT_BACK" && (
          <button onClick={openSubmitModal} disabled={submitting} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
            background: submitting ? "#fca5a5" : "linear-gradient(135deg,#dc2626,#b91c1c)",
            color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
            fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
            flexShrink: 0, boxShadow: submitting ? "none" : "0 2px 8px rgba(220,38,38,0.3)",
            transition: "all 0.15s",
          }}>
            Re-request Review →
          </button>
        )}

        {section?.status === "SUBMITTED" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "5px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#1d4ed8" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>Pending Review</span>
          </div>
        )}
        {section?.status === "UNDER_REVIEW" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "5px 12px", background: "#f5f3ff", borderRadius: 8, border: "1px solid #ddd6fe" }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#6d28d9" strokeWidth="2"><circle cx="10" cy="6" r="3"/><path d="M2 17c0-4 3.6-6 8-6s8 2 8 6"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6d28d9" }}>Under Review</span>
          </div>
        )}
        {section?.status === "APPROVED" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "5px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#15803d" strokeWidth="2.5"><polyline points="4 10 8 14 16 6"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d" }}>Approved</span>
          </div>
        )}
        {section?.status === "LOCKED" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "5px 12px", background: "#f1f5f9", borderRadius: 8, border: "1px solid #cbd5e1" }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#475569" strokeWidth="2"><rect x="4" y="9" width="12" height="10" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Locked</span>
          </div>
        )}
      </div>

      {/* submit message */}
      {submitMsg && (
        <div style={{
          padding: "9px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          background: submitMsg.startsWith("✓") ? "#f0fdf4" : "#fef2f2",
          borderBottom: `1px solid ${submitMsg.startsWith("✓") ? "#bbf7d0" : "#fecaca"}`,
          color: submitMsg.startsWith("✓") ? "#15803d" : "#b91c1c",
          fontSize: 12, fontWeight: 500,
        }}>
          {submitMsg}
          <button onClick={() => setSubmitMsg("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit", opacity: 0.6 }}>✕</button>
        </div>
      )}

      {/* Version history panel */}
      {versionHistOpen && (
        <div style={{
          flexShrink: 0, borderBottom: "1px solid #e2e8f0",
          background: "#fafbff", maxHeight: 300, overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid #e8edf3", gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#6d28d9" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", flex: 1 }}>Version History</span>
            {loadingVersions && <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading…</span>}
            <button onClick={() => loadVersions()} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#94a3b8" }}>↻</button>
            <button onClick={() => { setVersionHistOpen(false); setViewingSnapshot(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#94a3b8" }}>✕</button>
          </div>
          {versions.length === 0 && !loadingVersions && (
            <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#94a3b8" }}>No versions saved yet</div>
          )}
          {versions.map(v => {
            const eventColors = { MANUAL: { bg: "#eff6ff", color: "#1d4ed8" }, SUBMITTED: { bg: "#fef3c7", color: "#d97706" }, APPROVED: { bg: "#dcfce7", color: "#15803d" }, SENT_BACK: { bg: "#fee2e2", color: "#b91c1c" }, RESTORED: { bg: "#f5f3ff", color: "#6d28d9" } };
            const ec = eventColors[v.event] || { bg: "#f1f5f9", color: "#475569" };
            const isViewing = viewingSnapshot?.version === v.version_num;
            return (
              <div key={v.id} style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 20px",
                borderBottom: "1px solid #f1f5f9",
                background: isViewing ? "#eff6ff" : "transparent",
              }}>
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: ec.bg, color: ec.color, textTransform: "uppercase" }}>{v.event}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>
                    v{v.version_num}
                    {v.description && <span style={{ fontWeight: 400, color: "#475569", marginLeft: 8 }}>— {v.description}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    {v.created_by_name || "System"} · {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => isViewing ? setViewingSnapshot(null) : loadSnapshot(v.version_num)}
                    style={{
                      padding: "3px 10px", borderRadius: 6, border: `1px solid ${isViewing ? "#60a5fa" : "#d1d5db"}`,
                      background: isViewing ? "#eff6ff" : "#fff", color: isViewing ? "#2563eb" : "#374151",
                      fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    }}
                  >{isViewing ? "Close" : "View"}</button>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        const desc = window.prompt(`Restore description (optional):`, `Restored to version ${v.version_num}`);
                        if (desc === null) return;
                        try {
                          const res = await apiFetch(`/api/builder/versions/section/${sectionId}/${v.version_num}/restore`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ description: desc || `Restored to version ${v.version_num}` }),
                          });
                          const json = await res.json();
                          if (json.success) {
                            alert(`Restored to version ${v.version_num}. Page will reload.`);
                            window.location.reload();
                          } else {
                            alert(json.message || "Restore failed");
                          }
                        } catch { alert("Restore failed"); }
                      }}
                      style={{
                        padding: "3px 10px", borderRadius: 6, border: "1px solid #fecaca",
                        background: "#fff", color: "#b91c1c",
                        fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                      }}
                    >Restore</button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Snapshot viewer */}
          {viewingSnapshot && (
            <div style={{ padding: "14px 20px", background: "#fdf4ff", borderTop: "2px solid #c4b5fd" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", marginBottom: 10 }}>
                Snapshot — Version {viewingSnapshot.version} (read-only preview)
              </div>
              {(viewingSnapshot.data?.snapshot?.blocks || []).map((b, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #ede9fe", marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#60a5fa", marginBottom: 4, textTransform: "uppercase" }}>{b.block_type}</div>
                  <div style={{ fontSize: 11, color: "#374151", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(b.content, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── two-panel body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT: editor — full width by default; the live preview is now a slide-over
           drawer (triggered from the top bar) rather than a permanent column, so only
           the comments panel still claims a fixed-width sibling column. */}
        <div style={{
          flex: chatOpen ? "0 0 58%" : "1 1 100%",
          display: "flex", flexDirection: "column",
          borderRight: chatOpen ? "1px solid #e2e8f0" : "none",
          overflow: "hidden", background: "#f8fafc",
          transition: "flex-basis 0.25s ease",
          minWidth: 0,
        }}>
          {/* section description */}
          {section?.description && (
            <div style={{
              background: "linear-gradient(135deg, #f8faff, #fff)",
              borderBottom: "1px solid #e8edf3",
              padding: "9px 24px", fontSize: 12.5, color: "#475569",
              flexShrink: 0, lineHeight: 1.6,
              borderLeft: "3px solid #60a5fa",
            }}>
              {section.description}
            </div>
          )}

          {/* status lock or read-only banner */}
          {(statusLock || (!canEdit && !statusLock)) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 24px", flexShrink: 0,
              background: statusLock ? "#fffbeb" : "#f8fafc",
              borderBottom: `1px solid ${statusLock ? "#fde68a" : "#e8edf3"}`,
              fontSize: 12,
            }}>
              <span style={{ display: "flex" }}>{statusLock
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }</span>
              {statusLock && (
                <>
                  <span style={{ fontWeight: 700, color: "#92400e" }}>{section?.status?.replace(/_/g, " ")}</span>
                  <span style={{ color: "#b45309" }}>
                    {section?.status === "APPROVED"     && "— this section has been approved."}
                    {section?.status === "SUBMITTED"    && "— awaiting review. Editing is paused."}
                    {section?.status === "UNDER_REVIEW" && "— currently under review."}
                    {section?.status === "SENT_BACK"    && "— sent back for revisions."}
                    {section?.status === "LOCKED"       && "— locked. No further changes allowed."}
                  </span>
                </>
              )}
              {!canEdit && !statusLock && <span style={{ color: "#64748b" }}>Viewing in read-only mode. Only assigned contributors can edit.</span>}
            </div>
          )}

          {/* reviewer comments thread — shown to contributors when status is SENT_BACK */}
          {section?.status === "SENT_BACK" && (
            <div style={{
              flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.06)",
              background: "#fff9f0",
            }}>
              {/* Sent-back banner */}
              {reviewerComments.length > 0 && (() => {
                const latest = reviewerComments[0];
                const unresCnt = Object.values(blockCounts).reduce((a, c) => a + (c.unresolved || 0), 0);
                return (
                  <div style={{
                    padding: "8px 20px", background: "#fef2f2", borderBottom: "1px solid #fecaca",
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>
                      Sent back by {latest.reviewer_name || "Reviewer"} on {new Date(latest.created_at).toLocaleDateString()}
                    </span>
                    {unresCnt > 0 && (
                      <button
                        onClick={() => setChatOpen(true)}
                        style={{
                          fontSize: 11, color: "#b45309", background: "#fef3c7",
                          border: "1px solid #fcd34d", borderRadius: 6,
                          padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                        }}
                      >
                        {unresCnt} unresolved comment{unresCnt > 1 ? "s" : ""} — View →
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* header row — only when there are comments */}
              {reviewerComments.length > 0 && (() => {
                const latest = reviewerComments[0];
                return (
                  <>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 20px", cursor: "pointer", userSelect: "none",
                    }} onClick={() => setCommentsOpen(o => !o)}>
                      <span style={{ display: "inline-flex" }}><MessageSquare size={14} /></span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                        Reviewer Feedback
                      </span>
                      <span style={{ fontSize: 11, color: "#a16207", flex: 1 }}>
                        — address this before resubmitting
                      </span>
                      <span style={{ fontSize: 11, color: "#a16207" }}>{commentsOpen ? "▲" : "▼"}</span>
                    </div>
                    {commentsOpen && (
                      <div style={{ padding: "0 20px 14px" }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                            background: "#fee2e2", color: "#b91c1c",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {latest.reviewer_name?.[0]?.toUpperCase() || "R"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                                {latest.reviewer_name || "Reviewer"}
                              </span>
                              {latest.workflow_step_name && (
                                <span style={{ fontSize: 10, color: "#94a3b8" }}>{latest.workflow_step_name}</span>
                              )}
                              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
                                {new Date(latest.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div style={{
                              padding: "9px 13px", background: "#fef2f2",
                              border: "1px solid rgba(239,68,68,0.2)",
                              borderRadius: "0 8px 8px 8px",
                              fontSize: 12, color: "#1e293b", lineHeight: 1.6,
                            }}>
                              {latest.reviewer_comment}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* outline rail + blocks scroll area */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
            <BlockOutlineRail blocks={blocks} onSelect={scrollToBlock} activeBlockId={highlightedBlockId} />
            <div ref={editorScrollRef} onScroll={syncScroll} style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>

              {/* Empty — read only */}
              {blocks.length === 0 && readOnly && (
                <div style={{ textAlign: "center", padding: "80px 0" }}>
                  <div style={{ width: 48, height: 56, background: "#f1f5f9", borderRadius: 6, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                  <div style={{ fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>This section has no content yet.</div>
                </div>
              )}

              {/* Empty — editable: centered prompt */}
              {blocks.length === 0 && !readOnly && (
                <div style={{ padding: "60px 0 24px", textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, background: "#f1f5f9", borderRadius: 10, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.45 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Start writing your section</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>Add a paragraph, heading, table, image and more</div>
                  <div style={{ maxWidth: 280, margin: "0 auto" }}>
                    <BigAddBlockButton onAdd={(type) => handleAddBlock(type, -1)} />
                  </div>
                </div>
              )}

              {/* Adder before very first block */}
              {!readOnly && blocks.length > 0 && (
                <InlineAdder
                  isOpen={activeInserter === -1}
                  onToggle={(open) => setActiveInserter(open ? -1 : null)}
                  onAdd={(type) => handleAddBlock(type, -1)}
                />
              )}

              {blocks.map((block, idx) => {
                const isDirty     = dirtyBlocks.has(block.id) || !!dirtyTranslations[block.id];
                const isHighlight = highlightedBlockId === block.id;
                const m           = typeMeta(block.block_type);
                return (
                <React.Fragment key={block.id}>
                  <div data-block-id={block.id} style={{
                    background: "#fff",
                    border: `1px solid ${isHighlight ? "#60a5fa" : isDirty ? "#fcd34d" : "#e8edf3"}`,
                    borderRadius: 12, padding: "14px 18px",
                    boxShadow: isHighlight ? "0 0 0 3px rgba(129,140,248,0.25)" : isDirty ? "0 0 0 3px rgba(252,211,77,0.2)" : "0 1px 4px rgba(15,23,42,0.05)",
                    transition: "box-shadow 0.2s, border-color 0.2s",
                  }}
                    onMouseEnter={e => { if (!isDirty && !isHighlight) { e.currentTarget.style.borderColor = "#bfdbfe"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(79,70,229,0.08)"; }}}
                    onMouseLeave={e => { if (!isDirty && !isHighlight) { e.currentTarget.style.borderColor = "#e8edf3"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,0.05)"; }}}
                  >
                    {/* Block header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <IconChip type={block.block_type} size={22} />
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: "#60a5fa",
                        background: "#eff6ff", padding: "2px 7px",
                        borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.7,
                      }}>
                        {m.label}
                      </span>
                      {!readOnly ? (
                        <button
                          onClick={() => toggleRequired(block.id, !!block.is_required)}
                          title={block.is_required ? "Required — click to make optional" : "Mark as required"}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: block.is_required ? "#ef4444" : "#cbd5e1",
                            fontSize: 13, lineHeight: 1, padding: 0,
                          }}
                        >*</button>
                      ) : block.is_required && (
                        <span title="Required" style={{ color: "#ef4444", fontSize: 13, lineHeight: 1 }}>*</span>
                      )}
                      {/* Comment badge — always visible */}
                      <button
                        onClick={() => { setSelectedBlockId(block.id); setChatOpen(true); }}
                        title="View block comments"
                        style={{
                          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                          background: blockCounts[block.id]?.unresolved > 0 ? "#fef3c7" : "none",
                          border: `1px solid ${blockCounts[block.id]?.unresolved > 0 ? "#fcd34d" : "#e2e8f0"}`,
                          borderRadius: 6, cursor: "pointer", padding: "2px 7px",
                          color: blockCounts[block.id]?.unresolved > 0 ? "#92400e" : "#94a3b8",
                          fontSize: 10, fontFamily: "inherit",
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2v-2H4a2 2 0 01-2-2V4z"/>
                        </svg>
                        {blockCounts[block.id]?.unresolved > 0
                          ? blockCounts[block.id].unresolved
                          : blockCounts[block.id]?.total > 0
                          ? blockCounts[block.id].total
                          : null}
                      </button>
                      {!readOnly && (
                        <div style={{ display: "flex", gap: 1 }}>
                          <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                            style={{ ...arrowBtn, opacity: idx === 0 ? 0.25 : 0.6, fontSize: 11 }}>↑</button>
                          <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}
                            style={{ ...arrowBtn, opacity: idx === blocks.length - 1 ? 0.25 : 0.6, fontSize: 11 }}>↓</button>
                          <button onClick={() => deleteBlock(block.id)}
                            style={{ ...arrowBtn, color: "#f87171", opacity: 0.7, fontSize: 11 }}>✕</button>
                        </div>
                      )}
                    </div>
                    <BlockEditor
                      block={block}
                      readOnly={readOnly}
                      onChange={(newContent) => handleBlockChange(block.id, newContent)}
                      onSaveTranslation={(language, partial) => saveBlockTranslation(block.id, language, partial)}
                      kpiScope={kpiScope}
                      onRefetched={(newContent, translations) => handleBlockRefetched(block.id, newContent, translations)}
                      blockId={block.id}
                      apiFetch={apiFetch}
                      lang={contentLang}
                    />
                  </div>

                  {/* Inline adder after this block */}
                  {!readOnly && (
                    <InlineAdder
                      isOpen={activeInserter === idx}
                      onToggle={(open) => setActiveInserter(open ? idx : null)}
                      onAdd={(type) => handleAddBlock(type, idx)}
                    />
                  )}
                </React.Fragment>
                );
              })}

              {/* Prominent, always-visible add-block action — the primary way to add
                 content; the thin inline "+" separators above are a secondary shortcut
                 for inserting mid-list once a user already knows they exist. */}
              {!readOnly && blocks.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <BigAddBlockButton onAdd={(type) => handleAddBlock(type, blocks.length - 1)} />
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* ── Unsaved changes warning — shown when user tries to submit without saving ── */}
        {submitUnsavedWarn && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              width: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
            }}>
              <div style={{ display: "flex", align: "center", gap: 10, marginBottom: 10 }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="10" cy="10" r="9" stroke="#d97706" strokeWidth="1.5"/>
                  <path d="M10 6v5M10 14h.01" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Unsaved changes</div>
              </div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
                You have unsaved edits{dirtyTranslations && Object.keys(dirtyTranslations).length > 0 ? " (including Hindi translations)" : ""}. Please save your changes before requesting review so reviewers see the latest content.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setSubmitUnsavedWarn(false)}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                    background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >Dismiss</button>
                <button
                  onClick={() => { setSubmitUnsavedWarn(false); openSaveFlow(); }}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#16a34a,#15803d)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >Save Changes →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Pre-save: auto-translate updated content into Hindi? ── */}
        {translatePromptModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              width: 460, boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
                {translatePromptModal.hasNew && !translatePromptModal.hasExisting
                  ? "Auto-translate to Hindi?"
                  : translatePromptModal.hasNew
                  ? "Translate to Hindi?"
                  : "Update Hindi translation too?"}
              </div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>
                {translatePromptModal.hasNew && !translatePromptModal.hasExisting
                  ? `${translatePromptModal.blocks.length} block${translatePromptModal.blocks.length !== 1 ? "s" : ""} ${translatePromptModal.blocks.length !== 1 ? "don't" : "doesn't"} have a Hindi translation yet. Auto-translate now so Hindi content stays in sync?`
                  : translatePromptModal.hasNew
                  ? `Some blocks have no Hindi translation yet, others already do. Auto-translate all ${translatePromptModal.blocks.length} now to keep Hindi content in sync?`
                  : `${translatePromptModal.blocks.length} block${translatePromptModal.blocks.length !== 1 ? "s" : ""} you edited already ${translatePromptModal.blocks.length !== 1 ? "have" : "has"} a Hindi translation. If you skip, those translations will be marked as possibly outdated until someone re-translates them manually.`}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 160, overflowY: "auto", marginBottom: 20 }}>
                {translatePromptModal.blocks.map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                    <IconChip type={b.block_type} size={22} />
                    <span>{typeMeta(b.block_type).label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={handleSkipTranslateBeforeSave} disabled={translatingBeforeSave} style={{
                  padding: "8px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600,
                  cursor: translatingBeforeSave ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>Skip — English only</button>
                <button onClick={handleTranslateBeforeSave} disabled={translatingBeforeSave} style={{
                  padding: "8px 20px", borderRadius: 10, border: "none",
                  background: translatingBeforeSave ? "#a78bfa" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: translatingBeforeSave ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>{translatingBeforeSave ? "Translating…" : (translatePromptModal.hasNew ? "Auto-translate & Save →" : "Translate & Continue →")}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Save Description Modal ── */}
        {saveDescModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }} onClick={e => { if (e.target === e.currentTarget) setSaveDescModal(m => ({ ...m, open: false })); }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              width: 440, boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Save Changes</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
                Describe what you changed in this save. This will appear in Version History.
              </div>
              <textarea
                autoFocus
                value={saveDescModal.desc}
                onChange={e => setSaveDescModal(m => ({ ...m, desc: e.target.value, error: "" }))}
                placeholder="e.g. Updated Q3 data and fixed table headers…"
                rows={4}
                style={{
                  width: "100%", resize: "vertical", border: `1.5px solid ${saveDescModal.error ? "#fca5a5" : "#e2e8f0"}`,
                  borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "inherit",
                  color: "#1e293b", outline: "none", lineHeight: 1.6, boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#60a5fa"}
                onBlur={e  => e.target.style.borderColor = saveDescModal.error ? "#fca5a5" : "#e2e8f0"}
              />
              {saveDescModal.error && (
                <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 5 }}>{saveDescModal.error}</div>
              )}
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6, marginBottom: 20 }}>
                Min 5 characters · {saveDescModal.desc.length} characters typed
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setSaveDescModal(m => ({ ...m, open: false }))} style={{
                  padding: "8px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Cancel</button>
                <button
                  onClick={() => {
                    const desc = saveDescModal.desc.trim();
                    if (desc.length < 5) { setSaveDescModal(m => ({ ...m, error: "At least 5 characters required" })); return; }
                    setSaveDescModal(m => ({ ...m, open: false }));
                    executeSave(desc);
                  }}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#16a34a,#15803d)",
                    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submit Modal ── */}
        {submitModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }} onClick={e => { if (e.target === e.currentTarget) setSubmitModal(m => ({ ...m, open: false })); }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              width: 480, boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
                {section?.status === "SENT_BACK" ? "Re-request Review" : "Request Review"}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                Describe what was done in this version. Reviewers will see this in the approval history.
              </div>

              {/* Unresolved comments warning for SENT_BACK */}
              {section?.status === "SENT_BACK" && submitModal.unresolvedCount > 0 && (
                <div style={{
                  padding: "10px 14px", background: "#fef3c7", border: "1px solid #fcd34d",
                  borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e",
                  display: "flex", gap: 8, alignItems: "flex-start",
                }}>
                  <span style={{ flexShrink: 0, display: "inline-flex" }}><AlertTriangle size={13} /></span>
                  <span>
                    There are <strong>{submitModal.unresolvedCount} unresolved comment{submitModal.unresolvedCount > 1 ? "s" : ""}</strong> on this section.
                    Consider addressing them before re-submitting.
                  </span>
                </div>
              )}

              {/* Required block validation errors */}
              {submitModal.validationErrors.length > 0 && (
                <div style={{
                  padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca",
                  borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#b91c1c",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{submitModal.error}</div>
                  <div style={{ fontSize: 11, color: "#ef4444" }}>
                    Fill in all required blocks before submitting.
                  </div>
                </div>
              )}

              <textarea
                autoFocus
                value={submitModal.desc}
                onChange={e => setSubmitModal(m => ({ ...m, desc: e.target.value, error: "", validationErrors: [] }))}
                placeholder="e.g. Completed all required sections and addressed reviewer feedback…"
                rows={4}
                style={{
                  width: "100%", resize: "vertical", border: `1.5px solid ${submitModal.error && !submitModal.validationErrors.length ? "#fca5a5" : "#e2e8f0"}`,
                  borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "inherit",
                  color: "#1e293b", outline: "none", lineHeight: 1.6, boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#60a5fa"}
                onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
              />
              {submitModal.error && !submitModal.validationErrors.length && (
                <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 5 }}>{submitModal.error}</div>
              )}
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6, marginBottom: 20 }}>
                Min 5 characters · {submitModal.desc.length} characters typed
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setSubmitModal(m => ({ ...m, open: false }))} style={{
                  padding: "8px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Cancel</button>
                <button
                  onClick={handleSubmitConfirm}
                  disabled={submitting}
                  style={{
                    padding: "8px 22px", borderRadius: 10, border: "none",
                    background: submitting ? "#93c5fd" : "linear-gradient(135deg,#2563eb,#2563eb)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}
                >{submitting ? "Submitting…" : "Submit for Review"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── 409 Conflict Modal ── */}
        {conflictModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              width: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
            }}>
              <div style={{ marginBottom: 12, textAlign: "center" }}><AlertTriangle size={30} color="#d97706" /></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8, textAlign: "center" }}>Save Conflict</div>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 20, textAlign: "center", lineHeight: 1.6 }}>
                This section was modified by someone else while you were editing.
                Your changes were not saved.
              </div>
              {conflictModal.latestVersion != null && (
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginBottom: 20 }}>
                  Latest saved version: <strong>v{conflictModal.latestVersion}</strong>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => { setConflictModal({ open: false, latestVersion: null }); setVersionHistOpen(true); }}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "1.5px solid #c4b5fd",
                    background: "#f5f3ff", color: "#6d28d9", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >View History</button>
                <button
                  onClick={() => { setConflictModal({ open: false, latestVersion: null }); window.location.reload(); }}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#2563eb,#2563eb)",
                    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >Reload Page</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Table Type Choice Modal ── */}
        {tableTypeModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }} onClick={e => { if (e.target === e.currentTarget) setTableTypeModal({ open: false, afterIndex: undefined }); }}>
            <div style={{
              background: "#fff", borderRadius: 18, padding: "32px 36px",
              width: 480, boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Add a Table</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 28, lineHeight: 1.6 }}>
                Create a blank table you fill manually, or pull live data from a form in the system.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Manual */}
                <button
                  onClick={() => {
                    setTableTypeModal({ open: false, afterIndex: undefined });
                    addBlock("TABLE", tableTypeModal.afterIndex);
                  }}
                  style={{
                    padding: "20px 18px", border: "2px solid #e2e8f0", borderRadius: 14,
                    background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#60a5fa"; e.currentTarget.style.background = "#fafafe"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "#60a5fa" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Manual Table</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                    Blank table — type in each cell yourself.
                  </div>
                </button>

                {/* Form Import */}
                <button
                  onClick={() => {
                    const oi = computeOrderIndex(tableTypeModal.afterIndex);
                    setTableTypeModal({ open: false, afterIndex: undefined });
                    setFormImportWizard({ open: true, afterIndex: tableTypeModal.afterIndex, orderIndex: oi });
                  }}
                  style={{
                    padding: "20px 18px", border: "2px solid #e2e8f0", borderRadius: 14,
                    background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.background = "#fdf8ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontSize: 24, marginBottom: 10 }}><Archive size={24} color="#cbd5e1" /></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Import from Form Data</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                    Pull records from an existing form. Refresh anytime.
                  </div>
                </button>
              </div>
              <div style={{ marginTop: 20, textAlign: "right" }}>
                <button
                  onClick={() => setTableTypeModal({ open: false, afterIndex: undefined })}
                  style={{ padding: "7px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Form Import Wizard ── */}
        {formImportWizard.open && (
          <FormImportWizard
            sectionId={sectionId}
            orderIndex={formImportWizard.orderIndex}
            apiFetch={apiFetch}
            onImported={handleFormImported}
            onClose={() => setFormImportWizard({ open: false, afterIndex: undefined, orderIndex: undefined })}
          />
        )}

        {/* ── KPI Type Choice Modal ── */}
        {kpiTypeModal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }} onClick={e => { if (e.target === e.currentTarget) setKpiTypeModal({ open: false, afterIndex: undefined }); }}>
            <div style={{
              background: "#fff", borderRadius: 18, padding: "32px 36px",
              width: 480, boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Add a KPI Chart</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 28, lineHeight: 1.6 }}>
                Insert a KPI chart block — manually configure one or import from saved KPI reports.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Manual KPI — plain placeholder for now */}
                <button
                  onClick={() => {
                    setKpiTypeModal({ open: false, afterIndex: undefined });
                    addBlock("KPI", kpiTypeModal.afterIndex);
                  }}
                  style={{
                    padding: "20px 18px", border: "2px solid #e2e8f0", borderRadius: 14,
                    background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#60a5fa"; e.currentTarget.style.background = "#fafafe"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "#60a5fa" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Manual KPI</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                    Blank KPI block — enter values yourself.
                  </div>
                </button>

                {/* Import from KPI Reports */}
                <button
                  onClick={() => {
                    const oi = computeOrderIndex(kpiTypeModal.afterIndex);
                    setKpiTypeModal({ open: false, afterIndex: undefined });
                    setKpiImportWizard({ open: true, afterIndex: kpiTypeModal.afterIndex, orderIndex: oi });
                  }}
                  style={{
                    padding: "20px 18px", border: "2px solid #e2e8f0", borderRadius: 14,
                    background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.background = "#fdf8ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontSize: 24, marginBottom: 10 }}><TrendingUp size={24} color="#cbd5e1" /></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Import from KPI Reports</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                    Pull a saved KPI chart with its data. Re-import anytime.
                  </div>
                </button>
              </div>
              <div style={{ marginTop: 20, textAlign: "right" }}>
                <button
                  onClick={() => setKpiTypeModal({ open: false, afterIndex: undefined })}
                  style={{ padding: "7px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI Import Wizard ── */}
        {kpiImportWizard.open && (
          <KpiImportWizard
            sectionId={sectionId}
            orderIndex={kpiImportWizard.orderIndex}
            defaultYear={reportMeta?.academic_year || undefined}
            apiFetch={apiFetch}
            onImported={handleKpiImported}
            onClose={() => setKpiImportWizard({ open: false, afterIndex: undefined, orderIndex: undefined })}
          />
        )}

        {/* RIGHT PANEL: comments — its own column, only while open */}
        {chatOpen && (
          <div style={{ flex: "0 0 42%", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
            <BlockCommentsSidebar
              sectionId={sectionId}
              blockId={selectedBlockId}
              blocks={blocks}
              blockCounts={blockCounts}
              currentUserId={user?.id}
              apiFetch={apiFetch}
              onClose={() => { setChatOpen(false); setSelectedBlockId(null); }}
              showBackToPreview={false}
              onBlockSelect={id => setSelectedBlockId(id)}
              onCountRefresh={loadBlockCounts}
            />
          </div>
        )}
      </div>

      {/* ── Live preview — slide-over drawer, opened on demand from the top bar ── */}
      {!hidePreview && (
        <>
          {previewOpen && (
            <div
              onClick={() => setPreviewOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 900 }}
            />
          )}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 901,
            width: previewWidth,
            transform: previewOpen ? "translateX(0)" : "translateX(100%)",
            transition: resizingPreviewRef.current ? "none" : "transform 0.25s ease",
            background: "#808080",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Drag handle — resizes the drawer */}
            <div
              onMouseDown={startPreviewResize}
              title="Drag to resize"
              style={{
                position: "absolute", top: 0, left: -4, bottom: 0, width: 8,
                cursor: "col-resize", zIndex: 2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124,58,237,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            />
            <div style={{
              position: "absolute", top: 8, right: 8, zIndex: 1,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <button
                onClick={() => setPreviewWidth((w) => Math.max(360, w - 120))}
                title="Decrease width"
                style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                  fontSize: 14, color: "#64748b", width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}
              >−</button>
              <button
                onClick={() => setPreviewWidth((w) => Math.min(Math.min(1200, window.innerWidth * 0.92), w + 120))}
                title="Increase width"
                style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                  fontSize: 14, color: "#64748b", width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}
              >+</button>
              <button onClick={() => setPreviewOpen(false)} title="Close preview" style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                fontSize: 13, color: "#64748b", width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {previewOpen && (
                <WordDocumentPreview
                  reportMeta={reportMeta}
                  section={section}
                  blocks={blocks}
                  reportSections={reportSections}
                  currentSectionId={sectionId}
                  canvasRef={previewCanvasRef}
                  lang={contentLang}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
