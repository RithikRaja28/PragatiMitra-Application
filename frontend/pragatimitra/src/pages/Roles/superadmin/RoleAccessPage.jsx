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

const ROLE_ACCENT_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#16a34a",
  "#ea580c",
];

const EMPTY_PERMS = () =>
  Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, false]));
function permsToChecked(permissions = {}) {
  return Object.fromEntries(ALL_CAP_KEYS.map((k) => [k, !!permissions[k]]));
}
function countCheckedInGroup(group, checked) {
  return group.caps.filter((c) => checked[c.key]).length;
}

/* ══════════════════════════════════════════════════════════════
   SHARED STYLES
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
   CAPABILITY GROUP — enhanced toggle rows
══════════════════════════════════════════════════════════════════ */
function CapabilityGroup({ group, checked, onChange }) {
  const [open, setOpen] = useState(true);
  const checkedCount = countCheckedInGroup(group, checked);
  const total = group.caps.length;
  const allOn = checkedCount === total;
  const pct = total > 0 ? (checkedCount / total) * 100 : 0;

  const toggleAll = () => {
    const next = !allOn;
    group.caps.forEach((c) => onChange(c.key, next));
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        marginBottom: 12,
        overflow: "hidden",
        borderLeft: `3px solid ${group.color}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Group header */}
      <div
        style={{
          padding: "14px 18px",
          background: "#fafbfc",
          borderBottom: open ? "1px solid #e2e8f0" : "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Icon pill */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: group.colorBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {group.icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
            {group.label}
          </div>
          {/* Mini progress bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 4,
                borderRadius: 99,
                background: "#e2e8f0",
                overflow: "hidden",
                maxWidth: 120,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: group.color,
                  borderRadius: 99,
                  transition: "width 0.25s",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: checkedCount > 0 ? group.color : "#94a3b8",
              }}
            >
              {checkedCount}/{total}
            </span>
          </div>
        </div>

        {/* Toggle all */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            toggleAll();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 7,
            border: `1.5px solid ${allOn ? group.color : "#e2e8f0"}`,
            background: allOn ? group.colorBg : "#fff",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            color: allOn ? group.color : "#94a3b8",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
        >
          {allOn ? "✓ All on" : "Select all"}
        </div>

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s",
            color: "#94a3b8",
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

      {/* Capability rows */}
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
                  gap: 14,
                  padding: "13px 18px",
                  borderBottom:
                    i < group.caps.length - 1 ? "1px solid #f1f5f9" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                  background: isOn ? group.color + "06" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isOn) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isOn
                    ? group.color + "06"
                    : "transparent";
                }}
              >
                {/* Custom toggle */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    flexShrink: 0,
                    marginTop: 1,
                    border: `2px solid ${isOn ? group.color : "#d1d5db"}`,
                    background: isOn ? group.color : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {isOn && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                      fontWeight: isOn ? 600 : 500,
                      color: isOn ? "#1e293b" : "#374151",
                      lineHeight: 1.4,
                    }}
                  >
                    {cap.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    {cap.desc}
                  </div>
                </div>

                {cap.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 99,
                      flexShrink: 0,
                      marginTop: 2,
                      letterSpacing: 0.3,
                      ...BADGE_STYLES[cap.badge],
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
   PERMISSION SUMMARY SIDEBAR
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

      {/* Big donut-style percentage */}
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

  function toggleCap(key, val) {
    setChecked((prev) => ({ ...prev, [key]: val }));
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

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Breadcrumb header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#f1f5f9",
            border: "none",
            cursor: "pointer",
            color: "#475569",
            fontSize: 13,
            fontWeight: 600,
            padding: "7px 14px",
            borderRadius: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3L5 7l4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <span style={{ color: "#e2e8f0" }}>|</span>
        <div>
          <PageBadge color="#0891b2" label="Role & Access Control" />
        </div>
        <h2
          style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: 0 }}
        >
          {isNew ? "Create New Role" : `Editing: ${role.display_name}`}
        </h2>
        {role?.is_system && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: "#dbeafe",
              color: "#1d4ed8",
              padding: "3px 10px",
              borderRadius: 99,
            }}
          >
            System Role
          </span>
        )}
      </div>

      {/* Metadata card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: "20px 24px",
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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
          Role Details
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {isNew && (
            <div style={{ flex: 1, minWidth: 180 }}>
              <FieldLabel>Role Key *</FieldLabel>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameErr("");
                }}
                placeholder="e.g. dept_viewer"
                style={{
                  ...inputStyle,
                  borderColor: nameErr ? "#f87171" : "#e2e8f0",
                }}
              />
              {nameErr && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#ef4444",
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {nameErr}
                </span>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 180 }}>
            <FieldLabel>Display Name *</FieldLabel>
            <input
              value={displayName}
              onChange={(e) => setDN(e.target.value)}
              placeholder="e.g. Department Viewer"
              style={{
                ...inputStyle,
                borderColor: !displayName.trim() ? "#f87171" : "#e2e8f0",
              }}
            />
          </div>
          {isNew && (
            <div style={{ flex: 1, minWidth: 180 }}>
              <FieldLabel>Start from template</FieldLabel>
              <select
                onChange={(e) => applyTemplate(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Blank role —</option>
                {Object.keys(TEMPLATES).map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ flex: 2, minWidth: 200 }}>
            <FieldLabel>Description</FieldLabel>
            <input
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description…"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Split: capabilities + sidebar */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: capability groups */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 12,
            }}
          >
            Capabilities
          </div>
          {CAPABILITY_GROUPS.map((g) => (
            <CapabilityGroup
              key={g.label}
              group={g}
              checked={checked}
              onChange={toggleCap}
            />
          ))}
        </div>

        {/* Right: summary sidebar */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 12,
            }}
          >
            &nbsp;
          </div>
          <PermissionSummary checked={checked} />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 24,
          paddingTop: 20,
          borderTop: "1px solid #f1f5f9",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving || !displayName.trim()}
          style={{
            padding: "10px 28px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: saving || !displayName.trim() ? "not-allowed" : "pointer",
            background: saving || !displayName.trim() ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "background 0.2s",
          }}
        >
          {saving ? "Saving…" : isNew ? "Create Role" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            background: "#fff",
            color: "#475569",
            border: "1.5px solid #e2e8f0",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROLE CARD (replaces plain table row)
══════════════════════════════════════════════════════════════════ */
function RoleCard({ role, index, onEdit, onDelete, deleting }) {
  const accentColor = ROLE_ACCENT_COLORS[index % ROLE_ACCENT_COLORS.length];
  const permCount = Object.values(role.permissions || {}).filter(
    Boolean,
  ).length;
  const totalCaps = ALL_CAP_KEYS.length;
  const pct = totalCaps > 0 ? Math.round((permCount / totalCaps) * 100) : 0;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        borderTop: `3px solid ${accentColor}`,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: accentColor + "18",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {
              ["🛡️", "🔑", "👥", "📊", "💼", "🔍", "📋", "⚙️", "💰", "🎯"][
                index % 10
              ]
            }
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {role.display_name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontFamily: "monospace",
                marginTop: 1,
              }}
            >
              {role.name}
            </div>
          </div>
        </div>
        {/* Type badge */}
        {role.is_system ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: "#dbeafe",
              color: "#1d4ed8",
              padding: "2px 9px",
              borderRadius: 99,
              letterSpacing: 0.3,
            }}
          >
            System
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: "#f1f5f9",
              color: "#64748b",
              padding: "2px 9px",
              borderRadius: 99,
              letterSpacing: 0.3,
            }}
          >
            Custom
          </span>
        )}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 12,
          color: "#64748b",
          minHeight: 32,
          marginBottom: 14,
          lineHeight: 1.6,
        }}
      >
        {role.description || (
          <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>
            No description
          </span>
        )}
      </div>

      {/* Permission bar */}
      <div style={{ marginBottom: 16 }}>
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
          <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>
            {permCount}/{totalCaps}
          </span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 99,
            background: "#f1f5f9",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: accentColor,
              borderRadius: 99,
            }}
          />
        </div>
      </div>

      {/* Capability group dots */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}
      >
        {CAPABILITY_GROUPS.map((g) => {
          const count = g.caps.filter((c) => role.permissions?.[c.key]).length;
          return count > 0 ? (
            <span
              key={g.label}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 99,
                background: g.colorBg,
                color: g.color,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {g.icon} {g.label}
            </span>
          ) : null;
        })}
      </div>

      {/* Actions */}
      <div
        style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}
      >
        <button
          onClick={() => onEdit(role)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 9,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            fontSize: 12,
            fontWeight: 700,
            color: accentColor,
            cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = accentColor + "0d";
            e.currentTarget.style.borderColor = accentColor + "66";
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
              padding: "8px 14px",
              borderRadius: 9,
              border: "1.5px solid #fee2e2",
              background: "#fff",
              fontSize: 12,
              fontWeight: 700,
              color: deleting === role.id ? "#fca5a5" : "#dc2626",
              cursor: deleting === role.id ? "not-allowed" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
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
  const totalPerms = roles.reduce(
    (sum, r) => sum + Object.values(r.permissions || {}).filter(Boolean).length,
    0,
  );

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Page header */}
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

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Total Roles",
            value: roles.length,
            color: "#2563eb",
            bg: "#dbeafe",
            icon: "🛡️",
          },
          {
            label: "System Roles",
            value: systemCount,
            color: "#6d28d9",
            bg: "#ede9fe",
            icon: "🔐",
          },
          {
            label: "Custom Roles",
            value: customCount,
            color: "#059669",
            bg: "#d1fae5",
            icon: "✏️",
          },
        ].map(({ label, value, color, bg, icon }) => (
          <div
            key={label}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "18px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#1e293b",
                  letterSpacing: "-1px",
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  marginTop: 4,
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          placeholder="Search roles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
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

      {/* Role cards grid */}
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
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((r, i) => (
            <RoleCard
              key={r.id}
              role={r}
              index={i}
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
   ROOT ORCHESTRATOR
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
      {/* Toast */}
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
          {error}
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
