"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
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

const NUMERIC_TYPES = [
  "integer","bigint","smallint","numeric","decimal","real","double precision",
  "float","float4","float8","int2","int4","int8","money","serial","bigserial","smallserial","int","number",
];
const isNumeric = dt => NUMERIC_TYPES.some(t => (dt||"").toLowerCase().includes(t.split(" ")[0]));

const fmtDate = ts => ts
  ? new Date(ts).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
  : "—";
const fmtNum = n => Number(n||0).toLocaleString();

// ─── ECharts option builder ───────────────────────────────────────────────────
function buildOption(chartType, xLabels, series, yRange) {
  const txt   = { fontFamily:"'Inter',sans-serif", fontSize:11, color:"#98a2b3" };
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
      label:{ fontSize:11, fontFamily:"'Inter',sans-serif" }, emphasis:{ itemStyle:{ shadowBlur:6 } },
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
function buildTableSVG(series, xLabels) {
  const LW=130,CW=82,RH=28,HH=36,P=14;
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
function KpiForm({ cfg, tables, tabStatus, existingConfigs, scope, onBack, onSaved, notify, apiFetch, onRetryTables }) {
  const { lang } = useLanguage();
  const isEdit = !!cfg?.id;

  const [title,           setTitle]           = useState(cfg?.title                   || "");
  const [desc,            setDesc]            = useState(cfg?.description             || "");
  const [showOnDash,      setShowOnDash]      = useState(cfg?.show_on_dashboard       || false);
  const [dispType,        setDispType]        = useState(cfg?.dashboard_display_type  || "single");
  const [groupMode,       setGroupMode]       = useState("new");
  const [groupName,       setGroupName]       = useState(cfg?.dashboard_group_name    || "");
  const [selTable,        setSelTable]        = useState(cfg?.table_name              || "");
  const [xCol,            setXCol]            = useState(cfg?.x_col                  || "");
  const [yCols,           setYCols]           = useState(cfg?.y_cols                  || []);
  const [chartType,       setChartType]       = useState(cfg?.chart_type              || "bar");
  const [tabSearch,       setTabSearch]       = useState("");
  const [cols,            setCols]            = useState([]);
  const [colsLoading,     setColsLoading]     = useState(false);
  const [submitError,     setSubmitError]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  // "prompt" → show reuse dialog | "new" → user chose to create new | null → no conflict
  const [reuseState,      setReuseState]      = useState(null);

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

  // When table changes reset column picks and decide whether to show reuse prompt
  useEffect(() => {
    if (!selTable) { setCols([]); setReuseState(null); return; }
    setColsLoading(true);
    apiFetch(`/tables/${encodeURIComponent(selTable)}/columns`)
      .then(r => { setCols(r.data); setColsLoading(false); })
      .catch(() => setColsLoading(false));

    // Reset reuse choice whenever the table changes
    const conflicts = (!isEdit) ? (existingConfigs||[]).filter(c => c.table_name === selTable) : [];
    setReuseState(conflicts.length > 0 ? "prompt" : null);
    setXCol(""); setYCols([]);
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
        scope,
      };
      const r = isEdit
        ? await apiFetch(`/configs/${cfg.id}`, { method:"PUT",  body:JSON.stringify(payload) })
        : await apiFetch("/configs",            { method:"POST", body:JSON.stringify(payload) });
      notify(`${isEdit ? "Updated" : "Created"} "${r.data.title}"`);
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
                <span style={{ fontSize:13, fontWeight:500, flex:1, color:"#1e293b" }}>{tbl.table_name}</span>
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
            {selTable && colsLoading && <div style={{ fontSize:12, color:"#94a3b8" }}>{t("Loading columns…", lang)}</div>}
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
        </>
      )}
    </FormScreen>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const ICON_PALETTES = [
  { bg:"#eff6ff", color:"#1d4ed8" }, { bg:"#ecfdf5", color:"#027a48" },
  { bg:"#f5f3ff", color:"#6d28d9" }, { bg:"#fff7ed", color:"#c2410c" },
  { bg:"#f0f9ff", color:"#0369a1" }, { bg:"#fdf2f8", color:"#9d174d" },
];

function KpiCard({ cfg, idx, isActive, generating, onEdit, onPreview, onDelete }) {
  const { lang } = useLanguage();
  const isExported = !!cfg.svg_id;
  const p = ICON_PALETTES[idx % ICON_PALETTES.length];
  return (
    <div style={{
      background:"#fff", border:`1px solid ${isActive?"#2563eb":"rgba(0,0,0,0.07)"}`,
      borderRadius:14, padding:"22px 24px", boxShadow: isActive?"0 0 0 2px #bfdbfe":"0 1px 4px rgba(0,0,0,0.05)",
      display:"flex", flexDirection:"column", gap:0,
      outline: isActive?"2px solid #2563eb":undefined, outlineOffset:2,
    }}>
      {/* Top row */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:42, height:42, borderRadius:11, background:p.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:p.color, letterSpacing:.5, fontFamily:"monospace", flexShrink:0 }}>
            {cfg.table_name?.substring(0,4).toUpperCase()||"KPI"}
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>{cfg.title}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{t("Since", lang)} {fmtDate(cfg.created_at)}</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
          <span style={{
            padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap",
            background: isExported?"#d1fae5":"#f1f5f9",
            color: isExported?"#065f46":"#94a3b8",
          }}>
            {isExported ? t("Exported", lang) : t("Draft", lang)}
          </span>
          {cfg.show_on_dashboard && (
            <span style={{ padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:600, background:"#eff6ff", color:"#1d4ed8", border:"1px solid #bfdbfe" }}>
              {cfg.dashboard_display_type==="group" ? `${t("Group:", lang)} ${cfg.dashboard_group_name||"?"}` : t("Dashboard", lang)}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:16, padding:"12px 14px", background:"#f8fafc", borderRadius:10, marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>{t("Series", lang)}</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#1e293b" }}>{(cfg.y_cols||[]).length}</div>
        </div>
        <div style={{ width:1, background:"#e2e8f0" }}/>
        <div>
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>{t("Table", lang)}</div>
          <div style={{ fontSize:12, fontWeight:600, color:"#1e293b", fontFamily:"monospace" }}>{cfg.table_name}</div>
        </div>
        <div style={{ width:1, background:"#e2e8f0" }}/>
        <div>
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>{t("Type", lang)}</div>
          <div style={{ fontSize:12, fontWeight:600, color:"#1e293b" }}>{cfg.chart_type}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>onEdit(cfg)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:12, fontWeight:600, color:"#2563eb", cursor:"pointer" }}>
          {t("Edit", lang)}
        </button>
        <button onClick={()=>onPreview(cfg)} disabled={generating} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:12, fontWeight:600, color:"#059669", cursor:generating?"not-allowed":"pointer", opacity:generating?0.6:1 }}>
          {t("Preview", lang)}
        </button>
        <button onClick={()=>onDelete(cfg)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1.5px solid #fecaca", background:"#fef2f2", fontSize:12, fontWeight:600, color:"#dc2626", cursor:"pointer" }}>
          {t("Delete", lang)}
        </button>
      </div>
    </div>
  );
}

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

  const scopeLabel = scope==="department" ? t("Department KPI", lang) : t("Institute KPI", lang);
  const scopeDesc  = scope==="department"
    ? t("Configure and export KPI charts for your department's annual report.", lang)
    : t("Configure and export KPI charts for the institute's annual report.", lang);

  const listPath = `/${SLUG}`;
  const isCreate = location.pathname.endsWith("/create");
  const isEdit   = location.pathname.endsWith("/edit");
  const editCfg  = isEdit ? (location.state?.entity ?? null) : null;

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

  const loadTables = useCallback(()=>{
    setTabStatus("loading");
    apiFetch("/tables")
      .then(r=>{ setTables(r.data); setTabStatus("ok"); })
      .catch(()=>setTabStatus("error"));
  },[apiFetch]);
  useEffect(()=>{ loadTables(); },[loadTables]);

  const loadConfigs = useCallback(()=>{
    setCfgsLoading(true);
    apiFetch("/configs")
      .then(r=>{ setConfigs(r.data); setCfgsLoading(false); })
      .catch(()=>setCfgsLoading(false));
  },[apiFetch]);
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

  const applyResult = useCallback(rd=>{
    const s=rd.series.map((s,i)=>({ name:s.column, data:s.values, color:SERIES_COLORS[i%SERIES_COLORS.length] }));
    setChartSeries(s); setChartX((rd.x||[]).map(String)); setYRange(rd.y_range);
    setDisplaySql(rd.sql||""); setFetchedAt(rd.fetched_at||null); setRowCount(rd.row_count||null);
  },[]);

  const regenerate = useCallback(async cfg=>{
    setGenerating(true); setChartType(cfg.chart_type||"bar");
    try {
      const r=await apiFetch(`/configs/${cfg.id}/regenerate`,{method:"POST"});
      setActiveCfg(r.data.config||cfg); applyResult(r.data);
      setView("preview");          // show the chart on its own dedicated page
      notify(`Loaded "${(r.data.config||cfg).title}" · ${r.data.row_count} rows`);
    } catch(e){ notify(e.message,true); }
    finally { setGenerating(false); }
  },[apiFetch,applyResult,notify]);

  const exportSvg = useCallback(async()=>{
    if (!chartSeries||!chartX||!chartInst.current) { notify(t("No chart to export.", lang),true); return; }
    if (!activeCfg?.id) { notify(t("Preview a chart first, then export.", lang),true); return; }
    setExporting(true);
    try {
      await new Promise(r=>setTimeout(r,50));
      const cSvg=chartInst.current.renderToSVGString();
      const tSvg=buildTableSVG(chartSeries,chartX);
      const cW=chartDivRef.current?.offsetWidth||860, cH=chartDivRef.current?.offsetHeight||400;
      const tH=44, gap=16;
      const combined=
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cW}" height="${tH+cH+gap+200}">` +
        `<rect width="${cW}" height="${tH+cH+gap+200}" fill="#fff"/>` +
        `<text x="16" y="28" font-size="14" font-weight="700" fill="#101828" font-family="system-ui">${(activeCfg.title||"KPI").replace(/&/g,"&amp;")}</text>` +
        `<svg x="0" y="${tH}" width="${cW}" height="${cH}">${cSvg}</svg>` +
        `<svg x="0" y="${tH+cH+gap}" width="${cW}" height="180">${tSvg}</svg></svg>`;
      await apiFetch(`/configs/${activeCfg.id}/export-svg`,{method:"POST",body:JSON.stringify({svg_data:combined,report_data:{config_id:activeCfg.id,generated_at:new Date().toISOString()}})});
      loadConfigs(); notify(`Exported chart #${activeCfg.id}`);
    } catch(e){ notify(e.message,true); }
    finally { setExporting(false); }
  },[chartSeries,chartX,activeCfg,apiFetch,loadConfigs,notify]);

  // Open the confirmation modal; the actual delete runs in confirmDelete().
  const requestDelete = useCallback(cfg=>setDeleteTarget(cfg),[]);

  const confirmDelete = useCallback(async ()=>{
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await apiFetch(`/configs/${id}`,{method:"DELETE"});
      setConfigs(p=>p.filter(c=>c.id!==id));
      if (activeCfg?.id===id) { setActiveCfg(null); setChartSeries(null); setChartX(null); setView("list"); }
      setDeleteTarget(null);
      notify(`Config #${id} deleted`);
    } catch(e){ notify(e.message,true); }
    finally { setDeleting(false); }
  },[deleteTarget,activeCfg,apiFetch,notify]);

  const handleSaved = (saved)=>{ loadConfigs(); navFn(listPath); regenerate(saved); };

  const filtered = configs.filter(c=>{
    if (statusFilter==="exported") return !!c.svg_id;
    if (statusFilter==="draft")    return !c.svg_id;
    return true;
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
      />
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:"32px 36px", fontFamily:"'Plus Jakarta Sans',sans-serif", minHeight:"100%" }}>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#ecfdf3", borderRadius:8, padding:"4px 12px", marginBottom:12 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#027a48" }}/>
          <span style={{ fontSize:11, fontWeight:600, color:"#027a48", textTransform:"uppercase", letterSpacing:1 }}>{scopeLabel}</span>
        </div>
        <h1 style={{ fontSize:24, fontWeight:700, color:"#1e293b", letterSpacing:"-0.4px", marginBottom:6 }}>KPI Charts</h1>
        <p style={{ color:"#94a3b8", fontSize:14 }}>{scopeDesc}</p>
      </div>

      {/* Action row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:20 }}>
        <div style={{ display:"flex", gap:6 }}>
          {[
            { val:"all",      label:`All (${configs.length})` },
            { val:"draft",    label:"Draft" },
            { val:"exported", label:"Exported" },
          ].map(f=>(
            <button key={f.val} onClick={()=>setStatusFilter(f.val)} style={{
              padding:"7px 14px", borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer",
              border:`1.5px solid ${statusFilter===f.val?"#2563eb":"#e2e8f0"}`,
              background: statusFilter===f.val?"#eff6ff":"#fff",
              color: statusFilter===f.val?"#2563eb":"#64748b",
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={loadConfigs} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:13, fontWeight:600, color:"#475569", cursor:"pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
            Refresh
          </button>
          <button onClick={()=>navFn(`${listPath}/create`)} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"none", background:"#2563eb", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(37,99,235,.3)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New KPI Chart
          </button>
        </div>
      </div>

      {/* Card grid */}
      {cfgsLoading ? (
        <div style={{ textAlign:"center", padding:"48px", color:"#94a3b8", fontSize:14 }}>Loading configurations…</div>
      ) : filtered.length===0 ? (
        <div style={{ textAlign:"center", padding:"64px 24px", color:"#94a3b8" }}>
          <div style={{ fontSize:14, fontWeight:600, color:"#64748b", marginBottom:4 }}>No KPI charts yet</div>
          <div style={{ fontSize:13 }}>Click "New KPI Chart" to create your first chart.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:20, marginBottom:24 }}>
          {filtered.map((cfg,idx)=>(
            <KpiCard key={cfg.id} cfg={cfg} idx={idx}
              isActive={activeCfg?.id===cfg.id}
              generating={generating}
              onEdit={c=>navFn(`${listPath}/edit`, { state: { entity: c } })}
              onPreview={c=>regenerate(c)}
              onDelete={deleteConfig}
            />
          ))}
        </div>
      )}

      {/* Preview chart (shown inline when a card is previewed) */}
      {chartSeries && chartX && yRange && activeCfg && (
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>

          {/* Chart header */}
          <div style={{ padding:"16px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e293b" }}>{activeCfg.title}</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                {activeCfg.table_name} · {chartX.length} {t("periods", lang)} · {chartSeries.length} {t("series", lang)}
                {rowCount!=null && <> · {rowCount} {t("rows", lang)}</>}
                {fetchedAt && <> · {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>}
              </div>
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
                {generating?t("Refreshing…", lang):t("Refresh Data", lang)}
              </button>
              <button onClick={exportSvg} disabled={exporting||!eReady} style={{ padding:"9px 18px", borderRadius:9, border:"none", background:"#059669", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(5,150,105,.28)" }}>
                {exporting?t("Exporting…", lang):t("Export SVG", lang)}
              </button>
            </div>
          </div>
        </div>

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
  return (
    <div style={{ padding:"32px 36px", fontFamily:"'Plus Jakarta Sans',sans-serif", minHeight:"100%" }}>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#ecfdf3", borderRadius:8, padding:"4px 12px", marginBottom:12 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#027a48" }}/>
          <span style={{ fontSize:11, fontWeight:600, color:"#027a48", textTransform:"uppercase", letterSpacing:1 }}>{scopeLabel}</span>
        </div>
        <h1 style={{ fontSize:24, fontWeight:700, color:"#1e293b", letterSpacing:"-0.4px", marginBottom:6 }}>{t("KPI Charts", lang)}</h1>
        <p style={{ color:"#94a3b8", fontSize:14 }}>{scopeDesc}</p>
      </div>

      {/* Action row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:20 }}>
        <div style={{ display:"flex", gap:6 }}>
          {[
            { val:"all",      label:`${t("All", lang)} (${configs.length})` },
            { val:"draft",    label:t("Draft", lang) },
            { val:"exported", label:t("Exported", lang) },
          ].map(f=>(
            <button key={f.val} onClick={()=>setStatusFilter(f.val)} style={{
              padding:"7px 14px", borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer",
              border:`1.5px solid ${statusFilter===f.val?"#2563eb":"#e2e8f0"}`,
              background: statusFilter===f.val?"#eff6ff":"#fff",
              color: statusFilter===f.val?"#2563eb":"#64748b",
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setView("create")} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"none", background:"#2563eb", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(37,99,235,.3)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t("New KPI Chart", lang)}
          </button>
        </div>
      </div>

      {/* Card grid */}
      {cfgsLoading ? (
        <div style={{ textAlign:"center", padding:"48px", color:"#94a3b8", fontSize:14 }}>{t("Loading configurations…", lang)}</div>
      ) : filtered.length===0 ? (
        <div style={{ textAlign:"center", padding:"64px 24px", color:"#94a3b8" }}>
          <div style={{ fontSize:14, fontWeight:600, color:"#64748b", marginBottom:4 }}>{t("No KPI charts yet", lang)}</div>
          <div style={{ fontSize:13 }}>{t("Click \"New KPI Chart\" to create your first chart.", lang)}</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:20, marginBottom:24 }}>
          {filtered.map((cfg,idx)=>(
            <KpiCard key={cfg.id} cfg={cfg} idx={idx}
              isActive={activeCfg?.id===cfg.id}
              generating={generating}
              onEdit={c=>{ setEditCfg(c); setView("edit"); }}
              onPreview={c=>regenerate(c)}
              onDelete={requestDelete}
            />
          ))}
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

      {/* Delete confirmation */}
      {deleteTarget && (
        <KpiDeleteModal
          cfg={deleteTarget}
          deleting={deleting}
          onClose={()=>{ if (!deleting) setDeleteTarget(null); }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
