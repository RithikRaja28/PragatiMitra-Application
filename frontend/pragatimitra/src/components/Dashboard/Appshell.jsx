import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as Icons from "lucide-react";

/* ─── Context ───────────────────────────────────────────────── */
const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

/* ─── Icon resolver ─────────────────────────────────────────── */
function DynIcon({ name, size = 18 }) {
  if (!name) return null;
  if (typeof name !== "string") return name;
  const Comp = Icons[name] || Icons.Circle;
  return <Comp size={size} />;
}

/* ─── CSS (injected once) ───────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  :root {
    --sh-topbar:    #0f172a;
    --sh-topbar-b:  rgba(255,255,255,0.07);
    --sh-sidebar:   #ffffff;
    --sh-bg:        #f1f5f9;
    --sh-border:    rgba(0,0,0,0.08);
    --sh-accent:    #2563eb;
    --sh-accent2:   #7c3aed;
    --sh-text:      #1e293b;
    --sh-muted:     #94a3b8;
    --sh-hover:     rgba(37,99,235,0.07);
    --sh-active:    rgba(37,99,235,0.10);
    --sh-topbar-h:  56px;
    --sh-side-open: 240px;
    --sh-side-col:  64px;
    --sh-font:      'Plus Jakarta Sans', sans-serif;
    --sh-mono:      'DM Mono', monospace;
    --sh-ease:      0.22s cubic-bezier(.4,0,.2,1);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Root: column layout so topbar spans full width ── */
  .sh-root {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    width: 100%;
    font-family: var(--sh-font);
    color: var(--sh-text);
    overflow: hidden;
    background: var(--sh-bg);
  }

  /* ── TOPBAR ── */
  .sh-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: var(--sh-topbar-h);
    background: var(--sh-topbar);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 2px 16px rgba(0,0,0,0.22);
    flex-shrink: 0;
    z-index: 60;
  }

  /* Logo mark + name */
  .sh-logo {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
    text-decoration: none;
    margin-right: 8px;
  }
  .sh-logo-mark {
    width: 30px; height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--sh-accent), var(--sh-accent2));
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; color: #fff; letter-spacing: -.5px;
    flex-shrink: 0;
  }
  .sh-logo-name {
    font-size: 15px; font-weight: 700; color: #f1f5f9;
    letter-spacing: -.3px; white-space: nowrap;
  }
  @media (max-width: 640px) { .sh-logo-name { display: none; } }

  /* Divider */
  .sh-topbar-div {
    width: 1px; height: 20px;
    background: rgba(255,255,255,0.1);
    flex-shrink: 0;
    margin: 0 4px;
  }
  @media (max-width: 640px) { .sh-topbar-div { display: none; } }

  /* Search */
  .sh-search {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 400px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 8px;
    padding: 0 12px;
    height: 34px;
    transition: border-color .15s, background .15s;
  }
  .sh-search:focus-within {
    border-color: var(--sh-accent);
    background: rgba(37,99,235,0.08);
  }
  .sh-search input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #e2e8f0; font-family: var(--sh-font); font-size: 13px;
  }
  .sh-search input::placeholder { color: rgba(255,255,255,0.3); }
  .sh-search-kbd {
    font-family: var(--sh-mono); font-size: 10px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.13);
    border-radius: 4px; padding: 2px 5px;
    color: rgba(255,255,255,0.35); white-space: nowrap;
  }
  @media (max-width: 480px) { .sh-search-kbd { display: none; } }

  .sh-spacer { flex: 1; }

  /* Action buttons */
  .sh-actions { display: flex; align-items: center; gap: 4px; }

  .sh-icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.10);
    background: transparent; color: rgba(255,255,255,0.55);
    cursor: pointer; transition: background var(--sh-ease), color var(--sh-ease);
    position: relative; flex-shrink: 0;
  }
  .sh-icon-btn:hover { background: rgba(255,255,255,0.09); color: #fff; }

  .sh-badge {
    position: absolute; top: 5px; right: 5px;
    width: 7px; height: 7px; border-radius: 50%;
    background: #3b82f6; border: 2px solid var(--sh-topbar);
  }

  /* Avatar pill */
  .sh-avatar {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 10px 4px 4px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.10);
    background: transparent; cursor: pointer;
    transition: background var(--sh-ease); flex-shrink: 0; margin-left: 2px;
  }
  .sh-avatar:hover { background: rgba(255,255,255,0.08); }
  .sh-avatar-circle {
    width: 28px; height: 28px; border-radius: 7px;
    background: linear-gradient(135deg, var(--sh-accent), var(--sh-accent2));
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .sh-avatar-name { font-size: 12px; font-weight: 600; color: #e2e8f0; white-space: nowrap; }
  .sh-avatar-org  { font-size: 10px; color: rgba(255,255,255,0.4); white-space: nowrap; }
  @media (max-width: 520px) { .sh-avatar-info { display: none; } }

  /* Hamburger (mobile) */
  .sh-hamburger {
    display: none; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent; color: rgba(255,255,255,0.55);
    cursor: pointer; flex-shrink: 0;
    transition: background var(--sh-ease), color var(--sh-ease);
  }
  .sh-hamburger:hover { background: rgba(255,255,255,0.09); color: #fff; }
  @media (max-width: 768px) { .sh-hamburger { display: flex; } }

  /* ── BODY (sidebar + content) ── */
  .sh-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── MOBILE OVERLAY ── */
  .sh-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(15,23,42,.35); backdrop-filter: blur(4px);
    z-index: 40; animation: shFadeIn .18s ease;
  }
  .sh-overlay.open { display: block; }
  @keyframes shFadeIn { from { opacity:0 } to { opacity:1 } }

  /* ── SIDEBAR ── */
  .sh-sidebar {
    display: flex; flex-direction: column;
    width: var(--sh-side-open);
    background: var(--sh-sidebar);
    border-right: 1px solid var(--sh-border);
    box-shadow: 1px 0 12px rgba(0,0,0,0.04);
    transition: width var(--sh-ease);
    z-index: 50; flex-shrink: 0; overflow: hidden;
  }
  .sh-sidebar.col { width: var(--sh-side-col); }

  @media (max-width: 768px) {
    .sh-sidebar {
      position: fixed;
      top: var(--sh-topbar-h); left: 0; bottom: 0;
      transform: translateX(-100%);
      width: var(--sh-side-open) !important;
      box-shadow: 4px 0 32px rgba(0,0,0,.14);
    }
    .sh-sidebar.mob { transform: translateX(0); }
  }

  /* ── NAV SCROLL ── */
  .sh-nav {
    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px 0;
    scrollbar-width: thin; scrollbar-color: var(--sh-border) transparent;
  }
  .sh-nav::-webkit-scrollbar { width: 4px; }
  .sh-nav::-webkit-scrollbar-thumb { background: var(--sh-border); border-radius: 4px; }

  /* ── NAV GROUP ── */
  .sh-nav-group { margin-bottom: 4px; }
  .sh-nav-group-label {
    padding: 6px 16px 4px; font-size: 10px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase; color: var(--sh-muted);
    white-space: nowrap; overflow: hidden; transition: opacity var(--sh-ease);
  }
  .sh-sidebar.col .sh-nav-group-label { opacity: 0; height: 0; padding: 0; }

  /* ── NAV ITEM ── */
  .sh-nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 0 12px; height: 40px; margin: 1px 8px; border-radius: 8px;
    cursor: pointer; white-space: nowrap; overflow: hidden;
    position: relative; border: none; background: transparent;
    color: var(--sh-muted); font-family: var(--sh-font);
    font-size: 13.5px; font-weight: 500; text-align: left;
    width: calc(100% - 16px);
    transition: background var(--sh-ease), color var(--sh-ease);
  }
  .sh-nav-item:hover { background: var(--sh-hover); color: var(--sh-text); }
  .sh-nav-item.on {
    background: var(--sh-active); color: var(--sh-accent);
  }
  .sh-nav-item.on::before {
    content: '';
    position: absolute; left: 0; top: 8px; bottom: 8px;
    width: 3px; background: var(--sh-accent); border-radius: 0 3px 3px 0;
  }
  .sh-nav-label {
    transition: opacity var(--sh-ease), width var(--sh-ease); font-size: 13.5px;
  }
  .sh-sidebar.col .sh-nav-label { opacity: 0; width: 0; }

  /* Collapsed tooltip */
  .sh-sidebar.col .sh-nav-item[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute; left: calc(var(--sh-side-col) - 4px); top: 50%;
    transform: translateY(-50%);
    background: #fff; color: var(--sh-text); font-size: 12px;
    padding: 5px 10px; border-radius: 6px; white-space: nowrap;
    pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.14);
    border: 1px solid var(--sh-border); z-index: 100;
    opacity: 0; animation: shTip .12s .08s ease forwards;
  }
  @keyframes shTip { to { opacity:1; left: calc(var(--sh-side-col) + 6px); } }

  /* Badge */
  .sh-item-badge {
    margin-left: auto; background: var(--sh-accent); color: #fff;
    font-size: 10px; font-weight: 700; border-radius: 20px;
    padding: 1px 6px; flex-shrink: 0;
  }

  /* ── SIDEBAR FOOTER ── */
  .sh-sidebar-footer {
    border-top: 1px solid var(--sh-border);
    padding: 10px 8px; flex-shrink: 0;
  }
  .sh-collapse-btn {
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 36px; border-radius: 8px;
    border: 1px solid var(--sh-border); background: transparent;
    color: var(--sh-muted); cursor: pointer; font-family: var(--sh-font);
    transition: background var(--sh-ease), color var(--sh-ease);
  }
  .sh-collapse-btn:hover { background: var(--sh-hover); color: var(--sh-text); }

  /* ── CONTENT ── */
  .sh-content {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    background: var(--sh-bg);
    scrollbar-width: thin; scrollbar-color: var(--sh-border) transparent;
  }
  .sh-content::-webkit-scrollbar { width: 6px; }
  .sh-content::-webkit-scrollbar-thumb { background: var(--sh-border); border-radius: 4px; }

  .sh-page-enter { animation: shPageIn .18s ease both; }
  @keyframes shPageIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
