import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { useShell } from "../../../../components/Dashboard/shellContext";
import { useApi } from "../../../../hooks/useApi";
import { PageContainer, PageHeader, Toolbar, SearchInput, FilterChip, Button, Card, EmptyState, ErrorState } from "../../../../ui";

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
  const { collapsed } = useShell();
  if (!log) return null;

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const modal = (
    <div style={{
      position: "fixed", top: "var(--sh-topbar-h, 64px)", left: collapsed ? "var(--sh-side-col, 64px)" : "var(--sh-side-open, 280px)", width: collapsed ? "calc(100vw - var(--sh-side-col, 64px))" : "calc(100vw - var(--sh-side-open, 280px))", height: "calc(100vh - var(--sh-topbar-h, 64px))", background: "rgba(0,0,0,0.45)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", transition: "left var(--sh-ease, 0.22s ease), width var(--sh-ease, 0.22s ease)"
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

  // Portal to document.body so position:fixed is always relative to the viewport
  return ReactDOM.createPortal(modal, document.body);
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
    <PageContainer>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <PageHeader
        breadcrumb={["Home", "Reports", "Audit Logs"]}
        title="Report Audit Logs"
        description="Complete history of all actions across the report module"
      />

      {/* ── Category filter chips — standardized ── */}
      <Toolbar>
        {CATEGORIES.map(cat => (
          <FilterChip
            key={String(cat.key)}
            active={entityFilter === cat.key}
            onClick={() => setEntityFilter(cat.key)}
          >
            {cat.label}
          </FilterChip>
        ))}
      </Toolbar>

      {/* ── Search ── */}
      <Toolbar>
        <SearchInput
          ref={searchRef}
          value={search}
          onChange={setSearch}
          onKeyDown={handleSearch}
          placeholder="Search by actor, action, message…"
          style={{ flex: 1, width: "auto" }}
        />
        <Button variant="primary" onClick={() => load()}>Search</Button>
        {(search || entityFilter !== null) && (
          <Button variant="secondary" onClick={() => { setSearch(""); setEntityFilter(null); }}>Clear</Button>
        )}
      </Toolbar>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>
          <div style={{ width: 18, height: 18, border: "2.5px solid #e2e8f0", borderTop: "2.5px solid #2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Loading audit logs…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && err && (
        <Card padding={0}>
          <ErrorState title="Couldn’t load audit logs" description={err} />
        </Card>
      )}

      {/* ── Empty ── */}
      {!loading && !err && logs.length === 0 && (
        <Card padding={0}>
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
              </svg>
            }
            title="No logs found"
            description="No report module activity matches your current filters."
          />
        </Card>
      )}

      {/* ── Table ── */}
      {!loading && !err && logs.length > 0 && (
        <>
          <Card padding={0} style={{ overflow: "hidden" }}>
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
          </Card>

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
    </PageContainer>
  );
}
