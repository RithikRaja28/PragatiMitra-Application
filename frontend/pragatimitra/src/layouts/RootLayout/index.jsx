/**
 * RootLayout.jsx
 */

import { Suspense } from "react";
import AppShell from "../../components/Dashboard/AppShell";
import "./RootLayout.css";
import { useAuth } from "../../store/AuthContext";
import { getRoleConfig } from "../../components/Dashboard/roleConfig";

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
  const role = user?.roles?.[0]?.name;
  const config = getRoleConfig(role);

  const permissions = user?.roles?.[0]?.permissions ?? {};
  const hasAll = permissions["all"] === true;

  // 1. Filter nav items — if hasAll, show everything; otherwise check permission key
  const filteredNavItems = config.navItems
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.permission == null || hasAll || permissions[item.permission] === true
      ),
    }))
    .filter((group) => group.items.length > 0);

  // 2. Narrow pages to only ids reachable via filteredNavItems
  const visibleIds = new Set(
    filteredNavItems.flatMap((g) => g.items.map((item) => item.id))
  );
  const filteredPages = Object.fromEntries(
    Object.entries(config.pages).filter(([id]) => visibleIds.has(id))
  );

  // 3. Ensure defaultPage is still visible; fall back to first visible item
  const defaultPage = visibleIds.has(config.defaultPage)
    ? config.defaultPage
    : filteredNavItems[0]?.items[0]?.id ?? "home";

  const shellUser = {
    name: user?.fullName,
    org: user?.institutionName,
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
      <AppShell
        appName="PragatiMitra"
        navItems={filteredNavItems}
        pages={filteredPages}
        defaultPage={defaultPage}
        user={shellUser}
        notificationCount={2}
        onNavigate={(id) => console.log("Navigated to:", id)}
      />
    </Suspense>
  );
}