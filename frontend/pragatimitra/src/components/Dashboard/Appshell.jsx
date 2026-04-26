/**
 * AppShell.js — Reusable Layout Component
 *
 * Mimics the Zoho Books–style shell with:
 *  - Collapsible sidebar with grouped nav items + icons
 *  - Top header with search, actions, user avatar
 *  - Content area that re-renders based on active route
 *  - Full mobile responsiveness (drawer overlay on small screens)
 *
 * DEPENDENCIES TO INSTALL:
 *   npm install lucide-react
 *
 * USAGE EXAMPLE:
 *   import AppShell from './AppShell';
 *
 *   const navItems = [
 *     {
 *       group: 'Main',
 *       items: [
 *         { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/' },
 *         { id: 'sales',     label: 'Sales',     icon: 'TrendingUp',     path: '/sales' },
 *       ],
 *     },
 *     {
 *       group: 'Finance',
 *       items: [
 *         { id: 'purchases', label: 'Purchases', icon: 'ShoppingCart', path: '/purchases' },
 *         { id: 'banking',   label: 'Banking',   icon: 'Landmark',     path: '/banking' },
 *       ],
 *     },
 *   ];
 *
 *   const pages = {
 *     dashboard: <Dashboard />,
 *     sales:     <Sales />,
 *     purchases: <Purchases />,
 *     banking:   <Banking />,
 *   };
 *
 *   <AppShell
 *     navItems={navItems}
 *     pages={pages}
 *     defaultPage="dashboard"
 *     logo={<YourLogo />}
 *     appName="PragatiMitra"
 *     user={{ name: 'Rithik Raja S', initials: 'RR', org: 'RMK' }}
 *     headerRight={<YourNotifications />}      // optional
 *     onNavigate={(id) => console.log(id)}     // optional
 *   />
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as Icons from "lucide-react";

/* ─────────────────────────────────────────────
   CONTEXT
───────────────────────────────────────────── */
const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

/* ─────────────────────────────────────────────
   ICON RESOLVER  (accepts string name or element)
───────────────────────────────────────────── */
function DynIcon({ name, size = 18, className = "" }) {
  if (!name) return null;
  if (typeof name !== "string") return name; // already a JSX element
  const Comp = Icons[name] || Icons.Circle;
  return <Comp size={size} className={className} />;
}

