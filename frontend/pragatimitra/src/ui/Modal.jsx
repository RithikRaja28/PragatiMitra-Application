import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { color, radius, shadow, space, font, z } from "./tokens";

/**
 * Modal — always centered, portaled to <body> so it can never be clipped or
 * pushed off-screen by a transformed/overflow-hidden ancestor (the root cause
 * of the "modal opens at the bottom" bug). Backdrop blur, fade+scale in, Esc to
 * close, body scroll lock, internal scroll, sticky header + footer.
 *
 * Props: open, onClose, title, subtitle, icon, width(520-800), footer, children,
 *        closeOnBackdrop (default true), danger (header accent).
 */
export default function Modal({
  open, onClose, title, subtitle, icon, width = 560, footer, children,
  closeOnBackdrop = true, danger = false,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    // Lock background scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel for keyboard users
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: z.modal,
        background: "rgba(12,18,32,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: font.family,
        animation: "ui-overlay-in .14s ease",
      }}
    >
      <div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        style={{
          background: color.surface, borderRadius: radius.xl,
          width: "100%", maxWidth: Math.min(Math.max(width, 520), 800),
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          boxShadow: shadow.modal, overflow: "hidden", outline: "none",
          animation: "ui-modal-in .16s cubic-bezier(.2,.7,.3,1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || icon) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: `1px solid ${color.border}` }}>
            {icon && (
              <span style={{ display: "inline-flex", width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
                             background: danger ? "#FEF2F2" : color.primarySoft, color: danger ? color.danger : color.primary }}>
                {icon}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: color.text }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12.5, color: color.muted, marginTop: 2 }}>{subtitle}</div>}
            </div>
            <button
              onClick={onClose} aria-label="Close" className="ui-focusable"
              style={{ background: "none", border: "none", cursor: "pointer", color: color.muted, display: "inline-flex", padding: 6, borderRadius: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = color.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}

        <div className="ui-scroll" style={{ padding: space["2xl"], overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: `1px solid ${color.border}`, background: "#FAFBFC" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
