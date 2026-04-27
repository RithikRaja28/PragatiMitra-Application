import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../hooks/useApi";

/* ══════════════════════════════════════════════════════════════
   CAPABILITY DEFINITIONS
══════════════════════════════════════════════════════════════════ */
const CAPABILITY_GROUPS = [
  {
    label: "User Management",
    icon: "👤",
    color: "#7c3aed",
    colorBg: "#ede9fe",
    caps: [
      {
        key: "assign_roles_institute",
        label: "Assign roles & link users to departments (institute-wide)",
        desc: "Can map any user to any role and department across the institute.",
        badge: "Restricted",
      },
      {
        key: "manage_dept_users",
        label: "Add, update, and deactivate users within own department",
        desc: "Department-scoped user management only.",
      },
      {
        key: "delegate_nodal",
        label: "Delegate nodal officer rights to another staff member",
        desc: "Can hand over section responsibility for a specific reporting year.",
      },
    ],
  },
  {
    label: "Form Access",
    icon: "📋",
    color: "#0891b2",
    colorBg: "#e0f2fe",
    caps: [
      {
        key: "fill_dept_forms",
        label: "Fill departmental forms",
        desc: "OPD/IPD stats, academic data, research, library, pharmacovigilance, Rajbhasha.",
      },
      {
        key: "fill_institute_forms",
        label: "Fill institute-wide forms",
        desc: "Committees, governance records, general administration.",
      },
    ],
  },
  {
    label: "Report",
    icon: "📊",
    color: "#d97706",
    colorBg: "#fef3c7",
    caps: [
      {
        key: "manage_cycles",
        label: "Create and manage reporting cycles",
        desc: "Define reporting year, deadlines, approval workflow, and lock/archive cycles.",
        badge: "Restricted",
      },
      {
        key: "configure_templates",
        label: "Configure section templates and field formats",
        desc: "Build or clone the section tree and define field types for each section.",
        badge: "Admin",
      },
      {
        key: "write_narrative",
        label: "Write and edit narrative content",
        desc: "Use the rich text editor to author section narratives, insert tables and upload annexures.",
      },
      {
        key: "submit_for_review",
        label: "Submit content for review",
        desc: "Mark a section as ready and push it to the next stage in the review chain.",
      },
      {
        key: "review_content",
        label: "Review content — read-only; can comment, approve or send back",
        desc: "Cannot edit content directly.",
      },
      {
        key: "final_signoff",
        label: "Final sign-off (Director level)",
        desc: "Last approval step before a section is locked.",
        badge: "Restricted",
      },
      {
        key: "compile_report",
        label: "Compile the final report and manage bilingual output",
        desc: "Trigger one-click compilation; generate English and Hindi exports.",
        badge: "Admin",
      },
    ],
  },
  {
    label: "Finance",
    icon: "💰",
    color: "#059669",
    colorBg: "#d1fae5",
    caps: [
      {
        key: "fill_finance_forms",
        label: "Fill finance forms and enter budget data",
        desc: "Budget estimates, revised estimates, and actual expenditure.",
        badge: "Finance",
      },
      {
        key: "upload_statements",
        label: "Upload audited financial statements",
        desc: "Balance sheet, I&E statements and schedules (PDF / Excel).",
        badge: "Finance",
      },
    ],
  },
  {
    label: "Administration & Audit",
    icon: "🛡️",
    color: "#dc2626",
    colorBg: "#fee2e2",
    caps: [
      {
        key: "master_data",
        label: "Manage master data",
        desc: "Departments, designations, KPI definitions, notification templates, and access policies.",
        badge: "Restricted",
      },
      {
        key: "audit_logs",
        label: "View audit logs and progress dashboards",
        desc: "Login history, edit/approval actions, and section completion across departments.",
      },
    ],
  },
];

const ALL_CAP_KEYS = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));

