import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

/* ─── SVG Icons ─────────────────────────────────────────── */
const IconEmail = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 7l7.293 4.646a1.2 1.2 0 001.414 0L18 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="13.5" r="1.5" fill="currentColor"/>
  </svg>
);
const IconEye = ({ off }) =>
  off ? (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
const IconAlert = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="10" y1="6" x2="10" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="10" cy="14" r="1" fill="currentColor"/>
  </svg>
);
const IconSpinner = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-spinner">
    <circle cx="10" cy="10" r="7" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
    <path d="M10 3a7 7 0 017 7" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

/* ─── Logo ───────────────────────────────────────────────── */
const LogoMark = () => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-mark">
    <rect width="40" height="40" rx="10" fill="#2563EB"/>
    <path d="M10 28L20 12l10 16H10z" fill="white" opacity="0.9"/>
    <circle cx="20" cy="12" r="3" fill="white"/>
  </svg>
);

/* ─── Role → route map ───────────────────────────────────── */
const ROLE_REDIRECT = {
  admin:    "/dashboard/admin",
  faculty:  "/dashboard/faculty",
  student:  "/dashboard/student",
  staff:    "/dashboard/staff",
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ─── Component ──────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [rememberMe, setRemember] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [touched, setTouched]     = useState({ email: false, password: false });

  /* Inline validation */
  const emailErr    = touched.email    && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const passwordErr = touched.password && password.length < 6;

  /* Submit */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    if (!email || !password || emailErr || passwordErr) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      /* Persist auth data */
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("pm_token", data.token);
      storage.setItem("pm_user",  JSON.stringify(data.user));

      /* Route based on must_change_password first */
      if (data.user.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }

      /* Route based on role */
      const roleName = (data.user.roleName || "").toLowerCase();
      const redirect = ROLE_REDIRECT[roleName] || "/dashboard";
      navigate(redirect, { replace: true });

    } catch (err) {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <LogoMark />
          <div className="login-brand-text">
            <span className="login-brand-name">Pragati Mitra</span>
            <span className="login-brand-tagline">AIIA</span>
          </div>
        </div>

        <div className="login-divider" />

        {/* Heading */}
        <div className="login-heading">
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="login-error-banner" role="alert">
            <IconAlert />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div className={`login-field ${emailErr ? "login-field--error" : ""}`}>
            <label htmlFor="email">Email address</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><IconEmail /></span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@organization.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={emailErr}
                disabled={loading}
              />
            </div>
            {emailErr && (
              <span className="login-field-msg">Please enter a valid email address.</span>
            )}
          </div>

          {/* Password */}
          <div className={`login-field ${passwordErr ? "login-field--error" : ""}`}>
            <label htmlFor="password">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><IconLock /></span>
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={passwordErr}
                disabled={loading}
              />
              <button
                type="button"
                className="login-pwd-toggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                <IconEye off={showPwd} />
              </button>
            </div>
            {passwordErr && (
              <span className="login-field-msg">Password must be at least 6 characters.</span>
            )}
          </div>

          {/* Remember + Forgot */}
          <div className="login-row">
            <label className="login-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={loading}
              />
              <span className="login-checkbox-box" />
              <span>Remember me</span>
            </label>
            <a href="#forgot" className="login-forgot">Forgot password?</a>
          </div>

          {/* Submit */}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <IconSpinner />
                <span>Signing in…</span>
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>

     
     
    </div>
  );
}