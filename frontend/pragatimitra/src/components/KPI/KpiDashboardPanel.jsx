import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";

const API = "http://localhost:5000/api/kpi";

// Language-aware metadata helpers (mirrors KpiManagementPage)
function cfgTitle(cfg, lang) {
  return (lang === "hi" && cfg?.title_hi) ? cfg.title_hi : (cfg?.title || "KPI Chart");
}
function cfgDesc(cfg, lang) {
  return (lang === "hi" && cfg?.description_hi) ? cfg.description_hi : (cfg?.description || "");
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  { stroke:"#2563eb", fill:"#eff6ff", border:"#bfdbfe", text:"#1e40af" },
  { stroke:"#059669", fill:"#ecfdf5", border:"#a7f3d0", text:"#065f46" },
  { stroke:"#7c3aed", fill:"#f5f3ff", border:"#c4b5fd", text:"#5b21b6" },
  { stroke:"#c2410c", fill:"#fff7ed", border:"#fed7aa", text:"#9a3412" },
  { stroke:"#0369a1", fill:"#f0f9ff", border:"#bae6fd", text:"#075985" },
  { stroke:"#be185d", fill:"#fdf2f8", border:"#f9a8d4", text:"#9d174d" },
  { stroke:"#b45309", fill:"#fffbeb", border:"#fde68a", text:"#92400e" },
  { stroke:"#0f766e", fill:"#f0fdfa", border:"#99f6e4", text:"#134e4a" },
];

// Series colors used inside the chart (multi-series)
const SERIES_COLORS = PALETTE.map(p => p.stroke);

function palette(i) { return PALETTE[i % PALETTE.length]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTotal(n) {
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2).replace(/\.00$/, "") + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, "")      + "K";
  return v % 1 === 0 ? v.toLocaleString("en-IN") : v.toFixed(2);
}

