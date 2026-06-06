import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FilePlus, Search, Plus, RefreshCw, Lock, Unlock, Eye, Settings2,
  CalendarClock, MoreHorizontal, Archive, ArchiveRestore, Languages, CalendarCog, Check,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import DepartmentFormBuilderPage from "./DepartmentFormBuilderPage";
import DepartmentFormRecordsPage from "./DepartmentFormRecordsPage";
import { color, Button, PageHeader, Badge, EmptyState, Modal, Dropdown, MenuItem, MenuLabel, DataTable } from "../../ui";

const STROKE = 1.75;

function titleOf(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function deadlineInfo(form) {
  if (!form.deadline_at) return { dateText: "—", tone: null, label: null };
  const d = new Date(form.deadline_at);
  const dateText = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const msLeft = d.getTime() - Date.now();
  if (msLeft <= 0) return { dateText, tone: "danger", label: "EXPIRED" };
  const daysLeft = Math.ceil(msLeft / 86400000);
  return { dateText, tone: daysLeft <= 3 ? "warning" : "success", label: `${daysLeft} DAY${daysLeft !== 1 ? "S" : ""} LEFT` };
}

/* Deadline modal — department-scoped (PUT by form id). */
function DeadlineModal({ form, onClose, onSaved, showToast }) {
  const { apiFetch } = useApi();
  const [saving, setSaving] = useState(false);
  const [dateVal, setDateVal] = useState(form.deadline_at ? new Date(form.deadline_at).toISOString().slice(0, 10) : "");
  const hasDeadline = !!form.deadline_at;
  const expired = hasDeadline && new Date(form.deadline_at).getTime() <= Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  async function save(remove) {
    setSaving(true);
    try {
      const deadline = remove ? null : (dateVal ? new Date(dateVal + "T23:59:59").toISOString() : null);
      const res = await apiFetch(`/api/department-forms/${form.id}/deadline`, { method: "PUT", body: JSON.stringify({ deadline }) });
      const data = await res.json();
      if (data.success) { showToast(remove ? "Deadline removed." : "Deadline saved."); onSaved(); onClose(); }
      else showToast(data.message || "Failed to save deadline.", "error");
    } catch { showToast("Failed to save deadline.", "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} width={480} icon={<CalendarClock size={18} strokeWidth={STROKE} />}
      title="Manage Deadline" subtitle={`${titleOf(form.form_name)} · your department`}
      footer={
        <>
          <Button variant="outlineDanger" style={{ marginRight: "auto" }} disabled={saving || !hasDeadline} onClick={() => save(true)}>Remove Deadline</Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={saving || !dateVal} onClick={() => save(false)}>{hasDeadline ? "Update" : "Save"}</Button>
        </>
      }>
      <div style={{ background: hasDeadline ? (expired ? "#FEF2F2" : color.primarySoft) : color.hover, border: `1px solid ${hasDeadline ? (expired ? "#FECACA" : "#BFDBFE") : color.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Current Status</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: hasDeadline ? (expired ? "#B91C1C" : "#1D4ED8") : color.muted }}>
          {hasDeadline ? `Deadline: ${new Date(form.deadline_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${expired ? " · Expired" : ""}` : "No deadline set"}
        </div>
      </div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>{hasDeadline ? "Update Deadline Date" : "Add Deadline Date"}</label>
      <input type="date" value={dateVal} min={todayStr} onChange={(e) => setDateVal(e.target.value)}
        style={{ width: "100%", height: 44, padding: "0 12px", border: `1px solid ${color.borderStrong}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box" }} />
      <div style={{ fontSize: 11.5, color: color.muted, marginTop: 6 }}>The form auto-locks for your department after this date. Members can still view records.</div>
    </Modal>
  );
}

export default function DepartmentFormManagementPage() {
  const { apiFetch } = useApi();
  const { selectedYear, academicYear } = useAcademicYear() || {};

  const [view, setView] = useState("list");
  const [builderMode, setBuilderMode] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deadlineForm, setDeadlineForm] = useState(null);
  const [carryOpen, setCarryOpen] = useState(false);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = selectedYear != null ? `?year=${selectedYear}` : "";
      const res = await apiFetch(`/api/department-forms${qs}`);
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setError(data.message || "Failed to load forms.");
    } catch (err) { if (!isAuthError(err)) setError("Failed to load forms."); }
    finally { setLoading(false); }
  }, [apiFetch, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const visibleForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms
      .filter((f) => (tab === "archived" ? f.is_archived : !f.is_archived))
      .filter((f) => !q || titleOf(f.form_name).toLowerCase().includes(q) || f.form_name.toLowerCase().includes(q) || (f.form_description || "").toLowerCase().includes(q));
  }, [forms, tab, search]);

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

  function openCreate() { setSelectedForm(null); setBuilderMode("create"); setView("builder"); }
  function openManage(f) { setSelectedForm(f); setBuilderMode("edit"); setView("builder"); }
  function openRecords(f) { setSelectedForm(f); setView("records"); }
  function onBuilderDone(message) { setView("list"); showToast(message); load(); }

  if (view === "builder") {
    return <DepartmentFormBuilderPage mode={builderMode} initialData={selectedForm} onDone={onBuilderDone} onBack={() => setView("list")} />;
  }
  if (view === "records" && selectedForm) {
    return <DepartmentFormRecordsPage form={selectedForm} year={selectedYear} onBack={() => { setView("list"); load(); }} />;
  }

  const searching = search.trim().length > 0;

  function renderActions(form) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <Button variant="secondary" iconOnly title="View records" icon={<Eye size={18} strokeWidth={STROKE} />} onClick={() => openRecords(form)} />
        <Button variant="secondary" iconOnly title="Manage form" icon={<Settings2 size={18} strokeWidth={STROKE} />} onClick={() => openManage(form)} />
        <Dropdown align="right" width={210} button={({ toggle }) => (<Button variant="secondary" iconOnly title="More actions" icon={<MoreHorizontal size={18} strokeWidth={STROKE} />} onClick={toggle} />)}>
          <MenuLabel>Manage</MenuLabel>
          <MenuItem icon={<CalendarClock size={16} strokeWidth={STROKE} />} onClick={() => setDeadlineForm(form)}>Deadline</MenuItem>
          {form.is_archived
            ? <MenuItem icon={<ArchiveRestore size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => setArchive(form, false)}>Activate for {academicYear || selectedYear}</MenuItem>
            : <MenuItem icon={<Archive size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => setArchive(form, true)}>Archive for {academicYear || selectedYear}</MenuItem>}
          {form.is_locked
            ? <MenuItem icon={<Unlock size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => toggleLock(form)}>Unlock form</MenuItem>
            : <MenuItem icon={<Lock size={16} strokeWidth={STROKE} />} disabled={busyId === form.id} onClick={() => toggleLock(form)}>Lock form</MenuItem>}
        </Dropdown>
      </div>
    );
  }

  const columns = [
    {
      key: "form", header: "Form Name", width: 340,
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
      key: "visibility", header: "Translation", width: 130,
      render: (form) => form.translate_enabled
        ? <Badge tone="info" icon={<Languages size={12} strokeWidth={STROKE} />}>EN + हिंदी</Badge>
        : <Badge tone="neutral">English only</Badge>,
    },
    {
      key: "roles", header: "Roles", width: 180, ellipsis: true,
      render: (form) => (form.roles && form.roles.length)
        ? <span style={{ fontSize: 12.5, color: color.text }} title={form.roles.map(titleOf).join(", ")}>{form.roles.map(titleOf).join(" • ")}</span>
        : <span style={{ fontSize: 12.5, color: color.muted }}>All department</span>,
    },
    {
      key: "deadline", header: "Deadline", width: 150,
      render: (form) => {
        const d = deadlineInfo(form);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: color.text, fontWeight: 600 }}>{d.dateText}</span>
            {d.label && <Badge tone={d.tone}>{d.label}</Badge>}
          </div>
        );
      },
    },
    {
      key: "access", header: "Access", width: 110,
      render: (form) => form.is_locked
        ? <Badge tone="danger" icon={<Lock size={11} strokeWidth={STROKE} />}>Locked</Badge>
        : <Badge tone="success">Open</Badge>,
    },
    { key: "actions", header: "", align: "right", width: 150, render: renderActions },
  ];

  const tabBtn = (key, label) => {
    const on = tab === key;
    return (
      <button key={key} onClick={() => setTab(key)} className="ui-focusable"
        style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: on ? color.surface : "transparent", color: on ? color.text : color.muted, boxShadow: on ? "0 1px 2px rgba(16,24,40,0.08)" : "none" }}>
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deadlineForm && <DeadlineModal form={deadlineForm} onClose={() => setDeadlineForm(null)} onSaved={load} showToast={showToast} />}

      <PageHeader
        breadcrumb={["Home", "Department", "Department Forms"]}
        title="Department Forms"
        description="Create and manage your department's own forms — deadlines, lifecycle, lock and translation — for the selected academic year."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={18} strokeWidth={STROKE} />} onClick={load}>Refresh</Button>
            <Button variant="secondary" icon={<CalendarCog size={18} strokeWidth={STROKE} />} onClick={() => setCarryOpen(true)}>Set Up Year</Button>
            <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={openCreate}>Create Form</Button>
          </>
        }
      />

      {carryOpen && (
        <CarryForwardModal
          year={selectedYear}
          yearLabel={academicYear || (selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : "")}
          onClose={() => setCarryOpen(false)}
          onDone={(msg) => { setCarryOpen(false); showToast(msg); load(); }}
          showToast={showToast}
        />
      )}

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <DataTable
        columns={columns}
        rows={visibleForms}
        rowKey={(f) => f.id}
        loading={loading}
        minWidth={920}
        toolbar={
          <>
            <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search forms…"
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
            title={searching ? "No forms match your search" : tab === "archived" ? "No archived forms" : "No department forms yet"}
            description={searching ? "Try a different name or clear the search." : tab === "archived" ? "Forms archived for this academic year will appear here." : "Create your department's first form for this academic year."}
            action={!searching && tab === "active" ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={openCreate}>Create Form</Button> : undefined}
          />
        }
      />
    </div>
  );
}

