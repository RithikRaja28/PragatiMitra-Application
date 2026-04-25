import React, { useState } from "react";

const INITIAL_DEPTS = [
  {
    id: 1,
    name: "Engineering",
    code: "ENG",
    admin: "Arun Kumar",
    memberCount: 24,
    status: "active",
    created: "Jan 2024",
  },
  {
    id: 2,
    name: "Human Resources",
    code: "HR",
    admin: "Meena Rajan",
    memberCount: 8,
    status: "active",
    created: "Jan 2024",
  },
  {
    id: 3,
    name: "Finance",
    code: "FIN",
    admin: "Karthik S",
    memberCount: 12,
    status: "active",
    created: "Feb 2024",
  },
  {
    id: 4,
    name: "Operations",
    code: "OPS",
    admin: "Divya Priya",
    memberCount: 18,
    status: "active",
    created: "Mar 2024",
  },
  {
    id: 5,
    name: "Marketing",
    code: "MKT",
    admin: "Ravi Shankar",
    memberCount: 6,
    status: "inactive",
    created: "Apr 2024",
  },
];

const USERS_LIST = [
  "Arun Kumar",
  "Meena Rajan",
  "Karthik S",
  "Divya Priya",
  "Ravi Shankar",
  "Lakshmi N",
];

/* ── Confirm Dialog ──────────────────────────────────────────── */
function ConfirmDialog({ message, onConfirm, onCancel }) {
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
          width: 380,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#fef2f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            fontSize: 22,
          }}
        >
          ⚠️
        </div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 8,
          }}
        >
          Confirm Delete
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "none",
              background: "#dc2626",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Dept Form Modal ─────────────────────────────────────────── */
function DeptModal({ dept, onClose, onSave }) {
  const [form, setForm] = useState(
    dept || { name: "", code: "", admin: USERS_LIST[0], status: "active" },
  );
  const isEdit = !!dept;

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
          width: 440,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 24,
          }}
        >
          {isEdit ? "Edit Department" : "Create Department"}
        </h3>
        {[
          ["Department Name", "name", "e.g. Engineering"],
          ["Department Code", "code", "e.g. ENG"],
        ].map(([label, key, ph]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748b",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              {label}
            </label>
            <input
              placeholder={ph}
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
              fontWeight: 700,
              color: "#64748b",
              display: "block",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Department Admin
          </label>
          <select
            value={form.admin}
            onChange={(e) => setForm((f) => ({ ...f, admin: e.target.value }))}
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
            {USERS_LIST.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              display: "block",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Status
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            {["active", "inactive"].map((s) => (
              <button
                key={s}
                onClick={() => setForm((f) => ({ ...f, status: s }))}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1.5px solid",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  borderColor: form.status === s ? "#2563eb" : "#e2e8f0",
                  background: form.status === s ? "#eff6ff" : "#fff",
                  color: form.status === s ? "#2563eb" : "#94a3b8",
                }}
              >
                {s}
              </button>
            ))}
          </div>
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
            {isEdit ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Admin Access Modal ──────────────────────────────────────── */
function AdminAccessModal({ dept, onClose, onSave }) {
  const [admin, setAdmin] = useState(dept.admin);
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
          width: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#ede9fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            fontSize: 22,
          }}
        >
          🔑
        </div>
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 6,
          }}
        >
          Admin Access
        </h3>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
          Assign or change the admin for <strong>{dept.name}</strong>.
        </p>
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            Select Admin
          </div>
          {USERS_LIST.map((u) => (
            <div
              key={u}
              onClick={() => setAdmin(u)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",
                marginBottom: 4,
                background: admin === u ? "#eff6ff" : "#f8fafc",
                border: `1.5px solid ${admin === u ? "#2563eb" : "transparent"}`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `hsl(${u.length * 40}, 55%, 85%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: `hsl(${u.length * 40}, 55%, 35%)`,
                }}
              >
                {u
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: admin === u ? "#2563eb" : "#1e293b",
                }}
              >
                {u}
              </span>
              {admin === u && (
                <span
                  style={{ marginLeft: "auto", fontSize: 14, color: "#2563eb" }}
                >
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
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
            onClick={() => onSave(admin)}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "none",
              background: "#7c3aed",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Assign Admin
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Export ─────────────────────────────────────────────── */
export default function DepartmentManagementPage() {
  const [depts, setDepts] = useState(INITIAL_DEPTS);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adminModal, setAdminModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCreate = (form) => {
    setDepts((d) => [
      ...d,
      { ...form, id: Date.now(), memberCount: 0, created: "Apr 2025" },
    ]);
    setShowCreate(false);
    showToast("Department created.");
  };
  const handleEdit = (form) => {
    setDepts((d) =>
      d.map((dep) => (dep.id === editing.id ? { ...dep, ...form } : dep)),
    );
    setEditing(null);
    showToast("Department updated.");
  };
  const handleDelete = () => {
    setDepts((d) => d.filter((dep) => dep.id !== confirmDelete.id));
    setConfirmDelete(null);
    showToast("Department deleted.");
  };
  const handleAdminSave = (admin) => {
    setDepts((d) =>
      d.map((dep) => (dep.id === adminModal.id ? { ...dep, admin } : dep)),
    );
    setAdminModal(null);
    showToast("Admin access updated.");
  };

  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {showCreate && (
        <DeptModal onClose={() => setShowCreate(false)} onSave={handleCreate} />
      )}
      {editing && (
        <DeptModal
          dept={editing}
          onClose={() => setEditing(null)}
          onSave={handleEdit}
        />
      )}
      {adminModal && (
        <AdminAccessModal
          dept={adminModal}
          onClose={() => setAdminModal(null)}
          onSave={handleAdminSave}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${confirmDelete.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            right: 28,
            background: "#1e293b",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#059669" + "14",
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
                background: "#059669",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#059669",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Dept Management
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
            Departments
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create, manage, and assign admin access to departments.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: "10px 22px",
            borderRadius: 10,
            border: "none",
            background: "#2563eb",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          + New Department
        </button>
      </div>

      {/* Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {depts.map((dept) => (
          <div
            key={dept.id}
            style={{
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              padding: "22px 24px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 11,
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#2563eb",
                    letterSpacing: 0.5,
                  }}
                >
                  {dept.code}
                </div>
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}
                  >
                    {dept.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Since {dept.created}
                  </div>
                </div>
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  background: dept.status === "active" ? "#d1fae5" : "#f1f5f9",
                  color: dept.status === "active" ? "#065f46" : "#94a3b8",
                }}
              >
                {dept.status}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 16,
                padding: "12px 14px",
                background: "#f8fafc",
                borderRadius: 10,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}
                >
                  Members
                </div>
                <div
                  style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}
                >
                  {dept.memberCount}
                </div>
              </div>
              <div style={{ width: 1, background: "#e2e8f0" }} />
              <div>
                <div
                  style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}
                >
                  Admin
                </div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}
                >
                  {dept.admin}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setEditing(dept)}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
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
                onClick={() => setAdminModal(dept)}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#7c3aed",
                  cursor: "pointer",
                }}
              >
                Admin Access
              </button>
              <button
                onClick={() => setConfirmDelete(dept)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #fee2e2",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#dc2626",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
