import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

const API_BASE         = import.meta.env.VITE_API_URL || "http://localhost:5000";
const IDLE_TIMEOUT     = 60 * 60 * 1000;
const REFRESH_INTERVAL = 14 * 60 * 1000;

const AuthContext = createContext(null);

// ✅ ALL keys are snake_case to match backend exactly
export const ROLE_ROUTES = {
  super_admin:                "/dashboard/super-admin",
  institute_admin:            "/dashboard/institute-admin",
  publication_cell:           "/dashboard/publication-cell",
  department_admin:           "/dashboard/department-admin",
  head_of_department:         "/dashboard/head-of-department",
  nodal_officer:   "/dashboard/nodal-officer",
  contributor:                "/dashboard/contributor",
  reviewer:                   "/dashboard/reviewer",
  finance_officer:            "/dashboard/finance-officer",
  directors_office:           "/dashboard/directors-office",
};

export function redirectByRole(user, navigate) {
  if (user.mustChangePassword) {
    navigate("/change-password", { replace: true });
    return;
  }
  const roleNames = new Set((user.roles || []).map((r) => r.name));
  const match = Object.keys(ROLE_ROUTES).find((key) => roleNames.has(key));
  navigate(ROLE_ROUTES[match] || "/dashboard", { replace: true });
}

export function AuthProvider({ children }) {
  const [user, setUser]          = useState(null);
  const [accessToken, setAccess] = useState(null);
  const [loading, setLoading]    = useState(true);
  const [sessionMsg, setMsg]     = useState("");

  const idleTimer    = useRef(null);
  const refreshTimer = useRef(null);

  const logout = useCallback((message = "") => {
    localStorage.removeItem("pm_user");
    setUser(null);
    setAccess(null);
    clearTimeout(idleTimer.current);
    clearInterval(refreshTimer.current);
    if (message) setMsg(message);
    fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
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
    try {
      const res  = await fetch(`${API_BASE}/api/auth/refresh`, {
        method:      "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        logout(data.expired ? "Your session expired. Please sign in again." : "");
        return;
      }
      setAccess(data.accessToken);
    } catch {}
  }, [logout]);

  useEffect(() => {
    const cachedUser = (() => {
      try { return JSON.parse(localStorage.getItem("pm_user")); }
      catch { return null; }
    })();

    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          localStorage.removeItem("pm_user");
          if (data.expired) setMsg("Your session expired. Please sign in again.");
          setLoading(false);
          return;
        }
        localStorage.setItem("pm_user", JSON.stringify(data.user));
        setUser(data.user);
        setAccess(data.accessToken);
        resetIdle();
        refreshTimer.current = setInterval(refreshAccess, REFRESH_INTERVAL);
        setLoading(false);
      })
      .catch(() => {
        if (cachedUser) {
          setUser(cachedUser);
          resetIdle();
        }
        setLoading(false);
      });

    return () => {
      clearTimeout(idleTimer.current);
      clearInterval(refreshTimer.current);
    };
  }, []); // eslint-disable-line

  const login = useCallback((userData, newAccessToken) => {
    localStorage.setItem("pm_user", JSON.stringify(userData));
    setUser(userData);
    setAccess(newAccessToken);
    setMsg("");
    resetIdle();
    clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(refreshAccess, REFRESH_INTERVAL);
  }, [resetIdle, refreshAccess]);

  const updateUser = useCallback((updatedFields) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedFields };
      localStorage.setItem("pm_user", JSON.stringify(merged));
      return merged;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user, accessToken, loading, sessionMsg,
      login, logout, setMsg, updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}