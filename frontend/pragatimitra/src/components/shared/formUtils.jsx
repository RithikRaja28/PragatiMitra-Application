import React from "react";

/* ─── Shared style tokens used across all management form screens ─── */
export const S = {
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#334155",
    marginBottom: 6,
  },
  input: (hasError) => ({
    width: "100%",
    height: 40,
    padding: "0 14px",
    border: `1px solid ${hasError ? "#f87171" : "#cbd5e1"}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    transition: "border-color .15s, box-shadow .15s",
  }),
  select: (hasError) => ({
    width: "100%",
    height: 40,
    padding: "0 36px 0 14px",
    border: `1px solid ${hasError ? "#f87171" : "#cbd5e1"}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    fontWeight: 500,
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    background:
      "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\") no-repeat right 13px center",
    appearance: "none",
    transition: "border-color .15s, box-shadow .15s",
  }),
  errorText: {
    fontSize: 11,
    color: "#dc2626",
    marginTop: 4,
  },
  btnPrimary: (disabled) => ({
    padding: "0 20px",
    height: 40,
    borderRadius: 8,
    border: "none",
    background: disabled ? "#93c5fd" : "#2563eb",
    fontSize: 13,
    fontFamily: "inherit",
    fontWeight: 700,
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s",
  }),
  btnGhost: {
    padding: "0 16px",
    height: 40,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontSize: 13,
    fontFamily: "inherit",
    fontWeight: 600,
    color: "#475569",
    cursor: "pointer",
    transition: "background .15s, border-color .15s",
  },
};

export function Toast({ message, type }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 24,
        background: type === "error" ? "#dc2626" : "#1e293b",
        color: "#fff",
        padding: "13px 20px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        maxWidth: 440,
        lineHeight: 1.55,
      }}
    >
      {type === "error" ? "✕  " : "✓  "}
      {message}
    </div>
  );
}

/**
 * ConfirmDialog – inline modal replacement for window.confirm.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   // trigger:
 *   setConfirm({ title: "Delete cycle?", message: "...", variant: "danger",
 *                confirmLabel: "Delete", onConfirm: () => doDelete() });
 *
 *   // in JSX:
 *   {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
 *
 * Props:
 *   title        – bold heading
 *   message      – body text (string or JSX)
 *   variant      – "danger" | "warning" | "default"  (controls confirm button colour)
 *   confirmLabel – label for the confirm button (default "Confirm")
 *   onConfirm    – called when user clicks confirm
 *   onCancel     – called when user clicks Cancel or the backdrop
 */
export function ConfirmDialog({ title, message, variant = "default", confirmLabel = "Confirm", onConfirm, onCancel }) {
  const confirmBg = variant === "danger"  ? "#ef4444"
                  : variant === "warning" ? "#d97706"
                  : "#2563eb";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420,
          padding: "28px 28px 22px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            background: variant === "danger"  ? "#fef2f2"
                      : variant === "warning" ? "#fef3c7"
                      : "#eff6ff",
          }}>
            {variant === "danger" ? "🗑️" : variant === "warning" ? "⚠️" : "ℹ️"}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{title}</div>
        </div>

        {/* Body */}
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 22 }}>
          {message}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: 8,
              border: "1px solid #cbd5e1", background: "#fff",
              fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: confirmBg, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function isAuthError(err) {
  const m = err?.message || "";
  return (
    m.includes("Session expired") ||
    m.includes("signed in from another device") ||
    m.includes("sign in again")
  );
}

export function formatDate(iso, lang = "en") {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
