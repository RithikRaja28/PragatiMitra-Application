import React from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const C = {
  primary:   "#d97706",
  primaryLt: "#fef3c7",
  primaryMid:"#f59e0b",
  text:      "#1c1917",
  textSub:   "#78716c",
  border:    "rgba(217,119,6,0.13)",
  bg:        "#fffbeb",
  surface:   "#ffffff",
};

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: "16px 20px",
  boxShadow: "0 1px 6px rgba(217,119,6,0.07)",
};

const STATUS_STYLE = {
  "In Progress":  { bg: "#fef3c7", color: "#92400e" },
  "Submitted":    { bg: "#d1fae5", color: "#065f46" },
  "Sent Back":    { bg: "#fee2e2", color: "#991b1b" },
  "Overdue":      { bg: "#fee2e2", color: "#991b1b" },
  "Under Review": { bg: "#dbeafe", color: "#1e40af" },
  "Draft":        { bg: "#f1f5f9", color: "#475569" },
};

const SECTIONS = [
  { name: "Ayurvedic Principles",  status: "In Progress",  deadline: "2026-05-10", completion: 65, lastUpdate: "2h ago"  },
  { name: "Clinical Studies",      status: "Sent Back",    deadline: "2026-05-03", completion: 45, lastUpdate: "1d ago"  },
  { name: "Research Publications", status: "Overdue",      deadline: "2026-04-28", completion: 20, lastUpdate: "3d ago"  },
  { name: "Lab Reports",           status: "Submitted",    deadline: "2026-05-01", completion: 100, lastUpdate: "4h ago" },
];

const STATS = [
  { label: "Assigned",     value: 4,  sub: "Total sections",          color: C.primary, bar: 100 },
  { label: "Submitted",    value: 1,  sub: "Pending review",          color: "#059669", bar: 25  },
  { label: "Sent Back",    value: 1,  sub: "Need revision",           color: "#dc2626", bar: 25  },
  { label: "In Progress",  value: 2,  sub: "Being worked on",         color: "#0891b2", bar: 50  },
];

export default function NodalDashboardPage() {
  const { lang } = useLanguage();
  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column", gap: 14, background: C.bg, minHeight: "100vh" }}>

      {/* Header */}
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Dept. Nodal Officer", lang)}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("My Dashboard", lang)}</h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Annual Report 2026 — Samhita Siddhanta</p>
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

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

        {/* Section status list */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("My Sections — Status Overview", lang)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>Click a section in Assigned Sections to edit</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SECTIONS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "12px 14px", borderRadius: 10, background: "#fafaf9",
                border: `0.5px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                      background: STATUS_STYLE[s.status]?.bg, color: STATUS_STYLE[s.status]?.color }}>{s.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ fontSize: 11, color: C.textSub }}>
                      {t("Deadline", lang)}: <span style={{ fontWeight: 600,
                        color: new Date(s.deadline) < new Date() ? "#dc2626" : C.text }}>{s.deadline}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 80, height: 5, background: "#e0e7ff", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${s.completion}%`,
                          background: s.completion === 100 ? "#059669" : s.completion >= 50 ? C.primary : "#dc2626",
                          borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.textSub }}>{s.completion}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textSub }}>{t("Updated", lang)} {s.lastUpdate}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Overall progress */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>{t("Overall progress", lang)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: 70, height: 70, transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#fde68a" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={C.primary} strokeWidth="3"
                    strokeDasharray="57.5 42.5" strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.primary }}>57%</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t("57% complete", lang)}</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{t("Across 4 sections", lang)}</div>
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>{t("1 overdue", lang)}</div>
              </div>
            </div>
          </div>

          {/* Overdue alerts */}
          <div style={{ ...card, background: "#fff1f2", border: "0.5px solid #fecdd3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.5"/>
                <path d="M8 5v3.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="#dc2626"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#991b1b" }}>{t("Overdue sections", lang)}</span>
            </div>
            {SECTIONS.filter(s => s.status === "Overdue").map((s, i) => (
              <div key={i} style={{ padding: "7px 0", borderTop: i > 0 ? "0.5px solid #fecdd3" : "none" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#991b1b" }}>{s.name}</div>
                <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>
                  Deadline was {s.deadline} · {s.completion}% done
                </div>
              </div>
            ))}
            {SECTIONS.filter(s => s.status === "Sent Back").map((s, i) => (
              <div key={i} style={{ padding: "7px 0", borderTop: "0.5px solid #fecdd3" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#b45309" }}>{s.name}</div>
                <div style={{ fontSize: 10, color: "#d97706", marginTop: 2 }}>{t("Sent back — needs revision", lang)}</div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>{t("Quick Actions", lang)}</div>
            {[
              { label: "Edit a section",       icon: "✏️" },
              { label: "View submissions",      icon: "📤" },
              { label: "Check comments",        icon: "💬" },
            ].map((a, i) => (
              <button key={i} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border}`,
                background: "transparent", cursor: "pointer", marginBottom: 6,
                fontSize: 12, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif",
                textAlign: "left", transition: "background .12s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span>{a.icon}</span>
                {t(a.label, lang)}
              </button>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
