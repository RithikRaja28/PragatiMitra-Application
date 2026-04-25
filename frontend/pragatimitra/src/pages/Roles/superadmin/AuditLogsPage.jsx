import React, { useState } from "react";

const LOG_TYPES = {
  auth: { label: "Auth", bg: "#dbeafe", color: "#1d4ed8", icon: "🔐" },
  user: { label: "User", bg: "#ede9fe", color: "#6d28d9", icon: "👤" },
  dept: { label: "Dept", bg: "#d1fae5", color: "#065f46", icon: "🏢" },
  role: { label: "Role", bg: "#fef9c3", color: "#92400e", icon: "🛡️" },
  system: { label: "System", bg: "#fee2e2", color: "#991b1b", icon: "⚙️" },
  billing: { label: "Billing", bg: "#fce7f3", color: "#9d174d", icon: "💳" },
};

const MOCK_LOGS = [
  {
    id: 1,
    actor: "Super Admin",
    action: "Created user meena@pragati.in",
    type: "user",
    ip: "192.168.1.10",
    time: "2025-04-25 14:32:01",
  },
  {
    id: 2,
    actor: "Arun Kumar",
    action: "Logged in successfully",
    type: "auth",
    ip: "10.0.0.45",
    time: "2025-04-25 13:58:44",
  },
  {
    id: 3,
    actor: "Super Admin",
    action: "Changed role of karthik@pragati.in → manager",
    type: "role",
    ip: "192.168.1.10",
    time: "2025-04-25 13:45:22",
  },
  {
    id: 4,
    actor: "Meena Rajan",
    action: "Updated HR department settings",
    type: "dept",
    ip: "10.0.0.67",
    time: "2025-04-25 12:30:15",
  },
  {
    id: 5,
    actor: "Super Admin",
    action: "Deactivated user lakshmi@pragati.in",
    type: "user",
    ip: "192.168.1.10",
    time: "2025-04-25 11:20:09",
  },
  {
    id: 6,
    actor: "System",
    action: "Scheduled backup completed successfully",
    type: "system",
    ip: "localhost",
    time: "2025-04-25 10:00:00",
  },
  {
    id: 7,
    actor: "Karthik S",
    action: "Failed login attempt (wrong password)",
    type: "auth",
    ip: "10.0.1.22",
    time: "2025-04-25 09:47:33",
  },
  {
    id: 8,
    actor: "Super Admin",
    action: "Created department: Marketing (MKT)",
    type: "dept",
    ip: "192.168.1.10",
    time: "2025-04-24 17:55:00",
  },
  {
    id: 9,
    actor: "System",
    action: "Subscription renewal processed — ₹12,000",
    type: "billing",
    ip: "localhost",
    time: "2025-04-24 00:00:01",
  },
  {
    id: 10,
    actor: "Ravi Shankar",
    action: "Updated personal profile details",
    type: "user",
    ip: "10.0.0.89",
    time: "2025-04-23 16:12:40",
  },
  {
    id: 11,
    actor: "Super Admin",
    action: "Assigned admin access for Finance → Karthik S",
    type: "dept",
    ip: "192.168.1.10",
    time: "2025-04-23 14:05:18",
  },
  {
    id: 12,
    actor: "System",
    action: "SSL certificate auto-renewed",
    type: "system",
    ip: "localhost",
    time: "2025-04-22 03:00:00",
  },
];

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const filtered = MOCK_LOGS.filter((log) => {
    const matchSearch =
      log.actor.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.ip.includes(search);
    const matchType = filterType === "all" || log.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#dc262614",
            borderRadius: 8,
            padding: "4px 12px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#dc2626",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#dc2626",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Audit
          </span>
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1e293b",
            letterSpacing: "-0.4px",
            marginBottom: 6,
          }}
        >
          Audit Logs
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          Full history of system events and user actions across the platform.
        </p>
      </div>

      {/* Stats bar */}
      <div
        style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}
      >
        {Object.entries(LOG_TYPES).map(([key, t]) => {
          const count = MOCK_LOGS.filter((l) => l.type === key).length;
          return (
            <div
              key={key}
              onClick={() => setFilterType(filterType === key ? "all" : key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: filterType === key ? t.bg : "#f8fafc",
                border: `1.5px solid ${filterType === key ? t.color + "44" : "#e2e8f0"}`,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: filterType === key ? t.color : "#64748b",
                }}
              >
                {t.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 20,
                  background: filterType === key ? t.color : "#e2e8f0",
                  color: filterType === key ? "#fff" : "#64748b",
                }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <input
          placeholder="Search actor, action, or IP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "9px 14px",
            border: "1.5px solid #e2e8f0",
            borderRadius: 9,
            fontSize: 13,
            outline: "none",
          }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: "9px 12px",
            border: "1.5px solid #e2e8f0",
            borderRadius: 9,
            fontSize: 13,
            outline: "none",
            background: "#fff",
            color: "#475569",
          }}
        >
          <option value="all">All Types</option>
          {Object.entries(LOG_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Log list */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.07)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40px 160px 1fr 110px 160px",
            gap: 0,
            padding: "11px 20px",
            background: "#f8fafc",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {["", "Actor", "Action", "Type", "Timestamp"].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            No logs match your search.
          </div>
        )}

        {filtered.map((log, i) => {
          const t = LOG_TYPES[log.type];
          const isOpen = expanded === log.id;
          return (
            <div
              key={log.id}
              onClick={() => setExpanded(isOpen ? null : log.id)}
              style={{
                borderBottom:
                  i < filtered.length - 1
                    ? "1px solid rgba(0,0,0,0.04)"
                    : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 160px 1fr 110px 160px",
                  padding: "13px 20px",
                  alignItems: "center",
                  background: isOpen ? "#f8fafc" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ fontSize: 16 }}>{t.icon}</div>
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}
                  >
                    {log.actor}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{log.ip}</div>
                </div>
                <div
                  style={{ fontSize: 13, color: "#475569", paddingRight: 16 }}
                >
                  {log.action}
                </div>
                <div>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      background: t.bg,
                      color: t.color,
                    }}
                  >
                    {t.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    fontFamily: "monospace",
                  }}
                >
                  {log.time}
                </div>
              </div>
              {isOpen && (
                <div
                  style={{
                    padding: "14px 20px 16px 20px",
                    background: "#f8fafc",
                    borderTop: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 16,
                    }}
                  >
                    {[
                      ["Log ID", `#${log.id}`],
                      ["IP Address", log.ip],
                      ["Event Type", t.label],
                      ["Actor", log.actor],
                      ["Full Timestamp", log.time],
                      ["Action", log.action],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#94a3b8",
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                            marginBottom: 4,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#1e293b",
                            fontWeight: 500,
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 12,
          color: "#94a3b8",
          textAlign: "right",
        }}
      >
        Showing {filtered.length} of {MOCK_LOGS.length} logs
      </div>
    </div>
  );
}
