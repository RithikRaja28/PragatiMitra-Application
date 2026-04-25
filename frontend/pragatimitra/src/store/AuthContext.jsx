import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

const API_BASE     = import.meta.env.VITE_API_URL || "http://localhost:5000";
const IDLE_TIMEOUT = 60 * 60 * 1000;
const TOKEN_KEY    = "pm_token";
const USER_KEY     = "pm_user";

const AuthContext = createContext(null);

// Keys must match the `name` column in the roles table (machine key).
// Order here is priority — when a user has multiple roles, the first match wins.
export const ROLE_ROUTES = {
  super_admin:              "/dashboard/super-admin",
  institute_admin:          "/dashboard/institute-admin",
  publication_cell:         "/dashboard/publication-cell",
  department_admin:         "/dashboard/department-admin",
  head_of_department:       "/dashboard/head-of-department",
  nodal_officer:            "/dashboard/nodal-officer",
  contributor:              "/dashboard/contributor",
  reviewer:                 "/dashboard/reviewer",
  finance_officer:          "/dashboard/finance-officer",
  directors_office:         "/dashboard/directors-office",
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

function isTokenExpired(token) {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1]));
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getStoredSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user  = JSON.parse(localStorage.getItem(USER_KEY));
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMsg, setMsg]  = useState("");

  const idleTimer = useRef(null);

  const logout = useCallback((message = "") => {
    clearSession();
    setUser(null);
    setToken(null);
    clearTimeout(idleTimer.current);
    if (message) setMsg(message);
    fetch(`${API_BASE}/api/auth/logout`, { method: "POST" }).catch(() => {});
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

  /* ── Restore session on page load ── */
  useEffect(() => {
    const { token: storedToken, user: storedUser } = getStoredSession();

    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    if (isTokenExpired(storedToken)) {
      clearSession();
      setMsg("Your session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    // Verify with server — catches invalidated tokens (signed in on another device)
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          clearSession();
          setMsg(
            data.invalidated
              ? "Your account was signed in from another device. Please sign in again."
              : "Your session expired. Please sign in again."
          );
          setLoading(false);
          return;
        }
        saveSession(storedToken, data.user);
        setUser(data.user);
        setToken(storedToken);
        resetIdle();
        setLoading(false);
      })
      .catch(() => {
        // Network error — restore from cache so app still works offline
        setUser(storedUser);
        setToken(storedToken);
        resetIdle();
        setLoading(false);
      });
  }, []); // eslint-disable-line

  const login = useCallback((userData, jwtToken) => {
    saveSession(jwtToken, userData);
    setUser(userData);
    setToken(jwtToken);
    setMsg("");
    resetIdle();
  }, [resetIdle]);

  return (
    <AuthContext.Provider value={{
      user, token, loading, sessionMsg,
      login, logout, setMsg,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
