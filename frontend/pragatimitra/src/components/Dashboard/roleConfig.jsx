/**
 * roleConfig.jsx
 * ─────────────────────────────────────────────────────────────
 * Central config that maps each role → { navItems, pages }
 *
 * HOW TO ADD A NEW ROLE (when backend sends a new role string):
 *   1. Create page component in pages/<role>/YourPage.jsx
 *   2. Import it below
 *   3. Add a new key to ROLE_CONFIG — key MUST exactly match
 *      user?.roles?.[0]?.name from the backend.
 *   4. Add the route path to ROLE_ROUTES in AuthContext.jsx
 *   5. Add a { path: "dashboard/your-role", element: null }
 *      entry in router.jsx under the RootLayout children.
 *   Done — RootLayout picks it up automatically.
 * ─────────────────────────────────────────────────────────────
 */

import React from "react";

/* ── Super Admin page imports ───────────────────────────────── */
import UserManagementPage        from "../../pages/Roles/superadmin/UserManagementPage";
import AuditLogsPage             from "../../pages/Roles/superadmin/AuditLogsPage";
import DepartmentManagementPage  from "../../pages/Roles/superadmin/DepartmentManagementPage";
import InstitutionManagementPage from "../../pages/Roles/superadmin/InstitutionManagementPage";
import CommitteeManagementPage   from "../../pages/Roles/superadmin/CommitteesManagementPage";
import RoleAccessPage            from "../../pages/Roles/superadmin/RoleAccessPage";

/* ── Institute Admin page imports ───────────────────────────── */
import InstitutionAdminOverviewPage from "../../pages/Roles/institutionadmin/InstitutionAdminOverviewPage";
import ReportSetupPage              from "../../pages/Roles/institutionadmin/ReportSetupPage";

/* ── Director's Office page imports ─────────────────────────── */
import DirectorsDashboardPage from "../../pages/Roles/directorsoffice/DirectorsDashboardPage";
import ReviewQueuePage        from "../../pages/Roles/directorsoffice/ReviewQueuePage";

/* ── Department Admin page imports ───────────────────────────── */
import DeptAdminDashboardPage from "../../pages/Roles/departmentadmin/DeptAdminDashboardPage";
import DeptUsersPage          from "../../pages/Roles/departmentadmin/DeptUsersPage";
import TaskOverviewPage       from "../../pages/Roles/departmentadmin/TaskOverviewPage";

/* ── Dept Nodal Officer page imports ─────────────────────────── */
import NodalDashboardPage    from "../../pages/Roles/departmentnodalofficer/NodalDashboardPage";
import AssignedSectionsPage  from "../../pages/Roles/departmentnodalofficer/AssignedSectionsPage";
import SubmissionsPage       from "../../pages/Roles/departmentnodalofficer/SubmissionsPage";

/* ── Finance Officer page imports ───────────────────────────── */
import FinanceOverviewPage from "../../pages/Roles/financeofficer/FinanceOverviewPage";
import EstimatesPage       from "../../pages/Roles/financeofficer/EstimatesPage";
import AuditsPage          from "../../pages/Roles/financeofficer/AuditsPage";
import BalanceSheetPage    from "../../pages/Roles/financeofficer/BalanceSheetPage";

