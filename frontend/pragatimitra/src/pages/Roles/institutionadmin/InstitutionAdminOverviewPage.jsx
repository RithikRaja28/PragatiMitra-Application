import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#6366f1",
  primaryLt: "#ede9fe",
  primaryMid:"#818cf8",
  text:      "#1e1b4b",
  textMid:   "#4338ca",
  textSub:   "#6b7280",
  border:    "rgba(99,102,241,0.15)",
  bg:        "#f5f3ff",
  surface:   "#ffffff",
};

const depts = [
  { name: "Samhita Siddhanta", short: "Samhita",      pct: 75, overdue: 1, status: "In Progress",  badgeBg: "#ede9fe", badgeColor: "#4338ca" },
  { name: "Dravyaguna",        short: "Dravyaguna",   pct: 60, overdue: 3, status: "Delayed",      badgeBg: "#fce4ec", badgeColor: "#b71c1c" },
  { name: "Kaumarabhrtiya",    short: "Kaumarabhrt.", pct: 85, overdue: 1, status: "Needs Review", badgeBg: "#fef3c7", badgeColor: "#92400e" },
  { name: "Kayachikitsa",      short: "Kayachikitsa", pct: 50, overdue: 2, status: "Sent Back",    badgeBg: "#fef3c7", badgeColor: "#92400e" },
  { name: "Panchakarma",       short: "Panchakarma",  pct: 90, overdue: 0, status: "Approved",     badgeBg: "#dcfce7", badgeColor: "#166534" },
];

const barData = depts.map(d => ({ name: d.short, pct: d.pct }));
const barColor = pct => pct >= 85 ? "#6366f1" : pct >= 65 ? "#818cf8" : "#a5b4fc";

const pieData = [
  { name: "Approved",    value: 37, color: "#6366f1" },
  { name: "In Progress", value: 25, color: "#818cf8" },
  { name: "Not Started", value: 17, color: "#a5b4fc" },
  { name: "Sent Back",   value: 13, color: "#c7d2fe" },
  { name: "Locked",      value: 8,  color: "#e0e7ff" },
];

const overdueList = [
  { section: "Dravyaguna",     user: "Dr. Sharma", hrs: "48 hrs" },
  { section: "Kayachikitsa",   user: "R. Patel",   hrs: "24 hrs" },
  { section: "Kaumarabhrtiya", user: "M. Nair",    hrs: "12 hrs" },
];

const treeItems = [
  { name: "Samhita Siddhanta", badge: null, bg: null, color: null,
    children: [
      { name: "Classical Texts", badge: "In Progress", bg: "#ede9fe", color: "#4338ca" },
      { name: "Research Papers", badge: "Approved",    bg: "#dcfce7", color: "#166534" },
    ]},
  { name: "Dravyaguna",   badge: "Overdue",   bg: "#fce4ec", color: "#b71c1c", children: [] },
  { name: "Kayachikitsa", badge: "Sent Back", bg: "#fef3c7", color: "#92400e", children: [] },
  { name: "Panchakarma",  badge: "Approved",  bg: "#dcfce7", color: "#166534", children: [] },
];

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: "14px 16px",
  boxShadow: "0 1px 6px rgba(99,102,241,0.07)",
};

const CustomBar = ({ x, y, width, height, value }) =>
  <rect x={x} y={y} width={width} height={height} rx={4} fill={barColor(value)} />;

function Avatar({ name, size = 28 }) {
  const colors = ["#6366f1","#8b5cf6","#a78bfa","#818cf8","#4f46e5"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {name.slice(0,2).toUpperCase()}
    </div>
  );
}

