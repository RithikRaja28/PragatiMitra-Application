import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { useEffect, lazy } from "react";

import RootLayout     from "../layouts/RootLayout";
import AuthLayout     from "../layouts/AuthLayout/Authlayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth, ROLE_ROUTES } from "../store/AuthContext";

/* ─────────────────────────────────────────────────────────────
   RootRedirect
   Reads the user's role → looks up ROLE_ROUTES → navigates.
   RootLayout itself renders the correct nav via getRoleConfig,
   so we only need to land on the right path.
───────────────────────────────────────────────────────────── */
function RootRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const role  = user?.roles?.[0]?.name || "";
    const route = user.mustChangePassword
      ? "/change-password"
      : (ROLE_ROUTES[role] || "/dashboard/super-admin");
    console.log("[RootRedirect] role:", role, "→ route:", route);
    navigate(route, { replace: true });
  }, [user, navigate]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "#6B7280", fontSize: "15px", fontFamily: "sans-serif",
    }}>
      Redirecting…
    </div>
  );
}

/* ── Lazy page imports ── */
const Login          = lazy(() => import("../pages/Login/Login"));
const ChangePassword = lazy(() => import("../pages/ChangePassword/ChangePassword"));
const NotFound       = lazy(() => import("../pages/NotFound"));
const Unauthorized   = lazy(() => Promise.resolve({ default: () => <div style={{ padding: 40 }}><h2>403 — Access Denied</h2></div> }));

const router = createBrowserRouter([

  // Redirect bare "/" to login
  { path: "/", element: <Navigate to="/login" replace /> },

  // ── Public: Auth pages ──────────────────────────────────────
  {
    element: <AuthLayout />,
    children: [
      { path: "login", element: <Login /> },
    ],
  },

  // ── Protected: everything behind login ─────────────────────
  {
    element: <ProtectedRoute />,
    children: [

      // Change-password uses centered card layout, no sidebar
      {
        element: <AuthLayout />,
        children: [{ path: "change-password", element: <ChangePassword /> }],
      },

      // ── All dashboard routes share RootLayout ───────────────
      // RootLayout reads the role from useAuth() and calls
      // getRoleConfig() itself — no per-route element needed.
      // Every path here just needs to match what ROLE_ROUTES
      // points to so the browser URL is correct.
      {
        element: <RootLayout />,
        children: [
          // "/" inside protected tree → redirect to role dashboard
          { index: true, element: <RootRedirect /> },

          // ✅ /dashboard → also redirect (removes the old generic catch)
          { path: "dashboard", element: <RootRedirect /> },

          // Role-specific paths — element is intentionally null/empty
          // because RootLayout renders the page content via roleConfig pages map.
          { path: "dashboard/super-admin",      element: null },
          { path: "dashboard/institute-admin",  element: null },
          { path: "dashboard/publication-cell", element: null },
          { path: "dashboard/department-admin", element: null },
          { path: "dashboard/head-of-department", element: null },
          { path: "dashboard/nodal-officer",    element: null },
          { path: "dashboard/contributor",      element: null },
          { path: "dashboard/reviewer",         element: null },
          { path: "dashboard/finance-officer",  element: null },
          { path: "dashboard/directors-office", element: null },

          { path: "reports", element: null },
        ],
      },
    ],
  },

  { path: "unauthorized", element: <Unauthorized /> },
  { path: "*",            element: <NotFound /> },
]);

export default router;