import React from "react";
import { color, radius, size, font } from "./tokens";

/**
 * src/ui/Field — standard form-field primitives for the design system.
 *
 * These are styled drop-in wrappers around the native <input>/<select>/<textarea>
 * elements: they forward refs and spread all props (value, onChange, type,
 * placeholder, disabled, …) straight through, so swapping a raw element for one
 * of these changes ONLY presentation — never behavior.
 *
 *   <FormField label="Name" required error={err}>
 *     <Input value={v} onChange={…} />
 *   </FormField>
 */

const baseField = {
  width: "100%",
  height: size.input,                 // 44
  borderRadius: radius.md,            // 10
  border: `1px solid ${color.border}`,
  background: "#fff",
  padding: "0 14px",
  fontFamily: font.family,
  fontSize: 14,
  color: color.text,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .15s, box-shadow .15s",
};

function ringOn(e) {
  e.target.style.borderColor = color.primary;
  e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.14)";
}
function ringOff(e) {
  e.target.style.borderColor = color.border;
  e.target.style.boxShadow = "none";
}

export const Input = React.forwardRef(function Input(
  { style, invalid = false, onFocus, onBlur, disabled, ...rest }, ref
) {
  return (
    <input
      ref={ref}
      className="ui-field"
      disabled={disabled}
      style={{
        ...baseField,
        ...(invalid ? { borderColor: color.danger } : {}),
        ...(disabled ? { background: color.hover, color: color.muted, cursor: "not-allowed" } : {}),
        ...style,
      }}
      onFocus={(e) => { if (!disabled) ringOn(e); onFocus?.(e); }}
      onBlur={(e) => { ringOff(e); onBlur?.(e); }}
      {...rest}
    />
  );
});

export const Textarea = React.forwardRef(function Textarea(
  { style, invalid = false, rows = 4, onFocus, onBlur, disabled, ...rest }, ref
) {
  return (
    <textarea
      ref={ref}
      className="ui-field ui-scroll"
      rows={rows}
      disabled={disabled}
      style={{
        ...baseField,
        height: "auto",
        minHeight: 96,
        padding: "12px 14px",
        lineHeight: 1.55,
        resize: "vertical",
        ...(invalid ? { borderColor: color.danger } : {}),
        ...(disabled ? { background: color.hover, color: color.muted, cursor: "not-allowed" } : {}),
        ...style,
      }}
      onFocus={(e) => { if (!disabled) ringOn(e); onFocus?.(e); }}
      onBlur={(e) => { ringOff(e); onBlur?.(e); }}
      {...rest}
    />
  );
});

export const Select = React.forwardRef(function Select(
  { style, invalid = false, onFocus, onBlur, disabled, children, ...rest }, ref
) {
  return (
    <select
      ref={ref}
      className="ui-field"
      disabled={disabled}
      style={{
        ...baseField,
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        paddingRight: 38,
        cursor: disabled ? "not-allowed" : "pointer",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        ...(invalid ? { borderColor: color.danger } : {}),
        ...(disabled ? { background: color.hover, color: color.muted } : {}),
        ...style,
      }}
      onFocus={(e) => { if (!disabled) ringOn(e); onFocus?.(e); }}
      onBlur={(e) => { ringOff(e); onBlur?.(e); }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function FieldLabel({ children, required = false, htmlFor, style }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block", fontSize: 13, fontWeight: 600, color: color.text,
        marginBottom: 7, fontFamily: font.family, ...style,
      }}
    >
      {children}
      {required && <span style={{ color: color.danger, marginLeft: 3 }}>*</span>}
    </label>
  );
}

export function FormField({ label, required = false, htmlFor, error, helper, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      {label && <FieldLabel htmlFor={htmlFor} required={required}>{label}</FieldLabel>}
      {children}
      {error
        ? <div style={{ fontSize: 12, color: color.danger, marginTop: 5, fontFamily: font.family }}>{error}</div>
        : helper
          ? <div style={{ fontSize: 12, color: color.muted, marginTop: 5, fontFamily: font.family }}>{helper}</div>
          : null}
    </div>
  );
}
