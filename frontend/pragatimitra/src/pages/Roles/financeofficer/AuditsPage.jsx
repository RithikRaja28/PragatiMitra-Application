"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";

// ─── API base ─────────────────────────────────────────────────────────────────
// Update this to match your backend PORT (default 3000)
const API = "http://localhost:3000/api/radiology";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

// ─── constants ────────────────────────────────────────────────────────────────
const PERIODS = [
  "Apr-24","May-24","Jun-24","Jul-24","Aug-24","Sep-24",
  "Oct-24","Nov-24","Dec-24","Jan-25","Feb-25","Mar-25",
  "Apr-25","May-25","Jun-25","Jul-25","Aug-25","Sep-25",
];

const SERIES_KEYS  = ["x_ray", "usg", "bmd", "ct_scan"];
const SERIES_LABEL = { x_ray: "X-ray", usg: "USG", bmd: "BMD", ct_scan: "CT Scan" };
const COLORS       = ["#378ADD", "#1D9E75", "#D85A30", "#BA7517"];

const CHART_TYPES = [
  { value: "bar",       label: "Grouped bar"      },
  { value: "line",      label: "Line"              },
  { value: "area",      label: "Area (fill)"       },
  { value: "bar_stack", label: "Stacked bar"       },
  { value: "pie",       label: "Pie (totals)"      },
  { value: "doughnut",  label: "Doughnut (totals)" },
  { value: "radar",     label: "Radar"             },
  { value: "scatter",   label: "Scatter"           },
];

const ECHARTS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js";

// ─── helpers ──────────────────────────────────────────────────────────────────
function calcTotals(data) {
  return SERIES_KEYS.reduce((acc, k) => {
    acc[k] = data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return acc;
  }, {});
}
function peakPeriod(data, key) {
  if (!data.length) return "—";
  return data.reduce((a, b) => (Number(a[key]) > Number(b[key]) ? a : b)).period;
}
function buildInsertSQL(data) {
  return (
    "INSERT INTO medical_reports (period, x_ray, usg, bmd, ct_scan) VALUES\n" +
    data
      .map((r) => `('${r.period}', ${r.x_ray}, ${r.usg}, ${r.bmd}, ${r.ct_scan})`)
      .join(",\n") +
    "\nON CONFLICT (period) DO UPDATE\n" +
    "  SET x_ray=EXCLUDED.x_ray, usg=EXCLUDED.usg,\n" +
    "      bmd=EXCLUDED.bmd, ct_scan=EXCLUDED.ct_scan;"
  );
}

// ─── Pure-SVG table builder — HORIZONTAL layout ───────────────────────────────
// Periods = columns, selected series = rows
function buildTableSVG(data, activeCols) {
  const cols   = activeCols && activeCols.length ? activeCols : SERIES_KEYS;

  const rowLabelW = 70;   // width of the left "series name" column
  const colW      = 54;   // width of each period column
  const rowH      = 26;   // height of each row
  const hdrH      = 32;   // height of the period header row
  const pad       = 10;

  const W = pad + rowLabelW + data.length * colW + pad;
  const H = pad + hdrH + cols.length * rowH + rowH + pad; // +1 row for Totals

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/>`;

  // ── Header row: blank corner + period names ──────────────
  // Corner cell
  s += `<rect x="${pad}" y="${pad}" width="${rowLabelW}" height="${hdrH - 4}" fill="#f1efe8" rx="3"/>`;

  data.forEach((row, ci) => {
    const x = pad + rowLabelW + ci * colW;
    s += `<rect x="${x}" y="${pad}" width="${colW - 2}" height="${hdrH - 4}" fill="#f1efe8" rx="3"/>`;
    s += `<text x="${x + colW / 2}" y="${pad + hdrH / 2 + 4}" ` +
         `text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" ` +
         `font-family="system-ui,sans-serif">${row.period}</text>`;
  });

  // ── Data rows: one per selected series ───────────────────
  cols.forEach((k, ri) => {
    const y  = pad + hdrH + ri * rowH;
    const bg = ri % 2 === 0 ? "#ffffff" : "#f8f8f6";

    // Row background
    s += `<rect x="${pad}" y="${y}" width="${W - pad * 2}" height="${rowH}" fill="${bg}"/>`;

    // Series label cell
    s += `<text x="${pad + 8}" y="${y + rowH / 2 + 4}" ` +
         `font-size="11" font-weight="600" fill="#5f5e5a" ` +
         `font-family="system-ui,sans-serif">${SERIES_LABEL[k]}</text>`;

    // Value cells
    data.forEach((row, ci) => {
      const x = pad + rowLabelW + ci * colW;
      s += `<text x="${x + colW / 2}" y="${y + rowH / 2 + 4}" ` +
           `text-anchor="middle" font-size="11" fill="#2c2c2a" ` +
           `font-family="system-ui,sans-serif">${Number(row[k]).toLocaleString()}</text>`;
    });

    // Bottom divider
    s += `<line x1="${pad}" y1="${y + rowH}" x2="${W - pad}" y2="${y + rowH}" stroke="#e2e0d8" stroke-width="0.5"/>`;
  });

  // ── Totals row ────────────────────────────────────────────
  const totY = pad + hdrH + cols.length * rowH;
  s += `<rect x="${pad}" y="${totY}" width="${W - pad * 2}" height="${rowH}" fill="#e6f1fb" rx="3"/>`;

  // "Total" label
  s += `<text x="${pad + 8}" y="${totY + rowH / 2 + 4}" ` +
       `font-size="11" font-weight="600" fill="#185fa5" ` +
       `font-family="system-ui,sans-serif">Total</text>`;

  // Column totals
  data.forEach((row, ci) => {
    const x    = pad + rowLabelW + ci * colW;
    const colTotal = cols.reduce((sum, k) => sum + (Number(row[k]) || 0), 0);
    s += `<text x="${x + colW / 2}" y="${totY + rowH / 2 + 4}" ` +
         `text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" ` +
         `font-family="system-ui,sans-serif">${colTotal.toLocaleString()}</text>`;
  });

  s += "</svg>";
  return { svg: s, w: W, h: H };
}

