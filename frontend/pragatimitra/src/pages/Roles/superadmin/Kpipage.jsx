"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "http://localhost:5000/api/kpi";
async function apiFetch(path, opts = {}) {
  const res  = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const ECHARTS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js";

// ─── Design tokens — matching Departments page exactly ────────────────────────
const C = {
  bg:         "#f0f2f5",
  surface:    "#ffffff",
  border:     "#e8eaed",
  borderHov:  "#d0d5dd",
  ink:        "#101828",
  ink2:       "#1d2939",
  muted:      "#667085",
  subtle:     "#98a2b3",
  line:       "#eaecf0",
  lineLight:  "#f9fafb",
  // Brand blue — matches "+ New Department" button
  blue:       "#1d4ed8",
  blueMid:    "#2563eb",
  blueLight:  "#eff6ff",
  blueText:   "#1e40af",
  blueBorder: "#bfdbfe",
  // Status green — matches "Active" badge
  green:      "#027a48",
  greenBg:    "#ecfdf3",
  greenBorder:"#abefc6",
  // Status grey — matches "Inactive" badge
  greyBg:     "#f2f4f7",
  greyText:   "#344054",
  // Red for deactivate
  red:        "#b42318",
  redBg:      "#fef3f2",
  redBorder:  "#fecdca",
  // Series
  series: ["#2563eb","#027a48","#7c3aed","#b45309","#0891b2","#be185d","#15803d","#92400e"],
};

const CHART_TYPES = [
  { value:"bar",       label:"Grouped Bar"  },
  { value:"bar_stack", label:"Stacked Bar"  },
  { value:"line",      label:"Line"         },
  { value:"area",      label:"Area"         },
  { value:"pie",       label:"Pie"          },
  { value:"doughnut",  label:"Doughnut"     },
];

const NUMERIC_TYPES = [
  "integer","bigint","smallint","numeric","decimal","real",
  "double precision","float","float4","float8","int2","int4",
  "int8","money","serial","bigserial","smallserial","int","number",
];
const isNumeric = dt => NUMERIC_TYPES.some(t => (dt||"").toLowerCase().includes(t.split(" ")[0]));

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  @keyframes fadeIn  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

  body { background: ${C.bg}; }

  .kpi-root {
    font-family: 'Inter', system-ui, sans-serif;
    color: ${C.ink};
    background: ${C.bg};
    min-height: 100vh;
  }

  /* ── Top header bar — matches dept page exactly ── */
  .kpi-topbar {
    background: ${C.bg};
    padding: 24px 32px 0;
  }

  .kpi-topbar-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: ${C.greenBg}; color: ${C.green};
    border: 1px solid ${C.greenBorder};
    border-radius: 20px; padding: 3px 10px;
    font-size: 11px; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; margin-bottom: 10px;
  }
  .kpi-topbar-badge-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: ${C.green}; flex-shrink: 0;
  }

  .kpi-topbar-title {
    font-size: 28px; font-weight: 700; color: ${C.ink};
    letter-spacing: -.02em; line-height: 1.2;
  }
  .kpi-topbar-sub {
    font-size: 14px; color: ${C.muted}; margin-top: 4px; font-weight: 400;
  }

  /* ── Action row (Institution selector + buttons) ── */
  .kpi-action-row {
    display: flex; align-items: flex-end; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
    padding: 20px 32px 0;
  }
  .kpi-action-left { display: flex; flex-direction: column; gap: 4px; }
  .kpi-action-label {
    font-size: 11px; font-weight: 600; color: ${C.subtle};
    text-transform: uppercase; letter-spacing: .08em;
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 8px; font-family: inherit; cursor: pointer;
    font-size: 13.5px; font-weight: 500; transition: all .14s;
    border: 1px solid transparent; white-space: nowrap; line-height: 1;
    padding: 9px 16px;
  }
  .btn:disabled { opacity: .55; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

  .btn-primary {
    background: ${C.blueMid}; color: #fff; border-color: ${C.blueMid};
    font-weight: 600;
  }
  .btn-primary:hover:not(:disabled) { background: ${C.blue}; border-color: ${C.blue}; box-shadow: 0 2px 8px rgba(37,99,235,.3); }

  .btn-outline {
    background: ${C.surface}; color: ${C.ink2};
    border-color: ${C.border};
  }
  .btn-outline:hover:not(:disabled) { border-color: ${C.borderHov}; background: ${C.lineLight}; }

  .btn-outline-blue {
    background: ${C.surface}; color: ${C.blue};
    border-color: ${C.blueBorder};
  }
  .btn-outline-blue:hover:not(:disabled) { background: ${C.blueLight}; }

  .btn-export {
    background: ${C.green}; color: #fff; border-color: ${C.green};
    font-weight: 600;
  }
  .btn-export:hover:not(:disabled) { background: #026b40; box-shadow: 0 2px 8px rgba(2,122,72,.3); }

  .btn-ghost {
    background: transparent; color: ${C.muted}; border-color: transparent;
    padding: 8px 12px;
  }
  .btn-ghost:hover:not(:disabled) { color: ${C.ink}; background: ${C.lineLight}; border-color: ${C.border}; }

  .btn-sm {
    padding: 6px 12px; font-size: 12.5px; font-weight: 500;
    background: ${C.surface}; color: ${C.blue}; border-color: ${C.border};
    border-radius: 6px;
  }
  .btn-sm:hover { border-color: ${C.blueBorder}; background: ${C.blueLight}; }
  .btn-sm.red { color: ${C.red}; }
  .btn-sm.red:hover { border-color: ${C.redBorder}; background: ${C.redBg}; }
  .btn-sm.green { color: ${C.green}; }
  .btn-sm.green:hover { border-color: ${C.greenBorder}; background: ${C.greenBg}; }

  /* ── Select / dropdown — matches Institution selector ── */
  .kpi-select {
    appearance: none; border: 1px solid ${C.border};
    border-radius: 8px; padding: 9px 36px 9px 14px;
    font-size: 14px; font-family: inherit; font-weight: 500;
    color: ${C.ink}; background: ${C.surface}; outline: none;
    min-width: 180px; cursor: pointer; transition: border-color .12s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2398a2b3' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center;
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
  }
  .kpi-select:focus { border-color: ${C.blueMid}; box-shadow: 0 0 0 3px ${C.blueLight}; }

  /* ── Stats line — "3 chart(s) configured" ── */
  .kpi-stats-bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
    padding: 18px 32px 12px;
    font-size: 13.5px; color: ${C.muted};
  }
  .kpi-stats-bar strong { color: ${C.ink2}; }

  /* ── Card grid — matches dept card grid ── */
  .kpi-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    padding: 0 32px 32px;
  }

  /* ── KPI config card — mirrors department card exactly ── */
  .kpi-card {
    background: ${C.surface}; border: 1px solid ${C.border};
    border-radius: 12px; overflow: hidden;
    transition: box-shadow .18s, border-color .18s;
    display: flex; flex-direction: column;
    animation: slideUp .25s ease both;
  }
  .kpi-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.08); border-color: ${C.borderHov}; }

  .kpi-card-top {
    padding: 20px 20px 16px;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }
  .kpi-card-icon-wrap { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .kpi-card-icon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; letter-spacing: -.02em;
    flex-shrink: 0; font-family: 'JetBrains Mono', monospace;
  }
  .kpi-card-name { font-size: 16px; font-weight: 600; color: ${C.ink}; }
  .kpi-card-since { font-size: 12px; color: ${C.subtle}; margin-top: 2px; }

  /* ── Status badge — Active / Draft ── */
  .status-badge {
    padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500;
    flex-shrink: 0;
  }
  .status-active   { background: ${C.greenBg}; color: ${C.green}; border: 1px solid ${C.greenBorder}; }
  .status-draft    { background: ${C.greyBg};  color: ${C.greyText}; border: 1px solid ${C.border}; }

  /* ── Card stats row — Members / Code style ── */
  .kpi-card-stats {
    display: flex; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};
    margin: 0 20px; padding: 14px 0; gap: 0;
  }
  .kpi-card-stat {
    flex: 1; padding: 0 12px;
    border-right: 1px solid ${C.line};
  }
  .kpi-card-stat:last-child { border-right: none; }
  .kpi-card-stat:first-child { padding-left: 0; }
  .kpi-card-stat-label { font-size: 11px; color: ${C.subtle}; font-weight: 500; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .06em; }
  .kpi-card-stat-val   { font-size: 18px; font-weight: 700; color: ${C.ink}; font-family: 'JetBrains Mono', monospace; }
  .kpi-card-stat-val.mono { font-size: 14px; font-weight: 600; }

  /* ── Card action buttons row — Edit / Activate style ── */
  .kpi-card-actions {
    display: flex; padding: 14px 20px; gap: 10px;
  }
  .kpi-card-actions .btn { flex: 1; justify-content: center; }

  /* ── New config card (dashed) ── */
  .kpi-card-new {
    background: ${C.surface}; border: 1.5px dashed ${C.border};
    border-radius: 12px; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 40px 20px; gap: 10px; min-height: 220px;
    transition: border-color .15s, background .15s;
  }
  .kpi-card-new:hover { border-color: ${C.blueMid}; background: ${C.blueLight}; }
  .kpi-card-new-icon {
    width: 44px; height: 44px; border-radius: 50%;
    border: 1.5px dashed ${C.muted}; display: flex; align-items: center;
    justify-content: center; font-size: 22px; color: ${C.muted};
    transition: border-color .15s, color .15s;
  }
  .kpi-card-new:hover .kpi-card-new-icon { border-color: ${C.blueMid}; color: ${C.blueMid}; }
  .kpi-card-new-text { font-size: 13.5px; font-weight: 600; color: ${C.muted}; }
  .kpi-card-new:hover .kpi-card-new-text { color: ${C.blueMid}; }

  /* ── Slide-in config panel (replaces modal) ── */
  .kpi-drawer-overlay {
    position: fixed; inset: 0; background: rgba(16,24,40,.35);
    z-index: 100; display: flex; align-items: flex-start; justify-content: flex-end;
    animation: fadeIn .2s ease;
  }
  .kpi-drawer {
    width: 480px; max-width: 100vw; height: 100vh;
    background: ${C.surface}; overflow-y: auto;
    display: flex; flex-direction: column;
    animation: slideUp .22s ease;
    box-shadow: -4px 0 24px rgba(0,0,0,.12);
  }
  .kpi-drawer-header {
    padding: 20px 24px; border-bottom: 1px solid ${C.line};
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; background: ${C.surface}; z-index: 2;
  }
  .kpi-drawer-title { font-size: 16px; font-weight: 600; color: ${C.ink}; }
  .kpi-drawer-sub   { font-size: 12px; color: ${C.muted}; margin-top: 2px; }
  .kpi-drawer-body  { padding: 24px; flex: 1; display: flex; flex-direction: column; gap: 22px; }
  .kpi-drawer-footer {
    padding: 16px 24px; border-top: 1px solid ${C.line};
    display: flex; gap: 10px; background: ${C.surface};
    position: sticky; bottom: 0;
  }

  /* ── Form fields inside drawer ── */
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label {
    font-size: 12px; font-weight: 600; color: ${C.ink2};
    letter-spacing: .01em;
  }
  .field-hint { font-size: 11.5px; color: ${C.subtle}; }
  .kpi-input {
    border: 1px solid ${C.border}; border-radius: 8px;
    padding: 9px 13px; font-size: 13.5px; font-family: inherit;
    color: ${C.ink}; background: ${C.surface}; outline: none;
    transition: border-color .12s; width: 100%;
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
  }
  .kpi-input:focus { border-color: ${C.blueMid}; box-shadow: 0 0 0 3px ${C.blueLight}; }
  .kpi-input::placeholder { color: ${C.subtle}; }

  /* ── Table / column picker list ── */
  .pick-list {
    border: 1px solid ${C.border}; border-radius: 8px;
    max-height: 200px; overflow-y: auto; background: ${C.surface};
  }
  .pick-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-bottom: 1px solid ${C.lineLight};
    cursor: pointer; transition: background .1s; user-select: none;
  }
  .pick-item:last-child { border-bottom: none; }
  .pick-item:hover  { background: ${C.lineLight}; }
  .pick-item.active { background: ${C.blueLight}; }
  .pick-item-name  { font-size: 13px; font-weight: 500; flex: 1; color: ${C.ink2}; }
  .pick-item-type  { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: ${C.subtle}; padding: 1px 6px; background: ${C.greyBg}; border-radius: 4px; }
  .pick-item-type.num { color: ${C.blueText}; background: ${C.blueLight}; }

  .pick-radio {
    width: 15px; height: 15px; border-radius: 50%;
    border: 1.5px solid ${C.border}; background: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .pick-item.active .pick-radio { border-color: ${C.blueMid}; }
  .pick-radio-dot { width: 7px; height: 7px; border-radius: 50%; background: ${C.blueMid}; }

  .pick-check {
    width: 15px; height: 15px; border-radius: 4px;
    border: 1.5px solid ${C.border}; background: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: all .1s;
  }
  .pick-item.active .pick-check { background: ${C.blueMid}; border-color: ${C.blueMid}; }

  /* ── Selected column tags ── */
  .col-tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .col-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px 3px 6px; border-radius: 6px; font-size: 11.5px; font-weight: 500;
    border: 1px solid transparent;
  }
  .col-tag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .col-tag-rm  { cursor: pointer; color: inherit; opacity: .55; font-size: 13px; line-height: 1; }
  .col-tag-rm:hover { opacity: 1; }

  /* ── Chart type pills ── */
  .pill-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .pill {
    padding: 5px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 500;
    cursor: pointer; border: 1px solid ${C.border}; color: ${C.muted};
    background: ${C.surface}; transition: all .12s; font-family: inherit;
  }
  .pill:hover  { border-color: ${C.blueMid}; color: ${C.blueMid}; }
  .pill.active { border-color: ${C.blueMid}; background: ${C.blueMid}; color: #fff; }

  /* ── Search box ── */
  .search-wrap { position: relative; }
  .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
  .kpi-search {
    border: 1px solid ${C.border}; border-radius: 8px;
    padding: 9px 13px 9px 34px; font-size: 13px; font-family: inherit;
    color: ${C.ink}; background: ${C.surface}; outline: none; width: 100%;
    transition: border-color .12s; box-shadow: 0 1px 2px rgba(0,0,0,.04);
  }
  .kpi-search:focus { border-color: ${C.blueMid}; box-shadow: 0 0 0 3px ${C.blueLight}; }

  /* ── Chart view — full page below topbar ── */
  .chart-page { padding: 0 32px 32px; }
  .chart-card {
    background: ${C.surface}; border: 1px solid ${C.border};
    border-radius: 12px; overflow: hidden;
  }
  .chart-card-header {
    padding: 18px 24px; border-bottom: 1px solid ${C.line};
    display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .chart-card-title { font-size: 16px; font-weight: 600; color: ${C.ink}; }
  .chart-card-sub   { font-size: 12.5px; color: ${C.subtle}; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }

  /* ── SQL box ── */
  .sql-box {
    background: #0d1117; border-radius: 8px; padding: 14px 16px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #c9d1d9;
    overflow-x: auto; white-space: pre; line-height: 1.75; border: 1px solid #21262d;
  }
  .sql-kw  { color: #ff7b72; }
  .sql-num { color: #f2cc60; }

  /* ── Data table ── */
  .data-tbl { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
  .data-tbl thead th {
    padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase;
    color: ${C.subtle}; background: ${C.lineLight}; border-bottom: 1px solid ${C.line};
  }
  .data-tbl thead th:first-child { text-align: left; position: sticky; left: 0; z-index: 2; background: ${C.lineLight}; }
  .data-tbl tbody tr:hover { background: ${C.blueLight}; }
  .data-tbl tbody td { padding: 9px 14px; border-bottom: 1px solid ${C.lineLight}; text-align: center; color: ${C.ink2}; }
  .data-tbl tbody td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; background: ${C.surface}; font-weight: 500; }
  .data-tbl tbody tr:hover td:first-child { background: ${C.blueLight}; }
  .data-tbl .total-row td { font-weight: 700; color: ${C.blueText}; background: ${C.blueLight}; border-top: 1px solid ${C.blueBorder}; font-family: 'JetBrains Mono', monospace; }
  .data-tbl .total-row td:first-child { background: #dbeafe; }

  /* ── Metric grid ── */
  .metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr)); gap: 1px; background: ${C.line}; }
  .metric-cell { background: ${C.surface}; padding: 16px 20px; }
  .metric-label { font-size: 11px; font-weight: 600; color: ${C.subtle}; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 6px; }
  .metric-val   { font-size: 22px; font-weight: 700; color: ${C.ink}; font-family: 'JetBrains Mono', monospace; letter-spacing: -.02em; }

  /* ── Info / error bars ── */
  .info-bar { background: ${C.blueLight}; border: 1px solid ${C.blueBorder}; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: ${C.blueText}; }
  .err-bar  { background: ${C.redBg}; border: 1px solid ${C.redBorder}; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: ${C.red}; display: flex; align-items: center; gap: 8px; }

  /* ── Toast ── */
  .toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    padding: 12px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.16); max-width: 380px;
    display: flex; align-items: center; gap: 8px; animation: slideUp .2s ease;
    border: 1px solid transparent;
  }
  .toast.ok  { background: ${C.ink}; color: #fff; }
  .toast.err { background: ${C.redBg}; color: ${C.red}; border-color: ${C.redBorder}; }

  /* ── Spinner ── */
  .spin {
    display: inline-block; border-radius: 50%; flex-shrink: 0;
    border: 2px solid rgba(255,255,255,.25); border-top-color: currentColor;
    animation: spin .6s linear infinite;
  }
  .spin.dark { border-color: ${C.line}; border-top-color: ${C.blueMid}; }

  /* ── Empty ── */
  .empty { text-align: center; padding: 48px 24px; color: ${C.subtle}; }
  .empty-title { font-size: 14px; font-weight: 600; color: ${C.muted}; margin-bottom: 4px; }
  .empty-sub   { font-size: 13px; }

  .divider { border: none; border-top: 1px solid ${C.line}; margin: 0; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: ${C.borderHov}; }
`;

function StyleInject() {
  useEffect(() => {
    const id = "kpi-dept-style";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id; el.textContent = CSS; document.head.appendChild(el);
  }, []);
  return null;
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const Spin = ({ size = 15, dark = false }) => (
  <span className={`spin${dark?" dark":""}`} style={{ width: size, height: size }}/>
);

const Toast = ({ msg, isErr }) => msg
  ? <div className={`toast ${isErr?"err":"ok"}`}>{msg}</div>
  : null;

const fmtDate = ts => ts
  ? new Date(ts).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
  : "—";

const fmtNum = n => Number(n||0).toLocaleString();

// Card icon color pairs — mirrors the dept page colored icon squares
const ICON_COLORS = [
  { bg:"#eff6ff", color:"#1d4ed8" },
  { bg:"#ecfdf5", color:"#027a48" },
  { bg:"#f5f3ff", color:"#6d28d9" },
  { bg:"#fff7ed", color:"#c2410c" },
  { bg:"#f0f9ff", color:"#0369a1" },
  { bg:"#fdf2f8", color:"#9d174d" },
];

function cardIconStyle(idx) {
  const p = ICON_COLORS[idx % ICON_COLORS.length];
  return { background: p.bg, color: p.color };
}

// ─── SQL highlight ────────────────────────────────────────────────────────────
function SqlBlock({ sql }) {
  if (!sql) return null;
  const kws = ["SELECT","FROM","WHERE","ORDER BY","LIMIT","AND","OR","NOT","IS","NULL","AS","IN","COALESCE"];
  let h = sql.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  kws.forEach(k => { h = h.replace(new RegExp(`\\b(${k})\\b`,"g"),`<span class="sql-kw">$1</span>`); });
  h = h.replace(/\b(\d+)\b/g,`<span class="sql-num">$1</span>`);
  return <div className="sql-box" dangerouslySetInnerHTML={{ __html: h }}/>;
}

// ─── ECharts builder ──────────────────────────────────────────────────────────
function buildOption(chartType, xLabels, series, yRange) {
  const txt    = { fontFamily:"'Inter',sans-serif", fontSize:11, color:C.subtle };
  const isPie  = chartType==="pie"||chartType==="doughnut";
  const isLine = chartType==="line"||chartType==="area";
  const isArea = chartType==="area";
  const isStack= chartType==="bar_stack";

  if (isPie) return {
    backgroundColor:"transparent",
    tooltip:{ trigger:"item", formatter:"{b}: {c} ({d}%)", textStyle:txt },
    legend:{ bottom:0, textStyle:txt },
    series:[{
      type:"pie",
      radius:chartType==="doughnut"?["42%","68%"]:"64%",
      center:["50%","46%"],
      data:series.map(s=>({ name:s.name, value:s.data.reduce((a,b)=>a+(Number(b)||0),0), itemStyle:{ color:s.color } })),
      label:{ fontSize:11, fontFamily:"'Inter',sans-serif" },
      emphasis:{ itemStyle:{ shadowBlur:6 } },
    }],
  };

  return {
    backgroundColor:"transparent",
    tooltip:{ trigger:"axis", axisPointer:{ type:isLine?"line":"shadow" }, textStyle:txt },
    legend:{ bottom:4, data:series.map(s=>({ name:s.name, itemStyle:{ color:s.color } })), textStyle:txt, icon:"roundRect" },
    grid:{ left:52, right:16, top:16, bottom:60 },
    xAxis:{
      type:"category", data:xLabels.map(String),
      axisLabel:{ ...txt, rotate:xLabels.length>10?35:0, interval:0 },
      axisLine:{ lineStyle:{ color:C.line } }, axisTick:{ show:false },
    },
    yAxis:{
      type:"value", axisLabel:txt,
      axisLine:{ show:false }, axisTick:{ show:false },
      splitLine:{ lineStyle:{ color:C.lineLight } },
      min:yRange?.min??0, max:yRange?.max??undefined, interval:yRange?.interval??undefined,
    },
    series:series.map(s=>({
      name:s.name, type:isLine?"line":"bar", stack:isStack?"total":undefined,
      data:s.data.map(Number),
      itemStyle:{ color:s.color, borderRadius:isLine?0:[3,3,0,0] },
      areaStyle:isArea?{ opacity:0.07, color:s.color }:undefined,
      smooth:isLine, symbol:isLine?"circle":undefined, symbolSize:5,
      label:{
        show:!isLine&&s.data.length<=14&&series.length<=2,
        position:"top", fontSize:10, fontFamily:"'JetBrains Mono',monospace",
        color:C.subtle, formatter:p=>fmtNum(p.value),
      },
    })),
  };
}

// ─── SVG table builder ────────────────────────────────────────────────────────
function buildTableSVG(series, xLabels) {
  const LW=130, CW=82, RH=28, HH=36, P=14;
  const W=P+LW+xLabels.length*CW+P, H=P+HH+series.length*RH+RH+P;
  const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  s+=`<rect width="${W}" height="${H}" fill="#fff" rx="6" stroke="#eaecf0"/>`;
  s+=`<rect x="${P}" y="${P}" width="${W-P*2}" height="${HH}" fill="#f9fafb" rx="4"/>`;
  s+=`<text x="${P+10}" y="${P+HH/2+5}" font-size="9" font-weight="700" fill="#98a2b3" font-family="system-ui">SERIES</text>`;
  xLabels.forEach((l,ci)=>{
    const x=P+LW+ci*CW;
    s+=`<text x="${x+CW/2}" y="${P+HH/2+5}" text-anchor="middle" font-size="10" font-weight="600" fill="#667085" font-family="system-ui">${e(l)}</text>`;
  });
  series.forEach((sr,ri)=>{
    const y=P+HH+ri*RH;
    s+=`<rect x="${P}" y="${y}" width="${W-P*2}" height="${RH}" fill="${ri%2===0?"#fff":"#f9fafb"}"/>`;
    s+=`<rect x="${P+8}" y="${y+RH/2-4}" width="8" height="8" rx="2" fill="${sr.color}"/>`;
    s+=`<text x="${P+22}" y="${y+RH/2+5}" font-size="11" font-weight="600" fill="#101828" font-family="system-ui">${e(sr.name)}</text>`;
    sr.data.forEach((v,ci)=>{
      const x=P+LW+ci*CW;
      s+=`<text x="${x+CW/2}" y="${y+RH/2+5}" text-anchor="middle" font-size="11" fill="#1d2939" font-family="monospace">${fmtNum(v)}</text>`;
    });
    s+=`<line x1="${P}" y1="${y+RH}" x2="${W-P}" y2="${y+RH}" stroke="#f2f4f7"/>`;
  });
  const ty=P+HH+series.length*RH;
  s+=`<rect x="${P}" y="${ty}" width="${W-P*2}" height="${RH}" fill="#eff6ff" rx="3"/>`;
  s+=`<text x="${P+10}" y="${ty+RH/2+5}" font-size="11" font-weight="700" fill="#1e40af" font-family="system-ui">Total</text>`;
  xLabels.forEach((_,ci)=>{
    const x=P+LW+ci*CW;
    const ct=series.reduce((a,sr)=>a+(Number(sr.data[ci])||0),0);
    s+=`<text x="${x+CW/2}" y="${ty+RH/2+5}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e40af" font-family="monospace">${fmtNum(ct)}</text>`;
  });
  return s+"</svg>";
}

