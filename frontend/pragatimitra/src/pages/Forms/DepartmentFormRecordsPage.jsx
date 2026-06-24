import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Lock, FilePlus, Download, FileText as FileCsv, FileSpreadsheet, CalendarClock } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import { color, Button, PageHeader, Badge, EmptyState, Modal, DataTable, Dropdown, MenuItem, MenuLabel, Input, Textarea, FieldLabel } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
import api from "../../services/api";

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

const STROKE = 1.75;
const dbCol = (c) => c.trim().toLowerCase().replace(/\s+/g, "_");
const displayCol = (c) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function titleOf(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

/* Deadline badge for the records view: OPEN / EXPIRES IN N DAYS / EXPIRED.
   Driven by the form's year-scoped deadline_at (passed from the list row). */
function recordsDeadlineBadge(deadlineAt) {
  if (!deadlineAt) return { tone: "success", label: "OPEN" };
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return { tone: "danger", label: "EXPIRED" };
  const days = Math.ceil(ms / 86400000);
  if (days <= 1) return { tone: "warning", label: "EXPIRES TODAY" };
  return { tone: days <= 3 ? "warning" : "success", label: `EXPIRES IN ${days} DAYS` };
}

/* ── Add / Edit record (single-language English form) ── */
const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 6 };

function ReadOnlyVal({ label, value, type }) {
  const { lang } = useLanguage();
  let display;
  if (type === "boolean") display = value === true || value === "true" ? t("Yes", lang) : value === false || value === "false" ? t("No", lang) : "—";
  else display = value == null || value === "" ? "—" : String(value);
  const empty = display === "—";
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ width: "100%", minHeight: 48, padding: "12px 14px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 14, color: empty ? "#94a3b8" : "#475569", background: "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word", boxSizing: "border-box" }}>
        {display}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RecordEditView — dedicated in-shell edit/add page for a department record.
   Single-language (English); department forms do not support translation.
════════════════════════════════════════════════════════════════════ */
function RecordEditView({ form, fields, record, year, viewOnly = false, onBack, showToast }) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();
  const isEdit = !!record;
  const yq = year != null ? `?year=${year}` : "";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(() => { const init = {}; fields.forEach((f) => { const c = dbCol(f.column_name); init[c] = record ? (record[c] ?? "") : ""; }); return init; });
  const set = (c, v) => setData((p) => ({ ...p, [c]: v }));

  async function save(e) {
    e.preventDefault();
    if (viewOnly || saving) return;   // guard double-submit
    setSaving(true); setError("");
    try {
      const res = isEdit
        ? await apiFetch(`/api/department-form-data/${form.id}/records/${record.id}${yq}`, { method: "PUT", body: JSON.stringify({ data, year }) })
        : await apiFetch(`/api/department-form-data/${form.id}/records${yq}`, { method: "POST", body: JSON.stringify({ data, year }) });
      const d = await res.json();
      if (d.success) {
        showToast(d.message || "Saved.");
        // Both add and edit → return to the records list (onBack refreshes it).
        // Keeps the button disabled through navigation so it can't be re-submitted.
        onBack();
        return;
      } else {
        setError(d.message || "Failed to save record.");
        setSaving(false);
      }
    } catch (e2) {
      if (!isAuthError(e2)) setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  function renderInput(f) {
    const c = dbCol(f.column_name);
    const label = f.label?.en || displayCol(f.column_name);
    if (viewOnly) return <ReadOnlyVal key={c} label={label} value={data[c]} type={f.type} />;
    if (f.type === "boolean") {
      return (
        <div key={c}>
          <FieldLabel required={f.required}>{label}</FieldLabel>
          <div style={{ display: "flex", gap: 16 }}>
            {[["true", "Yes"], ["false", "No"]].map(([val, txt]) => (
              <label key={val} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name={c} checked={String(data[c]) === val} onChange={() => set(c, val === "true")} style={{ accentColor: color.primary }} /> {t(txt, lang)}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === "textarea" || f.type === "description") {
      return (
        <div key={c}>
          <FieldLabel required={f.required}>{label}</FieldLabel>
          <Textarea value={data[c] || ""} onChange={(e) => set(c, e.target.value)} />
        </div>
      );
    }
    const type = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
    return (
      <div key={c}>
        <FieldLabel required={f.required}>{label}</FieldLabel>
        <Input type={type} value={data[c] || ""} onChange={(e) => set(c, e.target.value)} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), { label: t("Department Forms", lang), onClick: onBack }, titleOf(form.form_name), isEdit ? t("Edit Record", lang) : t("Add Record", lang)]}
        title={isEdit ? t("Edit Record", lang) : t("Add Record", lang)}
        description={isEdit ? t("Update the record details.", lang) : t("Fill in the details below.", lang)}
        actions={<Button variant="secondary" onClick={onBack}>{t("← Back", lang)}</Button>}
      />
      {viewOnly && (
        <Badge tone="danger" icon={<Lock size={12} strokeWidth={2.2} />} style={{ marginBottom: 16 }}>{t("VIEW ONLY", lang)}</Badge>
      )}
      <form onSubmit={save} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, background: "#fff", border: `1px solid ${color.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(16,24,40,0.04)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 28px", borderBottom: `1px solid ${color.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{titleOf(form.form_name)}</div>
            <div style={{ fontSize: 12, color: color.muted, marginTop: 2 }}>{isEdit ? t("Edit this record", lang) : t("Enter the details for a new record", lang)}</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            {fields.length === 0
              ? <div style={{ fontSize: 13, color: color.muted, textAlign: "center", padding: "12px 0" }}>{t("This form has no fields yet.", lang)}</div>
              : fields.map(renderInput)}
            {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>{error}</div>}
          </div>
          <div style={{ padding: "16px 28px", borderTop: `1px solid ${color.border}`, background: color.hover, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="secondary" type="button" disabled={saving} onClick={onBack}>{t("Cancel", lang)}</Button>
            {!viewOnly && <Button variant="primary" type="submit" loading={saving} disabled={saving}>{isEdit ? t("Update Record", lang) : t("Add Record", lang)}</Button>}
          </div>
        </div>
      </form>
    </div>
  );
}

export default function DepartmentFormRecordsPage({ form, year = null, onBack }) {
  const { apiFetch } = useApi();
  const { accessToken, user } = useAuth();
  const { lang } = useLanguage();
  // Only contributors may enter/modify data. Admins & nodal officers (who reach
  // this page via "View records") get a read-only view.
  const roleNames = (user?.roles || []).map((r) => (typeof r === "string" ? r : r?.name));
  // TEMP (testing): contributor role not provisioned yet — allow department_admin
  // to enter data too. Remove "department_admin" once contributors exist.
  const canEnterData = roleNames.includes("contributor") || roleNames.includes("department_admin");
  const yq = year != null ? `&year=${year}` : "";
  const [records, setRecords] = useState([]);
  const [schema, setSchema] = useState(null);
  const [lock, setLock] = useState({ is_locked: false, message: null });
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // null = list · "new" = add · record = edit
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  // Skeleton only on the FIRST load. On refreshes (year change, post-save reload)
  // keep the current rows visible and swap them in place — no flicker / height jump.
  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records${year != null ? `?year=${year}` : ""}`);
      const d = await res.json();
      if (d.success) { setRecords(d.records || []); setSchema(d.schema?.schema || null); setLock(d.lock || { is_locked: false }); }
      else setError(d.message || t("Failed to load records.", lang));
    } catch (e) { if (!isAuthError(e)) setError(t("Failed to load records.", lang)); }
    finally { setLoading(false); hasLoadedRef.current = true; }
  }, [apiFetch, form.id, yq, lang]);

  useEffect(() => { load(); }, [load]);

  /* Avoid the loading skeleton "flashing" on fast fetches: only reveal it if the
     request is still pending after a short grace period. Fast loads go straight
     to the data with no flicker. */
  useEffect(() => {
    if (!loading) { setShowSkeleton(false); return; }
    const tmr = setTimeout(() => setShowSkeleton(true), 220);
    return () => clearTimeout(tmr);
  }, [loading]);

  const excluded = new Set(schema?.excluded_fixed_columns || []);
  const fields = (schema?.fields || []).filter((f) => !f.hidden && !excluded.has(dbCol(f.column_name)) && !excluded.has(f.column_name));

  const readOnly = lock.is_locked || !canEnterData;   // add/delete disabled when locked or non-contributor
  const canEdit = canEnterData && !lock.is_locked;    // row edit action only for contributors

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records/${deleteId}${year != null ? `?year=${year}` : ""}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { showToast(t("Record deleted.", lang)); load(); }
      else showToast(d.message || t("Failed to delete.", lang), "error");
    } catch (e) { if (!isAuthError(e)) showToast(t("Network error.", lang), "error"); }
    finally { setDeleting(false); setDeleteId(null); }
  }

  const columns = [
    { key: "entered_by", header: t("Added By", lang), width: 180, render: (r) => r.entered_by ? <span style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{r.entered_by}</span> : <span style={{ color: color.muted }}>—</span> },
    ...fields.map((f) => ({
      key: dbCol(f.column_name), header: f.label?.en || displayCol(f.column_name), ellipsis: true, width: 200,
      render: (r) => {
        const v = r[dbCol(f.column_name)];
        if (f.type === "boolean") return v === true || v === "true" ? t("Yes", lang) : v === false || v === "false" ? t("No", lang) : "—";
        return v ?? <span style={{ color: "#cbd5e1" }}>—</span>;
      },
    })),
    { key: "created_at", header: t("Created", lang), width: 140, render: (r) => <span style={{ fontSize: 12, color: color.muted }}>{r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span> },
    ...(canEdit ? [{
      key: "actions", header: "", align: "right", width: 100,
      render: (r) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="secondary" iconOnly title={t("Edit", lang)} icon={<Pencil size={16} strokeWidth={STROKE} />} onClick={() => setEditTarget(r)} />
          {!readOnly && <Button variant="outlineDanger" iconOnly title={t("Delete", lang)} icon={<Trash2 size={16} strokeWidth={STROKE} />} onClick={() => setDeleteId(r.id)} />}
        </div>
      ),
    }] : []),
  ];

  /* Dedicated in-shell edit/add page (no overlay) */
  if (editTarget) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <RecordEditView
          form={form}
          fields={fields}
          record={editTarget === "new" ? null : editTarget}
          year={year}
          viewOnly={editTarget !== "new" && lock.is_locked}
          onBack={() => { setEditTarget(null); load(); }}
          showToast={showToast}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} width={420} title={t("Delete Record?", lang)}
          footer={<>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteId(null)}>{t("Cancel", lang)}</Button>
            <Button variant="danger" loading={deleting} disabled={deleting} onClick={handleDelete}>{t("Delete Record", lang)}</Button>
          </>}>
          <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.6 }}>{t("This record will be permanently deleted. This cannot be undone.", lang)}</div>
        </Modal>
      )}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), { label: t("Department Forms", lang), onClick: onBack }, titleOf(form.form_name)]}
        title={titleOf(form.form_name)}
        actions={
          <>
            <Dropdown align="right" width={200} button={({ toggle }) => (
              <Button variant="secondary" icon={<Download size={18} strokeWidth={STROKE} />} onClick={toggle}>{t("Export", lang)}</Button>
            )}>
              <MenuLabel>{t("Export", lang)}</MenuLabel>
              <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "csv", accessToken, year)}>{t("Download CSV", lang)}</MenuItem>
              <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "xlsx", accessToken, year)}>{t("Download Excel", lang)}</MenuItem>
            </Dropdown>
            {canEnterData && (
              <Button
                variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} disabled={readOnly}
                title={lock.is_locked ? t("Form is locked", lang) : ""}
                onClick={() => { if (!readOnly) setEditTarget("new"); }}
              >
                {t("Add Record", lang)}
              </Button>
            )}
          </>
        }
      />

      {(() => {
        // When the form is locked, the access state is LOCKED — never show the
        // deadline's "OPEN" badge (which only reflects the deadline window and
        // would contradict the lock notice below).
        const b = recordsDeadlineBadge(form.deadline_at);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: lock.is_locked ? 12 : 20 }}>
            {lock.is_locked
              ? <Badge tone="danger" icon={<Lock size={12} strokeWidth={STROKE} />}>{t("LOCKED", lang)}</Badge>
              : <Badge tone={b.tone} icon={<CalendarClock size={12} strokeWidth={STROKE} />}>{b.label}</Badge>}
            {form.deadline_at && (
              <span style={{ fontSize: 12, color: color.muted }}>
                {t("Deadline:", lang)} {new Date(form.deadline_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        );
      })()}

      {lock.is_locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
          <Lock size={18} color="#B91C1C" strokeWidth={2} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>{lock.message || t("This form is view-only.", lang)}</div>
        </div>
      )}

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {loading && !showSkeleton ? (
          <div style={{ flex: 1, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 16 }} />
        ) : (
          <DataTable
            fill
            columns={columns}
            rows={records}
            rowKey={(r) => r.id}
            loading={loading}
            minWidth={760}
            empty={<EmptyState icon={<FilePlus size={26} strokeWidth={1.5} />} title={t("No records yet", lang)} description={t("Click “Add Record” to create the first entry.", lang)}
              action={!readOnly ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => setEditTarget("new")}>{t("Add Record", lang)}</Button> : undefined} />}
          />
        )}
      </div>
    </div>
  );
}
