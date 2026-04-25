import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, redirectByRole } from "../../store/AuthContext";
import {
  Mail, Lock, Eye, EyeOff,
  AlertCircle, Info, Loader2, ShieldCheck,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Same injectCSS utility as AppShell ── */
function injectCSS(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/* ── Uses AppShell CSS variables where possible:
   --shell-accent, --shell-accent-2, --shell-font, --shell-text,
   --shell-muted, --shell-border, --shell-trans, --shell-radius
   Falls back to literals when AppShell vars aren't loaded yet.
── */
const CSS = `
  .login-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: loginCardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes loginCardIn {
    from { opacity: 0; transform: translateY(24px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── Card — same shadow/border language as shell-sidebar ── */
  .login-card {
    background: #ffffff;
    border-radius: 20px;
    box-shadow:
      0 1px 3px rgba(0,0,0,0.04),
      0 8px 24px rgba(37,99,235,0.08),
      0 24px 48px rgba(37,99,235,0.06);
    border: 1px solid var(--shell-border, rgba(186,230,253,0.6));
    width: 100%;
    max-width: 440px;
    padding: 40px 40px 32px;
    position: relative;
    overflow: hidden;
  }
  .login-card::before {
    content: '';
    position: absolute;
    top: -60px; left: -60px;
    width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(147,197,253,0.15) 0%, transparent 70%);
    pointer-events: none;
  }

  /* ── Brand — mirrors shell-logo-bar ── */
  .login-brand { display: flex; align-items: center; gap: 12px; }
  .login-logo-mark {
    width: 40px; height: 40px; flex-shrink: 0;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(37,99,235,0.28);
  }
  .login-brand-text { display: flex; flex-direction: column; }
  .login-brand-name {
    font-size: 17px; font-weight: 700;
    color: var(--shell-text, #1e293b);
    letter-spacing: -0.4px; line-height: 1.1;
  }
  .login-brand-tagline {
    font-size: 11px; font-weight: 500;
    color: var(--shell-accent, #2563eb);
    letter-spacing: 0.2px; margin-top: 2px;
  }

  /* ── Divider — same as shell-border ── */
  .login-divider {
    height: 1px;
    background: linear-gradient(to right, #dbeafe, #bae6fd, transparent);
    margin: 22px 0;
  }

  /* ── Heading ── */
  .login-heading h1 {
    font-size: 24px; font-weight: 800;
    color: var(--shell-text, #1e293b);
    letter-spacing: -0.5px; margin: 0 0 6px;
  }
  .login-heading p {
    font-size: 13.5px;
    color: var(--shell-muted, #94a3b8);
    margin: 0 0 24px; line-height: 1.5;
  }

  /* ── Banners ── */
  .login-error-banner {
    display: flex; align-items: center; gap: 10px;
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 10px; padding: 11px 14px; margin-bottom: 18px;
    color: #dc2626; font-size: 13px; font-weight: 500;
    animation: loginShake 0.4s ease;
  }
  .login-info-banner {
    display: flex; align-items: center; gap: 10px;
    background: #eff6ff; border: 1px solid #bfdbfe;
    border-radius: 10px; padding: 11px 14px; margin-bottom: 18px;
    color: var(--shell-accent, #2563eb); font-size: 13px; font-weight: 500;
  }
  @keyframes loginShake {
    0%  { transform: translateX(0); }   20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); } 60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); } 100%{ transform: translateX(0); }
  }

  /* ── Form ── */
  .login-form { display: flex; flex-direction: column; gap: 16px; }

  .login-field { display: flex; flex-direction: column; gap: 5px; }
  .login-field label {
    font-size: 12.5px; font-weight: 600;
    color: var(--shell-text, #1e293b); letter-spacing: 0.1px;
  }

  /* ── Input — same height/radius as shell-search-wrap ── */
  .login-input-wrap { position: relative; display: flex; align-items: center; }
  .login-input-icon {
    position: absolute; left: 12px;
    display: flex; align-items: center;
    color: var(--shell-muted, #94a3b8);
    pointer-events: none;
    transition: color var(--shell-trans, 0.22s cubic-bezier(.4,0,.2,1));
  }
  .login-input-wrap input {
    width: 100%; height: 44px;
    padding: 0 42px 0 38px;
    border-radius: 10px;
    border: 1.5px solid var(--shell-border, rgba(0,0,0,0.08));
    background: var(--shell-surface, #f0f4fa);
    font-size: 14px;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    color: var(--shell-text, #1e293b);
    outline: none;
    transition: border-color var(--shell-trans, 0.22s), background var(--shell-trans, 0.22s), box-shadow var(--shell-trans, 0.22s);
    box-sizing: border-box;
  }
  .login-input-wrap input::placeholder { color: var(--shell-muted, #94a3b8); }
  .login-input-wrap input:hover {
    border-color: rgba(37,99,235,0.3);
    background: #fff;
  }
  .login-input-wrap input:focus {
    border-color: var(--shell-accent, #2563eb);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
  }
  .login-input-wrap:focus-within .login-input-icon {
    color: var(--shell-accent, #2563eb);
  }

  /* Error state */
  .login-field--error .login-input-wrap input {
    border-color: #f87171; background: #fff7f7;
  }
  .login-field--error .login-input-wrap input:focus {
    box-shadow: 0 0 0 3px rgba(239,68,68,0.1);
    border-color: #ef4444;
  }
  .login-field-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; padding-left: 2px; }

  /* Eye toggle */
  .login-pwd-toggle {
    position: absolute; right: 11px;
    background: none; border: none; cursor: pointer;
    color: var(--shell-muted, #94a3b8);
    display: flex; align-items: center;
    padding: 4px; border-radius: 6px;
    transition: color var(--shell-trans, 0.22s), background var(--shell-trans, 0.22s);
  }
  .login-pwd-toggle:hover {
    color: var(--shell-accent, #2563eb);
    background: var(--shell-hover, rgba(37,99,235,0.07));
  }

  /* ── Remember + Forgot row ── */
  .login-row { display: flex; align-items: center; justify-content: space-between; }

  .login-checkbox {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; font-size: 13px;
    color: var(--shell-text, #1e293b);
    font-weight: 500; user-select: none;
  }
  .login-checkbox input[type="checkbox"] { display: none; }
  .login-checkbox-box {
    width: 16px; height: 16px; border-radius: 4px;
    border: 1.5px solid var(--shell-border, rgba(0,0,0,0.15));
    background: #fff;
    display: flex; align-items: center; justify-content: center;
    transition: border-color var(--shell-trans, 0.22s), background var(--shell-trans, 0.22s);
    flex-shrink: 0; position: relative;
  }
  .login-checkbox input:checked ~ .login-checkbox-box {
    background: var(--shell-accent, #2563eb);
    border-color: var(--shell-accent, #2563eb);
  }
  .login-checkbox input:checked ~ .login-checkbox-box::after {
    content: '';
    position: absolute;
    width: 8px; height: 4.5px;
    border-left: 2px solid #fff;
    border-bottom: 2px solid #fff;
    transform: rotate(-45deg) translateY(-1px);
  }

  .login-forgot {
    font-size: 13px; font-weight: 600;
    color: var(--shell-accent, #2563eb);
    text-decoration: none;
    transition: color var(--shell-trans, 0.22s);
  }
  .login-forgot:hover { color: #1d4ed8; text-decoration: underline; }

  /* ── Submit button — same gradient as shell-logo-mark ── */
  .login-btn {
    height: 46px; width: 100%;
    border-radius: 10px; border: none;
    background: linear-gradient(135deg, var(--shell-accent, #2563eb) 0%, var(--shell-accent-2, #7c3aed) 100%);
    color: #fff;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    font-size: 14.5px; font-weight: 700; letter-spacing: 0.1px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
    box-shadow: 0 4px 14px rgba(37,99,235,0.35);
    margin-top: 4px;
  }
  .login-btn:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 6px 20px rgba(37,99,235,0.4);
    transform: translateY(-1px);
  }
  .login-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(37,99,235,0.3);
  }
  .login-btn:disabled { opacity: 0.72; cursor: not-allowed; }

  /* Spinner — same as AppShell page transitions */
  .login-spinner { animation: loginSpin 0.8s linear infinite; }
  @keyframes loginSpin { to { transform: rotate(360deg); } }

  /* ── Security badge ── */
  .login-security {
    display: flex; align-items: center; gap: 6px;
    font-size: 11.5px;
    color: var(--shell-muted, #94a3b8);
    font-weight: 500;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
  }

  @media (max-width: 480px) {
    .login-card { padding: 28px 20px 24px; border-radius: 16px; }
    .login-heading h1 { font-size: 21px; }
  }
`;

/* ── Logo SVG — mirrors shell-logo-mark gradient ── */
const LogoMark = () => (
  <svg viewBox="0 0 40 40" fill="none" className="login-logo-mark">
    <rect width="40" height="40" rx="10" fill="url(#lgGrad)"/>
    <defs>
      <linearGradient id="lgGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2563EB"/>
        <stop offset="1" stopColor="#7C3AED"/>
      </linearGradient>
    </defs>
    <path d="M10 28L20 12l10 16H10z" fill="white" opacity="0.9"/>
    <circle cx="20" cy="12" r="3" fill="white"/>
  </svg>
);

export default function Login() {
  injectCSS("login-styles", CSS);

  const navigate = useNavigate();
  const { login, sessionMsg, setMsg } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [touched, setTouched]   = useState({ email: false, password: false });

  const emailErr    = touched.email    && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const passwordErr = touched.password && password.length < 6;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!email || !password || emailErr || passwordErr) return;

    setLoading(true);
    setError("");
    if (sessionMsg) setMsg("");

    try {
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      login(data.user, data.accessToken, data.refreshToken);
      redirectByRole(data.user, navigate);

    } catch {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">

        {/* Brand — same structure as shell-logo-bar */}
        <div className="login-brand">
          <LogoMark />
          <div className="login-brand-text">
            <span className="login-brand-name">Pragati Mitra</span>
            <span className="login-brand-tagline">AIIA</span>
          </div>
        </div>

        <div className="login-divider" />

        <div className="login-heading">
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        {sessionMsg && (
          <div className="login-info-banner" role="status">
            <Info size={17} /><span>{sessionMsg}</span>
          </div>
        )}
        {error && (
          <div className="login-error-banner" role="alert">
            <AlertCircle size={17} /><span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} noValidate>

          <div className={`login-field ${emailErr ? "login-field--error" : ""}`}>
            <label htmlFor="email">Email address</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><Mail size={16} /></span>
              <input
                id="email" type="email" autoComplete="email"
                placeholder="you@organization.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                disabled={loading}
              />
            </div>
            {emailErr && <span className="login-field-msg">Please enter a valid email address.</span>}
          </div>

          <div className={`login-field ${passwordErr ? "login-field--error" : ""}`}>
            <label htmlFor="password">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><Lock size={16} /></span>
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                disabled={loading}
              />
              <button
                type="button" className="login-pwd-toggle"
                onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordErr && <span className="login-field-msg">Password must be at least 6 characters.</span>}
          </div>

          <div className="login-row">
            <label className="login-checkbox">
              <input type="checkbox" disabled={loading} />
              <span className="login-checkbox-box" />
              <span>Remember me</span>
            </label>
            <a href="#forgot" className="login-forgot">Forgot password?</a>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? <><Loader2 size={17} className="login-spinner" /><span>Signing in…</span></>
              : "Sign in"
            }
          </button>
        </form>
      </div>

      
    </div>
  );
}