const TEMPLATES = {
  super_admin: [
    "assign_roles_institute",
    "manage_dept_users",
    "delegate_nodal",
    "manage_cycles",
    "configure_templates",
    "fill_dept_forms",
    "fill_institute_forms",
    "write_narrative",
    "submit_for_review",
    "review_content",
    "final_signoff",
    "fill_finance_forms",
    "upload_statements",
    "compile_report",
    "master_data",
    "audit_logs",
  ],
  institute_admin: [
    "manage_cycles",
    "configure_templates",
    "audit_logs",
    "master_data",
  ],
  publication_cell: [
    "configure_templates",
    "compile_report",
    "review_content",
    "audit_logs",
  ],
  dept_admin: ["manage_dept_users"],
  hod: ["delegate_nodal", "review_content", "submit_for_review"],
  nodal_officer: ["fill_dept_forms", "write_narrative", "submit_for_review"],
  contributor: ["fill_dept_forms", "write_narrative"],
  reviewer: ["review_content"],
  finance_officer: ["fill_finance_forms", "upload_statements"],
  director: ["final_signoff", "review_content"],
};

const BADGE_STYLES = {
  Restricted: { background: "#fee2e2", color: "#b91c1c" },
  Admin: { background: "#fef3c7", color: "#92400e" },
  Finance: { background: "#dcfce7", color: "#166534" },
};

const EMPTY_PERMS = () =>
  Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, false]));
function permsToChecked(p = {}) {
  return Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, !!p[k]]));
}
function countCheckedInGroup(group, checked) {
  return group.caps.filter((c) => checked[c.key]).length;
}

/* ══════════════════════════════════════════════════════════════
   SHARED
══════════════════════════════════════════════════════════════════ */
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 9,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
  color: "#1e293b",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

function FieldLabel({ children }) {
  return (
    <label
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#64748b",
        display: "block",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}
    >
      {children}
    </label>
  );
}

