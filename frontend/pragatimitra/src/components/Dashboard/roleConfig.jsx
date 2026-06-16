/**
 * roleConfig.jsx
 * ─────────────────────────────────────────────────────────────
 * Central config that maps each role → { navItems, pages }
 *
 * Every nav item carries a `slug` — the role-agnostic, top-level
 * URL path (e.g. /user-management, /overview) used by SlugRoute
 * (see src/router/SlugRoute.jsx) and collectRouteSlugs() in
 * src/router/dashboardRoutes.jsx. The same slug can be shared by
 * multiple roles; `id` is the per-role internal key used to look up
 * the page element in `pages` and for permission checks.
 *
 * HOW TO ADD A NEW ROLE (when backend sends a new role string):
 *   1. Create page component in pages/<role>/YourPage.jsx
 *   2. Import it below
 *   3. Add a new key to ROLE_CONFIG — key MUST exactly match
 *      user?.roles?.[0]?.name from the backend.
 *   4. Add a unique `slug` to every nav item — dashboardRoutes.jsx
 *      generates the route tree automatically from this config, and
 *      AuthContext's ROLE_ROUTES derives the role's default path via
 *      getRoleDefaultSlug().
 *   Done — RootLayout picks it up automatically.
 * ─────────────────────────────────────────────────────────────
 */

import React from "react";
import PlaceholderPage from "../shared/PlaceholderPage";

/* ── Collaborative Report Builder ──────────────────────────── */
import ReportBuilderListPage        from "../../pages/Roles/shared/builder/ReportBuilderListPage";
import MyAssignedSectionsPage       from "../../pages/Roles/shared/builder/MyAssignedSectionsPage";
import TemplateListPage              from "../../pages/Roles/shared/builder/TemplateListPage";

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
import ReportCyclePage                  from "../../pages/Roles/institutionadmin/ReportCyclePage";
import WorkflowTemplatePage             from "../../pages/Roles/institutionadmin/WorkflowTemplatePage";
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

/* ── Shared subRoute arrays (de-duplicated by collectRouteSlugs) ── */
const REPORT_BUILDER_SUB = [
  { path: "report-builder/create",    element: <ReportBuilderListPage /> },
  { path: "report-builder/structure", element: <ReportBuilderListPage /> },
  { path: "report-builder/editor",    element: <ReportBuilderListPage /> },
  { path: "report-builder/assign",    element: <ReportBuilderListPage /> },
  { path: "report-builder/compile",   element: <ReportBuilderListPage /> },
  { path: "report-builder/dashboard", element: <ReportBuilderListPage /> },
  { path: "report-builder/review",    element: <ReportBuilderListPage /> },
];

const MY_SECTIONS_SUB = [
  { path: "my-sections/edit", element: <MyAssignedSectionsPage /> },
];

const ASSIGNED_SECTIONS_SUB = [
  { path: "assigned-sections/edit", element: <MyAssignedSectionsPage /> },
];

const REVIEW_QUEUE_SUB = [
  { path: "review-queue/review", element: <ReviewQueuePage /> },
];

const FORM_MGMT_INSTITUTE_SUB = [
  { path: "form-management/create",  element: <InstituteFormManagementPage /> },
  { path: "form-management/edit",    element: <InstituteFormManagementPage /> },
  { path: "form-management/records", element: <InstituteFormManagementPage /> },
];

const FORM_MGMT_DEPT_SUB = [
  { path: "form-management/create",  element: <DepartmentFormManagementPage /> },
  { path: "form-management/edit",    element: <DepartmentFormManagementPage /> },
  { path: "form-management/records", element: <DepartmentFormManagementPage /> },
];

const FORM_FILL_SUB = [
  { path: "form-management/records", element: <DepartmentFormFillPage /> },
];

const FORM_DATA_SUB = [
  { path: "form-data/records", element: <FormDataPage /> },
];

const KPI_INSTITUTE_SUB = [
  { path: "kpi-management/create", element: <InstituteKpiPage /> },
  { path: "kpi-management/edit",   element: <InstituteKpiPage /> },
];

