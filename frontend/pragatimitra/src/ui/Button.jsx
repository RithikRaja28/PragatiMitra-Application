import React from "react";
import { Loader2 } from "lucide-react";
import { color, radius, size, font } from "./tokens";

/**
 * Button — one shared button for the whole Institution Admin surface.
 * 40px tall, 10px radius, icon-left, no emoji. All variants share the height
 * so rows never look ragged.
 *
 * variants: primary | secondary | danger | ghost | outlineDanger | outlineSuccess
 * iconOnly: square 40x40 button (Export / Manage / View / Lock actions)
 */
const VARIANTS = {
  primary:        { bg: color.primary,  fg: "#fff",         bd: color.primary,        hover: color.primaryHover },
  secondary:      { bg: "#fff",         fg: color.text,     bd: color.border,         hover: color.hover },
  danger:         { bg: color.danger,   fg: "#fff",         bd: color.danger,         hover: color.dangerHover },
  ghost:          { bg: "transparent",  fg: color.muted,    bd: "transparent",        hover: color.hover },
  outlineDanger:  { bg: "#fff",         fg: color.danger,   bd: "#FCA5A5",            hover: "#FEF2F2" },
  outlineSuccess: { bg: "#fff",         fg: color.success,  bd: "#86EFAC",            hover: "#F0FDF4" },
};

const Button = React.forwardRef(function Button(
  { variant = "secondary", icon, iconRight, iconOnly = false, loading = false,
    disabled = false, children, fullWidth = false, style, className = "", ...rest },
  ref
) {
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      className={`ui-btn ${className}`.trim()}
      disabled={isDisabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: iconOnly ? 0 : 8,
        height: size.control, minHeight: size.control,
        width: iconOnly ? size.control : (fullWidth ? "100%" : undefined),
        padding: iconOnly ? 0 : "0 16px",
        borderRadius: radius.md,
        border: `1px solid ${v.bd}`,
        background: isDisabled ? "#fff" : v.bg,
        color: isDisabled ? "#9CA3AF" : v.fg,
        fontFamily: font.family, fontSize: 13.5, fontWeight: 600,
        lineHeight: 1, whiteSpace: "nowrap", cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.65 : 1,
        transition: "background .15s, border-color .15s, color .15s",
        ...style,
      }}
      onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.background = v.hover; }}
      onMouseLeave={(e) => { if (!isDisabled) e.currentTarget.style.background = v.bg; }}
      {...rest}
    >
      {loading
        ? <Loader2 size={18} strokeWidth={1.75} style={{ animation: "spin 0.7s linear infinite" }} />
        : icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {!iconOnly && children}
      {!iconOnly && iconRight && <span style={{ display: "inline-flex" }}>{iconRight}</span>}
    </button>
  );
});

export default Button;
