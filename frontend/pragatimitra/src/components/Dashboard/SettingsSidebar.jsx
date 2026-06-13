/**
 * SettingsSidebar.jsx
 * src/components/Dashboard/SettingsSidebar.jsx
 *
 * Uses the EXACT same CSS classes as the dashboard sidebar in AppShell:
 *   .sh-sidebar, .sh-sidebar.col, .sh-nav, .sh-nav-group,
 *   .sh-nav-group-label, .sh-nav-item, .sh-nav-item.on,
 *   .sh-nav-label, .sh-sidebar-footer, .sh-collapse-btn
 *
 * This means it is pixel-identical to the dashboard sidebar —
 * same font, same colors, same hover, same active bar, same collapse.
 * No extra CSS needed.
 */

import { useState } from "react";
import * as Icons from "lucide-react";
import NotificationsPage          from "./settings/NotificationsPage";
import AcademicYearPage           from "./settings/AcademicYearPage";
import NodalOfficerPage           from "./settings/NodalOfficerPage";
import InstituteNodalOfficerPage  from "./settings/InstituteNodalOfficerPage";
import { useAuth }                from "../../store/AuthContext";

/* ── Icon resolver — same as AppShell ── */
function DynIcon({ name, size = 17 }) {
  if (!name) return null;
  const Comp = Icons[name] || Icons.Circle;
  return <Comp size={size} />;
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS NAV — flat, one click per page, no sub-items
══════════════════════════════════════════════════════════════ */
export function buildSettingsNav(role) {
  const nav = [];

  // ── Institution group (institute_admin only) ──────────────────────────────
  if (role === "institute_admin") {
    nav.push({
      group: "Institution",
      items: [
        { id: "academic-year", label: "Academic Year Management", icon: "CalendarRange", renderPage: () => <AcademicYearPage /> },
      ],
    });
  }

  // ── Communication: Notification Templates (super_admin only) ─────────────
  // Other roles see no useful data there and currently get a restricted message.
  if (role === "super_admin") {
    nav.push({
      group: "Communication",
      items: [
        { id: "notifications", label: "Notification Templates", icon: "Bell", renderPage: () => <NotificationsPage /> },
      ],
    });
  }

  // ── Administration: Nodal Officer ─────────────────────────────────────────
  if (role === "institute_admin") {
    nav.push({
      group: "Administration",
      items: [
        { id: "nodal-officer", label: "Nodal Officer", icon: "UserCheck", renderPage: () => <InstituteNodalOfficerPage /> },
      ],
    });
  }
  if (role === "department_admin") {
    nav.push({
      group: "Administration",
      items: [
        { id: "nodal-officer", label: "Nodal Officer", icon: "UserCheck", renderPage: () => <NodalOfficerPage /> },
      ],
    });
  }

  return nav;
}

/* Exported so RootLayout can look up the active page — pass the current role */
export function flatSettingsItems(role) {
  return buildSettingsNav(role).flatMap(g => g.items);
}

/* ══════════════════════════════════════════════════════════════
   MAIN EXPORT
   Uses .sh-sidebar / .sh-nav-item / .sh-collapse-btn etc.
   directly — the exact same classes AppShell already has in CSS.
══════════════════════════════════════════════════════════════ */
export default function SettingsSidebar({ activeId, onSelect, onBack }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const role = user?.roles?.[0]?.name;
  const settingsNav = buildSettingsNav(role);

  const cls = ["sh-sidebar", collapsed ? "col" : ""].filter(Boolean).join(" ");

  return (
    <aside className={cls}>

      {/* ── Header — back button + "Settings" title ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "0 12px",
        height: 48,
        borderBottom: "1px solid var(--sh-border)",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        {/* Back button */}
        <button
          onClick={onBack}
          title="Back to dashboard"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 7,
            border: "1px solid var(--sh-border)",
            background: "transparent", cursor: "pointer",
            color: "var(--sh-muted)", flexShrink: 0,
            transition: "background var(--sh-ease), color var(--sh-ease)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--sh-hover)"; e.currentTarget.style.color = "var(--sh-text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--sh-muted)"; }}
        >
          <Icons.ArrowLeft size={13} />
        </button>

        {/* Settings icon */}
        <Icons.Settings size={14} color="var(--sh-muted)" style={{ flexShrink: 0 }} />

        {/* Title — hidden when collapsed, same as .sh-nav-label */}
        <span className="sh-nav-label" style={{
          fontSize: "13.5px",
          fontWeight: 700,
          color: "var(--sh-text)",
          whiteSpace: "nowrap",
          letterSpacing: "-0.2px",
        }}>
          Settings
        </span>
      </div>

      {/* ── Nav — uses exact .sh-nav / .sh-nav-group / .sh-nav-item ── */}
      <nav className="sh-nav">
        {settingsNav.map((group) => (
          <div key={group.group} className="sh-nav-group">
            {/* Group label — uses .sh-nav-group-label */}
            <div className="sh-nav-group-label">{group.group}</div>

            {group.items.map((item) => (
              <button
                key={item.id}
                className={`sh-nav-item${activeId === item.id ? " on" : ""}`}
                onClick={() => onSelect(item.id)}
                data-tip={collapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <span style={{ flexShrink: 0 }}>
                  <DynIcon name={item.icon} size={17} />
                </span>
                {/* Label — uses .sh-nav-label so it fades on collapse */}
                <span className="sh-nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Footer — uses .sh-sidebar-footer / .sh-collapse-btn ── */}
      <div className="sh-sidebar-footer">
        <button
          className="sh-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <Icons.PanelLeftOpen size={16} />
          ) : (
            <>
              <Icons.PanelLeftClose size={16} />
              <span style={{ fontSize: 12, marginLeft: 6, fontFamily: "var(--sh-font)" }}>
                Collapse
              </span>
            </>
          )}
        </button>
      </div>

    </aside>
  );
}