`;

function injectCSS(id, css) {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/* ─── Topbar ────────────────────────────────────────────────── */
function Topbar({ appName, logo, user, onHamburger, onSearch, searchPlaceholder, headerActions, notificationCount }) {
  const [query, setQuery] = useState("");
  const initials =
    user?.initials ||
    (user?.name
      ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : "U");

  return (
    <header className="sh-topbar">
      {/* Hamburger — mobile only */}
      <button className="sh-hamburger" onClick={onHamburger} aria-label="Open menu">
        <Icons.Menu size={18} />
      </button>

      {/* Logo + App name */}
      <div className="sh-logo">
        <div className="sh-logo-mark">
          {typeof logo === "string" ? logo : (appName ? appName.slice(0, 2).toUpperCase() : "PM")}
        </div>
        <span className="sh-logo-name">{appName || "PragatiMitra"}</span>
      </div>

      {/* Divider */}
      <div className="sh-topbar-div" />

      {/* Search */}
      <div className="sh-search">
        <Icons.Search size={14} color="rgba(255,255,255,0.35)" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
          placeholder={searchPlaceholder || "Search…"}
        />
        <span className="sh-search-kbd">/</span>
      </div>

      <div className="sh-spacer" />

      {/* Actions */}
      <div className="sh-actions">
        {headerActions}

        <button className="sh-icon-btn" aria-label="Notifications">
          <Icons.Bell size={16} />
          {notificationCount > 0 && <span className="sh-badge" />}
        </button>

        <button className="sh-icon-btn" aria-label="Settings">
          <Icons.Settings size={16} />
        </button>

        {/* Avatar */}
        <div className="sh-avatar" role="button" tabIndex={0} aria-label="User menu">
          <div className="sh-avatar-circle">{initials}</div>
          <div className="sh-avatar-info">
            <div className="sh-avatar-name">{user?.name || "User"}</div>
            <div className="sh-avatar-org">{user?.org || ""}</div>
          </div>
          <Icons.ChevronDown size={12} color="rgba(255,255,255,0.4)" style={{ marginLeft: 4 }} />
        </div>
      </div>
    </header>
  );
}

/* ─── Sidebar ───────────────────────────────────────────────── */
function Sidebar({ navItems, collapsed, mobileOpen, onCollapse, onNavClick, activeId }) {
  const cls = [
    "sh-sidebar",
    collapsed  ? "col" : "",
    mobileOpen ? "mob" : "",
  ].filter(Boolean).join(" ");

  return (
    <aside className={cls}>
      <nav className="sh-nav">
        {(navItems || []).map((group, gi) => (
          <div key={gi} className="sh-nav-group">
            {group.group && (
              <div className="sh-nav-group-label">{group.group}</div>
            )}
            {(group.items || []).map((item) => (
              <button
                key={item.id}
                className={`sh-nav-item${activeId === item.id ? " on" : ""}`}
                onClick={() => onNavClick(item.id)}
                data-tip={collapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <span style={{ flexShrink: 0 }}>
                  <DynIcon name={item.icon} size={17} />
                </span>
                <span className="sh-nav-label">{item.label}</span>
                {item.badge != null && (
                  <span className="sh-item-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sh-sidebar-footer">
        <button
          className="sh-collapse-btn"
          onClick={onCollapse}
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

/* ─── Main export ───────────────────────────────────────────── */
export default function AppShell({
  navItems = [],
  pages = {},
  defaultPage,
  logo,
  appName = "PragatiMitra",
  user,
  searchPlaceholder,
  onSearch,
  headerActions,
  notificationCount = 0,
  onNavigate,
  defaultCollapsed = false,
}) {
  injectCSS("app-shell-v2", CSS);

  const firstId = defaultPage || navItems[0]?.items?.[0]?.id || Object.keys(pages)[0] || "";
  const [activeId,   setActiveId]   = useState(firstId);
  const [collapsed,  setCollapsed]  = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageKey,    setPageKey]    = useState(0);

  useEffect(() => {
    const fn = () => { if (window.innerWidth > 768) setMobileOpen(false); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const handleNavClick = useCallback((id) => {
    setActiveId(id);
    setPageKey((k) => k + 1);
    setMobileOpen(false);
    onNavigate?.(id);
  }, [onNavigate]);

  const currentPage = pages[activeId] ?? (
    <div style={{ padding: 40, color: "var(--sh-muted)", fontFamily: "var(--sh-font)" }}>
      No page registered for <code style={{ fontFamily: "var(--sh-mono)" }}>"{activeId}"</code>.
    </div>
  );

  return (
    <ShellContext.Provider value={{ activeId, setActiveId: handleNavClick, collapsed, setCollapsed }}>
      <div className="sh-root">

        {/* Full-width top bar */}
        <Topbar
          appName={appName}
          logo={logo}
          user={user}
          onHamburger={() => setMobileOpen((o) => !o)}
          onSearch={onSearch}
          searchPlaceholder={searchPlaceholder}
          headerActions={headerActions}
          notificationCount={notificationCount}
        />

        {/* Body: sidebar + content */}
        <div className="sh-body">

          {/* Mobile overlay */}
          <div
            className={`sh-overlay${mobileOpen ? " open" : ""}`}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          <Sidebar
            navItems={navItems}
            collapsed={collapsed}
            mobileOpen={mobileOpen}
            onCollapse={() => setCollapsed((c) => !c)}
            onNavClick={handleNavClick}
            activeId={activeId}
          />

          <main className="sh-content">
            <div key={pageKey} className="sh-page-enter">
              {currentPage}
            </div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