/* ─────────────────────────────────────────────
   CSS-IN-JS STYLES  (injected once)
───────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  :root {
    --shell-bg:        #f4f6fb;
    --shell-sidebar:   #ffffff;
    --shell-surface:   #f0f4fa;
    --shell-border:    rgba(0,0,0,0.08);
    --shell-accent:    #2563eb;
    --shell-accent-2:  #7c3aed;
    --shell-text:      #1e293b;
    --shell-muted:     #94a3b8;
    --shell-hover:     rgba(37,99,235,0.07);
    --shell-active-bg: rgba(37,99,235,0.10);
    --shell-radius:    12px;
    --shell-w-open:    240px;
    --shell-w-closed:  64px;
    --shell-header-h:  56px;
    --shell-font:      'Plus Jakarta Sans', sans-serif;
    --shell-mono:      'DM Mono', monospace;
    --shell-trans:     0.22s cubic-bezier(.4,0,.2,1);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .shell-root {
    display: flex;
    height: 100dvh;
    width: 100%;
    background: var(--shell-bg);
    font-family: var(--shell-font);
    color: var(--shell-text);
    overflow: hidden;
  }

  /* ── OVERLAY (mobile) ── */
  .shell-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,.35);
    backdrop-filter: blur(4px);
    z-index: 40;
    animation: fadeIn .18s ease;
  }
  .shell-overlay.active { display: block; }
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }

  /* ── SIDEBAR ── */
  .shell-sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    width: var(--shell-w-open);
    min-height: 0;
    background: var(--shell-sidebar);
    border-right: 1px solid var(--shell-border);
    box-shadow: 1px 0 12px rgba(0,0,0,0.05);
    transition: width var(--shell-trans), transform var(--shell-trans);
    z-index: 50;
    flex-shrink: 0;
    overflow: hidden;
  }
  .shell-sidebar.collapsed { width: var(--shell-w-closed); }

  /* mobile */
  @media (max-width: 768px) {
    .shell-sidebar {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      transform: translateX(-100%);
      width: var(--shell-w-open) !important;
      box-shadow: 4px 0 32px rgba(0,0,0,.15);
    }
    .shell-sidebar.mobile-open { transform: translateX(0); }
  }

  /* ── SIDEBAR LOGO BAR ── */
  .shell-logo-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: var(--shell-header-h);
    border-bottom: 1px solid var(--shell-border);
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .shell-logo-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px; height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--shell-accent), var(--shell-accent-2));
    flex-shrink: 0;
    font-weight: 700;
    font-size: 13px;
    color: #fff;
    letter-spacing: -.5px;
  }
  .shell-app-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--shell-text);
    letter-spacing: -.3px;
    transition: opacity var(--shell-trans), width var(--shell-trans);
  }
  .shell-sidebar.collapsed .shell-app-name { opacity: 0; width: 0; }

  /* ── NAV SCROLL AREA ── */
  .shell-nav-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px 0;
    scrollbar-width: thin;
    scrollbar-color: var(--shell-border) transparent;
  }
  .shell-nav-scroll::-webkit-scrollbar { width: 4px; }
  .shell-nav-scroll::-webkit-scrollbar-thumb { background: var(--shell-border); border-radius: 4px; }

  /* ── NAV GROUP ── */
  .shell-nav-group { margin-bottom: 4px; }
  .shell-nav-group-label {
    padding: 6px 16px 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--shell-muted);
    white-space: nowrap;
    overflow: hidden;
    transition: opacity var(--shell-trans);
  }
  .shell-sidebar.collapsed .shell-nav-group-label { opacity: 0; height: 0; padding: 0; }

  /* ── NAV ITEM ── */
  .shell-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    height: 40px;
    margin: 1px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--shell-trans), color var(--shell-trans);
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    border: none;
    background: transparent;
    color: var(--shell-muted);
    font-family: var(--shell-font);
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
    width: calc(100% - 16px);
  }
  .shell-nav-item:hover { background: var(--shell-hover); color: var(--shell-text); }
  .shell-nav-item.active {
    background: var(--shell-active-bg);
    color: var(--shell-accent);
  }
  .shell-nav-item.active::before {
    content: '';
    position: absolute;
    left: 0; top: 8px; bottom: 8px;
    width: 3px;
    background: var(--shell-accent);
    border-radius: 0 3px 3px 0;
  }
  .shell-nav-icon { flex-shrink: 0; }
  .shell-nav-label {
    transition: opacity var(--shell-trans), width var(--shell-trans);
    font-size: 13.5px;
  }
  .shell-sidebar.collapsed .shell-nav-label { opacity: 0; width: 0; }

  /* tooltip on collapse */
  .shell-nav-item[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute;
    left: calc(var(--shell-w-closed) - 4px);
    top: 50%;
    transform: translateY(-50%);
    background: #ffffff;
    color: var(--shell-text);
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
    border: 1px solid var(--shell-border);
    z-index: 100;
    opacity: 0;
    animation: tipIn .12s .08s ease forwards;
  }
  @keyframes tipIn { to { opacity:1; left: calc(var(--shell-w-closed) + 6px); } }

  /* ── SIDEBAR FOOTER ── */
  .shell-sidebar-footer {
    border-top: 1px solid var(--shell-border);
    padding: 10px 8px;
    flex-shrink: 0;
  }

  /* ── TOGGLE BTN ── */
  .shell-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--shell-border);
    background: transparent;
    color: var(--shell-muted);
    cursor: pointer;
    transition: background var(--shell-trans), color var(--shell-trans);
    font-family: var(--shell-font);
  }
  .shell-toggle-btn:hover { background: var(--shell-hover); color: var(--shell-text); }

  /* ── MAIN AREA ── */
  .shell-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  /* ── HEADER ── */
  .shell-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    height: var(--shell-header-h);
    background: #1e293b;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 1px 12px rgba(0,0,0,0.18);
    flex-shrink: 0;
  }

  .shell-hamburger {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px; height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: rgba(255,255,255,0.55);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--shell-trans), color var(--shell-trans);
  }
  .shell-hamburger:hover { background: rgba(255,255,255,0.08); color: #fff; }
  @media (max-width: 768px) { .shell-hamburger { display: flex; } }

  .shell-search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 420px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 0 12px;
    height: 36px;
    transition: border-color .15s;
  }
  .shell-search-wrap:focus-within { border-color: var(--shell-accent); }
  .shell-search-wrap input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-family: var(--shell-font);
    font-size: 13px;
  }
  .shell-search-wrap input::placeholder { color: rgba(255,255,255,0.35); }
  .shell-search-kbd {
    font-family: var(--shell-mono);
    font-size: 10px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
    padding: 2px 5px;
    color: rgba(255,255,255,0.4);
    white-space: nowrap;
  }
  @media (max-width: 480px) { .shell-search-kbd { display: none; } }

  .shell-header-spacer { flex: 1; }

  .shell-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .shell-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    transition: background var(--shell-trans), color var(--shell-trans);
    position: relative;
    flex-shrink: 0;
  }
  .shell-icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }

  .shell-badge {
    position: absolute;
    top: 4px; right: 4px;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--shell-accent);
    border: 2px solid #1e293b;
  }

  .shell-avatar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    cursor: pointer;
    transition: background var(--shell-trans);
    flex-shrink: 0;
  }
  .shell-avatar:hover { background: rgba(255,255,255,0.08); }
  .shell-avatar-circle {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--shell-accent), var(--shell-accent-2));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }
  .shell-avatar-info { text-align: left; }
  .shell-avatar-name { font-size: 12px; font-weight: 600; color: #e2e8f0; white-space: nowrap; }
  .shell-avatar-org  { font-size: 10px; color: rgba(255,255,255,0.45); white-space: nowrap; }
  @media (max-width: 480px) { .shell-avatar-info { display: none; } }

  /* ── CONTENT ── */
  .shell-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--shell-bg);
    scrollbar-width: thin;
    scrollbar-color: var(--shell-border) transparent;
  }
  .shell-content::-webkit-scrollbar { width: 6px; }
  .shell-content::-webkit-scrollbar-thumb { background: var(--shell-border); border-radius: 4px; }

  .shell-page-enter {
    animation: pageIn .18s ease both;
  }
  @keyframes pageIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

