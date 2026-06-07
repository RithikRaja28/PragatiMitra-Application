import React from "react";

/* ════════════════════════════════════════════════════════════════
   Shared design-system primitives — one source of truth for
   status badges and cards across the whole app.
════════════════════════════════════════════════════════════════ */

/* ── Status badge ──────────────────────────────────────────────
   Tones map to the global status colour system. */
const BADGE_TONES = {
  active:   { bg: "#dcfce7", color: "#16a34a", dot: "#16a34a" },
  inactive: { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
  locked:   { bg: "#fee2e2", color: "#dc2626", dot: "#dc2626" },
  open:     { bg: "#dcfce7", color: "#16a34a", dot: "#16a34a" },
  expired:  { bg: "#fee2e2", color: "#dc2626", dot: "#dc2626" },
  shared:   { bg: "#e0f2fe", color: "#0284c7", dot: "#0284c7" },
  private:  { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
  warning:  { bg: "#fef3c7", color: "#b45309", dot: "#d97706" },
  neutral:  { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
};

export function StatusBadge({ tone = "neutral", children, dot = true, icon, style }) {
  const c = BADGE_TONES[tone] || BADGE_TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 11px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon
        ? <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>
        : dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />}
      {children}
    </span>
  );
}

/* ── Card ──────────────────────────────────────────────────────
   White surface, hairline border, soft shadow, 12px radius. */
export function Card({ children, style, padding, ...rest }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6eaf0",
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
        ...(padding != null ? { padding } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Enterprise data-table primitives — one consistent shell, header
   and row styling for every list table across the app.
════════════════════════════════════════════════════════════════ */

/* Container card for a data table (white, hairline border, soft shadow). */
export const tableCardStyle = {
  background: "#fff",
  border: "1px solid #e6eaf0",
  borderRadius: 8,
  boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
  overflow: "hidden",
};

/* Header-row background. */
export const tableHeadRowStyle = { background: "#f8fafc" };

/* Header cell. Pass align "left" | "right" | "center". */
export function tableHeadCellStyle(align = "left") {
  return {
    padding: "13px 18px",
    textAlign: align,
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottom: "1px solid #e6eaf0",
    whiteSpace: "nowrap",
  };
}

/* Body-cell baseline — 56px rows via vertical padding, hairline divider. */
export function tableCellStyle(align = "left") {
  return {
    padding: "16px 18px",
    textAlign: align,
    fontSize: 13.5,
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };
}

/* Hover handlers for a body row (subtle #f8fafc tint). */
export const rowHover = {
  onMouseEnter: (e) => { e.currentTarget.style.background = "#f8fafc"; },
  onMouseLeave: (e) => { e.currentTarget.style.background = ""; },
};
