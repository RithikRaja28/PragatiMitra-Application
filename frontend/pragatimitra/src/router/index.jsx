import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { useEffect, lazy } from "react";

import RootLayout     from "../layouts/RootLayout";
import AuthLayout     from "../layouts/AuthLayout/Authlayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth, ROLE_ROUTES } from "../store/AuthContext";

/* ── RootRedirect ─────────────────────────────────────────────
   Mounted at index "/" inside protected tree.
   Waits for user then navigates to their role dashboard.
   ProtectedRoute already handles loading + unauthenticated cases,
   so by the time RootRedirect renders, user is guaranteed to exist.
─────────────────────────────────────────────────────────────── */
function RootRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const role  = (user.roleName || "").toLowerCase();
    const route = user.mustChangePassword
      ? "/change-password"
      : (ROLE_ROUTES[role] || "/dashboard");
    console.log("[RootRedirect] navigating to:", route);
    navigate(route, { replace: true });
  }, [user, navigate]);

  // Render nothing — redirect happens in useEffect
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#6B7280",
      fontSize: "15px",
      fontFamily: "sans-serif",
    }}>
      Redirecting…
    </div>
  );
}

/* ── Pages ── */
const Home      = lazy(() => import("../pages/Home"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Reports   = lazy(() => import("../pages/Reports"));
const Login     = lazy(() => import("../pages/Login/Login"));
const NotFound  = lazy(() => import("../pages/NotFound"));

const placeholder = (title) => lazy(() =>
  Promise.resolve({
    default: () => (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h2>{title}</h2>
      </div>
    ),
  })
);

const SuperAdminDash      = placeholder("Super Admin Dashboard");
const InstituteAdminDash  = placeholder("Institute Admin Dashboard");
const PublicationCellDash = placeholder("Publication Cell Dashboard");
const DepartmentAdminDash = placeholder("Department Admin Dashboard");
const HODDashboard        = placeholder("Head of Department Dashboard");
const NodalOfficerDash    = placeholder("Nodal Officer Dashboard");
const ContributorDash     = placeholder("Contributor Dashboard");
const ReviewerDash        = placeholder("Reviewer Dashboard");
const FinanceOfficerDash  = placeholder("Finance Officer Dashboard");
const DirectorsOfficeDash = placeholder("Director's Office Dashboard");
const Unauthorized        = placeholder("403 — Access Denied");

const router = createBrowserRouter([

  // Redirect root to login
  { index: true, path: '/', element: <Navigate to="/login" replace /> },

  // Auth routes (login, etc.)
  /* ── Public: Auth pages ── */
  {
    element: <AuthLayout />,
    children: [
      { path: "login", element: <Login /> },
    ],
  },

  /* ── Protected: All pages that require login ── */
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <RootLayout />,
        children: [
          /* "/" → RootRedirect sends user to their role dashboard */
          { index: true, element: <RootRedirect /> },

          { path: "dashboard", element: <Dashboard /> },
          { path: "reports",   element: <Reports /> },

          {
            element: <ProtectedRoute allowedRoles={["Super Admin"]} />,
            children: [{ path: "dashboard/super-admin", element: <SuperAdminDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Institute Admin"]} />,
            children: [{ path: "dashboard/institute-admin", element: <InstituteAdminDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Publication Cell"]} />,
            children: [{ path: "dashboard/publication-cell", element: <PublicationCellDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Department Admin"]} />,
            children: [{ path: "dashboard/department-admin", element: <DepartmentAdminDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Head of Department"]} />,
            children: [{ path: "dashboard/head-of-department", element: <HODDashboard /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Department Nodal Officer"]} />,
            children: [{ path: "dashboard/nodal-officer", element: <NodalOfficerDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Contributor"]} />,
            children: [{ path: "dashboard/contributor", element: <ContributorDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Reviewer"]} />,
            children: [{ path: "dashboard/reviewer", element: <ReviewerDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Finance Officer/s"]} />,
            children: [{ path: "dashboard/finance-officer", element: <FinanceOfficerDash /> }],
          },
          {
            element: <ProtectedRoute allowedRoles={["Director's Office"]} />,
            children: [{ path: "dashboard/directors-office", element: <DirectorsOfficeDash /> }],
          },
        ],
      },
    ],
  },

  { path: "unauthorized", element: <Unauthorized /> },
  { path: "*",            element: <NotFound /> },
]);

export default router;