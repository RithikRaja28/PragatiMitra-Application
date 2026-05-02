import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Fragment,
} from "react";
import * as Icons from "lucide-react";
import { useAuth } from "../../store/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
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
    overflow: visible;
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

  /* Search wrapper — owns flex sizing + dropdown anchor */
  .sh-search-wrap {
    position: relative;
    flex: 1;
    max-width: 400px;
  }

  /* Search bar */
  .sh-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
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

  /* Search dropdown */
  .sh-search-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 100%;
    min-width: 340px;
    background: #fff;
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 16px 48px rgba(0,0,0,0.18);
    z-index: 9999;
    overflow: hidden;
    animation: shMenuIn .13s ease both;
  }
  .sh-search-group-hdr {
    padding: 10px 14px 4px;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.8px; text-transform: uppercase;
    color: #94a3b8;
  }
  .sh-search-result {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; cursor: pointer; width: 100%;
    border: none; background: transparent; text-align: left;
    font-family: var(--sh-font);
    transition: background .1s;
  }
  .sh-search-result:hover { background: #f8fafc; }
  .sh-search-result.sel { background: rgba(37,99,235,0.07); }
  .sh-search-result-icon {
    width: 30px; height: 30px; border-radius: 8px;
    background: rgba(37,99,235,0.08);
    display: flex; align-items: center; justify-content: center;
    color: var(--sh-accent); flex-shrink: 0;
  }
  .sh-search-result-label {
    flex: 1; font-size: 13px; font-weight: 500; color: #1e293b;
  }
  .sh-search-result-group {
    font-size: 10px; font-weight: 600; color: #94a3b8;
    background: #f1f5f9; border-radius: 4px;
    padding: 2px 7px; white-space: nowrap;
  }
  .sh-search-empty {
    padding: 24px 14px; text-align: center;
    font-size: 13px; color: #94a3b8;
  }
  .sh-search-footer {
    padding: 8px 14px;
    border-top: 1px solid #f1f5f9;
    display: flex; gap: 14px; align-items: center;
  }
  .sh-search-hint {
    display: flex; align-items: center; gap: 4px;
    font-size: 10px; color: #94a3b8; font-family: var(--sh-font);
  }
  .sh-search-hint kbd {
    font-family: var(--sh-mono); font-size: 9px;
    background: #f1f5f9; border: 1px solid #e2e8f0;
    border-radius: 3px; padding: 1px 5px; color: #64748b;
  }

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

  /* ── USER DROPDOWN ── */
  .sh-user-wrap { position: relative; }

  .sh-user-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: #fff;
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 12px 40px rgba(0,0,0,0.16);
    min-width: 232px;
    z-index: 9999;
    overflow: hidden;
    animation: shMenuIn .13s ease both;
  }
  @keyframes shMenuIn {
    from { opacity:0; transform:translateY(-6px) scale(.97); }
    to   { opacity:1; transform:translateY(0)    scale(1);   }
  }

  .sh-menu-header {
    padding: 16px 16px 12px;
    background: #fafbfc;
    border-bottom: 1px solid #f1f5f9;
  }
  .sh-menu-avatar {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, var(--sh-accent), var(--sh-accent2));
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .sh-menu-name  { font-size: 13px; font-weight: 700; color: #1e293b; }
  .sh-menu-email { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  .sh-menu-body { padding: 8px; }

  .sh-menu-btn {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px; border-radius: 8px;
    border: none; background: transparent; cursor: pointer;
    font-family: var(--sh-font); font-size: 13px; font-weight: 500;
    text-align: left; color: #475569;
    transition: background .12s, color .12s;
  }
  .sh-menu-btn:hover { background: #f1f5f9; color: #1e293b; }
  .sh-menu-btn.danger { color: #dc2626; }
  .sh-menu-btn.danger:hover { background: #fef2f2; color: #dc2626; }

  /* ── Language toggle pill ── */
  .sh-lang-toggle {
    display: flex; align-items: center;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    overflow: hidden; flex-shrink: 0;
    height: 30px;
  }
  .sh-lang-opt {
    display: flex; align-items: center; justify-content: center;
    padding: 0 10px; height: 100%;
    font-family: var(--sh-font); font-size: 11px; font-weight: 700;
    color: rgba(255,255,255,0.35); letter-spacing: 0.3px;
    cursor: pointer; border: none; background: transparent;
    transition: background var(--sh-ease), color var(--sh-ease);
  }
  .sh-lang-opt.on {
    background: var(--sh-accent);
    color: #fff;
  }
  .sh-lang-opt:not(.on):hover {
    color: rgba(255,255,255,0.75);
    background: rgba(255,255,255,0.06);
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
function Topbar({ appName, logo, user, onHamburger, onSearch, searchPlaceholder, headerActions, notificationCount, navItems, onNavClick }) {
  const [query,       setQuery]       = useState("");
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const menuRef   = useRef(null);
  const searchRef = useRef(null);
  const inputRef  = useRef(null);

  const { user: authUser, logout } = useAuth();
  const { lang, toggle: toggleLang } = useLanguage();

  /* Flatten + filter nav items against the current query */
  const flatResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (navItems || [])
      .flatMap((group) =>
        (group.items || [])
          .filter((item) => t(item.label, lang).toLowerCase().includes(q))
          .map((item) => ({ ...item, groupLabel: group.group }))
      )
      .slice(0, 8);
  }, [query, navItems, lang]);

  /* Reset keyboard selection when results change */
  useEffect(() => setSelectedIdx(-1), [flatResults]);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  /* '/' shortcut to focus search */
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const navigateTo = useCallback((item) => {
    onNavClick?.(item.id);
    setQuery("");
    setSearchOpen(false);
    inputRef.current?.blur();
  }, [onNavClick]);

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      navigateTo(flatResults[selectedIdx]);
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchOpen(false);
      inputRef.current?.blur();
    }
  };

  const displayName = authUser?.full_name || user?.name || "User";
  const displayOrg  = user?.org || "";
  const displayEmail = authUser?.email || "";
  const initials =
    user?.initials ||
    (displayName !== "User"
      ? displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : "U");

  /* Close menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
  };

  return (
    <header className="sh-topbar">
      {/* Hamburger — mobile only */}
      <button
        className="sh-hamburger"
        onClick={onHamburger}
        aria-label="Open menu"
      >
        <Icons.Menu size={18} />
      </button>

      {/* Logo + App name */}
      <div className="sh-logo">
        <div className="sh-logo-mark">
          {typeof logo === "string"
            ? logo
            : appName
              ? appName.slice(0, 2).toUpperCase()
              : "PM"}
        </div>
        <span className="sh-logo-name">{t(appName || "PragatiMitra", lang)}</span>
      </div>

      {/* Divider */}
      <div className="sh-topbar-div" />

      {/* Search */}
      <div className="sh-search-wrap" ref={searchRef}>
        <div className="sh-search">
          <Icons.Search size={14} color="rgba(255,255,255,0.35)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
              onSearch?.(e.target.value);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t(searchPlaceholder || "Search…", lang)}
          />
          <span className="sh-search-kbd">/</span>
        </div>

        {/* Dropdown */}
        {searchOpen && query.trim() !== "" && (
          <div className="sh-search-dropdown" role="listbox">
            {flatResults.length === 0 ? (
              <div className="sh-search-empty">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              flatResults.map((item, idx) => {
                const showHeader =
                  item.groupLabel &&
                  (idx === 0 || flatResults[idx - 1].groupLabel !== item.groupLabel);
                return (
                  <Fragment key={item.id}>
                    {showHeader && (
                      <div className="sh-search-group-hdr">
                        {t(item.groupLabel, lang)}
                      </div>
                    )}
                    <button
                      className={`sh-search-result${selectedIdx === idx ? " sel" : ""}`}
                      role="option"
                      aria-selected={selectedIdx === idx}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => navigateTo(item)}
                    >
                      <span className="sh-search-result-icon">
                        <DynIcon name={item.icon} size={15} />
                      </span>
                      <span className="sh-search-result-label">
                        {t(item.label, lang)}
                      </span>
                      {item.groupLabel && (
                        <span className="sh-search-result-group">
                          {t(item.groupLabel, lang) || "General"}
                        </span>
                      )}
                    </button>
                  </Fragment>
                );
              })
            )}
            <div className="sh-search-footer">
              <span className="sh-search-hint"><kbd>↑↓</kbd> navigate</span>
              <span className="sh-search-hint"><kbd>↵</kbd> go</span>
              <span className="sh-search-hint"><kbd>esc</kbd> close</span>
            </div>
          </div>
        )}
      </div>

      <div className="sh-spacer" />

      {/* Actions */}
      <div className="sh-actions">
        {headerActions}

        <button className="sh-icon-btn" aria-label="Notifications">
          <Icons.Bell size={16} />
          {notificationCount > 0 && <span className="sh-badge" />}
        </button>

        {/* Language toggle */}
        <div className="sh-lang-toggle" role="group" aria-label="Select language">
          <button
            className={`sh-lang-opt${lang === "en" ? " on" : ""}`}
            onClick={() => lang !== "en" && toggleLang()}
            aria-pressed={lang === "en"}
          >
            EN
          </button>
          <button
            className={`sh-lang-opt${lang === "hi" ? " on" : ""}`}
            onClick={() => lang !== "hi" && toggleLang()}
            aria-pressed={lang === "hi"}
          >
            हि
          </button>
        </div>

        <button className="sh-icon-btn" aria-label="Settings">
          <Icons.Settings size={16} />
        </button>

        {/* Avatar + dropdown */}
        <div className="sh-user-wrap" ref={menuRef}>
          <button
            className="sh-avatar"
            aria-label="User menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <div className="sh-avatar-circle">{initials}</div>
            <div className="sh-avatar-info">
              <div className="sh-avatar-name">{displayName}</div>
              {displayOrg && <div className="sh-avatar-org">{displayOrg}</div>}
            </div>
            <Icons.ChevronDown
              size={12}
              color="rgba(255,255,255,0.4)"
              style={{
                marginLeft: 4,
                transition: "transform .2s",
                transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {menuOpen && (
              <div className="sh-user-menu" role="menu">
                <div className="sh-menu-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="sh-menu-avatar">{initials}</div>
                    <div>
                      <div className="sh-menu-name">{displayName}</div>
                      {displayEmail && (
                        <div className="sh-menu-email">{displayEmail}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="sh-menu-body">
                  <button
                    className="sh-menu-btn danger"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <Icons.LogOut size={15} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>
    </header>
  );
}

/* ─── Sidebar ───────────────────────────────────────────────── */
function Sidebar({ navItems, collapsed, mobileOpen, onCollapse, onNavClick, activeId }) {
  const { lang } = useLanguage();

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
              <div className="sh-nav-group-label">{t(group.group, lang)}</div>
            )}
            {(group.items || []).map((item) => (
              <button
                key={item.id}
                className={`sh-nav-item${activeId === item.id ? " on" : ""}`}
                onClick={() => onNavClick(item.id)}
                data-tip={collapsed ? t(item.label, lang) : undefined}
                aria-label={t(item.label, lang)}
              >
                <span style={{ flexShrink: 0 }}>
                  <DynIcon name={item.icon} size={17} />
                </span>
                <span className="sh-nav-label">{t(item.label, lang)}</span>
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
                {t("Collapse", lang)}
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
          navItems={navItems}
          onNavClick={handleNavClick}
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
