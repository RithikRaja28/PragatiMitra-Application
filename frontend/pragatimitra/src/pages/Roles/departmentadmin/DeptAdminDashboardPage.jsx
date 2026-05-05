import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#059669",
  primaryLt: "#d1fae5",
  primaryMid:"#34d399",
  text:      "#052e16",
  textSub:   "#6b7280",
  border:    "rgba(5,150,105,0.12)",
  bg:        "#f0fdf4",
  surface:   "#ffffff",
};

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: "16px 20px",
  boxShadow: "0 1px 6px rgba(5,150,105,0.07)",
};

const SECTIONS = [
  { name: "Ayurvedic Principles",  pct: 85, status: "In Progress",  assigned: "Dr. Rao",    lastUpdate: "2h ago",  overdue: false },
  { name: "Clinical Studies",      pct: 60, status: "Under Review", assigned: "R. Menon",   lastUpdate: "1d ago",  overdue: false },
  { name: "Research Publications", pct: 40, status: "Overdue",      assigned: "M. Nair",    lastUpdate: "3d ago",  overdue: true  },
  { name: "Lab Reports",           pct: 95, status: "Completed",    assigned: "A. Pillai",  lastUpdate: "4h ago",  overdue: false },
  { name: "Annual Statistics",     pct: 20, status: "Overdue",      assigned: "Dr. Sharma", lastUpdate: "5d ago",  overdue: true  },
  { name: "Patient Case Studies",  pct: 72, status: "In Progress",  assigned: "P. Kumar",   lastUpdate: "6h ago",  overdue: false },
];

const BAR_DATA = SECTIONS.map(s => ({ name: s.name.split(" ")[0], pct: s.pct }));

const PIE_DATA = [
  { name: "Completed",    value: 1, color: "#059669" },
  { name: "In Progress",  value: 2, color: "#34d399" },
  { name: "Under Review", value: 1, color: "#0891b2" },
  { name: "Overdue",      value: 2, color: "#dc2626" },
];

const STATUS_STYLE = {
  "Completed":    { bg: "#d1fae5", color: "#065f46" },
  "In Progress":  { bg: "#d1fae5", color: "#059669" },
  "Under Review": { bg: "#dbeafe", color: "#1e40af" },
  "Overdue":      { bg: "#fee2e2", color: "#991b1b" },
};

const barFill = (pct) => pct >= 80 ? "#059669" : pct >= 50 ? "#34d399" : "#dc2626";

const CustomBar = ({ x, y, width, height, value }) => (
  <rect x={x} y={y} width={width} height={height} rx={4} fill={barFill(value)} />
);

export default function DeptAdminDashboardPage() {
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
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Department Admin", lang)}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("Department Dashboard", lang)}</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Annual Report 2026 — Samhita Siddhanta Dept.</p>
        </div>
        <button style={{ background: C.primary, border: "none", color: "#fff",
          borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(5,150,105,0.28)" }}>
          {t("Export Report", lang)}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[
          { label: "Total Sections",  value: 6, sub: "Assigned to dept",   color: C.primary, bar: 100 },
          { label: "In Progress",     value: 2, sub: "Being worked on",    color: "#0891b2", bar: 33  },
          { label: "Completed",       value: 1, sub: "Submitted & closed", color: "#059669", bar: 17  },
          { label: "Overdue",         value: 2, sub: "Need attention",     color: "#dc2626", bar: 33  },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 8 }}>{t(s.label, lang)}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textSub }}>{t(s.sub, lang)}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, height: 3,
              width: `${s.bar}%`, background: s.color, borderRadius: "0 2px 2px 0" }} />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

        {/* Chart + table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Section-wise Completion", lang)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>Progress per section — Annual Report 2026</div>

          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={BAR_DATA} barSize={30} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(5,150,105,0.07)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textSub }} axisLine={false} tickLine={false} />
              <YAxis domain={[0,100]} tick={{ fontSize: 10, fill: C.textSub }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`} />
              <Tooltip formatter={v => [`${v}%`, "Completion"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}` }} />
              <Bar dataKey="pct" radius={[4,4,0,0]} shape={<CustomBar />} />
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 10 }}>{t("Section status — last update", lang)}</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Section", "Assigned To", "Completion", "Status", "Last Update"].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                      letterSpacing: "0.06em", padding: "0 0 8px", textAlign: "left" }}>{t(h, lang)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: "8px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</td>
                    <td style={{ padding: "8px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.assigned}</td>
                    <td style={{ padding: "8px 0", borderTop: `0.5px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 5, background: "#e0e7ff", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${s.pct}%`, background: barFill(s.pct), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.textSub }}>{s.pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 0", borderTop: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: STATUS_STYLE[s.status]?.bg, color: STATUS_STYLE[s.status]?.color }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.lastUpdate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Pie */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Status distribution", lang)}</div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>6 sections total</div>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={34} outerRadius={52} dataKey="value" stroke="none">
                  {PIE_DATA.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}` }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {PIE_DATA.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textSub }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />{p.name}
                  </div>
                  <span style={{ fontWeight: 700, color: C.text }}>{p.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottleneck alerts */}
          <div style={{ ...card, background: "#fff7ed", border: "0.5px solid #fed7aa" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#c2410c" strokeWidth="1.5"/>
                <path d="M8 5v3.5" stroke="#c2410c" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="#c2410c"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#7c2d12" }}>{t("Bottleneck Alerts", lang)}</span>
            </div>
            {SECTIONS.filter(s => s.overdue || s.status === "Under Review").map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8,
                padding: "6px 0", borderTop: i > 0 ? "0.5px solid #fed7aa" : "none" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                  background: s.overdue ? "#dc2626" : "#d97706" }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#7c2d12" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "#c2410c" }}>
                    {s.overdue ? `Overdue · ${s.lastUpdate}` : `Under Review · ${s.assigned}`}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
