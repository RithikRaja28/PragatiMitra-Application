import React from "react";
import { color } from "../../../../ui";

/**
 * BuilderHeader — the ONE shared full-width app sub-header bar for the report
 * builder sub-views (Structure / Dashboard / Assign / Compile / Review).
 *
 * Keeps the builder's intentional full-bleed layout (this is NOT the centered
 * PageContainer body) while giving every sub-view an identical bar:
 *   [ ← Back | divider ]  breadcrumb › … + Title (+ subtitle)        [ right ]
 *
 * Props
 *   onBack      optional — when set, renders the Back button + divider
 *   breadcrumb  array of strings (last one is highlighted), e.g. ["Report Builder", "Compile"]
 *   title       page title
 *   subtitle    optional node under the title (e.g. "Annual · 2026 · <StatusBadge/>")
 *   right       optional node pinned to the right (actions / status chip)
 */
export default function BuilderHeader({ onBack, breadcrumb = [], title, subtitle, right }) {
  return (
    <header
      style={{
        background: color.surface,
        borderBottom: `1px solid ${color.border}`,
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {onBack && (
        <>
          <BackButton onClick={onBack} />
          <div style={{ width: 1, height: 28, background: color.border, flexShrink: 0 }} />
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1, flexWrap: "wrap" }}>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ fontSize: 11, color: "#d1d5db" }}>›</span>}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                    color: i === breadcrumb.length - 1 ? color.primary : color.muted,
                  }}
                >
                  {b}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        {title != null && (
          <div style={{ fontSize: 17, fontWeight: 700, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
        )}
        {subtitle != null && subtitle !== "" && (
          <div style={{ fontSize: 12, color: color.muted, marginTop: 1 }}>{subtitle}</div>
        )}
      </div>

      {right && <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>{right}</div>}
    </header>
  );
}

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-focusable"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 14px", borderRadius: 8,
        border: "1.5px solid #e5e7eb", background: "#fff",
        fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.borderColor = "#d1d5db"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      Back
    </button>
  );
}
