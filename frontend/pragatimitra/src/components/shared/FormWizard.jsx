import React from "react";
import { Check } from "lucide-react";
import { S } from "./formUtils";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";

/**
 * FormWizard — full-page, multi-step create flow (Zoho / Salesforce style).
 *
 * Renders a back link, a centered card with a branded header, a numbered
 * step progress indicator, the active step's body, and a Cancel / Back /
 * Next / Submit footer. The parent owns all form state, validation and the
 * submit handler — the wizard only orchestrates step navigation and layout.
 *
 * Props:
 *   pageTitle    – back-link target, e.g. "Institutions"
 *   formTitle    – card heading, e.g. "Create Institution"
 *   formSubtitle – card sub-heading (optional)
 *   icon         – ReactNode shown in the header icon square
 *   iconBg       – background colour for the icon square (default #eff6ff)
 *   steps        – array of step labels (strings)
 *   step         – current step index (0-based)
 *   onStepChange – (nextIndex) => void
 *   onBack       – called by Cancel / back link
 *   onSubmit     – form submit handler (fires on the last step's submit)
 *   submitting   – disables controls while the API call is in flight
 *   submitLabel  – label on the final submit button
 *   submitError  – global error string shown above the footer
 *   canAdvance   – optional (fromStep) => boolean gate run before advancing
 *   children     – (step) => ReactNode, renders the active step's fields
 */
export default function FormWizard({
  pageTitle,
  formTitle,
  formSubtitle,
  icon,
  iconBg = "#eff6ff",
  steps = [],
  step,
  onStepChange,
  onBack,
  onSubmit,
  submitting,
  submitLabel = "Create",
  submitError,
  canAdvance,
  children,
}) {
  const { lang } = useLanguage();
  const isLast = step >= steps.length - 1;

  function goNext() {
    if (canAdvance && canAdvance(step) === false) return;
    onStepChange(Math.min(step + 1, steps.length - 1));
  }
  function goPrev() {
    onStepChange(Math.max(step - 1, 0));
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {/* Back navigation */}
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", fontSize: 13, fontWeight: 600,
          color: "#2563eb", cursor: submitting ? "not-allowed" : "pointer",
          padding: 0, marginBottom: 24, opacity: submitting ? 0.5 : 1,
        }}
      >
        {t("← Back to", lang)} {pageTitle}
      </button>

      {/* Centered card */}
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "22px 28px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 14 }}>
            {icon && (
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: iconBg,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{formTitle}</div>
              {formSubtitle && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>{formSubtitle}</div>}
            </div>
          </div>

          {/* Step progress indicator */}
          <Stepper steps={steps} current={step} />

          {/* Body + footer */}
          <form onSubmit={onSubmit} noValidate>
            <div style={{ padding: "26px 28px 8px", display: "flex", flexDirection: "column", gap: 18 }}>
              {children(step)}

              {submitError && (
                <div style={{
                  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                  padding: "10px 14px", fontSize: 13, color: "#b91c1c",
                }}>
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "18px 28px 22px", marginTop: 14, borderTop: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
            }}>
              <button type="button" onClick={onBack} disabled={submitting} style={S.btnGhost}>
                {t("Cancel", lang)}
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                {step > 0 && (
                  <button type="button" onClick={goPrev} disabled={submitting} style={S.btnGhost}>
                    {t("Back", lang)}
                  </button>
                )}
                {isLast ? (
                  <button type="submit" disabled={submitting} style={S.btnPrimary(submitting)}>
                    {submitting ? t("Saving…", lang) : submitLabel}
                  </button>
                ) : (
                  <button type="button" onClick={goNext} disabled={submitting} style={S.btnPrimary(false)}>
                    {t("Next", lang)}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Numbered step progress indicator ── */
function Stepper({ steps, current }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start",
      padding: "20px 28px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
    }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 96 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: done ? "#2563eb" : active ? "#2563eb" : "#fff",
                color: done || active ? "#fff" : "#94a3b8",
                border: done || active ? "none" : "1.5px solid #cbd5e1",
                boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.15)" : "none",
                transition: "all .15s",
              }}>
                {done ? <Check size={16} strokeWidth={3} /> : i + 1}
              </div>
              <div style={{
                fontSize: 11.5, fontWeight: active ? 700 : 600,
                color: active ? "#1d4ed8" : done ? "#1e293b" : "#94a3b8",
                textAlign: "center", whiteSpace: "nowrap",
                letterSpacing: 0.1,
              }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < current ? "#2563eb" : "#e2e8f0", margin: "16px 6px 0", borderRadius: 2, transition: "background .2s" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Review-step helpers (used on the final step) ── */
export function ReviewGroup({ title, children }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{
        background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 700,
        color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9",
      }}>
        {title}
      </div>
      <div style={{ padding: "6px 16px" }}>{children}</div>
    </div>
  );
}

export function ReviewItem({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: "1px solid #f8fafc" }}>
      <span style={{ fontSize: 12.5, color: "#94a3b8", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", textAlign: "right", wordBreak: "break-word" }}>
        {value || <span style={{ color: "#cbd5e1", fontWeight: 400 }}>—</span>}
      </span>
    </div>
  );
}
