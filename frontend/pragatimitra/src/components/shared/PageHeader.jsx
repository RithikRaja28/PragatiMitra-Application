import React from "react";

/**
 * PageHeader — the standard top-left page header used across the
 * Institution and Department modules.
 *
 * It renders three stacked elements, always at the top-left of the
 * content area (never inside a card or form):
 *
 *   Breadcrumb      Home › Module › Page   (smaller, lighter)
 *   Page Title      bold primary heading
 *   Page Description muted gray supporting text
 *
 * An optional `actions` node is rendered at the top-right of the title row
 * (e.g. Refresh / Create buttons) so existing page controls are preserved.
 *
 * Props
 *   breadcrumb   Array of crumbs. Each crumb is either a string, or an
 *                object { label, onClick } for a clickable (navigation) crumb.
 *   title        Page title — string or React node.
 *   description  Supporting description — string or React node (optional).
 *   actions      React node rendered top-right of the title row (optional).
 */

const ACCENT = "#0891b2";

function Crumb({ item, last }) {
  const label = typeof item === "string" ? item : item.label;
  const onClick = typeof item === "string" ? undefined : item.onClick;
  const baseColor = last ? "#1e293b" : "#94a3b8";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: "none", border: "none", padding: 0,
          fontSize: 12, fontFamily: "inherit", cursor: "pointer",
          color: baseColor, fontWeight: last ? 600 : 400,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
        onMouseLeave={(e) => (e.currentTarget.style.color = baseColor)}
      >
        {label}
      </button>
    );
  }

  return (
    <span style={{ color: baseColor, fontWeight: last ? 600 : 400 }}>{label}</span>
  );
}

export default function PageHeader({ breadcrumb = [], title, description, actions }) {
  // Single root div so internal spacing (breadcrumb → title → description)
  // is controlled purely by margins and is never affected by a parent's
  // flex `gap`. The 24px gap below the description separates it from page
  // content. marginTop: 0 keeps the breadcrumb flush at the top-left.
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, marginBottom: 8, flexWrap: "wrap" }}>
        {breadcrumb.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: "#cbd5e1" }}>›</span>}
            <Crumb item={item} last={i === breadcrumb.length - 1} />
          </React.Fragment>
        ))}
      </div>

      {/* Title + description (+ optional right-side actions) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.4px", margin: "0 0 8px" }}>
            {title}
          </h1>
          {description != null && description !== "" && (
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
