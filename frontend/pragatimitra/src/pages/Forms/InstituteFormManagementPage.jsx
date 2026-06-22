import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  FilePlus, Search, Plus, RefreshCw, Lock, Unlock, Eye, Settings2,
  CalendarClock, MoreHorizontal, Share2, ShieldCheck, Archive, ArchiveRestore,
  FileSpreadsheet, FileText as FileCsv,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import { API_BASE } from "../../api/client";
import FormBuilderPage from "./FormBuilderPage";
import InstituteFormRecordsPage from "./InstituteFormRecordsPage";

const SLUG = "form-management";
import {
  color, Button, PageHeader, Badge, EmptyState, Modal, Dropdown, MenuItem, MenuLabel, DataTable,
} from "../../ui";

const STROKE = 1.75;

/* ── Logic helpers (unchanged) ─────────────────────────────────── */
function deadlineInfo(form, lang = "en") {
  if (!form.deadline_at) return { dateText: "—", tone: null, label: null };
  const d = new Date(form.deadline_at);
  const dateText = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const msLeft = d.getTime() - Date.now();
  if (msLeft <= 0) return { dateText, tone: "danger", label: t("EXPIRED", lang) };
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const label = lang === "hi"
    ? `${daysLeft} दिन बाकी`
    : `${daysLeft} DAY${daysLeft !== 1 ? "S" : ""} LEFT`;
  return { dateText, tone: daysLeft <= 3 ? "warning" : "success", label };
}

/* India Standard Time is a fixed UTC+5:30 offset (no DST). Anchoring the
   deadline date picker to IST keeps "today" and the saved/displayed date
   consistent regardless of the admin's browser timezone. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDateString(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function titleOf(form_name) {
  return form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function institutionsLabel(form, lang = "en") {
  const names = form.institution_names || [];
  if (names.length === 1) return names[0];
  if (names.length > 1) return lang === "hi" ? `${names.length} संस्थाएं` : `${names.length} institutions`;
  const count = (form.institute_access || []).length;
  if (!count) return "—";
  return lang === "hi" ? `${count} संस्था` : `${count} institution${count !== 1 ? "s" : ""}`;
}

async function downloadExport(formName, format, language, accessToken) {
  const res = await fetch(
    `${API_BASE}/api/form-data/${formName}/export?format=${format}&language=${language}`,
    { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
  );
  if (!res.ok) return;
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const langTag = language !== "en" ? `_${language}` : "";
  a.download = `${formName}${langTag}_all.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Deadline modal (logic unchanged, ui Modal shell) ──────────── */
