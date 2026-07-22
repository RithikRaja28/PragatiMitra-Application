import React from "react";
import { color, radius, font } from "./tokens";

/**
 * ErrorState — the SINGLE way to render an error INSIDE the content area
 * (never raw red text floating on the page). Icon + title + supporting message
 * + optional retry action, on a soft danger surface. Mirrors EmptyState's
 * layout so error and empty screens share one shape.
 */
export default function ErrorState({
  title = "Something went wrong",
  description,
  action,
  style,
}) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        padding: "48px 24px", fontFamily: font.family, ...style,
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: radius.lg, marginBottom: 16,
          background: "#FEF2F2", border: "1px solid #FECACA",
          display: "flex", alignItems: "center", justifyContent: "center", color: color.danger,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color.text, marginBottom: 6 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: color.muted, maxWidth: 420, lineHeight: 1.6, marginBottom: action ? 18 : 0 }}>
          {description}
        </div>
      )}
      {action}
    </div>
  );
}
