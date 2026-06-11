import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

const TYPE_STYLE = {
  success: { bg: "#f0fdf4", border: "#86efac", icon: "✓", iconColor: "#16a34a", titleColor: "#15803d" },
  error:   { bg: "#fef2f2", border: "#fca5a5", icon: "✕", iconColor: "#dc2626", titleColor: "#b91c1c" },
  info:    { bg: "#eff6ff", border: "#93c5fd", icon: "i", iconColor: "#2563eb", titleColor: "#1d4ed8" },
  warning: { bg: "#fffbeb", border: "#fcd34d", icon: "!", iconColor: "#d97706", titleColor: "#b45309" },
};

function ToastItem({ id, message, type = "success", onRemove }) {
  const s = TYPE_STYLE[type] || TYPE_STYLE.info;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "14px 16px", borderRadius: 12, marginBottom: 10,
      background: s.bg, border: `1px solid ${s.border}`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      minWidth: 280, maxWidth: 380,
      animation: "slideInRight 0.22s ease",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", background: s.iconColor,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
      }}>
        {s.icon}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: s.titleColor, fontWeight: 600, lineHeight: 1.4 }}>
        {message}
      </div>
      <button onClick={() => onRemove(id)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#94a3b8", fontSize: 15, lineHeight: 1, padding: "0 2px", flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success", duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div style={{
        position: "fixed", top: 20, right: 20, zIndex: 99999,
        display: "flex", flexDirection: "column", alignItems: "flex-end",
        pointerEvents: "none",
      }}>
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(40px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "all" }}>
            <ToastItem {...t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/* Simple inline Toast for pages that manage their own toast state */
function Toast({ type = "success", message, onClose }) {
  if (!message) return null;
  const s = TYPE_STYLE[type] || TYPE_STYLE.info;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 99999,
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "14px 16px", borderRadius: 12,
      background: s.bg, border: `1px solid ${s.border}`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
      minWidth: 280, maxWidth: 380,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      animation: "slideInRight 0.22s ease",
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", background: s.iconColor,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
      }}>
        {s.icon}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: s.titleColor, fontWeight: 600, lineHeight: 1.4 }}>
        {message}
      </div>
      {onClose && (
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#94a3b8", fontSize: 15, lineHeight: 1, padding: "0 2px", flexShrink: 0,
        }}>✕</button>
      )}
    </div>
  );
}

export default Toast;
