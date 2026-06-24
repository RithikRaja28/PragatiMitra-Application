import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../../hooks/useApi";
import PageHeader from "../../../../components/shared/PageHeader";

/* ── constants ─────────────────────────────────────────────────────────── */
const ENTITY_TYPES = "SECTION,REPORT,WORKFLOW,CYCLE,TEMPLATE";

const CATEGORIES = [
  { key: null,       label: "All",          color: "#475569", bg: "#f1f5f9" },
  { key: "REPORT",   label: "Reports",      color: "#2563eb", bg: "#dbeafe" },
  { key: "SECTION",  label: "Sections",     color: "#16a34a", bg: "#dcfce7" },
  { key: "WORKFLOW", label: "Workflows",    color: "#d97706", bg: "#fef3c7" },
  { key: "CYCLE",    label: "Cycles",       color: "#7c3aed", bg: "#ede9fe" },
  { key: "TEMPLATE", label: "Templates",    color: "#0e7490", bg: "#cffafe" },
];

const ACTION_COLORS = {
  // Report actions
  REPORT_CREATED:        { label: "Created",        bg: "#dcfce7", color: "#15803d" },
  REPORT_UPDATED:        { label: "Updated",        bg: "#dbeafe", color: "#1d4ed8" },
  REPORT_DELETED:        { label: "Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  REPORT_STATUS_CHANGED: { label: "Status Changed", bg: "#fef3c7", color: "#d97706" },
  REPORT_COMPILED:       { label: "Compiled",       bg: "#d1fae5", color: "#065f46" },
  TEMPLATE_STAMPED:      { label: "Template Applied", bg: "#e0f2fe", color: "#0369a1" },
  // Section actions
  SECTION_CREATED:       { label: "Created",        bg: "#dcfce7", color: "#15803d" },
  SECTION_UPDATED:       { label: "Updated",        bg: "#dbeafe", color: "#1d4ed8" },
  SECTION_DELETED:       { label: "Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  SECTION_SUBMITTED:     { label: "Submitted",      bg: "#fef3c7", color: "#d97706" },
  SECTION_REVIEWED:      { label: "Reviewed",       bg: "#d1fae5", color: "#065f46" },
  SECTION_ASSIGNED:      { label: "Assigned",       bg: "#e0e7ff", color: "#3730a3" },
  SECTION_VERSION_RESTORED: { label: "Restored",   bg: "#f5f3ff", color: "#6d28d9" },
  BLOCK_CONTENT_UPDATED: { label: "Block Edited",   bg: "#eff6ff", color: "#1d4ed8" },
  // Workflow actions
  WORKFLOW_CREATED:      { label: "Created",        bg: "#dcfce7", color: "#15803d" },
  WORKFLOW_UPDATED:      { label: "Updated",        bg: "#dbeafe", color: "#1d4ed8" },
  WORKFLOW_DELETED:      { label: "Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  WORKFLOW_STEP_ADDED:   { label: "Step Added",     bg: "#fef3c7", color: "#d97706" },
  WORKFLOW_STEP_UPDATED: { label: "Step Updated",   bg: "#dbeafe", color: "#1d4ed8" },
  WORKFLOW_STEP_DELETED: { label: "Step Deleted",   bg: "#fee2e2", color: "#b91c1c" },
  WORKFLOW_ASSIGNED:     { label: "Assigned",       bg: "#e0f2fe", color: "#0369a1" },
  WORKFLOW_UNASSIGNED:   { label: "Unassigned",     bg: "#fff1f2", color: "#be123c" },
  // Cycle actions
  CYCLE_CREATED:         { label: "Created",        bg: "#dcfce7", color: "#15803d" },
  CYCLE_CLOSED:          { label: "Closed",         bg: "#fee2e2", color: "#b91c1c" },
  CYCLE_REACTIVATED:     { label: "Reactivated",    bg: "#d1fae5", color: "#065f46" },
  CYCLE_DELETED:         { label: "Deleted",        bg: "#fee2e2", color: "#b91c1c" },
  // Template actions
  TEMPLATE_CREATED:      { label: "Created",        bg: "#dcfce7", color: "#15803d" },
};

const ENTITY_COLOR = {
  REPORT:   { color: "#2563eb", bg: "#dbeafe" },
  SECTION:  { color: "#16a34a", bg: "#dcfce7" },
  WORKFLOW: { color: "#d97706", bg: "#fef3c7" },
  CYCLE:    { color: "#7c3aed", bg: "#ede9fe" },
  TEMPLATE: { color: "#0e7490", bg: "#cffafe" },
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ActionBadge({ actionType }) {
  const meta = ACTION_COLORS[actionType] || { label: actionType?.replace(/_/g, " ") || "?", bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 10,
      fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function EntityBadge({ entityType }) {
  const e = ENTITY_COLOR[entityType] || { color: "#475569", bg: "#f1f5f9" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 6,
      fontSize: 9, fontWeight: 800, background: e.bg, color: e.color,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {entityType}
    </span>
  );
}

/* ── LogDetailModal ─────────────────────────────────────────────────────── */
function LogDetailModal({ log, onClose }) {
  if (!log) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 600,
        maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
          <EntityBadge entityType={log.entity_type} />
          <ActionBadge actionType={log.action_type} />
          <button onClick={onClose} style={{ marginLeft: "auto", background: "#f1f5f9", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "18px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 16 }}>
            {[
              ["Actor",   log.actor_name || "System"],
              ["Email",   log.actor_email || "—"],
              ["Status",  log.status || "—"],
              ["IP",      log.ip_address || "—"],
              ["Browser", log.browser_name || "—"],
              ["Time",    log.created_at ? new Date(log.created_at).toLocaleString() : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          {log.message && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Message</div>
              <div style={{ fontSize: 12, color: "#1e293b", background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>{log.message}</div>
            </div>
          )}
          {log.old_value && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Before</div>
              <pre style={{ fontSize: 11, background: "#fff7ed", borderRadius: 8, padding: "10px 14px", overflowX: "auto", color: "#92400e", margin: 0 }}>
                {JSON.stringify(typeof log.old_value === "string" ? JSON.parse(log.old_value) : log.old_value, null, 2)}
              </pre>
            </div>
          )}
          {log.new_value && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>After</div>
              <pre style={{ fontSize: 11, background: "#f0fdf4", borderRadius: 8, padding: "10px 14px", overflowX: "auto", color: "#166534", margin: 0 }}>
                {JSON.stringify(typeof log.new_value === "string" ? JSON.parse(log.new_value) : log.new_value, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function ReportAuditLogsPage() {
  const { apiFetch } = useApi();

  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [entityFilter, setEntityFilter] = useState(null);
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(1);
  const [pagination,  setPagination]  = useState({ total: 0, totalPages: 1 });
  const [selected,    setSelected]    = useState(null);
  const searchRef = useRef();

  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (entityFilter) params.set("entity_type", entityFilter);
      else              params.set("entity_types", ENTITY_TYPES);
      if (search.trim()) params.set("search", search.trim());
      params.set("page",  page);
      params.set("limit", LIMIT);

      const res  = await apiFetch(`/api/audit-logs?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setLogs(json.data || []);
      setPagination(json.pagination || { total: 0, totalPages: 1 });
    } catch (ex) {
      setErr(ex.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, entityFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  /* reset page on filter/search change */
  useEffect(() => { setPage(1); }, [entityFilter, search]);

  const handleSearch = (e) => {
    if (e.key === "Enter" || e.type === "click") load();
  };

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1200 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <PageHeader
        breadcrumb={["Home", "Reports", "Audit Logs"]}
        title="Report Audit Logs"
        description="Complete history of all actions across the report module"
      />

      {/* ── Category filter chips ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {CATEGORIES.map(cat => {
          const active = entityFilter === cat.key;
          return (
            <button key={String(cat.key)} onClick={() => setEntityFilter(cat.key)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: active ? "none" : "1.5px solid #e2e8f0",
              background: active ? cat.bg : "#fff",
              color: active ? cat.color : "#64748b",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            placeholder="Search by actor, action, message…"
            style={{
              width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12,
              height: 38, borderRadius: 8, border: "1px solid #e2e8f0",
              fontSize: 13, fontFamily: "inherit", outline: "none",
              background: "#f8fafc", color: "#0f172a",
            }}
          />
        </div>
        <button onClick={() => load()} style={{
          padding: "0 18px", height: 38, borderRadius: 8,
          background: "#2563eb", color: "#fff", border: "none",
          fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
        }}>
          Search
        </button>
        {(search || entityFilter !== null) && (
          <button onClick={() => { setSearch(""); setEntityFilter(null); }} style={{
            padding: "0 14px", height: 38, borderRadius: 8,
            border: "1px solid #e2e8f0", background: "#fff",
            fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer",
          }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>
          <div style={{ width: 18, height: 18, border: "2.5px solid #e2e8f0", borderTop: "2.5px solid #2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Loading audit logs…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && err && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, fontSize: 14 }}>
          {err}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !err && logs.length === 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, background: "#f1f5f9", borderRadius: 13, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>No logs found</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No report module activity matches your current filters.</div>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !err && logs.length > 0 && (
        <>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              {pagination.total} total log{pagination.total !== 1 ? "s" : ""} · page {page} of {pagination.totalPages}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Time", "Entity", "Action", "Actor", "Message", "Status", ""].map(h => (
                    <th key={h} style={{
                      fontSize: 10, fontWeight: 700, color: "#94a3b8",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      padding: "10px 14px", textAlign: "left",
                      borderBottom: "1px solid #e2e8f0",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => setSelected(log)}
                  >
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1e293b" }}>{timeAgo(log.created_at)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{log.browser_name || "—"}</div>
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      <EntityBadge entityType={log.entity_type} />
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      <ActionBadge actionType={log.action_type} />
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{log.actor_name || "System"}</div>
                      {log.actor_email && <div style={{ fontSize: 10, color: "#94a3b8" }}>{log.actor_email}</div>}
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none", maxWidth: 280 }}>
                      <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.message || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                        background: log.status === "SUCCESS" ? "#dcfce7" : "#fee2e2",
                        color: log.status === "SUCCESS" ? "#15803d" : "#b91c1c",
                      }}>
                        {log.status || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>Details →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {pagination.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, color: page <= 1 ? "#cbd5e1" : "#475569", cursor: page <= 1 ? "not-allowed" : "pointer" }}
              >← Prev</button>
              {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, k) => {
                const p = page <= 4 ? k + 1 : page - 3 + k;
                if (p < 1 || p > pagination.totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)} style={{
                    width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0",
                    background: p === page ? "#2563eb" : "#fff",
                    color: p === page ? "#fff" : "#475569",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>{p}</button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, color: page >= pagination.totalPages ? "#cbd5e1" : "#475569", cursor: page >= pagination.totalPages ? "not-allowed" : "pointer" }}
              >Next →</button>
            </div>
          )}
        </>
      )}

      {/* ── Detail Modal ── */}
      {selected && <LogDetailModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
