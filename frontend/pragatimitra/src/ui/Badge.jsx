import React from "react";
import { radius } from "./tokens";

/** Badge — status pill mapped to the global status color system. */
const TONES = {
  success: { bg: "#DCFCE7", fg: "#15803D", dot: "#16A34A" },
  neutral: { bg: "#F3F4F6", fg: "#4B5563", dot: "#9CA3AF" },
  danger:  { bg: "#FEE2E2", fg: "#B91C1C", dot: "#DC2626" },
  warning: { bg: "#FEF3C7", fg: "#B45309", dot: "#F59E0B" },
  info:    { bg: "#E0F2FE", fg: "#0369A1", dot: "#0284C7" },
  primary: { bg: "#EFF4FF", fg: "#1D4ED8", dot: "#2563EB" },
};

export default function Badge({ tone = "neutral", icon, dot = true, children, style }) {
  const c = TONES[tone] || TONES.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: radius.pill,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
      background: c.bg, color: c.fg, whiteSpace: "nowrap", ...style,
    }}>
      {icon
        ? <span style={{ display: "inline-flex" }}>{icon}</span>
        : dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />}
      {children}
    </span>
  );
}