// ─── Metric summary ───────────────────────────────────────────────────────────
function MetricSummary({ series, xLabels }) {
  if (!series?.length||!xLabels?.length) return null;
  const nums=series.flatMap(s=>s.data.map(Number).filter(n=>!isNaN(n)));
  if (!nums.length) return null;
  const sum=nums.reduce((a,b)=>a+b,0);
  return (
    <div className="metric-grid">
      {[
        { label:"Grand Total", val:fmtNum(Math.round(sum)) },
        { label:"Average",     val:fmtNum(Math.round(sum/nums.length)) },
        { label:"Maximum",     val:fmtNum(Math.max(...nums)) },
        { label:"Minimum",     val:fmtNum(Math.min(...nums)) },
        { label:"Periods",     val:xLabels.length },
        { label:"Series",      val:series.length },
      ].map(m=>(
        <div key={m.label} className="metric-cell">
          <div className="metric-label">{m.label}</div>
          <div className="metric-val">{m.val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Config Drawer ────────────────────────────────────────────────────────────
function ConfigDrawer({ cfg, tables, existingConfigs, onClose, onSaved, onRegenerate, notify }) {
  const isEdit = !!cfg?.id;

  const [selTable,   setSelTable]   = useState(cfg?.table_name || "");
  const [xCol,       setXCol]       = useState(cfg?.x_col      || "");
  const [yCols,      setYCols]      = useState(cfg?.y_cols      || []);
  const [chartType,  setChartType]  = useState(cfg?.chart_type  || "bar");
  const [rowLimit,   setRowLimit]   = useState(String(cfg?.row_limit||500));
  const [title,      setTitle]      = useState(cfg?.title       || "");
  const [desc,       setDesc]       = useState(cfg?.description || "");
  const [tabSearch,  setTabSearch]  = useState("");
  const [existingForTable, setExistingForTable] = useState(null);

  const [cols,       setCols]       = useState([]);
  const [colsLoading,setColsLoading]= useState(false);
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");

  // Load columns when table picked
  useEffect(() => {
    if (!selTable) { setCols([]); setExistingForTable(null); return; }
    setColsLoading(true);
    apiFetch(`/tables/${encodeURIComponent(selTable)}/columns`)
      .then(r => { setCols(r.data); setColsLoading(false); })
      .catch(() => setColsLoading(false));

    // Check if a config already exists for this table (only in New mode)
    if (!isEdit) {
      const found = (existingConfigs || []).find(c => c.table_name === selTable);
      setExistingForTable(found || null);
    }
  }, [selTable]); // eslint-disable-line

  // Load the existing config values when user selects a table that already has one
  const loadExistingConfig = () => {
    if (!existingForTable) return;
    setXCol(existingForTable.x_col || "");
    setYCols(existingForTable.y_cols || []);
    setChartType(existingForTable.chart_type || "bar");
    setRowLimit(String(existingForTable.row_limit || 500));
    setTitle(existingForTable.title || "");
    setDesc(existingForTable.description || "");
    setExistingForTable(null); // dismiss the banner after loading
  };

  const numCols = cols.filter(c => isNumeric(c.data_type));
  const filteredTables = tables.filter(t => !tabSearch || t.table_name.toLowerCase().includes(tabSearch.toLowerCase()));
  const toggleY = cn => setYCols(p => p.includes(cn) ? p.filter(c=>c!==cn) : [...p,cn]);

  const save = async () => {
    if (!selTable) { setErr("Select a source table."); return; }
    if (!xCol)     { setErr("Select an X-axis column."); return; }
    if (!yCols.length) { setErr("Select at least one Y-axis column."); return; }
    setErr(""); setSaving(true);
    try {
      const payload = {
        title:       title || `${selTable} · ${new Date().toLocaleDateString("en-IN")}`,
        description: desc,
        table_name:  selTable,
        x_col:       xCol,
        y_cols:      yCols,
        chart_type:  chartType,
        row_limit:   parseInt(rowLimit)||500,
      };
      let saved, r;
      if (isEdit) {
        const u = await apiFetch(`/configs/${cfg.id}`, { method:"PUT", body:JSON.stringify(payload) });
        saved = u.data; r = u;
      } else {
        r = await apiFetch("/configs", { method:"POST", body:JSON.stringify(payload) });
        saved = r.data;
      }
      // Backend returns updated:true if it found and updated an existing config
      const wasUpdated = isEdit || (typeof r !== "undefined" && r.updated);
      onSaved(saved);
      notify(`${wasUpdated ? "Updated" : "Created"} config #${saved.id}`);
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="kpi-drawer-overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="kpi-drawer">
        <div className="kpi-drawer-header">
          <div>
            <div className="kpi-drawer-title">{isEdit ? "Edit Chart Config" : "New Chart Config"}</div>
            <div className="kpi-drawer-sub">
              {isEdit
                ? `Editing config #${cfg.id} · ${cfg.table_name}`
                : "Select a table — existing drafts will be detected automatically"}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding:"6px 10px" }} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="kpi-drawer-body">

          {/* Title */}
          <div className="field">
            <label className="field-label">Chart Title</label>
            <input className="kpi-input" placeholder="e.g. Health Sessions FY 2024-25" value={title} onChange={e=>setTitle(e.target.value)}/>
          </div>

          {/* Description */}
          <div className="field">
            <label className="field-label">Description <span style={{ fontWeight:400, color:C.subtle }}>(optional)</span></label>
            <input className="kpi-input" placeholder="Caption for the report" value={desc} onChange={e=>setDesc(e.target.value)}/>
          </div>

          {/* Source table */}
          <div className="field">
            <label className="field-label">Source Table</label>
            {existingForTable && (
              <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", marginBottom:10, fontSize:13 }}>
                <div style={{ fontWeight:600, color:"#92400e", marginBottom:4 }}>
                  Draft found for this table
                </div>
                <div style={{ color:"#78350f", fontSize:12, marginBottom:8 }}>
                  Config #{existingForTable.id} · "{existingForTable.title}" · {existingForTable.chart_type} · Last updated {new Date(existingForTable.updated_at).toLocaleDateString("en-IN")}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-sm" style={{ color:"#92400e", borderColor:"#fcd34d", background:"#fef3c7", fontSize:12 }} onClick={loadExistingConfig}>
                    Load existing config
                  </button>
                  <button className="btn btn-sm" style={{ fontSize:12 }} onClick={()=>setExistingForTable(null)}>
                    Start fresh
                  </button>
                </div>
              </div>
            )}
            <div className="search-wrap" style={{ marginBottom:6 }}>
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.subtle} strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="kpi-search" placeholder="Filter tables…" value={tabSearch} onChange={e=>setTabSearch(e.target.value)}/>
            </div>
            <div className="pick-list">
              {filteredTables.map(t => (
                <div key={t.table_name} className={`pick-item${selTable===t.table_name?" active":""}`} onClick={()=>setSelTable(t.table_name)}>
                  <div className="pick-radio">{selTable===t.table_name&&<div className="pick-radio-dot"/>}</div>
                  <span className="pick-item-name">{t.table_name}</span>
                  {t.row_count!=null && <span className="pick-item-type">{Number(t.row_count).toLocaleString()} rows</span>}
                </div>
              ))}
            </div>
          </div>

          {/* X-axis */}
          <div className="field">
            <label className="field-label">X-Axis Column</label>
            <div className="field-hint" style={{ marginBottom:6 }}>Horizontal axis — month, date, or category column.</div>
            {!selTable && <div style={{ fontSize:12, color:C.subtle }}>Select a table first.</div>}
            {selTable && colsLoading && <div style={{ padding:"10px 0", display:"flex", gap:8, alignItems:"center", color:C.subtle, fontSize:12 }}><Spin dark size={13}/> Loading…</div>}
            {selTable && !colsLoading && (
              <div className="pick-list">
                {cols.map(c => (
                  <div key={c.column_name} className={`pick-item${xCol===c.column_name?" active":""}`} onClick={()=>setXCol(c.column_name)}>
                    <div className="pick-radio">{xCol===c.column_name&&<div className="pick-radio-dot"/>}</div>
                    <span className="pick-item-name">{c.column_name}</span>
                    <span className={`pick-item-type${isNumeric(c.data_type)?" num":""}`}>{c.data_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Y-axis */}
          <div className="field">
            <label className="field-label">Y-Axis Columns</label>
            <div className="field-hint" style={{ marginBottom:6 }}>Numeric columns — each becomes one data series.</div>
            {yCols.length>0 && (
              <div className="col-tags" style={{ marginBottom:8 }}>
                {yCols.map((cn,ci)=>(
                  <span key={cn} className="col-tag" style={{ background:C.series[ci%C.series.length]+"18", color:C.series[ci%C.series.length], border:`1px solid ${C.series[ci%C.series.length]}40` }}>
                    <span className="col-tag-dot" style={{ background:C.series[ci%C.series.length] }}/>
                    {cn}
                    <span className="col-tag-rm" onClick={()=>toggleY(cn)}>×</span>
                  </span>
                ))}
              </div>
            )}
            {selTable && !colsLoading && numCols.length>0 && (
              <div className="pick-list">
                {numCols.map((c,ci)=>{
                  const sel=yCols.includes(c.column_name);
                  const si=yCols.indexOf(c.column_name);
                  return (
                    <div key={c.column_name} className={`pick-item${sel?" active":""}`} onClick={()=>toggleY(c.column_name)}>
                      <div className="pick-check" style={sel?{background:C.series[si%C.series.length],borderColor:C.series[si%C.series.length]}:{}}>
                        {sel&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="pick-item-name">{c.column_name}</span>
                      <span className="pick-item-type num">{c.data_type}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop:6, fontSize:11, color:C.subtle }}>{yCols.length} column{yCols.length!==1?"s":""} selected</div>
          </div>

          {/* Chart type */}
          <div className="field">
            <label className="field-label">Chart Type</label>
            <div className="pill-row">
              {CHART_TYPES.map(ct=>(
                <button key={ct.value} className={`pill${chartType===ct.value?" active":""}`} onClick={()=>setChartType(ct.value)}>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row limit */}
          <div className="field" style={{ maxWidth:200 }}>
            <label className="field-label">Row Limit</label>
            <select className="kpi-select" value={rowLimit} onChange={e=>setRowLimit(e.target.value)}>
              {["100","250","500","1000","2000"].map(v=><option key={v} value={v}>{v} rows</option>)}
            </select>
          </div>

          {err && <div className="err-bar"><span>&#9888;</span>{err}</div>}
        </div>

        <div className="kpi-drawer-footer">
          <button className="btn btn-primary" style={{ flex:1 }} onClick={save} disabled={saving}>
            {saving ? <><Spin size={14}/> Saving…</> : isEdit ? "Save Changes" : "Create Config"}
          </button>
          {isEdit && (
            <button className="btn btn-outline" onClick={()=>{ onRegenerate(cfg); onClose(); }}>
              Preview Chart
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function KPIPage() {
  const [configs,      setConfigs]      = useState([]);
  const [cfgsLoading,  setCfgsLoading]  = useState(true);
  const [tables,       setTables]       = useState([]);
  const [tabStatus,    setTabStatus]    = useState("loading");

  // Chart view state
  const [activeConfig, setActiveConfig] = useState(null);
  const [chartSeries,  setChartSeries]  = useState(null);
  const [chartXLabels, setChartXLabels] = useState(null);
  const [yRange,       setYRange]       = useState(null);
  const [displaySql,   setDisplaySql]   = useState("");
  const [fetchedAt,    setFetchedAt]    = useState(null);
  const [rowCount,     setRowCount]     = useState(null);
  const [chartType,    setChartType]    = useState("bar");
  const [showSql,      setShowSql]      = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [exporting,    setExporting]    = useState(false);

  // Drawer
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [drawerCfg,    setDrawerCfg]    = useState(null); // null = new, obj = edit

  // Filter
  const [statusFilter, setStatusFilter] = useState("all");

  // Toast
  const [toast,        setToast]        = useState("");
  const [toastErr,     setToastErr]     = useState(false);

  // ECharts
  const [eReady,       setEReady]       = useState(false);
  const chartDivRef = useRef(null);
  const chartInst   = useRef(null);

  const notify = useCallback((msg, err=false) => {
    setToast(msg); setToastErr(err);
    setTimeout(()=>setToast(""), 4500);
  }, []);

  // Load ECharts
  useEffect(() => {
    if (window.echarts) { setEReady(true); return; }
    const sc = document.createElement("script");
    sc.src = ECHARTS_CDN; sc.onload = ()=>setEReady(true);
    document.head.appendChild(sc);
  }, []); // eslint-disable-line

  // Load tables
  const loadTables = useCallback(() => {
    setTabStatus("loading");
    apiFetch("/tables")
      .then(r=>{ setTables(r.data); setTabStatus("ok"); })
      .catch(()=>setTabStatus("error"));
  }, []);
  useEffect(()=>{ loadTables(); },[loadTables]);

  // Load configs
  const loadConfigs = useCallback(() => {
    setCfgsLoading(true);
    apiFetch("/configs")
      .then(r=>{ setConfigs(r.data); setCfgsLoading(false); })
      .catch(()=>setCfgsLoading(false));
  }, []);
  useEffect(()=>{ loadConfigs(); },[loadConfigs]);

  // Chart sync
  const chartRefCb = useCallback(el => {
    chartDivRef.current = el;
    if (!el) {
      if (chartInst.current) { try{ chartInst.current.dispose(); }catch(_){} chartInst.current=null; }
      return;
    }
    setTimeout(()=>{
      if (!el||!window.echarts||chartInst.current) return;
      chartInst.current = window.echarts.init(el, null, { renderer:"svg" });
      new ResizeObserver(()=>chartInst.current?.resize()).observe(el);
    }, 0);
  }, []);

  useEffect(()=>{
    if (!chartInst.current||!chartSeries||!chartXLabels||!yRange) return;
    const t=setTimeout(()=>{
      if (!chartInst.current) return;
      chartInst.current.resize();
      chartInst.current.setOption(buildOption(chartType,chartXLabels,chartSeries,yRange),true);
    },30);
    return ()=>clearTimeout(t);
  },[chartSeries,chartXLabels,chartType,yRange]);

  // Apply result to chart state
  const applyResult = useCallback(rd=>{
    const series=rd.series.map((s,i)=>({ name:s.column, data:s.values, color:C.series[i%C.series.length] }));
    setChartSeries(series);
    setChartXLabels((rd.x||[]).map(String));
    setYRange(rd.y_range);
    setDisplaySql(rd.sql||"");
    setFetchedAt(rd.fetched_at||null);
    setRowCount(rd.row_count||null);
  },[]);

  // Regenerate
  const regenerate = useCallback(async cfg=>{
    setGenerating(true);
    setChartType(cfg.chart_type||"bar");
    try {
      const r = await apiFetch(`/configs/${cfg.id}/regenerate`,{ method:"POST" });
      // Use the config object returned BY the backend (has guaranteed correct id)
      const confirmedCfg = r.data.config || cfg;
      setActiveConfig(confirmedCfg);
      applyResult(r.data);
      notify(`Loaded "${confirmedCfg.title}" · ${r.data.row_count} rows`);
    } catch(e) {
      notify(e.message, true);
      setGenerating(false);
      return;
    }
    setGenerating(false);
  },[applyResult,notify]);

  // Export
  const exportSvg = useCallback(async()=>{
    if (!chartSeries||!chartXLabels||!chartInst.current) { notify("No chart to export.",true); return; }
    setExporting(true);
    try {
      const id = activeConfig?.id;
      if (!id) {
        notify("No active config — click Preview on a card first, then export.", true);
        return;
      }
      await new Promise(r=>setTimeout(r,50));
      const chartSvgStr=chartInst.current.renderToSVGString();
      const tblSvg=buildTableSVG(chartSeries,chartXLabels);
      const cW=chartDivRef.current?.offsetWidth||860;
      const cH=chartDivRef.current?.offsetHeight||400;
      const titleH=44, gap=16;
      const combined=
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cW}" height="${titleH+cH+gap+200}">` +
        `<rect width="${cW}" height="${titleH+cH+gap+200}" fill="#fff"/>` +
        `<text x="16" y="28" font-size="14" font-weight="700" fill="#101828" font-family="system-ui">${(activeConfig?.title||"KPI Report").replace(/&/g,"&amp;")}</text>` +
        `<svg x="0" y="${titleH}" width="${cW}" height="${cH}">${chartSvgStr}</svg>` +
        `<svg x="0" y="${titleH+cH+gap}" width="${cW}" height="180">${tblSvg}</svg>` +
        `</svg>`;
      await apiFetch(`/configs/${id}/export-svg`,{
        method:"POST",
        body:JSON.stringify({ svg_data:combined, report_data:{ config_id:id, generated_at:new Date().toISOString() } }),
      });
      loadConfigs();
      notify(`Chart exported for config #${id}`);
    } catch(e){ notify(e.message,true); }
    finally{ setExporting(false); }
  },[chartSeries,chartXLabels,activeConfig,loadConfigs,notify]);

  // Delete
  const deleteConfig = useCallback(async id=>{
    if (!window.confirm(`Delete config #${id} and all saved exports?`)) return;
    try {
      await apiFetch(`/configs/${id}`,{ method:"DELETE" });
      setConfigs(p=>p.filter(c=>c.id!==id));
      if (activeConfig?.id===id) { setActiveConfig(null); setChartSeries(null); setChartXLabels(null); }
      notify(`Config #${id} deleted`);
    } catch(e){ notify(e.message,true); }
  },[activeConfig,notify]);

  const openNew  = ()=>{ setDrawerCfg(null); setDrawerOpen(true); };
  const openEdit = cfg=>{ setDrawerCfg(cfg); setDrawerOpen(true); };

  const handleSaved = saved=>{
    loadConfigs();
    setDrawerOpen(false);
    // Always regenerate using the config returned by the server
    // This ensures activeConfig.id is correct even after an upsert
    regenerate(saved);
    notify(`Config #${saved.id} saved — loading chart…`);
  };

  // Filtered configs
  const filtered = configs.filter(c=>{
    if (statusFilter==="exported") return !!c.svg_id;
    if (statusFilter==="draft")    return !c.svg_id;
    return true;
  });

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <StyleInject/>
      <div className="kpi-root">

        {/* ── Top bar — matches Dept page ── */}
        <div className="kpi-topbar">
          <div className="kpi-topbar-badge">
            <span className="kpi-topbar-badge-dot"/>
            KPI Management
          </div>
          <div className="kpi-topbar-title">KPI Charts</div>
          <div className="kpi-topbar-sub">Configure and export charts for the annual report.</div>
        </div>

        {/* ── Action row ── */}
        <div className="kpi-action-row">
          <div className="kpi-action-left">
            <span className="kpi-action-label">Filter by status</span>
            <div style={{ display:"flex", gap:6 }}>
              {[
                { val:"all",      label:"All" },
                { val:"draft",    label:"Draft" },
                { val:"exported", label:"Exported" },
              ].map(f => (
                <button
                  key={f.val}
                  className="btn btn-sm"
                  style={{
                    borderColor: statusFilter===f.val ? C.blueMid : undefined,
                    background:  statusFilter===f.val ? C.blueLight : undefined,
                    color:       statusFilter===f.val ? C.blueMid : undefined,
                    fontWeight:  statusFilter===f.val ? 600 : 500,
                  }}
                  onClick={()=>setStatusFilter(f.val)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button className="btn btn-outline" onClick={loadConfigs}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
              Refresh
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New KPI Chart
            </button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="kpi-stats-bar">
          <span>
            <strong>{configs.length}</strong> total · <strong style={{ color: C.green }}>{configs.filter(c=>!!c.svg_id).length}</strong> exported · <strong style={{ color: C.amber }}>{configs.filter(c=>!c.svg_id).length}</strong> draft
            {activeConfig && <> · Viewing: <strong>{activeConfig.title}</strong></>}
          </span>
          {statusFilter !== "all" && (
            <span style={{ fontSize:12, color:C.muted }}>
              Showing <strong style={{ color:C.ink }}>{filtered.length}</strong> {statusFilter} chart{filtered.length!==1?"s":""}
              <button className="btn btn-sm" style={{ marginLeft:8, fontSize:11 }} onClick={()=>setStatusFilter("all")}>Clear filter</button>
            </span>
          )}
        </div>

        {/* ── Card grid ── */}
        <div className="kpi-card-grid">

          {cfgsLoading && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"48px", color:C.subtle, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <Spin dark size={20}/> <span style={{ fontSize:14 }}>Loading configurations…</span>
            </div>
          )}

          {!cfgsLoading && filtered.length===0 && (
            <div style={{ gridColumn:"1/-1" }}>
              <div className="empty">
                <div className="empty-title">No configurations found</div>
                <div className="empty-sub">Create a new KPI chart to get started.</div>
              </div>
            </div>
          )}

          {!cfgsLoading && filtered.map((cfg, idx) => {
            const isActive = activeConfig?.id===cfg.id;
            const isExported = !!cfg.svg_id;
            const iconLetters = cfg.table_name?.substring(0,4).toUpperCase()||"KPI";
            return (
              <div key={cfg.id} className="kpi-card" style={{ animationDelay:`${idx*0.04}s`, outline: isActive?`2px solid ${C.blueMid}`:undefined, outlineOffset:"2px" }}>
                <div className="kpi-card-top">
                  <div className="kpi-card-icon-wrap">
                    <div className="kpi-card-icon" style={cardIconStyle(idx)}>
                      {iconLetters}
                    </div>
                    <div>
                      <div className="kpi-card-name">{cfg.title}</div>
                      <div className="kpi-card-since">Since {fmtDate(cfg.created_at)}</div>
                    </div>
                  </div>
                  <span className={`status-badge ${isExported?"status-active":"status-draft"}`}>
                    {isExported ? "Exported" : "Draft"}
                  </span>
                </div>

                <div className="kpi-card-stats">
                  <div className="kpi-card-stat">
                    <div className="kpi-card-stat-label">Series</div>
                    <div className="kpi-card-stat-val">{(cfg.y_cols||[]).length}</div>
                  </div>
                  <div className="kpi-card-stat">
                    <div className="kpi-card-stat-label">Table</div>
                    <div className="kpi-card-stat-val mono">{cfg.table_name}</div>
                  </div>
                  <div className="kpi-card-stat">
                    <div className="kpi-card-stat-label">Chart</div>
                    <div className="kpi-card-stat-val mono">{cfg.chart_type}</div>
                  </div>
                </div>

                <div className="kpi-card-actions">
                  <button className="btn btn-sm" onClick={()=>openEdit(cfg)}>Edit</button>
                  <button className="btn btn-sm green" onClick={()=>regenerate(cfg)} disabled={generating}>
                    {generating&&activeConfig?.id===cfg.id ? <><Spin size={12}/></> : "Preview"}
                  </button>
                  <button className="btn btn-sm red" onClick={()=>deleteConfig(cfg.id)}>Delete</button>
                </div>
              </div>
            );
          })}

          {/* New config card */}
          {!cfgsLoading && (
            <div className="kpi-card-new" onClick={openNew}>
              <div className="kpi-card-new-icon">+</div>
              <div className="kpi-card-new-text">New KPI Chart</div>
            </div>
          )}
        </div>

        {/* ── Chart view ── */}
        {chartSeries && chartXLabels && yRange && activeConfig && (
          <div className="chart-page">
            <div className="chart-card">

              {/* Header */}
              <div className="chart-card-header">
                <div>
                  <div className="chart-card-title">{activeConfig.title}</div>
                  <div className="chart-card-sub">
                    {activeConfig.table_name} · {chartXLabels.length} periods · {chartSeries.length} series
                    {fetchedAt && <> · {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>}
                    {rowCount!=null && <> · {rowCount} rows</>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <div className="pill-row">
                    {CHART_TYPES.map(ct=>(
                      <button key={ct.value} className={`pill${chartType===ct.value?" active":""}`} onClick={()=>setChartType(ct.value)}>
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ padding:"12px 24px 0", display:"flex", flexWrap:"wrap", gap:16 }}>
                {chartSeries.map(s=>(
                  <span key={s.name} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12.5, color:C.muted }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }}/>
                    {s.name}
                  </span>
                ))}
              </div>

              {/* Chart */}
              {!eReady
                ? <div style={{ height:360, display:"flex", alignItems:"center", justifyContent:"center", gap:10, color:C.subtle }}><Spin dark size={20}/> Loading chart…</div>
                : <div ref={chartRefCb} style={{ width:"100%", height:380, padding:"8px 0" }}/>
              }

              {/* SQL */}
              <hr className="divider"/>
              <div style={{ padding:"14px 24px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:showSql?10:0 }}>
                  <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:C.subtle }}>Stored Query</span>
                  <button className="btn btn-sm" onClick={()=>setShowSql(v=>!v)}>{showSql?"Hide SQL":"Show SQL"}</button>
                </div>
                {showSql && <SqlBlock sql={displaySql}/>}
              </div>

              {/* Data table */}
              <hr className="divider"/>
              <div style={{ padding:"14px 24px" }}>
                <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:C.subtle, marginBottom:10 }}>
                  Data Preview — {chartSeries.length} series × {chartXLabels.length} periods
                </div>
                <div style={{ overflowX:"auto", border:`1px solid ${C.line}`, borderRadius:8 }}>
                  <table className="data-tbl">
                    <thead>
                      <tr>
                        <th>Series</th>
                        {chartXLabels.map(l=><th key={l}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {chartSeries.map((s,si)=>(
                        <tr key={s.name}>
                          <td>
                            <span style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <span style={{ width:9, height:9, borderRadius:2, background:s.color, flexShrink:0 }}/>
                              {s.name}
                            </span>
                          </td>
                          {s.data.map((v,ci)=><td key={ci}>{fmtNum(v)}</td>)}
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td>Total</td>
                        {chartXLabels.map((_,ci)=>(
                          <td key={ci}>{fmtNum(chartSeries.reduce((a,s)=>a+(Number(s.data[ci])||0),0))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Export footer */}
              <hr className="divider"/>
              <div style={{ padding:"16px 24px", background:C.lineLight, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:13.5, fontWeight:600, color:C.ink }}>Export to Annual Report</div>
                  <div style={{ fontSize:12, color:C.subtle, marginTop:2 }}>
                    Saves the rendered SVG permanently to the report. Only do this when data is finalised.
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-outline" onClick={()=>regenerate(activeConfig)} disabled={generating}>
                    {generating?<><Spin size={13} dark/> Refreshing…</>:"Refresh Data"}
                  </button>
                  <button className="btn btn-export" onClick={exportSvg} disabled={exporting||!eReady}>
                    {exporting?<><Spin size={13}/> Exporting…</>:"Export SVG to Report"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Drawer */}
        {drawerOpen && (
          <ConfigDrawer
            cfg={drawerCfg}
            tables={tables}
            existingConfigs={configs}
            onClose={()=>setDrawerOpen(false)}
            onSaved={handleSaved}
            onRegenerate={regenerate}
            notify={notify}
          />
        )}

        <Toast msg={toast} isErr={toastErr}/>
      </div>
    </>
  );
}