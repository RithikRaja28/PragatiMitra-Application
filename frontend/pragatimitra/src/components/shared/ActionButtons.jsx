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

const VARIANTS = {
  /* white / outline neutral — Edit, View, Manage, Import, Export */
  default: { border: "1px solid #cbd5e1", background: "#fff", color: "#334155" },
  /* solid cyan — Create / primary actions */
  primary: { border: "none", background: "#2563eb", color: "#fff" },
  accent:  { border: "none", background: "#2563eb", color: "#fff" },
  /* outline green — Activate / Unlock */
  success: { border: "1px solid #22c55e", background: "#fff", color: "#16a34a" },
  /* outline red — Deactivate / Lock */
  danger:  { border: "1px solid #ef4444", background: "#fff", color: "#dc2626" },
  /* solid red — Delete */
  delete:  { border: "none", background: "#ef4444", color: "#fff" },
};

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
  const v = VARIANTS[variant] || VARIANTS.default;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={iconOnly && typeof title === "string" ? title : undefined}
      style={{
        height: 34,
        minHeight: 34,
        width: iconOnly ? 34 : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: iconOnly ? 0 : 6,
        whiteSpace: "nowrap",
        padding: iconOnly ? 0 : "0 14px",
        borderRadius: 6,
        fontSize: 12.5,
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