function injectCSS(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

function Sidebar({
  navItems,
  collapsed,
  mobileOpen,
  onCollapse,
  onNavClick,
  activeId,
  appName,
  logo,
}) {
  const cls = [
    "shell-sidebar",
    collapsed ? "collapsed" : "",
    mobileOpen ? "mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={cls}>
      {/* Logo bar */}
      <div className="shell-logo-bar">
        <div className="shell-logo-mark">
          {logo || (appName ? appName.slice(0, 2).toUpperCase() : "PM")}
        </div>
        <span className="shell-app-name">{appName || "PragatiMitra"}</span>
      </div>

      {/* Nav */}
      <nav className="shell-nav-scroll">
        {(navItems || []).map((group, gi) => (
          <div key={gi} className="shell-nav-group">
            {group.group && (
              <div className="shell-nav-group-label">{group.group}</div>
            )}
            {(group.items || []).map((item) => (
              <button
                key={item.id}
                className={`shell-nav-item${activeId === item.id ? " active" : ""}`}
                onClick={() => onNavClick(item.id)}
                data-tip={collapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <span className="shell-nav-icon">
                  <DynIcon name={item.icon} size={17} />
                </span>
                <span className="shell-nav-label">{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--shell-accent)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 20,
                      padding: "1px 6px",
                      flexShrink: 0,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer toggle (desktop only) */}
      <div className="shell-sidebar-footer">
        <button
          className="shell-toggle-btn"
          onClick={onCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <Icons.PanelLeftOpen size={16} />
          ) : (
            <>
              <Icons.PanelLeftClose size={16} />
              <span
                style={{
                  fontSize: 12,
                  marginLeft: 6,
                  fontFamily: "var(--shell-font)",
                }}
              >
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Header({
  onHamburger,
  user,
  searchPlaceholder,
  onSearch,
  headerActions,
  notificationCount,
}) {
  const [query, setQuery] = useState("");

  const handleSearch = (e) => {
    setQuery(e.target.value);
    onSearch && onSearch(e.target.value);
  };

  const initials =
    user?.initials ||
    (user?.name
      ? user.name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "U");

  return (
    <header className="shell-header">
      {/* Hamburger (mobile) */}
      <button
        className="shell-hamburger"
        onClick={onHamburger}
        aria-label="Open menu"
      >
        <Icons.Menu size={18} />
      </button>

      {/* Search */}
      <div className="shell-search-wrap">
        <Icons.Search size={14} color="var(--shell-muted)" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          placeholder={searchPlaceholder || "Search… (/)"}
        />
        <span className="shell-search-kbd">/</span>
      </div>

      <div className="shell-header-spacer" />

      {/* Action buttons */}
      <div className="shell-header-actions">
        {headerActions}

        {/* Notifications */}
        <button className="shell-icon-btn" aria-label="Notifications">
          <Icons.Bell size={17} />
          {notificationCount > 0 && <span className="shell-badge" />}
        </button>

        {/* Settings */}
        <button className="shell-icon-btn" aria-label="Settings">
          <Icons.Settings size={17} />
        </button>

        {/* Avatar */}
        <div
          className="shell-avatar"
          role="button"
          tabIndex={0}
          aria-label="User menu"
        >
          <div className="shell-avatar-circle">{initials}</div>
          <div className="shell-avatar-info">
            <div className="shell-avatar-name">{user?.name || "User"}</div>
            <div className="shell-avatar-org">{user?.org || "Org"}</div>
          </div>
          <Icons.ChevronDown
            size={13}
            color="var(--shell-muted)"
            style={{ marginLeft: 2 }}
          />
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */

/**
 * @param {Object}   props
 * @param {Array}    props.navItems         - Navigation groups & items
 * @param {Object}   props.pages            - { [id]: ReactNode } map of page components
 * @param {string}   [props.defaultPage]    - ID of the page to show initially
 * @param {ReactNode}[props.logo]           - Custom logo element (shown in sidebar)
 * @param {string}   [props.appName]        - App name shown next to logo
 * @param {Object}   [props.user]           - { name, initials, org }
 * @param {string}   [props.searchPlaceholder]
 * @param {Function} [props.onSearch]       - Search input callback
 * @param {ReactNode}[props.headerActions]  - Extra elements in the header action area
 * @param {number}   [props.notificationCount]
 * @param {Function} [props.onNavigate]     - Called with (id) when nav item is clicked
 * @param {boolean}  [props.defaultCollapsed]
 */
export default function AppShell({
  navItems = [],
  pages = {},
  defaultPage,
  logo,
  appName = "Pragati Mitra",
  user,
  searchPlaceholder,
  onSearch,
  headerActions,
  notificationCount = 0,
  onNavigate,
  defaultCollapsed = false,
}) {
  injectCSS("app-shell-styles", CSS);

  // Determine initial active page
  const firstId =
    defaultPage || navItems[0]?.items?.[0]?.id || Object.keys(pages)[0] || "";

  const [activeId, setActiveId] = useState(firstId);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageKey, setPageKey] = useState(0);

  // Close sidebar on resize to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth > 768) setMobileOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const handleNavClick = useCallback(
    (id) => {
      setActiveId(id);
      setPageKey((k) => k + 1);
      setMobileOpen(false);
      onNavigate && onNavigate(id);
    },
    [onNavigate],
  );

  const currentPage = pages[activeId] ?? (
    <div
      style={{
        padding: 40,
        color: "var(--shell-muted)",
        fontFamily: "var(--shell-font)",
      }}
    >
      No page registered for{" "}
      <code style={{ fontFamily: "var(--shell-mono)" }}>"{activeId}"</code>.
    </div>
  );

  const shellCtx = {
    activeId,
    setActiveId: handleNavClick,
    collapsed,
    setCollapsed,
  };

  return (
    <ShellContext.Provider value={shellCtx}>
      <div className="shell-root">
        {/* Mobile overlay */}
        <div
          className={`shell-overlay${mobileOpen ? " active" : ""}`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />

        {/* Sidebar */}
        <Sidebar
          navItems={navItems}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCollapse={() => setCollapsed((c) => !c)}
          onNavClick={handleNavClick}
          activeId={activeId}
          appName={appName}
          logo={logo}
        />

        {/* Main */}
        <div className="shell-main">
          <Header
            onHamburger={() => setMobileOpen((o) => !o)}
            user={user}
            searchPlaceholder={searchPlaceholder}
            onSearch={onSearch}
            headerActions={headerActions}
            notificationCount={notificationCount}
          />

          <main className="shell-content">
            <div key={pageKey} className="shell-page-enter">
              {currentPage}
            </div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