const KPI_DEPT_SUB = [
  { path: "kpi-management/create", element: <DeptKpiPage /> },
  { path: "kpi-management/edit",   element: <DeptKpiPage /> },
];

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
            slug: "overview",
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
            slug: "user-management",
            subRoutes: [
              { path: "user-management/create", element: <UserManagementPage /> },
              { path: "user-management/edit",   element: <UserManagementPage /> },
              { path: "user-management/import", element: <UserManagementPage /> },
            ],
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
            slug: "department-management",
            subRoutes: [
              { path: "department-management/create", element: <DepartmentManagementPage /> },
              { path: "department-management/edit",   element: <DepartmentManagementPage /> },
              { path: "department-management/import", element: <DepartmentManagementPage /> },
            ],
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
            slug: "institute-management",
            subRoutes: [
              { path: "institute-management/create", element: <InstitutionManagementPage /> },
              { path: "institute-management/edit",   element: <InstitutionManagementPage /> },
              { path: "institute-management/import", element: <InstitutionManagementPage /> },
            ],
          },
        ],
      },
      {
        group: "Committee Management",
        items: [{
          id: "committees", label: "Committees", icon: "Users2", slug: "committee-management",
          subRoutes: [
            { path: "committee-management/create", element: <CommitteeManagementPage /> },
            { path: "committee-management/edit",   element: <CommitteeManagementPage /> },
          ],
        }],
      },

      {
        group: "Access & Data",
        items: [
          {
            id: "role-access",
            label: "Role & Access Control",
            icon: "ShieldCheck",
            permission: null,
            slug: "role-access",
            subRoutes: [
              { path: "role-access/create", element: <RoleAccessPage /> },
              { path: "role-access/edit",   element: <RoleAccessPage /> },
            ],
          },
          {
            id: "master-data",
            label: "Master Data",
            icon: "Database",
            permission: "master_data",
            slug: "master-data",
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
            slug: "audit-logs",
          },
        ],
      },
      {
        group: "Reports",
        items: [
          { id: "report-builder", label: "Report Builder", icon: "BookOpen",  permission: null, slug: "report-builder", subRoutes: REPORT_BUILDER_SUB },
          { id: "sa-my-sections", label: "My Sections",    icon: "FileEdit",  permission: null, slug: "my-sections",    subRoutes: MY_SECTIONS_SUB },
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
            slug: "overview",
          },
        ],
      },
      {
        group: "User Management",
        items: [
          // Gated on the real permission key. Institute Admin has
          // manage_dept_users=false in the DB, so this stays hidden —
          // it must NOT leak the Super-Admin-style "User Management" menu.
          { id: "ia-users", label: "Users", icon: "Users", permission: "manage_dept_users", slug: "user-management",
            subRoutes: [
              { path: "user-management/create", element: <InstituteAdminUserManagementPage /> },
              { path: "user-management/edit",   element: <InstituteAdminUserManagementPage /> },
            ],
          },
        ],
      },
      {
        group: "Dept Management",
        items: [
          // Gated on the real permission key. Institute Admin has
          // manage_departments=false in the DB, so this stays hidden.
          { id: "ia-departments",  label: "Departments", icon: "Building2", permission: "manage_departments", slug: "department-management" },
        ],
      },
      {
        group: "Forms",
        items: [
          { id: "ia-form-management", label: "Form Management", icon: "ClipboardList", permission: null, slug: "form-management", subRoutes: FORM_MGMT_INSTITUTE_SUB },
        ],
      },
      {
        group: "Reports",
        items: [
          { id: "ia-report-cycles",   label: "Report Cycles",   icon: "CalendarDays",  permission: null },
          { id: "ia-report-setup",    label: "Report Setup",    icon: "FileText",      permission: null, slug: "report-management" },
          { id: "ia-kpi",             label: "KPI Charts",      icon: "BarChart2",     permission: null, slug: "kpi-management",  subRoutes: KPI_INSTITUTE_SUB },
          { id: "ia-report-builder",  label: "Report Builder",  icon: "BookOpen",      permission: null, slug: "report-builder",  subRoutes: REPORT_BUILDER_SUB },
          { id: "ia-my-sections",     label: "My Sections",     icon: "FileEdit",      permission: null, slug: "my-sections",     subRoutes: MY_SECTIONS_SUB },
          { id: "ia-review-queue",    label: "Review Queue",    icon: "ClipboardList", permission: null, slug: "review-queue",    subRoutes: REVIEW_QUEUE_SUB },
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
            slug: "sections",
          },
        ],
      },
      {
        group: "Workflow",
        items: [
          {
            id: "ia-workflow-templates",
            label: "Workflow Templates",
            icon: "GitBranch",
            permission: null,
          },
          {
            id: "ia-workflow",
            label: "Workflow",
            icon: "Network",
            permission: null,
            slug: "workflow",
          },
          {
            id: "ia-task-workflow",
            label: "Task Workflow",
            icon: "ListTodo",
            permission: null,
            slug: "task-workflow",
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
            slug: "version-control",
          },
          {
            id: "ia-system",
            label: "System",
            icon: "Settings2",
            permission: null,
            slug: "system",
          },
        ],
      },
    ],
    pages: {
      "ia-overview":          <InstitutionAdminOverviewPage />,
      "ia-users":             <InstituteAdminUserManagementPage />,
      "ia-departments":       <InstituteAdminDepartmentPage />,
      "ia-form-management":   <InstituteFormManagementPage />,
      "ia-report-cycles":     <ReportCyclePage />,
      "ia-report-setup":      <ReportSetupPage />,
      "ia-kpi":               <InstituteKpiPage />,
      "ia-report-builder":    <ReportBuilderListPage />,
      "ia-my-sections":       <MyAssignedSectionsPage />,
      "ia-review-queue":      <ReviewQueuePage />,
      "ia-sections":              <SectionsPage />,
      "ia-workflow-templates":    <WorkflowTemplatePage />,
      "ia-workflow":              <WorkflowPage />,
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
            slug: "overview",
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
            slug: "estimates",
            subRoutes: [
              { path: "estimates/new",  element: <EstimatesPage /> },
              { path: "estimates/edit", element: <EstimatesPage /> },
            ],
          },
          {
            id: "fo-balance-sheet",
            label: "Balance Sheet",
            icon: "Scale",
            permission: null,
            slug: "balance-sheet",
            subRoutes: [
              { path: "balance-sheet/new",    element: <BalanceSheetPage /> },
              { path: "balance-sheet/detail", element: <BalanceSheetPage /> },
            ],
          },
        ],
      },
      {
        group: "Report Sections",
        items: [
          { id: "fo-my-sections", label: "My Sections", icon: "FileEdit", permission: null, slug: "my-sections", subRoutes: MY_SECTIONS_SUB },
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
            slug: "overview",
          },
        ],
      },
      {
        group: "Review",
        items: [
          { id: "do-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null, slug: "review-queue", subRoutes: REVIEW_QUEUE_SUB },
          { id: "do-my-sections",  label: "My Sections",  icon: "FileEdit",      permission: null, slug: "my-sections",  subRoutes: MY_SECTIONS_SUB },
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
            slug: "overview",
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
            slug: "user-management",
            subRoutes: [
              { path: "user-management/create", element: <DeptUsersPage /> },
              { path: "user-management/edit",   element: <DeptUsersPage /> },
            ],
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
            slug: "task-overview",
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
            slug: "kpi-management",
            subRoutes: KPI_DEPT_SUB,
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
            slug: "form-management",
            subRoutes: FORM_MGMT_DEPT_SUB,
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
            slug: "form-data",
            subRoutes: FORM_DATA_SUB,
          },
        ],
      },
      {
        group: "Report Sections",
        items: [
          { id: "da-my-sections",  label: "My Sections",  icon: "FileEdit",      permission: null, slug: "my-sections",  subRoutes: MY_SECTIONS_SUB },
          { id: "da-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null, slug: "review-queue", subRoutes: REVIEW_QUEUE_SUB },
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
            slug: "overview",
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
            slug: "assigned-sections",
            subRoutes: ASSIGNED_SECTIONS_SUB,
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
            slug: "submissions",
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
            slug: "form-management",
            subRoutes: FORM_FILL_SUB,
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
          { id: "c-sections", label: "My Sections", icon: "FileEdit", permission: null, slug: "my-sections", subRoutes: MY_SECTIONS_SUB },
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
          { id: "rv-sections",     label: "My Sections",  icon: "FileEdit",      permission: null, slug: "my-sections",  subRoutes: MY_SECTIONS_SUB },
          { id: "rv-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null, slug: "review-queue", subRoutes: REVIEW_QUEUE_SUB },
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
          { id: "hod-sections",     label: "My Sections",  icon: "FileEdit",      permission: null, slug: "my-sections",  subRoutes: MY_SECTIONS_SUB },
          { id: "hod-review-queue", label: "Review Queue", icon: "ClipboardList", permission: null, slug: "review-queue", subRoutes: REVIEW_QUEUE_SUB },
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
          { id: "pc-sections",         label: "My Sections",      icon: "FileEdit",   permission: null },
        ],
      },
      {
        group: "Templates",
        items: [
          { id: "pc-templates",        label: "Templates",        icon: "LayoutList", permission: null, slug: "my-sections", subRoutes: MY_SECTIONS_SUB },
        ],
      },
    ],
    pages: {
      "pc-sections":        <MyAssignedSectionsPage />,
      "pc-templates": <TemplateListPage />,
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
      { group: "", items: [{ id: "ha-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null, slug: "overview" }] },
      { group: "Forms", items: [{ id: "ha-form-data", label: "Forms & Data Entry", icon: "ClipboardList", permission: null, slug: "form-data", subRoutes: FORM_DATA_SUB }] },
      { group: "Reports", items: [{ id: "ha-report-setup", label: "Reports", icon: "FileText", permission: null, slug: "report-management" }] },
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
      { group: "", items: [{ id: "fa-overview", label: "Dashboard", icon: "LayoutDashboard", permission: null, slug: "overview" }] },
      { group: "Forms", items: [{ id: "fa-form-data", label: "Forms & Data Entry", icon: "ClipboardList", permission: null, slug: "form-data", subRoutes: FORM_DATA_SUB }] },
      { group: "Reports", items: [{ id: "fa-report-setup", label: "Reports", icon: "FileText", permission: null, slug: "report-management" }] },
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
        items: [{ id: "fb-sections", label: "My Sections", icon: "FileEdit", slug: "my-sections", subRoutes: MY_SECTIONS_SUB }],
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

/**
 * getRoleDefaultSlug(role)
 * The URL slug a role lands on by default (e.g. "overview", "my-sections") —
 * used for the root redirect and as the fallback target for the permission
 * guard in SlugRoute.
 */
export function getRoleDefaultSlug(role) {
  const config = getRoleConfig(role);
  const allItems = config.navItems.flatMap((group) => group.items);
  const item = allItems.find((i) => i.id === config.defaultPage) || allItems[0];
  return item?.slug ?? "my-sections";
}
