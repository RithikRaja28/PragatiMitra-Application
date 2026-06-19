"use strict";
import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import { useAuth, ROLE_ROUTES } from "../../store/AuthContext";
import { Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function injectCSS(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

const CSS = `
  .sa-wrap {
    display: flex; flex-direction: column; align-items: center; gap: 20px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: saIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes saIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  .sa-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.07);
    width: 420px; max-width: 92vw;
    padding: 36px 38px 34px;
    box-sizing: border-box;
  }

  .sa-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #fef2f2; border: 1px solid #fecaca;
    color: #dc2626; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; font-weight: 700;
    letter-spacing: 0.4px; text-transform: uppercase;
    margin-bottom: 14px;
  }

  .sa-head { margin: 0 0 24px; }
  .sa-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.3px; }
  .sa-sub   { font-size: 13.5px; color: #64748b; margin: 6px 0 0; }

  .sa-banner {
    display: flex; align-items: center; gap: 10px;
    border-radius: 6px; padding: 11px 14px; margin-bottom: 18px;
    font-size: 13px; font-weight: 500;
    background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
    animation: saShake 0.4s ease;
  }
  @keyframes saShake {
    0%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)}
    60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} 100%{transform:translateX(0)}
  }

  .sa-form { display: flex; flex-direction: column; gap: 16px; }
  .sa-field { display: flex; flex-direction: column; gap: 7px; }
  .sa-field label { font-size: 13px; font-weight: 600; color: #334155; }

  .sa-inp { position: relative; display: flex; align-items: center; }
  .sa-inp-icon { position: absolute; left: 13px; display: flex; color: #94a3b8; pointer-events: none; transition: color .15s; }
  .sa-inp input {
    width: 100%; height: 46px; padding: 0 42px 0 40px;
    border-radius: 6px; border: 1px solid #cbd5e1; background: #fff;
    font-size: 14px; font-family: inherit; color: #1e293b; outline: none;
    transition: border-color .15s, box-shadow .15s; box-sizing: border-box;
  }
  .sa-inp input::placeholder { color: #94a3b8; }
  .sa-inp input:focus { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.10); }
  .sa-inp:focus-within .sa-inp-icon { color: #dc2626; }
  .sa-field--error .sa-inp input { border-color: #f87171; }
  .sa-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; }

  .sa-eye {
    position: absolute; right: 11px; background: none; border: none; cursor: pointer;
    color: #94a3b8; display: flex; padding: 4px; border-radius: 4px; transition: color .15s, background .15s;
  }
  .sa-eye:hover { color: #dc2626; background: #fef2f2; }

  .sa-btn {
    height: 46px; width: 100%; border-radius: 6px; border: none;
    background: #dc2626; color: #fff;
    font-family: inherit; font-size: 14.5px; font-weight: 700; letter-spacing: 0.1px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background .15s; margin-top: 4px;
  }
  .sa-btn:hover:not(:disabled) { background: #b91c1c; }
  .sa-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .sa-spin { animation: saSpin 0.8s linear infinite; }
  @keyframes saSpin { to { transform: rotate(360deg); } }

  .sa-back {
    font-size: 13px; color: #64748b; text-align: center;
  }
  .sa-back a {
    color: #2563eb; text-decoration: none; font-weight: 600;
  }
  .sa-back a:hover { text-decoration: underline; }

  @media (max-width: 480px) {
    .sa-card { padding: 28px 22px; }
  }
`;

export default function SuperAdminLogin() {
  injectCSS("super-admin-login-styles", CSS);

  const navigate = useNavigate();
  const { login } = useAuth();

  const [booting, setBooting]   = useState(true);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [touched, setTouched]   = useState({ email: false, password: false });

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 600);
    return () => clearTimeout(t);
  }, []);

  const emailErr    = touched.email    && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const passwordErr = touched.password && password.length < 6;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!email || !password || emailErr || passwordErr) return;

    setLoading(true);
    setError("");

    try {
      const res  = await fetch(`${API_BASE}/api/auth/super-admin/login`, {
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
      navigate(ROLE_ROUTES.super_admin || "/overview", { replace: true });

    } catch {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  if (booting) return null;

  return (
    <div className="sa-wrap">
      <div className="sa-card">

        <div className="sa-badge">
          <ShieldCheck size={13} />
          Super Administrator Portal
        </div>

        <div className="sa-head">
          <h1 className="sa-title">Super Admin Sign In</h1>
          <p className="sa-sub">Restricted access — Super Administrators only.</p>
        </div>

        {error && (
          <div className="sa-banner" role="alert">
            <AlertCircle size={17} /><span>{error}</span>
          </div>
        )}

        <form className="sa-form" onSubmit={handleSubmit} noValidate>

          <div className={`sa-field ${emailErr ? "sa-field--error" : ""}`}>
            <label htmlFor="sa-email">Email address</label>
            <div className="sa-inp">
              <span className="sa-inp-icon"><Mail size={16} /></span>
              <input
                id="sa-email" type="email" autoComplete="email"
                placeholder="admin@organization.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                disabled={loading}
              />
            </div>
            {emailErr && <span className="sa-msg">Please enter a valid email address.</span>}
          </div>

          <div className={`sa-field ${passwordErr ? "sa-field--error" : ""}`}>
            <label htmlFor="sa-password">Password</label>
            <div className="sa-inp">
              <span className="sa-inp-icon"><Lock size={16} /></span>
              <input
                id="sa-password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                disabled={loading}
              />
              <button
                type="button" className="sa-eye"
                onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordErr && <span className="sa-msg">Password must be at least 6 characters.</span>}
          </div>

          <button type="submit" className="sa-btn" disabled={loading}>
            {loading
              ? <><Loader2 size={17} className="sa-spin" /><span>Authenticating…</span></>
              : <><ShieldCheck size={17} /><span>Sign In as Super Admin</span></>
            }
          </button>

        </form>

        <p className="sa-back" style={{ marginTop: 20 }}>
          No account yet? <a href="/admin-signup">Create Super Admin account</a>
        </p>
        <p className="sa-back" style={{ marginTop: 8 }}>
          Not a super admin? <a href="/login">Return to standard login</a>
        </p>

      </div>
    </div>
  );
}
