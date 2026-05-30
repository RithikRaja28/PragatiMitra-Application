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
    padding: "10px 14px",
    border: `1px solid ${hasError ? "#f87171" : "#cbd5e1"}`,
    borderRadius: 8,
    fontSize: 13,
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    transition: "border-color .15s",
  }),
  select: (hasError) => ({
    width: "100%",
    height: 40,
    padding: "0 36px 0 14px",
    border: `1px solid ${hasError ? "#f87171" : "#cbd5e1"}`,
    borderRadius: 8,
    fontSize: 13,
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
    padding: "0 16px",
    height: 34,
    borderRadius: 8,
    border: "none",
    background: disabled ? "#7dd3e8" : "#0891b2",
    fontSize: 12.5,
    fontWeight: 700,
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  btnGhost: {
    padding: "0 14px",
    height: 34,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
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

export function isAuthError(err) {
  const m = err?.message || "";
  return (
    m.includes("Session expired") ||
    m.includes("signed in from another device") ||
    m.includes("sign in again")
  );
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
