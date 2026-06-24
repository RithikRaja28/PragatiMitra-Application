import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, Clock, UserRound, RefreshCw, X, ChevronRight,
} from "lucide-react";
import { useApi } from "../../../hooks/useApi";
import { PageContainer, PageHeader, Toolbar, FilterChip, Card, EmptyState, ErrorState } from "../../../ui";

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

/* ── Status config ─────────────────────────────────────────────── */
const STATUS_CFG = {
  NOT_STARTED:  { bg: "#f1f5f9", color: "#64748b", label: "Not Started" },
  IN_PROGRESS:  { bg: "#dbeafe", color: "#1d4ed8", label: "In Progress" },
  SUBMITTED:    { bg: "#fef3c7", color: "#d97706", label: "Submitted"   },
  UNDER_REVIEW: { bg: "#e0e7ff", color: "#3730a3", label: "Under Review"},
  APPROVED:     { bg: "#dcfce7", color: "#15803d", label: "Approved"    },
  SENT_BACK:    { bg: "#fee2e2", color: "#b91c1c", label: "Sent Back"   },
  LOCKED:       { bg: "#e2e8f0", color: "#475569", label: "Locked"      },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.NOT_STARTED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function DueBadge({ dueAt }) {
  if (!dueAt) return null;
  const diff    = Math.ceil((new Date(dueAt) - Date.now()) / 86400000);
  const overdue = diff < 0;
  const soon    = diff >= 0 && diff <= 3;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: overdue ? "#fee2e2" : soon ? "#fff7ed" : "#f1f5f9",
      color:      overdue ? "#b91c1c" : soon ? "#c2410c" : "#64748b",
    }}>
      <Clock size={10} />
      {overdue ? `${Math.abs(diff)}d overdue` : diff === 0 ? "Due today" : `Due in ${diff}d`}
    </span>
  );
}

