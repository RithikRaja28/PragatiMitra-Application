import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange, Plus, Check, Archive, ArchiveRestore, Ban,
  Lock, Unlock, History, X, Loader2, CheckCircle2, RefreshCw,
  Search, Mail,
} from "lucide-react";
import { useApi }          from "../../../hooks/useApi";
import { useAcademicYear } from "../../../store/AcademicYearContext";
import { useLanguage }     from "../../../i18n/LanguageContext";
import { t }               from "../../../i18n/translations";
import { Toast, isAuthError } from "../../shared/formUtils";

/* SaaS theme tokens (spec): page #F4F6F8, cards #FFFFFF, icons only. */
const ACCENT = "#2563eb";
const CARD   = "#ffffff";

const STATUS_BADGE = {
  active:   { label: "Active",   color: "#16a34a", bg: "#f0fdf4" },
  archived: { label: "Archived", color: "#64748b", bg: "#f1f5f9" },
  disabled: { label: "Disabled", color: "#dc2626", bg: "#fef2f2" },
};
const SUBMISSION_BADGE = {
  open:   { label: "Open",   color: "#16a34a", bg: "#f0fdf4" },
  closed: { label: "Closed", color: "#d97706", bg: "#fffbeb" },
};

const card = { background: CARD, border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const ayIconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#475569" };
const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#475569" };

function Badge({ kind }) {
  const { lang } = useLanguage();
  if (!kind) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: kind.bg, color: kind.color, letterSpacing: 0.2, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: kind.color }} />
      {t(kind.label, lang)}
    </span>
  );
}

function IconAction({ title, onClick, children, danger }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{ ...iconBtn, ...(danger ? { color: "#dc2626", borderColor: "#fecaca" } : {}) }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "#fef2f2" : "#f8fafc"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
    >
      {children}
    </button>
  );
}