function PageBadge({ color, label }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: color + "14",
        borderRadius: 8,
        padding: "4px 12px",
        marginBottom: 12,
      }}
    >
      <div
        style={{ width: 7, height: 7, borderRadius: "50%", background: color }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   EDITOR: CAPABILITY GROUP — professional, neutral
══════════════════════════════════════════════════════════════════ */
function CapabilityGroup({ group, checked, onChange }) {
  const [open, setOpen] = useState(true);
  const checkedCount = countCheckedInGroup(group, checked);
  const total = group.caps.length;
  const allOn = checkedCount === total;
  const toggleAll = () => {
    const next = !allOn;
    group.caps.forEach((c) => onChange(c.key, next));
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "11px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
          background: open ? "#fafbfc" : "#fff",
          borderBottom: open ? "1px solid #e2e8f0" : "none",
        }}
      >
        <span
          style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", flex: 1 }}
        >
          {group.label}
        </span>

        {/* Count badge — blue only if something checked, grey otherwise */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "1px 7px",
            borderRadius: 99,
            background: checkedCount > 0 ? "#eff6ff" : "#f8fafc",
            color: checkedCount > 0 ? "#2563eb" : "#94a3b8",
            border: `1px solid ${checkedCount > 0 ? "#bfdbfe" : "#e2e8f0"}`,
            transition: "all 0.15s",
          }}
        >
          {checkedCount}/{total}
        </span>

        {/* Select all — plain text link */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleAll();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: allOn ? "#2563eb" : "#94a3b8",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "color 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#2563eb";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = allOn ? "#2563eb" : "#94a3b8";
          }}
        >
          {allOn ? "Deselect all" : "Select all"}
        </button>

        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.18s",
            color: "#cbd5e1",
            flexShrink: 0,
          }}
        >
          <path
            d="M3 5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Rows */}
      {open && (
        <div>
          {group.caps.map((cap, i) => {
            const isOn = !!checked[cap.key];
            return (
              <div
                key={cap.key}
                onClick={() => onChange(cap.key, !isOn)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "11px 16px",
                  borderBottom:
                    i < group.caps.length - 1 ? "1px solid #f8fafc" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                  background: isOn ? "#f8faff" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isOn) e.currentTarget.style.background = "#fafbfc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isOn
                    ? "#f8faff"
                    : "transparent";
                }}
              >
                {/* Checkbox — single blue accent, no per-group colour */}
                <div
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 5,
                    flexShrink: 0,
                    marginTop: 2,
                    border: `1.5px solid ${isOn ? "#2563eb" : "#d1d5db"}`,
                    background: isOn ? "#2563eb" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.12s",
                  }}
                >
                  {isOn && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5 3.5-4"
                        stroke="#fff"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isOn ? 600 : 400,
                      color: isOn ? "#0f172a" : "#374151",
                      lineHeight: 1.4,
                    }}
                  >
                    {cap.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      marginTop: 2,
                      lineHeight: 1.5,
                    }}
                  >
                    {cap.desc}
                  </div>
                </div>

                {/* Badge — uniform neutral pill, no per-type colours */}
                {cap.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 5,
                      flexShrink: 0,
                      marginTop: 2,
                      letterSpacing: 0.2,
                      background: "#f1f5f9",
                      color: "#64748b",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {cap.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   EDITOR: PERMISSION SIDEBAR (colorful)
══════════════════════════════════════════════════════════════════ */
function PermissionSummary({ checked }) {
  const total = ALL_CAP_KEYS.length;
  const selected = ALL_CAP_KEYS.filter((k) => checked[k]).length;
  const pct = total > 0 ? Math.round((selected / total) * 100) : 0;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "20px",
        position: "sticky",
        top: 24,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 16,
        }}
      >
        Permission Summary
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#1e293b",
            letterSpacing: "-1px",
          }}
        >
          {pct}%
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
          {selected} of {total} permissions
        </div>
        <div
          style={{
            margin: "12px 0 0",
            height: 6,
            borderRadius: 99,
            background: "#f1f5f9",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, #2563eb, #7c3aed)",
              borderRadius: 99,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>
      <div
        style={{
          borderTop: "1px solid #f1f5f9",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {CAPABILITY_GROUPS.map((g) => {
          const count = countCheckedInGroup(g, checked);
          return (
            <div
              key={g.label}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: count > 0 ? g.color : "#e2e8f0",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: count > 0 ? "#374151" : "#94a3b8",
                  flex: 1,
                  fontWeight: count > 0 ? 500 : 400,
                }}
              >
                {g.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: count > 0 ? g.color : "#cbd5e1",
                }}
              >
                {count}/{g.caps.length}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROLE EDITOR
══════════════════════════════════════════════════════════════════ */
function RoleEditor({ role, onSave, onCancel, saving }) {
  const isNew = !role;
  const [name, setName] = useState(role?.name ?? "");
  const [displayName, setDN] = useState(role?.display_name ?? "");
  const [description, setDesc] = useState(role?.description ?? "");
  const [checked, setChecked] = useState(
    isNew ? EMPTY_PERMS() : permsToChecked(role.permissions),
  );
  const [nameErr, setNameErr] = useState("");

  function applyTemplate(tplKey) {
    if (!tplKey) {
      setChecked(EMPTY_PERMS());
      return;
    }
    const caps = TEMPLATES[tplKey] ?? [];
    setChecked(
      Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, caps.includes(k)])),
    );
  }

  function handleSave() {
    if (!displayName.trim()) return;
    if (isNew) {
      if (!name.trim()) {
        setNameErr("Required");
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        setNameErr("Lowercase snake_case only (e.g. dept_viewer)");
        return;
      }
    }
    setNameErr("");
    const permissions = Object.fromEntries(
      ALL_CAP_KEYS.map((k) => [k, !!checked[k]]),
    );
    onSave({
      name: name.trim(),
      display_name: displayName.trim(),
      description: description.trim() || null,
      permissions,
    });
  }

  /* shared focused input style */
  const focusInput = {
    ...inputStyle,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13.5,
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* ── Breadcrumb nav ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 28,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 500,
            padding: "0",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#475569";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3L5 7l4 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Roles & Permissions
        </button>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ color: "#d1d5db", flexShrink: 0 }}
        >
          <path
            d="M5 3l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>
          {isNew ? "New Role" : role.display_name}
        </span>
        {role?.is_system && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: "#f1f5f9",
              color: "#475569",
              padding: "2px 8px",
              borderRadius: 99,
              border: "1px solid #e2e8f0",
              marginLeft: 4,
            }}
          >
            System
          </span>
        )}
      </div>

      {/* ── Page title block ── */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.4px",
            margin: "0 0 4px",
          }}
        >
          {isNew ? "Create a new role" : `Edit role`}
        </h1>
        <p style={{ fontSize: 13.5, color: "#64748b", margin: 0 }}>
          {isNew
            ? "Define a name, key, and the capabilities this role will have."
            : `Adjust the display name, description, and capabilities for ${role.display_name}.`}
        </p>
      </div>

      {/* ── Inline fields — no card wrapper ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNew ? "1fr 1fr 1fr" : "1.4fr 2fr",
          gap: "0 24px",
          marginBottom: 28,
          paddingBottom: 28,
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        {isNew && (
          <div>
            <FieldLabel>Role Key *</FieldLabel>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameErr("");
              }}
              placeholder="e.g. dept_viewer"
              style={{
                ...focusInput,
                borderColor: nameErr ? "#f87171" : "#e2e8f0",
                fontFamily: "monospace",
                fontSize: 13,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#93c5fd";
                e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = nameErr ? "#f87171" : "#e2e8f0";
                e.target.style.boxShadow = "none";
              }}
            />
            {nameErr ? (
              <span
                style={{
                  fontSize: 11,
                  color: "#ef4444",
                  marginTop: 5,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle
                    cx="5"
                    cy="5"
                    r="4.5"
                    stroke="#ef4444"
                    strokeWidth="1"
                  />
                  <path
                    d="M5 3v2.5M5 7h.01"
                    stroke="#ef4444"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                {nameErr}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11,
                  color: "#94a3b8",
                  marginTop: 5,
                  display: "block",
                }}
              >
                Lowercase snake_case, cannot be changed later.
              </span>
            )}
          </div>
        )}

        <div>
          <FieldLabel>Display Name *</FieldLabel>
          <input
            value={displayName}
            onChange={(e) => setDN(e.target.value)}
            placeholder="e.g. Department Viewer"
            style={{
              ...focusInput,
              borderColor:
                !displayName.trim() && displayName !== ""
                  ? "#f87171"
                  : "#e2e8f0",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#93c5fd";
              e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "none";
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 5,
              display: "block",
            }}
          >
            Shown across the platform UI.
          </span>
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <input
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this role for?"
            style={focusInput}
            onFocus={(e) => {
              e.target.style.borderColor = "#93c5fd";
              e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "none";
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 5,
              display: "block",
            }}
          >
            Optional — helps admins understand the role.
          </span>
        </div>

        {isNew && (
          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <FieldLabel>
              Start from a template{" "}
              <span
                style={{
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "#94a3b8",
                }}
              >
                — optional
              </span>
            </FieldLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(TEMPLATES).map((k) => (
                <button
                  key={k}
                  onClick={() => applyTemplate(k)}
                  style={{
                    padding: "5px 13px",
                    borderRadius: 8,
                    border: "1.5px solid #e2e8f0",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#93c5fd";
                    e.currentTarget.style.color = "#2563eb";
                    e.currentTarget.style.background = "#eff6ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.color = "#475569";
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  {k.replace(/_/g, " ")}
                </button>
              ))}
              <button
                onClick={() => applyTemplate("")}
                style={{
                  padding: "5px 13px",
                  borderRadius: 8,
                  border: "1.5px dashed #e2e8f0",
                  background: "transparent",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Capabilities + sidebar ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              margin: "0 0 14px",
              fontWeight: 400,
            }}
          >
            Select the capabilities this role can perform. Click a group header
            to collapse it.
          </p>
          {CAPABILITY_GROUPS.map((g) => (
            <CapabilityGroup
              key={g.label}
              group={g}
              checked={checked}
              onChange={(key, val) => setChecked((p) => ({ ...p, [key]: val }))}
            />
          ))}
        </div>
        <div style={{ width: 220, flexShrink: 0, paddingTop: 36 }}>
          <PermissionSummary checked={checked} />
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 28,
          paddingTop: 20,
          borderTop: "1px solid #f1f5f9",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving || !displayName.trim()}
          style={{
            padding: "10px 28px",
            borderRadius: 9,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: saving || !displayName.trim() ? "not-allowed" : "pointer",
            background: saving || !displayName.trim() ? "#bfdbfe" : "#2563eb",
            color: "#fff",
            border: "none",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "background 0.15s, transform 0.1s",
          }}
          onMouseEnter={(e) => {
            if (!saving && displayName.trim())
              e.currentTarget.style.background = "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            if (!saving && displayName.trim())
              e.currentTarget.style.background = "#2563eb";
          }}
        >
          {saving ? "Saving…" : isNew ? "Create Role" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 22px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            background: "#fff",
            color: "#64748b",
            border: "1.5px solid #e2e8f0",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#cbd5e1";
            e.currentTarget.style.color = "#475569";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#e2e8f0";
            e.currentTarget.style.color = "#64748b";
          }}
        >
          Cancel
        </button>
        {!isNew && !role?.is_system && (
          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
            Role key:{" "}
            <code
              style={{
                fontFamily: "monospace",
                background: "#f8fafc",
                padding: "1px 6px",
                borderRadius: 4,
                color: "#475569",
              }}
            >
              {role.name}
            </code>
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROLE CARD — professional, monochromatic
══════════════════════════════════════════════════════════════════ */
function RoleCard({ role, onEdit, onDelete, deleting }) {
  const permCount = Object.values(role.permissions || {}).filter(
    Boolean,
  ).length;
  const totalCaps = ALL_CAP_KEYS.length;
  const pct = totalCaps > 0 ? Math.round((permCount / totalCaps) * 100) : 0;
  const activeGroups = CAPABILITY_GROUPS.filter((g) =>
    g.caps.some((c) => role.permissions?.[c.key]),
  );

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
      }}
    >
      {/* Name + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {role.display_name}
          </div>
          <div
            style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}
          >
            {role.name}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 99,
            flexShrink: 0,
            letterSpacing: 0.3,
            background: role.is_system ? "#f1f5f9" : "#f8fafc",
            color: role.is_system ? "#475569" : "#94a3b8",
            border: "1px solid #e2e8f0",
          }}
        >
          {role.is_system ? "System" : "Custom"}
        </span>
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 12,
          color: "#64748b",
          lineHeight: 1.6,
          marginBottom: 14,
          minHeight: 36,
        }}
      >
        {role.description || (
          <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>
            No description
          </span>
        )}
      </div>

      {/* Permission bar */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
            Permissions
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
            {permCount} / {totalCaps}
          </span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 99,
            background: "#f1f5f9",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "#2563eb",
              borderRadius: 99,
              opacity: pct === 0 ? 0 : 1,
            }}
          />
        </div>
      </div>

      {/* Capability area tags — neutral grey pills */}
      <div
        style={{
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          marginBottom: 16,
          minHeight: 22,
        }}
      >
        {activeGroups.length === 0 ? (
          <span style={{ fontSize: 11, color: "#cbd5e1", fontStyle: "italic" }}>
            No capabilities assigned
          </span>
        ) : (
          activeGroups.map((g) => (
            <span
              key={g.label}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 6,
                background: "#f1f5f9",
                color: "#64748b",
                letterSpacing: 0.2,
              }}
            >
              {g.label}
            </span>
          ))
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          onClick={() => onEdit(role)}
          style={{
            flex: 1,
            padding: "7px 0",
            borderRadius: 8,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            fontSize: 12,
            fontWeight: 700,
            color: "#2563eb",
            cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#eff6ff";
            e.currentTarget.style.borderColor = "#bfdbfe";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.borderColor = "#e2e8f0";
          }}
        >
          Edit Role
        </button>
        {!role.is_system && (
          <button
            onClick={() => onDelete(role)}
            disabled={deleting === role.id}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "1.5px solid #e2e8f0",
              background: "#fff",
              fontSize: 12,
              fontWeight: 700,
              color: deleting === role.id ? "#fca5a5" : "#94a3b8",
              cursor: deleting === role.id ? "not-allowed" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (deleting !== role.id) {
                e.currentTarget.style.color = "#dc2626";
                e.currentTarget.style.borderColor = "#fecaca";
                e.currentTarget.style.background = "#fff5f5";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#94a3b8";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.background = "#fff";
            }}
          >
            {deleting === role.id ? "…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROLE LIST
══════════════════════════════════════════════════════════════════ */
function RoleList({ roles, onEdit, onDelete, onCreate, deleting }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const filtered = roles.filter((r) => {
    const matchSearch =
      r.display_name.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase());
    const matchType =
      filterType === "all" ||
      (filterType === "system" ? r.is_system : !r.is_system);
    return matchSearch && matchType;
  });

  const systemCount = roles.filter((r) => r.is_system).length;
  const customCount = roles.filter((r) => !r.is_system).length;

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <PageBadge color="#0891b2" label="Role & Access Control" />
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#1e293b",
                letterSpacing: "-0.4px",
                marginBottom: 6,
              }}
            >
              Roles & Permissions
            </h1>
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              Define what each role can access and do across the platform.
            </p>
          </div>
          <button
            onClick={onCreate}
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
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            + Create Role
          </button>
        </div>
      </div>

      {/* Stat row — minimal, no colour fills */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Roles", value: roles.length },
          { label: "System Roles", value: systemCount },
          { label: "Custom Roles", value: customCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "14px 22px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#1e293b",
                letterSpacing: "-0.5px",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                marginTop: 5,
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
              pointerEvents: "none",
            }}
          >
            <circle
              cx="6"
              cy="6"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10 10l2 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            placeholder="Search roles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#f1f5f9",
            borderRadius: 10,
            padding: 4,
          }}
        >
          {[
            ["all", "All"],
            ["system", "System"],
            ["custom", "Custom"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                background: filterType === key ? "#fff" : "transparent",
                color: filterType === key ? "#1e293b" : "#94a3b8",
                boxShadow:
                  filterType === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 14,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
          }}
        >
          No roles match your search.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((r) => (
            <RoleCard
              key={r.id}
              role={r}
              onEdit={onEdit}
              onDelete={onDelete}
              deleting={deleting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════ */
export default function RoleAccessPage() {
  const { apiFetch } = useApi();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/roles");
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setRoles(data.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  async function handleSave(payload) {
    setSaving(true);
    try {
      const isNew = view === "create";
      const res = await apiFetch(
        isNew ? "/api/roles" : `/api/roles/${editing.id}`,
        { method: isNew ? "POST" : "PUT", body: JSON.stringify(payload) },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await loadRoles();
      setView("list");
      setEditing(null);
      showToast(
        isNew ? "Role created successfully." : "Role updated successfully.",
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role) {
    if (
      !window.confirm(
        `Delete role "${role.display_name}"? This cannot be undone.`,
      )
    )
      return;
    setDeleting(role.id);
    try {
      const res = await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      showToast("Role deleted.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            right: 28,
            zIndex: 9999,
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: toast.type === "error" ? "#fee2e2" : "#dcfce7",
            color: toast.type === "error" ? "#b91c1c" : "#15803d",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {toast.type === "error" ? "✕" : "✓"} {toast.msg}
        </div>
      )}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#94a3b8",
            fontSize: 14,
            padding: 40,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "2.5px solid #e2e8f0",
              borderTopColor: "#2563eb",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Loading roles…
        </div>
      )}
      {!loading && error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "16px 20px",
            fontSize: 13,
            color: "#dc2626",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {error}{" "}
          <button
            onClick={loadRoles}
            style={{
              color: "#2563eb",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && view === "list" && (
        <RoleList
          roles={roles}
          onEdit={(r) => {
            setEditing(r);
            setView("edit");
          }}
          onDelete={handleDelete}
          onCreate={() => {
            setEditing(null);
            setView("create");
          }}
          deleting={deleting}
        />
      )}
      {!loading && !error && (view === "edit" || view === "create") && (
        <RoleEditor
          role={view === "edit" ? editing : null}
          onSave={handleSave}
          onCancel={() => {
            setView("list");
            setEditing(null);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}
