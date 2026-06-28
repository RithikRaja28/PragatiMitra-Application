import React, { useState, useEffect } from "react";
import { Pencil, Send, MessageSquare } from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { PageContainer, PageHeader, EmptyState, ErrorState, Card } from "../../../ui";

const C = {
  primary:   "#2563eb",
  primaryLt: "#dbeafe",
  primaryMid:"#60a5fa",
  text:      "#1e293b",
  textSub:   "#64748b",
  border:    "rgba(37,99,235,0.12)",
  bg:        "#f8f9fb",
  surface:   "#ffffff",
};

const card = {
  background: C.surface,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: "16px 20px",
  boxShadow: "0 1px 6px rgba(37,99,235,0.07)",
};

/* Section status enum → display label + badge colors (matches the builder status set). */
const STATUS_LABEL = {
  NOT_STARTED: "Not Started", IN_PROGRESS: "In Progress", SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review", APPROVED: "Approved", SENT_BACK: "Sent Back", LOCKED: "Locked",
};
const STATUS_STYLE = {
  NOT_STARTED:  { bg: "#f1f5f9", color: "#475569" },
  IN_PROGRESS:  { bg: "#fef3c7", color: "#92400e" },
  SUBMITTED:    { bg: "#d1fae5", color: "#065f46" },
  UNDER_REVIEW: { bg: "#dbeafe", color: "#1e40af" },
  APPROVED:     { bg: "#dcfce7", color: "#15803d" },
  SENT_BACK:    { bg: "#fee2e2", color: "#991b1b" },
  LOCKED:       { bg: "#e2e8f0", color: "#475569" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function NodalDashboardPage() {
  const { lang }     = useLanguage();
  const { apiFetch } = useApi();
  const { user }     = useAuth() || {};

  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  /* Live data — the same authenticated, user-scoped endpoint the
     "My Assigned Sections" page uses. No hardcoded data. */
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    apiFetch("/api/builder/sections/assigned")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.success) setSections(d.data || []);
        else setError(d.message || "Failed to load your sections.");
      })
      .catch(() => { if (alive) setError("Failed to load your sections."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiFetch]);

  const now   = Date.now();
  const total = sections.length;
  const count = (st) => sections.filter((s) => s.status === st).length;
  const inProgress = count("IN_PROGRESS") + count("NOT_STARTED");
  const submitted  = count("SUBMITTED") + count("UNDER_REVIEW");
  const sentBack   = count("SENT_BACK");
  const approved   = count("APPROVED");
  const isOverdue  = (s) => s.due_at && new Date(s.due_at).getTime() < now && s.status !== "APPROVED";
  const overdueSections = sections.filter(isOverdue);
  const pct = total ? Math.round((approved / total) * 100) : 0;

  const stats = [
    { label: "Assigned",    value: total,      sub: "Total sections",  color: C.primary },
    { label: "Submitted",   value: submitted,  sub: "Pending review",  color: "#059669" },
    { label: "Sent Back",   value: sentBack,   sub: "Need revision",   color: "#dc2626" },
    { label: "In Progress", value: inProgress, sub: "Being worked on", color: "#2563eb" },
  ];

  const subtitle = user?.departmentName || user?.institutionName || user?.fullName || "";

  return (
    <PageContainer style={{ gap: 14 }}>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), t("Dashboard", lang)]}
        title={t("My Workspace", lang)}
        description={subtitle}
      />

      {!loading && error && (
        <Card padding={0}><ErrorState title="Couldn’t load your workspace" description={error} /></Card>
      )}

      {/* Stat cards — live counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {stats.map((s) => {
          const bar = total ? Math.round((Number(s.value) / total) * 100) : 0;
          return (
            <div key={s.label} style={{ ...card, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 8 }}>{t(s.label, lang)}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4 }}>
                {loading ? "…" : s.value}
              </div>
              <div style={{ fontSize: 11, color: C.textSub }}>{t(s.sub, lang)}</div>
              <div style={{ position: "absolute", bottom: 0, left: 0, height: 3,
                width: `${loading ? 0 : bar}%`, background: s.color, borderRadius: "0 2px 2px 0", transition: "width .3s" }} />
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

        {/* Section status list — live */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("My Sections — Status Overview", lang)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>{t("Sections assigned to you across all reports", lang)}</div>

          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.textSub }}>{t("Loading", lang)}…</div>
          ) : sections.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={26} strokeWidth={1.6} />}
              title={t("No sections assigned yet", lang)}
              description={t("Sections assigned to you will appear here.", lang)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sections.map((s) => {
                const st = STATUS_STYLE[s.status] || STATUS_STYLE.NOT_STARTED;
                const overdue = isOverdue(s);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 14px", borderRadius: 10, background: "#f8fafc",
                    border: `0.5px solid ${C.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          background: st.bg, color: st.color }}>{STATUS_LABEL[s.status] || s.status}</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, color: C.textSub }}>
                          {s.report_title}{s.academic_year ? ` · ${s.academic_year}` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSub }}>
                          {t("Deadline", lang)}: <span style={{ fontWeight: 600, color: overdue ? "#dc2626" : C.text }}>{fmtDate(s.due_at)}</span>
                        </div>
                        {Number(s.unresolved_comment_count) > 0 && (
                          <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>
                            {s.unresolved_comment_count} {t("open comment(s)", lang)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Overall progress — live (approved / total) */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>{t("Overall progress", lang)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: 70, height: 70, transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={C.primary} strokeWidth="3"
                    strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.primary }}>{loading ? "—" : `${pct}%`}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{pct}% {t("approved", lang)}</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{t("Across", lang)} {total} {t("sections", lang)}</div>
                {overdueSections.length > 0 && (
                  <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>{overdueSections.length} {t("overdue", lang)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Attention needed — overdue + sent-back (live) */}
          {!loading && (overdueSections.length > 0 || sentBack > 0) && (
            <div style={{ ...card, background: "#fff1f2", border: "0.5px solid #fecdd3" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.5"/>
                  <path d="M8 5v3.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="11" r="0.75" fill="#dc2626"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#991b1b" }}>{t("Needs attention", lang)}</span>
              </div>
              {overdueSections.map((s, i) => (
                <div key={s.id} style={{ padding: "7px 0", borderTop: i > 0 ? "0.5px solid #fecdd3" : "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#991b1b" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>{t("Deadline passed", lang)} · {fmtDate(s.due_at)}</div>
                </div>
              ))}
              {sections.filter((s) => s.status === "SENT_BACK").map((s) => (
                <div key={s.id} style={{ padding: "7px 0", borderTop: "0.5px solid #fecdd3" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#b45309" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "#d97706", marginTop: 2 }}>{t("Sent back — needs revision", lang)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>{t("Quick Actions", lang)}</div>
            {[
              { label: "Edit a section",   Icon: Pencil },
              { label: "View submissions", Icon: Send },
              { label: "Check comments",   Icon: MessageSquare },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border}`,
                background: "transparent", marginBottom: 6,
                fontSize: 12, color: C.text }}>
                <a.Icon size={15} strokeWidth={2} color={C.primary} />
                {t(a.label, lang)}
              </div>
            ))}
          </div>

        </div>
      </div>
    </PageContainer>
  );
}
