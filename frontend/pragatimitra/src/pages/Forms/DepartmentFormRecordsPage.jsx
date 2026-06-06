import React, { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Lock, FilePlus, Download, FileText as FileCsv, FileSpreadsheet } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { Toast, isAuthError, formatDate } from "../../components/shared/formUtils";
import { color, Button, PageHeader, Badge, EmptyState, Modal, DataTable, Dropdown, MenuItem, MenuLabel } from "../../ui";

async function downloadDeptExport(formId, format, language, accessToken, year) {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const yq = year != null ? `&year=${year}` : "";
  const res = await fetch(`${API_BASE}/api/department-form-data/${formId}/export?format=${format}&language=${language}${yq}`,
    { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
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

/* ── Add / Edit record modal (English-authored; HI mirror is server-side) ── */
const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 6 };
const inputStyle = { width: "100%", height: 48, padding: "0 14px", border: `1px solid ${color.borderStrong}`, borderRadius: 10, fontSize: 14, color: color.text, outline: "none", boxSizing: "border-box", background: "#fff" };
const paneTitle = { fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 14 };

function ReadOnlyVal({ label, value, type }) {
  let display;
  if (type === "boolean") display = value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : "—";
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
   English editable (left) + current Hindi read-only (right, 60/40). No live
   translation; the read-only preview refreshes only AFTER a successful save.
════════════════════════════════════════════════════════════════════ */
function RecordEditView({ form, fields, record, allowedRoles, year, viewOnly = false, onBack, onReload, showToast }) {
  const { apiFetch } = useApi();
  const isEdit = !!record;
  const yq = year != null ? `?year=${year}` : "";
  const editLang = record?.language === "hi" ? "hi" : "en";
  const refLang  = editLang === "hi" ? "en" : "hi";
  const showReference = form.translate_enabled !== false && !!record?.id;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleName, setRoleName] = useState(record?.role_name || "");
  const [data, setData] = useState(() => { const init = {}; fields.forEach((f) => { const c = dbCol(f.column_name); init[c] = record ? (record[c] ?? "") : ""; }); return init; });
  const [refData, setRefData] = useState({});
  const [refLoading, setRefLoading] = useState(false);
  const set = (c, v) => setData((p) => ({ ...p, [c]: v }));

  useEffect(() => {
    const id = "pm-dept-rec-edit-css";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `.pm-dept-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:32px}@media(max-width:1000px){.pm-dept-grid{grid-template-columns:1fr;gap:24px}}`;
    document.head.appendChild(el);
  }, []);

  const refetch = useCallback(() => {
    if (!showReference || !record?.id) return;
    setRefLoading(true);
    apiFetch(`/api/department-form-data/${form.id}/records/${record.id}/counterpart${yq}`)
      .then((r) => r.json())
      .then((d) => { const ref = d?.record || {}; const next = {}; fields.forEach((f) => { const c = dbCol(f.column_name); next[c] = ref[c] ?? ""; }); setRefData(next); })
      .catch(() => {})
      .finally(() => setRefLoading(false));
  }, [showReference, record?.id, form.id, apiFetch, fields, yq]);
  useEffect(() => { refetch(); }, [refetch]);

  async function save(e) {
    e.preventDefault();
    if (viewOnly) return;
    setSaving(true); setError("");
    try {
      const res = isEdit
        ? await apiFetch(`/api/department-form-data/${form.id}/records/${record.id}${yq}`, { method: "PUT", body: JSON.stringify({ data, year }) })
        : await apiFetch(`/api/department-form-data/${form.id}/records${yq}`, { method: "POST", body: JSON.stringify({ data, role_name: roleName || null, year }) });
      const d = await res.json();
      if (d.success) { showToast(d.message || "Saved."); onReload(); if (showReference) setTimeout(refetch, 1200); }
      else setError(d.message || "Failed to save record.");
    } catch (e2) { if (!isAuthError(e2)) setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  function renderInput(f) {
    const c = dbCol(f.column_name);
    const label = f.label?.[editLang] || f.label?.en || displayCol(f.column_name);
    if (viewOnly) return <ReadOnlyVal key={c} label={label} value={data[c]} type={f.type} />;
    if (f.type === "boolean") {
      return (
        <div key={c}>
          <label style={labelStyle}>{label}{f.required && " *"}</label>
          <div style={{ display: "flex", gap: 16 }}>
            {[["true", "Yes"], ["false", "No"]].map(([val, txt]) => (
              <label key={val} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name={c} checked={String(data[c]) === val} onChange={() => set(c, val === "true")} style={{ accentColor: color.primary }} /> {txt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === "textarea" || f.type === "description") {
      return (
        <div key={c}>
          <label style={labelStyle}>{label}{f.required && " *"}</label>
          <textarea style={{ ...inputStyle, height: "auto", minHeight: 96, padding: "13px 15px", resize: "vertical" }} value={data[c] || ""} onChange={(e) => set(c, e.target.value)} />
        </div>
      );
    }
    const type = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
    return (
      <div key={c}>
        <label style={labelStyle}>{label}{f.required && " *"}</label>
        <input style={inputStyle} type={type} value={data[c] || ""} onChange={(e) => set(c, e.target.value)} />
      </div>
    );
  }

  const editPane = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...paneTitle, color: viewOnly ? "#64748b" : color.primary }}>{editLang === "hi" ? "Hindi" : "English"}{!viewOnly && " (Editable)"}</div>
      {!isEdit && !viewOnly && allowedRoles.length > 0 && (
        <div>
          <label style={labelStyle}>Role</label>
          <select style={inputStyle} value={roleName} onChange={(e) => setRoleName(e.target.value)}>
            <option value="">— None —</option>
            {allowedRoles.map((r) => <option key={r} value={r}>{titleOf(r)}</option>)}
          </select>
        </div>
      )}
      {fields.map(renderInput)}
    </div>
  );

  const refPane = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "#F8FAFC", borderRadius: 12, padding: 16, border: `1px dashed ${color.border}` }}>
      <div>
        <div style={{ ...paneTitle, color: "#64748b", marginBottom: 4 }}>{editLang === "hi" ? "English Reference" : "Hindi Reference"} {refLoading && <span style={{ fontWeight: 600, color: "#94a3b8" }}>· loading…</span>}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Translation updates after save.</div>
      </div>
      {fields.map((f) => {
        const c = dbCol(f.column_name);
        return <ReadOnlyVal key={c} label={f.label?.[refLang] || f.label?.en || displayCol(f.column_name)} value={refData[c]} type={f.type} />;
      })}
    </div>
  );

  return (
    <div className="pm-dept-rec-edit" style={{ padding: "24px 32px 96px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440, margin: "0 auto" }}>
      <PageHeader
        breadcrumb={["Home", "Department", { label: "Department Forms", onClick: onBack }, titleOf(form.form_name), isEdit ? "Edit Record" : "Add Record"]}
        title={isEdit ? "Edit Record" : "Add Record"}
        description={isEdit ? "Update data and review translated values." : "Fill in the details below."}
        actions={<Button variant="secondary" onClick={onBack}>← Back</Button>}
      />
      {viewOnly && (
        <Badge tone="danger" icon={<Lock size={12} strokeWidth={2.2} />} style={{ marginBottom: 16 }}>VIEW ONLY</Badge>
      )}
      <form onSubmit={save}>
        <div style={{ background: "#fff", border: `1px solid ${color.border}`, borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          {showReference ? <div className="pm-dept-grid">{editLang === "hi" ? refPane : editPane}{editLang === "hi" ? editPane : refPane}</div> : editPane}
        </div>
        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C", marginTop: 16 }}>{error}</div>}
        <div style={{ position: "sticky", bottom: 0, marginTop: 24 }}>
          <div style={{ height: 72, margin: "0 -32px", padding: "0 32px", background: "#fff", borderTop: `1px solid ${color.border}`, boxShadow: "0 -4px 16px rgba(16,24,40,0.06)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="secondary" type="button" disabled={saving} onClick={onBack}>Cancel</Button>
            {!viewOnly && <Button variant="primary" type="submit" loading={saving} disabled={saving}>{isEdit ? "Update Record" : "Add Record"}</Button>}
          </div>
        </div>
      </form>
    </div>
  );
}

export default function DepartmentFormRecordsPage({ form, year = null, onBack }) {
  const { apiFetch } = useApi();
  const { accessToken } = useAuth();
  const yq = year != null ? `&year=${year}` : "";
  const [recordLang, setRecordLang] = useState("en");   // local toggle — re-fetches only
  const [records, setRecords] = useState([]);
  const [schema, setSchema] = useState(null);
  const [lock, setLock] = useState({ is_locked: false, message: null });
  const [allowedRoles, setAllowedRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // null = list · "new" = add · record = edit
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records?language=${recordLang}${yq}`);
      const d = await res.json();
      if (d.success) { setRecords(d.records || []); setSchema(d.schema?.schema || null); setLock(d.lock || { is_locked: false }); }
      else setError(d.message || "Failed to load records.");
    } catch (e) { if (!isAuthError(e)) setError("Failed to load records."); }
    finally { setLoading(false); }
  }, [apiFetch, form.id, recordLang, yq]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch(`/api/department-forms/${form.id}/roles`).then((r) => r.json()).then((d) => { if (d.success) setAllowedRoles(d.roles || []); }).catch(() => {});
  }, [apiFetch, form.id]);

  const excluded = new Set(schema?.excluded_fixed_columns || []);
  const fields = (schema?.fields || []).filter((f) => !excluded.has(dbCol(f.column_name)) && !excluded.has(f.column_name));

  const viewingHi = recordLang === "hi";
  const readOnly = lock.is_locked || viewingHi;   // add/delete disabled in HI / when locked
  const canEdit = !lock.is_locked;                 // editing allowed in both languages unless locked

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records/${deleteId}${year != null ? `?year=${year}` : ""}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { showToast("Record deleted."); load(); }
      else showToast(d.message || "Failed to delete.", "error");
    } catch (e) { if (!isAuthError(e)) showToast("Network error.", "error"); }
    finally { setDeleting(false); setDeleteId(null); }
  }

  const columns = [
    { key: "role_name", header: "Role", width: 150, render: (r) => r.role_name ? <Badge tone="primary">{titleOf(r.role_name)}</Badge> : <span style={{ color: color.muted }}>—</span> },
    ...fields.map((f) => ({
      key: dbCol(f.column_name), header: f.label?.[recordLang] || f.label?.en || displayCol(f.column_name), ellipsis: true, width: 200,
      render: (r) => {
        const v = r[dbCol(f.column_name)];
        if (f.type === "boolean") return v === true || v === "true" ? "Yes" : v === false || v === "false" ? "No" : "—";
        return v ?? <span style={{ color: "#cbd5e1" }}>—</span>;
      },
    })),
    { key: "language", header: "Language", width: 110, render: (r) => <Badge tone={r.language === "hi" ? "info" : "neutral"}>{r.language === "hi" ? "हिंदी" : "English"}</Badge> },
    { key: "created_at", header: "Created", width: 130, render: (r) => <span style={{ fontSize: 12, color: color.muted }}>{formatDate(r.created_at)}</span> },
    ...(canEdit ? [{
      key: "actions", header: "", align: "right", width: 100,
      render: (r) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="secondary" iconOnly title="Edit" icon={<Pencil size={16} strokeWidth={STROKE} />} onClick={() => setEditTarget(r)} />
          {!readOnly && <Button variant="outlineDanger" iconOnly title="Delete" icon={<Trash2 size={16} strokeWidth={STROKE} />} onClick={() => setDeleteId(r.id)} />}
        </div>
      ),
    }] : []),
  ];

  const langBtn = (key, label) => {
    const on = recordLang === key;
    return (
      <button key={key} onClick={() => setRecordLang(key)} className="ui-focusable"
        style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: on ? color.surface : "transparent", color: on ? color.text : color.muted, boxShadow: on ? "0 1px 2px rgba(16,24,40,0.08)" : "none" }}>
        {label}
      </button>
    );
  };

  /* Dedicated in-shell edit/add page (no overlay) */
  if (editTarget) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <RecordEditView
          form={form}
          fields={fields}
          record={editTarget === "new" ? null : editTarget}
          allowedRoles={allowedRoles}
          year={year}
          viewOnly={editTarget !== "new" && lock.is_locked}
          onBack={() => { setEditTarget(null); load(); }}
          onReload={load}
          showToast={showToast}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} width={420} title="Delete Record?"
          footer={<>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} disabled={deleting} onClick={handleDelete}>Delete Record</Button>
          </>}>
          <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.6 }}>This record (and its Hindi copy) will be permanently deleted. This cannot be undone.</div>
        </Modal>
      )}

      <PageHeader
        breadcrumb={["Home", "Department", { label: "Department Forms", onClick: onBack }, titleOf(form.form_name)]}
        title={titleOf(form.form_name)}
        description={loading
          ? "Loading…"
          : `${records.length} record${records.length !== 1 ? "s" : ""}${year != null ? ` · ${year}–${year + 1}` : ""} · your department only`}
        actions={
          <>
            <div style={{ display: "inline-flex", border: `1px solid ${color.border}`, borderRadius: 10, padding: 3, gap: 2, background: color.hover }}>
              {langBtn("en", "EN")}
              {langBtn("hi", "हिंदी")}
            </div>
            <Dropdown align="right" width={200} button={({ toggle }) => (
              <Button variant="secondary" iconOnly title="Export" aria-label="Export" icon={<Download size={18} strokeWidth={STROKE} />} onClick={toggle} />
            )}>
              <MenuLabel>Export</MenuLabel>
              <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "csv", recordLang, accessToken, year)}>Download CSV</MenuItem>
              <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "xlsx", recordLang, accessToken, year)}>Download Excel</MenuItem>
            </Dropdown>
            <Button
              variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} disabled={readOnly}
              title={lock.is_locked ? "Form is locked" : viewingHi ? "Switch to EN to add records" : ""}
              onClick={() => { if (!readOnly) setEditTarget("new"); }}
            >
              Add Record
            </Button>
          </>
        }
      />

      {lock.is_locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
          <Lock size={18} color="#B91C1C" strokeWidth={2} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>{lock.message || "This form is view-only."}</div>
        </div>
      )}

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <DataTable
        columns={columns}
        rows={records}
        rowKey={(r) => r.id}
        loading={loading}
        minWidth={760}
        empty={<EmptyState icon={<FilePlus size={26} strokeWidth={1.5} />} title="No records yet" description={viewingHi ? "No Hindi records to show." : "Click “Add Record” to create the first entry."}
          action={!readOnly ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => setEditTarget("new")}>Add Record</Button> : undefined} />}
      />
    </div>
  );
}
