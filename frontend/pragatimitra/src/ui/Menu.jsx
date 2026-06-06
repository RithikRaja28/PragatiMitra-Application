import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { color, radius, shadow, font, z } from "./tokens";

/**
 * Dropdown — viewport-aware menu portaled to <body>. Fixes the recurring
 * "last-row menu opens off-screen / gets clipped" bug:
 *   • portaled → never clipped by overflow:hidden / transformed ancestors
 *   • measures the trigger + menu and flips UP when there isn't room below
 *   • shifts horizontally to stay inside the viewport
 *   • closes on click-away, Esc, scroll, resize
 *
 * Usage:
 *   <Dropdown align="right" button={({ open }) => <Button ... />}>
 *     <MenuItem icon={..} onClick={..}>Export CSV</MenuItem>
 *   </Dropdown>
 */
const GAP = 6;
const MARGIN = 8;

export function Dropdown({ button, children, align = "right", width = 200, menuMaxHeight = 320 }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null); // { left, top, placement }
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const menuH = Math.min(menuRef.current?.offsetHeight || 0, menuMaxHeight) || 0;
    const spaceBelow = vh - r.bottom;
    const openUp = spaceBelow < menuH + GAP + MARGIN && r.top > spaceBelow;

    let left = align === "right" ? r.right - width : r.left;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
    const top = openUp ? r.top - GAP - menuH : r.bottom + GAP;
    setCoords({ left, top, placement: openUp ? "up" : "down" });
  }, [align, width, menuMaxHeight]);

  // Position after the menu mounts (so we can measure its height), then on
  // scroll/resize while open.
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place]);

  return (
    <>
      <span ref={triggerRef} style={{ display: "inline-flex" }}>
        {typeof button === "function"
          ? button({ open, toggle: () => setOpen((o) => !o) })
          : <span onClick={() => setOpen((o) => !o)}>{button}</span>}
      </span>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="ui-scroll"
          style={{
            position: "fixed", left: coords?.left ?? -9999, top: coords?.top ?? -9999,
            width, maxHeight: menuMaxHeight, overflowY: "auto", zIndex: z.dropdown,
            background: color.surface, border: `1px solid ${color.border}`,
            borderRadius: radius.md, boxShadow: shadow.pop, padding: 6,
            fontFamily: font.family, animation: "ui-menu-in .12s ease",
            visibility: coords ? "visible" : "hidden",
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
}

export function MenuItem({ icon, children, onClick, danger = false, disabled = false }) {
  return (
    <button
      role="menuitem" disabled={disabled} className="ui-menu-item"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 12px", borderRadius: radius.sm, border: "none",
        background: "transparent", textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13, fontWeight: 500, fontFamily: font.family,
        color: disabled ? "#9CA3AF" : danger ? color.danger : color.text,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? "#FEF2F2" : color.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon && <span style={{ display: "inline-flex", color: disabled ? "#9CA3AF" : danger ? color.danger : color.muted }}>{icon}</span>}
      <span className="ui-ellipsis">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }) {
  return (
    <div style={{ padding: "6px 12px 4px", fontSize: 10.5, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}
