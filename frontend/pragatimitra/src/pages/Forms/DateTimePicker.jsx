import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { color, font } from "../../ui";

/* ─────────────────────────────────────────────────────────────────────────
   Dependency-free, fully-styled date & time pickers. Replaces the native
   <input type="date|time"> controls (whose dropdown is browser/OS chrome and
   cannot be styled) with custom popovers that match the app's design tokens.

   The popover is rendered in a PORTAL with fixed positioning and auto-flips
   upward when there isn't room below — so it is never clipped by a scrollable /
   overflow-hidden ancestor (e.g. the Modal it lives in).
   Values are plain strings: date "YYYY-MM-DD", time "HH:MM" (24h).
───────────────────────────────────────────────────────────────────────── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n) => String(n).padStart(2, "0");

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseDateStr(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function prettyDate(s) {
  const d = parseDateStr(s);
  if (!d) return "";
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
function prettyTime(s) {
  if (!s) return "";
  const [h, m] = String(s).split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${pad(h12)}:${pad(m || 0)} ${ampm}`;
}

/* Inject hover/focus styling once (pseudo-selectors can't be inline). */
function usePickerCss() {
  useEffect(() => {
    const id = "pm-dtpicker-css";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      .pm-dt-trigger{width:100%;height:46px;display:flex;align-items:center;gap:10px;padding:0 12px;border:1.5px solid ${color.borderStrong};border-radius:10px;background:#fff;font-size:14px;font-weight:600;color:${color.text};cursor:pointer;box-sizing:border-box;font-family:${font.family};transition:border-color .15s ease,box-shadow .15s ease;text-align:left;}
      .pm-dt-trigger:hover{border-color:${color.primary};}
      .pm-dt-trigger.is-open{border-color:${color.primary};box-shadow:0 0 0 3px ${color.primarySoft};}
      .pm-dt-pop{background:#fff;border:1px solid ${color.border};border-radius:14px;box-shadow:0 12px 32px rgba(16,24,40,0.16);padding:14px;box-sizing:border-box;font-family:${font.family};}
      .pm-dt-nav{width:30px;height:30px;border-radius:8px;border:1px solid ${color.border};background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${color.text};transition:background .15s ease,border-color .15s ease;}
      .pm-dt-nav:hover{background:${color.hover};border-color:${color.borderStrong};}
      .pm-dt-day{width:36px;height:34px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:600;color:${color.text};cursor:pointer;font-family:inherit;transition:background .12s ease,color .12s ease;}
      .pm-dt-day:hover:not(:disabled):not(.is-selected){background:${color.primarySoft};color:${color.primary};}
      .pm-dt-day.is-today:not(.is-selected){box-shadow:inset 0 0 0 1.5px ${color.primary};color:${color.primary};}
      .pm-dt-day.is-selected{background:${color.primary};color:#fff;}
      .pm-dt-day:disabled{color:#cbd5e1;cursor:not-allowed;}
      .pm-dt-link{background:none;border:none;color:${color.primary};font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;padding:4px 6px;border-radius:6px;}
      .pm-dt-link:hover{background:${color.primarySoft};}
      .pm-dt-tcol{flex:1;max-height:200px;overflow-y:auto;border:1px solid ${color.border};border-radius:10px;padding:4px;}
      .pm-dt-tcell{width:100%;text-align:center;border:none;background:transparent;border-radius:7px;font-size:13px;font-weight:600;color:${color.text};cursor:pointer;padding:8px 0;font-family:inherit;transition:background .12s ease,color .12s ease;}
      .pm-dt-tcell:hover:not(.is-selected){background:${color.primarySoft};color:${color.primary};}
      .pm-dt-tcell.is-selected{background:${color.primary};color:#fff;}
    `;
    document.head.appendChild(el);
  }, []);
}

/* Portal-positioned popover: fixed to the viewport, anchored to the trigger,
   auto-flips up when short on space below, and clamps within the viewport. */
function Popover({ open, anchorRef, onClose, width, estHeight, align = "left", children }) {
  const popRef = useRef(null);
  const [style, setStyle] = useState(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const M = 6;
    const spaceBelow = window.innerHeight - r.bottom;
    const flipUp = spaceBelow < estHeight + 12 && r.top > spaceBelow;
    let left = align === "right" ? r.right - width : r.left;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    setStyle({
      position: "fixed", left, width, zIndex: 99999,
      ...(flipUp ? { top: r.top - M, transform: "translateY(-100%)" } : { top: r.bottom + M }),
    });
  }, [anchorRef, width, estHeight, align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open || !style) return null;
  return createPortal(
    <div ref={popRef} className="pm-dt-pop" style={style}>{children}</div>,
    document.body
  );
}

/* ── Date picker ─────────────────────────────────────────────────────── */
export function DateField({ value, min, onChange, placeholder = "Select date" }) {
  usePickerCss();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = parseDateStr(value);
  const minDate = parseDateStr(min);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const init = selected || today;
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });

  useEffect(() => {
    if (open) { const d = parseDateStr(value) || today; setView({ y: d.getFullYear(), m: d.getMonth() }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const stepMonth = (delta) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const pick = (day) => { onChange(toDateStr(new Date(view.y, view.m, day))); setOpen(false); };
  const isDisabled = (day) => minDate && new Date(view.y, view.m, day) < minDate;

  return (
    <>
      <button ref={anchorRef} type="button" className={`pm-dt-trigger${open ? " is-open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <Calendar size={16} strokeWidth={1.75} style={{ color: color.muted, flexShrink: 0 }} />
        <span style={{ color: value ? color.text : color.muted }}>{value ? prettyDate(value) : placeholder}</span>
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} width={280} estHeight={360} align="left">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: color.text }}>{MONTHS[view.m]} {view.y}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="pm-dt-nav" onClick={() => stepMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <button type="button" className="pm-dt-nav" onClick={() => stepMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: color.muted, padding: "2px 0" }}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`b${i}`} />;
            const isSel = selected && selected.getFullYear() === view.y && selected.getMonth() === view.m && selected.getDate() === day;
            const isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === day;
            return (
              <button key={day} type="button" disabled={isDisabled(day)}
                className={`pm-dt-day${isSel ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                onClick={() => pick(day)}>{day}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, borderTop: `1px solid ${color.border}`, paddingTop: 8 }}>
          <button type="button" className="pm-dt-link" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
          <button type="button" className="pm-dt-link" onClick={() => { const d = (minDate && today < minDate) ? minDate : today; onChange(toDateStr(d)); setOpen(false); }}>Today</button>
        </div>
      </Popover>
    </>
  );
}

/* ── Time picker (hour / minute columns + AM·PM) ─────────────────────── */
export function TimeField({ value, onChange }) {
  usePickerCss();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);

  const [h24, mnt] = value ? String(value).split(":").map(Number) : [23, 59];
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = ((h24 + 11) % 12) + 1;

  const commit = (nh12, nm, nap) => {
    const base = nap === "PM" ? (nh12 % 12) + 12 : (nh12 % 12);
    onChange(`${pad(base)}:${pad(nm)}`);
  };

  return (
    <>
      <button ref={anchorRef} type="button" className={`pm-dt-trigger${open ? " is-open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <Clock size={16} strokeWidth={1.75} style={{ color: color.muted, flexShrink: 0 }} />
        <span>{prettyTime(value || "23:59")}</span>
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} width={230} estHeight={240} align="right">
        <div style={{ display: "flex", gap: 8 }}>
          <div className="pm-dt-tcol">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((hh) => (
              <button key={hh} type="button" className={`pm-dt-tcell${hh === h12 ? " is-selected" : ""}`} onClick={() => commit(hh, mnt, ampm)}>{pad(hh)}</button>
            ))}
          </div>
          <div className="pm-dt-tcol">
            {Array.from({ length: 60 }, (_, i) => i).map((mm) => (
              <button key={mm} type="button" className={`pm-dt-tcell${mm === mnt ? " is-selected" : ""}`} onClick={() => commit(h12, mm, ampm)}>{pad(mm)}</button>
            ))}
          </div>
          <div className="pm-dt-tcol" style={{ flex: "0 0 56px", overflow: "hidden" }}>
            {["AM", "PM"].map((ap) => (
              <button key={ap} type="button" className={`pm-dt-tcell${ap === ampm ? " is-selected" : ""}`} onClick={() => commit(h12, mnt, ap)}>{ap}</button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
