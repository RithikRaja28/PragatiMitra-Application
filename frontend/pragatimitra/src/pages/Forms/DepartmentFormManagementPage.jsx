import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  FilePlus, Search, Plus, Lock, Unlock, Eye, Settings2,
  CalendarClock, MoreHorizontal, Archive, ArchiveRestore,
  Download, FileText as FileCsv, FileSpreadsheet,
} from "lucide-react";

const SLUG = "form-management";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import DepartmentFormBuilderPage from "./DepartmentFormBuilderPage";
import DepartmentFormRecordsPage from "./DepartmentFormRecordsPage";
import { DateField, TimeField } from "./DateTimePicker";
import { color, Button, PageHeader, Badge, EmptyState, Modal, Dropdown, MenuItem, MenuLabel, DataTable, Pagination } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
import api from "../../services/api";

const STROKE = 1.75;

/* Download a department form's records (CSV/Excel) for the selected year —
   mirrors the institution dynamic-form export so the experience is consistent. */
async function downloadDeptExport(formId, format, accessToken, year) {
  const yq = year != null ? `&year=${year}` : "";
  const res = await api.get(`/api/department-form-data/${formId}/export?format=${format}${yq}`,
    { token: accessToken });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `export.${format}`; a.click();
  URL.revokeObjectURL(url);
}

function titleOf(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function deadlineInfo(form) {
  if (!form.deadline_at) return { dateText: "No Deadline", tone: null, label: null };
  const d = new Date(form.deadline_at);
  const dateText = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const msLeft = d.getTime() - Date.now();
  if (msLeft <= 0) return { dateText, tone: "danger", label: "EXPIRED" };
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft <= 1) return { dateText, tone: "warning", label: "EXPIRES TODAY" };
  return { dateText, tone: daysLeft <= 3 ? "warning" : "success", label: `${daysLeft} DAYS LEFT` };
}

/* Local time-zone label, e.g. "Asia/Kolkata". */
const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time"; } catch { return "local time"; } })();

/* Deadline modal — department-scoped AND academic-year-scoped (PUT by form id +
   selected year). The deadline applies only to the selected year. */
