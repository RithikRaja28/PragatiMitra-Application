import { useCallback } from "react";
import { useAuth } from "../store/AuthContext";
import { API_BASE } from "../services/api";

export function useApi() {
  const { accessToken: token, logout, user } = useAuth();

  const apiFetch = useCallback(
    async (path, options = {}) => {
      // Attach the institution's currently-selected academic year (top-bar
      // context, persisted in sessionStorage) so the backend can enforce
      // academic-year locks against the year the user is actually working in.
      let academicYear = null;
      try {
        const instId = user?.institutionId;
        if (instId) academicYear = sessionStorage.getItem(`pm_academic_year_${instId}`);
      } catch { /* sessionStorage unavailable — header simply omitted */ }

      // FormData bodies must let the browser set Content-Type itself (it needs
      // to add the multipart boundary) — forcing application/json here would
      // send an unparseable body.
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(academicYear ? { "X-Academic-Year": academicYear } : {}),
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
    [token, logout, user]
  );

  return { apiFetch };
}
