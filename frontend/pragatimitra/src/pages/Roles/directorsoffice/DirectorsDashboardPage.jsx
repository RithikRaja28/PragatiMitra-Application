import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Flag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../../hooks/useApi";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import { PageContainer, PageHeader, Button, EmptyState, ErrorState, Card } from "../../../ui";

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

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }
  catch { return "—"; }
}

/* One bucket per section in the review queue (mutually exclusive). */
function bucketOf(s) {
  if (s.needs_director_approval) return "Final Approval";
  if (s.status === "UNDER_REVIEW") return "Under Review";
  return "Submitted";
}
const BUCKET_STYLE = {
  "Submitted":      { bg: "#fef3c7", color: "#92400e", color2: "#d97706" },
  "Under Review":   { bg: "#dbeafe", color: "#1e40af", color2: "#1d4ed8" },
  "Final Approval": { bg: "#fae8ff", color: "#7e22ce", color2: "#7e22ce" },
};

export default function DirectorsDashboardPage() {
  const { lang }     = useLanguage();
  const { apiFetch } = useApi();
  const navigate     = useNavigate();

  const [queue,   setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  /* Live, role/institution-scoped review queue — the same endpoint the
     Review Queue page uses. No hardcoded data. */
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    apiFetch("/api/builder/sections/review-queue")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.success) setQueue(d.data || []);
        else setError(d.message || "Failed to load the review queue.");
      })
      .catch(() => { if (alive) setError("Failed to load the review queue."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiFetch]);

  const total          = queue.length;
  const finalApproval  = queue.filter((s) => bucketOf(s) === "Final Approval").length;
  const underReview    = queue.filter((s) => bucketOf(s) === "Under Review").length;
  const submitted      = queue.filter((s) => bucketOf(s) === "Submitted").length;

  const stats = [
    { label: "Awaiting Review",  value: total,         sub: "In your queue",        color: "#1d4ed8" },
    { label: "Final Approval",   value: finalApproval, sub: "Director sign-off",    color: "#7e22ce" },
    { label: "Under Review",     value: underReview,   sub: "In progress",          color: "#d97706" },
    { label: "Submitted",        value: submitted,     sub: "Newly submitted",      color: "#059669" },
  ];

  const pieData = [
    { name: "Submitted",      value: submitted,     color: "#d97706" },
    { name: "Under Review",   value: underReview,   color: "#1d4ed8" },
    { name: "Final Approval", value: finalApproval, color: "#7e22ce" },
  ].filter((d) => d.value > 0);

  const pending = queue.filter((s) => s.needs_director_approval);

  return (
    <PageContainer style={{ gap: 14 }}>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Director's Office", lang), t("Review Dashboard", lang)]}
        title={t("Report Review Dashboard", lang)}
        description={t("Sections awaiting your review and approval decision.", lang)}
        actions={
          <Button variant="primary" onClick={() => navigate("/review-queue")}>{t("Go to Review Queue →", lang)}</Button>
        }
      />

      {!loading && error && (
        <Card padding={0}><ErrorState title="Couldn’t load the review dashboard" description={error} /></Card>
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

      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>

        {/* Section pipeline table — live */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Sections — Approval Pipeline", lang)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>{t("Sections currently routed to you for review", lang)}</div>

          {loading ? (
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: C.textSub }}>{t("Loading", lang)}…</div>
          ) : queue.length === 0 ? (
            <EmptyState
              icon={<Flag size={26} strokeWidth={1.6} />}
              title={t("Nothing awaiting review", lang)}
              description={t("Sections submitted for your review will appear here.", lang)}
            />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Section", "Report", "Submitted By", "Date", "Status"].map((h) => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                      letterSpacing: "0.06em", padding: "0 0 10px", textAlign: "left" }}>{t(h, lang)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((s) => {
                  const b = bucketOf(s);
                  const bs = BUCKET_STYLE[b];
                  return (
                    <tr key={s.id}>
                      <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.text }}>{s.title}</td>
                      <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.report_title}</td>
                      <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{s.submitted_by_name || "—"}</td>
                      <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}`, fontSize: 11, color: C.textSub }}>{fmtDate(s.submitted_at)}</td>
                      <td style={{ padding: "11px 0", borderTop: `0.5px solid ${C.border}` }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                          background: bs.bg, color: bs.color }}>{b}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Pie — live distribution */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{t("Queue distribution", lang)}</div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>{total} {t("sections", lang)}</div>
            {pieData.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: C.textSub }}>{t("No data", lang)}</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={36} outerRadius={56} dataKey="value" stroke="none">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: `0.5px solid ${C.border}` }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {pieData.map((p) => (
                    <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textSub }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />{p.name}
                      </div>
                      <span style={{ fontWeight: 700, color: C.text }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pending decisions — live (sections needing director sign-off) */}
          {!loading && pending.length > 0 && (
            <div style={{ ...card, background: "#fffbeb", border: "0.5px solid #fde68a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
                <Flag size={13} strokeWidth={2.2} /> {t("Pending decisions", lang)}
              </div>
              {pending.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "6px 0", borderTop: i > 0 ? "0.5px solid #fde68a" : "none" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e" }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: "#b45309" }}>{s.submitted_by_name || "—"} · {fmtDate(s.submitted_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </PageContainer>
  );
}