function getTotal(series) {
  const all = series.flatMap(s => (s.values || []).filter(v => typeof v === "number" && !isNaN(v)));
  return all.length ? all.reduce((a, b) => a + b, 0) : null;
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────
// Fully self-contained pure-SVG renderer. Width and height come from props
// so parent controls the size — cards use large dimensions for readability.

function KpiChart({ chartType = "bar", x = [], series = [], width, height, colors }) {
  const C        = colors || SERIES_COLORS;
  // Determine if labels need rotation: rotate when many items or any label is long
  const needsRotation = x.length > 6 || x.some(l => String(l).length > 8);
  const PAD = { l: 52, r: 16, t: 12, b: needsRotation ? 64 : 36 };
  const cW  = width  - PAD.l - PAD.r;
  const cH  = height - PAD.t - PAD.b;

  if (!x.length || !series.length) {
    return (
      <div style={{ width, height, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:8,
        color:"#cbd5e1", fontSize:12, fontStyle:"italic" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        No data available
      </div>
    );
  }

  const allVals = series.flatMap(s => s.values || []).filter(v => typeof v === "number");
  const maxV    = Math.max(...allVals, 1);
  const minV    = Math.min(0, ...allVals);

  // Y-axis: 4–5 nicely rounded gridlines
  function niceStep(range, steps = 4) {
    if (!range || range <= 0) return 1;
    const raw = range / steps;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (m * pow >= raw) return m * pow;
    }
    return pow * 10;
  }
  const step   = niceStep(maxV - minV, 4);
  const yMin   = Math.floor(minV / step) * step;
  const yMax   = Math.ceil(maxV  / step) * step || step;
  const yRange = yMax - yMin || 1;
  const gridYs = [];
  for (let v = yMin; v <= yMax + step * 0.01; v += step) gridYs.push(v);

  const toY  = v  => PAD.t + cH - ((v - yMin) / yRange) * cH;
  const toXi = i  => PAD.l + (x.length < 2 ? cW / 2 : (i / (x.length - 1)) * cW);

  // Truncate label for display but keep full value in tooltip
  const abbr  = l  => { const s = String(l); return s.length > 12 ? s.slice(0, 11) + "…" : s; };

  function fmtY(v) {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (Math.abs(v) >= 1_000)     return (v / 1_000).toFixed(0)     + "K";
    return String(Math.round(v));
  }

  // ── Bar ──
  if (chartType === "bar" || chartType === "bar_stack") {
    const groupW = cW / x.length;
    const numS   = series.length;
    const gap    = Math.max(2, groupW * 0.08);
    const barW   = Math.max(3, (groupW - gap * 2) / numS - 1);
    // Label baseline: just above the bottom of the SVG
    const labelY = PAD.t + cH + (needsRotation ? 8 : 18);

    return (
      <svg width={width} height={height} style={{ display:"block", overflow:"visible" }}>
        {/* Grid lines + Y labels */}
        {gridYs.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={toY(v)} x2={PAD.l + cW} y2={toY(v)}
              stroke="#f1f5f9" strokeWidth={v === 0 ? 1.5 : 1}/>
            <text x={PAD.l - 6} y={toY(v) + 4}
              textAnchor="end" fontSize={10} fill="#94a3b8">{fmtY(v)}</text>
          </g>
        ))}

        {/* Bars */}
        {series.flatMap((s, si) =>
          (s.values || []).map((v, xi) => {
            const bh = Math.max(0, ((v - yMin) / yRange) * cH);
            const bx = PAD.l + xi * groupW + gap + si * barW;
            return (
              <g key={`${si}-${xi}`}>
                <rect x={bx} y={toY(v)} width={Math.max(2, barW - 1)} height={bh}
                  fill={C[si % C.length]} rx={3} opacity={0.9}>
                  <title>{`${x[xi]}: ${v}`}</title>
                </rect>
              </g>
            );
          })
        )}

        {/* X labels — always shown, rotated when needed */}
        {x.map((l, i) => {
          const lx = PAD.l + i * groupW + groupW / 2;
          return needsRotation ? (
            <text key={i}
              x={lx} y={labelY}
              textAnchor="end" fontSize={10} fill="#64748b"
              transform={`rotate(-38, ${lx}, ${labelY})`}>
              <title>{String(l)}</title>
              {abbr(l)}
            </text>
          ) : (
            <text key={i} x={lx} y={labelY}
              textAnchor="middle" fontSize={10} fill="#64748b">
              <title>{String(l)}</title>
              {abbr(l)}
            </text>
          );
        })}
      </svg>
    );
  }

  // ── Line / Area ──
  if (chartType === "line" || chartType === "area") {
    const filled = chartType === "area";
    const baseY  = toY(Math.max(yMin, 0));
    const labelY = PAD.t + cH + (needsRotation ? 8 : 18);

    return (
      <svg width={width} height={height} style={{ display:"block", overflow:"visible" }}>
        {/* Grid */}
        {gridYs.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={toY(v)} x2={PAD.l + cW} y2={toY(v)}
              stroke="#f1f5f9" strokeWidth={v === 0 ? 1.5 : 1}/>
            <text x={PAD.l - 6} y={toY(v) + 4}
              textAnchor="end" fontSize={10} fill="#94a3b8">{fmtY(v)}</text>
          </g>
        ))}

        {/* Series paths */}
        {series.map((s, si) => {
          const color = C[si % C.length];
          const pts   = (s.values || []).map((v, xi) => [toXi(xi), toY(v)]);
          if (!pts.length) return null;
          const d  = pts.map(([px, py], i) => `${i===0?"M":"L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
          const dA = `${d} L${pts[pts.length-1][0].toFixed(1)},${baseY.toFixed(1)} L${PAD.l.toFixed(1)},${baseY.toFixed(1)} Z`;
          const [lx, ly] = pts[pts.length - 1];
          return (
            <g key={si}>
              {filled && (
                <defs>
                  <linearGradient id={`ag-${si}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity={0.2}/>
                    <stop offset="100%" stopColor={color} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
              )}
              {filled && <path d={dA} fill={`url(#ag-${si})`}/>}
              <path d={d} fill="none" stroke={color} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round"/>
              {/* Terminal value marker */}
              <circle cx={lx} cy={ly} r={5} fill="#fff" stroke={color} strokeWidth={2}/>
            </g>
          );
        })}

        {/* X labels — always shown, rotated when needed */}
        {x.map((l, i) => {
          const lx = toXi(i);
          return needsRotation ? (
            <text key={i}
              x={lx} y={labelY}
              textAnchor="end" fontSize={10} fill="#64748b"
              transform={`rotate(-38, ${lx}, ${labelY})`}>
              <title>{String(l)}</title>
              {abbr(l)}
            </text>
          ) : (
            <text key={i} x={lx} y={labelY}
              textAnchor="middle" fontSize={10} fill="#64748b">
              <title>{String(l)}</title>
              {abbr(l)}
            </text>
          );
        })}
      </svg>
    );
  }

  // ── Pie / Doughnut ──
  if (chartType === "pie" || chartType === "doughnut") {
    const isDough = chartType === "doughnut";
    const margin  = 20;
    const cx = width / 2;
    const cy = (height - margin * 2) / 2 + margin;
    const R  = Math.min(width / 2, (height - margin * 2) / 2) - 8;
    const r  = isDough ? R * 0.50 : 0;

    const totals = series.map(s => (s.values || []).reduce((a, b) => a + b, 0));
    const grand  = totals.reduce((a, b) => a + b, 0) || 1;

    let angle = -Math.PI / 2;
    const sectors = series.map((s, si) => {
      const sweep = (totals[si] / grand) * 2 * Math.PI;
      const end   = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const color = C[si % C.length];
      const pt    = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const [x1, y1] = pt(angle, R), [x2, y2] = pt(end, R);
      const [ix1, iy1] = pt(angle, r), [ix2, iy2] = pt(end, r);
      const d = isDough
        ? `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix2.toFixed(2)},${iy2.toFixed(2)} A${r},${r} 0 ${large},0 ${ix1.toFixed(2)},${iy1.toFixed(2)} Z`
        : `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      angle = end;
      return <path key={si} d={d} fill={color} stroke="#fff" strokeWidth={1.5}/>;
    });

    // Legend below chart
    const legendY = cy + R + 18;
    const colW    = width / Math.min(series.length, 4);

    return (
      <svg width={width} height={height} style={{ display:"block" }}>
        {sectors}
        {isDough && <circle cx={cx} cy={cy} r={r - 2} fill="#fff"/>}
        {series.slice(0, 4).map((s, si) => (
          <g key={si} transform={`translate(${si * colW + 8}, ${legendY})`}>
            <rect width={10} height={10} rx={3} fill={C[si % C.length]}/>
            <text x={14} y={9} fontSize={10} fill="#64748b">
              {String(s.column || "").slice(0, 12)}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  return null;
}

// ─── Series legend ────────────────────────────────────────────────────────────

function SeriesLegend({ series, colors }) {
  if (!series?.length) return null;
  const C = colors || SERIES_COLORS;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px" }}>
      {series.map((s, i) => (
        <span key={i} style={{ display:"flex", alignItems:"center", gap:6,
          fontSize:11, color:"#64748b", fontWeight:500 }}>
          <span style={{ width:10, height:10, borderRadius:3,
            background:C[i % C.length], flexShrink:0, display:"inline-block" }}/>
          {s.label || s.column}
        </span>
      ))}
    </div>
  );
}

// ─── Responsive chart wrapper ─────────────────────────────────────────────────
// Measures its container width and passes it to KpiChart so the SVG fills the space.

function ResponsiveChart({ chartType, x, series, height, colors }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setW(e.contentRect.width || 600));
    obs.observe(ref.current);
    setW(ref.current.offsetWidth || 600);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width:"100%" }}>
      <KpiChart chartType={chartType} x={x} series={series}
        width={Math.max(w, 200)} height={height} colors={colors} />
    </div>
  );
}

// ─── Top-N cap for rendering — avoids SVG thrash with 500+ groups ─────────────
const CHART_LABEL_CAP = 50;   // max X-axis groups to render

function capChartData(x, series, cap = CHART_LABEL_CAP) {
  if (!x || x.length <= cap) return { x, series, capped: false };
  return {
    x:      x.slice(0, cap),
    series: series.map(s => ({ ...s, values: (s.values || []).slice(0, cap) })),
    capped: true,
    total_groups: x.length,
  };
}

// ─── Single KPI card ─────────────────────────────────────────────────────────
// Full-width card: big chart + single Total metric

function SingleCard({ item, idx }) {
  const { lang } = useLanguage();
  const cfg   = item.config || {};
  const p     = palette(idx);
  const total = getTotal(item.series || []);
  const has   = item.x?.length > 0 && item.series?.length > 0;
  const colors = SERIES_COLORS.slice(idx % SERIES_COLORS.length)
    .concat(SERIES_COLORS.slice(0, idx % SERIES_COLORS.length));

  return (
    <div style={{
      background:"#fff", borderRadius:16,
      border:`1.5px solid ${p.border}`,
      boxShadow:"0 4px 16px rgba(0,0,0,.07)",
      overflow:"hidden",
    }}>
      {/* Accent stripe */}
      <div style={{ height:4, background:`linear-gradient(90deg, ${p.stroke}, ${p.stroke}80)` }}/>

      {/* Header */}
      <div style={{
        padding:"20px 24px 16px",
        display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16,
      }}>
        {/* Left: title + description */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:17, fontWeight:700, color:"#0f172a", marginBottom:4,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {cfgTitle(cfg, lang)}
          </div>
          {cfgDesc(cfg, lang) && (
            <div style={{ fontSize:12, color:"#94a3b8" }}>{cfgDesc(cfg, lang)}</div>
          )}
          {/* Series legend */}
          {has && (
            <div style={{ marginTop:10 }}>
              <SeriesLegend series={item.series} colors={colors} />
            </div>
          )}
        </div>

        {/* Right: Total metric + chart type badge */}
        <div style={{ textAlign:"right", flexShrink:0 }}>
          {total !== null && (
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8",
                textTransform:"uppercase", letterSpacing:.6, marginBottom:2 }}>{t("Total", lang)}</div>
              <div style={{ fontSize:32, fontWeight:800, color:p.stroke,
                lineHeight:1, fontFamily:"'JetBrains Mono', monospace" }}>
                {fmtTotal(total)}
              </div>
            </div>
          )}
          <span style={{
            fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20,
            background:p.fill, color:p.stroke, border:`1px solid ${p.border}`,
            textTransform:"uppercase", letterSpacing:.6,
          }}>
            {cfg.chart_type || "chart"}
          </span>
        </div>
      </div>

      {/* Chart — the main content */}
      <div style={{ padding:"0 24px 20px" }}>
        {/* Dependency / data-source error */}
        {item.dependency_err && (
          <div style={{ padding:"10px 14px", background:"#fef3c7", border:"1px solid #fbbf24", borderRadius:8, fontSize:12, color:"#92400e", marginBottom:10 }}>
            ⚠️ {item.error || "The data source for this KPI no longer exists."}
          </div>
        )}
        {/* Row truncation notice */}
        {item.truncated && (
          <div style={{ padding:"8px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, fontSize:11, color:"#1d4ed8", marginBottom:8 }}>
            {t("Showing first 5,000 rows. Add an aggregation to see complete totals.", lang)}
          </div>
        )}
        {has ? (() => {
          const { x: cx, series: cs, capped, total_groups } = capChartData(item.x, item.series);
          return (
            <>
              {capped && (
                <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>
                  {lang === "hi"
                    ? `कुल ${total_groups} समूहों में से शीर्ष ${CHART_LABEL_CAP} दिखा रहे हैं।`
                    : `Showing top ${CHART_LABEL_CAP} of ${total_groups} groups.`}
                </div>
              )}
              <ResponsiveChart chartType={cfg.chart_type} x={cx} series={cs} height={240} colors={colors} />
            </>
          );
        })() : (
          <div style={{
            height:200, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            gap:10, color:"#cbd5e1",
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            <span style={{ fontSize:13, fontStyle:"italic" }}>
              {item.dependency_err
                ? t("Data source unavailable", lang)
                : item.error
                  ? `${lang === "hi" ? "त्रुटि" : "Error"}: ${item.error}`
                  : t("No data available", lang)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding:"10px 24px", borderTop:`1px solid ${p.border}40`,
        background:p.fill + "60",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:6,
      }}>
        <span style={{ fontSize:11, color:p.text, fontWeight:500 }}>
          {t("Source:", lang)} <code style={{ fontFamily:"monospace", fontSize:11 }}>{cfg.table_name}</code>
          {cfg.academic_year && (
            <span style={{ marginLeft:8, padding:"1px 7px", borderRadius:10, background:p.border, color:p.text, fontWeight:600 }}>
              {cfg.academic_year}
            </span>
          )}
        </span>
        <span style={{ fontSize:11, color:"#94a3b8" }}>
          {lang === "hi"
            ? `${item.row_count ?? 0} रिकॉर्ड · ${cfg.x_col}`
            : `${item.row_count ?? 0} records · ${cfg.x_col}`}
          {cfg.aggregation_type && cfg.aggregation_type !== "none" && (
            <span style={{ marginLeft:6, color:"#7c3aed", fontWeight:600 }}>· {cfg.aggregation_type.toUpperCase()}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Group KPI card ───────────────────────────────────────────────────────────
// One wide card containing multiple related KPIs side-by-side

function GroupCard({ name, items, themeIdx }) {
  const { lang } = useLanguage();
  const tp = palette(themeIdx);

  return (
    <div style={{
      background:"#fff", borderRadius:16,
      border:`1.5px solid ${tp.border}`,
      boxShadow:"0 4px 16px rgba(0,0,0,.07)",
      overflow:"hidden",
    }}>
      {/* Group header */}
      <div style={{
        padding:"18px 24px",
        background:`linear-gradient(135deg, ${tp.fill}, #fff)`,
        borderBottom:`1.5px solid ${tp.border}`,
        display:"flex", alignItems:"center", gap:14,
      }}>
        <div style={{ width:5, height:32, borderRadius:3, background:tp.stroke, flexShrink:0 }}/>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{name}</div>
          <div style={{ fontSize:11, color:tp.text, marginTop:2, opacity:.85 }}>
            {lang === "hi"
              ? `${items.length} KPI · ${t("grouped dashboard card", lang)}`
              : `${items.length} KPI${items.length > 1 ? "s" : ""} · ${t("grouped dashboard card", lang)}`}
          </div>
        </div>
      </div>

      {/* Sub-cards — horizontal scroll on overflow, min 300px each */}
      <div style={{
        display:"grid",
        gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)`,
        gap:0,
      }}>
        {items.map((item, i) => {
          const cfg   = item.config || {};
          const sp    = palette(themeIdx * 3 + i);
          const total = getTotal(item.series || []);
          const has   = item.x?.length > 0 && item.series?.length > 0;
          const isLast= i === items.length - 1;
          const colors = SERIES_COLORS.slice((themeIdx * 3 + i) % SERIES_COLORS.length)
            .concat(SERIES_COLORS.slice(0, (themeIdx * 3 + i) % SERIES_COLORS.length));

          return (
            <div key={cfg.id ?? i} style={{
              borderRight: isLast ? "none" : `1px solid ${tp.border}`,
              display:"flex", flexDirection:"column",
            }}>
              {/* Sub-card header */}
              <div style={{
                padding:"16px 20px 12px",
                borderBottom:`1px solid ${tp.border}40`,
                display:"flex", alignItems:"flex-start",
                justifyContent:"space-between", gap:10,
              }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0f172a",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {cfgTitle(cfg, lang)}
                  </div>
                  {has && (
                    <div style={{ marginTop:6 }}>
                      <SeriesLegend series={item.series} colors={colors} />
                    </div>
                  )}
                </div>
                {/* Total */}
                {total !== null && (
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:"#94a3b8",
                      textTransform:"uppercase", letterSpacing:.5 }}>{t("Total", lang)}</div>
                    <div style={{ fontSize:26, fontWeight:800, color:sp.stroke,
                      lineHeight:1.1, fontFamily:"'JetBrains Mono', monospace" }}>
                      {fmtTotal(total)}
                    </div>
                  </div>
                )}
              </div>

              {/* Chart */}
              <div style={{ padding:"12px 16px 16px", flex:1 }}>
                {has ? (() => {
                  const { x: cx, series: cs, capped, total_groups } = capChartData(item.x, item.series, 30);
                  return (
                    <>
                      {capped && (
                        <div style={{ fontSize:10, color:"#94a3b8", marginBottom:4 }}>
                          {lang === "hi" ? `शीर्ष 30 में से ${total_groups}` : `Top 30 of ${total_groups}`}
                        </div>
                      )}
                      <ResponsiveChart chartType={cfg.chart_type} x={cx} series={cs} height={200} colors={colors} />
                    </>
                  );
                })() : (
                  <div style={{
                    height:160, display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center",
                    gap:8, color:"#cbd5e1", fontSize:12, fontStyle:"italic",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="3"/>
                      <path d="M3 9h18M9 21V9"/>
                    </svg>
                    {item.error ? t("Error loading", lang) : t("No data", lang)}
                  </div>
                )}
              </div>

              {/* Sub-footer */}
              <div style={{
                padding:"8px 20px",
                borderTop:`1px solid ${tp.border}40`,
                background:sp.fill + "50",
                fontSize:10, color:sp.text,
                display:"flex", justifyContent:"space-between",
              }}>
                <span style={{ fontWeight:500 }}>
                  {cfg.chart_type?.toUpperCase()}
                </span>
                <span style={{ color:"#94a3b8" }}>
                  {lang === "hi" ? `${item.row_count ?? 0} रिकॉर्ड` : `${item.row_count ?? 0} records`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Empty / guide state ──────────────────────────────────────────────────────

function EmptyState() {
  const { lang } = useLanguage();
  return (
    <div style={{
      padding:"40px 32px", textAlign:"center",
      background:"linear-gradient(135deg, #f8fafc, #eff6ff)",
      borderRadius:16, border:"2px dashed #bfdbfe",
    }}>
      <div style={{ fontSize:48, marginBottom:16, lineHeight:1 }}>📊</div>
      <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:8 }}>
        {t("No KPI charts on dashboard yet", lang)}
      </div>
      <div style={{ fontSize:13, color:"#64748b", lineHeight:1.8, maxWidth:340, margin:"0 auto" }}>
        {lang === "hi" ? (
          <>
            <strong style={{ color:"#2563eb" }}>KPI चार्ट</strong> पर जाएं, कोई भी चार्ट कॉन्फ़िग खोलें,
            और <strong style={{ color:"#2563eb" }}>"डैशबोर्ड पर दिखाएं"</strong> सक्षम करें।
          </>
        ) : (
          <>
            Go to <strong style={{ color:"#2563eb" }}>KPI Charts</strong>, open any chart config,
            and enable <strong style={{ color:"#2563eb" }}>"Show on Dashboard"</strong> to display it here.
          </>
        )}
      </div>
    </div>
  );
}

// ─── Panel header ─────────────────────────────────────────────────────────────

function PanelHeader({ total, fetchedAt, onRefresh }) {
  const { lang } = useLanguage();
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      paddingBottom:4,
    }}>
      <div>
        <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>
          {t("KPI Dashboard", lang)}
        </span>
        <span style={{ marginLeft:8, fontSize:12, color:"#94a3b8" }}>
          {lang === "hi" ? `${total} चार्ट` : `${total} chart${total > 1 ? "s" : ""}`}
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {fetchedAt && (
          <span style={{ fontSize:11, color:"#94a3b8" }}>
            {t("Updated", lang)} {fetchedAt.toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN", { hour:"2-digit", minute:"2-digit" })}
          </span>
        )}
        <button
          onClick={onRefresh}
          style={{
            display:"inline-flex", alignItems:"center", gap:5,
            padding:"6px 14px", borderRadius:8,
            border:"1.5px solid #e2e8f0", background:"#fff",
            fontSize:12, fontWeight:600, color:"#475569", cursor:"pointer",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
          {t("Refresh", lang)}
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function KpiDashboardPanel({ scope = "institute" }) {
  const { accessToken } = useAuth();
  const { lang } = useLanguage();
  const [singles,   setSingles]   = useState([]);
  const [groups,    setGroups]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const headers = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res  = await fetch(`${API}/dashboard-charts?lang=${lang}&scope=${scope}`, { headers, credentials:"include" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load KPI charts");
      setSingles(json.singles || []);
      setGroups(json.groups   || []);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, lang, scope]); // re-fetch when language or scope changes

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", gap:10,
      color:"#94a3b8", fontSize:13, padding:"20px 0" }}>
      <span style={{
        display:"inline-block", width:16, height:16, borderRadius:"50%",
        border:"2px solid #e2e8f0", borderTopColor:"#2563eb",
        animation:"kpi-dash-spin .7s linear infinite",
      }}/>
      {t("Loading KPI dashboard…", lang)}
      <style>{`@keyframes kpi-dash-spin { to { transform:rotate(360deg) } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{
      padding:"16px 20px", background:"#fef2f2",
      border:"1.5px solid #fecaca", borderRadius:12,
      fontSize:13, color:"#991b1b",
      display:"flex", alignItems:"center", justifyContent:"space-between",
    }}>
      <span>⚠️ {error}</span>
      <button onClick={load} style={{
        padding:"6px 14px", border:"1.5px solid #fecaca", borderRadius:8,
        background:"#fff", fontSize:12, fontWeight:600, color:"#dc2626", cursor:"pointer",
      }}>{t("Retry", lang)}</button>
    </div>
  );

  const total = singles.length + groups.reduce((a, g) => a + g.items.length, 0);
  if (total === 0) return <EmptyState />;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <PanelHeader total={total} fetchedAt={fetchedAt} onRefresh={load} />

      {/* Group cards first */}
      {groups.map((g, gi) => (
        <GroupCard key={g.name} name={g.name} items={g.items} themeIdx={gi} />
      ))}

      {/* Single cards — one per row for maximum chart readability */}
      {singles.map((item, i) => (
        <SingleCard key={item.config?.id ?? i} item={item} idx={i} />
      ))}
    </div>
  );
}
