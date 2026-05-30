import React from "react";

/**
 * Standard action buttons used across the app (table rows, headers, modals).
 *
 * Every button is a fixed 36px tall, inline-flex, vertically + horizontally
 * centered, with icon + label on the same baseline — so any group of them
 * lines up perfectly on one horizontal row.
 *
 * <ActionButtonGroup>
 *   <ActionButton icon={<IconEdit />} onClick={…}>Edit</ActionButton>
 *   <ActionButton variant="danger" onClick={…}>Deactivate</ActionButton>
 * </ActionButtonGroup>
 */

/* Each variant carries its resting background + the hover background, so every
   action button (icon-only or labelled) gets a consistent hover treatment. */
const VARIANTS = {
  /* white / outline neutral — Edit, View, Manage, Import, Export */
  default: { border: "1px solid #cbd5e1", background: "#fff", color: "#334155", hover: "#f8fafc" },
  /* solid blue — Create / primary actions */
  primary: { border: "none", background: "#2563eb", color: "#fff", hover: "#1d4ed8" },
  accent:  { border: "none", background: "#2563eb", color: "#fff", hover: "#1d4ed8" },
  /* outline green — Activate / Unlock */
  success: { border: "1px solid #22c55e", background: "#fff", color: "#16a34a", hover: "#f0fdf4" },
  /* outline red — Deactivate / Lock */
  danger:  { border: "1px solid #ef4444", background: "#fff", color: "#dc2626", hover: "#fef2f2" },
  /* solid red — Delete */
  delete:  { border: "none", background: "#ef4444", color: "#fff", hover: "#dc2626" },
};

/* Standard enterprise action-button geometry.
   Icon-only utility actions are a fixed 40×40 square; labelled actions keep the
   same 40px height for perfect row alignment. */
export function ActionButton({
  children,
  icon,
  variant = "default",
  iconOnly = false,
  onClick,
  disabled = false,
  title,
  type = "button",
  style,
}) {
  const { hover, ...v } = VARIANTS[variant] || VARIANTS.default;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={iconOnly && typeof title === "string" ? title : undefined}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = v.background; }}
      style={{
        height: 40,
        minHeight: 40,
        width: iconOnly ? 40 : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: iconOnly ? 0 : 7,
        whiteSpace: "nowrap",
        padding: iconOnly ? 0 : "0 14px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "inherit",
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background .15s, border-color .15s, opacity .15s",
        ...v,
        ...style,
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          {icon}
        </span>
      )}
      {!iconOnly && children}
    </button>
  );
}

export function ActionButtonGroup({ children, justify = "flex-start", style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        gap: 8,
        flexWrap: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default ActionButtonGroup;
