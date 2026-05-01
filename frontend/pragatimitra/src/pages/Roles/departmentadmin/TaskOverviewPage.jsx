import React, { useState, useCallback } from "react";

const C = {
  primary:   "#059669",
  primaryLt: "#d1fae5",
  text:      "#052e16",
  textSub:   "#6b7280",
  border:    "rgba(5,150,105,0.12)",
  bg:        "#f0fdf4",
  surface:   "#ffffff",
};

const STATUS_STYLE = {
  "In Progress":  { bg: "#fef3c7", color: "#92400e" },
  "Under Review": { bg: "#dbeafe", color: "#1e40af" },
  "Overdue":      { bg: "#fee2e2", color: "#991b1b" },
  "Completed":    { bg: "#dcfce7", color: "#166534" },
  "Not Started":  { bg: "#f1f5f9", color: "#475569" },
  "Sent Back":    { bg: "#fee2e2", color: "#991b1b" },
};

const DEPT_USERS = ["Dr. Rao", "R. Menon", "M. Nair", "A. Pillai", "Dr. Sharma", "P. Kumar"];

const INIT_TASKS = [
  { id: 1, section: "Ayurvedic Principles",  assigned: "Dr. Rao",    status: "In Progress",  deadline: "2026-05-10", lastUpdate: "2h ago",  overdue: false },
  { id: 2, section: "Clinical Studies",      assigned: "R. Menon",   status: "Under Review", deadline: "2026-05-03", lastUpdate: "1d ago",  overdue: false },
  { id: 3, section: "Research Publications", assigned: "M. Nair",    status: "Overdue",      deadline: "2026-04-28", lastUpdate: "3d ago",  overdue: true  },
  { id: 4, section: "Lab Reports",           assigned: "A. Pillai",  status: "Completed",    deadline: "2026-05-01", lastUpdate: "4h ago",  overdue: false },
  { id: 5, section: "Annual Statistics",     assigned: "Dr. Sharma", status: "Overdue",      deadline: "2026-04-25", lastUpdate: "5d ago",  overdue: true  },
  { id: 6, section: "Patient Case Studies",  assigned: "P. Kumar",   status: "In Progress",  deadline: "2026-05-15", lastUpdate: "6h ago",  overdue: false },
];

function ReassignModal({ task, onClose, onReassign }) {
  const [newAssignee, setNewAssignee] = useState(task.assigned);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", width: 340,
        boxShadow: "0 16px 48px rgba(0,0,0,0.16)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Reassign Task</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 18 }}>{task.section}</div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Assign To</label>
        <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
            borderRadius: 9, fontSize: 13, color: "#1e293b", outline: "none",
            background: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif",
            appearance: "none", boxSizing: "border-box", cursor: "pointer" }}>
          {DEPT_USERS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onReassign(task.id, newAssignee)}
            style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: C.primary,
              fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            Reassign
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaskOverviewPage() {
  const [tasks,       setTasks]       = useState(INIT_TASKS);
  const [filters,     setFilters]     = useState({ search: "", status: "", assignee: "" });
  const [reassigning, setReassigning] = useState(null);
  const [toast,       setToast]       = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleReassign = (id, newAssignee) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assigned: newAssignee, lastUpdate: "just now" } : t));
    setReassigning(null);
    showToast(`Task reassigned to ${newAssignee}.`);
  };

  const handleRemind = (task) => {
    showToast(`Reminder sent to ${task.assigned} for "${task.section}".`);
  };

  const filtered = tasks.filter(t => {
    if (filters.search   && !t.section.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.status   && t.status !== filters.status)   return false;
    if (filters.assignee && t.assigned !== filters.assignee) return false;
    return true;
  });

  const overdueCount = tasks.filter(t => t.overdue).length;

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: C.bg, minHeight: "100vh" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, background: "#1e293b", color: "#fff",
          padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          zIndex: 9999, boxShadow: "0 8px 28px rgba(0,0,0,0.18)" }}>
          ✓  {toast}
        </div>
      )}

      {reassigning && (
        <ReassignModal task={reassigning} onClose={() => setReassigning(null)} onReassign={handleReassign} />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Task Overview</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>Department Task Overview</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>All section assignments, statuses and deadlines for Samhita Siddhanta</p>
        </div>
        {overdueCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px",
            background: "#fff1f2", border: "0.5px solid #fecdd3", borderRadius: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>{overdueCount} overdue task{overdueCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, background: C.surface,
        padding: "12px 16px", borderRadius: 10, border: `0.5px solid ${C.border}` }}>
        <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder="Search by section name…"
          style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
        <select value={filters.assignee} onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
          <option value="">All Assignees</option>
          {DEPT_USERS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ padding: "7px 28px 7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            outline: "none", fontSize: 13, color: C.text, background: "#fff",
            fontFamily: "'Plus Jakarta Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
          <option value="">All Statuses</option>
          <option value="In Progress">In Progress</option>
          <option value="Under Review">Under Review</option>
          <option value="Overdue">Overdue</option>
          <option value="Completed">Completed</option>
          <option value="Not Started">Not Started</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 12, border: `0.5px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(5,150,105,0.06)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Section", "Assigned To", "Status", "Deadline", "Last Update", "Actions"].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textSub,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "12px 16px", textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: C.textSub }}>
                No tasks match the current filters.
              </td></tr>
            ) : filtered.map((t, i) => (
              <tr key={t.id}
                onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {t.overdue && (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626", flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.section}</span>
                  </div>
                </td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.text }}>{t.assigned}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                    background: STATUS_STYLE[t.status]?.bg, color: STATUS_STYLE[t.status]?.color }}>
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, fontWeight: t.overdue ? 600 : 400,
                  color: t.overdue ? "#dc2626" : C.textSub }}>{t.deadline}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none",
                  fontSize: 12, color: C.textSub }}>{t.lastUpdate}</td>
                <td style={{ padding: "13px 16px", borderTop: i > 0 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setReassigning(t)}
                      style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${C.border}`,
                        background: "#fff", color: C.primary, fontSize: 11, fontWeight: 600,
                        cursor: "pointer" }}>
                      Reassign
                    </button>
                    {t.overdue && (
                      <button onClick={() => handleRemind(t)}
                        style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #fde68a",
                          background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 600,
                          cursor: "pointer" }}>
                        Remind
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 20, marginTop: 16, padding: "12px 16px",
        background: C.surface, borderRadius: 10, border: `0.5px solid ${C.border}`,
        fontSize: 12, color: C.textSub }}>
        <span>Total: <b style={{ color: C.text }}>{tasks.length}</b></span>
        {Object.entries(STATUS_STYLE).map(([s]) => {
          const count = tasks.filter(t => t.status === s).length;
          return count > 0 ? (
            <span key={s}>{s}: <b style={{ color: STATUS_STYLE[s].color }}>{count}</b></span>
          ) : null;
        })}
      </div>
    </div>
  );
}
