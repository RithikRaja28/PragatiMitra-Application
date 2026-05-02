import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#1d4ed8",
  primaryLt: "#dbeafe",
  primaryMid:"#3b82f6",
  text:      "#0f172a",
  textSub:   "#64748b",
  border:    "rgba(29,78,216,0.12)",
  bg:        "#f0f4ff",
  surface:   "#ffffff",
};

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: "16px 20px",
  boxShadow: "0 1px 6px rgba(29,78,216,0.07)",
};

const STATS = [
  { label: "Approved by Pub. Cell", value: 8,  sub: "Ready for your review",   color: "#059669", bar: 33, badgeBg: "#dcfce7", badgeColor: "#166534" },
  { label: "Pending Review",        value: 5,  sub: "Awaiting your decision",   color: "#d97706", bar: 21, badgeBg: "#fef3c7", badgeColor: "#92400e" },
  { label: "Ready for Compilation", value: 12, sub: "Director-approved",        color: "#1d4ed8", bar: 50, badgeBg: "#dbeafe", badgeColor: "#1e40af" },
  { label: "Sent Back",             value: 3,  sub: "Needs revision",           color: "#dc2626", bar: 12, badgeBg: "#fee2e2", badgeColor: "#991b1b" },
];

const SECTIONS = [
  { name: "Samhita Siddhanta — Research",  dept: "Samhita",      submittedBy: "Dr. Rao",    date: "Apr 28", status: "Pending Review",        statusBg: "#fef3c7", statusColor: "#92400e" },
  { name: "Dravyaguna — Annual Analysis",  dept: "Dravyaguna",   submittedBy: "R. Menon",   date: "Apr 26", status: "Approved by Pub. Cell",  statusBg: "#dbeafe", statusColor: "#1e40af" },
  { name: "Kayachikitsa — Patient Study",  dept: "Kayachikitsa", submittedBy: "M. Nair",    date: "Apr 25", status: "Ready for Compilation",  statusBg: "#dcfce7", statusColor: "#166534" },
  { name: "Panchakarma — Procedures 2025", dept: "Panchakarma",  submittedBy: "Dr. Sharma", date: "Apr 24", status: "Sent Back",              statusBg: "#fee2e2", statusColor: "#991b1b" },
  { name: "Kaumarabhrtiya — Child Health", dept: "Kaumarabhrt.", submittedBy: "A. Pillai",  date: "Apr 22", status: "Pending Review",        statusBg: "#fef3c7", statusColor: "#92400e" },
];

const PIE_DATA = [
  { name: "Ready for Compilation", value: 50, color: "#1d4ed8" },
  { name: "Approved by Pub. Cell", value: 33, color: "#059669" },
  { name: "Pending Review",        value: 21, color: "#d97706" },
  { name: "Sent Back",             value: 12, color: "#dc2626" },
];

export default function DirectorsDashboardPage() {
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
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Director's Office", lang)}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("Report Review Dashboard", lang)}</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Annual Report 2026 — section approval pipeline</p>
        </div>
        <button style={{ background: C.primary, border: "none", color: "#fff",
          borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(29,78,216,0.3)" }}>
          {t("Go to Review Queue →", lang)}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {STATS.map(s => (
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

      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

        {/* Section pipeline table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Sections — Approval Pipeline", lang)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>All sections across departments — current report cycle</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Section", "Department", "Submitted By", "Date", "Status"].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                    letterSpacing: "0.06em", padding: "0 0 10px", textAlign: "left" }}>{t(h, lang)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((s, i) => (
                <tr key={i}>
                  <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</td>
                  <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.dept}</td>
                  <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.submittedBy}</td>
                  <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.date}</td>
                  <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                      background: s.statusBg, color: s.statusColor }}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Pie */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Pipeline distribution", lang)}</div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>24 total sections</div>
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={36} outerRadius={56} dataKey="value" stroke="none">
                  {PIE_DATA.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}%`, n]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}` }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {PIE_DATA.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textSub }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />{p.name}
                  </div>
                  <span style={{ fontWeight: 700, color: C.text }}>{p.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending decisions */}
          <div style={{ ...card, background: "#fffbeb", border: "0.5px solid #fde68a" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>⚑ {t("Pending decisions", lang)}</div>
            {SECTIONS.filter(s => s.status === "Pending Review").map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8,
                padding: "6px 0", borderTop: i > 0 ? "0.5px solid #fde68a" : "none" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0, marginTop: 4 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "#b45309" }}>{s.submittedBy} · {s.date}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
