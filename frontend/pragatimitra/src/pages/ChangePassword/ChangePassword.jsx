import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useAuth, redirectByRole } from "../../store/AuthContext";

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
  .cp-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    animation: cpCardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes cpCardIn {
    from { opacity: 0; transform: translateY(24px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .cp-card {
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
  .cp-card::before {
    content: '';
    position: absolute;
    top: -60px; left: -60px;
    width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(147,197,253,0.15) 0%, transparent 70%);
    pointer-events: none;
  }

  .cp-brand { display: flex; align-items: center; gap: 12px; }
  .cp-logo-mark {
    width: 40px; height: 40px; flex-shrink: 0;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(37,99,235,0.28);
  }
  .cp-brand-text { display: flex; flex-direction: column; }
  .cp-brand-name {
    font-size: 17px; font-weight: 700;
    color: var(--shell-text, #1e293b);
    letter-spacing: -0.4px; line-height: 1.1;
  }
  .cp-brand-tagline {
    font-size: 11px; font-weight: 500;
    color: var(--shell-accent, #2563eb);
    letter-spacing: 0.2px; margin-top: 2px;
  }

  .cp-divider {
    height: 1px;
    background: linear-gradient(to right, #dbeafe, #bae6fd, transparent);
    margin: 22px 0;
  }

  .cp-notice {
    display: flex; align-items: flex-start; gap: 10px;
    background: #eff6ff; border: 1px solid #bfdbfe;
    border-radius: 10px; padding: 12px 14px; margin-bottom: 22px;
    color: var(--shell-accent, #2563eb); font-size: 13px; font-weight: 500;
    line-height: 1.5;
  }
  .cp-notice svg { flex-shrink: 0; margin-top: 1px; }

  .cp-heading h1 {
    font-size: 22px; font-weight: 800;
    color: var(--shell-text, #1e293b);
    letter-spacing: -0.5px; margin: 0 0 6px;
  }
  .cp-heading p {
    font-size: 13.5px;
    color: var(--shell-muted, #94a3b8);
    margin: 0 0 24px; line-height: 1.5;
  }

  .cp-error-banner {
    display: flex; align-items: center; gap: 10px;
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 10px; padding: 11px 14px; margin-bottom: 18px;
    color: #dc2626; font-size: 13px; font-weight: 500;
    animation: cpShake 0.4s ease;
  }
  .cp-success-banner {
    display: flex; align-items: center; gap: 10px;
    background: #f0fdf4; border: 1px solid #bbf7d0;
    border-radius: 10px; padding: 11px 14px; margin-bottom: 18px;
    color: #15803d; font-size: 13px; font-weight: 500;
  }
  @keyframes cpShake {
    0%  { transform: translateX(0); }   20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); } 60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); } 100%{ transform: translateX(0); }
  }

  .cp-form { display: flex; flex-direction: column; gap: 16px; }

  .cp-field { display: flex; flex-direction: column; gap: 5px; }
  .cp-field label {
    font-size: 12.5px; font-weight: 600;
    color: var(--shell-text, #1e293b); letter-spacing: 0.1px;
  }

  .cp-input-wrap { position: relative; display: flex; align-items: center; }
  .cp-input-icon {
    position: absolute; left: 12px;
    display: flex; align-items: center;
    color: var(--shell-muted, #94a3b8);
    pointer-events: none;
    transition: color 0.22s;
  }
  .cp-input-wrap input {
    width: 100%; height: 44px;
    padding: 0 42px 0 38px;
    border-radius: 10px;
    border: 1.5px solid var(--shell-border, rgba(0,0,0,0.08));
    background: var(--shell-surface, #f0f4fa);
    font-size: 14px;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
    color: var(--shell-text, #1e293b);
    outline: none;
    transition: border-color 0.22s, background 0.22s, box-shadow 0.22s;
    box-sizing: border-box;
  }
  .cp-input-wrap input::placeholder { color: var(--shell-muted, #94a3b8); }
  .cp-input-wrap input:hover { border-color: rgba(37,99,235,0.3); background: #fff; }
  .cp-input-wrap input:focus {
    border-color: var(--shell-accent, #2563eb);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
  }
  .cp-input-wrap:focus-within .cp-input-icon { color: var(--shell-accent, #2563eb); }

  .cp-field--error .cp-input-wrap input {
    border-color: #f87171; background: #fff7f7;
  }
  .cp-field--error .cp-input-wrap input:focus {
    box-shadow: 0 0 0 3px rgba(239,68,68,0.1);
    border-color: #ef4444;
  }
  .cp-field-msg { font-size: 11.5px; color: #ef4444; font-weight: 500; padding-left: 2px; }

  .cp-pwd-toggle {
    position: absolute; right: 11px;
    background: none; border: none; cursor: pointer;
    color: var(--shell-muted, #94a3b8);
    display: flex; align-items: center;
    padding: 4px; border-radius: 6px;
    transition: color 0.22s, background 0.22s;
  }
  .cp-pwd-toggle:hover {
    color: var(--shell-accent, #2563eb);
    background: rgba(37,99,235,0.07);
  }

  /* Password strength bar */
  .cp-strength { display: flex; flex-direction: column; gap: 5px; padding-left: 2px; }
  .cp-strength-bars { display: flex; gap: 4px; }
  .cp-strength-bar {
    flex: 1; height: 3px; border-radius: 2px;
    background: #e2e8f0;
    transition: background 0.3s;
  }
  .cp-strength-bar.filled-1 { background: #ef4444; }
  .cp-strength-bar.filled-2 { background: #f97316; }
  .cp-strength-bar.filled-3 { background: #eab308; }
  .cp-strength-bar.filled-4 { background: #22c55e; }
  .cp-strength-label { font-size: 11px; font-weight: 600; }
  .cp-strength-label.s1 { color: #ef4444; }
  .cp-strength-label.s2 { color: #f97316; }
  .cp-strength-label.s3 { color: #eab308; }
  .cp-strength-label.s4 { color: #22c55e; }

  .cp-btn {
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
  .cp-btn:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 6px 20px rgba(37,99,235,0.4);
    transform: translateY(-1px);
  }
  .cp-btn:active:not(:disabled) { transform: translateY(0); }
  .cp-btn:disabled { opacity: 0.72; cursor: not-allowed; }

  .cp-spinner { animation: cpSpin 0.8s linear infinite; }
  @keyframes cpSpin { to { transform: rotate(360deg); } }

  .cp-security {
    display: flex; align-items: center; gap: 6px;
    font-size: 11.5px; color: var(--shell-muted, #94a3b8);
    font-weight: 500;
    font-family: var(--shell-font, 'Plus Jakarta Sans', sans-serif);
  }

  @media (max-width: 480px) {
    .cp-card { padding: 28px 20px 24px; border-radius: 16px; }
    .cp-heading h1 { font-size: 20px; }
  }
`;

const LogoMark = () => (
  <svg viewBox="0 0 40 40" fill="none" className="cp-logo-mark">
    <rect width="40" height="40" rx="10" fill="url(#cpGrad)" />
    <defs>
      <linearGradient id="cpGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2563EB" />
        <stop offset="1" stopColor="#7C3AED" />
      </linearGradient>
    </defs>
    <path d="M10 28L20 12l10 16H10z" fill="white" opacity="0.9" />
    <circle cx="20" cy="12" r="3" fill="white" />
  </svg>
);

function getStrength(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

export default function ChangePassword() {
  injectCSS("cp-styles", CSS);

  const navigate = useNavigate();
  const { user, accessToken, updateUser } = useAuth();

  const [current, setCurrent]       = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showCurrent, setShowCur]   = useState(false);
  const [showNew, setShowNew]       = useState(false);
  const [showConfirm, setShowConf]  = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");
  const [touched, setTouched]       = useState({});

  const strength = getStrength(newPwd);
  const isMustChange    = user?.mustChangePassword;
  const isTemporary     = user?.isTemporaryPassword;

  const newPwdErr    = touched.newPwd    && newPwd.length > 0 && newPwd.length < 8;
  const confirmErr   = touched.confirm   && confirm.length > 0 && confirm !== newPwd;
  const currentErr   = touched.current   && current.length === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ current: true, newPwd: true, confirm: true });

    if ((!isTemporary && !current) || newPwd.length < 8 || newPwd !== confirm) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res  = await fetch(`${API_BASE}/api/auth/change-password`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to change password.");
        setLoading(false);
        return;
      }

      setSuccess("Password changed! Redirecting…");
      updateUser({ mustChangePassword: false, isTemporaryPassword: false });

      setTimeout(() => {
        redirectByRole({ ...user, mustChangePassword: false }, navigate);
      }, 1200);

    } catch {
      setError("Unable to connect to the server.");
      setLoading(false);
    }
  }

  return (
    <div className="cp-wrap">
      <div className="cp-card">

        <div className="cp-brand">
          <LogoMark />
          <div className="cp-brand-text">
            <span className="cp-brand-name">Pragati Mitra</span>
            <span className="cp-brand-tagline">AIIA</span>
          </div>
        </div>

        <div className="cp-divider" />

        {(isMustChange || isTemporary) && (
          <div className="cp-notice">
            <ShieldCheck size={16} />
            <span>
              {isTemporary
                ? "Your account has a temporary password set by an administrator. Please set a new password to continue."
                : "Your account requires a password change before you can continue."}
            </span>
          </div>
        )}

        <div className="cp-heading">
          <h1>Set new password</h1>
          <p>Choose a strong password you haven't used before.</p>
        </div>

        {error   && <div className="cp-error-banner"   role="alert">  <AlertCircle  size={16} /><span>{error}</span></div>}
        {success && <div className="cp-success-banner" role="status"> <CheckCircle2 size={16} /><span>{success}</span></div>}

        <form className="cp-form" onSubmit={handleSubmit} noValidate>

          {/* Current password — hidden for temporary passwords */}
          {!isTemporary && (
            <div className={`cp-field ${currentErr ? "cp-field--error" : ""}`}>
              <label htmlFor="cp-current">Current password</label>
              <div className="cp-input-wrap">
                <span className="cp-input-icon"><Lock size={16} /></span>
                <input
                  id="cp-current"
                  type={showCurrent ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, current: true }))}
                  disabled={loading || !!success}
                />
                <button type="button" className="cp-pwd-toggle" onClick={() => setShowCur((v) => !v)} tabIndex={-1}>
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {currentErr && <span className="cp-field-msg">Current password is required.</span>}
            </div>
          )}

          {/* New password */}
          <div className={`cp-field ${newPwdErr ? "cp-field--error" : ""}`}>
            <label htmlFor="cp-new">New password</label>
            <div className="cp-input-wrap">
              <span className="cp-input-icon"><Lock size={16} /></span>
              <input
                id="cp-new"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, newPwd: true }))}
                disabled={loading || !!success}
              />
              <button type="button" className="cp-pwd-toggle" onClick={() => setShowNew((v) => !v)} tabIndex={-1}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newPwdErr && <span className="cp-field-msg">Password must be at least 8 characters.</span>}
            {newPwd.length >= 1 && (
              <div className="cp-strength">
                <div className="cp-strength-bars">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className={`cp-strength-bar ${strength >= n ? `filled-${strength}` : ""}`} />
                  ))}
                </div>
                <span className={`cp-strength-label s${strength}`}>{STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className={`cp-field ${confirmErr ? "cp-field--error" : ""}`}>
            <label htmlFor="cp-confirm">Confirm new password</label>
            <div className="cp-input-wrap">
              <span className="cp-input-icon"><Lock size={16} /></span>
              <input
                id="cp-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                disabled={loading || !!success}
              />
              <button type="button" className="cp-pwd-toggle" onClick={() => setShowConf((v) => !v)} tabIndex={-1}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmErr && <span className="cp-field-msg">Passwords do not match.</span>}
          </div>

          <button
            type="submit"
            className="cp-btn"
            disabled={loading || !!success}
          >
            {loading
              ? <><Loader2 size={17} className="cp-spinner" /><span>Updating…</span></>
              : "Update password"
            }
          </button>
        </form>
      </div>

      <div className="cp-security">
        <ShieldCheck size={13} />
        <span>Your new password is encrypted before saving.</span>
      </div>
    </div>
  );
}
