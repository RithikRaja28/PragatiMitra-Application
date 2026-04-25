import { Outlet } from "react-router-dom";

/* ── Same injectCSS utility as AppShell ── */
function injectCSS(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  .auth-root {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #EFF6FF 0%, #F0F9FF 40%, #E0F2FE 100%);
    font-family: 'Plus Jakarta Sans', sans-serif;
    position: relative;
    overflow: hidden;
    padding: 24px 16px 72px;
  }

  /* ── Ambient blobs — same blur/opacity language as shell-overlay ── */
  .auth-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.45;
    pointer-events: none;
  }
  .auth-blob--tl {
    width: 520px; height: 520px;
    background: radial-gradient(circle, #BFDBFE 0%, #7DD3FC 60%, transparent 100%);
    top: -180px; left: -180px;
  }
  .auth-blob--br {
    width: 480px; height: 480px;
    background: radial-gradient(circle, #BAE6FD 0%, #A5F3FC 60%, transparent 100%);
    bottom: -160px; right: -160px;
  }

  /* ── Floating deco icons ── */
  .auth-deco {
    position: absolute;
    pointer-events: none;
    opacity: 0.55;
  }
  .auth-deco--1 { width: 72px; top: 8%;     left: 6%;   transform: rotate(-12deg); animation: authFloatA 7s ease-in-out infinite; }
  .auth-deco--2 { width: 64px; bottom: 14%; left: 10%;  transform: rotate(8deg);   animation: authFloatB 9s ease-in-out infinite; }
  .auth-deco--3 { width: 56px; top: 18%;    right: 8%;  transform: rotate(10deg);  animation: authFloatA 8s ease-in-out infinite 1s; }
  .auth-deco--4 { width: 52px; bottom: 20%; right: 6%;  transform: rotate(-6deg);  animation: authFloatB 6s ease-in-out infinite 0.5s; }

  @keyframes authFloatA {
    0%, 100% { transform: translateY(0)    rotate(-12deg); }
    50%       { transform: translateY(-12px) rotate(-12deg); }
  }
  @keyframes authFloatB {
    0%, 100% { transform: translateY(0)   rotate(8deg); }
    50%       { transform: translateY(10px) rotate(8deg); }
  }

  /* ── Content slot ── */
  .auth-main {
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    justify-content: center;
  }

  /* ── Footer — same backdrop/border language as shell-header ── */
  .auth-footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 24px;
    padding: 13px 24px;
    font-size: 12px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    color: #94a3b8;
    background: rgba(255,255,255,0.65);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(186,230,253,0.45);
    z-index: 10;
  }
  .auth-footer a {
    color: #2563eb;
    text-decoration: none;
    transition: color 0.2s;
    font-weight: 500;
  }
  .auth-footer a:hover { color: #1d4ed8; text-decoration: underline; }

  @media (max-width: 480px) {
    .auth-deco { display: none; }
    .auth-footer { gap: 14px; font-size: 11px; flex-wrap: wrap; justify-content: center; }
  }
`;

export default function AuthLayout() {
  injectCSS("auth-layout-styles", CSS);

  return (
    <div className="auth-root">

      {/* Ambient blobs */}
      <div className="auth-blob auth-blob--tl" />
      <div className="auth-blob auth-blob--br" />

      {/* Floating deco SVGs */}
      <svg className="auth-deco auth-deco--1" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="4" width="48" height="56" rx="6" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
        <rect x="16" y="16" width="32" height="6" rx="2" fill="#93C5FD"/>
        <rect x="16" y="28" width="20" height="4" rx="2" fill="#BFDBFE"/>
        <rect x="16" y="38" width="28" height="4" rx="2" fill="#BFDBFE"/>
        <rect x="16" y="48" width="14" height="4" rx="2" fill="#BFDBFE"/>
      </svg>
      <svg className="auth-deco auth-deco--2" viewBox="0 0 56 56" fill="none">
        <rect x="4" y="4" width="48" height="48" rx="8" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="2"/>
        <rect x="12" y="12" width="10" height="10" rx="2" fill="#93C5FD"/>
        <rect x="28" y="12" width="10" height="10" rx="2" fill="#BFDBFE"/>
        <rect x="12" y="28" width="10" height="10" rx="2" fill="#BFDBFE"/>
        <rect x="28" y="28" width="10" height="10" rx="2" fill="#60A5FA"/>
        <rect x="12" y="44" width="26" height="4" rx="2" fill="#DBEAFE"/>
      </svg>
      <svg className="auth-deco auth-deco--3" viewBox="0 0 48 64" fill="none">
        <rect x="4" y="4" width="40" height="56" rx="6" fill="#F0F9FF" stroke="#BAE6FD" strokeWidth="2"/>
        <line x1="12" y1="20" x2="36" y2="20" stroke="#7DD3FC" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="12" y1="30" x2="36" y2="30" stroke="#BAE6FD" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="40" x2="28" y2="40" stroke="#BAE6FD" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="36" cy="50" r="6" fill="#38BDF8" opacity="0.5"/>
        <path d="M33 50 L35.5 52.5 L39 48" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <svg className="auth-deco auth-deco--4" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="22" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
        <path d="M18 26 L24 32 L34 20" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {/* Page slot */}
      <main className="auth-main">
        <Outlet />
      </main>

    
    </div>
  );
}