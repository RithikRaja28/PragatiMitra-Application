import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth, redirectByRole, ROLE_ROUTES } from "../../store/AuthContext";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Info, Loader2, User, Building2, Landmark } from "lucide-react";

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

/* Professional, standard sign-in: a brief branded loading splash, then a single
   clean white card (squared corners — no pill radius) with the brand wordmark
   and only the sign-in form. No sign-up, no social, no marketing. */
const CSS = `
  /* ── Brand wordmark (shared by splash + card) ── */
  .lg-mark { display: inline-flex; align-items: center; gap: 11px; }
  .lg-tile {
    width: 40px; height: 40px; border-radius: 8px;
    background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 800; letter-spacing: -0.5px;
    box-shadow: 0 4px 12px rgba(37,99,235,0.22);
  }
  .lg-word { font-size: 21px; font-weight: 800; letter-spacing: -0.4px; color: #0f172a; }

  /* ── Branded loading splash (~1s) ── */
  .lg-splash {
    display: flex; flex-direction: column; align-items: center; gap: 22px;
    padding: 60px 0;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: lgFade 0.25s ease both;
  }
  .lg-splash .lg-tile { width: 54px; height: 54px; font-size: 22px; border-radius: 10px;
    animation: lgPulse 1.1s ease-in-out infinite; }
  .lg-splash .lg-word { font-size: 24px; }
  .lg-bar {
    width: 200px; height: 3px; border-radius: 99px;
    background: #e2e8f0; overflow: hidden; position: relative;
  }
  .lg-bar::after {
    content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 40%;
    border-radius: 99px; background: #2563eb;
    animation: lgSlide 1s ease-in-out infinite;
  }
  @keyframes lgSlide { 0% { left: -40%; } 100% { left: 100%; } }
  @keyframes lgPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.94); opacity: 0.82; } }
  @keyframes lgFade { from { opacity: 0; } to { opacity: 1; } }

  /* ── Sign-in column ── */
  .lg-wrap {
    display: flex; flex-direction: column; align-items: center; gap: 22px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: lgIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes lgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  /* ── Card (squared, professional — minimal radius) ── */
  .lg-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.07);
    width: 420px; max-width: 92vw;
    padding: 36px 38px 34px;
    box-sizing: border-box;
  }
  .lg-head { margin: 18px 0 24px; }
  .lg-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.3px; }
  .lg-sub { font-size: 13.5px; color: #64748b; margin: 6px 0 0; }

  /* ── Banners ── */
  .lg-banner {
    display: flex; align-items: center; gap: 10px;
    border-radius: 6px; padding: 11px 14px; margin-bottom: 18px;
    font-size: 13px; font-weight: 500;
  }
  .lg-banner.err { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; animation: lgShake 0.4s ease; }
  .lg-banner.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; }
  @keyframes lgShake {
    0%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)}
    60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} 100%{transform:translateX(0)}
  }

  /* ── Form ── */
  .lg-form { display: flex; flex-direction: column; gap: 16px; }
  .lg-field { display: flex; flex-direction: column; gap: 7px; }
  .lg-field label { font-size: 13px; font-weight: 600; color: #334155; }

  .lg-inp { position: relative; display: flex; align-items: center; }
  .lg-inp-icon { position: absolute; left: 13px; display: flex; color: #94a3b8; pointer-events: none; transition: color .15s; }
  .lg-inp input {
    width: 100%; height: 46px; padding: 0 42px 0 40px;
    border-radius: 6px; border: 1px solid #cbd5e1; background: #fff;
    font-size: 14px; font-family: inherit; color: #1e293b; outline: none;
    transition: border-color .15s, box-shadow .15s; box-sizing: border-box;
  }
  .lg-inp input::placeholder { color: #94a3b8; }
  .lg-inp input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
  .lg-inp:focus-within .lg-inp-icon { color: #2563eb; }
  .lg-field--error .lg-inp input { border-color: #f87171; }
  .lg-field--error .lg-inp input:focus { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.10); }
  .lg-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; }

  .lg-eye {
    position: absolute; right: 11px; background: none; border: none; cursor: pointer;
    color: #94a3b8; display: flex; padding: 4px; border-radius: 4px; transition: color .15s, background .15s;
  }
  .lg-eye:hover { color: #2563eb; background: #f1f5f9; }

  /* ── Remember + Forgot row ── */
  .lg-row { display: flex; align-items: center; justify-content: space-between; }
  .lg-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13.5px; color: #334155; font-weight: 500; user-select: none; }
  .lg-check input { display: none; }
  .lg-check-box {
    width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #cbd5e1; background: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative;
    transition: border-color .15s, background .15s;
  }
  .lg-check input:checked ~ .lg-check-box { background: #2563eb; border-color: #2563eb; }
  .lg-check input:checked ~ .lg-check-box::after {
    content: ''; position: absolute; width: 8px; height: 4.5px;
    border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg) translateY(-1px);
  }
  .lg-forgot { font-size: 13.5px; font-weight: 500; color: #475569; text-decoration: none; transition: color .15s; }
  .lg-forgot:hover { color: #2563eb; }

  /* ── Submit (squared) ── */
  .lg-btn {
    height: 46px; width: 100%; border-radius: 6px; border: none; background: #2563eb; color: #fff;
    font-family: inherit; font-size: 14.5px; font-weight: 700; letter-spacing: 0.1px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background .15s; margin-top: 4px;
  }
  .lg-btn:hover:not(:disabled) { background: #1d4ed8; }
  .lg-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .lg-spin { animation: lgSpin 0.8s linear infinite; }
  @keyframes lgSpin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .lg-card { padding: 28px 22px; }
  }

  /* ── NOA role selection dialog ── */
  .noa-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.55);
    z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    backdrop-filter: blur(3px);
    animation: noaFadeIn 0.2s ease both;
  }
  @keyframes noaFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .noa-dialog {
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(15,23,42,0.22);
    padding: 32px 30px;
    width: 430px;
    max-width: 100%;
    animation: noaSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes noaSlideUp {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .noa-dialog-title {
    font-size: 18px; font-weight: 700; color: #0f172a;
    margin: 0 0 6px; letter-spacing: -0.3px;
  }
  .noa-dialog-sub {
    font-size: 13.5px; color: #64748b; margin: 0 0 22px; line-height: 1.55;
  }
  .noa-dialog-options { display: flex; flex-direction: column; gap: 11px; }

  .noa-opt {
    display: flex; align-items: center; gap: 14px;
    padding: 15px 16px;
    border-radius: 13px;
    border: 1.5px solid #e2e8f0;
    background: #fff;
    cursor: pointer;
    text-align: left;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    width: 100%;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }
  .noa-opt:hover {
    border-color: #2563eb;
    background: #f0f6ff;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.08);
  }
  .noa-opt-icon {
    width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .noa-opt-label {
    display: block; font-size: 14px; font-weight: 600; color: #1e293b;
  }
  .noa-opt-desc {
    display: block; font-size: 12px; color: #94a3b8; margin-top: 2px;
  }
`;

