import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/* ════════════════════════════════════════════════════════════════
   Shared design-system primitives — one source of truth for
   status badges and cards across the whole app.
════════════════════════════════════════════════════════════════ */

/* ── Status badge ──────────────────────────────────────────────
   Tones map to the global status colour system. */
const BADGE_TONES = {
  active:   { bg: "#dcfce7", color: "#16a34a", dot: "#16a34a" },
  inactive: { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
  locked:   { bg: "#fee2e2", color: "#dc2626", dot: "#dc2626" },
  open:     { bg: "#dcfce7", color: "#16a34a", dot: "#16a34a" },
  expired:  { bg: "#fee2e2", color: "#dc2626", dot: "#dc2626" },
  shared:   { bg: "#e0f2fe", color: "#0284c7", dot: "#0284c7" },
  private:  { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
  warning:  { bg: "#fef3c7", color: "#b45309", dot: "#d97706" },
  neutral:  { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
};

export function StatusBadge({ tone = "neutral", children, dot = true, icon, style }) {
  const c = BADGE_TONES[tone] || BADGE_TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 11px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon
        ? <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>
        : dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />}
      {children}
    </span>
  );
}

/* ── Card ──────────────────────────────────────────────────────
   White surface, hairline border, soft shadow, 12px radius. */
export function Card({ children, style, padding, ...rest }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6eaf0",
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
        ...(padding != null ? { padding } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Select — the standard dropdown for the whole app.

   A CUSTOM dropdown (not a native <select>) so the open menu and its
   values can be fully styled: rounded popup, soft shadow, hover
   highlight and a selected-row tick. The closed trigger is a 40px
   pill with a hairline border, accent focus ring and chevron.

   Drop-in usage — same as a native select; it accepts <option>
   children and reports changes as { target: { value } } so existing
   `onChange={e => setX(e.target.value)}` handlers keep working:

     <Select value={v} onChange={e => setV(e.target.value)}>
       <option value="">— All —</option>
       <option value="a">Alpha</option>
     </Select>

   Props:
     hasError   → red border for validation failures
     disabled   → muted, non-interactive
     fullWidth  → defaults true; set false for inline/auto-width filters
                  (pair with style={{ minWidth: … }})
     style      → merged onto the trigger (size/width overrides)
════════════════════════════════════════════════════════════════ */
function SelectChevron({ color, open }) {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true"
      style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}>
      <path d="M1 1.5l5 5 5-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SelectTick({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ACCENT = "#2563eb";

const MENU_GAP = 6;
const MENU_MARGIN = 8;
const MENU_MAX_HEIGHT = 320;

export function Select({
  value,
  onChange,
  children,
  hasError = false,
  disabled = false,
  fullWidth = true,
  style,
}) {
  const [open, setOpen]       = useState(false);
  const [hoverIdx, setHover]  = useState(-1);
  const [coords, setCoords]   = useState(null); // { left, top, width, placement }
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  /* Flatten <option> children into a plain list we can render ourselves. */
  const opts = [];
  React.Children.forEach(children, (child) => {
    if (!child || !child.props) return;
    opts.push({
      value:    child.props.value,
      label:    child.props.children,
      disabled: !!child.props.disabled,
    });
  });

  const selected = opts.find((o) => String(o.value) === String(value)) || null;

  /* Position the portaled menu against the trigger — viewport-aware so it's never
     clipped by a scrollable/overflow:hidden ancestor (modals, form panels, …) and
     flips above the trigger when there isn't room below. */
  const place = useCallback(() => {
    const trigger = wrapRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const menuH = Math.min(menuRef.current?.offsetHeight || 0, MENU_MAX_HEIGHT) || 0;
    const spaceBelow = vh - r.bottom;
    const openUp = spaceBelow < menuH + MENU_GAP + MENU_MARGIN && r.top > spaceBelow;

    let left = r.left;
    left = Math.max(MENU_MARGIN, Math.min(left, vw - r.width - MENU_MARGIN));
    const top = openUp ? r.top - MENU_GAP - menuH : r.bottom + MENU_GAP;
    setCoords({ left, top, width: r.width, placement: openUp ? "up" : "down" });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  /* Close on outside click / Escape; reposition on scroll/resize while open. */
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  const pick = (val) => { onChange?.({ target: { value: val } }); setOpen(false); };

  const move = (dir) => {
    if (!open) { setOpen(true); return; }
    let i = hoverIdx;
    for (let n = 0; n < opts.length; n++) {
      i = (i + dir + opts.length) % opts.length;
      if (!opts[i].disabled) { setHover(i); break; }
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "ArrowDown")      { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && hoverIdx >= 0 && !opts[hoverIdx]?.disabled) pick(opts[hoverIdx].value);
      else setOpen((o) => !o);
    }
  };

  const borderColor = hasError ? "#f87171" : open ? ACCENT : "#cbd5e1";

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: fullWidth ? "block" : "inline-block",
        width: fullWidth ? "100%" : "auto",
      }}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        style={{
          width: fullWidth ? "100%" : "auto",
          height: 40,
          padding: "0 12px 0 14px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "inherit",
          color: disabled ? "#94a3b8" : selected ? "#1e293b" : "#94a3b8",
          background: disabled ? "#f8fafc" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          boxSizing: "border-box",
          boxShadow: open && !hasError ? `0 0 0 3px rgba(37,99,235,0.12)` : "none",
          transition: "border-color .15s, box-shadow .15s",
          ...style,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : ""}
        </span>
        <SelectChevron color={disabled ? "#cbd5e1" : "#64748b"} open={open} />
      </button>

      {/* Menu — portaled to <body> so it's never clipped by a scrollable/overflow
          ancestor (modals, form panels, …); position is computed in `place()`. */}
      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="ui-scroll"
          style={{
            position: "fixed",
            left: coords?.left ?? -9999,
            top: coords?.top ?? -9999,
            width: coords?.width,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)",
            padding: 6,
            zIndex: 9000,
            maxHeight: MENU_MAX_HEIGHT,
            overflowY: "auto",
            visibility: coords ? "visible" : "hidden",
            // Portaled straight to <body>, outside the app tree that normally
            // supplies this via inheritance — set it explicitly or the menu
            // silently falls back to the browser's default font.
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {opts.map((o, i) => {
            const isSel = String(o.value) === String(value);
            const isHover = i === hoverIdx;
            return (
              <div
                key={`${o.value}-${i}`}
                role="option"
                aria-selected={isSel}
                onClick={() => !o.disabled && pick(o.value)}
                onMouseEnter={() => setHover(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: isSel ? 600 : 500,
                  lineHeight: 1.3,
                  color: o.disabled ? "#cbd5e1" : isSel ? ACCENT : "#334155",
                  background: o.disabled ? "transparent" : isSel ? "rgba(37,99,235,0.08)" : isHover ? "#f1f5f9" : "transparent",
                  cursor: o.disabled ? "not-allowed" : "pointer",
                  transition: "background .1s",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {isSel && <SelectTick color={ACCENT} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Enterprise data-table primitives — one consistent shell, header
   and row styling for every list table across the app.
════════════════════════════════════════════════════════════════ */

/* Container card for a data table (white, hairline border, soft shadow). */
export const tableCardStyle = {
  background: "#fff",
  border: "1px solid #e6eaf0",
  borderRadius: 8,
  boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
  overflow: "hidden",
};

/* Header-row background. */
export const tableHeadRowStyle = { background: "#f8fafc" };

/* Header cell. Pass align "left" | "right" | "center". */
export function tableHeadCellStyle(align = "left") {
  return {
    padding: "13px 18px",
    textAlign: align,
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottom: "1px solid #e6eaf0",
    whiteSpace: "nowrap",
  };
}

/* Body-cell baseline — 56px rows via vertical padding, hairline divider. */
export function tableCellStyle(align = "left") {
  return {
    padding: "16px 18px",
    textAlign: align,
    fontSize: 13.5,
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };
}

/* Hover handlers for a body row (subtle #f8fafc tint). */
export const rowHover = {
  onMouseEnter: (e) => { e.currentTarget.style.background = "#f8fafc"; },
  onMouseLeave: (e) => { e.currentTarget.style.background = ""; },
};
