/**
 * roleConfig.jsx
 * ─────────────────────────────────────────────────────────────
 * Central config that maps each role → { navItems, pages }
 *
 * HOW TO ADD A NEW ROLE (when backend sends a new role string):
 *   1. Create page component in pages/<role>/YourPage.jsx
 *   2. Import it below
 *   3. Add a new key to ROLE_CONFIG with navItems + pages
 *   4. Done — RootLayout picks it up automatically
 * ─────────────────────────────────────────────────────────────
 */

import React from "react";

/* ═══════════════════════════════════════════════════════════════
   SUPER ADMIN PAGE IMPORTS
   Each page lives in its own file under pages/superadmin/
═══════════════════════════════════════════════════════════════ */
import UserManagementPage from "../../pages/Roles/superadmin/UserManagementPage";
import AuditLogsPage from "../../pages/Roles/superadmin/AuditLogsPage";
import DepartmentManagementPage from "../../pages/Roles/superadmin/DepartmentManagementPage";
import RoleAccessPage from "../../pages/Roles/superadmin/RoleAccessPage";
/* ── Shared placeholder shell (for pages not yet built) ─────── */
function PlaceholderPage({ title, subtitle, color = "#2563eb" }) {
  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{ marginBottom: 28 }}>
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
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
            }}
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
            {title}
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
          {title}
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>{subtitle}</p>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {["Total", "Active", "Pending", "Resolved"].map((label, i) => (
          <div
            key={label}
            style={{
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 12,
              padding: "20px 22px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 10,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#1e293b",
                letterSpacing: "-1px",
              }}
            >
              {(i + 1) * 148 + 17}
            </div>
            <div style={{ fontSize: 12, color, marginTop: 6, fontWeight: 500 }}>
              ↑ {((i + 1) * 2.3).toFixed(1)}% this month
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.07)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
            Recent Activity
          </span>
          <span
            style={{ fontSize: 12, color, cursor: "pointer", fontWeight: 500 }}
          >
            View all →
          </span>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "13px 22px",
              borderBottom: i < 5 ? "1px solid rgba(0,0,0,0.04)" : "none",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: `hsl(${i * 53 + 200}, 55%, 88%)`,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#1e293b",
                  marginBottom: 2,
                }}
              >
                Record #{i * 100 + 43}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Updated {i} hour{i > 1 ? "s" : ""} ago
              </div>
            </div>
            <div
              style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: i % 2 === 0 ? color + "18" : "#10b98118",
                color: i % 2 === 0 ? color : "#10b981",
              }}
            >
              {i % 2 === 0 ? "Active" : "Done"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SUPER ADMIN — PLACEHOLDER PAGES (not yet built)
   Replace each with a real import once the page is built.
══════════════════════════════════════════════════════════════ */
const SuperAdminOverviewPage = () => (
  <PlaceholderPage
    title="Overview"
    subtitle="Platform-wide summary and key metrics"
    color="#2563eb"
  />
);
const SuperAdminMasterDataPage = () => (
  <PlaceholderPage
    title="Master Data"
    subtitle="Manage lookup values, categories, and reference data"
    color="#059669"
  />
);

/* ══════════════════════════════════════════════════════════════
   ROLE CONFIG MAP
   Structure per role:
   {
     navItems: [...],          // passed directly to AppShell
     pages:    { id: <Component /> }  // passed directly to AppShell
   }
══════════════════════════════════════════════════════════════ */
export const ROLE_CONFIG = {
  /* ── SUPER ADMIN ──────────────────────────────────────────── */
  super_admin: {
    navItems: [
      {
        group: "",
        items: [
          { id: "overview", label: "Dashboard", icon: "LayoutDashboard", permission: null },
        ],
      },
      {
        group: "User Management",
        items: [
          { id: "users", label: "Users", icon: "Users", badge: "12", permission: "manage_dept_users" },
        ],
      },
      {
        group: "Dept Management",
        items: [{ id: "departments", label: "Departments", icon: "Building2", permission: "master_data" }],
      },
      {
        group: "Access & Data",
        items: [
          { id: "role-access", label: "Role & Access Control", icon: "ShieldCheck", permission: "assign_roles_institute" },
          { id: "master-data", label: "Master Data", icon: "Database", permission: "master_data" },
        ],
      },
      {
        group: "Audit",
        items: [
          { id: "audit-logs", label: "Logs", icon: "ScrollText", badge: "3", permission: "audit_logs" },
        ],
      }
    ],

    pages: {
      overview: <SuperAdminOverviewPage />,
      // User Management — both tabs live inside the same page component;
      // "user-create" navigates to the page and opens the Create tab directly.
      users: <UserManagementPage initialTab="list" />,
      
      // Dept Management
      departments: <DepartmentManagementPage />,
      // Access & Data
      "role-access": <RoleAccessPage />,
      "master-data": <SuperAdminMasterDataPage />,
    
      // Audit
      "audit-logs": <AuditLogsPage />,
    },

    defaultPage: "overview",
    user: { name: "Super Admin", initials: "SA", org: "PragatiMitra HQ" },
  },

  /* ── ORG ADMIN (placeholder — wire up when backend ready) ─── */
  // org_admin: {
  //   navItems: [
  //     { group: '', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' }] },
  //     { group: 'Team',   items: [{ id: 'members', label: 'Members', icon: 'Users' }] },
  //   ],
  //   pages: {
  //     dashboard: <OrgAdminDashboardPage />,
  //     members:   <OrgAdminMembersPage />,
  //   },
  //   defaultPage: 'dashboard',
  //   user: { name: 'Org Admin', initials: 'OA', org: 'Your Org' },
  // },

  /* ── FALLBACK (shown if backend returns an unknown role) ───── */
  __fallback__: {
    navItems: [
      { group: "", items: [{ id: "home", label: "Home", icon: "Home" }] },
    ],
    pages: {
      home: (
        <div
          style={{ padding: 40, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <h2 style={{ color: "#1e293b" }}>Access Restricted</h2>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>
            Your role does not have a configured dashboard. Please contact your
            administrator.
          </p>
        </div>
      ),
    },
    defaultPage: "home",
    user: { name: "Unknown", initials: "?", org: "" },
  },
};

/**
 * getRoleConfig(role)
 * Returns the nav/pages config for a given role string.
 * Falls back to __fallback__ if the role isn't registered.
 *
 * @param {string} role  - e.g. 'super_admin', 'org_admin'
 * @returns {{ navItems, pages, defaultPage, user }}
 */
export function getRoleConfig(role) {
  return ROLE_CONFIG[role] ?? ROLE_CONFIG["__fallback__"];
}
