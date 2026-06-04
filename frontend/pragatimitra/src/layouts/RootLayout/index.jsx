/**
 * RootLayout.jsx
 *
 * Settings mode works by swapping AppShell's navItems + pages + defaultPage.
 * The header, sidebar container, collapse state, and theme are all unchanged.
 * A "← Back" nav item at the top of the settings nav exits settings mode.
 */

import { Suspense, useState } from "react";
import AppShell from "../../components/Dashboard/AppShell";
import { flatSettingsItems, buildSettingsNav } from "../../components/Dashboard/SettingsSidebar";
import "./RootLayout.css";
import { useAuth } from "../../store/AuthContext";
import { getRoleConfig } from "../../components/Dashboard/roleConfig";

// Special id used for the "back to dashboard" item in settings nav
const SETTINGS_BACK_ID = "__settings_back__";

function ShellSkeleton() {
  return (
    <div style={{ display: "flex", height: "100dvh", width: "100%", background: "#f4f6fb", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 240, background: "#fff", borderRight: "1px solid rgba(0,0,0,0.08)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
        <div style={{ height: 32, width: 140, borderRadius: 8, background: "#f1f5f9" }} />
        {[80, 100, 90, 110, 85].map((w, i) => (
          <div key={i} style={{ height: 36, width: `${w}%`, borderRadius: 8, background: "#f1f5f9", opacity: 1 - i * 0.1 }} />
        ))}
      </div>
      <div style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 28, width: 200, borderRadius: 8, background: "#e2e8f0" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 90, borderRadius: 12, background: "#e2e8f0" }} />
          ))}
        </div>
        <div style={{ height: 280, borderRadius: 12, background: "#e2e8f0" }} />
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, gap: 10 }}>
      <span style={{ width: 18, height: 18, border: "2px solid #e2e8f0", borderTop: "2px solid #2563eb", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

export default function RootLayout() {
  const { user, loading } = useAuth();

  const [showSettings,      setShowSettings]      = useState(false);
  const [lastDashboardPage, setLastDashboardPage] = useState(null); // restored on exit
  const [isCollapsed,       setIsCollapsed]       = useState(false); // survives mode switch

  const role   = user?.roles?.[0]?.name;
  const config = getRoleConfig(role);

  const permissions = user?.roles?.[0]?.permissions ?? {};
  const hasAll      = permissions["all"] === true;

  // ── Role-based nav/pages (dashboard mode) ────────────────────────────────
  const filteredNavItems = config.navItems
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.permission == null || hasAll || permissions[item.permission] === true
      ),
    }))
    .filter((group) => group.items.length > 0);

  const visibleIds = new Set(filteredNavItems.flatMap((g) => g.items.map((i) => i.id)));
  const filteredPages = Object.fromEntries(
    Object.entries(config.pages).filter(([id]) => visibleIds.has(id))
  );

  const roleDefaultPage = visibleIds.has(config.defaultPage)
    ? config.defaultPage
    : filteredNavItems[0]?.items[0]?.id ?? "home";

  // ── Settings nav/pages ────────────────────────────────────────────────────
  // Settings nav items are converted to AppShell's navItems format so they
  // render inside the same dark sidebar container unchanged.
  const settingsGroups = buildSettingsNav(role);

  const settingsNavItems = [
    // "Back" as a regular nav item at the very top
    {
      group: "",
      items: [{ id: SETTINGS_BACK_ID, label: "← Back to Dashboard", icon: "ArrowLeft" }],
    },
    // All settings groups (Communication, Security, Preferences, Administration…)
    ...settingsGroups,
  ];

  const settingsPages = Object.fromEntries(
    flatSettingsItems(role).map((item) => [
      item.id,
      // Wrap in a padded div that matches the regular content area padding
      <div key={item.id} style={{ padding: "32px 36px" }}>
        {item.renderPage()}
      </div>,
    ])
  );

  // ── Decide what to pass to AppShell ──────────────────────────────────────
  const activeNavItems  = showSettings ? settingsNavItems  : filteredNavItems;
  const activePages     = showSettings ? settingsPages     : filteredPages;
  const activeDefault   = showSettings
    ? (settingsGroups[0]?.items[0]?.id ?? "notifications")
    : (lastDashboardPage ?? roleDefaultPage);

  // ── Navigation handler ────────────────────────────────────────────────────
  const handleNavigate = (id) => {
    if (id === SETTINGS_BACK_ID) {
      // Exit settings — restore the page the user was on before
      setShowSettings(false);
      return false; // tell AppShell to cancel this navigation
    }
    if (!showSettings) {
      // Track where the user was in the dashboard
      setLastDashboardPage(id);
    }
  };

  const shellUser = {
    name: user?.fullName,
    org:  user?.institutionName,
    initials: user?.fullName
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  };

  if (loading) return <ShellSkeleton />;

  return (
    <Suspense fallback={<PageLoader />}>
      {/*
        key changes between "dashboard" and "settings" so AppShell remounts
        with a fresh activeId = defaultPage.  This prevents the "No page
        registered for __settings_back__" flash that occurs when activeId and
        pages are momentarily out of sync.  Collapse state is lifted to
        RootLayout so it survives the remount.
      */}
      <AppShell
        key={showSettings ? "settings" : "dashboard"}
        appName="PragatiMitra"
        navItems={activeNavItems}
        pages={activePages}
        defaultPage={activeDefault}
        defaultCollapsed={isCollapsed}
        onCollapseChange={setIsCollapsed}
        user={shellUser}
        notificationCount={2}
        onNavigate={handleNavigate}
        onSettingsClick={() => setShowSettings(true)}
      />
    </Suspense>
  );
}
