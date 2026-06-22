import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, Loader2, User, KeyRound, CheckCircle2 } from "lucide-react";
import { authApi } from "../../api/services";

function injectCSS(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

const CSS = `
  .sas-wrap {
    display: flex; flex-direction: column; align-items: center; gap: 20px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: sasIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes sasIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  .sas-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.07);
    width: 440px; max-width: 92vw;
    padding: 36px 38px 34px;
    box-sizing: border-box;
  }

  .sas-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #fef2f2; border: 1px solid #fecaca;
    color: #dc2626; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; font-weight: 700;
    letter-spacing: 0.4px; text-transform: uppercase;
    margin-bottom: 14px;
  }

  .sas-head { margin: 0 0 24px; }
  .sas-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.3px; }
  .sas-sub   { font-size: 13.5px; color: #64748b; margin: 6px 0 0; }

  .sas-banner {
    display: flex; align-items: flex-start; gap: 10px;
    border-radius: 6px; padding: 11px 14px; margin-bottom: 18px;
    font-size: 13px; font-weight: 500;
  }
  .sas-banner.err  { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; animation: sasShake 0.4s ease; }
  .sas-banner.ok   { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
  @keyframes sasShake {
    0%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)}
    60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} 100%{transform:translateX(0)}
  }

  .sas-form { display: flex; flex-direction: column; gap: 16px; }
  .sas-field { display: flex; flex-direction: column; gap: 7px; }
  .sas-field label { font-size: 13px; font-weight: 600; color: #334155; }

  .sas-inp { position: relative; display: flex; align-items: center; }
  .sas-inp-icon { position: absolute; left: 13px; display: flex; color: #94a3b8; pointer-events: none; transition: color .15s; }
  .sas-inp input {
    width: 100%; height: 46px; padding: 0 42px 0 40px;
    border-radius: 6px; border: 1px solid #cbd5e1; background: #fff;
    font-size: 14px; font-family: inherit; color: #1e293b; outline: none;
    transition: border-color .15s, box-shadow .15s; box-sizing: border-box;
  }
  .sas-inp input::placeholder { color: #94a3b8; }
  .sas-inp input:focus { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.10); }
  .sas-inp:focus-within .sas-inp-icon { color: #dc2626; }
  .sas-field--error .sas-inp input { border-color: #f87171; }
  .sas-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; }

  .sas-eye {
    position: absolute; right: 11px; background: none; border: none; cursor: pointer;
    color: #94a3b8; display: flex; padding: 4px; border-radius: 4px; transition: color .15s;
  }
  .sas-eye:hover { color: #dc2626; }

  .sas-hint {
    font-size: 11.5px; color: #94a3b8; margin-top: 2px;
  }

  .sas-btn {
    height: 46px; width: 100%; border-radius: 6px; border: none;
    background: #dc2626; color: #fff;
    font-family: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background .15s; margin-top: 4px;
  }
  .sas-btn:hover:not(:disabled) { background: #b91c1c; }
  .sas-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .sas-spin { animation: sasSpin 0.8s linear infinite; }
  @keyframes sasSpin { to { transform: rotate(360deg); } }

  .sas-back { font-size: 13px; color: #64748b; text-align: center; margin-top: 20px; }
  .sas-back a { color: #2563eb; text-decoration: none; font-weight: 600; }
  .sas-back a:hover { text-decoration: underline; }

  @media (max-width: 480px) { .sas-card { padding: 28px 22px; } }
`;

export default function SuperAdminSignup() {
  injectCSS("super-admin-signup-styles", CSS);

  const navigate = useNavigate();

  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [setupKey,  setSetupKey]  = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [showKey,   setShowKey]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState(false);
  const [touched,   setTouched]   = useState({ fullName: false, email: false, password: false, setupKey: false });

  const nameErr     = touched.fullName && !fullName.trim();
  const emailErr    = touched.email    && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const passwordErr = touched.password && password.length < 8;
  const keyErr      = touched.setupKey && !setupKey.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true, setupKey: true });
    if (nameErr || emailErr || passwordErr || keyErr) return;
    if (!fullName.trim() || !email || !password || !setupKey) return;

    setLoading(true);
    setError("");

    try {
      const res  = await authApi.superAdminRegister({
        fullName: fullName.trim(),
        email:    email.trim().toLowerCase(),
        password,
        setupKey,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      // Redirect to login after 2 seconds
      setTimeout(() => navigate("/admin-login", { replace: true }), 2000);

    } catch {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="sas-wrap">
        <div className="sas-card" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "16px 0" }}>
            <CheckCircle2 size={48} color="#15803d" />
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Account Created!</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
              Your Super Admin account has been created successfully.<br />
              Redirecting to sign in…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sas-wrap">
      <div className="sas-card">

        <div className="sas-badge">
          <ShieldCheck size={13} />
          Super Administrator Portal
        </div>

        <div className="sas-head">
          <h1 className="sas-title">Create Super Admin Account</h1>
          <p className="sas-sub">A setup key is required to register.</p>
        </div>

        {error && (
          <div className="sas-banner err" role="alert">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form className="sas-form" onSubmit={handleSubmit} noValidate>

          <div className={`sas-field ${nameErr ? "sas-field--error" : ""}`}>
            <label htmlFor="sa-name">Full name</label>
            <div className="sas-inp">
              <span className="sas-inp-icon"><User size={16} /></span>
              <input
                id="sa-name" type="text" autoComplete="name"
                placeholder="e.g. System Administrator"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                disabled={loading}
              />
            </div>
            {nameErr && <span className="sas-msg">Full name is required.</span>}
          </div>

          <div className={`sas-field ${emailErr ? "sas-field--error" : ""}`}>
            <label htmlFor="sa-reg-email">Email address</label>
            <div className="sas-inp">
              <span className="sas-inp-icon"><Mail size={16} /></span>
              <input
                id="sa-reg-email" type="email" autoComplete="email"
                placeholder="admin@organization.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                disabled={loading}
              />
            </div>
            {emailErr && <span className="sas-msg">Please enter a valid email address.</span>}
          </div>

          <div className={`sas-field ${passwordErr ? "sas-field--error" : ""}`}>
            <label htmlFor="sa-reg-password">Password</label>
            <div className="sas-inp">
              <span className="sas-inp-icon"><Lock size={16} /></span>
              <input
                id="sa-reg-password"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                disabled={loading}
              />
              <button type="button" className="sas-eye" onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                aria-label={showPwd ? "Hide password" : "Show password"}>
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordErr && <span className="sas-msg">Password must be at least 8 characters.</span>}
          </div>

          <div className={`sas-field ${keyErr ? "sas-field--error" : ""}`}>
            <label htmlFor="sa-setup-key">Setup key</label>
            <div className="sas-inp">
              <span className="sas-inp-icon"><KeyRound size={16} /></span>
              <input
                id="sa-setup-key"
                type={showKey ? "text" : "password"}
                placeholder="Enter the setup key"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, setupKey: true }))}
                disabled={loading}
              />
              <button type="button" className="sas-eye" onClick={() => setShowKey((v) => !v)} tabIndex={-1}
                aria-label={showKey ? "Hide key" : "Show key"}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {keyErr && <span className="sas-msg">Setup key is required.</span>}
            <span className="sas-hint">Provided by the system administrator in the server configuration.</span>
          </div>

          <button type="submit" className="sas-btn" disabled={loading}>
            {loading
              ? <><Loader2 size={17} className="sas-spin" /><span>Creating account…</span></>
              : <><ShieldCheck size={17} /><span>Create Super Admin Account</span></>
            }
          </button>

        </form>

        <p className="sas-back">
          Already have an account? <a href="/admin-login">Sign in here</a>
        </p>

      </div>
    </div>
  );
}
