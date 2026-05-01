import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();

  // Wait until session restore is complete
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6B7280",
        fontSize: "15px",
        fontFamily: "sans-serif",
      }}>
        Loading…
      </div>
    );
  }

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />;

  // Wrong role → go to unauthorized
  if (allowedRoles?.length) {
   if (!allowedRoles.some((r) => r.toLowerCase() === (user?.roles?.[0]?.name || "").toLowerCase())) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}