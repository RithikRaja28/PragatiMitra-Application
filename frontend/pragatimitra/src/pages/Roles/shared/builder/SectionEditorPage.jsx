/**
 * SectionEditorPage.jsx
 * Two-panel layout: left = block editor, right = paginated Word-like preview.
 * Preview is hidden when section is under review / submitted.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../../../store/AuthContext";
import { useApi }  from "../../../../hooks/useApi";
import { BLOCK_ICONS, BlockEditor, DEFAULT_CONTENT } from "./BlockEditors";

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
function WordBlock({ block }) {
  const c = block.content || {};

  switch (block.block_type) {

    case "PARAGRAPH":
      return (
        <div
          style={{ fontFamily: DOC_FONT, fontSize: 11, lineHeight: 1.8, color: "#111827", marginBottom: 10, wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: c.html || c.text || "<em style='color:#9ca3af'>Empty paragraph</em>" }}
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
              <img src={c.url} alt={c.alt || c.caption || ""} style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 10 }}>
                [Image]
              </div>
            )}
            {c.caption && (
              <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 3, fontStyle: "italic" }}>
                {c.caption}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "IMAGE_GRID": {
      const cols = c.cols || [];
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length || 2}, 1fr)`, gap: 8, margin: "8px 0 12px" }}>
          {cols.map((col, i) => (
            <div key={i}>
              {col.url ? (
                <img src={col.url} alt={col.alt || col.caption || `Image ${i + 1}`} style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 9 }}>[Image {i + 1}]</div>
              )}
              {col.caption && (
                <div style={{ fontFamily: DOC_FONT, fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 2, fontStyle: "italic" }}>{col.caption}</div>
              )}
            </div>
          ))}
        </div>
      );
    }

    case "TABLE": {
      const headers = c.headers || [];
      const rows    = c.rows    || [];
      const cell = { border: "1px solid #9ca3af", padding: "4px 7px", fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top" };
      return (
        <div style={{ margin: "8px 0 12px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            {headers.length > 0 && (
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{ ...cell, background: "#D0CECE", fontWeight: 700, textAlign: "left" }}>{h || `Col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  {row.map((cell_val, ci) => (
                    <td key={ci} style={cell}>{cell_val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "LIST": {
      const items = c.items || [];
      const Tag   = c.ordered ? "ol" : "ul";
      return (
        <Tag style={{ fontFamily: DOC_FONT, fontSize: 11, color: "#111827", paddingLeft: 20, lineHeight: 1.75, margin: "4px 0 10px" }}>
          {items.map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}
        </Tag>
      );
    }

    case "DIVIDER":
      return <hr style={{ border: "none", borderTop: "1px solid #9ca3af", margin: "10px 0 12px" }} />;

    case "FILE":
      return (
        <div style={{ fontFamily: DOC_FONT, fontSize: 10, margin: "6px 0 10px", padding: "5px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 2, display: "flex", alignItems: "center", gap: 5 }}>
          <span>📎</span>
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
function WordDocumentPreview({ reportMeta, section, blocks, reportSections, currentSectionId, canvasRef }) {
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

  /* Distribute blocks across pages using hidden measurement */
  useEffect(() => {
    if (!measureRef.current || !blocks.length) {
      setPageGroups([blocks]);
      return;
    }

    const els = Array.from(measureRef.current.querySelectorAll("[data-block-idx]"));
    if (!els.length) { setPageGroups([blocks]); return; }

    const groups  = [];
    let current   = [];
    let usedH     = TITLE_H; // page 1 has title header above section

    els.forEach((el) => {
      const idx = Number(el.getAttribute("data-block-idx"));
      const h   = el.offsetHeight + 12; // 12 = inter-block margin
      if (usedH + h > CON_H && current.length > 0) {
        groups.push(current);
        current = [blocks[idx]];
        usedH   = 40; // subsequent pages: section heading only
      } else {
        current.push(blocks[idx]);
        usedH += h;
      }
    });
    if (current.length) groups.push(current);
    setPageGroups(groups.length ? groups : [blocks]);
  }, [blocks]);

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
              <WordBlock block={b} />
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
                    pageBlocks.map((b) => <WordBlock key={b.id} block={b} />)
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