/* ── Academic-year cycle: carry-forward setup for the selected year ── */
function CarryForwardModal({ year, yearLabel, onClose, onDone, showToast }) {
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forms, setForms] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [prevYear, setPrevYear] = useState(year != null ? year - 1 : null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = year != null ? `?year=${year}` : "";
        const res = await apiFetch(`/api/department-forms/year-preview${qs}`);
        const d = await res.json();
        if (!alive) return;
        if (d.success) {
          setForms(d.forms || []);
          setPrevYear(d.previousYear);
          // Pre-select forms that already exist for this year (current_active) or
          // were active in the previous year (carry forward).
          setChecked(new Set((d.forms || []).filter((f) => f.current_active || f.prev_active).map((f) => String(f.id))));
        }
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [apiFetch, year]);

  const toggle = (id) => setChecked((prev) => { const n = new Set(prev); n.has(String(id)) ? n.delete(String(id)) : n.add(String(id)); return n; });
  const activeCount = checked.size;

  async function apply() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/department-forms/carry-forward", {
        method: "POST", body: JSON.stringify({ year, activeFormIds: Array.from(checked) }),
      });
      const d = await res.json();
      if (d.success) onDone(d.message || "Academic year set up.");
      else { showToast(d.message || "Failed to set up year.", "error"); setSaving(false); }
    } catch { showToast("Network error.", "error"); setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} width={560} icon={<CalendarCog size={18} strokeWidth={STROKE} />}
      title={`Set Up ${yearLabel || "Academic Year"}`}
      subtitle="Choose which of your department's forms are active this year. Unchecked forms are archived (you can activate them anytime)."
      footer={<>
        <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={saving} onClick={apply}>Apply ({activeCount} active)</Button>
      </>}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: color.muted, fontSize: 13 }}>Loading forms…</div>
      ) : forms.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: color.muted, fontSize: 13 }}>No forms in your department yet. Create a form first.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, background: "#f0fdf4", border: "1px solid #16a34a22", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{activeCount}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Active</div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, background: "#f1f5f9", border: `1px solid ${color.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: color.muted }}>{forms.length - activeCount}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Archived</div>
            </div>
          </div>
          {prevYear != null && <div style={{ fontSize: 12, color: color.muted, marginBottom: 8 }}>Pre-selected from forms active in {prevYear}–{prevYear + 1}.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {forms.map((f) => {
              const on = checked.has(String(f.id));
              return (
                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${on ? color.primary : color.border}`, background: on ? color.primarySoft : "#fff", cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(f.id)} style={{ width: 16, height: 16, accentColor: color.primary, cursor: "pointer" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{titleOf(f.form_name)}</span>
                  {on && <Check size={14} color={color.primary} style={{ marginLeft: "auto" }} />}
                </label>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
