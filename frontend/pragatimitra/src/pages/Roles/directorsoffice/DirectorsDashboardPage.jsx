import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Flag, CalendarDays, Clock, ArrowRight,
  CheckCircle2, AlertCircle, Send, RotateCcw, Activity,
} from "lucide-react";
import { useApi }      from "../../../hooks/useApi";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t }           from "../../../i18n/translations";
import {
  PageContainer, PageHeader, Button, Card, EmptyState,
} from "../../../ui";
import { color, font, radius } from "../../../ui";

// ─── constants ────────────────────────────────────────────────────────────────

const FF                   = font.family;
const ROW_BORDER           = `1px solid ${color.border}`;
const DEADLINE_WINDOW_DAYS = 30;
const DONE_STATUSES        = new Set(["APPROVED", "ARCHIVED", "REJECTED", "PUBLISHED"]);

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 18px", borderBottom: ROW_BORDER,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {React.cloneElement(icon, {
          size: 14, strokeWidth: 2,
          style: { flexShrink: 0, color: icon.props?.style?.color || color.primary },
        })}
        <span style={{ fontSize: 13, fontWeight: 700, color: color.text, fontFamily: FF }}>
          {title}
        </span>
        {badge != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
            background: color.hover, color: color.muted,
          }}>
            {badge}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function SkeletonRows({ count = 3, lines = 2 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} style={{
      padding: "13px 18px", display: "flex", flexDirection: "column", gap: 6,
      borderTop: i > 0 ? ROW_BORDER : "none",
    }}>
      {Array.from({ length: lines }).map((_, j) => (
        <div key={j} style={{
          height: j === 0 ? 12 : 10,
          width: j === 0 ? "65%" : "40%",
          borderRadius: 6,
          background: "linear-gradient(90deg,#f1f5f9 25%,#e9ecef 50%,#f1f5f9 75%)",
          backgroundSize: "400px 100%",
          animation: `ui-skeleton 1.4s ease infinite ${j * 0.1}s`,
        }} />
      ))}
    </div>
  ));
}

function InlineError({ message }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "16px 18px", fontSize: 12, color: "#dc2626", fontFamily: FF,
    }}>
      <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
      {message}
    </div>
  );
}

function DeadlineBadge({ days }) {
  if (days < 0)   return <Pill bg="#fef2f2" tc="#dc2626">Overdue</Pill>;
  if (days === 0) return <Pill bg="#fef2f2" tc="#dc2626">Today</Pill>;
  if (days <= 7)  return <Pill bg="#fff7ed" tc="#c2410c">{days}d</Pill>;
  if (days <= 14) return <Pill bg="#fefce8" tc="#a16207">{days}d</Pill>;
  return              <Pill bg="#f0fdf4" tc="#15803d">{days}d</Pill>;
}

function Pill({ bg, tc, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
      background: bg, color: tc, whiteSpace: "nowrap", fontFamily: FF,
    }}>
      {children}
    </span>
  );
}

function ActivityIcon({ type }) {
  const styles = { flexShrink: 0, strokeWidth: 2 };
  if (type === "SUBMITTED")  return <Send      size={13} style={{ ...styles, color: color.primary }} />;
  if (type === "APPROVED")   return <CheckCircle2 size={13} style={{ ...styles, color: "#16a34a" }} />;
  if (type === "SENT_BACK")  return <RotateCcw size={13} style={{ ...styles, color: "#d97706" }} />;
  return                            <Activity  size={13} style={{ ...styles, color: color.muted  }} />;
}

function activityLabel(type, lang) {
  if (type === "SUBMITTED")  return t("Section Submitted",    lang);
  if (type === "APPROVED")   return t("Section Approved",     lang);
  if (type === "SENT_BACK")  return t("Sent Back for Revision", lang);
  return type;
}

