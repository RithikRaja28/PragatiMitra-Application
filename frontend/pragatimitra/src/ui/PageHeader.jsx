import React from "react";
import { color, space, font } from "./tokens";

/** PageHeader — breadcrumb › title › description on the left, actions on the
 *  right. Always top-left aligned, never centered. */
function Crumb({ item, last }) {
  const label   = typeof item === "string" ? item : item.label;
  const onClick = typeof item === "string" ? undefined : item.onClick;
  const base    = last ? color.text : color.muted;
  if (onClick) {
    return (
      <button
        type="button" onClick={onClick} className="ui-focusable"
        style={{ background: "none", border: "none", padding: 0, fontSize: 12.5,
                 fontFamily: "inherit", cursor: "pointer", color: base, fontWeight: last ? 600 : 500 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = color.primary)}
        onMouseLeave={(e) => (e.currentTarget.style.color = base)}
      >{label}</button>
    );
  }
  return <span style={{ color: base, fontWeight: last ? 600 : 500 }}>{label}</span>;
}

export default function PageHeader({ breadcrumb = [], title, description, actions }) {
  return (
    <div style={{ marginBottom: space["2xl"], fontFamily: font.family }}>
      {breadcrumb.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 10, flexWrap: "wrap" }}>
          {breadcrumb.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: color.borderStrong }}>›</span>}
              <Crumb item={item} last={i === breadcrumb.length - 1} />
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: color.text, letterSpacing: "-0.4px", margin: "0 0 6px" }}>
            {title}
          </h1>
          {description != null && description !== "" && (
            <p style={{ fontSize: 13.5, color: color.muted, margin: 0, maxWidth: 720, lineHeight: 1.5 }}>{description}</p>
          )}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
