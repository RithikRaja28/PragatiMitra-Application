import React, { useState } from "react";

const MOCK_USERS = [
  {
    id: 1,
    name: "Arun Kumar",
    email: "arun@pragati.in",
    role: "org_admin",
    dept: "Engineering",
    status: "active",
    joined: "Jan 12, 2025",
  },
  {
    id: 2,
    name: "Meena Rajan",
    email: "meena@pragati.in",
    role: "manager",
    dept: "HR",
    status: "active",
    joined: "Feb 3, 2025",
  },
  {
    id: 3,
    name: "Karthik S",
    email: "karthik@pragati.in",
    role: "staff",
    dept: "Finance",
    status: "inactive",
    joined: "Mar 18, 2025",
  },
  {
    id: 4,
    name: "Divya Priya",
    email: "divya@pragati.in",
    role: "staff",
    dept: "Operations",
    status: "active",
    joined: "Apr 1, 2025",
  },
  {
    id: 5,
    name: "Ravi Shankar",
    email: "ravi@pragati.in",
    role: "manager",
    dept: "Engineering",
    status: "active",
    joined: "Apr 10, 2025",
  },
  {
    id: 6,
    name: "Lakshmi N",
    email: "lakshmi@pragati.in",
    role: "staff",
    dept: "Finance",
    status: "inactive",
    joined: "Dec 5, 2024",
  },
];

const ROLES = ["super_admin", "org_admin", "manager", "staff"];
const DEPTS = ["Engineering", "HR", "Finance", "Operations", "Marketing"];

const ROLE_COLORS = {
  super_admin: { bg: "#dbeafe", color: "#1d4ed8" },
  org_admin: { bg: "#ede9fe", color: "#6d28d9" },
  manager: { bg: "#d1fae5", color: "#065f46" },
  staff: { bg: "#fef9c3", color: "#92400e" },
};

function Badge({ role }) {
  const style = ROLE_COLORS[role] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        textTransform: "capitalize",
        letterSpacing: 0.3,
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

function StatusDot({ status }) {
  const active = status === "active";
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        color: active ? "#059669" : "#94a3b8",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: active ? "#10b981" : "#cbd5e1",
          display: "inline-block",
        }}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ── Edit Modal ─────────────────────────────────────────────── */
function EditModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({ ...user });
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 32,
          width: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 20,
          }}
        >
          Edit User
        </h3>
        {[
          ["Name", "name"],
          ["Email", "email"],
        ].map(([label, key]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#64748b",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {label}
            </label>
            <input
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "9px 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 9,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#64748b",
              display: "block",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 9,
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#64748b",
              display: "block",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Department
          </label>
          <select
            value={form.dept}
            onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 9,
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          >
            {DEPTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "1.5px solid #e2e8f0",
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "none",
              background: "#2563eb",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── List Users Tab ─────────────────────────────────────────── */
function UserListTab() {
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editing, setEditing] = useState(null);

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    const matchStatus = filterStatus === "all" || u.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  const toggleStatus = (id) =>
    setUsers((us) =>
      us.map((u) =>
        u.id === id
          ? { ...u, status: u.status === "active" ? "inactive" : "active" }
          : u,
      ),
    );
  const saveEdit = (updated) => {
    setUsers((us) => us.map((u) => (u.id === updated.id ? updated : u)));
    setEditing(null);
  };

  return (
    <>
      {editing && (
        <EditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {/* Filters */}
      <div
        style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}
      >
        <input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "9px 14px",
            border: "1.5px solid #e2e8f0",
            borderRadius: 9,
            fontSize: 13,
            outline: "none",
          }}
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
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
          <option value="all">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
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
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.07)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                background: "#f8fafc",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              {[
                "User",
                "Department",
                "Role",
                "Status",
                "Joined",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 18px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom:
                    i < filtered.length - 1
                      ? "1px solid rgba(0,0,0,0.04)"
                      : "none",
                }}
              >
                <td style={{ padding: "14px 18px" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `hsl(${u.id * 53 + 180}, 55%, 85%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: `hsl(${u.id * 53 + 180}, 55%, 35%)`,
                        flexShrink: 0,
                      }}
                    >
                      {u.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        {u.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {u.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  style={{
                    padding: "14px 18px",
                    fontSize: 13,
                    color: "#475569",
                  }}
                >
                  {u.dept}
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <Badge role={u.role} />
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <StatusDot status={u.status} />
                </td>
                <td
                  style={{
                    padding: "14px 18px",
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  {u.joined}
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setEditing(u)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 7,
                        border: "1.5px solid #e2e8f0",
                        background: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#2563eb",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleStatus(u.id)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 7,
                        border: "1.5px solid #e2e8f0",
                        background: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        color: u.status === "active" ? "#dc2626" : "#059669",
                        cursor: "pointer",
                      }}
                    >
                      {u.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  No users match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Create User Tab ────────────────────────────────────────── */
function CreateUserTab() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "staff",
    dept: "Engineering",
    password: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const field = (label, key, type = "text", placeholder = "") => (
    <div style={{ marginBottom: 20 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
          display: "block",
          marginBottom: 7,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1.5px solid #e2e8f0",
          borderRadius: 10,
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
        onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
      />
    </div>
  );

  const handleSubmit = () => {
    if (!form.name || !form.email) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setForm({
      name: "",
      email: "",
      role: "staff",
      dept: "Engineering",
      password: "",
    });
  };

  return (
    <div style={{ maxWidth: 540 }}>
      {submitted && (
        <div
          style={{
            background: "#d1fae5",
            border: "1px solid #6ee7b7",
            borderRadius: 10,
            padding: "12px 18px",
            marginBottom: 24,
            fontSize: 13,
            color: "#065f46",
            fontWeight: 500,
          }}
        >
          ✓ User created successfully!
        </div>
      )}
      {field("Full Name", "name", "text", "e.g. Arun Kumar")}
      {field("Email Address", "email", "email", "e.g. arun@pragati.in")}
      {field("Temporary Password", "password", "password", "Min 8 characters")}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              display: "block",
              marginBottom: 7,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              display: "block",
              marginBottom: 7,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Department
          </label>
          <select
            value={form.dept}
            onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          >
            {DEPTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        style={{
          padding: "11px 28px",
          borderRadius: 10,
          border: "none",
          background: "#2563eb",
          fontSize: 14,
          fontWeight: 700,
          color: "#fff",
          cursor: "pointer",
          letterSpacing: 0.2,
        }}
      >
        Create User
      </button>
    </div>
  );
}

/* ── Main Export ────────────────────────────────────────────── */
export default function UserManagementPage() {
  const [tab, setTab] = useState("list");

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
            background: "#7c3aed14",
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
              background: "#7c3aed",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#7c3aed",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            User Management
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
          Users
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          Create, edit, deactivate, and manage roles for all platform users.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "#f1f5f9",
          borderRadius: 10,
          padding: 4,
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          ["list", "User List"],
          ["create", "Create User"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              background: tab === key ? "#fff" : "transparent",
              color: tab === key ? "#1e293b" : "#94a3b8",
              boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "list" ? <UserListTab /> : <CreateUserTab />}
    </div>
  );
}
