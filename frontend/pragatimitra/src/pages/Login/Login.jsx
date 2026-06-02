import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, redirectByRole } from "../../store/AuthContext";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Info, Loader2 } from "lucide-react";

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

/* Premium SaaS login: logo + brand above a single white card holding only the
   form. No marketing text, badges, illustrations, or footer. Solid #2563EB. */
const CSS = `
  .login-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: loginCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes loginCardIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Logo anchor ── */
  .login-logo {
    width: 56px; height: 56px;
    border-radius: 14px;
    background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 700; letter-spacing: -0.5px;
    box-shadow: 0 6px 16px rgba(37,99,235,0.25);
  }

  /* ── Brand (above the card) ── */
  .login-brand { text-align: center; }
  .login-brand-name {
    font-size: 32px; font-weight: 700;
    letter-spacing: -0.5px; color: #0f172a; margin: 0;
  }
  .login-brand-sub {
    font-size: 15px; font-weight: 400; color: #64748b; margin: 6px 0 0;
  }

  /* ── Card ── */
  .login-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(15,23,42,0.08);
    width: 440px;
    max-width: 92vw;
    padding: 30px 34px;
    box-sizing: border-box;
    margin-top: 4px;
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
    color: #2563eb; font-size: 13px; font-weight: 500;
  }
  @keyframes loginShake {
    0%  { transform: translateX(0); }   20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); } 60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); } 100%{ transform: translateX(0); }
  }

  /* ── Form ── */
  .login-form { display: flex; flex-direction: column; gap: 16px; }

  .login-field { display: flex; flex-direction: column; gap: 6px; }
  .login-field label {
    font-size: 13px; font-weight: 600; color: #334155;
  }

  /* ── Input ── */
  .login-input-wrap { position: relative; display: flex; align-items: center; }
  .login-input-icon {
    position: absolute; left: 14px;
    display: flex; align-items: center; color: #94a3b8;
    pointer-events: none; transition: color 0.15s;
  }
  .login-input-wrap input {
    width: 100%; height: 48px;
    padding: 0 44px 0 42px;
    border-radius: 12px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    font-size: 14px;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    color: #1e293b;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .login-input-wrap input::placeholder { color: #94a3b8; }
  .login-input-wrap input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.10);
  }
  .login-input-wrap:focus-within .login-input-icon { color: #2563eb; }

  /* Error state */
  .login-field--error .login-input-wrap input { border-color: #f87171; }
  .login-field--error .login-input-wrap input:focus {
    box-shadow: 0 0 0 4px rgba(239,68,68,0.1);
    border-color: #ef4444;
  }
  .login-field-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; padding-left: 2px; }

  /* Eye toggle */
  .login-pwd-toggle {
    position: absolute; right: 12px;
    background: none; border: none; cursor: pointer;
    color: #94a3b8; display: flex; align-items: center;
    padding: 4px; border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }
  .login-pwd-toggle:hover { color: #2563eb; background: #f1f5f9; }

  /* ── Remember + Forgot row ── */
  .login-row { display: flex; align-items: center; justify-content: space-between; }

  .login-checkbox {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; font-size: 14px; color: #334155;
    font-weight: 500; user-select: none;
  }
  .login-checkbox input[type="checkbox"] { display: none; }
  .login-checkbox-box {
    width: 16px; height: 16px; border-radius: 4px;
    border: 1.5px solid #cbd5e1; background: #fff;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s, background 0.15s;
    flex-shrink: 0; position: relative;
  }
  .login-checkbox input:checked ~ .login-checkbox-box {
    background: #2563eb; border-color: #2563eb;
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
    font-size: 14px; font-weight: 500;
    color: #475569; text-decoration: none;
    transition: color 0.15s;
  }
  .login-forgot:hover { color: #2563eb; }

  /* ── Submit button ── */
  .login-btn {
    height: 48px; width: 100%;
    border-radius: 12px; border: none;
    background: #2563eb;
    color: #fff;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    font-size: 14.5px; font-weight: 700; letter-spacing: 0.1px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.15s, transform 0.15s;
    margin-top: 6px;
  }
  .login-btn:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
  .login-btn:disabled { opacity: 0.7; cursor: not-allowed; }

  .login-spinner { animation: loginSpin 0.8s linear infinite; }
  @keyframes loginSpin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .login-card { padding: 24px 22px; }
    .login-brand-name { font-size: 27px; }
  }
`;

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
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      login(data.user, data.accessToken);
      redirectByRole(data.user, navigate);

    } catch {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">

      {/* Logo anchor */}
      <div></div>

      {/* Brand */}
      <div className="login-brand">
        <h1 className="login-brand-name">PragatiMitra</h1>
        <p className="login-brand-sub">Sign in to your account</p>
      </div>

      <div className="login-card">

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
              : "Sign In"
            }
          </button>
        </form>
      </div>
    </div>
  );
}
