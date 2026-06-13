import React, { useState, useEffect, useCallback } from "react";
import {
  University, Building2, Users, CalendarRange, Activity, ShieldCheck,
  CheckCircle2, Lock, Archive, Server, ArrowRight, Clock,
} from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import PageHeader from "../../../components/shared/PageHeader";
import { isAuthError } from "../../../components/shared/formUtils";

/* Enterprise governance palette — shared across the platform. */
const C = {
  primary: "#2563eb",
  success: "#16a34a",
  warning: "#f59e0b",
  danger:  "#dc2626",
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  bg:      "#f5f7fa",
  surface: "#ffffff",
};

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
};

function titleCase(s = "") {
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SuperAdminOverviewPage() {
  const { apiFetch } = useApi();

  const [institutions, setInstitutions] = useState([]);
  const [years, setYears]   = useState([]);
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [instRes, yearRes] = await Promise.all([
        apiFetch("/api/institutions").then((r) => r.json()).catch(() => null),
        apiFetch("/api/academic-years").then((r) => r.json()).catch(() => null),
      ]);
      if (instRes?.success) setInstitutions(instRes.data || []);
      if (yearRes?.success) setYears(yearRes.years || []);
      setApiOk(!!instRes?.success);
      // Activity feed is best-effort — never blocks the dashboard.
      apiFetch("/api/audit-logs?page=1&limit=6")
        .then((r) => r.json())
        .then((d) => { if (d?.success) setLogs(d.data || []); })
        .catch(() => {});
    } catch (err) {
      if (!isAuthError(err)) setApiOk(false);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  /* ── Real, derived totals (single /api/institutions call) ── */
  const instCount = institutions.length;
  const deptCount = institutions.reduce((sum, i) => sum + Number(i.department_count || 0), 0);
  const userCount = institutions.reduce((sum, i) => sum + Number(i.user_count || 0), 0);
  const yearCount = years.length;

  const stats = [
    { label: "Institutions",   value: instCount, Icon: University,   color: C.primary, bg: "#eff4ff" },
    { label: "Departments",    value: deptCount, Icon: Building2,    color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Users",          value: userCount, Icon: Users,        color: C.success, bg: "#f0fdf4" },
    { label: "Academic Years", value: yearCount, Icon: CalendarRange,color: C.warning, bg: "#fffbeb" },
  ];

  const currentYear  = years.find((y) => y.active);
  const lockedYears  = years.filter((y) => y.is_locked).length;
  const archivedYears = years.filter((y) => y.is_archived).length;

  const recentInstitutions = [...institutions]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", background: C.bg, minHeight: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        breadcrumb={["Home", "Super Admin", "Overview"]}
        title="System Overview"
        description="Platform-wide visibility across institutions, users, and governance."
      />

      {/* SECTION 1 — System overview cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {stats.map(({ label, value, Icon, color, bg }) => (
          <div key={label} style={{ ...card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={21} strokeWidth={1.9} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1, letterSpacing: -0.5 }}>
                {loading ? "—" : value.toLocaleString()}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginTop: 5 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column governance grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* SECTION 2 — Activity feed */}
          <div style={card}>
            <SectionHeader icon={<Activity size={16} />} title="Recent Activity" />
            {loading ? (
              <SkeletonRows rows={4} />
            ) : logs.length === 0 ? (
              <Empty text="No recent activity recorded." />
            ) : (
              <div>
                {logs.map((log, i) => (
                  <div key={log.id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i === 0 ? "none" : `1px solid #f1f5f9` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f1f5f9", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ShieldCheck size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {titleCase(log.action_type || log.entity_type || "Activity")}
                      </div>
                      {(log.entity_type || log.message) && (
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.message || titleCase(log.entity_type)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{timeAgo(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 5 — Recent institution activity */}
          <div style={card}>
            <SectionHeader icon={<University size={16} />} title="Recent Institutions" />
            {loading ? (
              <SkeletonRows rows={4} />
            ) : recentInstitutions.length === 0 ? (
              <Empty text="No institutions yet." />
            ) : (
              <div>
                {recentInstitutions.map((inst, i) => {
                  const active = inst.status === "ACTIVE";
                  return (
                    <div key={inst.institution_id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i === 0 ? "none" : `1px solid #f1f5f9` }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eff4ff", color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                        {String(inst.institution_name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inst.institution_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                          {Number(inst.department_count || 0)} depts · {Number(inst.user_count || 0)} users
                        </div>
                      </div>
                      <StatusPill ok={active} okLabel="ACTIVE" offLabel="INACTIVE" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* SECTION 4 — Academic year status */}
          <div style={card}>
            <SectionHeader icon={<CalendarRange size={16} />} title="Academic Year" />
            <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Current</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: currentYear ? C.text : C.muted, marginTop: 4, letterSpacing: -0.3 }}>
                  {loading ? "—" : currentYear?.academic_year || "Not set"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <MiniStat icon={<Lock size={14} />} label="Locked" value={loading ? "—" : lockedYears} color={C.danger} />
                <MiniStat icon={<Archive size={14} />} label="Archived" value={loading ? "—" : archivedYears} color={C.muted} />
              </div>
            </div>
          </div>

          {/* SECTION 3 — Health status */}
          <div style={card}>
            <SectionHeader icon={<Server size={16} />} title="Platform Health" />
            <div style={{ padding: "8px 20px 16px" }}>
              <HealthRow label="API / Platform" ok={apiOk} okLabel="Operational" offLabel="Unreachable" />
              {["Mail", "Storage", "Queue", "Translation"].map((s) => (
                <HealthRow key={s} label={s} neutral />
              ))}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                Detailed service telemetry is not yet instrumented; only live API reachability is shown.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Small presentational helpers ── */
function SectionHeader({ icon, title, action }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid #eef2f6`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 700, color: C.text }}>
        <span style={{ color: C.muted, display: "inline-flex" }}>{icon}</span>{title}
      </div>
      {action}
    </div>
  );
}

function StatusPill({ ok, okLabel, offLabel }) {
  const color = ok ? C.success : C.muted;
  const bg = ok ? "#f0fdf4" : "#f1f5f9";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {ok ? okLabel : offLabel}
    </span>
  );
}

function MiniStat({ icon, label, value, color }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color, display: "inline-flex" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function HealthRow({ label, ok, okLabel = "Operational", offLabel = "Down", neutral }) {
  const color = neutral ? C.muted : ok ? C.success : C.danger;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid #f4f6f9` }}>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{label}</span>
      {neutral ? (
        <span style={{ fontSize: 11.5, color: C.muted }}>Not monitored</span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color }}>
          {ok ? <CheckCircle2 size={14} /> : <Clock size={14} />} {ok ? okLabel : offLabel}
        </span>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: "28px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>{text}</div>;
}

function SkeletonRows({ rows = 4 }) {
  return (
    <div>
      <style>{`@keyframes sa-shimmer { 0%{background-position:-200px 0} 100%{background-position:calc(200px + 100%) 0} }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i === 0 ? "none" : `1px solid #f1f5f9` }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2f6", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, width: "55%", borderRadius: 4, background: "linear-gradient(90deg,#eef2f6 25%,#f6f8fb 50%,#eef2f6 75%)", backgroundSize: "200px 100%", animation: "sa-shimmer 1.2s infinite" }} />
            <div style={{ height: 9, width: "35%", borderRadius: 4, background: "#eef2f6", marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