function activityAccent(type) {
  if (type === "APPROVED")  return "#16a34a";
  if (type === "SENT_BACK") return "#d97706";
  return color.primary;
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function DirectorsDashboardPage() {
  const navigate     = useNavigate();
  const { apiFetch } = useApi();
  const { lang }     = useLanguage();

  // ── state ──
  const [queue,    setQueue]    = useState([]);
  const [reports,  setReports]  = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [errors,   setErrors]   = useState({});

  // ── data load ──
  const load = useCallback(async () => {
    setLoading(true);
    setErrors({});

    const [queueRes, reportsRes, activityRes] = await Promise.allSettled([
      apiFetch("/api/builder/sections/review-queue").then(r => r.json()),
      apiFetch("/api/builder/reports/shared").then(r => r.json()),
      apiFetch("/api/builder/sections/activity").then(r => r.json()),
    ]);

    const nextErr = {};

    if (queueRes.status === "fulfilled" && queueRes.value.success) {
      setQueue(queueRes.value.data || []);
    } else {
      nextErr.queue = queueRes.reason?.message
        || queueRes.value?.message
        || "Failed to load review queue.";
    }

    if (reportsRes.status === "fulfilled" && reportsRes.value.success) {
      setReports(reportsRes.value.data || []);
    } else {
      nextErr.reports = reportsRes.reason?.message
        || reportsRes.value?.message
        || "Failed to load reports.";
    }

    if (activityRes.status === "fulfilled" && activityRes.value.success) {
      setActivity(activityRes.value.data || []);
    } else {
      nextErr.activity = activityRes.reason?.message
        || activityRes.value?.message
        || "Failed to load recent activity.";
    }

    setErrors(nextErr);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  // ── derived ──
  const finalApproval = queue.filter(q => q.needs_director_approval);
  const pendingTotal  = queue.length;

  const upcomingDeadlines = reports
    .filter(r => !DONE_STATUSES.has((r.status || "").toUpperCase()))
    .flatMap(r => {
      const evs = [];
      if (r.submission_deadline) evs.push({ report: r, type: "Submission", date: r.submission_deadline });
      if (r.review_deadline)     evs.push({ report: r, type: "Review",     date: r.review_deadline });
      if (r.approval_deadline)   evs.push({ report: r, type: "Approval",   date: r.approval_deadline });
      return evs;
    })
    .filter(ev => {
      const d = daysUntil(ev.date);
      return d !== null && d >= -14 && d <= DEADLINE_WINDOW_DAYS;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  // ── render ──
  return (
    <PageContainer style={{ gap: 16 }}>

      {/* ── header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={[t("Home", lang), t("Director's Office", lang), t("Dashboard", lang)]}
        title={t("Dashboard", lang)}
        description={t("Your pending actions, upcoming deadlines, and recent report activity.", lang)}
        actions={
          <Button
            variant="secondary"
            icon={
              <RefreshCw
                size={15}
                strokeWidth={2}
                style={loading ? { animation: "spin .9s linear infinite" } : undefined}
              />
            }
            onClick={load}
            disabled={loading}
          >
            {t("Refresh", lang)}
          </Button>
        }
      />

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — PENDING REVIEW INBOX
      ══════════════════════════════════════════════════════════════════════ */}
      <Card padding={0} style={{ overflow: "hidden", fontFamily: FF }}>
        <SectionHeader
          icon={<Flag style={{ color: "#7c3aed" }} />}
          title={t("Pending Review Inbox", lang)}
          action={
            <button
              onClick={() => navigate("/review-queue")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600, color: "#7c3aed",
                background: "#ede9fe", border: "none",
                borderRadius: radius.md, padding: "5px 12px",
                cursor: "pointer", fontFamily: FF,
              }}
            >
              {t("Open full queue", lang)} <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          }
        />

        {loading && <SkeletonRows count={2} lines={2} />}
        {!loading && errors.queue && <InlineError message={errors.queue} />}

        {!loading && !errors.queue && (
          <>
            {/* ── summary bar ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderBottom: pendingTotal > 0 ? ROW_BORDER : "none",
            }}>
              {[
                {
                  label: t("Needs Your Sign-off", lang),
                  value: finalApproval.length,
                  accent: "#7c3aed",
                  bg: "#faf5ff",
                },
                {
                  label: t("Under Review", lang),
                  value: queue.filter(q => q.status === "UNDER_REVIEW").length,
                  accent: color.primary,
                  bg: color.primarySoft,
                },
                {
                  label: t("Submitted — Awaiting Start", lang),
                  value: queue.filter(q => q.status === "SUBMITTED" && !q.needs_director_approval).length,
                  accent: "#d97706",
                  bg: "#fffbeb",
                },
              ].map((s, i) => (
                <div
                  key={i}
                  onClick={() => navigate("/review-queue")}
                  style={{
                    padding: "14px 18px",
                    borderRight: i < 2 ? ROW_BORDER : "none",
                    cursor: "pointer",
                    background: "transparent",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    fontSize: 24, fontWeight: 800, color: s.accent,
                    lineHeight: 1, marginBottom: 4,
                  }}>
                    {s.value}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: color.muted,
                    textTransform: "uppercase", letterSpacing: ".06em",
                  }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* ── priority items (final approval only) ── */}
            {finalApproval.length > 0 && (
              <div>
                <div style={{
                  padding: "8px 18px", background: "#faf5ff",
                  borderBottom: "1px solid #e9d5ff",
                  fontSize: 10, fontWeight: 700, color: "#7c3aed",
                  textTransform: "uppercase", letterSpacing: ".07em",
                }}>
                  {t("Needs Your Decision", lang)}
                </div>
                {finalApproval.slice(0, 3).map((q, i) => (
                  <div
                    key={q.id}
                    onClick={() => navigate("/review-queue/review", { state: { entity: { id: q.id } } })}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "11px 18px",
                      borderTop: i > 0 ? "1px solid #f3e8ff" : "1px solid #e9d5ff",
                      cursor: "pointer", background: "#fdf8ff",
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f5e8ff"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fdf8ff"}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: "#3b0764",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 2,
                      }}>
                        {q.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#9333ea" }}>
                        {q.report_title || "—"}
                        {q.academic_year && (
                          <span style={{ color: "#c4b5fd", marginLeft: 5 }}>· {q.academic_year}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "#a78bfa" }}>
                        {timeAgo(q.submitted_at)}
                      </span>
                      <ArrowRight size={13} strokeWidth={2.5} style={{ color: "#7c3aed" }} />
                    </div>
                  </div>
                ))}
                {finalApproval.length > 3 && (
                  <div
                    onClick={() => navigate("/review-queue")}
                    style={{
                      padding: "9px 18px", borderTop: "1px solid #e9d5ff",
                      fontSize: 12, color: "#7c3aed", fontWeight: 600,
                      cursor: "pointer", fontFamily: FF,
                      background: "#faf5ff",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0e0ff"}
                    onMouseLeave={e => e.currentTarget.style.background = "#faf5ff"}
                  >
                    +{finalApproval.length - 3} {t("more — open full queue", lang)} →
                  </div>
                )}
              </div>
            )}

            {/* ── empty queue ── */}
            {pendingTotal === 0 && (
              <div style={{ padding: "28px 18px" }}>
                <EmptyState
                  icon={<CheckCircle2 size={24} strokeWidth={1.5} style={{ color: color.success }} />}
                  title={t("Inbox is clear", lang)}
                  description={t("No sections are currently waiting for your review or approval.", lang)}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTIONS 2 & 3 — side-by-side: Deadlines | Recent Activity
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* ── SECTION 2: Upcoming Report Deadlines ──────────────────────────── */}
        <Card padding={0} style={{ overflow: "hidden", fontFamily: FF }}>
          <SectionHeader
            icon={<CalendarDays style={{ color: "#d97706" }} />}
            title={t("Upcoming Deadlines", lang)}
            badge={!loading && !errors.reports ? upcomingDeadlines.length : undefined}
            action={
              <span style={{ fontSize: 11, color: color.muted }}>
                {t("±30 days", lang)}
              </span>
            }
          />

          {loading && <SkeletonRows count={3} lines={2} />}
          {!loading && errors.reports && <InlineError message={errors.reports} />}

          {!loading && !errors.reports && upcomingDeadlines.length === 0 && (
            <div style={{ padding: "28px 18px" }}>
              <EmptyState
                icon={<CheckCircle2 size={22} strokeWidth={1.5} style={{ color: color.success }} />}
                title={t("No upcoming deadlines", lang)}
                description={t("All deadlines are either complete or more than 30 days away.", lang)}
              />
            </div>
          )}

          {!loading && !errors.reports && upcomingDeadlines.length > 0 && upcomingDeadlines.map((ev, i) => {
            const days    = daysUntil(ev.date);
            const isUrgent = days !== null && days <= 7;
            const isOverdue = days !== null && days < 0;
            const typeBg = ev.type === "Submission" ? "#dbeafe"
                         : ev.type === "Review"     ? "#fce7f3"
                         :                            "#dcfce7";
            const typeColor = ev.type === "Submission" ? "#1e40af"
                            : ev.type === "Review"     ? "#9d174d"
                            :                            "#15803d";
            return (
              <div
                key={`${ev.report.id}-${ev.type}`}
                style={{
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: 10,
                  padding: "12px 18px",
                  borderTop: i > 0 ? ROW_BORDER : "none",
                  background: isOverdue ? "#fef2f2" : isUrgent ? "#fffbeb" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: isOverdue ? "#dc2626" : color.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 4,
                  }}>
                    {ev.report.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                      background: typeBg, color: typeColor,
                    }}>
                      {t(ev.type, lang)} {t("Deadline", lang)}
                    </span>
                    <span style={{ fontSize: 11, color: color.muted }}>
                      <Clock size={9} strokeWidth={2}
                        style={{ verticalAlign: "middle", marginRight: 2 }} />
                      {formatDate(ev.date)}
                    </span>
                  </div>
                </div>
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <DeadlineBadge days={days} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* ── SECTION 3: Recent Activities ──────────────────────────────────── */}
        <Card padding={0} style={{ overflow: "hidden", fontFamily: FF }}>
          <SectionHeader
            icon={<Activity style={{ color: color.primary }} />}
            title={t("Recent Activity", lang)}
            badge={!loading && !errors.activity ? activity.length : undefined}
          />

          {loading && <SkeletonRows count={3} lines={2} />}
          {!loading && errors.activity && <InlineError message={errors.activity} />}

          {!loading && !errors.activity && activity.length === 0 && (
            <div style={{ padding: "28px 18px" }}>
              <EmptyState
                icon={<Activity size={22} strokeWidth={1.5} style={{ color: color.muted }} />}
                title={t("No recent activity", lang)}
                description={t("Submissions, approvals, and revisions will appear here.", lang)}
              />
            </div>
          )}

          {!loading && !errors.activity && activity.length > 0 && activity.map((ev, i) => (
            <div
              key={`${ev.activity_type}-${ev.section_id}-${ev.activity_at}`}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 18px",
                borderTop: i > 0 ? ROW_BORDER : "none",
              }}
            >
              {/* icon dot */}
              <div style={{
                marginTop: 2, width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: ev.activity_type === "APPROVED"  ? "#dcfce7"
                           : ev.activity_type === "SENT_BACK" ? "#fef3c7"
                           : color.primarySoft,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ActivityIcon type={ev.activity_type} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* event label */}
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: activityAccent(ev.activity_type),
                  marginBottom: 2,
                }}>
                  {activityLabel(ev.activity_type, lang)}
                </div>

                {/* section title */}
                <div style={{
                  fontSize: 13, fontWeight: 600, color: color.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: 2,
                }}>
                  {ev.section_title || "—"}
                </div>

                {/* report + time */}
                <div style={{ fontSize: 11, color: color.muted }}>
                  {ev.report_title && (
                    <span style={{ marginRight: 6 }}>
                      {ev.report_title}
                      {ev.academic_year && (
                        <span style={{ color: "#9ca3af", marginLeft: 4 }}>
                          · {ev.academic_year}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                  {ev.actor_name && (
                    <span style={{ marginRight: 4 }}>{ev.actor_name} ·</span>
                  )}
                  {timeAgo(ev.activity_at)}
                </div>
              </div>
            </div>
          ))}
        </Card>

      </div>

    </PageContainer>
  );
}