export default function Login() {
  injectCSS("login-styles-v2", CSS);

  const navigate = useNavigate();
  const { login, sessionMsg, setMsg, setNoaSelectedRole } = useAuth();

  const [booting, setBooting]   = useState(true);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [touched, setTouched]   = useState({ email: false, password: false });
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [pendingLogin, setPendingLogin]     = useState(null); // { user, accessToken }

  /* Brief branded loading splash before the form (~1s). UI only. */
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1000);
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

      // If user has an active Nodal Officer assignment, let them choose which
      // dashboard to enter. Otherwise proceed with normal role-based routing.
      if (data.user?.noaActiveYears?.length > 0 || data.user?.noaInstituteActiveYears?.length > 0) {
        setLoading(false);
        setPendingLogin({ user: data.user, accessToken: data.accessToken });
        setShowRoleDialog(true);
      } else {
        login(data.user, data.accessToken);
        redirectByRole(data.user, navigate);
      }

    } catch {
      setError("Unable to connect to the server. Please check your connection.");
      setLoading(false);
    }
  };

  // Called when user picks a role in the NOA selection dialog.
  // role = null → original role; "department_admin" / "institute_admin" → NOA interface.
  const handleRoleChoice = (role) => {
    if (!pendingLogin) return;
    setShowRoleDialog(false);

    if (role) {
      setNoaSelectedRole(role);

      // Pre-seed AcademicYearContext's sessionStorage key with the user's first
      // assigned year so the header year selector opens on the correct year
      // instead of defaulting to the institution's current year.
      const assignedYears = role === "institute_admin"
        ? (pendingLogin.user?.noaInstituteActiveYears || [])
        : (pendingLogin.user?.noaActiveYears          || []);
      if (assignedYears.length > 0) {
        const firstStart = parseInt(assignedYears[0].split("-")[0], 10);
        const instId = pendingLogin.user?.institutionId;
        if (instId && !isNaN(firstStart)) {
          sessionStorage.setItem(`pm_academic_year_${instId}`, String(firstStart));
        }
      }
    }

    login(pendingLogin.user, pendingLogin.accessToken);
    if (role) {
      navigate(ROLE_ROUTES[role] || "/dashboard", { replace: true });
    } else {
      redirectByRole(pendingLogin.user, navigate);
    }
    setPendingLogin(null);
  };

  // Helper: human-readable label for the user's original role
  const originalRoleLabel = (() => {
    const r = pendingLogin?.user?.roles?.[0];
    if (!r) return "Original Role";
    if (r.display_name) return r.display_name;
    return r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  })();

  /* ── Branded loading splash ── */
  if (booting) {
    return (
      <div className="lg-splash">
        <div className="lg-mark">
          <div className="lg-tile">PM</div>
          <div className="lg-word">PragatiMitra</div>
        </div>
        <div className="lg-bar" role="status" aria-label="Loading" />
      </div>
    );
  }

  return (
    <>
    {/* NOA role selection dialog — rendered outside lg-wrap to avoid CSS transform containing block */}
    {showRoleDialog && pendingLogin && createPortal(
      <div className="noa-overlay">
        <div className="noa-dialog">
          <h2 className="noa-dialog-title">Choose your dashboard</h2>
          <p className="noa-dialog-sub">
            You have an active Nodal Officer assignment. Select how you'd like to enter PragatiMitra.
          </p>
          <div className="noa-dialog-options">
            <button className="noa-opt" onClick={() => handleRoleChoice(null)}>
              <div className="noa-opt-icon" style={{ background: "#f1f5f9", color: "#475569" }}>
                <User size={20} />
              </div>
              <div>
                <span className="noa-opt-label">Continue as {originalRoleLabel}</span>
                <span className="noa-opt-desc">Open your regular dashboard</span>
              </div>
            </button>
            {pendingLogin.user?.noaActiveYears?.length > 0 && (
              <button className="noa-opt" onClick={() => handleRoleChoice("department_admin")}>
                <div className="noa-opt-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <span className="noa-opt-label">Continue as Department Nodal Officer</span>
                  <span className="noa-opt-desc">Open the Department Admin interface</span>
                </div>
              </button>
            )}
            {pendingLogin.user?.noaInstituteActiveYears?.length > 0 && (
              <button className="noa-opt" onClick={() => handleRoleChoice("institute_admin")}>
                <div className="noa-opt-icon" style={{ background: "#f0fdf4", color: "#15803d" }}>
                  <Landmark size={20} />
                </div>
                <div>
                  <span className="noa-opt-label">Continue as Institute Nodal Officer</span>
                  <span className="noa-opt-desc">Open the Institute Admin interface</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )}

    <div className="lg-wrap">
      <div className="lg-card">

        <div className="lg-mark">
          <div className="lg-tile">PM</div>
          <div className="lg-word">PragatiMitra</div>
        </div>

        <div className="lg-head">
          <h1 className="lg-title">Sign in to access PragatiMitra</h1>
          <p className="lg-sub">Enter your credentials to continue.</p>
        </div>

        {sessionMsg && (
          <div className="lg-banner info" role="status">
            <Info size={17} /><span>{sessionMsg}</span>
          </div>
        )}
        {error && (
          <div className="lg-banner err" role="alert">
            <AlertCircle size={17} /><span>{error}</span>
          </div>
        )}

        <form className="lg-form" onSubmit={handleSubmit} noValidate>

          <div className={`lg-field ${emailErr ? "lg-field--error" : ""}`}>
            <label htmlFor="email">Email address</label>
            <div className="lg-inp">
              <span className="lg-inp-icon"><Mail size={16} /></span>
              <input
                id="email" type="email" autoComplete="email"
                placeholder="you@organization.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                disabled={loading}
              />
            </div>
            {emailErr && <span className="lg-msg">Please enter a valid email address.</span>}
          </div>

          <div className={`lg-field ${passwordErr ? "lg-field--error" : ""}`}>
            <label htmlFor="password">Password</label>
            <div className="lg-inp">
              <span className="lg-inp-icon"><Lock size={16} /></span>
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
                type="button" className="lg-eye"
                onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordErr && <span className="lg-msg">Password must be at least 6 characters.</span>}
          </div>

          <div className="lg-row">
            <label className="lg-check">
              <input type="checkbox" disabled={loading} />
              <span className="lg-check-box" />
              <span>Remember me</span>
            </label>
            <a href="#forgot" className="lg-forgot">Forgot password?</a>
          </div>

          <button type="submit" className="lg-btn" disabled={loading}>
            {loading
              ? <><Loader2 size={17} className="lg-spin" /><span>Signing in…</span></>
              : "Sign In"
            }
          </button>
        </form>
      </div>
    </div>
    </>
  );
}
