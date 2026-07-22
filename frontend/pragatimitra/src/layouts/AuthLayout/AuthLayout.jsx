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

/* Minimal enterprise auth shell: a single centered card on the same light
   gray application background — no gradient, no blobs, no floating icons,
   no footer. Matches the global app surface so login belongs to the product. */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .auth-root {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    background: #f4f6f8;
    background-image: radial-gradient(circle at top right, rgba(37,99,235,0.04), transparent 30%);
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: clamp(40px, 11vh, 130px) 16px 40px;
  }

  .auth-main {
    width: 100%;
    display: flex;
    justify-content: center;
  }
`;

export default function AuthLayout() {
  injectCSS("auth-layout-styles", CSS);

  return (
    <div className="auth-root">
      <main className="auth-main">
        <Outlet />
      </main>
    </div>
  );
}