export default function AcademicYearPage() {
  const { apiFetch } = useApi();
  const { lang }     = useLanguage();
  // Top-bar context — reloaded after create/activate so new years and the
  // current-year change appear in the top bar instantly (no page refresh).
  const academicCtx = useAcademicYear();

  const [years, setYears]       = useState([]);
  const [current, setCurrent]   = useState(null);
  const [viewYear, setViewYear] = useState(null);      // academic_year string being viewed
  const [forms, setForms]       = useState([]);
  const [filter, setFilter]     = useState("all");     // all | active | archived
  const [loading, setLoading]   = useState(true);
  const [formsLoading, setFormsLoading] = useState(false);
  const [toast, setToast]       = useState(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirm, setConfirm]       = useState(null); // { kind: "lock"|"archive", year }
  const [mailStatus, setMailStatus] = useState(null); // { total, sent, failed } for viewYear
  const [retrying, setRetrying]     = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  /* ── Load years + current ── */
  const loadYears = useCallback(async () => {
    setLoading(true);
    try {
      const [yRes, cRes] = await Promise.all([
        apiFetch("/api/academic-years").then((r) => r.json()),
        apiFetch("/api/academic-years/current").then((r) => r.json()),
      ]);
      const list = yRes.success ? yRes.years : [];
      setYears(list);
      const cur = cRes.success ? cRes.current : null;
      setCurrent(cur);
      setViewYear((prev) => prev || cur?.academic_year || list[0]?.academic_year || null);
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to load academic years.", "error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadYears(); }, [loadYears]);

  /* ── Load forms for the year being viewed ── */
  const loadForms = useCallback(async (ay) => {
    if (!ay) { setForms([]); return; }
    setFormsLoading(true);
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(ay)}/forms`);
      const data = await res.json();
      setForms(data.success ? data.forms : []);
    } catch (err) {
      if (!isAuthError(err)) showToast("Failed to load forms.", "error");
    } finally {
      setFormsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadForms(viewYear); }, [viewYear, loadForms]);

  /* ── Activation-email status for the viewed year ── */
  useEffect(() => {
    if (!viewYear) { setMailStatus(null); return; }
    let cancelled = false;
    apiFetch(`/api/academic-years/${encodeURIComponent(viewYear)}/notifications`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMailStatus(d?.success ? d.summary : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [viewYear, apiFetch]);

  /* Retry only the failed activation emails for the viewed year. */
  async function retryEmails() {
    if (!viewYear || retrying) return;
    setRetrying(true);
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(viewYear)}/notifications/retry`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMailStatus(data.summary);
        showToast(`Retried ${data.retried} email${data.retried !== 1 ? "s" : ""} — ${data.summary.failed} still failing`);
      } else showToast(data.message || "Retry failed.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
    finally { setRetrying(false); }
  }

  /* ── Lifecycle actions ── */
  async function setStatus(form, status) {
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(viewYear)}/forms/${form.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) { showToast(`"${form.form_name}" → ${status}`); loadForms(viewYear); }
      else showToast(data.message || "Update failed.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
  }

  async function setSubmission(form, close) {
    // Open/Close reuses the existing form lock endpoints (Closed = locked).
    try {
      const res = await apiFetch(`/api/forms/${form.form_name}/${close ? "lock" : "unlock"}`, { method: "POST" });
      const data = await res.json();
      if (data.success !== false) { showToast(`"${form.form_name}" ${close ? "closed" : "opened"} for submissions`); loadForms(viewYear); }
      else showToast(data.message || "Update failed.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
  }

  async function setCurrentYear(ay) {
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(ay)}/activate`, { method: "PATCH" });
      const data = await res.json();
      if (data.success) { showToast(`${ay} is now the current academic year`); loadYears(); academicCtx?.reload(); }
      else showToast(data.message || "Failed to set current year.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
  }

  /* Lock / Open — institution-scoped view-only toggle for the year. */
  async function setLock(ay, locked) {
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(ay)}/lock`, {
        method: "PATCH", body: JSON.stringify({ locked }),
      });
      const data = await res.json();
      if (data.success) { showToast(`${ay} ${locked ? "locked — now view-only" : "unlocked"}`); loadYears(); academicCtx?.reload(); }
      else showToast(data.message || "Failed to update lock.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
  }

  /* Archive / Restore — hide the year from top bar / create / reports. */
  async function setArchive(ay, archived) {
    try {
      const res = await apiFetch(`/api/academic-years/${encodeURIComponent(ay)}/archive`, {
        method: "PATCH", body: JSON.stringify({ archived }),
      });
      const data = await res.json();
      if (data.success) { showToast(`${ay} ${archived ? "archived" : "restored"}`); loadYears(); academicCtx?.reload(); }
      else showToast(data.message || "Failed to update archive.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); }
  }

  function runConfirm() {
    if (!confirm) return;
    const { kind, year } = confirm;
    setConfirm(null);
    if (kind === "lock") setLock(year, true);
    if (kind === "archive") setArchive(year, true);
  }

  const visibleForms = forms.filter((f) =>
    filter === "all" ? true : filter === "active" ? f.status === "active" : f.status === "archived" || f.status === "disabled"
  );

  return (
    <div style={{ fontFamily: "var(--sh-font, 'Plus Jakarta Sans', sans-serif)", color: "#1e293b", maxWidth: 1080 }}>
      <style>{`
        @keyframes ay-spin { to { transform: rotate(360deg) } }
        .ay-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .ay-scroll::-webkit-scrollbar { width: 8px; }
        .ay-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
        .ay-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarRange size={22} color={ACCENT} /> {t("Academic Year Management", lang)}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {t("Create academic years and control which forms are active or archived per year. Same form, different status across years.", lang)}
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: `0 2px 8px ${ACCENT}40` }}
        >
          <Plus size={16} /> {t("Create New Academic Year", lang)}
        </button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          <Loader2 size={18} className="ay-spin" style={{ animation: "ay-spin 0.8s linear infinite" }} /> {t("Loading…", lang)}
          <style>{`@keyframes ay-spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          {/* Current year + history */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{t("Current Academic Year", lang)}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: current ? "#1e293b" : "#94a3b8" }}>
                {current?.academic_year || t("Not set", lang)}
              </div>
              {!current && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>{t("Create your first academic year to begin.", lang)}</div>
              )}
            </div>

            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{t("Academic History", lang)}</div>
              {years.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{t("No academic years yet.", lang)}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {years.map((y) => {
                    const isView = y.academic_year === viewYear;
                    return (
                      <div key={y.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${isView ? ACCENT : "#e2e8f0"}`, background: isView ? ACCENT + "0d" : "#fff", width: "100%", boxSizing: "border-box", opacity: y.is_archived ? 0.7 : 1 }}>
                        <button onClick={() => setViewYear(y.academic_year)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: isView ? ACCENT : "#475569", whiteSpace: "nowrap" }}>
                          {y.academic_year}
                        </button>

                        {/* badges */}
                        {y.active && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#16a34a14", borderRadius: 12, padding: "2px 7px" }}>
                            <CheckCircle2 size={11} /> {t("Current", lang)}
                          </span>
                        )}
                        {y.is_locked && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2", borderRadius: 12, padding: "2px 7px" }}>
                            <Lock size={11} /> Locked
                          </span>
                        )}
                        {y.is_archived && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#64748b", background: "#f1f5f9", borderRadius: 12, padding: "2px 7px" }}>
                            <Archive size={11} /> Archived
                          </span>
                        )}

                        {/* actions (icon only) */}
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                          {!y.active && !y.is_archived && (
                            <button title="Set as current year" onClick={() => setCurrentYear(y.academic_year)} style={ayIconBtn}>
                              <Check size={15} />
                            </button>
                          )}
                          {!y.is_archived && (
                            y.is_locked ? (
                              <button title="Open (unlock) year" onClick={() => setLock(y.academic_year, false)} style={{ ...ayIconBtn, color: "#16a34a", borderColor: "#bbf7d0" }}>
                                <Unlock size={15} />
                              </button>
                            ) : (
                              <button title="Lock year (view-only)" onClick={() => setConfirm({ kind: "lock", year: y.academic_year })} style={{ ...ayIconBtn, color: "#dc2626", borderColor: "#fecaca" }}>
                                <Lock size={15} />
                              </button>
                            )
                          )}
                          {y.is_archived ? (
                            <button title="Restore year" onClick={() => setArchive(y.academic_year, false)} style={{ ...ayIconBtn, color: ACCENT, borderColor: ACCENT + "55" }}>
                              <ArchiveRestore size={15} />
                            </button>
                          ) : (
                            <button title="Archive year (hide)" onClick={() => setConfirm({ kind: "archive", year: y.academic_year })} style={ayIconBtn}>
                              <Archive size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Forms-for-year lifecycle table */}
          <div style={card}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef2f6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {t("Form", lang)} {viewYear && <span style={{ color: "#94a3b8", fontWeight: 600 }}>· {viewYear}</span>}
                </div>
                {mailStatus && mailStatus.total > 0 && (
                  <span
                    title={`${t("Activation emails", lang)}: ${mailStatus.sent} ${t("sent", lang)}, ${mailStatus.failed} ${t("failed", lang)}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 9px",
                             color: mailStatus.failed > 0 ? "#d97706" : "#16a34a",
                             background: mailStatus.failed > 0 ? "#fffbeb" : "#f0fdf4" }}>
                    <CheckCircle2 size={12} /> {t("Email", lang)}: {mailStatus.sent}/{mailStatus.total} {t("sent", lang)}{mailStatus.failed > 0 ? ` · ${mailStatus.failed} ${t("failed", lang)}` : ""}
                  </span>
                )}
                {mailStatus && mailStatus.failed > 0 && (
                  <button
                    onClick={retryEmails}
                    disabled={retrying}
                    title={t("Retry the failed activation emails", lang)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "3px 10px", border: "1px solid #fcd34d", background: "#fff", color: "#b45309", cursor: retrying ? "not-allowed" : "pointer" }}
                  >
                    <RefreshCw size={12} style={retrying ? { animation: "ay-spin 0.8s linear infinite" } : undefined} />
                    {retrying ? t("Retrying…", lang) : t("Retry failed", lang)}
                  </button>
                )}
              </div>
              <div style={{ display: "inline-flex", borderRadius: 9, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {[
                  { id: "all",      label: t("All", lang) },
                  { id: "active",   label: t("Active", lang) },
                  { id: "archived", label: t("Archived", lang) },
                ].map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: filter === f.id ? ACCENT : "#fff", color: filter === f.id ? "#fff" : "#64748b" }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {formsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("Loading forms…", lang)}</div>
            ) : !viewYear ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("Select or create an academic year.", lang)}</div>
            ) : visibleForms.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("No forms in this view.", lang)}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {[t("Form", lang), t("Status", lang), t("Submissions", lang), t("Actions", lang)].map((h, hi) => (
                        <th key={h} style={{ padding: "9px 16px", textAlign: hi === 3 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #eef2f6", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleForms.map((f) => {
                      const closed = f.submission === "closed";
                      return (
                        <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "11px 16px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                              {f.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", marginTop: 1 }}>
                              {f.form_name}{f.share_table ? ` · ${t("shared", lang)}` : ""}
                            </div>
                          </td>
                          <td style={{ padding: "11px 16px" }}><Badge kind={STATUS_BADGE[f.status]} /></td>
                          <td style={{ padding: "11px 16px" }}><Badge kind={SUBMISSION_BADGE[f.submission]} /></td>
                          <td style={{ padding: "9px 16px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 6 }}>
                              {f.status !== "active" && (
                                <IconAction title={t("Activate", lang)} onClick={() => setStatus(f, "active")}><ArchiveRestore size={15} /></IconAction>
                              )}
                              {f.status === "active" && (
                                <IconAction title={t("Archive", lang)} onClick={() => setStatus(f, "archived")}><Archive size={15} /></IconAction>
                              )}
                              {closed
                                ? <IconAction title={t("Open submissions", lang)} onClick={() => setSubmission(f, false)}><Unlock size={15} /></IconAction>
                                : <IconAction title={t("Close submissions", lang)} onClick={() => setSubmission(f, true)}><Lock size={15} /></IconAction>}
                              {f.status !== "disabled"
                                ? <IconAction title={t("Disable", lang)} danger onClick={() => setStatus(f, "disabled")}><Ban size={15} /></IconAction>
                                : <IconAction title={t("Activate", lang)} onClick={() => setStatus(f, "active")}><Check size={15} /></IconAction>}
                              <IconAction title={t("View history (coming soon)", lang)} onClick={() => showToast(t("View history (coming soon)", lang))}><History size={15} /></IconAction>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {wizardOpen && (
        <CreateYearWizard
          apiFetch={apiFetch}
          onClose={() => setWizardOpen(false)}
          onCreated={(ay) => { setWizardOpen(false); showToast(`Academic year ${ay} created`); setViewYear(ay); loadYears(); academicCtx?.reload(); }}
          onError={(m) => showToast(m, "error")}
        />
      )}

      {confirm && (
        <ConfirmModal
          kind={confirm.kind}
          year={confirm.year}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}

/* ── Confirmation modal for Lock / Archive (centered, SaaS theme) ── */
function ConfirmModal({ kind, year, onCancel, onConfirm }) {
  const isLock = kind === "lock";
  const title  = isLock ? "Lock Academic Year" : "Archive Academic Year";
  const message = isLock
    ? "Locking this academic year will make all forms and records view-only for departments and institution users."
    : "Archived academic years remain stored but hidden from the top bar, form creation, and reports. You can restore them anytime.";
  const cta = isLock ? "Lock Year" : "Archive Year";
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 24px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ display: "inline-flex", width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", background: isLock ? "#fef2f2" : "#f1f5f9", color: isLock ? "#dc2626" : "#475569" }}>
              {isLock ? <Lock size={18} /> : <Archive size={18} />}
            </span>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{title}</div>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            <strong style={{ color: "#1e293b" }}>{year}</strong> — {message}
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
          <button onClick={onCancel} style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ height: 40, padding: "0 20px", borderRadius: 8, border: "none", background: isLock ? "#dc2626" : ACCENT, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{cta}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ════════════════════════════════════════════════════════════════════
   CreateYearWizard — 3 steps:
     1) Scrollable / searchable start-year picker (2000–2055) + live preview
     2) Carry-forward review (previous-year forms → active / archived)
     3) Review & confirm
════════════════════════════════════════════════════════════════════ */
const FIRST_YEAR = 2000;
const LAST_YEAR  = 2055;
const ALL_YEARS  = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

function CreateYearWizard({ apiFetch, onClose, onCreated, onError }) {
  const { lang } = useLanguage();
  const thisYear = new Date().getFullYear();

  const [step, setStep]             = useState(1);
  const [startYear, setStartYear]   = useState(thisYear);
  const [yearSearch, setYearSearch] = useState("");
  const [preview, setPreview]       = useState(null);
  const [checked, setChecked]       = useState(() => new Set());   // form ids → active in new year
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  const selRef  = useRef(null);
  const listRef = useRef(null);

  // Scroll the selected year into view when the picker first renders.
  useEffect(() => {
    if (step === 1 && selRef.current && listRef.current) {
      selRef.current.scrollIntoView({ block: "center" });
    }
  }, [step]);

  async function goReview() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/academic-years/preview?startYear=${startYear}`);
      const data = await res.json();
      if (!data.success) { onError(data.message || "Failed to build preview."); return; }
      setPreview(data);
      // Previously active → checked by default; previously archived → unchecked.
      setChecked(new Set(data.previouslyActive.map((f) => f.id)));
      setStep(2);
    } catch (err) {
      if (!isAuthError(err)) onError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id) {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function save() {
    const allForms = [...(preview.previouslyActive || []), ...(preview.previouslyArchived || [])];
    const activeFormIds   = allForms.filter((f) => checked.has(f.id)).map((f) => f.id);
    const archivedFormIds = allForms.filter((f) => !checked.has(f.id)).map((f) => f.id);
    setSaving(true);
    try {
      const res = await apiFetch("/api/academic-years", {
        method: "POST",
        body: JSON.stringify({ startYear, activeFormIds, archivedFormIds, makeCurrent: true }),
      });
      const data = await res.json();
      if (data.success) onCreated(data.academicYear);
      else onError(data.message || "Failed to create academic year.");
    } catch (err) {
      if (!isAuthError(err)) onError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const allForms      = preview ? [...preview.previouslyActive, ...preview.previouslyArchived] : [];
  const activeCount   = allForms.filter((f) => checked.has(f.id)).length;
  const archivedCount = allForms.length - activeCount;

  const q = yearSearch.trim();
  const filteredYears = q
    ? ALL_YEARS.filter((y) => String(y).includes(q) || `${y}-${y + 1}`.includes(q) || `${y}–${y + 1}`.includes(q))
    : ALL_YEARS;

  const subtitle = step === 1
    ? t("Select the start year — the label is generated automatically.", lang)
    : step === 2
      ? `${t("Choose which forms carry over into", lang)} ${preview?.academicYear}.`
      : `${t("Confirm the details for", lang)} ${preview?.academicYear}.`;

  // createPortal renders into document.body, escaping the .sh-page-enter
  // ancestor which has a CSS transform (animation). A transform creates a new
  // containing block for position:fixed, breaking the full-viewport overlay.
  // Portaling to document.body restores correct fixed positioning.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden", fontFamily: "var(--sh-font, 'Plus Jakarta Sans', sans-serif)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header + slim step rail */}
        <div style={{ padding: "18px 22px 16px", borderBottom: "1px solid #f1f5f9", background: "#fafafa" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{t("Create New Academic Year", lang)}</div>
              <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 3 }}>{subtitle}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}><X size={20} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
            {["Start Year", "Carry Forward", "Review"].map((lbl, i) => {
              const idx = i + 1, done = idx < step, active = idx === step;
              return (
                <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, flex: i < 2 ? 1 : "0 0 auto" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                    background: done ? ACCENT : active ? ACCENT : "#e2e8f0", color: done || active ? "#fff" : "#94a3b8" }}>
                    {done ? <Check size={11} strokeWidth={3} /> : idx}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 600, color: active ? ACCENT : done ? "#475569" : "#94a3b8", whiteSpace: "nowrap" }}>{lbl}</span>
                  {i < 2 && <span style={{ flex: 1, height: 2, background: done ? ACCENT : "#e2e8f0", borderRadius: 2, minWidth: 16 }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {/* ── Step 1: scrollable year picker ── */}
          {step === 1 && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("Select Start Year", lang)}</label>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                  <input
                    value={yearSearch}
                    onChange={(e) => setYearSearch(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={t("Search year, e.g. 2030", lang)}
                    inputMode="numeric"
                    style={{ width: "100%", height: 42, padding: "0 14px 0 36px", border: "1.5px solid #cbd5e1", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#1e293b" }}
                  />
                </div>
                <div ref={listRef} className="ay-scroll" style={{ maxHeight: 252, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 12, padding: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, background: "#fff" }}>
                  {filteredYears.length === 0 ? (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#94a3b8", fontSize: 12.5, padding: "20px 0" }}>{t("No year matches", lang)} “{q}”.</div>
                  ) : filteredYears.map((y) => {
                    const sel = y === startYear;
                    return (
                      <button key={y} ref={sel ? selRef : null} onClick={() => setStartYear(y)} style={{
                        padding: "9px 0", borderRadius: 8, border: `1.5px solid ${sel ? ACCENT : "#e2e8f0"}`,
                        background: sel ? ACCENT : "#fff", color: sel ? "#fff" : "#475569",
                        fontSize: 13.5, fontWeight: 700, cursor: "pointer", transition: "all .12s",
                      }}>
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 200, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("New Academic Year", lang)}</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: ACCENT, letterSpacing: -0.5 }}>{startYear}-{startYear + 1}</div>
                <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6 }}>
                  {t("The label is generated from the start year. The previous year’s forms load next for carry-forward.", lang)}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: carry forward ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <CountCard color="#16a34a" bg="#f0fdf4" label="Will be Active" value={activeCount} />
                <CountCard color="#64748b" bg="#f1f5f9" label="Will be Archived" value={archivedCount} />
              </div>
              {preview.previousYear && (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {t("Carried over from", lang)} <strong>{preview.previousYear}</strong>.
                </div>
              )}
              {preview.alreadyExists && (
                <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, color: "#92400e" }}>
                  {preview.academicYear} {t("already exists — saving will update its form classification.", lang)}
                </div>
              )}
              <FormChecklist title={t("Previously Active", lang)} subtitle={t("Checked → active in new year", lang)} forms={preview.previouslyActive} checked={checked} toggle={toggle} />
              <FormChecklist title={t("Previously Archived", lang)} subtitle={t("Check to activate in new year", lang)} forms={preview.previouslyArchived} checked={checked} toggle={toggle} />
              {allForms.length === 0 && (
                <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
                  {t("No accessible forms found for your institution.", lang)}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: review ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
              <ReviewRow label="New Academic Year" value={`${startYear}–${startYear + 1}`} strong />
              <ReviewRow label="Forms Active" value={`${activeCount} form${activeCount !== 1 ? "s" : ""}`} />
              <ReviewRow label="Forms Archived" value={`${archivedCount} form${archivedCount !== 1 ? "s" : ""}`} />
              <ReviewRow label="Current Year" value="Yes — set as the current academic year" />
              <ReviewRow label="Submission Lock" value="Open (unlocked)" />
              <ReviewRow label="Notifications" value="Department admins & nodal officers are emailed on activation" icon={<Mail size={14} color="#94a3b8" />} last />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
          <div>{step > 1 && <button onClick={() => setStep(step - 1)} style={ghostBtn}>{t("← Back", lang)}</button>}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={ghostBtn}>{t("Cancel", lang)}</button>
            {step === 1 && (
              <button onClick={goReview} disabled={loading} style={primaryBtn(loading)}>{loading ? t("Loading…", lang) : t("Next →", lang)}</button>
            )}
            {step === 2 && (
              <button onClick={() => setStep(3)} style={primaryBtn(false)}>{t("Review →", lang)}</button>
            )}
            {step === 3 && (
              <button onClick={save} disabled={saving} style={primaryBtn(saving)}>
                {saving ? t("Creating…", lang) : `${t("Create New Academic Year", lang).split(" ").slice(0, 1).join("")} ${preview?.academicYear}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CountCard({ color, bg, label, value }) {
  return (
    <div style={{ flex: "1 1 140px", display: "flex", alignItems: "center", gap: 12, background: bg, border: `1px solid ${color}22`, borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: -0.5, minWidth: 28 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{label}</div>
    </div>
  );
}

function ReviewRow({ label, value, strong, icon, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderBottom: last ? "none" : "1px solid #f1f5f9", background: "#fff" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", minWidth: 150, display: "flex", alignItems: "center", gap: 7 }}>{icon}{label}</span>
      <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, color: strong ? ACCENT : "#1e293b" }}>{value}</span>
    </div>
  );
}

function FormChecklist({ title, subtitle, forms, checked, toggle }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#475569" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{subtitle}</span>
      </div>
      {forms.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#cbd5e1", padding: "4px 2px" }}>None</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {forms.map((f) => {
            const on = checked.has(f.id);
            return (
              <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${on ? ACCENT + "55" : "#e2e8f0"}`, background: on ? ACCENT + "08" : "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => toggle(f.id)} style={{ width: 16, height: 16, accentColor: ACCENT, cursor: "pointer" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                  {f.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                {f.share_table && <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#7c3aed14", borderRadius: 12, padding: "2px 7px" }}>SHARED</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ghostBtn = { padding: "0 16px", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" };
const primaryBtn = (disabled) => ({ padding: "0 20px", height: 40, borderRadius: 8, border: "none", background: disabled ? "#93c5fd" : ACCENT, fontSize: 13, fontWeight: 700, color: "#fff", cursor: disabled ? "not-allowed" : "pointer" });
