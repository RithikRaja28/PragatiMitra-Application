/**
 * src/ui/tokens.js — single source of truth for the Institution Admin design
 * system (enterprise/SaaS standardization pass).
 *
 * Opt-in: import what you need. Nothing here changes existing pages until they
 * migrate. Colors/sizes follow the agreed spec exactly.
 */

export const color = {
  bg:          "#F5F7FA",
  surface:     "#FFFFFF",
  nav:         "#081225",
  primary:     "#2563EB",
  primaryHover:"#1D4ED8",
  primarySoft: "#EFF4FF",
  success:     "#16A34A",
  warning:     "#F59E0B",
  danger:      "#DC2626",
  dangerHover: "#B91C1C",
  text:        "#111827",
  muted:       "#6B7280",
  border:      "#E5E7EB",
  borderStrong:"#D1D5DB",
  hover:       "#F3F4F6",
  rowHover:    "#F8FAFC",
};

export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, "3xl": 32 };
/* Squared, professional scale — cards/modals/tables stay crisp (8px), controls
   6px (matches the app shell). Lowered from the old 10–16 "bubbly" values. */
export const radius = { sm: 4, md: 6, lg: 8, xl: 8, pill: 9999 };

export const shadow = {
  card:  "0 1px 2px rgba(16,24,40,0.04)",
  pop:   "0 8px 24px rgba(16,24,40,0.12)",
  modal: "0 24px 64px rgba(16,24,40,0.22)",
};

export const size = {
  headerH:    72,
  sidebarW:   280,
  control:    40,   // buttons
  input:      44,   // form fields
  rowH:       64,   // table rows
  maxContent: 1600,
  pagePad:    32,
};

export const font = { family: "'Plus Jakarta Sans', sans-serif" };

export const z = { dropdown: 9000, modal: 10000, toast: 11000 };

/* Inject base UI CSS once: focus-visible ring, thin scrollbars, fade/scale
   keyframes for overlays, and an ellipsis utility. Importing any ui/* module
   triggers this (side-effect), so pages get consistent base styles for free. */
let injected = false;
export function injectUiBase() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.id = "ui-base";
  el.textContent = `
    .ui-focusable:focus-visible,
    .ui-btn:focus-visible,
    .ui-menu-item:focus-visible {
      outline: 2px solid ${color.primary};
      outline-offset: 2px;
    }
    .ui-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ui-scroll { scrollbar-width: thin; scrollbar-color: ${color.border} transparent; }
    .ui-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
    .ui-scroll::-webkit-scrollbar-thumb { background: ${color.border}; border-radius: 8px; }
    @keyframes ui-overlay-in { from { opacity: 0 } to { opacity: 1 } }
    @keyframes ui-modal-in { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
    @keyframes ui-menu-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
    @keyframes ui-skeleton { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }
    @keyframes spin { to { transform: rotate(360deg) } }
  `;
  document.head.appendChild(el);
}
injectUiBase();
