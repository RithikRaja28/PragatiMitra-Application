import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { useEffect, lazy } from "react";

import AuthLayout     from "../layouts/AuthLayout/Authlayout";
import RootLayout     from "../layouts/RootLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth, ROLE_ROUTES } from "../store/AuthContext";
import {
  ROLE_CONFIG,
  getRoleConfig,
  getRoleDefaultSlug,
} from "../components/Dashboard/roleConfig";
import { flatSettingsItems, SettingsEmptyPage } from "../components/Dashboard/SettingsSidebar";

/* ─────────────────────────────────────────────────────────────
   RootRedirect
   Reads the user's role → looks up ROLE_ROUTES → navigates.
───────────────────────────────────────────────────────────── */
function RootRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const role  = user?.roles?.[0]?.name || "";
    const route = user.mustChangePassword
      ? "/change-password"
      : (ROLE_ROUTES[role] || ROLE_ROUTES.super_admin);
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

/* ─────────────────────────────────────────────────────────────
   SlugRoute
   Given the URL path (leading "/" stripped), decides — based on
   the current effective role — whether the role can see that path
   and what to render. Redirects to the role's default slug if the
   path is not accessible.
───────────────────────────────────────────────────────────── */
function SlugRoute({ path }) {
  const { user, noaSelectedRole } = useAuth();
  const effectiveRole = noaSelectedRole || user?.roles?.[0]?.name;
  const config        = getRoleConfig(effectiveRole);
  const permissions   = user?.roles?.[0]?.permissions ?? {};
  const hasAll        = permissions["all"] === true;
  const defaultSlug   = getRoleDefaultSlug(effectiveRole);

  /* ── Settings routes ─────────────────────────────────────── */
  if (path === "settings" || path.startsWith("settings/")) {
    const items = flatSettingsItems(effectiveRole);

    if (path === "settings") {
      return items.length
        ? <Navigate to={`/settings/${items[0].id}`} replace />
        : <SettingsEmptyPage />;
    }

    const id   = path.slice("settings/".length);
    const item = items.find((i) => i.id === id);
    if (!item) return <Navigate to={`/${defaultSlug}`} replace />;
    return <div style={{ padding: "32px 36px" }}>{item.renderPage()}</div>;
  }

  /* ── Dashboard / module routes ───────────────────────────── */
  const slug     = path.split("/")[0];
  const allItems = config.navItems.flatMap((group) => group.items);
  const item     = allItems.find((i) => i.slug === slug);
  const visible  = item && (item.permission == null || hasAll || permissions[item.permission] === true);

  if (!visible) return <Navigate to={`/${defaultSlug}`} replace />;

  if (path === slug) return config.pages[item.id];

  const sub = (item.subRoutes || []).find((sr) => sr.path === path);
  if (!sub) return <Navigate to={`/${slug}`} replace />;
  return sub.element;
}

/* ─────────────────────────────────────────────────────────────
   collectRouteSlugs
   Walks every role's config and returns a de-duplicated array of
   all URL paths used across the app (nav slugs, sub-route paths,
   settings/<id> paths, and the bare "settings" index).
───────────────────────────────────────────────────────────── */
function collectRouteSlugs() {
  const slugs = new Set(["settings"]);

  for (const [roleKey, config] of Object.entries(ROLE_CONFIG)) {
    if (roleKey === "__fallback__") continue;

    for (const group of config.navItems) {
      for (const item of group.items) {
        slugs.add(item.slug);
        for (const sub of item.subRoutes || []) {
          slugs.add(sub.path);
        }
      }
    }

    for (const item of flatSettingsItems(roleKey)) {
      slugs.add(`settings/${item.id}`);
    }
  }

  return [...slugs];
}

/* ── Lazy page imports ── */
const Login            = lazy(() => import("../pages/Login/Login"));
const SuperAdminLogin  = lazy(() => import("../pages/Login/SuperAdminLogin"));
const SuperAdminSignup = lazy(() => import("../pages/Login/SuperAdminSignup"));
const ChangePassword   = lazy(() => import("../pages/ChangePassword/ChangePassword"));
const NotFound       = lazy(() => import("../pages/NotFound"));
const Unauthorized   = lazy(() => Promise.resolve({ default: () => <div style={{ padding: 40 }}><h2>403 — Access Denied</h2></div> }));

const router = createBrowserRouter([

  // Redirect bare "/" to login
  { path: "/", element: <Navigate to="/login" replace /> },

  // ── Public: Auth pages ──────────────────────────────────────
  {
    element: <AuthLayout />,
    children: [
      { path: "login",        element: <Login /> },
      { path: "admin-login",  element: <SuperAdminLogin /> },
      { path: "admin-signup", element: <SuperAdminSignup /> },
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

      // "/" inside protected tree → redirect to role dashboard
      { index: true, element: <RootRedirect /> },

      // ✅ /dashboard → also redirect (removes the old generic catch)
      { path: "dashboard", element: <RootRedirect /> },

      // ── Flat, role-agnostic dashboard route tree ─────────────
      // One <RootLayout/> with one child per slug across all roles.
      // <SlugRoute> dispatches to the correct component at render
      // time based on the current effective role.
      {
        element: <RootLayout />,
        children: collectRouteSlugs().map((path) => ({
          path,
          element: <SlugRoute path={path} />,
        })),
      },
    ],
  },

  { path: "unauthorized", element: <Unauthorized /> },
  { path: "*",            element: <NotFound /> },
]);

export default router;
