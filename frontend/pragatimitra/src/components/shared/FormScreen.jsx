import React from "react";
import { S } from "./formUtils";

/**
 * FormScreen — full-page create/edit form that replaces the content area.
 *
 * Renders a back-nav breadcrumb, a card with a branded header, a scrollable
 * form body (children), a global error box, and a Cancel / Submit footer.
 * No overlay or portal — the parent switches between the list view and this
 * component by conditionally rendering one or the other.
 *
 * Props:
 *   pageTitle    – shown in the back breadcrumb, e.g. "Departments"
 *   formTitle    – card heading, e.g. "New Department"
 *   formSubtitle – card sub-heading (optional)
 *   icon         – emoji or ReactNode shown in the card header
 *   iconBg       – background colour for the icon circle (default #eff6ff)
 *   onBack       – called when Back / Cancel is clicked
 *   onSubmit     – form's onSubmit handler (receives the event)
 *   submitting   – disables controls while the API call is in flight
 *   submitLabel  – label on the submit button (default "Save")
 *   submitError  – global error string shown above the footer
 *   children     – form fields rendered inside the card body
 */
export default function FormScreen({
  pageTitle,
  formTitle,
  formSubtitle,
  icon,
  iconBg = "#eff6ff",
  onBack,
  onSubmit,
  submitting,
  submitLabel = "Save",
  submitError,
  children,
}) {
  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        minHeight: "100%",
      }}
    >
      {/* ── Back navigation ── */}
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          color: "#2563eb",
          cursor: submitting ? "not-allowed" : "pointer",
          padding: 0,
          marginBottom: 24,
          opacity: submitting ? 0.5 : 1,
        }}
      >
        ← Back to {pageTitle}
      </button>

      {/* ── Form card ── */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.07)",
          width: "100%",
          maxWidth: "100%",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: "24px 28px 20px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {icon && (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
              {formTitle}
            </div>
            {formSubtitle && (
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>
                {formSubtitle}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} noValidate>
          <div
            style={{
              padding: "28px 28px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {children}

            {submitError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#b91c1c",
                }}
              >
                {submitError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "20px 28px 24px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #f1f5f9",
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              style={S.btnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={S.btnPrimary(submitting)}
            >
              {submitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
