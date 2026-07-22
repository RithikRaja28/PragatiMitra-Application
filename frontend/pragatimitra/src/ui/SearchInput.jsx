import React from "react";
import { color, radius, size, font } from "./tokens";

/**
 * SearchInput — the SINGLE search field used across the app.
 *
 * Leading magnifier icon, 40px tall (matches Button/Select height), hairline
 * border, accent focus ring, consistent placeholder style. Controlled via
 * value/onChange — onChange receives the raw string (not the event) for
 * convenience; existing `setX(e.target.value)` callers can pass `setX` directly.
 */
const SearchInput = React.forwardRef(function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  width = 280,
  style,
  ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ position: "relative", width, maxWidth: "100%", flex: "0 1 auto", ...style }}>
      <span
        style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          display: "flex", color: color.muted, pointerEvents: "none",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          height: size.control,
          padding: "0 12px 0 36px",
          border: `1px solid ${focused ? color.primary : color.borderStrong}`,
          borderRadius: radius.lg,
          fontSize: 13,
          fontFamily: font.family,
          color: color.text,
          background: color.surface,
          outline: "none",
          boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
          transition: "border-color .15s, box-shadow .15s",
          boxSizing: "border-box",
        }}
        {...rest}
      />
    </div>
  );
});

export default SearchInput;
