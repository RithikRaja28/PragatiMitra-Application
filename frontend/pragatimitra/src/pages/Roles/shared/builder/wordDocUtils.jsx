import React from "react";

export const DOC_FONT = "'Calibri', 'Segoe UI', Arial, sans-serif";
export const A4_W     = 794;
export const A4_H     = 1123;
export const MARG     = 72;
export const CON_W    = A4_W - MARG * 2;
export const CON_H    = A4_H - MARG * 2;
export const TITLE_H  = 110;

export function WordBlock({ block }) {
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
        <div style={{ fontFamily: DOC_FONT, fontWeight: 700, ...(lvlStyle[c.level || 2] || lvlStyle[2]) }}>
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
                <img src={col.url} alt={col.alt || col.caption || `Image ${i + 1}`}
                  style={{ width: "100%", borderRadius: 3, border: "1px solid #e5e7eb" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ height: 60, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 9 }}>
                  [Image {i + 1}]
                </div>
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
      const cell    = { border: "1px solid #9ca3af", padding: "4px 7px", fontFamily: DOC_FONT, fontSize: 10, color: "#111827", verticalAlign: "top" };
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
                  {row.map((val, ci) => (
                    <td key={ci} style={cell}>{val}</td>
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

export function A4Page({ children, pageNum, totalPages, sectionTitle, reportTitle, isFirst, reportMeta }) {
  return (
    <div style={{
      width: A4_W, minHeight: A4_H, background: "#fff",
      boxShadow: "0 3px 16px rgba(0,0,0,0.45)",
      position: "relative", boxSizing: "border-box", flexShrink: 0,
    }}>
      {/* Running header */}
      <div style={{
        position: "absolute", top: 24, left: MARG, right: MARG,
        borderBottom: "0.5px solid #d1d5db", paddingBottom: 5,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {reportMeta?.report_type || ""}{"  "}{reportMeta?.academic_year || ""}
        </span>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {reportTitle || reportMeta?.title || ""}
        </span>
      </div>

      {/* Content area */}
      <div style={{ padding: `${MARG}px ${MARG}px ${MARG + 20}px` }}>
        {/* Report title — first page only */}
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

        {/* Section heading on continuation pages */}
        {sectionTitle && (
          <div style={{ fontFamily: DOC_FONT, fontSize: 14, fontWeight: 700, color: "#1F3864", borderBottom: "1px solid #d1d5db", paddingBottom: 5, marginBottom: 14 }}>
            {sectionTitle}{!isFirst ? " (continued)" : ""}
          </div>
        )}

        {children}
      </div>

      {/* Running footer */}
      <div style={{
        position: "absolute", bottom: 24, left: MARG, right: MARG,
        borderTop: "0.5px solid #d1d5db", paddingTop: 5,
        display: "flex", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>{sectionTitle || ""}</span>
        <span style={{ fontFamily: DOC_FONT, fontSize: 7.5, color: "#9ca3af" }}>
          {pageNum}{totalPages > 1 ? ` / ${totalPages}` : ""}
        </span>
      </div>
    </div>
  );
}
