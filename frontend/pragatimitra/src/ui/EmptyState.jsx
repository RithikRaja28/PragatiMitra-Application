import React from "react";
import { color, radius, font } from "./tokens";

/** EmptyState — icon, title, supporting text, optional action. */
export default function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "56px 24px", fontFamily: font.family }}>
      <div style={{ width: 56, height: 56, borderRadius: radius.lg, marginBottom: 16, background: color.hover, border: `1px solid ${color.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: color.muted }}>
        {icon}
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color.text, marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: color.muted, maxWidth: 380, lineHeight: 1.6, marginBottom: action ? 18 : 0 }}>{description}</div>}
      {action}
    </div>
  );
}
