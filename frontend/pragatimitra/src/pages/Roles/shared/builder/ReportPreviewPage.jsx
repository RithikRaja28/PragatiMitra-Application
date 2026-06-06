import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useApi } from "../../../../hooks/useApi";
import { DOC_FONT, A4_W, A4_H, MARG, CON_W, CON_H, TITLE_H, WordBlock, A4Page } from "./wordDocUtils";

/* Build a parent-child tree from the flat sections array returned by the API */
function buildTree(sections) {
  const map = {};
  for (const s of sections) map[s.id] = { ...s, children: [] };
  const roots = [];
  for (const s of sections) {
    if (s.parent_id && map[s.parent_id]) {
      map[s.parent_id].children.push(map[s.id]);
    } else {
      roots.push(map[s.id]);
    }
  }
  function sort(nodes) {
    nodes.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    for (const n of nodes) if (n.children.length) sort(n.children);
  }
  sort(roots);
  return roots;
}

/* Depth-first pre-order traversal to get reading order */
function flattenPreorder(nodes, depth) {
  if (depth === undefined) depth = 0;
  const result = [];
  for (const n of nodes) {
    result.push({ ...n, _depth: depth });
    if (n.children && n.children.length) {
      result.push(...flattenPreorder(n.children, depth + 1));
    }
  }
  return result;
}

/* Section heading rendered inside the document content */
function SectionHeader({ section }) {
  const depth = section._depth || 0;
  if (depth === 0) {
    return (
      <div style={{
        fontFamily: DOC_FONT, fontSize: 15, fontWeight: 800,
        color: "#1F3864", borderBottom: "2px solid #1F3864",
        paddingBottom: 6, marginTop: 20, marginBottom: 10,
      }}>
        {section.title}
        {section.description && (
          <div style={{ fontSize: 9, fontWeight: 400, color: "#6b7280", marginTop: 3, fontStyle: "italic" }}>
            {section.description}
          </div>
        )}
      </div>
    );
  }
  if (depth === 1) {
    return (
      <div style={{ fontFamily: DOC_FONT, fontSize: 12, fontWeight: 700, color: "#2E4A7A", marginTop: 14, marginBottom: 7 }}>
        {section.title}
      </div>
    );
  }
  return (
    <div style={{ fontFamily: DOC_FONT, fontSize: 11, fontWeight: 700, color: "#374151", marginTop: 10, marginBottom: 5, paddingLeft: 10 }}>
      {section.title}
    </div>
  );
}

const STATUS_DOT = {
  APPROVED:          "#22c55e",
  SUBMITTED:         "#3b82f6",
  UNDER_REVIEW:      "#f59e0b",
  REVISION_REQUIRED: "#f97316",
  REJECTED:          "#ef4444",
  DRAFT:             "#94a3b8",
};

