/**
 * RootLayout.jsx
 * ─────────────────────────────────────────────────────────────
 * Main layout shell — role-aware.
 *
 * Flow:
 *  1. useRole() resolves the role (localStorage → backend later)
 *  2. getRoleConfig(role) returns navItems + pages + defaultPage
 *  3. AppShell renders with exactly the right sidebar + content
 * ─────────────────────────────────────────────────────────────
 */

import { Suspense } from "react";
import AppShell from "../../components/Dashboard/AppShell";
import { useRole } from "../../components/Dashboard/useRole";
import "./RootLayout.css";

/* ── Loading state while role resolves ─────────────────────── */
function ShellSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        width: "100%",
        background: "#f4f6fb",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Sidebar shimmer */}
      <div
        style={{
          width: 240,
          background: "#fff",
          borderRight: "1px solid rgba(0,0,0,0.08)",
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 32,
            width: 140,
            borderRadius: 8,
            background: "#f1f5f9",
          }}
        />
        {[80, 100, 90, 110, 85].map((w, i) => (
          <div
            key={i}
            style={{
              height: 36,
              width: `${w}%`,
              borderRadius: 8,
              background: "#f1f5f9",
              opacity: 1 - i * 0.1,
            }}
          />
        ))}
      </div>
      {/* Content shimmer */}
      <div
        style={{
          flex: 1,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            height: 28,
            width: 200,
            borderRadius: 8,
            background: "#e2e8f0",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ height: 90, borderRadius: 12, background: "#e2e8f0" }}
            />
          ))}
        </div>
        <div style={{ height: 280, borderRadius: 12, background: "#e2e8f0" }} />
      </div>
    </div>
  );
}

/* ── Page suspense fallback ─────────────────────────────────── */
function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#94a3b8",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 14,
        gap: 10,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          border: "2px solid #e2e8f0",
          borderTop: "2px solid #2563eb",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spin 0.7s linear infinite",
        }}
      />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

/* ── RootLayout ─────────────────────────────────────────────── */
export default function RootLayout() {
  const { config, loading } = useRole();

  if (loading) return <ShellSkeleton />;

  return (
    <Suspense fallback={<PageLoader />}>
      <AppShell
        appName="PragatiMitra"
        navItems={config.navItems}
        pages={config.pages}
        defaultPage={config.defaultPage}
        user={config.user}
        notificationCount={2}
        onNavigate={(id) => console.log("Navigated to:", id)}
      />
    </Suspense>
  );
}
