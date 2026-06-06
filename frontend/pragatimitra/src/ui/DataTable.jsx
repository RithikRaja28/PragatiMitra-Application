import React from "react";
import { color, radius, shadow, size, font } from "./tokens";
import { SkeletonRows } from "./Skeleton";

/**
 * DataTable — one consistent enterprise table shell.
 *   structure: [toolbar] → table(sticky header, 64px rows, hover, ellipsis) → [pagination]
 *
 * columns: [{ key, header, align?, width?, grow?, ellipsis?, render?(row) }]
 *   - align: "left" | "center" | "right"  (actions column → "right")
 *   - ellipsis: true clamps long content with tooltip
 *   - render(row): custom cell; otherwise row[key]
 *
 * props: columns, rows, rowKey, loading, empty, toolbar, pagination, minWidth
 */
export default function DataTable({
  columns, rows, rowKey = "id", loading = false, empty = null,
  toolbar = null, pagination = null, minWidth = 720, onRowClick,
}) {
  const colCount = columns.length;

  return (
    <div style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.xl, boxShadow: shadow.card, overflow: "hidden", fontFamily: font.family }}>
      {toolbar && (
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          {toolbar}
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={6} cols={Math.min(colCount, 5)} />
      ) : rows.length === 0 ? (
        empty
      ) : (
        <div className="ui-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{
                    position: "sticky", top: 0, zIndex: 1,
                    padding: "12px 18px", textAlign: c.align || "left",
                    fontSize: 11, fontWeight: 700, color: color.muted,
                    textTransform: "uppercase", letterSpacing: 0.6,
                    background: "#F9FAFB", borderBottom: `1px solid ${color.border}`,
                    whiteSpace: "nowrap", width: c.width,
                  }}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = typeof rowKey === "function" ? rowKey(row) : row[rowKey];
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{ height: size.rowH, cursor: onRowClick ? "pointer" : "default", transition: "background .12s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = color.rowHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    {columns.map((c) => {
                      const content = c.render ? c.render(row) : row[c.key];
                      return (
                        <td key={c.key} style={{
                          padding: "0 18px", textAlign: c.align || "left",
                          fontSize: 13.5, color: color.text, borderBottom: `1px solid ${color.border}`,
                          verticalAlign: "middle", width: c.width,
                          maxWidth: c.ellipsis ? (c.width || 240) : undefined,
                        }}>
                          {c.ellipsis
                            ? <div className="ui-ellipsis" title={typeof content === "string" ? content : undefined}>{content}</div>
                            : content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && !loading && rows.length > 0 && (
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${color.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {pagination}
        </div>
      )}
    </div>
  );
}
