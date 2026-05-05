import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, CheckCheck, Check,
  UserPlus, KeyRound, ShieldAlert, RefreshCw,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

/* ── Event metadata ── */
const EVENT_META = {
  user_created:        { Icon: UserPlus,    color: "#2563eb", bg: "#eff6ff" },
  password_reset:      { Icon: KeyRound,    color: "#7c3aed", bg: "#f5f3ff" },
  account_suspended:   { Icon: ShieldAlert, color: "#dc2626", bg: "#fef2f2" },
  account_reactivated: { Icon: RefreshCw,   color: "#059669", bg: "#f0fdf4" },
};
const DEFAULT_META = { Icon: Bell, color: "#64748b", bg: "#f8fafc" };

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── Skeleton row ── */
function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 11, padding: "12px 16px" }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#e2e8f0", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
        <div style={{ height: 11, borderRadius: 4, background: "#e2e8f0", width: "65%" }} />
        <div style={{ height: 11, borderRadius: 4, background: "#e2e8f0", width: "88%" }} />
        <div style={{ height: 11, borderRadius: 4, background: "#e2e8f0", width: "40%" }} />
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const { apiFetch } = useApi();
  const BASE = "/api/notification-templates/inbox";

  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState([]);
  const [unread,  setUnread]  = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);

  const wrapRef = useRef(null);

  /* ── Poll unread count every 30s ── */
  const fetchUnread = useCallback(async () => {
    try {
      const r = await apiFetch(`${BASE}/unread`);
      const d = await r.json();
      if (d.success) setUnread(d.count);
    } catch { /* silent */ }
  }, [apiFetch]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  /* ── Fetch list when panel opens ── */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(BASE);
      const d = await r.json();
      if (d.success) setNotifs(d.notifications);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiFetch]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchList();
  };

  /* ── Close on outside click ── */
  useEffect(() => {
    if (!open) return;
    const fn = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  /* ── Mark one read ── */
  const markRead = async (n) => {
    if (n.is_read) return;
    setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    setUnread(c => Math.max(0, c - 1));
    try { await apiFetch(`${BASE}/${n.id}/read`, { method: "PUT" }); }
    catch { /* silent */ }
  };

  /* ── Mark all read ── */
  const markAll = async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    setNotifs(ns => ns.map(x => ({ ...x, is_read: true })));
    setUnread(0);
    try { await apiFetch(`${BASE}/read-all`, { method: "PUT" }); }
    catch { /* silent */ }
    finally { setBusy(false); }
  };

  /* ── Styles (all inline — no CSS injection needed) ── */
  const S = {
    wrap: {
      position: "relative",
      zIndex: 70,
      display: "inline-flex",
    },
    btn: {
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 34, height: 34, borderRadius: 8,
      border: `1px solid ${open ? "rgba(37,99,235,.50)" : "rgba(255,255,255,.10)"}`,
      background: open ? "rgba(37,99,235,.30)" : "transparent",
      color: open ? "#93c5fd" : "rgba(255,255,255,.55)",
      cursor: "pointer", flexShrink: 0,
      transition: "background .2s, color .2s, border-color .2s",
    },
    badge: {
      position: "absolute", top: 4, right: 4,
      minWidth: 16, height: 16, borderRadius: 8,
      background: "#ef4444", border: "2px solid #0f172a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 800, color: "#fff",
      fontFamily: "'Plus Jakarta Sans', sans-serif", padding: "0 3px",
    },
    panel: {
      position: "fixed",
      top: 56,
      right: 0,
      width: 360,
      maxHeight: "calc(100vh - 66px)",
      overflowY: "auto",
      background: "#fff",
      borderRadius: "0 0 0 14px",
      borderLeft: "1px solid rgba(0,0,0,.08)",
      borderBottom: "1px solid rgba(0,0,0,.08)",
      boxShadow: "-8px 8px 40px rgba(0,0,0,.14)",
      zIndex: 9999,
    },
    head: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 16px 11px", background: "#fafbfc",
      borderBottom: "1px solid #f1f5f9",
    },
    headTitle: {
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 13, fontWeight: 700, color: "#1e293b",
      display: "flex", alignItems: "center", gap: 7,
    },
    chip: {
      fontSize: 10, fontWeight: 700, color: "#2563eb",
      background: "#eff6ff", borderRadius: 20, padding: "2px 7px",
    },
    markAll: {
      display: "flex", alignItems: "center", gap: 4,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 11, fontWeight: 600, color: "#64748b",
      background: "none", border: "none", cursor: "pointer",
      padding: "4px 8px", borderRadius: 6,
      opacity: (busy || unread === 0) ? 0.4 : 1,
    },
    row: (isUnread) => ({
      display: "flex", alignItems: "flex-start", gap: 11,
      padding: "12px 16px", width: "100%", border: "none",
      background: isUnread ? "#f0f7ff" : "transparent",
      cursor: "pointer", textAlign: "left", position: "relative",
      borderBottom: "1px solid #f1f5f9",
    }),
    unreadBar: {
      position: "absolute", left: 0, top: 14, bottom: 14,
      width: 3, background: "#2563eb", borderRadius: "0 3px 3px 0",
    },
    ico: (bg) => ({
      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: bg,
    }),
    body: { flex: 1, minWidth: 0 },
    title: (isUnread) => ({
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 12.5, fontWeight: isUnread ? 700 : 600,
      color: "#1e293b", lineHeight: 1.4,
      marginBottom: 3, whiteSpace: "nowrap",
      overflow: "hidden", textOverflow: "ellipsis",
    }),
    msg: {
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 11.5, color: "#64748b", lineHeight: 1.5,
      display: "-webkit-box", WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical", overflow: "hidden",
    },
    time: {
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 10, color: "#94a3b8", marginTop: 5,
    },
    dot: {
      width: 8, height: 8, borderRadius: "50%",
      background: "#2563eb", flexShrink: 0, marginTop: 4,
    },
    empty: { padding: "36px 16px", textAlign: "center" },
    emptyRing: {
      width: 46, height: 46, borderRadius: 14, background: "#f1f5f9",
      display: "flex", alignItems: "center", justifyContent: "center",
      margin: "0 auto 10px",
    },
  };

  return (
    <div ref={wrapRef} style={S.wrap}>

      {/* ── Bell button ── */}
      <button
        style={S.btn}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={toggleOpen}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = "rgba(255,255,255,.09)";
            e.currentTarget.style.color = "#fff";
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,.55)";
          }
        }}
      >
        <Bell size={16} />
        {unread > 0 && <span style={S.badge}>{unread}</span>}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={S.panel}>

          {/* Header */}
          <div style={S.head}>
            <div style={S.headTitle}>
              Notifications
              {unread > 0 && <span style={S.chip}>{unread} new</span>}
            </div>
            <button
              style={S.markAll}
              onClick={markAll}
              disabled={busy || unread === 0}
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          </div>

          {/* Content */}
          {loading ? (
            [1, 2, 3].map(i => <SkeletonRow key={i} />)
          ) : notifs.length === 0 ? (
            <div style={S.empty}>
              <div style={S.emptyRing}><Bell size={20} color="#94a3b8" /></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                All caught up!
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                No notifications yet.
              </div>
            </div>
          ) : notifs.map((n, idx) => {
            const meta    = EVENT_META[n.event_id] || DEFAULT_META;
            const isUnread = !n.is_read;
            const isLast  = idx === notifs.length - 1;
            return (
              <button
                key={n.id}
                style={{ ...S.row(isUnread), borderBottom: isLast ? "none" : "1px solid #f1f5f9" }}
                onClick={() => markRead(n)}
                onMouseEnter={e => { e.currentTarget.style.background = isUnread ? "#e8f1fe" : "#f8fafc"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isUnread ? "#f0f7ff" : "transparent"; }}
              >
                {isUnread && <div style={S.unreadBar} />}
                <div style={S.ico(meta.bg)}>
                  <meta.Icon size={16} color={meta.color} />
                </div>
                <div style={S.body}>
                  <div style={S.title(isUnread)}>{n.title}</div>
                  <div style={S.msg}>{n.message}</div>
                  <div style={S.time}>{timeAgo(n.created_at)}</div>
                </div>
                {isUnread
                  ? <div style={S.dot} />
                  : <Check size={12} color="#94a3b8" style={{ flexShrink: 0, marginTop: 4 }} />
                }
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}