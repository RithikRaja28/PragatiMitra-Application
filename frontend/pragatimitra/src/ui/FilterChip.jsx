import React from "react";
import { color, radius, font } from "./tokens";

/**
 * FilterChip — the SINGLE filter pill used everywhere (logs, reports, forms,
 * dashboards, assignments). One padding, one radius, one selected state, one
 * count-badge style.
 *
 * Props
 *   active  selected state (accent border + soft fill)
 *   icon    optional leading icon node
 *   count   optional trailing count badge (number)
 */
export default function FilterChip({
  active = false,
  icon,
  count,
  children,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="ui-focusable"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 34,
        padding: "0 12px",
        border: `1px solid ${active ? color.primary : color.border}`,
        borderRadius: radius.pill,
        background: active ? color.primarySoft : hover ? color.hover : color.surface,
        color: active ? color.primary : color.text,
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        fontFamily: font.family,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background .12s, border-color .12s, color .12s",
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
      {count != null && (
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 18, height: 18, padding: "0 5px", borderRadius: radius.pill,
            fontSize: 10.5, fontWeight: 700,
            background: active ? color.primary : color.border,
            color: active ? "#fff" : color.muted,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
