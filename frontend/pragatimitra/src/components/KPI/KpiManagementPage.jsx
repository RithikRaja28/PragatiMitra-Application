"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Trash2, Eye, Edit2, Download, Search, RefreshCw, Plus } from "lucide-react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import PageHeader from "../../ui/PageHeader";
import { color, DataTable, Badge, EmptyState } from "../../ui";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { useAcademicYear } from "../../store/AcademicYearContext";
import FormScreen from "../shared/FormScreen";
import { S } from "../shared/formUtils";
import { Select } from "../shared/ui";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";

const SLUG = "kpi-management";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "http://localhost:5000/api/kpi";

function makeApiFetch(token) {
  return async (path, opts = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res  = await fetch(`${API}${path}`, { headers, credentials: "include", ...opts });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };
}

const ECHARTS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js";

// ─── Palette ──────────────────────────────────────────────────────────────────
const SERIES_COLORS = ["#2563eb","#027a48","#7c3aed","#b45309","#0891b2","#be185d","#15803d","#92400e"];

const CHART_TYPES = [
  { value:"bar",       label:"Grouped Bar" },
  { value:"bar_stack", label:"Stacked Bar" },
  { value:"line",      label:"Line"        },
  { value:"area",      label:"Area"        },
  { value:"pie",       label:"Pie"         },
  { value:"doughnut",  label:"Doughnut"    },
];

const AGGREGATION_TYPES = [
  { value:"none",           label:"None (raw values)" },
  { value:"sum",            label:"Sum"               },
  { value:"count",          label:"Count (rows)"      },
  { value:"avg",            label:"Average"           },
  { value:"min",            label:"Minimum"           },
  { value:"max",            label:"Maximum"           },
  { value:"count_distinct", label:"Count Distinct"    },
];

const NUMERIC_TYPES = [
  "integer","bigint","smallint","numeric","decimal","real","double precision",
  "float","float4","float8","int2","int4","int8","money","serial","bigserial","smallserial","int","number",
];
const isNumeric = dt => NUMERIC_TYPES.some(t => (dt||"").toLowerCase().includes(t.split(" ")[0]));

const fmtDate = ts => ts
  ? new Date(ts).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
  : "—";
const fmtNum = n => Number(n||0).toLocaleString();

