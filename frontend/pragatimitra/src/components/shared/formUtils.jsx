import React from "react";

/* ─── Shared style tokens used across all management form screens ─── */
export const S = {
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  input: (hasError) => ({
    width: "100%",
    padding: "9px 12px",
    border: `1.5px solid ${hasError ? "#f87171" : "#e2e8f0"}`,
    borderRadius: 9,
    fontSize: 13,
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    transition: "border-color .15s",
  }),
  select: (hasError) => ({
    width: "100%",
    padding: "9px 32px 9px 12px",
    border: `1.5px solid ${hasError ? "#f87171" : "#e2e8f0"}`,
    borderRadius: 9,
    fontSize: 13,
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
    background:
      "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E\") no-repeat right 12px center",
    appearance: "none",
    transition: "border-color .15s",
  }),
  errorText: {
    fontSize: 11,
    color: "#dc2626",
    marginTop: 4,
  },
  btnPrimary: (disabled) => ({
    padding: "9px 22px",
    borderRadius: 9,
    border: "none",
    background: disabled ? "#93c5fd" : "#2563eb",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  btnGhost: {
    padding: "9px 20px",
    borderRadius: 9,
    border: "1.5px solid #e2e8f0",
    background: "#fff",
    fontSize: 13,
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
