import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

const API_BASE         = import.meta.env.VITE_API_URL || "http://localhost:5000";
const IDLE_TIMEOUT     = 60 * 60 * 1000;
const REFRESH_INTERVAL = 14 * 60 * 1000;

const AuthContext = createContext(null);

export const ROLE_ROUTES = {
  "super admin":              "/dashboard/super-admin",
  "institute admin":          "/dashboard/institute-admin",
  "publication cell":         "/dashboard/publication-cell",
  "department admin":         "/dashboard/department-admin",
  "head of department":       "/dashboard/head-of-department",
  "department nodal officer": "/dashboard/nodal-officer",
  "contributor":              "/dashboard/contributor",
  "reviewer":                 "/dashboard/reviewer",
  "finance officer/s":        "/dashboard/finance-officer",
  "director's office":        "/dashboard/directors-office",
};

export function redirectByRole(user, navigate) {
  if (user.mustChangePassword) {
    navigate("/change-password", { replace: true });
    return;
  }
  const role  = (user.roleName || "").toLowerCase();
  navigate(ROLE_ROUTES[role] || "/dashboard", { replace: true });
}

export function AuthProvider({ children }) {
  const [user, setUser]          = useState(null);
  const [accessToken, setAccess] = useState(null);
  const [loading, setLoading]    = useState(true);
  const [sessionMsg, setMsg]     = useState("");

  const idleTimer    = useRef(null);
  const refreshTimer = useRef(null);

  const getRT   = () => localStorage.getItem("pm_refresh");
  const saveRT  = (t) => localStorage.setItem("pm_refresh", t);
  const clearRT = () => localStorage.removeItem("pm_refresh");

  const logout = useCallback(async (message = "") => {
    const rt = getRT();
    clearRT();
    setUser(null);
    setAccess(null);
    clearTimeout(idleTimer.current);
    clearInterval(refreshTimer.current);
    if (message) setMsg(message);
    if (rt) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
  }, []);

  const resetIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      logout("Your session expired due to inactivity. Please sign in again.");
    }, IDLE_TIMEOUT);
  }, [logout]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, resetIdle));
  }, [resetIdle]);

  const refreshAccess = useCallback(async () => {
    const rt = getRT();
    if (!rt) return;
    try {
      const res  = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const data = await res.json();
      if (data.expired || !data.success) {
        logout("Your session expired. Please sign in again.");
        return;
      }
      setAccess(data.accessToken);
    } catch {}
  }, [logout]);

  /* ── Restore session on page load ── */
  useEffect(() => {
    const rt = getRT();
    console.log("[Auth] RT from storage:", rt ? "found" : "not found");

    if (!rt) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/auth/me?refreshToken=${encodeURIComponent(rt)}`)
      .then((r) => r.json())
      .then((data) => {
        console.log("[Auth] /me response:", data);
        if (!data.success) {
          clearRT();
          if (data.expired) setMsg("Your session expired. Please sign in again.");
          setLoading(false);
          return;
        }
        setUser(data.user);
        setAccess(data.accessToken);
        resetIdle();
        refreshTimer.current = setInterval(refreshAccess, REFRESH_INTERVAL);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[Auth] /me fetch error:", err);
        setLoading(false);
      });

    return () => {
      clearTimeout(idleTimer.current);
      clearInterval(refreshTimer.current);
    };
  }, []); // eslint-disable-line

  const login = useCallback((userData, access, refresh) => {
    console.log("[Auth] login called, saving RT:", refresh ? "yes" : "no");
    saveRT(refresh);
    setUser(userData);
    setAccess(access);
    setMsg("");
    resetIdle();
    clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(refreshAccess, REFRESH_INTERVAL);
  }, [resetIdle, refreshAccess]);

  return (
    <AuthContext.Provider value={{
      user, accessToken, loading, sessionMsg,
      login, logout, setMsg,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}