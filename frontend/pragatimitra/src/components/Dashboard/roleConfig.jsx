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
import PlaceholderPage from "../shared/PlaceholderPage";

/* ── Collaborative Report Builder ──────────────────────────── */
import ReportBuilderListPage  from "../../pages/Roles/shared/builder/ReportBuilderListPage";
import MyAssignedSectionsPage from "../../pages/Roles/shared/builder/MyAssignedSectionsPage";

/* ── Super Admin page imports ───────────────────────────────── */
import SuperAdminOverviewPage    from "../../pages/Roles/superadmin/SuperAdminOverviewPage";
import UserManagementPage        from "../../pages/Roles/superadmin/UserManagementPage";
import AuditLogsPage             from "../../pages/Roles/superadmin/AuditLogsPage";
import DepartmentManagementPage  from "../../pages/Roles/superadmin/DepartmentManagementPage";
import InstitutionManagementPage from "../../pages/Roles/superadmin/InstitutionManagementPage";
import CommitteeManagementPage   from "../../pages/Roles/superadmin/CommitteesManagementPage";
import RoleAccessPage            from "../../pages/Roles/superadmin/RoleAccessPage";

/* ── Institute Admin page imports ───────────────────────────── */
import InstitutionAdminOverviewPage     from "../../pages/Roles/institutionadmin/InstitutionAdminOverviewPage";
import ReportSetupPage                  from "../../pages/Roles/institutionadmin/ReportSetupPage";
import InstituteAdminUserManagementPage from "../../pages/Roles/institutionadmin/InstituteAdminUserManagementPage";
import InstituteAdminDepartmentPage     from "../../pages/Roles/institutionadmin/InstituteAdminDepartmentPage";
import InstituteKpiPage                  from "../../pages/Roles/institutionadmin/InstituteKpiPage";
import InstituteFormManagementPage      from "../../pages/Forms/InstituteFormManagementPage";
import DeptKpiPage                       from "../../pages/Roles/departmentadmin/DeptKpiPage";

/* ── Director's Office page imports ─────────────────────────── */
import DirectorsDashboardPage from "../../pages/Roles/directorsoffice/DirectorsDashboardPage";
import ReviewQueuePage        from "../../pages/Roles/directorsoffice/ReviewQueuePage";

/* ── Department Admin page imports ───────────────────────────── */
import DeptAdminDashboardPage from "../../pages/Roles/departmentadmin/DeptAdminDashboardPage";
import DeptUsersPage          from "../../pages/Roles/departmentadmin/DeptUsersPage";
import TaskOverviewPage       from "../../pages/Roles/departmentadmin/TaskOverviewPage";
import FormDataPage           from "../../pages/Forms/FormDataPage";
import DepartmentFormManagementPage from "../../pages/Forms/DepartmentFormManagementPage";

/* ── Dept Nodal Officer page imports ─────────────────────────── */
import NodalDashboardPage    from "../../pages/Roles/departmentnodalofficer/NodalDashboardPage";
import AssignedSectionsPage  from "../../pages/Roles/departmentnodalofficer/AssignedSectionsPage";
import SubmissionsPage       from "../../pages/Roles/departmentnodalofficer/SubmissionsPage";
import DepartmentFormFillPage from "../../pages/Forms/DepartmentFormFillPage";

/* ── Finance Officer page imports ───────────────────────────── */
import FinanceOverviewPage from "../../pages/Roles/financeofficer/FinanceOverviewPage";
import EstimatesPage       from "../../pages/Roles/financeofficer/EstimatesPage";
import BalanceSheetPage    from "../../pages/Roles/financeofficer/BalanceSheetPage";


/* ── Re-export so existing imports of PlaceholderPage from this file still work ── */
export { default as PlaceholderPage } from "../shared/PlaceholderPage";

/* ── Super Admin placeholders ───────────────────────────────── */
const SuperAdminMasterDataPage = () => <PlaceholderPage title="Master Data" subtitle="Manage lookup values, categories, and reference data" color="#2563eb" />;