function DeadlineModal({ form, year, onClose, onSaved, showToast }) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [dateVal, setDateVal] = useState(form.deadline_at ? new Date(form.deadline_at).toISOString().slice(0, 10) : "");
  const [timeVal, setTimeVal] = useState(form.deadline_at
    ? new Date(form.deadline_at).toTimeString().slice(0, 5)
    : "23:59");
  const hasDeadline = !!form.deadline_at;
  const expired = hasDeadline && new Date(form.deadline_at).getTime() <= Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  const yearLabel = year != null ? `${year}–${year + 1}` : "current year";

  async function save(remove) {
    setSaving(true);
    try {
      // Combine the local date + time into an absolute instant (ISO/UTC).
      const deadline = remove ? null : (dateVal ? new Date(`${dateVal}T${timeVal || "23:59"}:00`).toISOString() : null);
      const res = await apiFetch(`/api/department-forms/${form.id}/deadline`, {
        method: "PUT", body: JSON.stringify({ deadline, year }),
      });
      const data = await res.json();
      if (data.success) { showToast(remove ? t("Deadline removed.", lang) : t("Deadline saved.", lang)); onSaved(); onClose(); }
      else showToast(data.message || t("Failed to save deadline.", lang), "error");
    } catch { showToast(t("Failed to save deadline.", lang), "error"); }
    finally { setSaving(false); }
  }


  return (
    <Modal open onClose={onClose} width={520} icon={<CalendarClock size={18} strokeWidth={STROKE} />}
      title={t("Manage Deadline", lang)} subtitle={`${titleOf(form.form_name)} · ${t("your department", lang)} · ${yearLabel}`}
      footer={
        <>
          <Button variant="outlineDanger" style={{ marginRight: "auto" }} disabled={saving || !hasDeadline} onClick={() => save(true)}>{t("Remove Deadline", lang)}</Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>{t("Cancel", lang)}</Button>
          <Button variant="primary" loading={saving} disabled={saving || !dateVal} onClick={() => save(false)}>{hasDeadline ? t("Update", lang) : t("Save", lang)}</Button>
        </>
      }>
      <div style={{ background: hasDeadline ? (expired ? "#FEF2F2" : color.primarySoft) : color.hover, border: `1px solid ${hasDeadline ? (expired ? "#FECACA" : "#BFDBFE") : color.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{t("Current Status", lang)} · {yearLabel}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: hasDeadline ? (expired ? "#B91C1C" : "#1D4ED8") : color.muted }}>
          {hasDeadline ? `${t("Deadline:", lang)} ${new Date(form.deadline_at).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}${expired ? ` · ${t("Expired", lang)}` : ""}` : t("No deadline set", lang)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1.4 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>{t("Date", lang)}</label>
          <DateField value={dateVal} min={todayStr} onChange={setDateVal} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>{t("Time", lang)}</label>
          <TimeField value={timeVal} onChange={setTimeVal} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: color.muted, marginTop: 8 }}>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("Timezone:", lang)}</span> {LOCAL_TZ}
      </div>
      <div style={{ fontSize: 11.5, color: color.muted, marginTop: 8 }}>{t("The form auto-locks for your department after this date & time, for", lang)} {yearLabel} {t("only. Members can still view and export records.", lang)}</div>
    </Modal>
  );
}

export default function DepartmentFormManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiFetch } = useApi();
  const { accessToken } = useAuth();
  const { selectedYear, academicYear } = useAcademicYear() || {};
  const { lang } = useLanguage();

  const isCreate  = location.pathname.endsWith("/create");
  const isEdit    = location.pathname.endsWith("/edit");
  const isRecords = location.pathname.endsWith("/records");
  const listPath  = `/${SLUG}`;
  const entity    = (isEdit || isRecords) ? (location.state?.entity ?? null) : null;

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deadlineForm, setDeadlineForm] = useState(null);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  // Show the loading skeleton only on the FIRST load. On refreshes (e.g. the
  // navbar year change), keep the current rows visible and swap them in place
  // once the new data arrives — no skeleton flash, no layout expand/shrink.
  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const qs = selectedYear != null ? `?year=${selectedYear}` : "";
      const res = await apiFetch(`/api/department-forms${qs}`);
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setError(data.message || "Failed to load forms.");
    } catch (err) { if (!isAuthError(err)) setError("Failed to load forms."); }
    finally { setLoading(false); hasLoadedRef.current = true; }
  }, [apiFetch, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const visibleForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms
      .filter((f) => (tab === "archived" ? f.is_archived : !f.is_archived))
      .filter((f) => !q || titleOf(f.form_name).toLowerCase().includes(q) || f.form_name.toLowerCase().includes(q) || (f.form_description || "").toLowerCase().includes(q));
  }, [forms, tab, search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, tab, selectedYear]);

  const paginatedForms = visibleForms.slice((page - 1) * pageSize, page * pageSize);

  async function toggleLock(form) {
    const action = form.is_locked ? "unlock" : "lock";
    setBusyId(form.id);
    try {
      const res = await apiFetch(`/api/department-forms/${form.id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.success) { showToast(`Form ${action === "lock" ? "locked" : "unlocked"}.`); load(); }
      else showToast(data.message || `Failed to ${action} form.`, "error");
    } catch { showToast(`Failed to ${action} form.`, "error"); }
    finally { setBusyId(null); }
  }

  async function setArchive(form, archived) {
    setBusyId(form.id);
    try {
      const res = await apiFetch(`/api/department-forms/${form.id}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) });
      const data = await res.json();
      if (data.success) { showToast(`"${titleOf(form.form_name)}" ${archived ? "archived" : "activated"} for ${academicYear || selectedYear}.`); load(); }
      else showToast(data.message || "Failed to update.", "error");
    } catch { showToast("Failed to update.", "error"); }
    finally { setBusyId(null); }
  }

  if (isCreate) {
    return <DepartmentFormBuilderPage mode="create" initialData={null} onDone={() => navigate(listPath)} onBack={() => navigate(listPath)} />;
  }
  if (isEdit) {
    if (!entity) return <Navigate to={listPath} replace />;
    return <DepartmentFormBuilderPage mode="edit" initialData={entity} onDone={() => navigate(listPath)} onBack={() => navigate(listPath)} />;
  }
  if (isRecords) {
    if (!entity) return <Navigate to={listPath} replace />;
    return <DepartmentFormRecordsPage form={entity} year={selectedYear} onBack={() => navigate(listPath)} />;
  }

  const searching = search.trim().length > 0;

  function renderActions(form) {
    if (form.is_archived) {
      return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          <Dropdown align="right" width={200} button={({ toggle }) => (<Button variant="secondary" iconOnly title={t("Export", lang)} icon={<Download size={18} strokeWidth={STROKE} />} onClick={toggle} />)}>
            <MenuLabel>{t("Export", lang)}</MenuLabel>
            <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "csv", accessToken, selectedYear)}>{t("Download CSV", lang)}</MenuItem>
            <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "xlsx", accessToken, selectedYear)}>{t("Download Excel", lang)}</MenuItem>
          </Dropdown>
          <Dropdown align="right" width={210} button={({ toggle }) => (<Button variant="secondary" iconOnly title={t("More actions", lang)} icon={<MoreHorizontal size={18} strokeWidth={STROKE} />} onClick={toggle} />)}>
            <MenuLabel>{t("Manage", lang)}</MenuLabel>
            <MenuItem icon={<ArchiveRestore size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => setArchive(form, false)}>{t("Activate for", lang)} {academicYear || selectedYear}</MenuItem>
          </Dropdown>
        </div>
      );
    }

    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <Button variant="secondary" iconOnly title={t("View records", lang)} icon={<Eye size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/records`, { state: { entity: form } })} />
        <Button variant="secondary" iconOnly title={t("Manage deadline", lang)} icon={<CalendarClock size={18} strokeWidth={STROKE} />} onClick={() => setDeadlineForm(form)} />
        <Button variant="secondary" iconOnly title={t("Manage form", lang)} icon={<Settings2 size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/edit`, { state: { entity: form } })} />
        <Dropdown align="right" width={200} button={({ toggle }) => (<Button variant="secondary" iconOnly title={t("Export", lang)} icon={<Download size={18} strokeWidth={STROKE} />} onClick={toggle} />)}>
          <MenuLabel>{t("Export", lang)}</MenuLabel>
          <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "csv", accessToken, selectedYear)}>{t("Download CSV", lang)}</MenuItem>
          <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "xlsx", accessToken, selectedYear)}>{t("Download Excel", lang)}</MenuItem>
        </Dropdown>
        <Dropdown align="right" width={210} button={({ toggle }) => (<Button variant="secondary" iconOnly title={t("More actions", lang)} icon={<MoreHorizontal size={18} strokeWidth={STROKE} />} onClick={toggle} />)}>
          <MenuLabel>{t("Manage", lang)}</MenuLabel>
          <MenuItem icon={<Archive size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => setArchive(form, true)}>{t("Archive for", lang)} {academicYear || selectedYear}</MenuItem>
          {form.is_locked
            ? <MenuItem icon={<Unlock size={16} strokeWidth={STROKE} />} disabled={busyId === form.id || !!form.deadline_expired} title={form.deadline_expired ? t("Deadline has expired — remove the deadline first to unlock", lang) : undefined} onClick={() => !form.deadline_expired && toggleLock(form)}>{t("Unlock form", lang)}</MenuItem>
            : <MenuItem icon={<Lock size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => toggleLock(form)}>{t("Lock form", lang)}</MenuItem>}
        </Dropdown>
      </div>
    );
  }

  const columns = [
    {
      key: "_sno", header: "#", width: 56, align: "left",
      render: (_form, i) => <span style={{ fontSize: 13, fontWeight: 600, color: color.muted }}>{i + 1}</span>,
    },
    {
      key: "form", header: t("Form Name", lang), width: 340,
      render: (form) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{form.form_name.slice(0, 2).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ui-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, color: color.text }} title={titleOf(form.form_name)}>{titleOf(form.form_name)}</div>
            <div className="ui-ellipsis" style={{ fontSize: 11.5, color: color.muted, marginTop: 1, maxWidth: 260 }} title={form.form_description || form.form_name}>{form.form_description || form.form_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: "deadline", header: t("Deadline", lang), width: 150,
      render: (form) => {
        const d = deadlineInfo(form);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: color.text, fontWeight: 600 }}>{form.deadline_at ? d.dateText : t("No Deadline", lang)}</span>
            {d.label && <Badge tone={d.tone}>{t(d.label, lang)}</Badge>}
          </div>
        );
      },
    },
    {
      key: "access", header: t("Access", lang), width: 110,
      render: (form) => {
        if (form.is_archived) {
          return <Badge tone="neutral" icon={<Archive size={11} strokeWidth={STROKE} />}>{t("Archived", lang)}</Badge>;
        }
        return form.is_locked
          ? <Badge tone="danger" icon={<Lock size={11} strokeWidth={STROKE} />}>{t("Locked", lang)}</Badge>
          : <Badge tone="success">{t("Open", lang)}</Badge>;
      },
    },
    { key: "actions", header: "", align: "right", width: 192, render: renderActions },
  ];

  const tabBtn = (key, label) => {
    const on = tab === key;
    return (
      <button key={key} onClick={() => setTab(key)} className="ui-focusable"
        style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: on ? color.surface : "transparent", color: on ? color.text : color.muted, boxShadow: on ? "0 1px 2px rgba(16,24,40,0.08)" : "none" }}>
        {t(label, lang)}
      </button>
    );
  };

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deadlineForm && <DeadlineModal form={deadlineForm} year={selectedYear} onClose={() => setDeadlineForm(null)} onSaved={load} showToast={showToast} />}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), t("Department Forms", lang)]}
        title={t("Department Forms", lang)}
        description={t("Create and manage your department's own forms — deadlines, lifecycle and lock — for the selected academic year.", lang)}
        actions={
          <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/create`)}>{t("Create Form", lang)}</Button>
        }
      />

      {error &&<div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <DataTable
        fill
        columns={columns}
        rows={paginatedForms}
        rowKey={(f) => f.id}
        loading={loading}
        minWidth={920}
        toolbar={
          <>
            <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search forms…", lang)}
                style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box", background: color.surface }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {(academicYear || selectedYear != null) && (
                <Badge tone="primary" icon={<CalendarClock size={12} strokeWidth={STROKE} />}>{academicYear || `${selectedYear}–${selectedYear + 1}`}</Badge>
              )}
              <div style={{ display: "inline-flex", border: `1px solid ${color.border}`, borderRadius: 10, padding: 3, gap: 2, background: color.hover }}>
                {tabBtn("active", "Active")}
                {tabBtn("archived", "Archived")}
              </div>
            </div>
          </>
        }
        empty={
          <EmptyState
            icon={searching ? <Search size={26} strokeWidth={1.5} /> : tab === "archived" ? <Archive size={26} strokeWidth={1.5} /> : <FilePlus size={26} strokeWidth={1.5} />}
            title={searching ? t("No forms match your search", lang) : tab === "archived" ? t("No archived forms", lang) : t("No department forms yet", lang)}
            description={searching ? t("Try a different name or clear the search.", lang) : tab === "archived" ? t("Forms archived for this academic year will appear here.", lang) : t("Create your department's first form for this academic year.", lang)}
            action={!searching && tab === "active" ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/create`)}>{t("Create Form", lang)}</Button> : undefined}
          />
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={visibleForms.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