/* ── Shared placeholder (swap for real components as built) ─── */
export function PlaceholderPage({ title, subtitle, color = "#2563eb" }) {
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: color + "14", borderRadius: 8, padding: "4px 12px", marginBottom: 12,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: 1 }}>
            {title}
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
          {title}
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        {["Total", "Active", "Pending", "Resolved"].map((label, i) => (
          <div key={label} style={{
            background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 12, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#1e293b", letterSpacing: "-1px" }}>
              {(i + 1) * 148 + 17}
            </div>
            <div style={{ fontSize: 12, color, marginTop: 6, fontWeight: 500 }}>
              ↑ {((i + 1) * 2.3).toFixed(1)}% this month
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Recent Activity</span>
          <span style={{ fontSize: 12, color, cursor: "pointer", fontWeight: 500 }}>View all →</span>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "13px 22px",
            borderBottom: i < 5 ? "1px solid rgba(0,0,0,0.04)" : "none",
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `hsl(${i * 53 + 200}, 55%, 88%)`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b", marginBottom: 2 }}>Record #{i * 100 + 43}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Updated {i} hour{i > 1 ? "s" : ""} ago</div>
            </div>
            <div style={{
              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: i % 2 === 0 ? color + "18" : "#10b98118",
              color: i % 2 === 0 ? color : "#10b981",
            }}>
              {i % 2 === 0 ? "Active" : "Done"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Super Admin placeholders ───────────────────────────────── */
const SuperAdminOverviewPage   = () => <PlaceholderPage title="Overview"    subtitle="Platform-wide summary and key metrics"                color="#2563eb" />;
const SuperAdminMasterDataPage = () => <PlaceholderPage title="Master Data" subtitle="Manage lookup values, categories, and reference data" color="#059669" />;

/* ── Institute Admin placeholders ───────────────────────────── */
const SectionsPage       = () => <PlaceholderPage title="Sections"        subtitle="Manage academic sections and groupings"         color="#0891b2" />;
const WorkflowPage       = () => <PlaceholderPage title="Workflow"        subtitle="Define and oversee institutional workflows"     color="#0891b2" />;
const TaskWorkflowPage   = () => <PlaceholderPage title="Task Workflow"   subtitle="Assign and track task-level workflow stages"    color="#0891b2" />;
const VersionControlPage = () => <PlaceholderPage title="Version Control" subtitle="Manage document versions and change history"    color="#0891b2" />;
const SystemPage         = () => <PlaceholderPage title="System"          subtitle="Institution system settings and configurations" color="#0891b2" />;

/* ══════════════════════════════════════════════════════════════
   ROLE CONFIG MAP
   ⚠️  Key must EXACTLY match user?.roles?.[0]?.name (backend value)
══════════════════════════════════════════════════════════════ */
export const ROLE_CONFIG = {

  /* ── SUPER ADMIN ──────────────────────────────────────────── */
  super_admin: {
    navItems: [
      {
        group: "",
        items: [{ id: "overview", label: "Dashboard", icon: "LayoutDashboard", permission: null }],
      },
      {
        group: "User Management",
        items: [{ id: "users", label: "Users", icon: "Users", permission: "manage_dept_users" }],
      },
      {
        group: "Dept Management",
        items: [{ id: "departments", label: "Departments", icon: "Building2", permission: "manage_departments" }],
      },
      {
        group: "Institution Management",
        items: [{ id: "institutions", label: "Institutions", icon: "University", permission: "manage_institutions" }],
      },
{
  group: "Committee Management",
  items: [{ id: "committees", label: "Committees", icon: "Users2" }],
},


      {
        group: "Access & Data",
        items: [
          { id: "role-access", label: "Role & Access Control", icon: "ShieldCheck", permission: null },
          { id: "master-data", label: "Master Data", icon: "Database", permission: "master_data" },
        ],
      },
      {
        group: "Audit",
        items: [{ id: "audit-logs", label: "Logs", icon: "ScrollText", permission: "audit_logs" }],
      },
    ],
    pages: {
      overview:      <SuperAdminOverviewPage />,
      users:         <UserManagementPage initialTab="list" />,
      departments:   <DepartmentManagementPage />,
      institutions:  <InstitutionManagementPage />,
      committees:    <CommitteeManagementPage />,
      "role-access": <RoleAccessPage />,
      "master-data": <SuperAdminMasterDataPage />,
      "audit-logs":  <AuditLogsPage />,
    },
    defaultPage: "overview",
    user: { name: "Super Admin", initials: "SA", org: "PragatiMitra HQ" },
  },

  /* ── INSTITUTE ADMIN ──────────────────────────────────────── */
  // ✅ key = "institute_admin" — matches backend exactly
  institute_admin: {
    navItems: [
      {
        group: "",
        items: [
          { id: "ia-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null },
        ],
      },
      {
        group: "Reports",
        items: [
          { id: "ia-report-setup", label: "Report Setup", icon: "FileText", permission: null },
        ],
      },
      {
        group: "Structure",
        items: [
          { id: "ia-sections", label: "Sections", icon: "Layers", permission: null },
        ],
      },
      {
        group: "Workflow",
        items: [
          { id: "ia-workflow",      label: "Workflow",      icon: "GitBranch", permission: null },
          { id: "ia-task-workflow", label: "Task Workflow", icon: "ListTodo",  permission: null },
        ],
      },
      {
        group: "Version & System",
        items: [
          { id: "ia-version-control", label: "Version Control", icon: "History",   permission: null },
          { id: "ia-system",          label: "System",          icon: "Settings2", permission: null },
        ],
      },
    ],
    pages: {
      "ia-overview":        <InstitutionAdminOverviewPage />,
      "ia-report-setup":    <ReportSetupPage />,
      "ia-sections":        <SectionsPage />,
      "ia-workflow":        <WorkflowPage />,
      "ia-task-workflow":   <TaskWorkflowPage />,
      "ia-version-control": <VersionControlPage />,
      "ia-system":          <SystemPage />,
    },
    defaultPage: "ia-overview",
    user: { name: "Institute Admin", initials: "IA", org: "PragatiMitra" },
  },

  /* ── FINANCE OFFICER ──────────────────────────────────────── */
  // ✅ key = "finance_officer" — matches backend exactly
  finance_officer: {
    navItems: [
      {
        group: "",
        items: [
          { id: "fo-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null },
        ],
      },
      {
        group: "Finance",
        items: [
          { id: "fo-estimates",     label: "Estimates",     icon: "FileSpreadsheet", permission: null },
          { id: "fo-audits",        label: "Audits",        icon: "ClipboardCheck",  permission: null },
          { id: "fo-balance-sheet", label: "Balance Sheet", icon: "Scale",           permission: null },
        ],
      },
    ],
    pages: {
      "fo-overview":      <FinanceOverviewPage />,
      "fo-estimates":     <EstimatesPage />,
      "fo-audits":        <AuditsPage />,
      "fo-balance-sheet": <BalanceSheetPage />,
    },
    defaultPage: "fo-overview",
    user: { name: "Finance Officer", initials: "FO", org: "PragatiMitra" },
  },

  /* ── DIRECTOR'S OFFICE ───────────────────────────────────────── */
  // ✅ key = "directors_office" — matches backend exactly
  directors_office: {
    navItems: [
      {
        group: "",
        items: [{ id: "do-dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: null }],
      },
      {
        group: "Review",
        items: [{ id: "do-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null }],
      },
    ],
    pages: {
      "do-dashboard":    <DirectorsDashboardPage />,
      "do-review-queue": <ReviewQueuePage />,
    },
    defaultPage: "do-dashboard",
    user: { name: "Director's Office", initials: "DO", org: "PragatiMitra Institute" },
  },

  /* ── DEPARTMENT ADMIN ─────────────────────────────────────── */
  // ✅ key = "department_admin" — matches backend exactly
  department_admin: {
    navItems: [
      {
        group: "",
        items: [{ id: "da-dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: null }],
      },
      {
        group: "Users",
        items: [{ id: "da-users", label: "Department Users", icon: "Users", permission: null }],
      },
      {
        group: "Tasks",
        items: [{ id: "da-tasks", label: "Task Overview", icon: "ListChecks", permission: null }],
      },
    ],
    pages: {
      "da-dashboard": <DeptAdminDashboardPage />,
      "da-users":     <DeptUsersPage />,
      "da-tasks":     <TaskOverviewPage />,
    },
    defaultPage: "da-dashboard",
    user: { name: "Department Admin", initials: "DA", org: "Samhita Siddhanta" },
  },

  /* ── DEPARTMENT NODAL OFFICER ─────────────────────────────── */
  // ✅ key = "department_nodal_officer" — matches backend exactly
  department_nodal_officer: {
    navItems: [
      {
        group: "",
        items: [{ id: "dno-dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: null }],
      },
      {
        group: "Sections",
        items: [{ id: "dno-sections", label: "Assigned Sections", icon: "FileEdit", permission: null }],
      },
      {
        group: "Submissions",
        items: [{ id: "dno-submissions", label: "Submissions", icon: "Send", permission: null }],
      },
    ],
    pages: {
      "dno-dashboard":   <NodalDashboardPage />,
      "dno-sections":    <AssignedSectionsPage />,
      "dno-submissions": <SubmissionsPage />,
    },
    defaultPage: "dno-dashboard",
    user: { name: "Nodal Officer", initials: "NO", org: "Samhita Siddhanta" },
  },

  /* ── FALLBACK ───────────────────────────────────────────────── */
  __fallback__: {
    navItems: [
      { group: "", items: [{ id: "home", label: "Home", icon: "Home" }] },
    ],
    pages: {
      home: (
        <div style={{ padding: 40, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <h2 style={{ color: "#1e293b" }}>Access Restricted</h2>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>
            Your role does not have a configured dashboard. Please contact your administrator.
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
 * Falls back to __fallback__ and warns in console if role not found.
 */
export function getRoleConfig(role) {
  if (role && !ROLE_CONFIG[role]) {
    console.warn(
      `[getRoleConfig] No config found for role "${role}". ` +
      `Available: ${Object.keys(ROLE_CONFIG).filter(k => k !== "__fallback__").join(", ")}. ` +
      `Using __fallback__.`
    );
  }
  return ROLE_CONFIG[role] ?? ROLE_CONFIG["__fallback__"];
}