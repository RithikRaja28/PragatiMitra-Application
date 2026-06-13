/**
 * RootLayout.jsx
 *
 * Settings mode: swaps AppShell's navItems + pages (no CSS injection, no
 * separate layout). A "← Back" nav item at the top exits settings mode.
 *
 * Nodal Officer role selection:
 *   - user.noaActiveYears comes from the login response (years for which the
 *     user has an active NOA assignment, e.g. ["2026-2027"]).
 *   - At login, if noaActiveYears is non-empty, Login.jsx shows a dialog.
 *   - The user's choice (original role or NOA role) is stored in AuthContext as
 *     noaSelectedRole, backed by sessionStorage for page-refresh survival.
 *   - Year restriction: when in NOA mode the selected academic year is locked
 *     to the user's assigned years. Switching the header year selector to an
 *     unassigned year shows a toast and reverts the selector back automatically.
 *   - AppShell is keyed on effectiveRole so it remounts cleanly on role change.
 */

import { Suspense, useState, useEffect, useRef } from "react";
import AppShell from "../../components/Dashboard/Appshell";
import { flatSettingsItems, buildSettingsNav } from "../../components/Dashboard/SettingsSidebar";
import "./RootLayout.css";
import { useAuth } from "../../store/AuthContext";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { getRoleConfig } from "../../components/Dashboard/roleConfig";

const SETTINGS_BACK_ID = "__settings_back__";

/* Integer start year → nodal_officer_assignments reporting_year text.
   Canonical "YYYY-YYYY" format — e.g. 2026 → "2026-2027". Must match the
   backend's reporting_year validator (nodalOfficerAssignments.js) and
   formatAcademicYear (academicYearService.js): all "year range" strings in
   the app now share one shape. */
const toReportingYear = (y) =>
  y != null ? `${y}-${Number(y) + 1}` : null;

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
  const { user, loading, noaSelectedRole } = useAuth();
  const ay = useAcademicYear();

  const [showSettings,      setShowSettings]      = useState(false);
  const [lastDashboardPage, setLastDashboardPage] = useState(null);
  const [isCollapsed,       setIsCollapsed]       = useState(false);

  // ── Effective role ────────────────────────────────────────────────────────
  const baseRole      = user?.roles?.[0]?.name;
  // noaSelectedRole is chosen at login and never auto-reverted by year changes.
  const effectiveRole = noaSelectedRole || baseRole;

  // ── Year restriction ──────────────────────────────────────────────────────
  // When the user is in NOA mode and switches to a year they are not assigned
  // to, keep the NOA dashboard but show a restriction message instead of data.
  const selectedYear  = ay?.selectedYear ?? null;
  const reportingYear = toReportingYear(selectedYear);

  const noaAssignedYears = noaSelectedRole === "institute_admin"
    ? (user?.noaInstituteActiveYears || [])
    : (user?.noaActiveYears          || []);

  const isYearRestricted = !!(
    noaSelectedRole &&
    reportingYear != null &&
    !noaAssignedYears.includes(reportingYear)
  );

  const config = getRoleConfig(effectiveRole);

  const permissions = user?.roles?.[0]?.permissions ?? {};
  const hasAll      = permissions["all"] === true;

  // ── Role-based nav/pages ──────────────────────────────────────────────────
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
  const settingsGroups = buildSettingsNav(effectiveRole);

  const settingsNavItems = [
    // "Back" as a regular nav item at the very top
    {
      group: "",
      items: [{ id: SETTINGS_BACK_ID, label: "Back to Dashboard", icon: "ArrowLeft" }],
    },
    // All settings groups (Communication, Security, Preferences, Administration…)
    ...settingsGroups,
  ];

  const settingsPages = Object.fromEntries(
    flatSettingsItems(effectiveRole).map((item) => [
      item.id,
      <div key={item.id} style={{ padding: "32px 36px" }}>{item.renderPage()}</div>,
    ])
  );

  // ── Year restriction: revert to assigned year ────────────────────────────
  // The visual warning is shown by AcademicYearPicker in Appshell (contextual,
  // near the dropdown). This effect only handles the structural revert.
  const noaAssignedYearsRef = useRef(noaAssignedYears);
  noaAssignedYearsRef.current = noaAssignedYears;
  const setYearRef = useRef(ay?.setYear);
  setYearRef.current = ay?.setYear;

  useEffect(() => {
    if (!isYearRestricted) return;
    const assigned = noaAssignedYearsRef.current;
    const setYear  = setYearRef.current;
    if (assigned.length > 0 && setYear) {
      const firstStart = parseInt(assigned[0].split("-")[0], 10);
      if (!isNaN(firstStart)) setYear(firstStart);
    }
  }, [isYearRestricted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── What AppShell receives ────────────────────────────────────────────────
  const activeNavItems = showSettings ? settingsNavItems : filteredNavItems;
  const activePages = showSettings ? settingsPages : filteredPages;
  // Use lastDashboardPage only when it exists in the current role's page map,
  // so stale ids from a previous session don't cause "No page registered".
  const activeDefault = showSettings
    ? (settingsGroups[0]?.items[0]?.id ?? "notifications")
    : ((lastDashboardPage && visibleIds.has(lastDashboardPage))
        ? lastDashboardPage
        : roleDefaultPage);

  // ── Navigation handler ────────────────────────────────────────────────────
  const handleNavigate = (id) => {
    if (id === SETTINGS_BACK_ID) {
      setShowSettings(false);
      return false;
    }
    if (!showSettings) setLastDashboardPage(id);
  };

  const shellUser = {
    name:     user?.fullName,
    org:      user?.institutionName,
    initials: user?.fullName
      ?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
  };

  if (loading) return <ShellSkeleton />;

  return (
    <Suspense fallback={<PageLoader />}>
      {/* Key includes effectiveRole so AppShell remounts cleanly on role change.
          Collapse state is lifted so it survives the remount. */}
      <AppShell
        key={showSettings ? `settings-${effectiveRole}` : `dashboard-${effectiveRole}`}
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