function DeadlineModal({ form, onClose, onSaved, showToast }) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [current, setCurrent] = useState({ deadline_at: null, auto_locked: false, is_locked: false });
  const [dateVal, setDateVal] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res  = await apiFetch(`/api/forms/${form.form_name}/deadline`);
        const data = await res.json();
        if (alive && data.success) {
          setCurrent(data);
          setDateVal(data.deadline_at ? toISTDateString(new Date(data.deadline_at)) : "");
        }
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [apiFetch, form.form_name]);

  async function save(remove) {
    setSaving(true);
    try {
      const deadlineIso = remove
        ? null
        : (dateVal ? new Date(dateVal + "T23:59:59+05:30").toISOString() : null);
      const res  = await apiFetch(`/api/forms/${form.form_name}/deadline`, {
        method: "PUT", body: JSON.stringify({ deadline_at: deadlineIso }),
      });
      const data = await res.json();
      if (data.success) { showToast(remove ? t("Deadline removed.", lang) : t("Deadline saved.", lang)); onSaved(); onClose(); }
      else showToast(data.message || t("Failed to save deadline.", lang), "error");
    } catch { showToast(t("Failed to save deadline.", lang), "error"); }
    finally { setSaving(false); }
  }

  const formTitle = titleOf(form.form_name);
  const todayStr  = toISTDateString(new Date());
  const hasDeadline = !!current.deadline_at;
  const expired     = hasDeadline && new Date(current.deadline_at).getTime() <= Date.now();

  return (
    <Modal
      open onClose={onClose} width={480}
      icon={<CalendarClock size={18} strokeWidth={STROKE} />}
      title={t("Manage Deadline", lang)} subtitle={`${formTitle} · ${t("your institution only", lang)}`}
      footer={
        <>
          <Button variant="outlineDanger" style={{ marginRight: "auto" }} disabled={saving || !hasDeadline} onClick={() => save(true)}>
            {t("Remove Deadline", lang)}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>{t("Cancel", lang)}</Button>
          <Button variant="primary" loading={saving} disabled={saving || !dateVal} onClick={() => save(false)}>
            {hasDeadline ? t("Update", lang) : t("Save", lang)}
          </Button>
        </>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: color.muted, fontSize: 13 }}>{t("Loading…", lang)}</div>
      ) : (
        <>
          <div style={{
            background: hasDeadline ? (expired ? "#FEF2F2" : color.primarySoft) : color.hover,
            border: `1px solid ${hasDeadline ? (expired ? "#FECACA" : "#BFDBFE") : color.border}`,
            borderRadius: 10, padding: "12px 16px", marginBottom: 18,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              {t("Current Status", lang)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: hasDeadline ? (expired ? "#B91C1C" : "#1D4ED8") : color.muted }}>
              {hasDeadline
                ? `${t("Deadline:", lang)} ${new Date(current.deadline_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${expired ? ` · ${t("Expired", lang)}` : ""}`
                : t("No deadline set", lang)}
            </div>
            {current.is_locked && (
              <div style={{ fontSize: 12, color: color.danger, marginTop: 4 }}>
                {current.auto_locked ? t("Auto-locked after deadline.", lang) : t("Manually locked by admin.", lang)}
              </div>
            )}
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>
            {hasDeadline ? t("Update Deadline Date", lang) : t("Add Deadline Date", lang)}
          </label>
          <input
            type="date" value={dateVal} min={todayStr}
            onChange={(e) => setDateVal(e.target.value)}
            style={{ width: "100%", height: 44, padding: "0 12px", border: `1px solid ${color.borderStrong}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11.5, color: color.muted, marginTop: 6 }}>
            {t("The form auto-locks for your institution after this date. Departments can still view records.", lang)}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   InstituteFormManagementPage  (logic unchanged; UI on the design system)
═══════════════════════════════════════════════════════════════════ */
export default function InstituteFormManagementPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { apiFetch }    = useApi();
  const { accessToken } = useAuth();
  const { lang }        = useLanguage();
  const { selectedYear, academicYear, years, selectedYearLocked } = useAcademicYear() || {};
  const yearAware = (years?.length || 0) > 0;
  const ayLocked  = !!selectedYearLocked;

  const isCreate  = location.pathname.endsWith("/create");
  const isEdit    = location.pathname.endsWith("/edit");
  const isRecords = location.pathname.endsWith("/records");
  const listPath  = `/${SLUG}`;
  const entity    = (isEdit || isRecords) ? (location.state?.entity ?? null) : null;

  const [forms, setForms]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [toast, setToast]     = useState(null);
  const [lockTogglingForm, setLockTogglingForm] = useState(null);
  const [deadlineForm, setDeadlineForm] = useState(null);

  const [tab, setTab]       = useState("active");
  const [search, setSearch] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs   = selectedYear != null ? `?year=${selectedYear}` : "";
      const res  = await apiFetch(`/api/forms/institution-forms${qs}`);
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setError(data.message || "Failed to load forms.");
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load forms.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const visibleForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms
      .filter((f) => {
        if (yearAware) {
          const st = f.lifecycle_status ?? "active";
          return tab === "archived" ? (st === "archived" || st === "disabled") : st === "active";
        }
        return tab === "archived" ? f.archived : !f.archived;
      })
      .filter((f) => {
        if (!q) return true;
        return (
          titleOf(f.form_name).toLowerCase().includes(q) ||
          f.form_name.toLowerCase().includes(q) ||
          (f.description || "").toLowerCase().includes(q)
        );
      });
  }, [forms, tab, search, yearAware]);

  async function setLifecycle(form, status) {
    if (!academicYear) { showToast(t("No academic year selected.", lang), "error"); return; }
    try {
      const res  = await apiFetch(
        `/api/academic-years/${encodeURIComponent(academicYear)}/forms/${form.id}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );
      const data = await res.json();
      if (data.success) {
        showToast(`"${titleOf(form.form_name)}" ${lang === "hi" ? (status === "active" ? "सक्रिय" : "संग्रहीत") : (status === "active" ? "activated" : "archived")} for ${academicYear}.`);
        load();
      } else showToast(data.message || "Failed to update status.", "error");
    } catch (err) { if (!isAuthError(err)) showToast("Failed to update status.", "error"); }
  }

  async function handleToggleLock(form) {
    const action = form.is_locked ? "unlock" : "lock";
    setLockTogglingForm(form.form_name);
    try {
      const res  = await apiFetch(`/api/forms/${form.form_name}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setForms((prev) =>
          prev.map((f) =>
            f.form_name === form.form_name
              ? { ...f, is_locked: !form.is_locked, locked_by: data.lock?.locked_by ?? null, locked_at: data.lock?.locked_at ?? null }
              : f
          )
        );
        showToast(lang === "hi"
          ? `फ़ॉर्म ${action === "lock" ? "लॉक" : "अनलॉक"} सफलतापूर्वक किया गया।`
          : `Form ${action === "lock" ? "locked" : "unlocked"} successfully.`);
      } else showToast(data.message || `Failed to ${action} form.`, "error");
    } catch { showToast(`Failed to ${action} form.`, "error"); }
    finally { setLockTogglingForm(null); }
  }

  if (isCreate) {
    return (
      <FormBuilderPage
        mode="create" initialData={null} isSuperAdmin={false}
        onDone={() => navigate(listPath)} onBack={() => navigate(listPath)}
      />
    );
  }
  if (isEdit) {
    if (!entity) return <Navigate to={listPath} replace />;
    return (
      <FormBuilderPage
        mode="edit" initialData={entity} isSuperAdmin={false}
        onDone={() => navigate(listPath)} onBack={() => navigate(listPath)}
      />
    );
  }
  if (isRecords) {
    if (!entity) return <Navigate to={listPath} replace />;
    return <InstituteFormRecordsPage form={entity} onBack={() => navigate(listPath)} />;
  }

  const searching = search.trim().length > 0;

  /* ── Row actions: View + Manage visible, rest in a viewport-aware menu ── */
  function renderActions(form) {
    const isActive = (form.lifecycle_status ?? "active") === "active";
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <Button variant="secondary" iconOnly title={t("View records", lang)} icon={<Eye size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/records`, { state: { entity: form } })} />
        <Button variant="secondary" iconOnly title={ayLocked ? t("Academic year is locked", lang) : t("Manage form", lang)} disabled={ayLocked} icon={<Settings2 size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/edit`, { state: { entity: form } })} />
        <Dropdown
          align="right" width={210}
          button={({ toggle }) => (
            <Button variant="secondary" iconOnly title={t("More actions", lang)} icon={<MoreHorizontal size={18} strokeWidth={STROKE} />} onClick={toggle} />
          )}
        >
          <MenuLabel>{t("Manage", lang)}</MenuLabel>
          <MenuItem icon={<CalendarClock size={16} strokeWidth={STROKE} />} disabled={ayLocked} onClick={() => setDeadlineForm(form)}>{t("Deadline", lang)}</MenuItem>
          {yearAware && (isActive
            ? <MenuItem icon={<Archive size={16} strokeWidth={STROKE} />} disabled={ayLocked} onClick={() => setLifecycle(form, "archived")}>{t("Archive for", lang)} {academicYear}</MenuItem>
            : <MenuItem icon={<ArchiveRestore size={16} strokeWidth={STROKE} />} disabled={ayLocked} onClick={() => setLifecycle(form, "active")}>{t("Activate for", lang)} {academicYear}</MenuItem>
          )}
          {form.is_locked
            ? <MenuItem icon={<Unlock size={16} strokeWidth={STROKE} />} disabled={ayLocked || lockTogglingForm === form.form_name} onClick={() => handleToggleLock(form)}>{t("Unlock form", lang)}</MenuItem>
            : <MenuItem icon={<Lock size={16} strokeWidth={STROKE} />} disabled={ayLocked || lockTogglingForm === form.form_name} onClick={() => handleToggleLock(form)}>{t("Lock form", lang)}</MenuItem>}
          <MenuLabel>{t("Export", lang)}</MenuLabel>
          <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadExport(form.form_name, "csv", lang, accessToken)}>{t("Download CSV", lang)}</MenuItem>
          <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadExport(form.form_name, "xlsx", lang, accessToken)}>{t("Download Excel", lang)}</MenuItem>
        </Dropdown>
      </div>
    );
  }

  const columns = [
    {
      key: "form", header: t("Form Name", lang), width: 320,
      render: (form) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
            {form.form_name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ui-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, color: color.text }} title={titleOf(form.form_name)}>
              {titleOf(form.form_name)}
            </div>
            <div className="ui-ellipsis" style={{ fontSize: 11.5, color: color.muted, marginTop: 1, maxWidth: 240 }} title={form.description || form.form_name}>
              {form.description || form.form_name}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "visibility", header: t("Visibility", lang), width: 120,
      render: (form) => form.share_table
        ? <Badge tone="info" icon={<Share2 size={12} strokeWidth={STROKE} />}>{t("Shared", lang)}</Badge>
        : <Badge tone="neutral" icon={<ShieldCheck size={12} strokeWidth={STROKE} />}>{t("Private", lang)}</Badge>,
    },
    { key: "institutions", header: t("Institutions", lang), ellipsis: true, width: 160, render: (form) => <span style={{ color: color.muted }}>{institutionsLabel(form, lang)}</span> },
    {
      key: "deadline", header: t("Deadline", lang), width: 150,
      render: (form) => {
        const d = deadlineInfo(form, lang);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: color.text, fontWeight: 600 }}>{d.dateText}</span>
            {d.label && <Badge tone={d.tone}>{d.label}</Badge>}
          </div>
        );
      },
    },
    {
      key: "access", header: t("Access", lang), width: 110,
      render: (form) => form.is_locked
        ? <Badge tone="danger" icon={<Lock size={11} strokeWidth={STROKE} />}>{t("Locked", lang)}</Badge>
        : <Badge tone="success">{t("Open", lang)}</Badge>,
    },
    { key: "actions", header: "", align: "right", width: 150, render: renderActions },
  ];

  const tabBtn = (key, label) => {
    const on = tab === key;
    return (
      <button
        key={key} onClick={() => setTab(key)} className="ui-focusable"
        style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                 background: on ? color.surface : "transparent", color: on ? color.text : color.muted,
                 boxShadow: on ? "0 1px 2px rgba(16,24,40,0.08)" : "none" }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", background: "transparent" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deadlineForm && (
        <DeadlineModal form={deadlineForm} onClose={() => setDeadlineForm(null)} onSaved={load} showToast={showToast} />
      )}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Forms", lang), t("Institution Forms", lang)]}
        title={t("Institution Forms", lang)}
        description={t("Manage every institutional form — visibility, deadlines, lifecycle and access — for the selected academic year.", lang)}
        actions={
          <>
            {ayLocked && <Badge tone="danger" icon={<Lock size={12} strokeWidth={STROKE} />}>{t("View Only", lang)}</Badge>}
            <Button variant="secondary" icon={<RefreshCw size={18} strokeWidth={STROKE} />} onClick={load}>{t("Refresh", lang)}</Button>
            <Button
              variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} disabled={ayLocked}
              title={ayLocked ? t("Academic year is locked", lang) : t("Create a new form", lang)}
              onClick={() => { if (ayLocked) { showToast(lang === "hi" ? "यह शैक्षणिक वर्ष लॉक है। आप केवल रिकॉर्ड देख सकते हैं।" : "This academic year is locked. You can only view records.", "error"); return; } navigate(`${listPath}/create`); }}
            >
              {t("Create New Form", lang)}
            </Button>
          </>
        }
      />

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={visibleForms}
        rowKey={(f) => f.id}
        loading={loading}
        minWidth={980}
        toolbar={
          <>
            <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search forms…", lang)}
                style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box", background: color.surface }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {yearAware && academicYear && (
                <Badge tone="primary" icon={<CalendarClock size={12} strokeWidth={STROKE} />}>{academicYear}</Badge>
              )}
              <div style={{ display: "inline-flex", border: `1px solid ${color.border}`, borderRadius: 10, padding: 3, gap: 2, background: color.hover }}>
                {tabBtn("active", t("Active", lang))}
                {tabBtn("archived", t("Archived", lang))}
              </div>
            </div>
          </>
        }
        empty={
          <EmptyState
            icon={searching ? <Search size={26} strokeWidth={1.5} /> : tab === "archived" ? <Archive size={26} strokeWidth={1.5} /> : <FilePlus size={26} strokeWidth={1.5} />}
            title={searching ? t("No forms match your search", lang) : tab === "archived" ? t("No archived forms", lang) : t("No forms available", lang)}
            description={
              searching ? t("Try a different name or clear the search.", lang)
                : tab === "archived" ? t("Forms archived for this academic year will appear here.", lang)
                : t("Create a new form, or contact your super admin to share one with your institution.", lang)
            }
            action={!searching && tab === "active" && !ayLocked
              ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/create`)}>{t("Create New Form", lang)}</Button>
              : undefined}
          />
        }
      />
    </div>
  );
}
