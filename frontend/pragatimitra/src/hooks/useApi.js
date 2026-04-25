import { useCallback } from "react";
import { useAuth } from "../store/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useApi() {
  const { accessToken: token, logout } = useAuth();

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const message = data.invalidated
          ? "Your account was signed in from another device. Please sign in again."
          : data.message || "Session expired. Please sign in again.";
        logout(message);
        throw new Error(message);
      }

      return res;
    },
    [token, logout]
  );

  return { apiFetch };
}