// ─── ECharts option builder ───────────────────────────────────────────────────
function buildEChartsOption(data, chartType, yAxis) {
  const periods = data.map((r) => r.period);
  const tot     = calcTotals(data);
  const isPie   = chartType === "pie" || chartType === "doughnut";
  const isRadar = chartType === "radar";
  const isScat  = chartType === "scatter";
  const isStack = chartType === "bar_stack";
  const isArea  = chartType === "area";
  const isLine  = chartType === "line" || isArea;

  if (isPie) {
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [{
        type: "pie",
        radius: chartType === "doughnut" ? ["40%", "68%"] : "65%",
        data: yAxis.map((k, i) => ({
          name: SERIES_LABEL[k], value: tot[k],
          itemStyle: { color: COLORS[i % COLORS.length] },
        })),
        label: { fontSize: 11 },
      }],
    };
  }
  if (isRadar) {
    const indicators = yAxis.map((k) => ({
      name: SERIES_LABEL[k],
      max: Math.max(...data.map((r) => Number(r[k]))) * 1.2 || 100,
    }));
    return {
      tooltip: {},
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      radar: { indicator: indicators, radius: "60%", axisName: { fontSize: 11 } },
      series: data.map((row, ri) => ({
        type: "radar", name: row.period,
        data: [{ value: yAxis.map((k) => Number(row[k])), name: row.period }],
        lineStyle: { width: 1.5, opacity: 0.7 },
        symbol: "none",
        areaStyle: { opacity: 0.05 },
        itemStyle: { color: `hsl(${(ri * 28) % 360},55%,48%)` },
      })),
    };
  }
  if (isScat) {
    const k0 = yAxis[0] || "x_ray", k1 = yAxis[1] || "usg";
    return {
      tooltip: {
        formatter: (p) =>
          `${p.name}<br/>${SERIES_LABEL[k0]}: ${p.value[0]}<br/>${SERIES_LABEL[k1]}: ${p.value[1]}`,
      },
      xAxis: { name: SERIES_LABEL[k0], nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
      yAxis: { name: SERIES_LABEL[k1], nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
      series: [{
        type: "scatter",
        data: data.map((r) => ({ value: [Number(r[k0]), Number(r[k1])], name: r.period })),
        symbolSize: 10, itemStyle: { color: COLORS[0] },
        label: { show: true, formatter: (p) => p.name, fontSize: 9, position: "top" },
      }],
    };
  }
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      data: yAxis.map((k) => SERIES_LABEL[k]),
      textStyle: { fontSize: 11 },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 60 },
    xAxis: {
      type: "category",
      data: periods,
      axisLabel: { fontSize: 10, rotate: 30, interval: 0 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: yAxis.map((k, i) => ({
      name: SERIES_LABEL[k],
      type: isLine ? "line" : "bar",
      stack: isStack ? "total" : undefined,
      data: data.map((r) => Number(r[k])),
      itemStyle: { color: COLORS[i % COLORS.length] },
      areaStyle: isArea
        ? { opacity: 0.18, color: COLORS[i % COLORS.length] }
        : undefined,
      smooth: isLine,
      symbol: isLine ? "circle" : undefined,
      symbolSize: isLine ? 5 : undefined,
    })),
  };
}

// ─── UI components ────────────────────────────────────────────────────────────
function Toast({ msg, isError }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      background: isError ? "#fee2e2" : "var(--color-background-primary)",
      border: `0.5px solid ${isError ? "#f87171" : "var(--color-border-secondary)"}`,
      borderRadius: "var(--border-radius-md)",
      padding: "10px 16px", fontSize: 13, zIndex: 9999,
      boxShadow: "0 2px 8px rgba(0,0,0,.08)",
      color: isError ? "#991b1b" : "inherit", maxWidth: 440,
    }}>{msg}</div>
  );
}
function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "1.25rem", marginBottom: "1.25rem", ...style,
    }}>{children}</div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, textTransform: "uppercase",
      letterSpacing: ".08em", color: "var(--color-text-tertiary)",
      marginBottom: ".6rem",
    }}>{children}</div>
  );
}
function Th({ children, w }) {
  return (
    <th style={{
      background: "var(--color-background-secondary)", fontWeight: 500,
      fontSize: 12, color: "var(--color-text-secondary)",
      padding: "8px 12px", textAlign: "left",
      position: "sticky", top: 0, zIndex: 2,
      borderBottom: "0.5px solid var(--color-border-tertiary)", width: w,
    }}>{children}</th>
  );
}
function Btn({ children, onClick, variant, disabled, loading }) {
  const map = {
    info:    ["var(--color-background-info)",    "var(--color-text-info)"],
    success: ["var(--color-background-success)", "var(--color-text-success)"],
    danger:  ["var(--color-background-danger)",  "var(--color-text-danger)"],
    warning: ["var(--color-background-warning)", "var(--color-text-warning)"],
  };
  const [bg, color] = map[variant] || ["transparent", "var(--color-text-primary)"];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: "var(--border-radius-md)",
        padding: "6px 14px", fontSize: 13, background: bg, color,
        cursor: (disabled || loading) ? "not-allowed" : "pointer",
        fontFamily: "var(--font-sans)",
        opacity: (disabled || loading) ? 0.6 : 1,
      }}
    >
      {loading ? "…" : children}
    </button>
  );
}
function CtrlGroup({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}
function SelectCtrl({ value, onChange, children, multiple, style: s, disabled }) {
  return (
    <select
      value={value}
      onChange={onChange}
      multiple={multiple}
      disabled={disabled}
      style={{
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: "var(--border-radius-md)",
        padding: "5px 10px", fontSize: 13,
        background: "var(--color-background-primary)",
        color: "var(--color-text-primary)", ...s,
      }}
    >{children}</select>
  );
}

// ─── Error screen shown when backend is unreachable ───────────────────────────
function DbErrorScreen({ error, onRetry }) {
  return (
    <div style={{
      padding: "3rem", textAlign: "center", maxWidth: 520, margin: "4rem auto",
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
    }}>
      <AlertTriangle size={36} strokeWidth={1.6} color="#d97706" style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
        Cannot connect to backend
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
        {error}
      </div>
      <div style={{
        background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)",
        padding: "12px 16px", fontSize: 12, color: "var(--color-text-secondary)", textAlign: "left",
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Checklist:</div>
        <div>1. Start your backend: <code>node server.js</code></div>
        <div>2. Confirm <code>PORT=3000</code> in <code>.env</code> (or update API constant)</div>
        <div>3. Verify DB credentials in <code>.env</code></div>
        <div>4. Ensure PostgreSQL service is running</div>
        <div>5. Check CORS allows <code>{window.location.origin}</code></div>
        <div style={{ marginTop: 8, wordBreak: "break-all" }}>
          Connecting to: <code>{API}/reports</code>
        </div>
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 20, padding: "8px 20px", fontSize: 13, cursor: "pointer",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "var(--border-radius-md)",
          background: "var(--color-background-info)", color: "var(--color-text-info)",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RadiologyPage() {
  const [data,         setData]         = useState([]);
  const [dbStatus,     setDbStatus]     = useState("loading"); // loading | connected | error
  const [dbError,      setDbError]      = useState("");
  const [editCell,     setEditCell]     = useState(null);
  const [editVal,      setEditVal]      = useState("");
  const [showSQL,      setShowSQL]      = useState(false);
  const [chartType,    setChartType]    = useState("bar");
  const [yAxis,        setYAxis]        = useState(["x_ray", "usg", "bmd", "ct_scan"]);
  const [svgStore,     setSvgStore]     = useState([]);
  const [workflowMsg,  setWorkflowMsg]  = useState(null);
  const [toast,        setToast]        = useState("");
  const [toastError,   setToastError]   = useState(false);
  const [newRow,       setNewRow]       = useState({
    period: "", x_ray: "", usg: "", bmd: "", ct_scan: "",
  });
  const [echartsReady, setEchartsReady] = useState(false);
  const [busy,         setBusy]         = useState({});

  const chartDivRef    = useRef(null);
  const chartInst      = useRef(null);
  const echartsReadyRef = useRef(false);
  const yAxisRef       = useRef(["x_ray", "usg", "bmd", "ct_scan"]); // always current
  const dataRef        = useRef([]);                                   // always current

  // Keep a snapshot for rollback on optimistic updates
  const dataSnapshot = useRef([]);

  const showToast = useCallback((msg, isErr = false, dur = 3500) => {
    setToast(msg);
    setToastError(isErr);
    const t = setTimeout(() => setToast(""), dur);
    return () => clearTimeout(t);
  }, []);

  const setBusyKey = (key, val) =>
    setBusy((p) => ({ ...p, [key]: val }));

  // Keep refs in sync with state so callbacks always read current values
  useEffect(() => { yAxisRef.current = yAxis; }, [yAxis]);
  useEffect(() => { dataRef.current  = data;  }, [data]);

  // ── Load data from DB on mount (and on manual retry) ────
  const loadData = useCallback(() => {
    setDbStatus("loading");
    apiFetch("/reports")
      .then((rows) => {
        const filtered = rows.filter((r) => r.period !== "Total");
        setData(filtered);
        dataSnapshot.current = filtered;
        setDbStatus("connected");
      })
      .catch((err) => {
        setDbStatus("error");
        setDbError(err.message);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Also load existing SVG records on mount ──────────────
  useEffect(() => {
    apiFetch("/svgs")
      .then((rows) => {
        setSvgStore(
          rows.map((r) => ({
            ...r,
            size: r.svg_bytes ? Math.round(r.svg_bytes / 1024) + " KB" : "—",
          }))
        );
      })
      .catch(() => {
        // Non-fatal — SVG store is optional
      });
  }, []);

  // ── Load ECharts from CDN once ───────────────────────────
  useEffect(() => {
    const tryInit = () => {
      echartsReadyRef.current = true;
      setEchartsReady(true);
      // If the chart div is already mounted, init immediately
      if (chartDivRef.current && !chartInst.current) {
        initChart(chartDivRef.current);
      }
    };
    if (window.echarts) { tryInit(); return; }
    const sc = document.createElement("script");
    sc.src = ECHARTS_CDN;
    sc.onload = tryInit;
    sc.onerror = () => showToast("Failed to load ECharts from CDN", true);
    document.head.appendChild(sc);
  }, []); // eslint-disable-line

  // ── Stable init function (doesn't close over state) ─────
  const initChart = useCallback((el) => {
    if (!el || !window.echarts) return;
    if (chartInst.current) {
      try { chartInst.current.dispose(); } catch (_) {}
      chartInst.current = null;
    }
    chartInst.current = window.echarts.init(el, null, { renderer: "svg" });
    // Render with current data via the latest renderChart
    chartInst.current.setOption(
      buildEChartsOption(data, chartType, yAxis), true
    );
    const obs = new ResizeObserver(() => chartInst.current?.resize());
    obs.observe(el);
  }, []); // eslint-disable-line — intentionally stable

  // ── Ref callback: fires when the div mounts/unmounts ─────
  const chartRefCallback = useCallback((el) => {
    chartDivRef.current = el;
    if (el && echartsReadyRef.current && !chartInst.current) {
      // Small timeout lets the div get layout dimensions first
      setTimeout(() => initChart(el), 0);
    }
  }, []); // eslint-disable-line

  // ── Re-render chart whenever data / type / series change ─
  const renderChart = useCallback(() => {
    if (!chartInst.current) {
      // Chart not yet init — try now if div + echarts both ready
      if (chartDivRef.current && echartsReadyRef.current) {
        initChart(chartDivRef.current);
      }
      return;
    }
    chartInst.current.setOption(buildEChartsOption(data, chartType, yAxis), true);
  }, [data, chartType, yAxis]); // eslint-disable-line

  useEffect(() => { renderChart(); }, [renderChart]);

  // ── Click numeric cell to edit → upsert to DB ───────────
  const startEdit = (rowIdx, key) => {
    setEditCell({ rowIdx, key });
    setEditVal(String(data[rowIdx][key]));
  };

  const commitEdit = async () => {
    if (!editCell) return;
    const { rowIdx, key } = editCell;
    const updatedVal = parseInt(editVal, 10) || 0;
    const prev       = data[rowIdx];
    const updatedRow = { ...prev, [key]: updatedVal };

    // Optimistic update
    setData((d) => d.map((r, i) => (i === rowIdx ? updatedRow : r)));
    setEditCell(null);

    setBusyKey(`edit_${rowIdx}_${key}`, true);
    try {
      await apiFetch("/reports", {
        method: "POST",
        body: JSON.stringify({
          period:  updatedRow.period,
          x_ray:   updatedRow.x_ray,
          usg:     updatedRow.usg,
          bmd:     updatedRow.bmd,
          ct_scan: updatedRow.ct_scan,
        }),
      });
      showToast(`✓ ${SERIES_LABEL[key]} updated for ${updatedRow.period}`);
    } catch (e) {
      // Rollback
      setData((d) => d.map((r, i) => (i === rowIdx ? prev : r)));
      showToast(`✗ Update failed: ${e.message}`, true);
    } finally {
      setBusyKey(`edit_${rowIdx}_${key}`, false);
    }
  };

  // ── Period rename → PUT /reports/:period ─────────────────
  const handlePeriodChange = async (rowIdx, newPeriod) => {
    const oldPeriod = data[rowIdx].period;
    if (oldPeriod === newPeriod) return;

    setData((d) => d.map((r, i) => (i === rowIdx ? { ...r, period: newPeriod } : r)));
    setBusyKey(`period_${oldPeriod}`, true);

    try {
      await apiFetch(`/reports/${encodeURIComponent(oldPeriod)}`, {
        method: "PUT",
        body: JSON.stringify({ new_period: newPeriod }),
      });
      showToast(`✓ Period renamed to ${newPeriod}`);
    } catch (e) {
      setData((d) => d.map((r, i) => (i === rowIdx ? { ...r, period: oldPeriod } : r)));
      showToast(`✗ ${e.message}`, true);
    } finally {
      setBusyKey(`period_${oldPeriod}`, false);
    }
  };

  // ── Insert new row → POST /reports ───────────────────────
  const insertRow = async () => {
    if (!newRow.period) { showToast("Select a period first", true); return; }

    const payload = {
      period:  newRow.period,
      x_ray:   parseInt(newRow.x_ray, 10)   || 0,
      usg:     parseInt(newRow.usg, 10)     || 0,
      bmd:     parseInt(newRow.bmd, 10)     || 0,
      ct_scan: parseInt(newRow.ct_scan, 10) || 0,
    };

    setBusyKey("insert", true);
    try {
      const saved = await apiFetch("/reports", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setData((prev) => {
        const next = [...prev.filter((r) => r.period !== saved.period), saved];
        // Re-sort by canonical order
        next.sort((a, b) => {
          const ai = PERIODS.indexOf(a.period);
          const bi = PERIODS.indexOf(b.period);
          if (ai === -1 && bi === -1) return a.period.localeCompare(b.period);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        return next;
      });
      setNewRow({ period: "", x_ray: "", usg: "", bmd: "", ct_scan: "" });
      showToast(`✓ Row "${saved.period}" inserted into medical_reports`);
    } catch (e) {
      showToast(`✗ Insert failed: ${e.message}`, true);
    } finally {
      setBusyKey("insert", false);
    }
  };

  // ── Delete row ────────────────────────────────────────────
  const deleteRow = async (period) => {
    if (!window.confirm(`Delete row "${period}"?`)) return;
    setBusyKey(`del_${period}`, true);
    try {
      await apiFetch(`/reports/${encodeURIComponent(period)}`, { method: "DELETE" });
      setData((d) => d.filter((r) => r.period !== period));
      showToast(`✓ Row "${period}" deleted`);
    } catch (e) {
      showToast(`✗ Delete failed: ${e.message}`, true);
    } finally {
      setBusyKey(`del_${period}`, false);
    }
  };

  // ── Save combined chart+table SVG → DB ───────────────────
  const saveChartSVG = async (status = "draft") => {
    // If chart hasn't init yet, try now
    if (!chartInst.current && chartDivRef.current && window.echarts) {
      initChart(chartDivRef.current);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!chartInst.current) { showToast("Chart not ready — click Refresh chart first", true); return; }

    // Read from refs — always the current value, never a stale closure
    const currentData  = dataRef.current;
    const currentYAxis = yAxisRef.current;

    if (currentData.length === 0) { showToast("No data to save", true); return; }

    const chartSvgStr = chartInst.current.renderToSVGString();
    const tbl     = buildTableSVG(currentData, currentYAxis);
    const titleH  = 36;
    const gap     = 16;   // gap between chart and table
    const padding = 20;   // left/right padding around table

    // Chart takes full container width, fixed height
    const cW = chartDivRef.current?.offsetWidth  || 800;
    const cH = chartDivRef.current?.offsetHeight || 360;

    // Table is horizontal (wide & short) — place below chart
    // Scale table to fit within chart width if it's wider
    const tblScale  = tbl.w > (cW - padding * 2)
      ? (cW - padding * 2) / tbl.w
      : 1;
    const tblDispW  = Math.round(tbl.w  * tblScale);
    const tblDispH  = Math.round(tbl.h  * tblScale);

    const totalW = cW;
    const totalH = titleH + cH + gap + tblDispH + 16;

    const combined =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">` +
      `<rect width="${totalW}" height="${totalH}" fill="#ffffff"/>` +
      // Title
      `<text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" ` +
        `font-family="system-ui,sans-serif">` +
        `AIIA — Radiology Tests Apr 2024 to Mar 2025` +
      `</text>` +
      // Chart — full width
      `<svg x="0" y="${titleH}" width="${cW}" height="${cH}">${chartSvgStr}</svg>` +
      // Horizontal table below, scaled to fit & centred
      `<svg x="${Math.round((totalW - tblDispW) / 2)}" y="${titleH + cH + gap}" ` +
           `width="${tblDispW}" height="${tblDispH}" ` +
           `viewBox="0 0 ${tbl.w} ${tbl.h}" preserveAspectRatio="xMidYMid meet">` +
        tbl.svg +
      `</svg>` +
      `</svg>`;
      `</svg>`;
      `</svg>`;

    // Filtered JSON — only selected series + period
    const reportData = {
      chart_type:    chartType,
      series:        currentYAxis,
      series_labels: currentYAxis.map((k) => SERIES_LABEL[k]),
      periods:       currentData.map((r) => r.period),
      rows: currentData.map((r) => ({
        period: r.period,
        ...Object.fromEntries(currentYAxis.map((k) => [k, Number(r[k])])),
      })),
      totals: Object.fromEntries(
        currentYAxis.map((k) => [
          k,
          currentData.reduce((s, r) => s + (Number(r[k]) || 0), 0),
        ])
      ),
      generated_at: new Date().toISOString(),
    };

    setBusyKey(`svg_${status}`, true);
    try {
      const saved = await apiFetch("/save-svg", {
        method: "POST",
        body: JSON.stringify({
          title:       "AIIA Radiology Tests Apr 2024 – Mar 2025",
          description: `FY 2024–25 | chart: ${chartType} | series: ${currentYAxis.map((k) => SERIES_LABEL[k]).join(", ")}`,
          svg_data:    combined,
          report_data: reportData,
          status,
          chart_type:  chartType,
        }),
      });
      const entry = {
        ...saved,
        size: Math.round(combined.length / 1024) + " KB",
      };
      setSvgStore((prev) => [entry, ...prev]);
      setWorkflowMsg(status);
      showToast(`✓ SVG saved to svg_reports — status: ${status} (id: ${saved.id})`);
    } catch (e) {
      showToast(`✗ SVG save failed: ${e.message}`, true);
    } finally {
      setBusyKey(`svg_${status}`, false);
    }
  };

  // ── Workflow status transition ────────────────────────────
  const changeStatus = async (id, newStatus) => {
    try {
      const updated = await apiFetch(`/svgs/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setSvgStore((prev) =>
        prev.map((r) => r.id === id ? { ...r, status: updated.status } : r)
      );
      showToast(`✓ Report #${id} → ${newStatus}`);
    } catch (e) {
      showToast(`✗ ${e.message}`, true);
    }
  };

  // ── Loading screen ───────────────────────────────────────
  if (dbStatus === "loading") {
    return (
      <div style={{
        padding: "3rem", textAlign: "center",
        color: "var(--color-text-secondary)", fontSize: 14,
      }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
        Connecting to database…
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          {API}/reports
        </div>
      </div>
    );
  }

  // ── Error screen ─────────────────────────────────────────
  if (dbStatus === "error") {
    return <DbErrorScreen error={dbError} onRetry={loadData} />;
  }

  // ── Main UI ──────────────────────────────────────────────
  const tot         = calcTotals(data);
  const usedPeriods = new Set(data.map((r) => r.period));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, fontFamily: "var(--font-sans)" }}>

      {/* ── Title card ──────────────────────────────────── */}
      <Card>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>
              All India Institute of Ayurveda (AIIA), New Delhi
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
              Radiology Tests Report — April 2024 to March 2025
            </div>
            <span style={{
              display: "inline-block", fontSize: 11, padding: "3px 10px",
              borderRadius: 20,
              background: "var(--color-background-info)",
              color: "var(--color-text-info)", marginTop: 8,
            }}>
              Financial Year 2024–25
            </span>
          </div>

          <div style={{
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: 12, color: "var(--color-text-secondary)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                display: "inline-block", background: "#22c55e",
              }} />
              PostgreSQL connected · {data.length} rows
            </span>
            <Btn variant="success" loading={busy.svg_draft}
              onClick={() => saveChartSVG("draft")}>
              Save as Draft
            </Btn>
            <Btn variant="warning" loading={busy.svg_approval}
              onClick={() => saveChartSVG("approval")}>
              Send for Approval
            </Btn>
            <Btn variant="info" loading={busy.svg_final}
              onClick={() => saveChartSVG("final")}>
              Save Final SVG → DB
            </Btn>
          </div>
        </div>
      </Card>

      {/* ── KPI cards ───────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 10, marginBottom: "1.25rem",
      }}>
        {SERIES_KEYS.map((k, i) => (
          <div key={k} style={{
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            padding: "0.9rem 1rem",
            borderLeft: `3px solid ${COLORS[i]}`,
          }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Total {SERIES_LABEL[k]}
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {tot[k].toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3 }}>
              Peak: {peakPeriod(data, k)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Data table ──────────────────────────────────── */}
      <Card>
        <SectionLabel>
          Data table — edits &amp; inserts saved directly to PostgreSQL
          &nbsp;·&nbsp;{data.length} rows loaded
        </SectionLabel>

        <div style={{
          overflowX: "auto", maxHeight: 380, overflowY: "auto",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <Th w={130}>Period</Th>
                {SERIES_KEYS.map((k) => <Th key={k} w={90}>{SERIES_LABEL[k]}</Th>)}
                <Th w={50}></Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{
                    padding: "2rem", textAlign: "center",
                    color: "var(--color-text-tertiary)", fontSize: 13,
                  }}>
                    No data yet — insert a row below.
                  </td>
                </tr>
              ) : (
                data.map((row, ri) => (
                  <tr key={row.period + ri}>
                    {/* Period dropdown — PUT to DB */}
                    <td style={{
                      padding: "5px 10px",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                    }}>
                      <SelectCtrl
                        value={row.period}
                        disabled={!!busy[`period_${row.period}`]}
                        onChange={(e) => handlePeriodChange(ri, e.target.value)}
                        style={{ width: "100%", padding: "3px 6px" }}
                      >
                        {PERIODS.map((p) => (
                          <option
                            key={p} value={p}
                            disabled={usedPeriods.has(p) && p !== row.period}
                          >
                            {p}{usedPeriods.has(p) && p !== row.period ? " ✓" : ""}
                          </option>
                        ))}
                      </SelectCtrl>
                    </td>

                    {/* Numeric cells — click to edit → upsert */}
                    {SERIES_KEYS.map((k) => {
                      const isEditing =
                        editCell?.rowIdx === ri && editCell?.key === k;
                      return (
                        <td
                          key={k}
                          onClick={() => !isEditing && startEdit(ri, k)}
                          title="Click to edit — saves to DB"
                          style={{
                            padding: "6px 12px", cursor: "text",
                            borderBottom: "0.5px solid var(--color-border-tertiary)",
                            background: isEditing
                              ? "var(--color-background-info)" : undefined,
                            color: isEditing
                              ? "var(--color-text-info)" : undefined,
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus type="number" value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")  commitEdit();
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              style={{
                                width: "100%", border: "none",
                                background: "transparent", fontSize: 13,
                                fontFamily: "var(--font-sans)",
                                color: "var(--color-text-primary)", outline: "none",
                              }}
                            />
                          ) : (
                            Number(row[k]).toLocaleString()
                          )}
                        </td>
                      );
                    })}

                    {/* Delete button */}
                    <td style={{
                      padding: "6px 8px",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                    }}>
                      <Btn
                        variant="danger"
                        loading={!!busy[`del_${row.period}`]}
                        onClick={() => deleteRow(row.period)}
                      >
                        ✕
                      </Btn>
                    </td>
                  </tr>
                ))
              )}

              {/* Totals row */}
              {data.length > 0 && (
                <tr style={{
                  background: "var(--color-background-secondary)", fontWeight: 500,
                }}>
                  <td style={{ padding: "7px 12px" }}>Total</td>
                  {SERIES_KEYS.map((k) => (
                    <td key={k} style={{ padding: "7px 12px" }}>
                      {tot[k].toLocaleString()}
                    </td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Insert new row ─────────────────────────────────── */}
        <div style={{
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "1rem", marginTop: ".75rem",
        }}>
          <SectionLabel>Insert new row → saved to medical_reports</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5,1fr) auto",
            gap: 8, alignItems: "center",
          }}>
            <SelectCtrl
              value={newRow.period}
              onChange={(e) => setNewRow((p) => ({ ...p, period: e.target.value }))}
              style={{ width: "100%" }}
            >
              <option value="">— Period —</option>
              {PERIODS.filter((p) => !usedPeriods.has(p)).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </SelectCtrl>

            {SERIES_KEYS.map((k) => (
              <input
                key={k} type="number" placeholder={SERIES_LABEL[k]}
                value={newRow[k]}
                onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.value }))}
                style={{
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "5px 8px", fontSize: 13,
                  background: "var(--color-background-primary)",
                  color: "var(--color-text-primary)", width: "100%",
                }}
              />
            ))}

            <Btn variant="info" onClick={insertRow} loading={busy.insert}>
              + Insert
            </Btn>
          </div>
        </div>

        {/* Show SQL ─────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginTop: ".75rem" }}>
          <Btn onClick={() => setShowSQL((v) => !v)}>
            {showSQL ? "Hide" : "Show"} insert SQL
          </Btn>
        </div>
        {showSQL && (
          <pre style={{
            marginTop: ".75rem", fontSize: 11,
            background: "var(--color-background-secondary)",
            padding: ".75rem", borderRadius: "var(--border-radius-md)",
            overflowX: "auto", color: "var(--color-text-primary)",
          }}>
            {buildInsertSQL(data)}
          </pre>
        )}
      </Card>

      {/* ── Chart generator ─────────────────────────────── */}
      <Card>
        <SectionLabel>Chart generator — Apache ECharts (SVG renderer)</SectionLabel>

        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap",
          alignItems: "flex-end", marginBottom: "1rem",
        }}>
          <CtrlGroup label="Chart type">
            <SelectCtrl
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
            >
              {CHART_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </SelectCtrl>
          </CtrlGroup>

          <CtrlGroup label="X-axis">
            <SelectCtrl value="period" onChange={() => {}} style={{ opacity: 0.6 }}>
              <option>Period (monthly)</option>
            </SelectCtrl>
          </CtrlGroup>

          <CtrlGroup label="Y-axis / series (Ctrl+click to multi-select)">
            <SelectCtrl
              value={yAxis}
              onChange={(e) =>
                setYAxis(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
              multiple
              style={{ height: 74 }}
            >
              {SERIES_KEYS.map((k) => (
                <option key={k} value={k}>{SERIES_LABEL[k]}</option>
              ))}
            </SelectCtrl>
          </CtrlGroup>

          <Btn variant="info" onClick={renderChart} disabled={!echartsReady}>
            {echartsReady ? "Refresh chart" : "Loading ECharts…"}
          </Btn>
        </div>

        {/* Series legend */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10,
          fontSize: 12, color: "var(--color-text-secondary)",
        }}>
          {yAxis.map((s, i) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: COLORS[i % COLORS.length], display: "inline-block",
              }} />
              {SERIES_LABEL[s]}
            </span>
          ))}
        </div>

        {/* Chart canvas — full width */}
        <div ref={chartRefCallback} style={{ width: "100%", height: 360, marginBottom: "1.25rem" }} />

        {/* ── Live horizontal table — below chart, full width ── */}
        <div style={{
          overflowX: "auto",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          background: "var(--color-background-primary)",
          marginBottom: "1.25rem",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th style={{
                  padding: "8px 14px", textAlign: "left",
                  background: "var(--color-background-secondary)",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)",
                  position: "sticky", left: 0, zIndex: 2, minWidth: 90,
                }}>Series</th>
                {data.map((row) => (
                  <th key={row.period} style={{
                    padding: "8px 10px", textAlign: "center",
                    background: "var(--color-background-secondary)",
                    borderBottom: "0.5px solid var(--color-border-tertiary)",
                    fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)",
                    minWidth: 58,
                  }}>{row.period}</th>
                ))}
                <th style={{
                  padding: "8px 10px", textAlign: "center",
                  background: "var(--color-background-secondary)",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  fontWeight: 600, fontSize: 11, color: "var(--color-text-info)",
                  minWidth: 70,
                }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {yAxis.map((k, ri) => {
                const rowTotal = data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
                return (
                  <tr key={k} style={{
                    background: ri % 2 === 0
                      ? "var(--color-background-primary)"
                      : "var(--color-background-secondary)",
                  }}>
                    {/* Series label with colour dot — sticky */}
                    <td style={{
                      padding: "7px 14px", fontWeight: 600, fontSize: 11,
                      color: "var(--color-text-secondary)",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                      position: "sticky", left: 0,
                      background: ri % 2 === 0
                        ? "var(--color-background-primary)"
                        : "var(--color-background-secondary)",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                          background: COLORS[ri % COLORS.length], display: "inline-block",
                        }}/>
                        {SERIES_LABEL[k]}
                      </span>
                    </td>
                    {/* Values */}
                    {data.map((row) => (
                      <td key={row.period} style={{
                        padding: "7px 10px", textAlign: "center",
                        borderBottom: "0.5px solid var(--color-border-tertiary)",
                        color: "var(--color-text-primary)", fontSize: 12,
                      }}>
                        {Number(row[k]).toLocaleString()}
                      </td>
                    ))}
                    {/* Row total */}
                    <td style={{
                      padding: "7px 10px", textAlign: "center",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                      fontWeight: 600, fontSize: 12, color: "var(--color-text-info)",
                      background: "var(--color-background-info)",
                    }}>
                      {rowTotal.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {/* Grand totals row */}
              <tr style={{ background: "var(--color-background-info)" }}>
                <td style={{
                  padding: "7px 14px", fontWeight: 700, fontSize: 11,
                  color: "var(--color-text-info)",
                  position: "sticky", left: 0,
                  background: "var(--color-background-info)",
                }}>Total</td>
                {data.map((row) => (
                  <td key={row.period} style={{
                    padding: "7px 10px", textAlign: "center",
                    fontWeight: 700, fontSize: 12, color: "var(--color-text-info)",
                  }}>
                    {yAxis.reduce((s, k) => s + (Number(row[k]) || 0), 0).toLocaleString()}
                  </td>
                ))}
                {/* Grand total of all */}
                <td style={{
                  padding: "7px 10px", textAlign: "center",
                  fontWeight: 700, fontSize: 12, color: "var(--color-text-info)",
                  borderLeft: "1px solid var(--color-border-info)",
                }}>
                  {yAxis.reduce((gs, k) =>
                    gs + data.reduce((s, r) => s + (Number(r[k]) || 0), 0), 0
                  ).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Save buttons ─────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        

          {/* Save as Draft */}
          <button
            onClick={() => saveChartSVG("draft")}
            disabled={!echartsReady || !!busy.svg_draft}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", fontSize: 13, fontWeight: 600,
              fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)",
              border: "none", cursor: (!echartsReady || busy.svg_draft) ? "not-allowed" : "pointer",
              opacity: (!echartsReady || busy.svg_draft) ? 0.55 : 1,
              background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)",
              color: "#fff", boxShadow: "0 2px 10px rgba(22,163,74,0.30)",
              transition: "transform .12s, box-shadow .12s",
            }}
            onMouseEnter={(e) => { if (!busy.svg_draft && echartsReady) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(22,163,74,0.45)"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(22,163,74,0.30)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {busy.svg_draft ? "Saving…" : "Save as Draft"}
          </button>

          {/* Send for Approval */}
          <button
            onClick={() => saveChartSVG("approval")}
            disabled={!echartsReady || !!busy.svg_approval}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", fontSize: 13, fontWeight: 600,
              fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)",
              border: "none", cursor: (!echartsReady || busy.svg_approval) ? "not-allowed" : "pointer",
              opacity: (!echartsReady || busy.svg_approval) ? 0.55 : 1,
              background: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
              color: "#fff", boxShadow: "0 2px 10px rgba(234,88,12,0.30)",
              transition: "transform .12s, box-shadow .12s",
            }}
            onMouseEnter={(e) => { if (!busy.svg_approval && echartsReady) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(234,88,12,0.45)"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(234,88,12,0.30)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {busy.svg_approval ? "Sending…" : "Send for Approval"}
          </button>

          {/* Save Final */}
          <button
            onClick={() => saveChartSVG("final")}
            disabled={!echartsReady || !!busy.svg_final}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", fontSize: 13, fontWeight: 600,
              fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)",
              border: "none", cursor: (!echartsReady || busy.svg_final) ? "not-allowed" : "pointer",
              opacity: (!echartsReady || busy.svg_final) ? 0.55 : 1,
              background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
              color: "#fff", boxShadow: "0 2px 10px rgba(2,132,199,0.30)",
              transition: "transform .12s, box-shadow .12s",
            }}
            onMouseEnter={(e) => { if (!busy.svg_final && echartsReady) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(2,132,199,0.45)"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(2,132,199,0.30)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {busy.svg_final ? "Saving…" : "Save Final SVG → DB"}
          </button>
  </div>
        {/* Stored SVG records */}
        {svgStore.length > 0 && (
          <div style={{
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            padding: ".75rem", marginTop: ".75rem", fontSize: 12,
            color: "var(--color-text-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
          }}>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>
              Stored SVG records — table: <code>svg_reports</code>
              &nbsp;·&nbsp;{svgStore.length} record{svgStore.length !== 1 ? "s" : ""}
            </div>
            {svgStore.map((entry, idx) => (
              <div
                key={entry.id}
                style={{
                  marginBottom: 8, paddingBottom: 8,
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}
              >
                <div style={{
                  display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                }}>
                  <strong>#{idx + 1}</strong>
                  <span>id: {entry.id}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12,
                    fontSize: 10, fontWeight: 600,
                    background:
                      entry.status === "final"
                        ? "var(--color-background-success)"
                        : entry.status === "approval"
                          ? "var(--color-background-info)"
                          : "var(--color-background-secondary)",
                    color:
                      entry.status === "final"
                        ? "var(--color-text-success)"
                        : entry.status === "approval"
                          ? "var(--color-text-info)"
                          : "var(--color-text-secondary)",
                  }}>{entry.status}</span>
                  <span>{entry.chart_type}</span>
                  {entry.size && <span>{entry.size}</span>}
                  {entry.created_at && (
                    <span style={{ opacity: 0.6, fontSize: 10 }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  )}
                  {entry.status === "draft" && (
                    <Btn variant="info"
                      onClick={() => changeStatus(entry.id, "approval")}>
                      → Approval
                    </Btn>
                  )}
                  {entry.status === "approval" && (
                    <Btn variant="success"
                      onClick={() => changeStatus(entry.id, "final")}>
                      → Final
                    </Btn>
                  )}
                </div>
                <div style={{
                  color: "var(--color-text-tertiary)",
                  fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4,
                }}>
                  {`INSERT INTO svg_reports (id, status, chart_type) VALUES (${entry.id}, '${entry.status}', '${entry.chart_type}');`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Workflow status banner ───────────────────────── */}
      {workflowMsg && (
        <Card>
          <SectionLabel>Workflow status</SectionLabel>
          {workflowMsg === "draft" ? (
            <div style={{ fontSize: 14, color: "var(--color-text-warning)", padding: ".5rem 0" }}>
              ● Status: <strong>Draft</strong> — saved to svg_reports.
              Click <em>Send for Approval</em> when ready.
            </div>
          ) : workflowMsg === "approval" ? (
            <div style={{ fontSize: 14, color: "var(--color-text-info)", padding: ".5rem 0" }}>
              ◎ Status: <strong>Sent for Approval</strong> — submitted at{" "}
              {new Date().toLocaleString()}. Awaiting reviewer sign-off.
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "var(--color-text-success)", padding: ".5rem 0" }}>
              ✓ Status: <strong>Final</strong> — locked at {new Date().toLocaleString()}.
            </div>
          )}
        </Card>
      )}

      <Toast msg={toast} isError={toastError} />
    </div>
  );
}