export default function InstitutionAdminOverviewPage() {
  const { lang } = useLanguage();
  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column", gap: 14, background: C.bg, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Dashboard", lang)}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("Institute Overview", lang)}</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Annual Report 2026 — real-time progress</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ background: C.primaryLt, border: `0.5px solid ${C.border}`, color: C.textMid,
            borderRadius: 8, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {t("Export", lang)}
          </button>
          <button style={{ background: C.primary, border: "none", color: "#fff",
            borderRadius: 8, padding: "8px 16px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(99,102,241,0.3)" }}>
            ✦ {t("New Report", lang)}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[
          { label: "Total Sections", value: 24, sub: "Annual Report 2026", color: C.primary,   bar: 60, barBg: C.primaryLt },
          { label: "In Progress",    value: 8,  sub: "+2 since last week", color: "#7c3aed",   bar: 33, barBg: "#f5f3ff"   },
          { label: "Completed",      value: 10, sub: "42% of total",       color: "#059669",   bar: 42, barBg: "#ecfdf5"   },
          { label: "Overdue",        value: 6,  sub: "Needs attention",    color: "#dc2626",   bar: 25, barBg: "#fff1f2"   },
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 10 }}>{t(c.label, lang)}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: c.color, lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.color, opacity: 0.8 }}>{t(c.sub, lang)}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, height: 3,
              width: `${c.bar}%`, background: c.color, borderRadius: "0 2px 2px 0" }} />
          </div>
        ))}
      </div>

      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 295px", gap: 12 }}>

        {/* Left */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>Section-wise completion — Annual 2026</div>
              <div style={{ fontSize: 11, color: C.textSub }}>Department completion percentage — hover for details</div>
            </div>
            <span style={{ fontSize: 10, color: "#c7d2fe", alignSelf: "flex-start" }}>hover for %</span>
          </div>

          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={barData} barSize={34} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(99,102,241,0.07)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textSub }} axisLine={false} tickLine={false} />
              <YAxis domain={[0,100]} tick={{ fontSize: 10, fill: C.textSub }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={v => [`${v}%`, "Completion"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}`, boxShadow: "0 4px 12px rgba(99,102,241,0.12)" }} />
              <Bar dataKey="pct" radius={[4,4,0,0]} shape={<CustomBar />} />
            </BarChart>
          </ResponsiveContainer>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr>{["Dept","Completion","Overdue","Status"].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.06em", padding: "0 0 8px", textAlign: h === "Dept" ? "left" : "right" }}>{t(h, lang)}</th>
              ))}</tr>
            </thead>
            <tbody>
              {depts.map(d => (
                <tr key={d.name}>
                  <td style={{ padding: "7px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.text }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={d.name} size={24} />
                      {d.name}
                    </div>
                  </td>
                  <td style={{ padding: "7px 0", borderTop: `0.5px solid ${C.border}`, textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <div style={{ width: 72, height: 5, background: "#e0e7ff", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${d.pct}%`, background: barColor(d.pct), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.textSub, minWidth: 32 }}>{d.pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "7px 0", borderTop: `0.5px solid ${C.border}`, textAlign: "right",
                    fontSize: 12, fontWeight: 700, color: d.overdue === 0 ? "#c7d2fe" : "#dc2626" }}>{d.overdue}</td>
                  <td style={{ padding: "7px 0", borderTop: `0.5px solid ${C.border}`, textAlign: "right" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                      background: d.badgeBg, color: d.badgeColor }}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("Bottlenecks", lang)}</span>
            {["Dravyaguna — awaiting approval", "Kayachikitsa — overdue"].map(b => (
              <span key={b} style={{ display: "flex", alignItems: "center", gap: 5, background: C.primaryLt,
                border: `0.5px solid ${C.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, color: C.textMid }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.primary }} />{b}
              </span>
            ))}
          </div>
        </div>

        {/* Right col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Pie */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 1 }}>{t("Status distribution", lang)}</div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>All sections — current cycle</div>
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" stroke="none">
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v,n) => [`${v}%`, n]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}` }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {pieData.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textSub }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color }} />{p.name}
                  </div>
                  <span style={{ fontWeight: 700, color: C.text }}>{p.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section tree */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
              letterSpacing: "0.06em", marginBottom: 10 }}>Section tree — Annual 2026</div>
            {treeItems.map((sec, si) => (
              <div key={sec.name}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: `${si===0?0:6}px 0 6px`,
                  borderTop: si===0?"none":`0.5px solid ${C.border}` }}>
                  <span style={{ color: C.primary, fontSize: 12, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>{sec.name}</span>
                  {sec.badge && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px",
                    borderRadius: 20, background: sec.bg, color: sec.color }}>{sec.badge}</span>}
                </div>
                {sec.children?.map(ch => (
                  <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 0 4px 14px", borderTop: `0.5px solid ${C.border}` }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%",
                      border: `1.5px solid ${C.primaryMid}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.textSub, flex: 1 }}>{ch.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px",
                      borderRadius: 20, background: ch.bg, color: ch.color }}>{ch.badge}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Overdue */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.5"/>
                <path d="M8 5v3.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="#dc2626"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("Overdue tasks (live)", lang)}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Section","User","Overdue"].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                    letterSpacing: "0.06em", padding: "0 0 7px", textAlign: h==="Overdue"?"right":"left" }}>{t(h, lang)}</th>
                ))}</tr>
              </thead>
              <tbody>
                {overdueList.map(r => (
                  <tr key={r.section}>
                    <td style={{ padding: "6px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.text }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
                        {r.section}
                      </div>
                    </td>
                    <td style={{ padding: "6px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{r.user}</td>
                    <td style={{ padding: "6px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11,
                      fontWeight: 700, color: "#dc2626", textAlign: "right" }}>{r.hrs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}