function formatTableName(name) {
  if (!name) return "";
  return name
    .replace(/_records$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Column label translation helpers ────────────────────────────────────────
// colLabels: { [column_name]: { label_en, label_hi } } — from /tables/:t/columns
function translateCol(colName, lang, colLabels) {
  const info = colLabels?.[colName];
  if (!info) return colName;
  return (lang === "hi" && info.label_hi) ? info.label_hi : (info.label_en || colName);
}

// ─── KPI metadata display helpers — return the language-appropriate value ────
// The existing title/description/export_title columns hold the English value;
// title_hi/description_hi/export_title_hi hold the optional Hindi override.
function cfgTitle(cfg, lang) {
  return (lang === "hi" && cfg?.title_hi) ? cfg.title_hi : (cfg?.title || "KPI Chart");
}
function cfgDesc(cfg, lang) {
  return (lang === "hi" && cfg?.description_hi) ? cfg.description_hi : (cfg?.description || "");
}
function cfgExportTitle(cfg, lang) {
  return (lang === "hi" && cfg?.export_title_hi) ? cfg.export_title_hi : (cfg?.export_title || "");
}

// Handles both raw "admitted" and aggregated "SUM(admitted)" series names
function translateSeriesLabel(column, lang, colLabels) {
  const m = column.match(/^([A-Z][A-Z _*]*)\((.+)\)$/);
  return m
    ? `${m[1]}(${translateCol(m[2], lang, colLabels)})`
    : translateCol(column, lang, colLabels);
}

// ─── ECharts option builder ───────────────────────────────────────────────────
function buildOption(chartType, xLabels, series, yRange) {
  const txt   = { fontFamily:"'Inter','Noto Sans Devanagari',system-ui,sans-serif", fontSize:11, color:"#98a2b3" };
  const isPie = chartType==="pie"||chartType==="doughnut";
  const isLine= chartType==="line"||chartType==="area";
  const isArea= chartType==="area";
  const isStk = chartType==="bar_stack";

  if (isPie) return {
    backgroundColor:"transparent",
    tooltip:{ trigger:"item", formatter:"{b}: {c} ({d}%)", textStyle:txt },
    legend:{ bottom:0, textStyle:txt },
    series:[{
      type:"pie", radius:chartType==="doughnut"?["42%","68%"]:"64%", center:["50%","46%"],
      data:series.map(s=>({ name:s.name, value:s.data.reduce((a,b)=>a+(Number(b)||0),0), itemStyle:{ color:s.color } })),
      label:{ fontSize:11, fontFamily:"'Inter','Noto Sans Devanagari',system-ui,sans-serif" }, emphasis:{ itemStyle:{ shadowBlur:6 } },
    }],
  };
  return {
    backgroundColor:"transparent",
    tooltip:{ trigger:"axis", axisPointer:{ type:isLine?"line":"shadow" }, textStyle:txt },
    legend:{ bottom:4, data:series.map(s=>({ name:s.name, itemStyle:{ color:s.color } })), textStyle:txt, icon:"roundRect" },
    grid:{ left:52, right:16, top:16, bottom:60 },
    xAxis:{ type:"category", data:xLabels.map(String), axisLabel:{ ...txt, rotate:xLabels.length>10?35:0, interval:0 }, axisLine:{ lineStyle:{ color:"#eaecf0" } }, axisTick:{ show:false } },
    yAxis:{ type:"value", axisLabel:txt, axisLine:{ show:false }, axisTick:{ show:false }, splitLine:{ lineStyle:{ color:"#f9fafb" } }, min:yRange?.min??0, max:yRange?.max, interval:yRange?.interval },
    series:series.map(s=>({
      name:s.name, type:isLine?"line":"bar", stack:isStk?"total":undefined, data:s.data.map(Number),
      itemStyle:{ color:s.color, borderRadius:isLine?0:[3,3,0,0] },
      areaStyle:isArea?{ opacity:0.07, color:s.color }:undefined,
      smooth:isLine, symbol:isLine?"circle":undefined, symbolSize:5,
      label:{ show:!isLine&&s.data.length<=14&&series.length<=2, position:"top", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#98a2b3", formatter:p=>fmtNum(p.value) },
    })),
  };
}

// ─── SVG table for export ─────────────────────────────────────────────────────
const SVG_FONT = "system-ui,'Noto Sans Devanagari',sans-serif";

function buildTableSVG(series, xLabels, lang = "en") {
  const LW=130,CW=82,RH=28,HH=36,P=14;
  const W=P+LW+xLabels.length*CW+P, H=P+HH+series.length*RH+RH+P;
  const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  s+=`<rect width="${W}" height="${H}" fill="#fff" rx="6" stroke="#eaecf0"/>`;
  s+=`<rect x="${P}" y="${P}" width="${W-P*2}" height="${HH}" fill="#f9fafb" rx="4"/>`;
  s+=`<text x="${P+10}" y="${P+HH/2+5}" font-size="9" font-weight="700" fill="#98a2b3" font-family="${SVG_FONT}">${lang === "hi" ? "श्रृंखला" : "SERIES"}</text>`;
  xLabels.forEach((l,ci)=>{
    const x=P+LW+ci*CW;
    s+=`<text x="${x+CW/2}" y="${P+HH/2+5}" text-anchor="middle" font-size="10" font-weight="600" fill="#667085" font-family="${SVG_FONT}">${e(String(l))}</text>`;
  });
  series.forEach((sr,ri)=>{
    const y=P+HH+ri*RH;
    s+=`<rect x="${P}" y="${y}" width="${W-P*2}" height="${RH}" fill="${ri%2===0?"#fff":"#f9fafb"}"/>`;
    s+=`<rect x="${P+8}" y="${y+RH/2-4}" width="8" height="8" rx="2" fill="${sr.color}"/>`;
    s+=`<text x="${P+22}" y="${y+RH/2+5}" font-size="11" font-weight="600" fill="#101828" font-family="${SVG_FONT}">${e(sr.name)}</text>`;
    sr.data.forEach((v,ci)=>{
      const x=P+LW+ci*CW;
      s+=`<text x="${x+CW/2}" y="${y+RH/2+5}" text-anchor="middle" font-size="11" fill="#1d2939" font-family="monospace">${fmtNum(v)}</text>`;
    });
    s+=`<line x1="${P}" y1="${y+RH}" x2="${W-P}" y2="${y+RH}" stroke="#f2f4f7"/>`;
  });
  const ty=P+HH+series.length*RH;
  s+=`<rect x="${P}" y="${ty}" width="${W-P*2}" height="${RH}" fill="#eff6ff" rx="3"/>`;
  s+=`<text x="${P+10}" y="${ty+RH/2+5}" font-size="11" font-weight="700" fill="#1e40af" font-family="${SVG_FONT}">${t("Total", lang)}</text>`;
  xLabels.forEach((_,ci)=>{
    const x=P+LW+ci*CW;
    const ct=series.reduce((a,sr)=>a+(Number(sr.data[ci])||0),0);
    s+=`<text x="${x+CW/2}" y="${ty+RH/2+5}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e40af" font-family="monospace">${fmtNum(ct)}</text>`;
  });
  return s+"</svg>";
}

// ─── Reuse prompt — shown when selected table already has KPI configs ─────────
function ReusePrompt({ existing, apiFetch, notify, onReused, onCreateNew }) {
  const { lang } = useLanguage();
  const [reusingId, setReusingId] = useState(null);
  const [err,       setErr]       = useState("");

  const reuse = async (c) => {
    setReusingId(c.id); setErr("");
    try {
      const r = await apiFetch(`/configs/${c.id}/regenerate`, { method:"POST" });
      notify(`Refreshed "${c.title}" with latest data`);
      onReused(r.data.config || c);
    } catch (e) {
      setErr(e.message);
      setReusingId(null);
    }
  };

  return (
    <div style={{
      border:"1.5px solid #fbbf24", borderRadius:12, overflow:"hidden",
      boxShadow:"0 2px 8px rgba(251,191,36,.15)",
    }}>
      {/* Header */}
      <div style={{
        padding:"12px 16px", background:"#fffbeb",
        borderBottom:"1px solid #fde68a",
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{ fontSize:18, lineHeight:1 }}>⚠️</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"#92400e" }}>
            {t("This table is used by", lang)} {existing.length} {existing.length>1?t("existing KPIs", lang):t("existing KPI", lang)}
          </div>
          <div style={{ fontSize:11, color:"#b45309", marginTop:2 }}>
            {t("You can refresh an existing KPI with the latest data, or create a new independent KPI configuration.", lang)}
          </div>
        </div>
      </div>

      {/* Existing KPI list */}
      <div style={{ background:"#fff", padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}>
        {existing.map(c => (
          <div key={c.id} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
            padding:"10px 14px", borderRadius:9,
            border:"1px solid #e5e7eb", background:"#f9fafb",
          }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#1e293b",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {c.title}
              </div>
              <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>
                {c.chart_type} · {(c.y_cols||[]).length} {t("series", lang)}
                {c.svg_id ? ` · ${t("Exported", lang)}` : ` · ${t("Draft", lang)}`}
              </div>
            </div>
            <button
              type="button"
              disabled={!!reusingId}
              onClick={() => reuse(c)}
              style={{
                padding:"7px 14px", borderRadius:8, border:"none",
                background: reusingId===c.id ? "#e5e7eb" : "#2563eb",
                color: reusingId===c.id ? "#9ca3af" : "#fff",
                fontSize:12, fontWeight:600, cursor: reusingId ? "not-allowed" : "pointer",
                whiteSpace:"nowrap", flexShrink:0,
                display:"flex", alignItems:"center", gap:5,
              }}
            >
              {reusingId===c.id ? (
                <>
                  <span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%", border:"2px solid #d1d5db", borderTopColor:"#6b7280", animation:"kpi-spin .6s linear infinite" }}/>
                  {t("Refreshing…", lang)}
                </>
              ) : t("Reuse & Refresh ↺", lang)}
            </button>
          </div>
        ))}
        {err && (
          <div style={{ padding:"8px 12px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, fontSize:12, color:"#dc2626" }}>
            {err}
          </div>
        )}
      </div>

      {/* Create new action */}
      <div style={{
        padding:"12px 16px", background:"#f9fafb",
        borderTop:"1px solid #e5e7eb",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <span style={{ fontSize:12, color:"#6b7280" }}>
          {t("Need a different chart type or different columns from the same table?", lang)}
        </span>
        <button
          type="button"
          onClick={onCreateNew}
          style={{
            padding:"7px 14px", borderRadius:8,
            border:"1.5px solid #2563eb", background:"#fff",
            color:"#2563eb", fontSize:12, fontWeight:600, cursor:"pointer",
            whiteSpace:"nowrap", flexShrink:0,
          }}
        >
          {t("+ Create New KPI", lang)}
        </button>
      </div>
    </div>
  );
}

// ─── KPI Form (used in both Create and Edit views) ───────────────────────────
function KpiForm({ cfg, tables, tabStatus, existingConfigs, scope, onBack, onSaved, notify, apiFetch, onRetryTables, currentAcademicYear, onColsLoaded = () => {} }) {
  const { lang } = useLanguage();
  const isEdit = !!cfg?.id;

  const [title,           setTitle]           = useState(cfg?.title                   || "");
  const [desc,            setDesc]            = useState(cfg?.description             || "");
  const [exportTitle,     setExportTitle]     = useState(cfg?.export_title            || "");
  const [showOnDash,      setShowOnDash]      = useState(cfg?.show_on_dashboard       || false);
  const [dispType,        setDispType]        = useState(cfg?.dashboard_display_type  || "single");
  const [groupMode,       setGroupMode]       = useState("new");
  const [groupName,       setGroupName]       = useState(cfg?.dashboard_group_name    || "");
  const [selTable,        setSelTable]        = useState(cfg?.table_name              || "");
  const [xCol,            setXCol]            = useState(cfg?.x_col                  || "");
  const [yCols,           setYCols]           = useState(cfg?.y_cols                  || []);
  const [chartType,       setChartType]       = useState(cfg?.chart_type              || "bar");
  const [aggregationType, setAggregationType] = useState(cfg?.aggregation_type        || "none");
  const [groupByCol,      setGroupByCol]      = useState(cfg?.group_by_column         || "");
  const [tabSearch,       setTabSearch]       = useState("");
  const [cols,            setCols]            = useState([]);
  const [colsLoading,     setColsLoading]     = useState(false);
  const [submitError,     setSubmitError]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const academicYear = currentAcademicYear || cfg?.academic_year || "";
  // "prompt" → show reuse dialog | "new" → user chose to create new | null → no conflict
  const [reuseState,      setReuseState]      = useState(null);
  // Tracks the selTable value from the previous effect run.
  // null  = effect has never run yet (first ever invocation).
  // ""    = effect ran with no table selected.
  // "x"   = effect ran with table "x" selected.
  //
  // We reset x/y/groupBy ONLY when the user genuinely switches to a DIFFERENT table,
  // i.e. prevSelTable.current is non-null AND different from the new selTable value.
  // This survives React 18 Strict Mode's double-invocation because the second run sees
  // prevSelTable.current === selTable (equal), so the guard fires and no reset happens.
  const prevSelTable = useRef(null);

  // KPIs that already use the selected table (only checked in create mode)
  const existingForTable = (!isEdit && selTable)
    ? (existingConfigs||[]).filter(c => c.table_name === selTable)
    : [];

  // Existing group names (for the "Existing Group" picker)
  const existingGroups = [...new Set(
    (existingConfigs||[]).filter(c=>c.dashboard_display_type==="group"&&c.dashboard_group_name).map(c=>c.dashboard_group_name)
  )];

  const filteredTables = tables.filter(t => !tabSearch || t.table_name.toLowerCase().includes(tabSearch.toLowerCase()));
  const numCols        = cols.filter(c => isNumeric(c.data_type));
  const toggleY        = cn => setYCols(p => p.includes(cn) ? p.filter(c=>c!==cn) : [...p, cn]);

  useEffect(() => {
    if (!selTable) {
      setCols([]); setReuseState(null);
      prevSelTable.current = "";
      return;
    }

    setColsLoading(true);
    apiFetch(`/tables/${encodeURIComponent(selTable)}/columns`)
      .then(r => { setCols(r.data); onColsLoaded(r.data); setColsLoading(false); })
      .catch(() => setColsLoading(false));

    const prev = prevSelTable.current;
    prevSelTable.current = selTable;

    // Guard: do NOT reset when —
    //   prev === null  → very first effect run (initial mount, edit or create mode)
    //   prev === selTable → same table value seen again (React 18 Strict Mode double-fire)
    if (prev === null || prev === selTable) return;

    // User switched to a genuinely different table — reset column selections
    const conflicts = (!isEdit) ? (existingConfigs||[]).filter(c => c.table_name === selTable) : [];
    setReuseState(conflicts.length > 0 ? "prompt" : null);
    setXCol(""); setYCols([]); setGroupByCol("");
  }, [selTable]); // eslint-disable-line

  // Whether to show the full config form (column/chart pickers)
  // Show when: editing, OR table has no conflicts, OR user chose "Create New"
  const showConfigForm = isEdit || reuseState === null || reuseState === "new";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selTable)       { setSubmitError(t("Select a source table.", lang)); return; }
    if (!xCol)           { setSubmitError(t("Select an X-axis column.", lang)); return; }
    if (!yCols.length)   { setSubmitError(t("Select at least one Y-axis column.", lang)); return; }
    if (showOnDash && dispType==="group" && !groupName.trim())
      { setSubmitError(t("Enter a group name for the dashboard card.", lang)); return; }

    // Client-side aggregation compatibility check (mirrors backend validation for fast feedback)
    if (["sum","avg","min","max"].includes(aggregationType)) {
      const incompatible = yCols.filter(cn => {
        const col = cols.find(c => c.column_name === cn);
        return col && !isNumeric(col.data_type);
      });
      if (incompatible.length) {
        setSubmitError(
          `Aggregation "${aggregationType.toUpperCase()}" requires numeric columns. ` +
          `"${incompatible.join('", "')}" is not numeric. Use COUNT or COUNT DISTINCT instead.`
        );
        return;
      }
    }

    setSubmitError(""); setSubmitting(true);
    try {
      const payload = {
        title:                  title || `${selTable} · ${new Date().toLocaleDateString("en-IN")}`,
        description:            desc,
        table_name:             selTable,
        x_col:                  xCol,
        y_cols:                 yCols,
        chart_type:             chartType,
        show_on_dashboard:      showOnDash,
        dashboard_display_type: showOnDash ? dispType : "single",
        dashboard_group_name:   (showOnDash && dispType==="group") ? groupName.trim() : null,
        academic_year:          academicYear || null,
        aggregation_type:       aggregationType || "none",
        group_by_column:        (aggregationType !== "none" && groupByCol) ? groupByCol : null,
        export_title:           exportTitle.trim() || null,
        scope,
      };
      const r = isEdit
        ? await apiFetch(`/configs/${cfg.id}`, { method:"PUT",  body:JSON.stringify(payload) })
        : await apiFetch("/configs",            { method:"POST", body:JSON.stringify(payload) });
      if (r.similar_kpis?.length) {
        notify(`Created "${r.data.title}" — note: ${r.similar_kpis.length} similar KPI(s) already exist for this configuration.`);
      } else {
        notify(`${isEdit ? "Updated" : "Created"} "${r.data.title}"`);
      }
      onSaved(r.data);
    } catch(e) { setSubmitError(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <FormScreen
      pageTitle={t("KPI Charts", lang)}
      formTitle={isEdit ? t("Edit KPI Chart", lang) : t("New KPI Chart", lang)}
      formSubtitle={isEdit ? t("Update the chart configuration.", lang) : t("Configure a new KPI chart for the annual report.", lang)}
      icon={isEdit ? "✏️" : "📊"}
      iconBg={isEdit ? "#fef3c7" : "#eff6ff"}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? t("Save Changes", lang) : t("Create KPI Chart", lang)}
      submitError={submitError}
    >
      {/* ── Title ── */}
      <div>
        <label style={S.label}>{t("Chart Title", lang)}</label>
        <input style={S.input(false)} placeholder={t("e.g. Student Attendance FY 2024-25", lang)}
          value={title} onChange={e=>setTitle(e.target.value)} disabled={submitting}/>
      </div>

      {/* ── Description ── */}
      <div>
        <label style={S.label}>{t("Description", lang)} <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>{t("(optional)", lang)}</span></label>
        <input style={S.input(false)} placeholder={t("Short caption for the report", lang)}
          value={desc} onChange={e=>setDesc(e.target.value)} disabled={submitting}/>
      </div>

      {/* ── Export Display Name ── */}
      <div>
        <label style={S.label}>{t("Export Display Name", lang)} <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>{t("(optional)", lang)}</span></label>
        <input style={S.input(false)}
          placeholder="e.g. Department-wise Publication Statistics 2025"
          value={exportTitle} onChange={e=>setExportTitle(e.target.value)} disabled={submitting}/>
        <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
          {t("Appears as the heading in exported SVG/PDF. Falls back to Description, then KPI Name.", lang)}
        </div>
      </div>

      {/* ── Academic Year (from top header — read-only) ── */}
      <div>
        <label style={S.label}>{t("Academic Year", lang)}</label>
        {academicYear ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:9 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize:13, fontWeight:700, color:"#1e40af", flex:1 }}>{academicYear}</span>
          </div>
        ) : (
          <div style={{ padding:"10px 14px", background:"#fef3c7", border:"1px solid #fbbf24", borderRadius:8, fontSize:12, color:"#92400e" }}>
            {t("No academic year selected. Please select one from the top header.", lang)}
          </div>
        )}
        <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
          {t("Academic year is controlled by the top header selector — same as the Form Module.", lang)}
        </div>
      </div>

      {/* ── Dashboard Display ── */}
      <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.7 }}>{t("Dashboard Display", lang)}</div>

        {/* Toggle */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{t("Show on Dashboard", lang)}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{t("Pin this chart to the admin dashboard", lang)}</div>
          </div>
          <button type="button" onClick={()=>setShowOnDash(v=>!v)} style={{
            width:42, height:24, borderRadius:12, border:"none", cursor:"pointer",
            background: showOnDash ? "#2563eb" : "#e2e8f0", position:"relative", transition:"background .18s", flexShrink:0,
          }}>
            <span style={{
              position:"absolute", top:3, left: showOnDash?20:3,
              width:18, height:18, borderRadius:"50%", background:"#fff",
              transition:"left .18s", boxShadow:"0 1px 3px rgba(0,0,0,.2)",
            }}/>
          </button>
        </div>

        {/* Display type */}
        {showOnDash && (
          <>
            <div>
              <label style={S.label}>{t("Display Type", lang)}</label>
              <div style={{ display:"flex", gap:10, marginTop:6 }}>
                {[
                  { val:"single", label:t("Single Card", lang),  hint:t("Standalone chart", lang) },
                  { val:"group",  label:t("Group Card", lang),   hint:t("Merged with related KPIs", lang) },
                ].map(opt=>(
                  <div key={opt.val} onClick={()=>setDispType(opt.val)} style={{
                    flex:1, padding:"10px 14px", borderRadius:10, cursor:"pointer",
                    border:`1.5px solid ${dispType===opt.val?"#2563eb":"#e2e8f0"}`,
                    background: dispType===opt.val?"#eff6ff":"#fff",
                  }}>
                    <div style={{ fontSize:13, fontWeight:600, color:dispType===opt.val?"#2563eb":"#1e293b" }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{opt.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            {dispType==="group" && (
              <div>
                <label style={S.label}>{t("Group Name", lang)}</label>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  {["new","existing"].map(m=>(
                    <button key={m} type="button" onClick={()=>{setGroupMode(m); setGroupName("");}} style={{
                      padding:"6px 14px", borderRadius:8, border:`1.5px solid ${groupMode===m?"#2563eb":"#e2e8f0"}`,
                      background: groupMode===m?"#eff6ff":"#fff", fontSize:12, fontWeight:600,
                      color: groupMode===m?"#2563eb":"#64748b", cursor:"pointer",
                    }}>
                      {m==="new" ? t("New Group", lang) : t("Existing Group", lang)}
                    </button>
                  ))}
                </div>
                {groupMode==="new" ? (
                  <input style={S.input(!groupName.trim()&&submitting)}
                    placeholder={t("e.g. Student Performance, Placement…", lang)}
                    value={groupName} onChange={e=>setGroupName(e.target.value)} disabled={submitting}/>
                ) : (
                  <Select value={groupName} onChange={e=>setGroupName(e.target.value)}>
                    <option value="">{t("— Select group —", lang)}</option>
                    {existingGroups.map(g=><option key={g} value={g}>{g}</option>)}
                  </Select>
                )}
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                  {t("KPIs with the same group name appear together in one dashboard card.", lang)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Source Table ── */}
      <div>
        <label style={S.label}>{t("Source Table", lang)}</label>

        {tabStatus==="loading" && (
          <div style={{ padding:"8px 0", fontSize:12, color:"#94a3b8", display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ width:12, height:12, borderRadius:"50%", border:"2px solid #e2e8f0", borderTopColor:"#2563eb", display:"inline-block", animation:"kpi-spin .6s linear infinite" }}/>
            {t("Loading tables…", lang)}
            <style>{`@keyframes kpi-spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {tabStatus==="error" && (
          <div style={{ padding:"8px 12px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, fontSize:12, color:"#dc2626", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            {t("Could not load tables.", lang)}
            <button type="button" onClick={onRetryTables} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#dc2626", fontWeight:600 }}>{t("Retry", lang)}</button>
          </div>
        )}

        {/* Search */}
        <div style={{ position:"relative", marginBottom:6 }}>
          <svg style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input style={{ ...S.input(false), paddingLeft:32 }} placeholder={t("Filter tables…", lang)}
            value={tabSearch} onChange={e=>setTabSearch(e.target.value)}/>
        </div>

        {tabStatus==="ok" && filteredTables.length===0 && (
          <div style={{ padding:"10px", fontSize:12, color:"#94a3b8", textAlign:"center" }}>
            {tabSearch ? `${t("No tables found matching", lang)} "${tabSearch}"` : t("No tables found in database.", lang)}
          </div>
        )}

        {tabStatus==="ok" && (
          <div style={{ border:"1.5px solid #e2e8f0", borderRadius:9, maxHeight:200, overflowY:"auto" }}>
            {filteredTables.map(tbl=>(
              <div key={tbl.table_name} onClick={()=>setSelTable(tbl.table_name)} style={{
                display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                borderBottom:"1px solid #f1f5f9", cursor:"pointer",
                background: selTable===tbl.table_name ? "#eff6ff" : "#fff",
              }}>
                <div style={{
                  width:15, height:15, borderRadius:"50%", border:`1.5px solid ${selTable===tbl.table_name?"#2563eb":"#e2e8f0"}`,
                  background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>
                  {selTable===tbl.table_name && <div style={{ width:7, height:7, borderRadius:"50%", background:"#2563eb" }}/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:"#1e293b" }}>{formatTableName(tbl.table_name)}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:1, fontFamily:"monospace" }}>{tbl.table_name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reuse / Create-New prompt ── */}
      {reuseState === "prompt" && existingForTable.length > 0 && (
        <ReusePrompt
          existing={existingForTable}
          apiFetch={apiFetch}
          notify={notify}
          onReused={onSaved}
          onCreateNew={() => setReuseState("new")}
        />
      )}

      {/* ── Column & chart pickers — only shown once user confirms "Create New" ── */}
      {showConfigForm && (
        <>
          {/* ── X-Axis Column ── */}
          <div>
            <label style={S.label}>{t("X-Axis Column", lang)}</label>
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>{t("Horizontal axis — month, date, or category", lang)}</div>
            {!selTable && <div style={{ fontSize:12, color:"#94a3b8" }}>{t("Select a table first.", lang)}</div>}
            {selTable && colsLoading && (
              xCol
                ? <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:9 }}>
                    <div style={{ width:15, height:15, borderRadius:"50%", border:"1.5px solid #2563eb", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#2563eb" }}/>
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:"#1e40af", flex:1 }}>{xCol}</span>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{t("Loading options…", lang)}</span>
                  </div>
                : <div style={{ fontSize:12, color:"#94a3b8" }}>{t("Loading columns…", lang)}</div>
            )}
            {selTable && !colsLoading && (
              <div style={{ border:"1.5px solid #e2e8f0", borderRadius:9, maxHeight:180, overflowY:"auto" }}>
                {cols.map(c=>(
                  <div key={c.column_name} onClick={()=>setXCol(c.column_name)} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                    borderBottom:"1px solid #f1f5f9", cursor:"pointer",
                    background: xCol===c.column_name ? "#eff6ff" : "#fff",
                  }}>
                    <div style={{ width:15, height:15, borderRadius:"50%", border:`1.5px solid ${xCol===c.column_name?"#2563eb":"#e2e8f0"}`, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {xCol===c.column_name && <div style={{ width:7, height:7, borderRadius:"50%", background:"#2563eb" }}/>}
                    </div>
                    <span style={{ fontSize:13, fontWeight:500, flex:1, color:"#1e293b" }}>{c.column_name}</span>
                    <span style={{ fontSize:11, padding:"1px 6px", borderRadius:4, background: isNumeric(c.data_type)?"#eff6ff":"#f1f5f9", color: isNumeric(c.data_type)?"#1e40af":"#94a3b8" }}>{c.data_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Y-Axis Columns ── */}
          <div>
            <label style={S.label}>{t("Y-Axis Columns (numeric)", lang)}</label>
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>{t("Each selected column becomes one data series", lang)}</div>
            {yCols.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
                {yCols.map((cn,ci)=>(
                  <span key={cn} style={{
                    display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px 3px 6px",
                    borderRadius:6, fontSize:11.5, fontWeight:500,
                    background: SERIES_COLORS[ci%SERIES_COLORS.length]+"18",
                    color: SERIES_COLORS[ci%SERIES_COLORS.length],
                    border:`1px solid ${SERIES_COLORS[ci%SERIES_COLORS.length]}40`,
                  }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:SERIES_COLORS[ci%SERIES_COLORS.length], flexShrink:0 }}/>
                    {cn}
                    <span onClick={()=>toggleY(cn)} style={{ cursor:"pointer", opacity:.6, fontSize:13, lineHeight:1 }}>×</span>
                  </span>
                ))}
              </div>
            )}
            {selTable && colsLoading && <div style={{ fontSize:12, color:"#94a3b8", marginBottom:4 }}>{t("Loading numeric columns…", lang)}</div>}
            {selTable && !colsLoading && numCols.length>0 && (
              <div style={{ border:"1.5px solid #e2e8f0", borderRadius:9, maxHeight:180, overflowY:"auto" }}>
                {numCols.map((c,ci)=>{
                  const sel=yCols.includes(c.column_name);
                  const si=yCols.indexOf(c.column_name);
                  return (
                    <div key={c.column_name} onClick={()=>toggleY(c.column_name)} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                      borderBottom:"1px solid #f1f5f9", cursor:"pointer",
                      background: sel ? "#eff6ff" : "#fff",
                    }}>
                      <div style={{
                        width:15, height:15, borderRadius:4,
                        border:`1.5px solid ${sel?SERIES_COLORS[si%SERIES_COLORS.length]:"#e2e8f0"}`,
                        background: sel?SERIES_COLORS[si%SERIES_COLORS.length]:"#fff",
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                      }}>
                        {sel&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{ fontSize:13, fontWeight:500, flex:1, color:"#1e293b" }}>{c.column_name}</span>
                      <span style={{ fontSize:11, padding:"1px 6px", borderRadius:4, background:"#eff6ff", color:"#1e40af" }}>{c.data_type}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>{yCols.length} {yCols.length!==1?t("columns selected", lang):t("column selected", lang)}</div>
            {/* Warn if aggregation is numeric-only but selected y-cols include non-numeric */}
            {["sum","avg","min","max"].includes(aggregationType) && yCols.length > 0 && (() => {
              const bad = yCols.filter(cn => {
                const c = cols.find(x => x.column_name === cn);
                return c && !isNumeric(c.data_type);
              });
              return bad.length > 0 ? (
                <div style={{ marginTop:6, padding:"7px 12px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, fontSize:11, color:"#dc2626" }}>
                  ⛔ "{bad.join('", "')}" is not numeric. {aggregationType.toUpperCase()} requires numeric columns. Switch to COUNT or COUNT DISTINCT, or select a numeric column.
                </div>
              ) : null;
            })()}
          </div>

          {/* ── Chart Type ── */}
          <div>
            <label style={S.label}>{t("Chart Type", lang)}</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
              {CHART_TYPES.map(ct=>(
                <button key={ct.value} type="button" onClick={()=>setChartType(ct.value)} style={{
                  padding:"6px 16px", borderRadius:7, border:`1.5px solid ${chartType===ct.value?"#2563eb":"#e2e8f0"}`,
                  background: chartType===ct.value?"#2563eb":"#fff",
                  color: chartType===ct.value?"#fff":"#64748b",
                  fontSize:12.5, fontWeight:500, cursor:"pointer",
                }}>
                  {t(ct.label, lang)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Aggregation ── */}
          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.7 }}>{t("Aggregation", lang)}</div>

            <div>
              <label style={S.label}>{t("Aggregation Type", lang)}</label>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>
                {t("Apply a calculation to Y-axis values grouped by X-axis", lang)}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {AGGREGATION_TYPES.map(at=>(
                  <button key={at.value} type="button" onClick={()=>setAggregationType(at.value)} style={{
                    padding:"6px 14px", borderRadius:7,
                    border:`1.5px solid ${aggregationType===at.value?"#7c3aed":"#e2e8f0"}`,
                    background: aggregationType===at.value?"#7c3aed":"#fff",
                    color: aggregationType===at.value?"#fff":"#64748b",
                    fontSize:12, fontWeight:500, cursor:"pointer",
                  }}>
                    {t(at.label, lang)}
                  </button>
                ))}
              </div>
            </div>

            {aggregationType !== "none" && (
              <div>
                <label style={S.label}>{t("Group By Column", lang)} <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>{t("(optional — overrides X-axis for grouping)", lang)}</span></label>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>
                  {t("Leave empty to group by X-axis column. Set to group by a different field (e.g. department, year).", lang)}
                </div>
                {selTable && !colsLoading && cols.length > 0 ? (
                  <select style={S.select(false)} value={groupByCol} onChange={e=>setGroupByCol(e.target.value)} disabled={submitting}>
                    <option value="">{t("— Use X-axis column —", lang)}</option>
                    {cols.map(c=><option key={c.column_name} value={c.column_name}>{c.column_name} ({c.data_type})</option>)}
                  </select>
                ) : selTable && colsLoading ? (
                  groupByCol
                    ? <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, fontSize:13 }}>
                        <span style={{ fontWeight:600, color:"#1e40af", flex:1 }}>{groupByCol}</span>
                        <span style={{ fontSize:11, color:"#94a3b8" }}>{t("Loading options…", lang)}</span>
                      </div>
                    : <div style={{ fontSize:12, color:"#94a3b8" }}>{t("Loading columns…", lang)}</div>
                ) : (
                  <div style={{ fontSize:12, color:"#94a3b8" }}>{t("Select a source table first to choose columns.", lang)}</div>
                )}
              </div>
            )}

            {aggregationType !== "none" && (
              <div style={{ padding:"10px 14px", background:"#ede9fe", border:"1px solid #c4b5fd", borderRadius:8, fontSize:12, color:"#5b21b6" }}>
                <strong>Preview SQL pattern:</strong>
                <code style={{ display:"block", marginTop:4, fontFamily:"monospace", fontSize:11 }}>
                  SELECT {groupByCol || xCol || "x_col"}, {aggregationType.toUpperCase()}({yCols[0] || "y_col"})
                  {" "}FROM {selTable || "table"} GROUP BY {groupByCol || xCol || "x_col"}
                </code>
              </div>
            )}
          </div>
        </>
      )}
    </FormScreen>
  );
}

// ─── KPI palette ──────────────────────────────────────────────────────────────
const ICON_PALETTES = [
  { bg:"#eff6ff", color:"#1d4ed8" }, { bg:"#ecfdf5", color:"#027a48" },
  { bg:"#f5f3ff", color:"#6d28d9" }, { bg:"#fff7ed", color:"#c2410c" },
  { bg:"#f0f9ff", color:"#0369a1" }, { bg:"#fdf2f8", color:"#9d174d" },
];

// ─── Delete confirm modal — built on the shared design-system Modal/Button so it
//     matches every other module (squared corners, app font, danger accent) ─────
function KpiDeleteModal({ cfg, deleting, onClose, onConfirm }) {
  const { lang } = useLanguage();
  return (
    <Modal
      open
      onClose={onClose}
      danger
      width={520}
      closeOnBackdrop={!deleting}
      icon={<Trash2 size={20} strokeWidth={1.9} />}
      title={t("Delete KPI Chart?", lang)}
      subtitle={cfg.table_name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>{t("Cancel", lang)}</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>
            {deleting ? t("Deleting…", lang) : t("Yes, Delete", lang)}
          </Button>
        </>
      }
    >
      <div style={{ fontSize:13.5, color:"#475569", lineHeight:1.6 }}>
        <strong style={{ color:"#111827" }}>{cfg.title}</strong>{" "}
        {t("will be permanently removed along with all saved exports. This cannot be undone.", lang)}
      </div>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function KpiManagementPage({ scope = "institute" }) {
  const { lang } = useLanguage();
  const navFn    = useNavigate();
  const location = useLocation();
  const { accessToken } = useAuth();
  const apiFetch = useCallback(makeApiFetch(accessToken), [accessToken]); // eslint-disable-line
  const { academicYear } = useAcademicYear() || {};

  // colLabels: column_name → { label_en, label_hi } — populated when KpiForm loads a table
  const [colLabels, setColLabels] = useState({});
  const onColsLoaded = useCallback(cols => {
    setColLabels(Object.fromEntries((cols || []).map(c => [c.column_name, c])));
  }, []);


  const scopeLabel = scope==="department" ? t("Department KPI", lang) : t("Institute KPI", lang);
  const scopeDesc  = scope==="department"
    ? t("Configure and export KPI charts for your department's annual report.", lang)
    : t("Configure and export KPI charts for the institute's annual report.", lang);

  const listPath = `/${SLUG}`;
  const isCreate  = location.pathname.endsWith("/create");
  const isEdit    = location.pathname.endsWith("/edit");
  const isPreview = location.pathname.endsWith("/preview");
  const editCfg    = isEdit    ? (location.state?.entity ?? null) : null;
  const previewCfg = isPreview ? (location.state?.entity ?? null) : null;

  // ── Data state ──
  const [configs,    setConfigs]    = useState([]);
  const [cfgsLoading,setCfgsLoading]= useState(true);
  const [tables,     setTables]     = useState([]);
  const [tabStatus,  setTabStatus]  = useState("loading");

  // ── Preview chart state ──
  const [activeCfg,  setActiveCfg]  = useState(null);
  const [chartSeries,setChartSeries]= useState(null);
  const [chartX,     setChartX]     = useState(null);
  const [yRange,     setYRange]     = useState(null);
  const [displaySql, setDisplaySql] = useState("");
  const [fetchedAt,  setFetchedAt]  = useState(null);
  const [rowCount,   setRowCount]   = useState(null);
  const [chartType,  setChartType]  = useState("bar");
  const [showSql,    setShowSql]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [statusFilter,setStatusFilter] = useState("all");
  const [listSearch,  setListSearch]   = useState("");

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState(null); // cfg pending deletion
  const [deleting,     setDeleting]     = useState(false);

  // ── Toast ──
  const [toast,      setToast]      = useState({ msg:"", err:false });
  const notify = useCallback((msg, err=false) => {
    setToast({ msg, err });
    setTimeout(()=>setToast({ msg:"", err:false }), 4500);
  }, []);

  // ── ECharts ──
  const [eReady,     setEReady]     = useState(false);
  const chartDivRef  = useRef(null);
  const chartInst    = useRef(null);

  useEffect(()=>{
    if (window.echarts) { setEReady(true); return; }
    const sc=document.createElement("script");
    sc.src=ECHARTS_CDN; sc.onload=()=>setEReady(true);
    document.head.appendChild(sc);
  },[]); // eslint-disable-line

  // Spinner keyframes (injected once) for the preview loading state.
  useEffect(()=>{
    const id="pm-kpi-spin-css";
    if (document.getElementById(id)) return;
    const el=document.createElement("style");
    el.id=id; el.textContent="@keyframes pm-kpi-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(el);
  },[]);

  const loadTables = useCallback(()=>{
    setTabStatus("loading");
    apiFetch("/tables")
      .then(r=>{ setTables(r.data); setTabStatus("ok"); })
      .catch(()=>setTabStatus("error"));
  },[apiFetch]);
  useEffect(()=>{ loadTables(); },[loadTables]);

  const loadConfigs = useCallback(()=>{
    setCfgsLoading(true);
    const yearQs = academicYear ? `&year=${encodeURIComponent(academicYear)}` : "";
    apiFetch(`/configs?scope=${scope}${yearQs}`)
      .then(r=>{ setConfigs(r.data); setCfgsLoading(false); })
      .catch(()=>setCfgsLoading(false));
  },[apiFetch, scope, academicYear]);
  useEffect(()=>{ loadConfigs(); },[loadConfigs]);

  // ECharts ref callback
  const chartRefCb = useCallback(el=>{
    chartDivRef.current=el;
    if (!el) { if (chartInst.current) { try{chartInst.current.dispose();}catch(_){} chartInst.current=null; } return; }
    setTimeout(()=>{
      if (!el||!window.echarts||chartInst.current) return;
      chartInst.current=window.echarts.init(el,null,{renderer:"svg"});
      new ResizeObserver(()=>chartInst.current?.resize()).observe(el);
    },0);
  },[]);

  useEffect(()=>{
    if (!chartInst.current||!chartSeries||!chartX||!yRange) return;
    const t=setTimeout(()=>{
      if (!chartInst.current) return;
      chartInst.current.resize();
      chartInst.current.setOption(buildOption(chartType,chartX,chartSeries,yRange),true);
    },30);
    return ()=>clearTimeout(t);
  },[chartSeries,chartX,chartType,yRange]);

  const [truncated,   setTruncated]   = useState(false);

  const applyResult = useCallback((rd, currentLang, currentLabels) => {
    const s = rd.series.map((s, i) => ({
      name:  s.label || translateSeriesLabel(s.column, currentLang, currentLabels),
      data:  s.values,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
    setChartSeries(s); setChartX((rd.x||[]).map(String)); setYRange(rd.y_range);
    setDisplaySql(rd.sql||""); setFetchedAt(rd.fetched_at||null); setRowCount(rd.row_count||null);
    setTruncated(!!rd.truncated);
  }, []);

  const regenerate = useCallback(async cfg=>{
    setGenerating(true); setChartType(cfg.chart_type||"bar");
    try {
      const r=await apiFetch(`/configs/${cfg.id}/regenerate?lang=${lang}`,{method:"POST"});
      setActiveCfg(r.data.config||cfg); applyResult(r.data, lang, colLabels);
      const truncNote = r.data.truncated ? " · first 5,000 rows shown" : "";
      notify(`Loaded "${(r.data.config||cfg).title}" · ${r.data.row_count} rows${truncNote}`);
    } catch(e){ notify(e.message,true); setActiveCfg(cfg); setChartSeries(null); setChartX(null); }
    finally { setGenerating(false); }
  },[apiFetch,applyResult,notify,lang,colLabels]); // eslint-disable-line

  const exportSvg = useCallback(async()=>{
    if (!chartSeries||!chartX||!chartInst.current) { notify(t("No chart to export.", lang),true); return; }
    if (!activeCfg?.id) { notify(t("Preview a chart first, then export.", lang),true); return; }
    setExporting(true);
    try {
      await new Promise(r=>setTimeout(r,50));
      const cSvg=chartInst.current.renderToSVGString();
      const tSvg=buildTableSVG(chartSeries,chartX,lang);
      const cW=chartDivRef.current?.offsetWidth||860, cH=chartDivRef.current?.offsetHeight||400;
      // Export title priority (language-aware): Export Display Name → Description → KPI Title → fallback
      const exportTitle = cfgExportTitle(activeCfg, lang) ||
        cfgDesc(activeCfg, lang) ||
        (cfgTitle(activeCfg, lang) !== "KPI Chart" ? cfgTitle(activeCfg, lang) : "") ||
        `${activeCfg.table_name || "KPI"} · ${new Date().toLocaleDateString("en-IN")}`;
      const exportSubtitle = activeCfg.academic_year
        ? `Academic Year: ${activeCfg.academic_year}  |  Chart: ${activeCfg.chart_type}`
        : `Chart: ${activeCfg.chart_type || "bar"}`;
      const e = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const tH=64, gap=16;
      const combined=
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cW}" height="${tH+cH+gap+200}">` +
        `<rect width="${cW}" height="${tH+cH+gap+200}" fill="#fff"/>` +
        `<text x="16" y="28" font-size="15" font-weight="700" fill="#101828" font-family="${SVG_FONT}">${e(exportTitle)}</text>` +
        `<text x="16" y="48" font-size="11" fill="#64748b" font-family="${SVG_FONT}">${e(exportSubtitle)}</text>` +
        `<svg x="0" y="${tH}" width="${cW}" height="${cH}">${cSvg}</svg>` +
        `<svg x="0" y="${tH+cH+gap}" width="${cW}" height="180">${tSvg}</svg></svg>`;
      await apiFetch(`/configs/${activeCfg.id}/export-svg`,{method:"POST",body:JSON.stringify({svg_data:combined,report_data:{config_id:activeCfg.id,export_title:exportTitle,academic_year:activeCfg.academic_year||null,generated_at:new Date().toISOString()}})});
      loadConfigs(); notify(`Exported chart #${activeCfg.id}`);
    } catch(e){ notify(e.message,true); }
    finally { setExporting(false); }
  },[chartSeries,chartX,activeCfg,lang,apiFetch,loadConfigs,notify]);

  // Open the confirmation modal; the actual delete runs in confirmDelete().
  const requestDelete = useCallback(cfg=>setDeleteTarget(cfg),[]);

  const confirmDelete = useCallback(async ()=>{
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await apiFetch(`/configs/${id}`,{method:"DELETE"});
      setConfigs(p=>p.filter(c=>c.id!==id));
      if (activeCfg?.id===id) { setActiveCfg(null); setChartSeries(null); setChartX(null); }
      setDeleteTarget(null);
      notify(`Config #${id} deleted`);
    } catch(e){ notify(e.message,true); }
    finally { setDeleting(false); }
  },[deleteTarget,activeCfg,apiFetch,notify]);

  const handleSaved = (saved)=>{ loadConfigs(); navFn(`${listPath}/preview`, { state:{ entity: saved } }); };

  // When the dedicated preview page opens (with a cfg in route state), load its
  // chart once. Re-runs become no-ops after activeCfg matches the previewed cfg.
  useEffect(()=>{
    if (isPreview && previewCfg && activeCfg?.id !== previewCfg.id) regenerate(previewCfg);
  },[isPreview, previewCfg, activeCfg, regenerate]);

  // When the user switches language, re-fetch the active chart so data and labels update
  const activeCfgRef = useRef(activeCfg);
  activeCfgRef.current = activeCfg;
  useEffect(()=>{
    if (activeCfgRef.current) regenerate(activeCfgRef.current);
  },[lang]); // eslint-disable-line

  const filtered = configs.filter(c => {
    if (statusFilter === "exported") return !!c.svg_id;
    if (statusFilter === "draft")    return !c.svg_id;
    return true;
  }).filter(c => {
    if (!listSearch.trim()) return true;
    const q = listSearch.trim().toLowerCase();
    return cfgTitle(c, lang).toLowerCase().includes(q) ||
      formatTableName(c.table_name).toLowerCase().includes(q);
  });

  // ── Form views ──────────────────────────────────────────────────────────────
  if (isCreate || isEdit) {
    if (isEdit && !editCfg) return <Navigate to={listPath} replace />;
    return (
      <KpiForm
        cfg={isEdit ? editCfg : null}
        tables={tables}
        tabStatus={tabStatus}
        existingConfigs={configs}
        scope={scope}
        onBack={()=>navFn(listPath)}
        onSaved={handleSaved}
        notify={notify}
        apiFetch={apiFetch}
        onRetryTables={loadTables}
        currentAcademicYear={academicYear}
        onColsLoaded={onColsLoaded}
      />
    );
  }

  // ── Preview view (dedicated page for a single KPI chart) ──────────────────────
  if (isPreview) {
    if (!previewCfg) return <Navigate to={listPath} replace />;
    const ready = chartSeries && chartX && yRange && activeCfg && activeCfg.id === previewCfg.id;
    return (
      <div style={{ padding:"32px 36px", fontFamily:"'Plus Jakarta Sans',sans-serif", minHeight:"100%" }}>

        <PageHeader
          breadcrumb={scope === "department"
            ? [t("Home", lang), t("Department", lang), { label: t("KPI Charts", lang), onClick: () => navFn(listPath) }, cfgTitle(previewCfg, lang)]
            : [t("Home", lang), t("Institute", lang), { label: t("KPI Charts", lang), onClick: () => navFn(listPath) }, cfgTitle(previewCfg, lang)]}
          title={cfgTitle(previewCfg, lang)}
          description={formatTableName(previewCfg.table_name)}
        />

        {!ready ? (
          <div style={{ minHeight:560, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#94a3b8", fontSize:14, background:"#fff", border:"1px solid #e2e8f0", borderRadius:14 }}>
            <div style={{ width:28, height:28, border:"3px solid #e2e8f0", borderTopColor:"#2563eb", borderRadius:"50%", animation:"pm-kpi-spin 0.7s linear infinite" }} />
            {t("Loading chart…", lang)}
          </div>
        ) : (
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>

          {/* Chart header */}
          <div style={{ padding:"16px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e293b" }}>{cfgTitle(activeCfg, lang)}</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                {formatTableName(activeCfg.table_name)} · {chartX.length} {t("periods", lang)} · {chartSeries.length} {t("series", lang)}
                {rowCount!=null && <> · {rowCount} {t("rows", lang)}</>}
                {activeCfg.academic_year && <> · <span style={{ color:"#1d4ed8", fontWeight:600 }}>{activeCfg.academic_year}</span></>}
                {activeCfg.aggregation_type && activeCfg.aggregation_type !== "none" && <> · <span style={{ color:"#7c3aed", fontWeight:600 }}>{activeCfg.aggregation_type.toUpperCase()}</span></>}
                {fetchedAt && <> · {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>}
              </div>
              {truncated && (
                <div style={{ marginTop:6, padding:"5px 10px", background:"#fffbeb", border:"1px solid #fbbf24", borderRadius:6, fontSize:11, color:"#92400e" }}>
                  ⚠️ Showing first 5,000 rows (dataset is larger). Enable an aggregation (Sum, Count, Avg…) to see complete totals across all records.
                </div>
              )}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {CHART_TYPES.map(ct=>(
                <button key={ct.value} onClick={()=>setChartType(ct.value)} style={{
                  padding:"5px 12px", borderRadius:6, border:`1.5px solid ${chartType===ct.value?"#2563eb":"#e2e8f0"}`,
                  background: chartType===ct.value?"#2563eb":"#fff",
                  color: chartType===ct.value?"#fff":"#64748b",
                  fontSize:12, fontWeight:500, cursor:"pointer",
                }}>
                  {t(ct.label, lang)}
                </button>
              ))}
            </div>
          </div>

          {/* KPI metadata strip */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 28, flexWrap: "wrap", background: "#fafbff" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("Source Form", lang)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{formatTableName(activeCfg.table_name)}</div>
            </div>
            {activeCfg.academic_year && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("Academic Year", lang)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>{activeCfg.academic_year}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("Chart Type", lang)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{CHART_TYPES.find(c => c.value === chartType)?.label || chartType}</div>
            </div>
            {activeCfg.x_col && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>X-Axis</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{activeCfg.x_col}</div>
              </div>
            )}
            {activeCfg.y_cols?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>Y-Axis</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{activeCfg.y_cols.join(", ")}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("Dashboard", lang)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: activeCfg.show_on_dashboard ? "#059669" : "#94a3b8" }}>
                {activeCfg.show_on_dashboard ? t("Enabled", lang) : t("Disabled", lang)}
              </div>
            </div>
            {activeCfg.aggregation_type && activeCfg.aggregation_type !== "none" && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("Aggregation", lang)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed" }}>{activeCfg.aggregation_type.toUpperCase()}</div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding:"10px 24px 0", display:"flex", flexWrap:"wrap", gap:12 }}>
            {chartSeries.map(s=>(
              <span key={s.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#64748b" }}>
                <span style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }}/>
                {s.name}
              </span>
            ))}
          </div>

          {/* Chart */}
          {!eReady
            ? <div style={{ height:360, display:"flex", alignItems:"center", justifyContent:"center", color:"#94a3b8" }}>{t("Loading chart library…", lang)}</div>
            : <div ref={chartRefCb} style={{ width:"100%", height:380, padding:"8px 0" }}/>
          }

          {/* SQL */}
          <div style={{ borderTop:"1px solid #f1f5f9", padding:"12px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:showSql?10:0 }}>
              <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:"#94a3b8" }}>{t("Stored Query", lang)}</span>
              <button onClick={()=>setShowSql(v=>!v)} style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:11, cursor:"pointer" }}>
                {showSql?t("Hide SQL", lang):t("Show SQL", lang)}
              </button>
            </div>
            {showSql && (
              <div style={{ background:"#0d1117", borderRadius:8, padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#c9d1d9", overflowX:"auto", whiteSpace:"pre", lineHeight:1.7 }}>
                {displaySql}
              </div>
            )}
          </div>

          {/* Data table */}
          <div style={{ borderTop:"1px solid #f1f5f9", padding:"12px 24px" }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:"#94a3b8", marginBottom:10 }}>
              {t("Data", lang)} — {chartSeries.length} {t("series", lang)} × {chartX.length} {t("periods", lang)}
            </div>
            <div style={{ overflowX:"auto", border:"1px solid #f1f5f9", borderRadius:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, whiteSpace:"nowrap" }}>
                <thead>
                  <tr>
                    <th style={{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", color:"#94a3b8", background:"#f9fafb", borderBottom:"1px solid #f1f5f9" }}>{t("Series", lang)}</th>
                    {chartX.map(l=><th key={l} style={{ padding:"9px 14px", textAlign:"center", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", color:"#94a3b8", background:"#f9fafb", borderBottom:"1px solid #f1f5f9" }}>{l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {chartSeries.map((s,si)=>(
                    <tr key={s.name}>
                      <td style={{ padding:"8px 14px", borderBottom:"1px solid #f9fafb", fontWeight:500, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:9, height:9, borderRadius:2, background:s.color, flexShrink:0 }}/>{s.name}
                      </td>
                      {s.data.map((v,ci)=><td key={ci} style={{ padding:"8px 14px", borderBottom:"1px solid #f9fafb", textAlign:"center", color:"#1e293b" }}>{fmtNum(v)}</td>)}
                    </tr>
                  ))}
                  <tr style={{ background:"#eff6ff" }}>
                    <td style={{ padding:"8px 14px", fontWeight:700, color:"#1e40af" }}>{t("Total", lang)}</td>
                    {chartX.map((_,ci)=>(
                      <td key={ci} style={{ padding:"8px 14px", textAlign:"center", fontWeight:700, color:"#1e40af" }}>
                        {fmtNum(chartSeries.reduce((a,s)=>a+(Number(s.data[ci])||0),0))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Export footer */}
          <div style={{ borderTop:"1px solid #f1f5f9", padding:"16px 24px", background:"#f9fafb", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontSize:13.5, fontWeight:600, color:"#1e293b" }}>{t("Export to Annual Report", lang)}</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{t("Saves the rendered SVG permanently. Only export when data is finalised.", lang)}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>regenerate(activeCfg)} disabled={generating} style={{ padding:"9px 16px", borderRadius:9, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:13, fontWeight:600, color:"#475569", cursor:"pointer" }}>
                {generating ? t("Refreshing…", lang) : t("Refresh Data", lang)}
              </button>
              <button onClick={exportSvg} disabled={exporting||!eReady} style={{ padding:"9px 18px", borderRadius:9, border:"none", background:"#059669", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(5,150,105,.28)" }}>
                {exporting ? t("Exporting…", lang) : t("Export SVG", lang)}
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Toast */}
        {toast.msg && (
          <div style={{
            position:"fixed", bottom:24, right:24, zIndex:9999,
            padding:"12px 18px", borderRadius:8, fontSize:13.5, fontWeight:500,
            background: toast.err?"#fef2f2":"#101828",
            color: toast.err?"#b91c1c":"#fff",
            border: toast.err?"1px solid #fecaca":"none",
            boxShadow:"0 4px 20px rgba(0,0,0,.16)", maxWidth:380,
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  const STROKE = 1.75;
  const kpiBreadcrumb = scope === "department"
    ? [t("Home", lang), t("Department", lang), t("KPI Charts", lang)]
    : [t("Home", lang), t("Institute", lang), t("KPI Charts", lang)];

  const listColumns = [
    {
      key: "kpi",
      header: t("KPI Name", lang),
      width: 300,
      render: (cfg, rowIndex) => {
        const p = ICON_PALETTES[rowIndex % ICON_PALETTES.length];
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: p.bg, color: p.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, letterSpacing: 0.3, fontFamily: "monospace" }}>
              {(cfg.table_name || "KPI").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="ui-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, color: color.text }} title={cfgTitle(cfg, lang)}>
                {cfgTitle(cfg, lang)}
              </div>
              <div style={{ fontSize: 11.5, color: color.muted, marginTop: 1 }}>
                {t("Since", lang)} {fmtDate(cfg.created_at)}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "source",
      header: t("Source Form", lang),
      width: 180,
      render: (cfg) => (
        <span style={{ fontSize: 13, color: color.text, fontWeight: 500 }}>
          {formatTableName(cfg.table_name)}
        </span>
      ),
    },
    {
      key: "year",
      header: t("Academic Year", lang),
      width: 150,
      render: (cfg) => cfg.academic_year
        ? <Badge tone="primary">{cfg.academic_year}</Badge>
        : <span style={{ color: color.muted }}>—</span>,
    },
    {
      key: "status",
      header: t("Status", lang),
      width: 110,
      render: (cfg) => cfg.svg_id
        ? <Badge tone="success">{t("Exported", lang)}</Badge>
        : <Badge tone="neutral">{t("Draft", lang)}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 170,
      render: (cfg) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="secondary" iconOnly title={t("Preview", lang)} icon={<Eye size={16} strokeWidth={STROKE} />} onClick={() => navFn(`${listPath}/preview`, { state: { entity: cfg } })} />
          <Button variant="secondary" iconOnly title={t("Edit", lang)} icon={<Edit2 size={16} strokeWidth={STROKE} />} onClick={() => navFn(`${listPath}/edit`, { state: { entity: cfg } })} />
          <Button variant="secondary" iconOnly title={t("Export", lang)} icon={<Download size={16} strokeWidth={STROKE} />} onClick={() => navFn(`${listPath}/preview`, { state: { entity: cfg } })} />
          <Button variant="outlineDanger" iconOnly title={t("Delete", lang)} icon={<Trash2 size={16} strokeWidth={STROKE} />} onClick={() => requestDelete(cfg)} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", background: "transparent" }}>
      {toast.msg && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          padding: "12px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 500,
          background: toast.err ? "#fef2f2" : "#101828",
          color: toast.err ? "#b91c1c" : "#fff",
          border: toast.err ? "1px solid #fecaca" : "none",
          boxShadow: "0 4px 20px rgba(0,0,0,.16)", maxWidth: 380,
        }}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        breadcrumb={kpiBreadcrumb}
        title={t("KPI Charts", lang)}
        description={scopeDesc}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} strokeWidth={STROKE} />} onClick={loadConfigs}>{t("Refresh", lang)}</Button>
            <Button variant="primary" icon={<Plus size={16} strokeWidth={STROKE} />} onClick={() => navFn(`${listPath}/create`)}>{t("New KPI Chart", lang)}</Button>
          </>
        }
      />

      <DataTable
        columns={listColumns}
        rows={filtered}
        rowKey={(c) => c.id}
        loading={cfgsLoading}
        minWidth={900}
        toolbar={
          <>
            <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted, pointerEvents: "none" }} />
              <input
                value={listSearch} onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("Search KPI charts…", lang)}
                style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box", background: color.surface }}
              />
            </div>
            <div style={{ display: "inline-flex", border: `1px solid ${color.border}`, borderRadius: 10, padding: 3, gap: 2, background: color.hover }}>
              {[
                { val: "all",      label: `${t("All", lang)} (${configs.length})` },
                { val: "draft",    label: t("Draft", lang) },
                { val: "exported", label: t("Exported", lang) },
              ].map(f => {
                const on = statusFilter === f.val;
                return (
                  <button key={f.val} onClick={() => setStatusFilter(f.val)} className="ui-focusable"
                    style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                             background: on ? color.surface : "transparent", color: on ? color.text : color.muted,
                             boxShadow: on ? "0 1px 2px rgba(16,24,40,0.08)" : "none" }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
            {academicYear && (
              <Badge tone="primary">{academicYear}</Badge>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={listSearch.trim() ? <Search size={26} strokeWidth={1.5} /> : <Plus size={26} strokeWidth={1.5} />}
            title={listSearch.trim() ? t("No KPI charts match your search", lang) : t("No KPI charts yet", lang)}
            description={
              listSearch.trim()
                ? t("Try a different name or clear the search.", lang)
                : t('Click "New KPI Chart" to create your first chart.', lang)
            }
            action={!listSearch.trim()
              ? <Button variant="primary" icon={<Plus size={16} strokeWidth={STROKE} />} onClick={() => navFn(`${listPath}/create`)}>{t("New KPI Chart", lang)}</Button>
              : undefined}
          />
        }
      />

      {deleteTarget && (
        <KpiDeleteModal
          cfg={deleteTarget}
          deleting={deleting}
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