/* ── User picker modal ─────────────────────────────────────────── */
function AssignModal({ section, users, onConfirm, onClose, assigning }) {
  const [selectedUserId, setSelectedUserId] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div style={{
        ...card,
        width: 440, maxWidth: "92vw", maxHeight: "85vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          padding: "18px 22px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>
              Assign section to team member
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {section.title}
              <span style={{ margin: "0 5px", color: C.border }}>·</span>
              {section.report_title}
            </div>
          </div>
          <button
            onClick={() => !assigning && onClose()}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2, lineHeight: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* user list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {users.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
              No active users found in your department.
            </div>
          ) : (
            users.map(u => {
              const selected = selectedUserId === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 9, marginBottom: 6,
                    border: selected ? `1.5px solid ${C.primary}` : `1px solid ${C.border}`,
                    background: selected ? "#eff6ff" : "#fff",
                    cursor: "pointer", textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: selected ? "#dbeafe" : "#f1f5f9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    color: selected ? C.primary : C.muted,
                  }}>
                    {(u.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.full_name}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{u.email}</div>
                  </div>
                  {selected && <CheckCircle2 size={16} color={C.primary} style={{ flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: "12px 22px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button
            onClick={() => !assigning && onClose()}
            disabled={assigning}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "#fff", color: C.muted,
              cursor: assigning ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => selectedUserId && onConfirm(section.id, selectedUserId)}
            disabled={!selectedUserId || assigning}
            style={{
              padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: selectedUserId && !assigning ? C.primary : "#93c5fd",
              color: "#fff", border: "none",
              cursor: selectedUserId && !assigning ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {assigning ? (
              <>
                <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                Assigning…
              </>
            ) : (
              <>Assign <ChevronRight size={14} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Section row card ──────────────────────────────────────────── */
function SectionCard({ section, onAssign, isDelegated }) {
  const sc = STATUS_CFG[section.status] || STATUS_CFG.NOT_STARTED;
  return (
    <div style={{
      ...card,
      padding: "15px 18px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ width: 4, alignSelf: "stretch", borderRadius: 99, background: sc.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{section.title}</span>
          <StatusBadge status={section.status} />
          <DueBadge dueAt={section.due_at} />
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {section.report_title}
          {section.report_type  && <span style={{ margin: "0 4px", color: C.border }}>·</span>}
          {section.report_type}
          {section.academic_year && <span style={{ margin: "0 4px", color: C.border }}>·</span>}
          {section.academic_year}
        </div>

        {isDelegated && section.delegated_user_name && (
          <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdf4", borderRadius: 6, padding: "3px 9px" }}>
            <UserRound size={12} color={C.success} />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.success }}>
              {section.delegated_user_name}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={() => onAssign(section)}
        style={{
          padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: isDelegated ? "#f8fafc" : C.primary,
          color: isDelegated ? C.muted : "#fff",
          border: isDelegated ? `1px solid ${C.border}` : "none",
          cursor: "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {isDelegated ? (
          <>
            <RefreshCw size={12} />
            Reassign
          </>
        ) : (
          <>
            <UserRound size={13} />
            Assign
          </>
        )}
      </button>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function DeptSectionAssignPage() {
  const { apiFetch } = useApi();

  const [pending,   setPending]   = useState([]);
  const [delegated, setDelegated] = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("pending");
  const [modal,     setModal]     = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [toast,     setToast]     = useState({ msg: "", type: "success" });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [secRes, usrRes] = await Promise.all([
        apiFetch("/api/builder/sections/dept-assigned"),
        apiFetch("/api/builder/sections/dept-users"),
      ]);
      const [secJson, usrJson] = await Promise.all([secRes.json(), usrRes.json()]);
      if (!secRes.ok) throw new Error(secJson.message || "Failed to load sections");
      setPending(secJson.data?.pending   || []);
      setDelegated(secJson.data?.delegated || []);
      setUsers(usrJson.data || []);
    } catch (ex) {
      setErr(ex.message || "Failed to load department sections");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (sectionId, userId) => {
    setAssigning(true);
    try {
      const res  = await apiFetch(`/api/builder/sections/${sectionId}/dept-delegate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to assign");
      setModal(null);
      showToast("Section assigned successfully");
      await load();
    } catch (ex) {
      showToast(ex.message || "Failed to assign", "error");
    } finally {
      setAssigning(false);
    }
  };

  const activeList = tab === "pending" ? pending : delegated;

  return (
    <PageContainer style={{ gap: 0 }}>
      <PageHeader
        breadcrumb={["Home", "Reports", "Department Sections"]}
        title="Department Report Sections"
        description="Sections assigned to your department — review and delegate to a team member"
      />

      {/* summary stat chips */}
      {!loading && !err && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            {
              label: "Pending Assignment",
              value: pending.length,
              bg:    pending.length > 0 ? "#fff7ed" : "#f1f5f9",
              color: pending.length > 0 ? "#c2410c" : C.muted,
              Icon:  Clock,
            },
            {
              label: "Delegated",
              value: delegated.length,
              bg:    "#f0fdf4",
              color: C.success,
              Icon:  CheckCircle2,
            },
          ].map(({ label, value, bg, color, Icon }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: 12, background: bg,
              border: `1px solid ${color}22`,
            }}>
              <Icon size={16} color={color} strokeWidth={2} />
              <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* tab switcher — standardized FilterChips */}
      {!loading && !err && (
        <Toolbar>
          <FilterChip active={tab === "pending"} count={pending.length} onClick={() => setTab("pending")}>
            Pending
          </FilterChip>
          <FilterChip active={tab === "delegated"} count={delegated.length} onClick={() => setTab("delegated")}>
            Delegated
          </FilterChip>
        </Toolbar>
      )}

      {/* loading state */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 0", color: C.muted, gap: 12 }}>
          <RefreshCw size={22} style={{ animation: "spin 1s linear infinite", opacity: 0.5 }} />
          <span style={{ fontSize: 13 }}>Loading department sections…</span>
        </div>
      )}

      {/* error state */}
      {!loading && err && (
        <Card padding={0}>
          <ErrorState title="Couldn’t load department sections" description={err} />
        </Card>
      )}

      {/* empty state */}
      {!loading && !err && activeList.length === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
              </svg>
            }
            title={tab === "pending" ? "No sections pending assignment" : "No delegated sections yet"}
            description={tab === "pending"
              ? "When sections are assigned to your department, they will appear here."
              : "Sections you assign to team members will show here."}
          />
        </Card>
      )}

      {/* section list */}
      {!loading && !err && activeList.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeList.map(sec => (
            <SectionCard
              key={sec.id}
              section={sec}
              isDelegated={tab === "delegated"}
              onAssign={s => setModal(s)}
            />
          ))}
        </div>
      )}

      {/* assign / reassign modal */}
      {modal && (
        <AssignModal
          section={modal}
          users={users}
          assigning={assigning}
          onConfirm={handleAssign}
          onClose={() => !assigning && setModal(null)}
        />
      )}

      {/* toast notification */}
      {toast.msg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "#dc2626" : "#1e293b",
          color: "#fff", padding: "11px 24px", borderRadius: 10,
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 99999,
          display: "flex", alignItems: "center", gap: 8,
          whiteSpace: "nowrap",
        }}>
          {toast.type === "error"
            ? <X size={14} />
            : <CheckCircle2 size={14} />}
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageContainer>
  );
}
