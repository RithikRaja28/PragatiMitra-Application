import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../store/AuthContext";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const ENTITY_CARDS = [
  {
    key: "USER",
    label: "Users",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    bg: "#ede9fe", accent: "#6d28d9", lightBg: "#f5f3ff",
    description: "User created, updated, deactivated",
  },
  {
    key: "DEPARTMENT",
    label: "Departments",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
    bg: "#d1fae5", accent: "#065f46", lightBg: "#ecfdf5",
    description: "Dept created, settings changed",
  },
  {
    key: "INSTITUTION",
    label: "Institutions",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    bg: "#dbeafe", accent: "#1d4ed8", lightBg: "#eff6ff",
    description: "Institution registered or updated",
  },
];

const TYPE_META = {
  USER:        { label: "User",        bg: "#ede9fe", color: "#6d28d9" },
  DEPARTMENT:  { label: "Department",  bg: "#d1fae5", color: "#065f46" },
  INSTITUTION: { label: "Institution", bg: "#dbeafe", color: "#1d4ed8" },
};

export default function AuditLogsPage() {
  const { accessToken } = useAuth();

  const [activeCard, setActiveCard]     = useState(null);
  const [logs, setLogs]                 = useState([]);
  const [summary, setSummary]           = useState({});
  const [search, setSearch]             = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [expanded, setExpanded]         = useState(null);
  const [error, setError]               = useState(null);
  const LIMIT = 15;

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }), [accessToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [activeCard, debouncedSearch]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${BASE_URL}/audit-logs/summary`, {
      credentials: "include",
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((r) => r.success && setSummary(r.data))
      .catch(() => {});
  }, [accessToken, authHeaders]);

  const loadLogs = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (activeCard) params.set("entity_type", activeCard);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`${BASE_URL}/audit-logs?${params}`, {
        credentials: "include",
        headers: authHeaders(),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      if (result.success) {
        setLogs(result.data);
        setTotalPages(result.pagination.totalPages);
        setTotal(result.pagination.total);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeCard, debouncedSearch, page, authHeaders]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleCardClick = (key) =>
    setActiveCard((prev) => (prev === key ? null : key));

  const activeCardMeta = ENTITY_CARDS.find((c) => c.key === activeCard);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#dc262614", borderRadius: 8, padding: "4px 12px", marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>Audit</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: 0 }}>
          Audit Logs
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: "6px 0 0" }}>
          Click a card to filter logs by entity. Full history of system events and user actions.
        </p>
      </div>

      {/* ── Entity Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {ENTITY_CARDS.map((card) => {
          const count    = summary[card.key.toLowerCase()] ?? "—";
          const isActive = activeCard === card.key;
          return (
            <button
              key={card.key}
              onClick={() => handleCardClick(card.key)}
              style={{
                display: "flex", flexDirection: "column", gap: 12,
                padding: "20px 22px", borderRadius: 14,
                border: `2px solid ${isActive ? card.accent : "#e2e8f0"}`,
                background: isActive ? card.bg : "#fff",
                cursor: "pointer", textAlign: "left", outline: "none",
                transition: "all 0.18s ease",
                boxShadow: isActive ? `0 4px 16px ${card.accent}22` : "0 1px 4px rgba(0,0,0,0.05)",
                transform: isActive ? "translateY(-2px)" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: isActive ? card.accent : card.lightBg, color: isActive ? "#fff" : card.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {card.icon}
                </div>
                <span style={{ fontSize: 26, fontWeight: 700, color: isActive ? card.accent : "#1e293b", lineHeight: 1 }}>
                  {count}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isActive ? card.accent : "#1e293b", marginBottom: 3 }}>{card.label}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{card.description}</div>
              </div>
              {isActive && (
                <div style={{ fontSize: 11, fontWeight: 600, color: card.accent, display: "flex", alignItems: "center", gap: 4 }}>
                  
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder={activeCard ? `Search ${activeCardMeta?.label} logs…` : "Search action, message, or IP…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 14px 10px 38px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
        {(activeCard || search) && (
          <button onClick={() => { setActiveCard(null); setSearch(""); }}
            style={{ padding: "10px 16px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 13, color: "#64748b", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Clear filters
          </button>
        )}
      </div>

      {/* ── Log Table ── */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "32px 220px 1fr 140px 170px", padding: "11px 20px", background: "#f8fafc", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {["", "Actor", "Action", "Type", "Timestamp"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</div>
          ))}
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
        )}

        {!loading && error && (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626", fontSize: 13 }}>{error}</div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No audit logs found.</div>
        )}

        {/* ── Rows ── */}
        {!loading && !error && logs.map((log, i) => {
          const meta       = TYPE_META[log.entity_type] || TYPE_META["SYSTEM"];
          const isOpen     = expanded === log.id;
          const actorName  = log.actor_name  || "System";
          const actorEmail = log.actor_email || "";

          return (
            <div
              key={log.id}
              onClick={() => setExpanded(isOpen ? null : log.id)}
              style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", cursor: "pointer" }}
            >
              {/* Data row */}
              <div style={{ display: "grid", gridTemplateColumns: "32px 220px 1fr 140px 170px", padding: "13px 20px", alignItems: "center", background: isOpen ? "#f8fafc" : "transparent", transition: "background 0.1s" }}>

                {/* col 1 — status dot */}
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: log.status === "SUCCESS" ? "#22c55e" : "#ef4444" }} />

                {/* col 2 — actor */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{actorName}</div>
                  {actorEmail && (
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {actorEmail.split("@")[0]}
                    </div>
                  )}
                </div>

                {/* col 3 — action */}
                <div style={{ fontSize: 13, color: "#475569", paddingRight: 12 }}>
                  {log.message && (
                    <span style={{ color: "#94a3b8" }}>{log.message}</span>
                  )}
                </div>

                {/* col 4 — type badge */}
                <div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>

                {/* col 5 — timestamp */}
                <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                  {new Date(log.created_at).toLocaleString("en-IN", {
                    year: "numeric", month: "short", day: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ padding: "16px 20px 20px", background: "#f8fafc", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                  {log.changed_fields?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {log.changed_fields.map((field) => (
                        <div
                          key={field}
                          style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", alignItems: "center", gap: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: "10px 14px" }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6 }}>
                            {field}
                          </div>
                          <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 6, padding: "4px 10px", wordBreak: "break-all" }}>
                            {String(log.old_value?.[field] ?? "—")}
                          </div>
                          <div style={{ fontSize: 12, color: "#065f46", background: "#d1fae5", borderRadius: 6, padding: "4px 10px", wordBreak: "break-all" }}>
                            {String(log.new_value?.[field] ?? "—")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {log.message || "No change details available."}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>{/* end Log Table */}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} logs
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              style={{ padding: "7px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, fontSize: 12, fontFamily: "inherit" }}
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && arr[idx - 1] !== p - 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`e-${i}`} style={{ padding: "7px 4px", fontSize: 12, color: "#94a3b8" }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{ padding: "7px 12px", border: `1.5px solid ${p === page ? "#6d28d9" : "#e2e8f0"}`, borderRadius: 8, background: p === page ? "#6d28d9" : "#fff", color: p === page ? "#fff" : "#475569", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400, fontFamily: "inherit" }}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: "7px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1, fontSize: 12, fontFamily: "inherit" }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {totalPages <= 1 && logs.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", textAlign: "right" }}>
          Showing {logs.length} of {total} logs
        </div>
      )}

    </div>
  );
}