/* ── Inline block inserter ──────────────────────────────────────────────── */
const INLINE_BLOCK_MENU = [
  { type: "PARAGRAPH",  icon: "P",   label: "Text" },
  { type: "HEADING",    icon: "H",   label: "Heading" },
  { type: "IMAGE",      icon: "Img", label: "Image" },
  { type: "IMAGE_GRID", icon: "Grd", label: "Image Grid" },
  { type: "TABLE",      icon: "Tbl", label: "Table" },
  { type: "LIST",       icon: "Lst", label: "List" },
  { type: "DIVIDER",    icon: "--",  label: "Divider" },
  { type: "FILE",       icon: "Fil", label: "File" },
];

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

      {/* + button */}
      {show && (
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!isOpen); }}
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            width: 24, height: 24, borderRadius: "50%",
            border: `1.5px solid ${isOpen ? "#7c3aed" : "#c4b5fd"}`,
            background: isOpen ? "#7c3aed" : "#faf5ff",
            color: isOpen ? "#fff" : "#7c3aed",
            fontSize: 16, fontWeight: 300, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: isOpen ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
            transition: "all 0.15s",
          }}
        >
          +
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div ref={dropdownRef} style={{
          position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,0.13)", padding: "10px 12px",
          display: "flex", flexWrap: "wrap", gap: 5, width: 308, zIndex: 100,
        }}>
          <div style={{ width: "100%", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>
            Insert block
          </div>
          {INLINE_BLOCK_MENU.map((t) => (
            <button
              key={t.type}
              onMouseDown={(e) => { e.preventDefault(); onAdd(t.type); onToggle(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",
                borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff",
                fontSize: 12, color: "#374151", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#faf5ff"; e.currentTarget.style.borderColor = "#c4b5fd"; e.currentTarget.style.color = "#7c3aed"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#374151"; }}
            >
              <span style={{ fontSize: 10, fontWeight: 700 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION EDITOR PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function SectionEditorPage({ sectionId, reportTitle, onBack }) {
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
  const [reviewerComments, setReviewerComments] = useState([]); // sent-back comments from reviewers
  const [commentsOpen,     setCommentsOpen]     = useState(true);

  const saveTimer        = useRef(null);
  const editorScrollRef  = useRef(null);
  const previewCanvasRef = useRef(null);
  const [activeInserter, setActiveInserter] = useState(null); // null | number (afterIndex)

  const syncScroll = useCallback(() => {
    const ed = editorScrollRef.current;
    const pv = previewCanvasRef.current;
    if (!ed || !pv) return;
    const edMax = ed.scrollHeight - ed.clientHeight;
    if (edMax <= 0) return;
    const pct = ed.scrollTop / edMax;
    pv.scrollTop = pct * (pv.scrollHeight - pv.clientHeight);
  }, []);

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
          const sentBack = (hJson.data || []).filter(h => h.event === "SENT_BACK" && h.reviewer_comment);
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

  /* ── auto-save block ── */
  function scheduleBlockSave(blockId, newContent) {
    clearTimeout(saveTimer.current);
    setSaveLabel("Saving…");
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await apiFetch(`/api/builder/blocks/${blockId}`, {
          method: "PUT",
          body:   JSON.stringify({ content: newContent }),
        });
        setSaveLabel("✓ Saved");
        setTimeout(() => setSaveLabel(""), 2000);
      } catch {
        setSaveLabel("⚠ Save failed");
      } finally {
        setSaving(false);
      }
    }, 900);
  }

  function handleBlockChange(blockId, newContent) {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, content: newContent } : b));
    scheduleBlockSave(blockId, newContent);
  }

  async function addBlock(type, afterIndex) {
    // afterIndex: index of the block to insert AFTER (-1 = before first, undefined = after last)
    const insertAfter = afterIndex !== undefined ? afterIndex : blocks.length - 1;

    // Compute order_index for the insertion slot
    let orderIndex;
    if (blocks.length === 0) {
      orderIndex = 1;
    } else if (insertAfter < 0) {
      orderIndex = (blocks[0].order_index || 1) - 1;
    } else if (insertAfter >= blocks.length - 1) {
      orderIndex = (blocks[blocks.length - 1].order_index || blocks.length) + 1;
    } else {
      orderIndex = ((blocks[insertAfter].order_index || insertAfter + 1) + (blocks[insertAfter + 1].order_index || insertAfter + 2)) / 2;
    }

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

  async function handleSubmit() {
    if (!window.confirm("Submit this section for review? You won't be able to edit it until the reviewer responds.")) return;
    setSubmitting(true);
    setSubmitMsg("");
    try {
      const res  = await apiFetch(`/api/builder/approvals/section/${sectionId}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setSection((s) => ({ ...s, status: "SUBMITTED" }));
      setSubmitMsg("✓ Submitted for review successfully!");
    } catch (ex) {
      setSubmitMsg(`⚠ ${ex.message || "Submit failed"}`);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── loading / error ── */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
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
      fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#f8fafc",
    }}>

      {/* ── top bar ── */}
      <div style={{
        background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.07)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 11px",
          border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff",
          fontSize: 12, color: "#64748b", cursor: "pointer", flexShrink: 0,
        }}>
          ← My Sections
        </button>

        <div style={{ width: 1, height: 20, background: "#e2e8f0", flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {reportTitle}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {section?.title}
            <StatusBadge status={section?.status} />
            {myRole && (
              <span style={{
                padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                textTransform: "uppercase",
                background: (ROLE_BADGE[myRole] || ROLE_BADGE.CONTRIBUTOR).bg,
                color:      (ROLE_BADGE[myRole] || ROLE_BADGE.CONTRIBUTOR).color,
              }}>
                {myRole}
              </span>
            )}
          </div>
        </div>

        {saveLabel && (
          <span style={{
            fontSize: 11, flexShrink: 0,
            color: saveLabel.startsWith("✓") ? "#15803d" : saveLabel.startsWith("⚠") ? "#b91c1c" : "#94a3b8",
          }}>
            {saveLabel}
          </span>
        )}

        {canSubmit && (
          <button onClick={handleSubmit} disabled={submitting} style={{
            padding: "7px 16px", background: submitting ? "#93c5fd" : "#2563eb",
            color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
            fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", flexShrink: 0,
          }}>
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        )}

        {section?.status === "SUBMITTED" && (
          <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600, flexShrink: 0 }}>⏳ Awaiting review</span>
        )}
        {section?.status === "APPROVED" && (
          <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600, flexShrink: 0 }}>✓ Approved</span>
        )}
      </div>

      {/* submit message */}
      {submitMsg && (
        <div style={{
          padding: "10px 20px", flexShrink: 0,
          background: submitMsg.startsWith("✓") ? "#dcfce7" : "#fee2e2",
          color:      submitMsg.startsWith("✓") ? "#15803d" : "#b91c1c",
          fontSize: 13,
        }}>
          {submitMsg}
        </div>
      )}

      {/* ── two-panel body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: editor (full width when preview is hidden) */}
        <div style={{
          flex: hidePreview ? "1" : "0 0 58%",
          display: "flex", flexDirection: "column",
          borderRight: hidePreview ? "none" : "1px solid rgba(0,0,0,0.07)",
          overflow: "hidden", background: "#f8fafc",
          transition: "flex 0.2s",
        }}>
          {/* section description */}
          {section?.description && (
            <div style={{
              background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.05)",
              padding: "8px 20px", fontSize: 13, color: "#64748b", flexShrink: 0,
            }}>
              {section.description}
            </div>
          )}

          {/* status lock or read-only banner */}
          {(statusLock || (!canEdit && !statusLock)) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 20px", flexShrink: 0,
              background: statusLock ? "#fef3c7" : "#f8fafc",
              borderBottom: "1px solid rgba(0,0,0,0.05)",
              fontSize: 12, color: statusLock ? "#92400e" : "#64748b",
            }}>
              <span>{statusLock ? "🔒" : "👁"}</span>
              {statusLock && (
                <>
                  <strong>{section?.status?.replace(/_/g, " ")}</strong>
                  {section?.status === "APPROVED"     && " — this section has been approved."}
                  {section?.status === "SUBMITTED"    && " — awaiting review. Editing paused."}
                  {section?.status === "UNDER_REVIEW" && " — currently under review."}
                  {section?.status === "SENT_BACK"    && " — sent back for revisions."}
                  {section?.status === "LOCKED"       && " — locked. No further changes allowed."}
                </>
              )}
              {!canEdit && !statusLock && "Viewing in read-only mode. Only assigned contributors can edit."}
            </div>
          )}

          {/* reviewer comments thread — shown to contributors when status is SENT_BACK */}
          {reviewerComments.length > 0 && section?.status === "SENT_BACK" && (
            <div style={{
              flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.06)",
              background: "#fff9f0",
            }}>
              {/* header row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 20px", cursor: "pointer", userSelect: "none",
              }} onClick={() => setCommentsOpen(o => !o)}>
                <span style={{ fontSize: 14 }}>💬</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                  Reviewer Comments ({reviewerComments.length})
                </span>
                <span style={{ fontSize: 11, color: "#a16207", flex: 1 }}>
                  — address these before resubmitting
                </span>
                <span style={{ fontSize: 11, color: "#a16207" }}>{commentsOpen ? "▲" : "▼"}</span>
              </div>

              {commentsOpen && (
                <div style={{ padding: "0 20px 14px" }}>
                  {reviewerComments.map((h, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 10, marginBottom: i < reviewerComments.length - 1 ? 12 : 0,
                    }}>
                      {/* avatar */}
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: "#fee2e2", color: "#b91c1c",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {h.reviewer_name?.[0]?.toUpperCase() || "R"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                            {h.reviewer_name || "Reviewer"}
                          </span>
                          {h.workflow_step_name && (
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>{h.workflow_step_name}</span>
                          )}
                          <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{
                          padding: "9px 13px", background: "#fef2f2",
                          border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: "0 8px 8px 8px",
                          fontSize: 12, color: "#1e293b", lineHeight: 1.6,
                        }}>
                          {h.reviewer_comment}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* blocks scroll area */}
          <div ref={editorScrollRef} onScroll={syncScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>

              {/* Empty — read only */}
              {blocks.length === 0 && readOnly && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>
                  This section has no content yet.
                </div>
              )}

              {/* Empty — editable: big centered add button */}
              {blocks.length === 0 && !readOnly && (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <InlineAdder
                    isOpen={activeInserter === -1}
                    onToggle={(open) => setActiveInserter(open ? -1 : null)}
                    onAdd={(type) => addBlock(type, -1)}
                  />
                  <div style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
                    Click <strong style={{ color: "#7c3aed" }}>+</strong> to add your first block
                  </div>
                </div>
              )}

              {/* Adder before very first block */}
              {!readOnly && blocks.length > 0 && (
                <InlineAdder
                  isOpen={activeInserter === -1}
                  onToggle={(open) => setActiveInserter(open ? -1 : null)}
                  onAdd={(type) => addBlock(type, -1)}
                />
              )}

              {blocks.map((block, idx) => (
                <React.Fragment key={block.id}>
                  <div style={{
                    background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
                    borderRadius: 10, padding: "14px 16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    {/* Block header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        {BLOCK_ICONS[block.block_type]} {block.block_type}
                      </span>
                      {!readOnly && (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                          <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                            style={{ ...arrowBtn, opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                          <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}
                            style={{ ...arrowBtn, opacity: idx === blocks.length - 1 ? 0.3 : 1 }}>↓</button>
                          <button onClick={() => deleteBlock(block.id)}
                            style={{ ...arrowBtn, color: "#ef4444" }}>✕</button>
                        </div>
                      )}
                    </div>
                    <BlockEditor
                      block={block}
                      readOnly={readOnly}
                      onChange={(newContent) => handleBlockChange(block.id, newContent)}
                    />
                  </div>

                  {/* Inline adder after this block */}
                  {!readOnly && (
                    <InlineAdder
                      isOpen={activeInserter === idx}
                      onToggle={(open) => setActiveInserter(open ? idx : null)}
                      onAdd={(type) => addBlock(type, idx)}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Word document preview — hidden when in review */}
        {!hidePreview && (
          <div style={{ flex: "0 0 42%", overflow: "hidden", background: "#808080", display: "flex", flexDirection: "column" }}>
            <WordDocumentPreview
              reportMeta={reportMeta}
              section={section}
              blocks={blocks}
              reportSections={reportSections}
              currentSectionId={sectionId}
              canvasRef={previewCanvasRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