/* ── Institute Admin placeholders ───────────────────────────── */
const SectionsPage       = () => <PlaceholderPage title="Sections"        subtitle="Manage academic sections and groupings"         color="#2563eb" />;
const WorkflowPage       = () => <PlaceholderPage title="Workflow"        subtitle="Define and oversee institutional workflows"     color="#2563eb" />;
const TaskWorkflowPage   = () => <PlaceholderPage title="Task Workflow"   subtitle="Assign and track task-level workflow stages"    color="#2563eb" />;
const VersionControlPage = () => <PlaceholderPage title="Version Control" subtitle="Manage document versions and change history"    color="#2563eb" />;
const SystemPage         = () => <PlaceholderPage title="System"          subtitle="Institution system settings and configurations" color="#2563eb" />;

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
        items: [
          {
            id: "overview",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "User Management",
        items: [
          {
            id: "users",
            label: "Users",
            icon: "Users",
            permission: "manage_dept_users",
          },
        ],
      },
      {
        group: "Dept Management",
        items: [
          {
            id: "departments",
            label: "Departments",
            icon: "Building2",
            permission: "manage_departments",
          },
        ],
      },
      {
        group: "Institution Management",
        items: [
          {
            id: "institutions",
            label: "Institutions",
            icon: "University",
            permission: "manage_institutions",
          },
        ],
      },
      {
        group: "Committee Management",
        items: [{ id: "committees", label: "Committees", icon: "Users2" }],
      },

      {
        group: "Access & Data",
        items: [
          {
            id: "role-access",
            label: "Role & Access Control",
            icon: "ShieldCheck",
            permission: null,
          },
          {
            id: "master-data",
            label: "Master Data",
            icon: "Database",
            permission: "master_data",
          },
        ],
      },
      {
        group: "Audit",
        items: [
          {
            id: "audit-logs",
            label: "Logs",
            icon: "ScrollText",
            permission: "audit_logs",
          },
        ],
      },
      {
        group: "Reports",
        items: [
          { id: "report-builder", label: "Report Builder", icon: "BookOpen",  permission: null },
          { id: "sa-my-sections", label: "My Sections",    icon: "FileEdit",  permission: null },
        ],
      },
    ],
    pages: {
      overview: <SuperAdminOverviewPage />,
      users: <UserManagementPage initialTab="list" />,
      departments: <DepartmentManagementPage />,
      institutions: <InstitutionManagementPage />,
      committees: <CommitteeManagementPage />,
      "role-access": <RoleAccessPage />,
      "master-data": <SuperAdminMasterDataPage />,
      "audit-logs":     <AuditLogsPage />,
      "report-builder": <ReportBuilderListPage />,
      "sa-my-sections": <MyAssignedSectionsPage />,
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
          {
            id: "ia-overview",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "User Management",
        items: [
          // Gated on the real permission key. Institute Admin has
          // manage_dept_users=false in the DB, so this stays hidden —
          // it must NOT leak the Super-Admin-style "User Management" menu.
          { id: "ia-users",        label: "Users",       icon: "Users",     permission: "manage_dept_users" },
        ],
      },
      {
        group: "Dept Management",
        items: [
          // Gated on the real permission key. Institute Admin has
          // manage_departments=false in the DB, so this stays hidden.
          { id: "ia-departments",  label: "Departments", icon: "Building2", permission: "manage_departments" },
        ],
      },
      {
        group: "Forms",
        items: [
          { id: "ia-form-management", label: "Form Management", icon: "ClipboardList", permission: null },
        ],
      },
      {
        group: "Reports",
        items: [
          { id: "ia-report-setup",    label: "Report Setup",    icon: "FileText",      permission: null },
          { id: "ia-kpi",             label: "KPI Charts",      icon: "BarChart2",     permission: null },
          { id: "ia-report-builder",  label: "Report Builder",  icon: "BookOpen",      permission: null },
          { id: "ia-my-sections",     label: "My Sections",     icon: "FileEdit",      permission: null },
          { id: "ia-review-queue",    label: "Review Queue",    icon: "ClipboardList", permission: null },
        ],
      },
      {
        group: "Structure",
        items: [
          {
            id: "ia-sections",
            label: "Sections",
            icon: "Layers",
            permission: null,
          },
        ],
      },
      {
        group: "Workflow",
        items: [
          {
            id: "ia-workflow",
            label: "Workflow",
            icon: "GitBranch",
            permission: null,
          },
          {
            id: "ia-task-workflow",
            label: "Task Workflow",
            icon: "ListTodo",
            permission: null,
          },
        ],
      },
      {
        group: "Version & System",
        items: [
          {
            id: "ia-version-control",
            label: "Version Control",
            icon: "History",
            permission: null,
          },
          {
            id: "ia-system",
            label: "System",
            icon: "Settings2",
            permission: null,
          },
        ],
      },
    ],
    pages: {
      "ia-overview":          <InstitutionAdminOverviewPage />,
      "ia-users":             <InstituteAdminUserManagementPage />,
      "ia-departments":       <InstituteAdminDepartmentPage />,
      "ia-form-management":   <InstituteFormManagementPage />,
      "ia-report-setup":      <ReportSetupPage />,
      "ia-kpi":               <InstituteKpiPage />,
      "ia-report-builder":    <ReportBuilderListPage />,
      "ia-my-sections":       <MyAssignedSectionsPage />,
      "ia-review-queue":      <ReviewQueuePage />,
      "ia-sections":          <SectionsPage />,
      "ia-workflow":          <WorkflowPage />,
      "ia-task-workflow":     <TaskWorkflowPage />,
      "ia-version-control": <VersionControlPage />,
      "ia-system": <SystemPage />,
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
          {
            id: "fo-overview",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "Finance",
        items: [
          {
            id: "fo-estimates",
            label: "Estimates",
            icon: "FileSpreadsheet",
            permission: null,
          },
          {
            id: "fo-balance-sheet",
            label: "Balance Sheet",
            icon: "Scale",
            permission: null,
          },
        ],
      },
      {
        group: "Report Sections",
        items: [
          { id: "fo-my-sections", label: "My Sections", icon: "FileEdit", permission: null },
        ],
      },
    ],
    pages: {
      "fo-overview":      <FinanceOverviewPage />,
      "fo-estimates":     <EstimatesPage />,
      "fo-balance-sheet": <BalanceSheetPage />,
      "fo-my-sections":   <MyAssignedSectionsPage />,
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
        items: [
          {
            id: "do-dashboard",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "Review",
        items: [
          { id: "do-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null },
          { id: "do-my-sections",  label: "My Sections",  icon: "FileEdit",      permission: null },
        ],
      },
    ],
    pages: {
      "do-dashboard":    <DirectorsDashboardPage />,
      "do-review-queue": <ReviewQueuePage />,
      "do-my-sections":  <MyAssignedSectionsPage />,
    },
    defaultPage: "do-dashboard",
    user: {
      name: "Director's Office",
      initials: "DO",
      org: "PragatiMitra Institute",
    },
  },

  /* ── DEPARTMENT ADMIN ─────────────────────────────────────── */
  // ✅ key = "department_admin" — matches backend exactly
  department_admin: {
    navItems: [
      {
        group: "",
        items: [
          {
            id: "da-dashboard",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "Users",
        items: [
          {
            id: "da-users",
            label: "Department Users",
            icon: "Users",
            permission: null,
          },
        ],
      },
      {
        group: "Tasks",
        items: [
          {
            id: "da-tasks",
            label: "Task Overview",
            icon: "ListChecks",
            permission: null,
          },
        ],
      },
      {
        group: "Reports",
        items: [
          {
            id: "da-kpi",
            label: "KPI Charts",
            icon: "BarChart2",
            permission: null,
          },
        ],
      },
      {
        group: "Forms",
        items: [
          {
            id: "da-dept-forms",
            label: "Department Forms",
            icon: "FileStack",
            permission: null,
          },
        ],
      },
      {
        group: "Data Entry",
        items: [
          {
            id: "da-form-data",
            label: "Form Data",
            icon: "ClipboardList",
            permission: null,
          },
        ],
      },
      {
        group: "Report Sections",
        items: [
          { id: "da-my-sections",  label: "My Sections",  icon: "FileEdit",      permission: null },
          { id: "da-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null },
        ],
      },
    ],
    pages: {
      "da-dashboard":    <DeptAdminDashboardPage />,
      "da-users":        <DeptUsersPage />,
      "da-tasks":        <TaskOverviewPage />,
      "da-kpi":          <DeptKpiPage />,
      "da-dept-forms":   <DepartmentFormManagementPage />,
      "da-form-data":    <FormDataPage />,
      "da-my-sections":  <MyAssignedSectionsPage />,
      "da-review-queue": <ReviewQueuePage />,
    },
    defaultPage: "da-dashboard",
    user: {
      name: "Department Admin",
      initials: "DA",
      org: "Samhita Siddhanta",
    },
  },

  /* ── DEPARTMENT NODAL OFFICER ─────────────────────────────── */
  // ✅ key = "department_nodal_officer" — matches backend exactly
  nodal_officer: {
    navItems: [
      {
        group: "",
        items: [
          {
            id: "dno-dashboard",
            label: "Dashboard",
            icon: "LayoutDashboard",
            permission: null,
          },
        ],
      },
      {
        group: "Sections",
        items: [
          {
            id: "dno-sections",
            label: "Assigned Sections",
            icon: "FileEdit",
            permission: null,
          },
        ],
      },
      {
        group: "Submissions",
        items: [
          {
            id: "dno-submissions",
            label: "Submissions",
            icon: "Send",
            permission: null,
          },
        ],
      },
      {
        group: "Forms",
        items: [
          {
            id: "dno-dept-forms",
            label: "Department Forms",
            icon: "FileStack",
            permission: null,
          },
        ],
      },
    ],
    pages: {
      "dno-dashboard":   <NodalDashboardPage />,
      "dno-sections":    <MyAssignedSectionsPage />,
      "dno-submissions": <SubmissionsPage />,
      "dno-dept-forms":  <DepartmentFormFillPage />,
    },
    defaultPage: "dno-dashboard",
    user: { name: "Nodal Officer", initials: "NO", org: "Samhita Siddhanta" },
  },

  /* ── CONTRIBUTOR ─────────────────────────────────────────────── */
  contributor: {
    navItems: [
      {
        group: "My Work",
        items: [
          { id: "c-sections", label: "My Sections", icon: "FileEdit", permission: null },
        ],
      },
    ],
    pages: {
      "c-sections": <MyAssignedSectionsPage />,
    },
    defaultPage: "c-sections",
    user: { name: "Contributor", initials: "CT", org: "PragatiMitra" },
  },

  /* ── REVIEWER ────────────────────────────────────────────────── */
  reviewer: {
    navItems: [
      {
        group: "My Work",
        items: [
          { id: "rv-sections",     label: "My Sections",  icon: "FileEdit",      permission: null },
          { id: "rv-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null },
        ],
      },
    ],
    pages: {
      "rv-sections":     <MyAssignedSectionsPage />,
      "rv-review-queue": <ReviewQueuePage />,
    },
    defaultPage: "rv-sections",
    user: { name: "Reviewer", initials: "RV", org: "PragatiMitra" },
  },

  /* ── HEAD OF DEPARTMENT ──────────────────────────────────────── */
  head_of_department: {
    navItems: [
      {
        group: "My Work",
        items: [
          { id: "hod-sections",     label: "My Sections",  icon: "FileEdit",      permission: null },
          { id: "hod-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null },
        ],
      },
    ],
    pages: {
      "hod-sections":     <MyAssignedSectionsPage />,
      "hod-review-queue": <ReviewQueuePage />,
    },
    defaultPage: "hod-sections",
    user: { name: "Head of Department", initials: "HD", org: "PragatiMitra" },
  },

  /* ── PUBLICATION CELL ────────────────────────────────────────── */
  publication_cell: {
    navItems: [
      {
        group: "My Work",
        items: [
          { id: "pc-sections", label: "My Sections", icon: "FileEdit", permission: null },
        ],
      },
    ],
    pages: {
      "pc-sections": <MyAssignedSectionsPage />,
    },
    defaultPage: "pc-sections",
    user: { name: "Publication Cell", initials: "PC", org: "PragatiMitra" },
  },

  /* ── HOSPITAL ADMIN ──────────────────────────────────────────────
     CONSUMER role: data entry only. Reuses the existing Institute Admin pages
     (one dashboard, one sidebar, one engine) — the nav deliberately OMITS Form
     Management (create/schema/share/archive/lock), which stays Institution-Admin
     only. Backend filters everything to form_domain = 'hospital'. */
  hospital_admin: {
    navItems: [
      { group: "", items: [{ id: "ha-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null }] },
      { group: "Forms", items: [{ id: "ha-form-data", label: "Forms & Data Entry", icon: "ClipboardList", permission: null }] },
      { group: "Reports", items: [{ id: "ha-report-setup", label: "Reports", icon: "FileText", permission: null }] },
    ],
    pages: {
      "ha-overview":     <InstitutionAdminOverviewPage />,
      "ha-form-data":    <FormDataPage />,
      "ha-report-setup": <ReportSetupPage />,
    },
    defaultPage: "ha-overview",
    user: { name: "Hospital Admin", initials: "HA", org: "PragatiMitra" },
  },

  /* ── FINANCE ADMIN ───────────────────────────────────────────────
     CONSUMER role: data entry only. Same as Hospital Admin; backend filters to
     form_domain = 'finance'. Form Management is intentionally omitted. */
  finance_admin: {
    navItems: [
      { group: "", items: [{ id: "fa-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null }] },
      { group: "Forms", items: [{ id: "fa-form-data", label: "Forms & Data Entry", icon: "ClipboardList", permission: null }] },
      { group: "Reports", items: [{ id: "fa-report-setup", label: "Reports", icon: "FileText", permission: null }] },
    ],
    pages: {
      "fa-overview":     <InstitutionAdminOverviewPage />,
      "fa-form-data":    <FormDataPage />,
      "fa-report-setup": <ReportSetupPage />,
    },
    defaultPage: "fa-overview",
    user: { name: "Finance Admin", initials: "FA", org: "PragatiMitra" },
  },

  /* ── FALLBACK ───────────────────────────────────────────────────
     Safety net: any unrecognised role still sees My Sections so
     assigned users are never locked out of their work.
  ─────────────────────────────────────────────────────────────── */
  __fallback__: {
    navItems: [
      {
        group: "My Work",
        items: [{ id: "fb-sections", label: "My Sections", icon: "FileEdit" }],
      },
    ],
    pages: {
      "fb-sections": <MyAssignedSectionsPage />,
    },
    defaultPage: "fb-sections",
    user: { name: "User", initials: "U", org: "" },
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