/* ═══════════════════════════════════════════════════════════════════
   REPORT PREVIEW PAGE
═══════════════════════════════════════════════════════════════════ */
export default function ReportPreviewPage({ reportId, reportTitle, onBack }) {
  const { apiFetch } = useApi();

  const [report,         setReport]         = useState(null);
  const [sections,       setSections]       = useState([]);
  const [blocksBySection,setBlocksBySection]= useState({});
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [scale,          setScale]          = useState(0.65);
  const [pages,          setPages]          = useState([]);

  const containerRef = useRef(null);
  const measureRef   = useRef(null);

  /* Fetch report structure then all section blocks */
  useEffect(() => {
    setLoading(true);
    setError("");

    apiFetch(`/api/builder/reports/${reportId}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.success) throw new Error(d.message || "Failed to load report");
        setReport(d.data);

        const flat = flattenPreorder(buildTree(d.data.sections || []));
        setSections(flat);

        /* Fetch blocks for every section concurrently */
        const results = await Promise.all(
          flat.map((s) =>
            apiFetch(`/api/builder/blocks/section/${s.id}`)
              .then((r) => r.json())
              .then((bd) => ({ id: s.id, blocks: bd.success ? (bd.data || []) : [] }))
              .catch(() => ({ id: s.id, blocks: [] }))
          )
        );
        const bySection = {};
        for (const { id, blocks } of results) bySection[id] = blocks;
        setBlocksBySection(bySection);
      })
      .catch((ex) => setError(ex.message || "Failed to load report"))
      .finally(() => setLoading(false));
  }, [reportId]);

  /* Scale to container width */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 48;
      setScale(Math.min(available / A4_W, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* All document items in reading order */
  const allItems = useMemo(() => {
    const items = [];
    for (const s of sections) {
      items.push({ itemType: "SECTION_HEADER", section: s, key: "h-" + s.id });
      for (const b of (blocksBySection[s.id] || [])) {
        items.push({ itemType: "BLOCK", block: b, key: b.id });
      }
    }
    return items;
  }, [sections, blocksBySection]);

  /* Paginate using hidden measurement div */
  useEffect(() => {
    if (!allItems.length) { setPages([]); return; }
    if (!measureRef.current) { setPages([allItems]); return; }

    const els = Array.from(measureRef.current.querySelectorAll("[data-item-idx]"));
    if (!els.length) { setPages([allItems]); return; }

    const result = [];
    let current  = [];
    let usedH    = TITLE_H; // first page: report title block consumes this

    els.forEach((el) => {
      const idx = Number(el.getAttribute("data-item-idx"));
      const h   = el.offsetHeight + 14;
      if (usedH + h > CON_H && current.length > 0) {
        result.push(current);
        current = [allItems[idx]];
        usedH   = h;
      } else {
        current.push(allItems[idx]);
        usedH += h;
      }
    });
    if (current.length) result.push(current);
    setPages(result.length ? result : [allItems]);
  }, [allItems]);

  function renderItem(item) {
    if (item.itemType === "SECTION_HEADER") {
      return <SectionHeader key={item.key} section={item.section} />;
    }
    return <WordBlock key={item.key} block={item.block} />;
  }

  /* ── loading ── */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>Building preview…</div>
          <div style={{ fontSize: 13 }}>Loading all sections and content blocks</div>
        </div>
      </div>
    );
  }

  /* ── error ── */
  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, marginBottom: 16 }}>{error}</div>
        <button onClick={onBack} style={{ padding: "8px 16px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>
          Back
        </button>
      </div>
    );
  }

  const totalSections    = sections.length;
  const approvedSections = sections.filter((s) => s.status === "APPROVED").length;
  const completionPct    = totalSections ? Math.round((approvedSections / totalSections) * 100) : 0;
  const reportMeta       = { title: report?.title, report_type: report?.report_type, academic_year: report?.academic_year };

  /* ── layout ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#f8fafc" }}>

      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.07)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
          border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff",
          fontSize: 12, color: "#64748b", cursor: "pointer", flexShrink: 0,
        }}>
          ← Editor
        </button>

        <div style={{ width: 1, height: 20, background: "#e2e8f0", flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Full Report Preview</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {report?.title || reportTitle}
          </div>
        </div>

        {/* Completion ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{approvedSections}/{totalSections} sections approved</div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{pages.length} page{pages.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ width: 44, height: 44, position: "relative", flexShrink: 0 }}>
            <svg width="44" height="44" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="22" cy="22" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
              <circle cx="22" cy="22" r="16" fill="none" stroke="#22c55e" strokeWidth="4"
                strokeDasharray={String(2 * Math.PI * 16)}
                strokeDashoffset={String(2 * Math.PI * 16 * (1 - completionPct / 100))}
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#1e293b" }}>
              {completionPct}%
            </div>
          </div>
        </div>

        {/* Report status */}
        <span style={{
          padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0,
          background: report?.status === "PUBLISHED" ? "#dcfce7" : "#f1f5f9",
          color:      report?.status === "PUBLISHED" ? "#15803d" : "#64748b",
        }}>
          {report?.status || "DRAFT"}
        </span>
      </div>

      {/* Two-column layout: sidebar + canvas */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Section navigation sidebar */}
        {sections.length > 0 && (
          <div style={{
            width: 220, flexShrink: 0, background: "#fff",
            borderRight: "1px solid rgba(0,0,0,0.07)",
            overflowY: "auto", padding: "12px 8px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, padding: "0 6px", marginBottom: 8 }}>
              Sections
            </div>
            {sections.map((s) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: `5px 8px 5px ${8 + (s._depth || 0) * 12}px`,
                borderRadius: 6, marginBottom: 2,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_DOT[s.status] || STATUS_DOT.DRAFT }} />
                <span style={{ fontSize: 11, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* A4 canvas */}
        <div ref={containerRef} style={{ flex: 1, overflowY: "auto", background: "#808080", padding: 24 }}>

          {/* Hidden measurement div */}
          <div
            ref={measureRef}
            style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", width: CON_W, top: 0, left: -9999 }}
            aria-hidden="true"
          >
            {allItems.map((item, i) => (
              <div key={item.key} data-item-idx={i}>
                {item.itemType === "SECTION_HEADER"
                  ? <SectionHeader section={item.section} />
                  : <WordBlock block={item.block} />}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {allItems.length === 0 && (
            <div style={{
              width: A4_W * scale, margin: "0 auto", height: A4_H * scale,
              background: "#fff", boxShadow: "0 3px 16px rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ textAlign: "center", color: "#94a3b8", fontFamily: DOC_FONT }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>No content yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Add sections and blocks, then come back to preview</div>
              </div>
            </div>
          )}

          {/* Pages */}
          {pages.map((pageItems, pi) => (
            <div key={pi}>
              {pi > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", color: "#d1d5db", fontSize: 9 }}>
                  <div style={{ flex: 1, height: 1, background: "#6b7280" }} />
                  <span>Page {pi + 1}</span>
                  <div style={{ flex: 1, height: 1, background: "#6b7280" }} />
                </div>
              )}
              <div style={{ width: A4_W * scale, height: A4_H * scale, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: A4_W }}>
                  <A4Page
                    pageNum={pi + 1}
                    totalPages={pages.length || 1}
                    reportTitle={report?.title}
                    reportMeta={reportMeta}
                    isFirst={pi === 0}
                  >
                    {pageItems.map(renderItem)}
                  </A4Page>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
