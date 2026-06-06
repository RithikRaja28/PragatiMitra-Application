import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../../hooks/useApi";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

const C = {
  primary: "#4f8ef7", primaryLt: "#e8f0fe",
  success: "#43a047", successLt: "#e8f5e9",
  danger: "#e53935", dangerLt: "#fef2f2",
  warning: "#f9a825", warningLt: "#fffde7",
  text: "#1a1a2e", textSub: "#555", border: "#e0e4ea",
  bg: "#f7f8fa", surface: "#fff",
  purple: "#7c4dff", purpleLt: "#ede7f6",
};

const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  color: C.textSub, bg: "#f0f0f0" },
  IN_PROGRESS:  { label: "In Progress",  color: C.primary, bg: C.primaryLt },
  SUBMITTED:    { label: "Submitted",    color: C.warning, bg: C.warningLt },
  UNDER_REVIEW: { label: "Under Review", color: C.purple,  bg: C.purpleLt  },
  APPROVED:     { label: "Approved",     color: C.success, bg: C.successLt },
  SENT_BACK:    { label: "Sent Back",    color: C.danger,  bg: C.dangerLt  },
  LOCKED:       { label: "Locked",       color: "#555",    bg: "#e0e0e0"   },
};

const LIFECYCLE = [
  { key: "DRAFT",           label: "Draft",          icon: "✏️"  },
  { key: "IN_PROGRESS",     label: "In Progress",    icon: "🔄"  },
  { key: "UNDER_REVIEW",    label: "Under Review",   icon: "👁"  },
  { key: "APPROVED",        label: "Approved",       icon: "✅"  },
  { key: "PUBLISHED",       label: "Published",      icon: "📢"  },
  { key: "ARCHIVED",        label: "Archived",       icon: "🗄️" },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ReportDashboardPage({ reportId, onNavigate }) {
  const { apiFetch } = useApi();
  const [report,  setReport]  = useState(null);
  const [dash,    setDash]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, dashRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/reports/${reportId}`),
        apiJson(apiFetch, `/api/builder/reports/${reportId}/dashboard`).catch(() => ({ data: {} })),
      ]);
      setReport(repRes.data);
      setDash(dashRes.data || {});
    } catch {
      setToast({ type: "error", message: "Failed to load dashboard" });
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  /* ── summary stats from dashboard ── */
  const progress    = dash?.progress_breakdown || {};
  const totalSec    = Object.values(progress).reduce((a, b) => a + (b || 0), 0);
  const approvedSec = (progress.APPROVED || 0) + (progress.LOCKED || 0);
  const pct         = totalSec ? Math.round((approvedSec / totalSec) * 100) : 0;
  const overdue     = dash?.overdue_sections || [];
  const activity    = dash?.activity_feed || [];
  const deptProg    = dash?.dept_progress || [];
  const userProg    = dash?.user_progress || [];

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.textSub }}>
      Loading dashboard…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── header ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 32px",
                       display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{report?.title}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
            {report?.report_type} · {report?.academic_year} ·{" "}
            <StatusBadge status={report?.status} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={outlineBtn} onClick={() => onNavigate?.("structure", reportId)}>Structure</button>
          <button style={outlineBtn} onClick={() => onNavigate?.("assign", reportId)}>Assign</button>
          <button style={primaryBtn} onClick={() => onNavigate?.("compile", reportId)}>Compile</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── metric cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <MetricCard label="Total Sections" value={totalSec} icon="📋" color={C.primary} />
          <MetricCard label="Approved" value={approvedSec} icon="✅" color={C.success} />
          <MetricCard label="In Progress" value={progress.IN_PROGRESS || 0} icon="🔄" color={C.warning} />
          <MetricCard label="Overdue" value={overdue.length} icon="⚠️" color={C.danger} />
        </div>

        {/* ── lifecycle timeline ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Report Lifecycle</div>
          <div style={{ display: "flex", alignItems: "center", overflowX: "auto", gap: 0 }}>
            {LIFECYCLE.map((stage, i) => {
              const isActive = report?.status === stage.key;
              const isPast   = LIFECYCLE.findIndex(s => s.key === report?.status) > i;
              return (
                <div key={stage.key} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ textAlign: "center", padding: "0 12px" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto 6px",
                                  background: isPast ? C.successLt : isActive ? C.primaryLt : C.bg,
                                  border: `2px solid ${isPast ? C.success : isActive ? C.primary : C.border}`,
                                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {stage.icon}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 400,
                                  color: isActive ? C.primary : isPast ? C.success : C.textSub,
                                  whiteSpace: "nowrap" }}>{stage.label}</div>
                  </div>
                  {i < LIFECYCLE.length - 1 && (
                    <div style={{ width: 40, height: 2, background: isPast ? C.success : C.border, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── section progress table ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Section Progress</span>
            </div>
            <div style={{ padding: 12 }}>
              {Object.entries(STATUS_META).map(([k, v]) => {
                const count = progress[k] || 0;
                const barPct = totalSec ? (count / totalSec) * 100 : 0;
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: C.text, fontWeight: 600 }}>{v.label}</span>
                      <span style={{ color: v.color, fontWeight: 700 }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${barPct}%`, height: "100%", background: v.color, borderRadius: 3, transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── overall progress ring ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <LargeCircleProgress pct={pct} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 12 }}>Overall Completion</div>
            <div style={{ fontSize: 12, color: C.textSub }}>
              {approvedSec} of {totalSec} sections approved
            </div>
          </div>

          {/* ── dept progress ── */}
          {deptProg.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Department Progress</span>
              </div>
              <div style={{ padding: 12 }}>
                {deptProg.map((d, i) => {
                  const p = d.total ? Math.round((d.approved / d.total) * 100) : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 3 }}>
                          {d.department_name}
                        </div>
                        <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${p}%`, height: "100%", background: C.success, borderRadius: 3 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.textSub, flexShrink: 0 }}>
                        {d.approved}/{d.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── overdue sections ── */}
          {overdue.length > 0 && (
            <div style={{ background: C.dangerLt, border: `1px solid ${C.danger}44`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: C.dangerLt, borderBottom: `1px solid ${C.danger}33` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>⚠ Overdue ({overdue.length})</span>
              </div>
              <div style={{ padding: 12 }}>
                {overdue.map((s, i) => (
                  <div key={i} style={{ padding: "7px 10px", background: C.surface, borderRadius: 6,
                                        marginBottom: 6, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: C.danger }}>
                      Due: {s.submission_deadline ? new Date(s.submission_deadline).toLocaleDateString() : "—"}
                    </div>
                    <div style={{ fontSize: 10, color: C.textSub }}>{s.assigned_user_name || "Unassigned"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Activity feed ── */}
        {activity.length > 0 && (
          <div style={{ marginTop: 20, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Activity</span>
            </div>
            <div style={{ padding: 12 }}>
              {activity.slice(0, 20).map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                                      padding: "8px 0", borderBottom: i < activity.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.primaryLt,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 700, color: C.primary, flexShrink: 0 }}>
                    {(a.user_name || a.performed_by_name || "?")[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.text }}>
                      <strong>{a.user_name || a.performed_by_name}</strong>{" "}
                      <span style={{ color: C.textSub }}>{formatActivity(a)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                                 background: C.bg, color: C.textSub, flexShrink: 0 }}>
                    {a.action_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function formatActivity(a) {
  const map = {
    SECTION_CREATED:   "created a section",
    SECTION_UPDATED:   "updated a section",
    SECTION_SUBMITTED: "submitted section for review",
    SECTION_APPROVED:  "approved a section",
    SECTION_SENT_BACK: "sent back a section",
    BLOCK_ADDED:       "added a content block",
    BLOCK_UPDATED:     "edited a content block",
    SECTION_ASSIGNED:  "assigned a section",
    REPORT_CREATED:    "created this report",
    REPORT_UPDATED:    "updated report settings",
  };
  return map[a.action_type] || a.action_type?.toLowerCase().replace(/_/g, " ");
}

const primaryBtn = {
  padding: "8px 18px", background: C.primary, color: "#fff",
  border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const outlineBtn = { ...primaryBtn, background: "transparent", color: C.primary, border: `1px solid ${C.primary}` };

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: C.textSub, bg: "#f0f0f0" };
  return (
    <span style={{ padding: "1px 7px", borderRadius: 8, fontSize: 10, fontWeight: 700,
                   color: m.color, background: m.bg }}>{m.label}</span>
  );
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function LargeCircleProgress({ pct }) {
  const r  = 54;
  const c  = 2 * Math.PI * r;
  const d  = c * (1 - pct / 100);
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <circle cx={70} cy={70} r={r} fill="none" stroke={C.border} strokeWidth={10} />
      <circle cx={70} cy={70} r={r} fill="none" stroke={pct === 100 ? C.success : C.primary}
        strokeWidth={10} strokeDasharray={c} strokeDashoffset={d}
        strokeLinecap="round" transform="rotate(-90 70 70)" style={{ transition: "stroke-dashoffset .5s" }} />
      <text x={70} y={76} textAnchor="middle" fontSize={22} fontWeight={800} fill={C.text}>{pct}%</text>
    </svg>
  );
}
