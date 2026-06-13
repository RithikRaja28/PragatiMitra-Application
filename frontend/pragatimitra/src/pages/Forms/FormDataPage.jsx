import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { createPortal } from "react-dom";
import { Trash2, FileText, FilePlus, Lock, Clock, Globe, SearchX, Table2, LayoutGrid } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { S, Toast, isAuthError, formatDate } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";
import { tableCardStyle } from "../../components/shared/ui";
import { Button, Input, Textarea, FieldLabel, Badge } from "../../ui";

const ACCENT = "#2563eb";
const CHUNK_SIZE = 500;

function dbCol(col) { return col.trim().toLowerCase().replace(/\s+/g, "_"); }
function displayCol(col) { return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

/* Derive deadline display + status from a form row (DB-driven). */
function formStatus(form) {
  const deadline = form.deadline_at ? new Date(form.deadline_at) : null;
  const expired = deadline ? deadline.getTime() <= Date.now() : false;
  const dateText = deadline
    ? deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "No deadline";

  let badge;
  if (form.is_locked || expired) {
    badge = { label: expired ? "Expired" : "Locked", color: "#dc2626", bg: "#fef2f2" };
  } else if (deadline) {
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    badge = { label: `${daysLeft}d left`, color: daysLeft <= 3 ? "#d97706" : "#16a34a", bg: daysLeft <= 3 ? "#fffbeb" : "#f0fdf4" };
  } else {
    badge = { label: "Open", color: "#16a34a", bg: "#f0fdf4" };
  }
  return { dateText, expired, badge };
}

/* ── Icons ── */
function IcoPlus() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function IcoEdit() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function IcoTrash() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function IcoBack() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function IcoForm() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>; }
function IcoUpload() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>; }
function IcoFile() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>; }
function IcoDownload() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>; }
function IcoChevronDown() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IcoCheck() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function IcoAlert() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function IcoSortAsc() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>; }
function IcoSortDesc() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IcoSort() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>; }
function IcoSearch() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }

const ALLOWED_TYPES = ["image/jpeg","image/png","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const MAX_SIZE = 10 * 1024 * 1024;

/* ════════════════════════════════════════════════════════════════════
   Portal Modal Wrapper — renders outside any overflow:hidden parent
   This fixes the modal-not-appearing bug where parent containers
   with overflow:hidden or transform clip the fixed-position modal.
════════════════════════════════════════════════════════════════════ */
function ModalPortal({ children }) {
  const el = useRef(document.createElement("div"));
  useEffect(() => {
    const portal = el.current;
    portal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;";
    document.body.appendChild(portal);
    return () => { document.body.removeChild(portal); };
  }, []);
  return ReactDOM.createPortal(
    <div style={{ pointerEvents: "auto" }}>{children}</div>,
    el.current
  );
}

function DocumentUploadField({ label, required, value, onChange, getToken }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const hasExisting = !!value && status === "idle";
  async function handleFile(file) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setErrMsg("File type not allowed."); setStatus("error"); return; }
    if (file.size > MAX_SIZE) { setErrMsg("File exceeds 10 MB."); setStatus("error"); return; }
    setStatus("uploading"); setErrMsg(""); setFileName(file.name);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = getToken();
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload/document`, {
        method: "POST", body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed.");
      /* Backend returns the S3 key; store it (not a URL) */
      onChange(data.fileKey);
      setStatus("done");
    } catch (err) { setErrMsg(err.message || "Upload failed."); setStatus("error"); }
  }
  return (
    <div>
      <label style={S.label}>{label}{required && " *"}</label>
      <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        style={{ border: `2px dashed ${status==="error"?"#f87171":status==="done"?"#34d399":"#cbd5e1"}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", cursor: status==="uploading"?"not-allowed":"pointer", background: status==="done"?"#f0fdf4":status==="error"?"#fef2f2":"#f8fafc", transition: "all .15s" }}>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} disabled={status==="uploading"} />
        {status === "uploading" && <div style={{ fontSize: 13, color: "#64748b" }}>Uploading <strong>{fileName}</strong>…</div>}
        {status === "done" && <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ <strong>{fileName}</strong> uploaded. <span style={{ fontWeight: 400, color: "#64748b" }}>Click to replace.</span></div>}
        {status === "error" && <div style={{ fontSize: 13 }}><div style={{ color: "#dc2626", fontWeight: 600, marginBottom: 4 }}>{errMsg}</div><span style={{ color: "#64748b", fontSize: 12 }}>Click to try again.</span></div>}
        {status === "idle" && <div><div style={{ color: "#94a3b8", marginBottom: 6, display: "flex", justifyContent: "center" }}><IcoUpload /></div>{hasExisting ? <div style={{ fontSize: 13, color: "#64748b" }}><IcoFile /> File attached. <span style={{ color: ACCENT, fontWeight: 600 }}>Click to replace.</span></div> : <div style={{ fontSize: 13, color: "#64748b" }}><span style={{ color: ACCENT, fontWeight: 600 }}>Click to upload</span> or drag & drop<div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>PDF, Word, Excel, Images · max 10 MB</div></div>}</div>}
      </div>
    </div>
  );
}

function DocumentCell({ fileKey, getToken, lang = "en" }) {
  const [loading, setLoading] = useState(false);
  if (!fileKey) return <span style={{ color: "#cbd5e1" }}>—</span>;

  /* Legacy: value is a full local URL stored before S3 migration */
  const isLegacyUrl = fileKey.startsWith("http://") || fileKey.startsWith("https://");

  async function handleView() {
    if (isLegacyUrl) { window.open(fileKey, "_blank", "noreferrer"); return; }
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = getToken ? getToken() : null;
      const res = await fetch(`${API_BASE}/api/upload/read-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ fileKey }),
      });
      const data = await res.json();
      if (data.readUrl) window.open(data.readUrl, "_blank", "noreferrer");
    } finally { setLoading(false); }
  }

  return (
    <button onClick={handleView} disabled={loading}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, color: ACCENT, fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: loading ? "wait" : "pointer", padding: 0, textDecoration: "none" }}>
      <IcoFile /> {loading ? (lang === "hi" ? "लोड हो रहा है…" : "Loading…") : (lang === "hi" ? "दस्तावेज़ देखें ↗" : "View Doc ↗")}
    </button>
  );
}

function FieldInput({ field, value, onChange, getToken, lang = "en" }) {
  const col = dbCol(field.column_name);
  const label = field.label?.[lang] || field.label?.en || displayCol(field.column_name);
  const type = field.type;
  if (type === "boolean") return (
    <div><FieldLabel required={field.required}>{label}</FieldLabel>
      <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
        {[{val:"true",text:"Yes"},{val:"false",text:"No"}].map(({val,text}) => (
          <label key={val} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
            <input type="radio" name={col} value={val} checked={String(value)===val} onChange={() => onChange(col, val==="true")} style={{ accentColor: ACCENT, width: 15, height: 15 }} /> {text}
          </label>
        ))}
      </div>
    </div>
  );
  if (type === "textarea" || type === "description") return <div><FieldLabel required={field.required}>{label}</FieldLabel><Textarea value={value||""} onChange={e => onChange(col, e.target.value)} required={field.required} /></div>;
  if (type === "document") return <DocumentUploadField label={label} required={field.required} value={value} onChange={url => onChange(col, url)} getToken={getToken} />;
  const inputType = type==="number"?"number":type==="date"?"date":type==="email"?"email":type==="phone"?"tel":"text";
  return <div><FieldLabel required={field.required}>{label}</FieldLabel><Input type={inputType} value={value||""} onChange={e => onChange(col, e.target.value)} required={field.required} /></div>;
}

/* ── Read-only field renderer (reference pane of the edit dialog) ──────── */
function ReadOnlyField({ field, value, lang = "en" }) {
  const label  = field.label?.[lang] || field.label?.en || displayCol(field.column_name);
  const isArea = field.type === "textarea" || field.type === "description";
  const empty  = value == null || value === "";

  let display;
  if (field.type === "boolean")
    display = value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : "—";
  else if (field.type === "document")
    display = empty ? "—" : "📎 File attached";
  else
    display = empty ? "—" : String(value);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div
        style={{
          width: "100%",
          minHeight: isArea ? 80 : 44,
          padding: isArea ? "10px 14px" : "0 14px",
          display: "flex",
          alignItems: isArea ? "flex-start" : "center",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 13,
          color: empty ? "#94a3b8" : "#475569",
          background: "#fff",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          boxSizing: "border-box",
        }}
      >
        {display}
      </div>
    </div>
  );
}

/* ── One titled column of the edit dialog ─────────────────────────────── */
function ModalPane({ title, reference, helper, loading, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: helper ? 4 : 14 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: reference ? "#64748b" : ACCENT }}>
          {title}
        </span>
        {reference && (
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#64748b", background: "#e2e8f0", borderRadius: 20, padding: "2px 8px" }}>
            Read Only
          </span>
        )}
        {reference && loading && (
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>· loading…</span>
        )}
      </div>
      {helper && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>{helper}</div>
      )}
      {/* Reference side: visually muted + non-interactive per spec */}
      <div
        style={
          reference
            ? { display: "flex", flexDirection: "column", gap: 16, background: "#F8FAFC", opacity: 0.95, pointerEvents: "none", borderRadius: 8, padding: 16, border: "1px dashed #e2e8f0" }
            : { display: "flex", flexDirection: "column", gap: 16 }
        }
      >
        {children}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RecordEditPage — DEDICATED in-shell edit page (replaces the large overlay
   dialog). Navbar + sidebar stay visible; no overlay. English editable on the
   left, current Hindi shown read-only on the right (60/40). NO live translation
   — the read-only preview is the saved DB values and refreshes only AFTER save.
   onSave(formData) → Promise<{ success, message }> (parent performs the API
   call; the page stays open and refreshes the preview on success).
════════════════════════════════════════════════════════════════════ */
function RecordEditPage({ fields, record, onSave, onBack, getToken, formName, formTitle, apiFetch, translationEnabled = true, viewOnly = false }) {
  const isEdit = !!record;
  const editLang = record?.language === "hi" ? "hi" : "en";
  const refLang  = editLang === "hi" ? "en" : "hi";
  const showReference = translationEnabled !== false && !!record?.id;

  const [formData, setFormData] = useState(() => {
    const init = {};
    fields.forEach(f => { const col = dbCol(f.column_name); init[col] = record ? (record[col] ?? "") : ""; });
    return init;
  });
  const [refData, setRefData]       = useState({});
  const [refLoading, setRefLoading] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  function handleChange(col, val) { setFormData(prev => ({ ...prev, [col]: val })); }

  /* Inject scoped CSS once: 60/40 split layout (stacks on tablet). Field styling
     now comes from the standard ui Input/Textarea (src/ui/Field). */
  useEffect(() => {
    const id = "pm-rec-edit-css";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      .pm-rec-grid { display:grid; grid-template-columns:1.5fr 1fr; gap:32px; }
      @media (max-width: 1000px){ .pm-rec-grid { grid-template-columns:1fr; gap:24px; } }
    `;
    document.head.appendChild(el);
  }, []);

  /* One-time read-only fetch of the linked translated row. NO live preview, NO
     translation API call while typing — refreshed only after a successful save. */
  const refetchCounterpart = useCallback(() => {
    if (!showReference || !record?.id) return;
    setRefLoading(true);
    apiFetch(`/api/form-data/${formName}/records/${record.id}/counterpart`)
      .then(r => r.json())
      .then(d => {
        const ref = d?.record || {};
        const next = {};
        fields.forEach(f => { const col = dbCol(f.column_name); next[col] = ref[col] ?? ""; });
        setRefData(next);
      })
      .catch(() => {})
      .finally(() => setRefLoading(false));
  }, [showReference, record?.id, formName, apiFetch, fields]);

  useEffect(() => { refetchCounterpart(); }, [refetchCounterpart]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (viewOnly) return;
    setSaving(true); setError("");
    const res = await onSave(formData);
    setSaving(false);
    if (res?.success) {
      // Stay on the page; refresh the Hindi preview once the server-side
      // translation has had a moment to run (it's async on the backend).
      if (showReference) setTimeout(refetchCounterpart, 1200);
    } else {
      setError(res?.message || "Failed to save record.");
    }
  }

  const noFields = <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "24px 0" }}>No schema fields configured for this form.</div>;

  const editablePane = (
    <ModalPane title={viewOnly ? (editLang === "hi" ? "Hindi" : "English") : (editLang === "hi" ? "Hindi (Editable)" : "English (Editable)")}>
      {fields.length === 0 ? noFields : fields.map(field => (
        viewOnly
          ? <ReadOnlyField key={dbCol(field.column_name)} field={field} value={formData[dbCol(field.column_name)]} lang={editLang} />
          : <FieldInput key={dbCol(field.column_name)} field={field} value={formData[dbCol(field.column_name)]} onChange={handleChange} getToken={getToken} lang={editLang} />
      ))}
    </ModalPane>
  );

  const referencePane = (
    <ModalPane title={editLang === "hi" ? "English Reference (Current)" : "Hindi Reference (Current)"} reference loading={refLoading} helper="Translation updates after save.">
      {fields.length === 0 ? noFields : fields.map(field => (
        <ReadOnlyField key={dbCol(field.column_name)} field={field} value={refData[dbCol(field.column_name)]} lang={refLang} />
      ))}
    </ModalPane>
  );

  const leftPane  = editLang === "hi" ? referencePane : editablePane;
  const rightPane = editLang === "hi" ? editablePane  : referencePane;

  return (
    <div className="pm-rec-edit" style={{ padding: "20px 28px 96px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
      <PageHeader
        breadcrumb={["Home", { label: "Forms & Data Entry", onClick: onBack }, formTitle, isEdit ? "Edit Record" : "Add Record"]}
        title={isEdit ? "Edit Record" : "Add Record"}
        description={isEdit ? "Update data and review translated values." : "Fill in the details below."}
        actions={
          <Button variant="ghost" onClick={onBack} icon={<span style={{ fontSize: 15, lineHeight: 1 }}>←</span>}>Back</Button>
        }
      />

      {viewOnly && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          <Lock size={13} strokeWidth={2.2} /> VIEW ONLY
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 32, boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          {showReference ? <div className="pm-rec-grid">{leftPane}{rightPane}</div> : editablePane}
        </div>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginTop: 16 }}>{error}</div>
        )}

        {/* Sticky action footer (72px) — stays visible, never overlaps the shell. */}
        <div style={{ position: "sticky", bottom: 0, marginTop: 24 }}>
          <div style={{ height: 72, margin: "0 -28px", padding: "0 28px", background: "#fff", borderTop: "1px solid #e5e7eb", boxShadow: "0 -4px 16px rgba(16,24,40,0.06)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
            <Button type="button" variant="secondary" onClick={onBack} disabled={saving}>Cancel</Button>
            {!viewOnly && (
              <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Update Record" : "Add Record"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DeleteModal — single or bulk, rendered via ModalPortal
════════════════════════════════════════════════════════════════════ */
function DeleteModal({ count = 1, onConfirm, onClose, deleting }) {
  const isBulk = count > 1;
  return (
    <ModalPortal>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{ background: "#fff", borderRadius: 8, width: 400, padding: "32px 28px", boxShadow: "0 24px 64px rgba(0,0,0,0.22)", textAlign: "center" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef2f2", border: "2px solid #fecaca", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>🗑️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            {isBulk ? `Delete ${count} Records?` : "Delete Record?"}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8, lineHeight: 1.6 }}>
            {isBulk
              ? `You are about to permanently delete ${count} selected records. This action cannot be undone.`
              : "This record will be permanently deleted. This action cannot be undone."}
          </div>
          {isBulk && (
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 20, textAlign: "left" }}>
              ⚠️ Tip: Use bulk delete to clean up failed imports before re-importing.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: isBulk ? 0 : 20 }}>
            <Button variant="secondary" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={onConfirm} loading={deleting} disabled={deleting}>
              {deleting ? "Deleting…" : isBulk ? `Delete ${count} Records` : "Delete Record"}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Progress Bar ── */
function ProgressBar({ percent, color = ACCENT, height = 8 }) {
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(Math.max(percent, 0), 100)}%`, background: color, borderRadius: 99, transition: "width 0.25s ease" }} />
    </div>
  );
}

function ImportProgressPanel({ total, processed, remaining, percent, chunksDone, chunksTotal }) {
  return (
    <div style={{ background: "#f8fafc", border: `1.5px solid ${ACCENT}30`, borderRadius: 8, padding: "16px 18px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2.5px solid ${ACCENT}30`, borderTopColor: ACCENT, animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Importing records…</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: ACCENT }}>{Math.round(percent)}%</span>
      </div>
      <ProgressBar percent={percent} height={10} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
        {[
          { label: "Total",     value: total,     color: "#475569", bg: "#f1f5f9" },
          { label: "Processed", value: processed, color: "#16a34a", bg: "#dcfce7" },
          { label: "Remaining", value: remaining, color: "#d97706", bg: "#fef3c7" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>
        Batch {chunksDone} of {chunksTotal} · Please keep this window open
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FormImportWizard — with dept selection, rendered via ModalPortal
════════════════════════════════════════════════════════════════════ */
function FormImportWizard({ formName, onClose, onDone, apiFetch, getToken }) {
  const [step, setStep] = useState(1);
  const fileRef = useRef(null);

  const [file, setFile]               = useState(null);
  const [parsing, setParsing]         = useState(false);
  const [parseError, setParseError]   = useState("");
  const [duplicateHandling, setDuplicateHandling] = useState("skip");

  const [departments, setDepartments]         = useState([]);
  const [userRole, setUserRole]               = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);

  const [fileColumns, setFileColumns]   = useState([]);
  const [schemaFields, setSchemaFields] = useState([]);
  const [mapping, setMapping]           = useState({});
  const [allRows, setAllRows]           = useState([]);
  const [preview, setPreview]           = useState([]);
  const [totalRows, setTotalRows]       = useState(0);

  const [executing, setExecuting]         = useState(false);
  const [importPercent, setImportPercent] = useState(0);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importRemaining, setImportRemaining] = useState(0);
  const [chunksDone, setChunksDone]       = useState(0);
  const [chunksTotal, setChunksTotal]     = useState(0);
  const [result, setResult]               = useState(null);
  const [execError, setExecError]         = useState("");

  useEffect(() => {
    apiFetch(`/api/form-data/${formName}/departments`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setDepartments(d.departments || []);
          setUserRole(d.role || "");
          if (d.role === "department_admin" && d.departments?.length > 0) {
            setSelectedDepartmentId(d.departments[0].id);
          }
        }
      })
      .catch(() => {});
  }, [apiFetch, formName]);

  async function handleParse() {
    if (!file) return;
    setParsing(true); setParseError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/form-data/${formName}/import/parse`, {
        method: "POST", body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) { setParseError(data.message || "Parse failed."); return; }
      setFileColumns(data.fileColumns);
      setSchemaFields(data.schemaFields);
      setMapping(data.autoMapping);
      setAllRows(data.rows);
      setPreview(data.preview);
      setTotalRows(data.totalRows);
      if (data.departmentId && !selectedDepartmentId) setSelectedDepartmentId(data.departmentId);
      setStep(2);
    } catch { setParseError("Network error. Please try again."); }
    finally { setParsing(false); }
  }

  async function handleExecute() {
    setExecuting(true); setExecError("");
    const chunks = [];
    for (let i = 0; i < allRows.length; i += CHUNK_SIZE) chunks.push(allRows.slice(i, i + CHUNK_SIZE));
    const total = allRows.length;
    setChunksTotal(chunks.length); setChunksDone(0); setImportPercent(0); setImportProcessed(0); setImportRemaining(total);
    let totalImported = 0, totalSkipped = 0, totalFailed = 0;
    const allErrors = [];
    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        const res = await apiFetch(`/api/form-data/${formName}/import/execute-chunk`, {
          method: "POST",
          body: JSON.stringify({ mapping, chunk: chunks[ci], chunkIndex: ci, chunkStartIndex: ci * CHUNK_SIZE, totalChunks: chunks.length, duplicateHandling, departmentId: selectedDepartmentId || null, year: null }),
        });
        const data = await res.json();
        if (!data.success) { setExecError(data.message || `Batch ${ci + 1} failed.`); setExecuting(false); return; }
        totalImported += data.imported || 0; totalSkipped += data.skipped || 0; totalFailed += data.failed || 0;
        allErrors.push(...(data.errors || []));
        const processed = Math.min((ci + 1) * CHUNK_SIZE, total);
        setChunksDone(ci + 1); setImportPercent((processed / total) * 100); setImportProcessed(processed); setImportRemaining(Math.max(0, total - processed));
        await new Promise(r => setTimeout(r, 0));
      }
      setImportPercent(100); setImportProcessed(total); setImportRemaining(0);
      setResult({ imported: totalImported, skipped: totalSkipped, failed: totalFailed, errors: allErrors, total, message: `Import complete: ${totalImported} inserted, ${totalSkipped} skipped, ${totalFailed} failed.` });
      setStep(3);
    } catch { setExecError("Network error. Please try again."); }
    finally { setExecuting(false); }
  }

  async function downloadSample(format) {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/form-data/${formName}/export/sample?format=${format}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${formName}_sample.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error("Sample download error:", err); }
  }

  const mappedCount = schemaFields.filter(f => mapping[f.col]).length;
  const isDeptAdmin = userRole === "department_admin";
  const isInstAdmin = userRole === "institute_admin" || userRole === "super_admin";
  const steps = ["Upload File", "Map Columns", "Result"];

  return (
    <ModalPortal>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.5)", overflowY: "auto", padding: "20px", display: "flex", alignItems: "flex-start", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget && !executing) onClose(); }}
      >
        <div style={{ background: "#fff", borderRadius: 8, width: "100%", maxWidth: 640, boxShadow: "0 28px 72px rgba(0,0,0,0.2)", overflow: "hidden", margin: "20px auto" }} onClick={e => e.stopPropagation()}>
          {/* Header + step indicator */}
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                Import Records
                <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", marginLeft: 8, fontFamily: "monospace" }}>{formName}</span>
              </div>
              <button onClick={onClose} disabled={executing} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: executing ? "not-allowed" : "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {steps.map((label, i) => {
                const num = i + 1; const active = step === num; const done = step > num;
                return (
                  <React.Fragment key={num}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: done ? "#dcfce7" : active ? ACCENT : "#f1f5f9", color: done ? "#16a34a" : active ? "#fff" : "#94a3b8", border: done ? "1.5px solid #86efac" : active ? `1.5px solid ${ACCENT}` : "1.5px solid #e2e8f0" }}>
                        {done ? <IcoCheck /> : num}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#1e293b" : "#94a3b8", whiteSpace: "nowrap" }}>{label}</span>
                    </div>
                    {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: done ? "#86efac" : "#e2e8f0", margin: "0 10px", minWidth: 16 }} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          {/* Body */}
          <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
            {step === 1 && (
              <div style={{ padding: "16px 20px" }}>
                {isDeptAdmin && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#15803d" }}>🏢 Importing as Department Admin — data will be saved to your department only.</div>}
                {isInstAdmin && <div style={{ background: ACCENT + "0d", border: `1px solid ${ACCENT}25`, borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#1d4ed8" }}>🏛️ Importing as Institute Admin — you can tag data to a specific department below.</div>}
                {isInstAdmin && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Department (optional)</label>
                    <div style={{ position: "relative" }}>
                      <select value={selectedDepartmentId || ""} onChange={e => setSelectedDepartmentId(e.target.value || null)} style={{ width: "100%", padding: "8px 32px 8px 12px", fontSize: 13, border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#1e293b", appearance: "none", outline: "none", cursor: "pointer" }}>
                        <option value="">— All departments (institution-wide) —</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }}><IcoChevronDown /></div>
                    </div>
                  </div>
                )}
                <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                  style={{ border: `2px dashed ${file ? ACCENT : "#cbd5e1"}`, borderRadius: 10, padding: "18px 24px", textAlign: "center", cursor: "pointer", background: file ? ACCENT + "08" : "#f8fafc", marginBottom: 14, transition: "all .15s" }}>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />
                  <div style={{ color: file ? ACCENT : "#94a3b8", marginBottom: 8, display: "flex", justifyContent: "center" }}><IcoUpload /></div>
                  {file ? <div><div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{file.name}</div><div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div></div>
                    : <div><div style={{ fontSize: 13, color: "#64748b" }}><span style={{ color: ACCENT, fontWeight: 700 }}>Click to upload</span> or drag & drop</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>CSV, Excel (.xlsx, .xls) · max 50 MB · up to 10,500 rows</div></div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 12, color: "#475569" }}><span style={{ fontWeight: 600, color: "#1e293b" }}>Need a template?</span> Download a sample with the correct columns.</div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                    <button onClick={() => downloadSample("csv")} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}><IcoDownload /> CSV</button>
                    <button onClick={() => downloadSample("xlsx")} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}><IcoDownload /> Excel</button>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Duplicate Handling</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { val: "skip", label: "Skip duplicates", desc: "Existing matching rows are left unchanged" },
                      { val: "overwrite", label: "Overwrite", desc: "Existing matching rows are updated with new values" },
                      { val: "new", label: "Always insert new", desc: "Every row is inserted regardless of duplicates" },
                    ].map(({ val, label, desc }) => (
                      <label key={val} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${duplicateHandling===val?ACCENT+"60":"#e2e8f0"}`, background: duplicateHandling===val?ACCENT+"06":"#fff", cursor: "pointer", transition: "all .12s" }}>
                        <input type="radio" name="dup" value={val} checked={duplicateHandling===val} onChange={() => setDuplicateHandling(val)} style={{ accentColor: ACCENT, marginTop: 2 }} />
                        <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{label}</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{desc}</div></div>
                      </label>
                    ))}
                  </div>
                </div>
                {parseError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 13px", fontSize: 13, color: "#b91c1c", display: "flex", gap: 8, alignItems: "center" }}><IcoAlert /> {parseError}</div>}
              </div>
            )}
            {step === 2 && (
              <div style={{ padding: "16px 20px" }}>
                <div style={{ background: ACCENT + "08", border: `1px solid ${ACCENT}20`, borderRadius: 8, padding: "9px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
                  <IcoFile />
                  <span style={{ color: "#475569" }}>
                    <strong style={{ color: "#1e293b" }}>{totalRows.toLocaleString()} rows</strong> detected ·{" "}
                    <strong style={{ color: "#1e293b" }}>{mappedCount}</strong> of <strong style={{ color: "#1e293b" }}>{schemaFields.length}</strong> columns mapped
                    {totalRows > 1000 && <span style={{ marginLeft: 10, color: "#7c3aed", fontWeight: 600 }}>· {Math.ceil(totalRows / CHUNK_SIZE)} batches of {CHUNK_SIZE}</span>}
                  </span>
                </div>
                {schemaFields.length > 0 && (
                  <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: "0 8px", padding: "7px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Schema Field</div>
                      <div />
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Your File Column</div>
                    </div>
                    {schemaFields.map((field, idx) => {
                      const isDoc = field.type === "document";
                      return (
                        <div key={field.col} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: "0 8px", padding: "9px 12px", alignItems: "center", borderBottom: idx < schemaFields.length - 1 ? "1px solid #f1f5f9" : "none", background: isDoc ? "#fafafa" : "#fff" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{field.label}{field.required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}</div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginTop: 1 }}>{field.col}</div>
                          </div>
                          <div style={{ color: !isDoc && mapping[field.col] ? "#16a34a" : "#cbd5e1", textAlign: "center", fontSize: 16 }}>→</div>
                          {isDoc ? (
                            <div style={{ fontSize: 11.5, color: "#94a3b8", fontStyle: "italic", padding: "6px 9px", border: "1.5px dashed #e2e8f0", borderRadius: 6, background: "#f8fafc" }}>
                              Saved as blank — upload file manually after import
                            </div>
                          ) : (
                            <div style={{ position: "relative" }}>
                              <select value={mapping[field.col] || ""} onChange={e => setMapping(prev => ({ ...prev, [field.col]: e.target.value }))} disabled={executing}
                                style={{ width: "100%", padding: "6px 26px 6px 9px", fontSize: 12, border: `1.5px solid ${mapping[field.col] ? "#86efac" : "#e2e8f0"}`, borderRadius: 6, background: "#fff", color: "#1e293b", appearance: "none", cursor: executing ? "not-allowed" : "pointer", outline: "none" }}>
                                <option value="">— skip —</option>
                                {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
                              </select>
                              <div style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }}><IcoChevronDown /></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {preview.length > 0 && !executing && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>Preview (first {preview.length} rows)</div>
                    <div style={{ overflowX: "auto", borderRadius: 7, border: "1px solid #e2e8f0" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead><tr style={{ background: "#f8fafc" }}>{schemaFields.filter(f => mapping[f.col]).map(f => <th key={f.col} style={{ padding: "6px 10px", textAlign: "left", color: "#64748b", fontWeight: 700, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{f.label}</th>)}</tr></thead>
                        <tbody>{preview.map((row, i) => <tr key={i} style={{ borderBottom: i < preview.length-1 ? "1px solid #f1f5f9" : "none" }}>{schemaFields.filter(f => mapping[f.col]).map(f => <td key={f.col} style={{ padding: "6px 10px", color: "#1e293b", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row[mapping[f.col]] ?? "—")}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                )}
                {executing && <ImportProgressPanel total={totalRows} processed={importProcessed} remaining={importRemaining} percent={importPercent} chunksDone={chunksDone} chunksTotal={chunksTotal} />}
                {execError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 13px", fontSize: 13, color: "#b91c1c", marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}><IcoAlert /> {execError}</div>}
              </div>
            )}
            {step === 3 && result && (
              <div style={{ padding: "28px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 42, marginBottom: 12 }}>{result.failed === 0 ? "✅" : result.imported === 0 ? "❌" : "⚠️"}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Import Complete</div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{result.message}</div>
                <div style={{ marginBottom: 20, textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}><span>All {result.total.toLocaleString()} rows processed</span><span style={{ fontWeight: 700, color: "#16a34a" }}>100%</span></div>
                  <ProgressBar percent={100} color="#16a34a" height={10} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: result.errors?.length ? 20 : 0 }}>
                  {[
                    { label: "Imported", value: result.imported, color: "#16a34a", bg: "#dcfce7" },
                    { label: "Skipped",  value: result.skipped,  color: "#d97706", bg: "#fef3c7" },
                    { label: "Failed",   value: result.failed,   color: "#dc2626", bg: "#fee2e2" },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} style={{ background: bg, borderRadius: 10, padding: "14px 8px" }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color, marginTop: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {result.errors?.length > 0 && (
                  <div style={{ textAlign: "left", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, maxHeight: 150, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>Row Errors ({result.errors.length})</div>
                    {result.errors.map((e, i) => <div key={i} style={{ fontSize: 11, color: "#dc2626", marginBottom: 3 }}>Row {e.row} · <strong>{e.field}</strong>: {e.error}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Footer */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>{step === 2 && !executing && <button onClick={() => setStep(1)} style={S.btnGhost}>← Back</button>}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {step !== 3 && <button onClick={onClose} style={S.btnGhost} disabled={parsing || executing}>Cancel</button>}
              {step === 1 && <button onClick={handleParse} disabled={!file || parsing} style={S.btnPrimary(!file || parsing)}>{parsing ? "Parsing…" : "Next →"}</button>}
              {step === 2 && <button onClick={handleExecute} disabled={executing || mappedCount === 0} style={S.btnPrimary(executing || mappedCount === 0)}>{executing ? `Importing… ${Math.round(importPercent)}%` : `Import ${totalRows.toLocaleString()} Rows`}</button>}
              {step === 3 && <button onClick={onDone} style={{ ...S.btnPrimary(false), background: "#16a34a" }}>Done</button>}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* Viewport-aware dropdown direction: when there isn't room below the trigger,
   the menu opens upward instead of being clipped at the bottom of the screen.
   Returns [wrapperRef, openUp] — attach the ref to the position:relative wrapper
   and place the menu with top OR bottom: "calc(100% + 6px)" accordingly. */
function useDropDirection(open, estimatedHeight = 240) {
  const ref = useRef(null);
  const [openUp, setOpenUp] = useState(false);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setOpenUp(below < estimatedHeight && r.top > below);
  }, [open, estimatedHeight]);
  return [ref, openUp];
}

/* ── Export dropdown with progress bar ── */
function ExportDropdown({ formName, accessToken, language = "en" }) {
  const [open, setOpen]                   = useState(false);
  const [exporting, setExporting]         = useState(null);
  const [exportPercent, setExportPercent] = useState(0);

  async function download(path, filename, key) {
    setOpen(false); setExporting(key); setExportPercent(0);
    const interval = setInterval(() => setExportPercent(p => p < 80 ? p + Math.random() * 12 : p), 220);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_BASE}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      clearInterval(interval);
      if (!res.ok) { setExporting(null); return; }
      setExportPercent(95);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setExportPercent(100);
      setTimeout(() => { setExporting(null); setExportPercent(0); }, 900);
    } catch (err) { clearInterval(interval); console.error("Export error:", err); setExporting(null); }
  }

  const langTag = language !== "en" ? `_${language}` : "";
  const options = [
    { key: "csv",  label: "Export as CSV",  action: () => download(`/api/form-data/${formName}/export?format=csv&language=${language}`,  `${formName}${langTag}_export.csv`,  "csv")  },
    { key: "xlsx", label: "Export as Excel", action: () => download(`/api/form-data/${formName}/export?format=xlsx&language=${language}`, `${formName}${langTag}_export.xlsx`, "xlsx") },
  ];

  const [wrapRef, openUp] = useDropDirection(open && !exporting, 130);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} disabled={!!exporting}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#475569", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: exporting ? "not-allowed" : "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", opacity: exporting ? 0.85 : 1 }}>
        <IcoDownload />
        {exporting ? `Exporting… ${Math.round(exportPercent)}%` : "Export"}
        {!exporting && <IcoChevronDown />}
      </button>
      {exporting && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "10px 12px", boxShadow: "0 6px 20px rgba(0,0,0,0.1)", zIndex: 101, minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
            <span>Building {exporting.toUpperCase()} file…</span>
            <span style={{ color: ACCENT }}>{Math.round(exportPercent)}%</span>
          </div>
          <ProgressBar percent={exportPercent} height={6} />
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5 }}>Download will start automatically</div>
        </div>
      )}
      {open && !exporting && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", ...(openUp ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }), right: 0, zIndex: 100, background: "#fff", borderRadius: 10, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, overflow: "hidden" }}>
            {options.map(({ key, label, action }) => (
              <button key={key} onClick={action}
                style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#1e293b", cursor: "pointer", fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SortDropdown
════════════════════════════════════════════════════════════════════ */
function SortDropdown({ sortDir, onSort }) {
  const [open, setOpen] = useState(false);

  const options = [
    { key: "desc", label: "Newest First", icon: <IcoSortDesc /> },
    { key: "asc",  label: "Oldest First", icon: <IcoSortAsc />  },
  ];

  const active = options.find(o => o.key === sortDir);

  function pick(key) { setOpen(false); onSort(key); }

  const [wrapRef, openUp] = useDropDirection(open, 140);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* Trigger — identical styling to ExportDropdown */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "#fff", color: "#475569",
          border: "1.5px solid #e2e8f0", borderRadius: 10,
          padding: "9px 14px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <IcoSort />
        Sort: {active?.label}
        <IcoChevronDown />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />

          {/* Panel */}
          <div style={{
            position: "absolute", ...(openUp ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }), right: 0, zIndex: 100,
            background: "#fff", borderRadius: 8, border: "1.5px solid #e2e8f0",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200,
            padding: 6,
          }}>
            {options.map(({ key, label, icon }) => {
              const isActive = sortDir === key;
              return (
                <button
                  key={key}
                  onClick={() => pick(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    background: isActive ? ACCENT + "15" : "transparent",
                    border: "none", textAlign: "left", fontSize: 13,
                    color: isActive ? ACCENT : "#1e293b",
                    cursor: "pointer", fontWeight: isActive ? 600 : 500,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f1f5f9"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isActive ? ACCENT + "15" : "transparent"; }}
                >
                  <span style={{ color: isActive ? ACCENT : "#94a3b8" }}>{icon}</span>
                  {label}
                  {isActive && <span style={{ marginLeft: "auto", color: ACCENT }}><IcoCheck /></span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RowsPerPageDropdown
════════════════════════════════════════════════════════════════════ */
function RowsPerPageDropdown({ pageSize, onPageSizeChange }) {
  const [open, setOpen] = useState(false);
  const OPTIONS = [50, 100, 250, 500];

  function pick(val) { setOpen(false); onPageSizeChange(val); }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#475569", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", whiteSpace: "nowrap" }}
      >
        {pageSize} / page
        <IcoChevronDown />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 100, background: "#fff", borderRadius: 10, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 160, overflow: "hidden" }}>
            <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9" }}>
              Rows per page
            </div>
            {OPTIONS.map(val => (
              <button
                key={val}
                onClick={() => pick(val)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 14px", background: pageSize === val ? ACCENT + "08" : "none", border: "none", textAlign: "left", fontSize: 13, color: pageSize === val ? ACCENT : "#1e293b", cursor: "pointer", fontWeight: pageSize === val ? 700 : 500 }}
                onMouseEnter={e => { if (pageSize !== val) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { e.currentTarget.style.background = pageSize === val ? ACCENT + "08" : "none"; }}
              >
                <span>{val} rows</span>
                {pageSize === val && <span style={{ color: ACCENT }}><IcoCheck /></span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   BulkActionBar
════════════════════════════════════════════════════════════════════ */
function BulkActionBar({ selectedCount, totalOnPage, onSelectAll, onDeselectAll, onBulkDelete, allSelected }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: `${ACCENT}08`, border: `1.5px solid ${ACCENT}25`, borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
          <span style={{ color: ACCENT }}>{selectedCount}</span> record{selectedCount !== 1 ? "s" : ""} selected
        </div>
        {!allSelected && (
          <button onClick={onSelectAll} style={{ fontSize: 12, fontWeight: 600, color: ACCENT, background: "#fff", border: `1px solid ${ACCENT}30`, cursor: "pointer", padding: "3px 8px", borderRadius: 6 }}>
            Select all {totalOnPage} on this page
          </button>
        )}
        {allSelected && (
          <button onClick={onDeselectAll} style={{ fontSize: 12, fontWeight: 600, color: "#64748b", background: "#fff", border: "1px solid #e2e8f0", cursor: "pointer", padding: "3px 8px", borderRadius: 6 }}>
            Deselect all
          </button>
        )}
      </div>
      <button
        onClick={onBulkDelete}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        <IcoTrash /> Delete {selectedCount} Selected
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FormDataPage — Main Component
════════════════════════════════════════════════════════════════════ */
export default function FormDataPage() {
  const { apiFetch }    = useApi();
  const { accessToken } = useAuth();
  const { lang }        = useLanguage();
  const { selectedYear, years, selectedYearLocked } = useAcademicYear() || {};
  // Year-aware filtering only kicks in once the institution has created academic
  // years (opted into the lifecycle). Otherwise behave exactly as before.
  const yearAware       = (years?.length || 0) > 0;
  const ayLocked        = !!selectedYearLocked; // academic year locked → view-only
  const getToken        = useCallback(() => accessToken, [accessToken]);

  const [view, setView]                 = useState("forms");
  const [selectedForm, setSelectedForm] = useState(null);
  const [importOpen, setImportOpen]     = useState(false);

  const [forms, setForms]               = useState([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsError, setFormsError]     = useState("");

  const [records, setRecords]         = useState([]);
  const [schema, setSchema]           = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]     = useState("");

  /* ── Lock status ── */
  const [lockInfo, setLockInfo] = useState({ is_locked: false, locked_by: null, locked_at: null });

  /* ── Search (live + debounced) ── */
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ── Modal state ── */
  const [modalOpen, setModalOpen]       = useState(false);
  const [editRecord, setEditRecord]     = useState(null);
  /* Dedicated edit page target: null = list · "new" = add · record = edit. */
  const [editTarget, setEditTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [modalError, setModalError]     = useState("");

  /* ── Selection state ── */
  const [selectedIds, setSelectedIds] = useState(new Set());

  /* ── Sorting state — default: created_at DESC ── */
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir]     = useState("desc");

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(100);

  /* Records view: dense table (default) or browseable cards. */
  const [viewMode, setViewMode] = useState("table");

  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type }); setTimeout(() => setToast(null), 3500);
  };

  const loadForms = useCallback(async () => {
    setFormsLoading(true); setFormsError("");
    try {
      const qs   = selectedYear != null ? `?year=${selectedYear}` : "";
      const res  = await apiFetch(`/api/forms/institution-forms${qs}`);
      const data = await res.json();
      if (data.success) {
        const all = data.forms || [];
        // When the institution uses academic years, departments see only the
        // forms ACTIVE for the selected year; switching the top-bar year reloads.
        setForms(yearAware ? all.filter((f) => (f.lifecycle_status ?? "active") === "active") : all);
      }
      else setFormsError(data.message || "Failed to load forms.");
    } catch (err) { if (!isAuthError(err)) setFormsError("Failed to load forms."); }
    finally { setFormsLoading(false); }
  }, [apiFetch, selectedYear, yearAware]);

  useEffect(() => { loadForms(); }, [loadForms]);

  /* ── Load records, language-aware, with lock info ── */
  const loadRecords = useCallback(async (form) => {
    setRecsLoading(true); setRecsError("");
    setSelectedIds(new Set());
    try {
      const res  = await apiFetch(`/api/form-data/${form.form_name}/records?language=${lang}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setSchema(data.schema);
        setLockInfo(data.lock || { is_locked: false, locked_by: null, locked_at: null });
      } else {
        setRecsError(data.message || "Failed to load records.");
      }
    } catch (err) { if (!isAuthError(err)) setRecsError("Failed to load records."); }
    finally { setRecsLoading(false); }
  }, [apiFetch, lang]);

  /* Re-fetch when form opens or language changes while viewing records */
  useEffect(() => {
    if (view === "records" && selectedForm) loadRecords(selectedForm);
  }, [view, selectedForm, loadRecords]);

  function openForm(form) {
    setSelectedForm(form);
    setView("records");
    setCurrentPage(1);
    setSortField("created_at");
    setSortDir("desc");
    setSearchInput("");
    setSearchTerm("");
    loadRecords(form);
  }

  function backToForms() {
    setView("forms"); setSelectedForm(null); setSchema(null); setRecords([]);
    setRecsError(""); setCurrentPage(1); setSelectedIds(new Set());
    setSearchInput(""); setSearchTerm("");
    setLockInfo({ is_locked: false, locked_by: null, locked_at: null });
  }

  /* Save from the dedicated edit page. Returns { success, message } and does NOT
     navigate — the page stays open and refreshes its read-only preview. The
     records list is refreshed in the background so it's current on Back. */
  async function saveRecord(formData) {
    const editing = editTarget && editTarget !== "new" ? editTarget : null;
    try {
      const res = editing
        ? await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${editing.id}`, { method: "PUT",  body: JSON.stringify({ data: formData }) })
        : await apiFetch(`/api/form-data/${selectedForm.form_name}/records`,                { method: "POST", body: JSON.stringify({ data: formData }) });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadRecords(selectedForm);
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to save record." };
    } catch (err) {
      if (!isAuthError(err)) return { success: false, message: "Network error. Please try again." };
      return { success: false };
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res  = await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${deleteTarget}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteTarget(null); showToast(data.message); loadRecords(selectedForm);
      } else { showToast(data.message || "Failed to delete.", "error"); setDeleteTarget(null); }
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  async function handleBulkDelete() {
    setDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      const res  = await apiFetch(
        `/api/form-data/${selectedForm.form_name}/records/bulk-delete`,
        { method: "DELETE", body: JSON.stringify({ ids }) }
      );
      const data = await res.json();
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      if (data.success) {
        const { deleted = 0, failed = 0 } = data;
        if (failed === 0) showToast(`${deleted} record${deleted !== 1 ? "s" : ""} deleted successfully.`);
        else showToast(`${deleted} deleted, ${failed} failed.`, "error");
      } else {
        showToast(data.message || "Bulk delete failed.", "error");
      }
      loadRecords(selectedForm);
    } catch (err) {
      if (!isAuthError(err)) showToast("Network error during bulk delete.", "error");
    } finally { setDeleting(false); }
  }

  /* ── Derived: schema fields ── */
  const excludedCols = new Set(schema?.schema?.excluded_fixed_columns || []);
  const schemaFields = (schema?.schema?.fields || []).filter(
    f => !excludedCols.has(dbCol(f.column_name)) && !excludedCols.has(f.column_name)
  );

  /* ── Derived: search-filtered records ── */
  const filteredRecords = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((rec) =>
      schemaFields.some((f) => {
        const v = rec[dbCol(f.column_name)];
        return v != null && String(v).toLowerCase().includes(needle);
      })
    );
  }, [records, searchTerm, schemaFields]);

  /* ── Read-only flags ──
     readOnly → gates record *authoring* that only makes sense in English:
                Add, Import, Delete and bulk-select. Disabled in Hindi because a
                brand-new record must be created in English to generate its EN+HI
                pair, and deletes are driven from the English (source) row.
     canEdit  → editing is allowed in BOTH languages (Task 2); only a locked form
                blocks it. Editing a Hindi row updates that row only; editing an
                English row regenerates its Hindi mirror (handled by the backend). */
  const viewingTranslated = lang === "hi";
  const readOnly = lockInfo.is_locked || viewingTranslated || ayLocked;
  const canEdit  = !lockInfo.is_locked && !ayLocked;

  /* ── Derived: sorted records (applied after search filter) ── */
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField];
    if (sortField === "created_at") {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    } else {
      aVal = String(aVal ?? "").toLowerCase();
      bVal = String(bVal ?? "").toLowerCase();
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  /* ── Derived: pagination ── */
  const totalPages   = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const pagedRecords = sortedRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pagedIds     = pagedRecords.map(r => r.id);

  /* Virtualize the table only when a page is large; small pages render fully. */
  const virtualize = viewMode === "table" && pagedRecords.length > VIRTUAL_THRESHOLD;
  const vTable = useWindowVirtual(pagedRecords.length, { enabled: virtualize });
  const allPageSelected = pagedIds.length > 0 && pagedIds.every(id => selectedIds.has(id));
  const somePageSelected = pagedIds.some(id => selectedIds.has(id));

  /* ── Selection handlers ── */
  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => { const next = new Set(prev); pagedIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); pagedIds.forEach(id => next.add(id)); return next; });
    }
  }
  function toggleSelectOne(id) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function selectAllOnPage() { setSelectedIds(prev => { const next = new Set(prev); pagedIds.forEach(id => next.add(id)); return next; }); }
  function deselectAll() { setSelectedIds(new Set()); }
  function handlePageSizeChange(size) { setPageSize(size); setCurrentPage(1); setSelectedIds(new Set()); }

  /* ══════════════════════════════════════════════════════
     VIEW 1 — Form selection grid
  ══════════════════════════════════════════════════════ */
  if (view === "forms") {
    const now = Date.now();
    const isExpired = (f) => f.deadline_at && new Date(f.deadline_at).getTime() <= now;
    const totalForms   = forms.length;
    const activeForms  = forms.filter((f) => !f.is_locked && !isExpired(f)).length;
    const pendingForms = forms.filter((f) => {
      if (!f.deadline_at) return false;
      const ms = new Date(f.deadline_at).getTime() - now;
      return ms > 0 && ms <= 7 * 24 * 3600 * 1000;
    }).length;
    const expiredForms = forms.filter(isExpired).length;

    const summary = [
      { label: "Total Forms",      value: totalForms,   color: "#2563eb", bg: "#ecfeff", hint: "All accessible forms" },
      { label: "Active Forms",     value: activeForms,  color: "#16a34a", bg: "#f0fdf4", hint: "Open for submissions" },
      { label: "Pending Deadline", value: pendingForms, color: "#d97706", bg: "#fffbeb", hint: "Due within 7 days" },
      { label: "Expired Forms",    value: expiredForms, color: "#dc2626", bg: "#fef2f2", hint: "Past deadline" },
    ];

    return (
      <div style={{ padding: "20px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
        {toast && <Toast message={toast.message} type={toast.type} />}

        <PageHeader
          breadcrumb={["Home", "Department", "Forms & Data Entry"]}
          title="Forms & Data Entry Center"
          description="Access all department forms, monitor deadlines, and manage records in one place."
        />

        {formsError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#b91c1c", marginBottom: 14 }}>
            {formsError}
          </div>
        )}

        {/* Summary stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
          {summary.map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, flexShrink: 0, letterSpacing: -0.3 }}>
                {s.value}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 1 }}>{s.hint}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Available Forms table */}
        <div style={tableCardStyle}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef2f6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Available Forms</div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>
                {formsLoading ? "Loading…" : `${forms.length} form${forms.length !== 1 ? "s" : ""} accessible to your department`}
              </div>
            </div>
          </div>

          {formsLoading ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading forms…</div>
          ) : forms.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, margin: "0 auto 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FileText size={26} strokeWidth={1.6} color="#94a3b8" />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>No forms available</div>
              <div style={{ fontSize: 12.5 }}>Your institution hasn't shared any forms with your department yet.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Form", "Form Name & Description", "Deadline", "Status", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Actions" ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #eef2f6", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forms.map((form) => {
                    const expired = form.deadline_at && new Date(form.deadline_at).getTime() <= now;
                    const locked  = form.is_locked;
                    const statusBadge = locked
                      ? { label: "LOCKED",  color: "#dc2626" }
                      : expired
                        ? { label: "EXPIRED", color: "#dc2626" }
                        : { label: "OPEN",    color: "#16a34a" };
                    const deadlineText = form.deadline_at
                      ? new Date(form.deadline_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "—";
                    let deadlineSubBadge = null;
                    if (form.deadline_at) {
                      if (expired) {
                        deadlineSubBadge = { label: "EXPIRED", color: "#dc2626" };
                      } else {
                        const daysLeft = Math.ceil((new Date(form.deadline_at).getTime() - now) / (24 * 3600 * 1000));
                        deadlineSubBadge = { label: `${daysLeft} DAY${daysLeft !== 1 ? "S" : ""} LEFT`, color: daysLeft <= 3 ? "#d97706" : "#16a34a" };
                      }
                    }
                    return (
                      <tr key={form.id}
                        style={{ borderBottom: "1px solid #f1f5f9", transition: "background .1s", cursor: "pointer" }}
                        onClick={() => openForm(form)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: ACCENT + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: ACCENT, fontWeight: 800, letterSpacing: 0.3 }}>
                            {form.form_name.slice(0, 2).toUpperCase()}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1e293b", letterSpacing: 0.2 }}>
                            {form.form_name.toUpperCase()}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, fontFamily: "monospace" }}>{form.form_name}</div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: 12.5, color: "#475569", fontWeight: 600 }}>{deadlineText}</span>
                            {deadlineSubBadge && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: deadlineSubBadge.color + "18", color: deadlineSubBadge.color, alignSelf: "flex-start", whiteSpace: "nowrap", letterSpacing: 0.3 }}>
                                {deadlineSubBadge.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusBadge.color + "18", color: statusBadge.color, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusBadge.color, display: "inline-block" }} />
                            {statusBadge.label}
                          </span>
                        </td>
                        <td style={{ padding: "6px 14px", textAlign: "right" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openForm(form); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", color: ACCENT, border: `1px solid ${ACCENT}40`, borderRadius: 7, padding: "0 12px", height: 30, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", transition: "background .15s, border-color .15s" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT + "12"; e.currentTarget.style.borderColor = ACCENT; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = ACCENT + "40"; }}
                          >
                            Open <span style={{ fontSize: 12 }}>→</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     VIEW 2b — Dedicated record edit/add page (in-shell, no overlay)
  ══════════════════════════════════════════════════════ */
  if (editTarget && selectedForm) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <RecordEditPage
          fields={schemaFields}
          record={editTarget === "new" ? null : editTarget}
          formName={selectedForm.form_name}
          formTitle={selectedForm.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          apiFetch={apiFetch}
          getToken={getToken}
          translationEnabled={selectedForm.translate_to_hindi !== false}
          viewOnly={readOnly && editTarget !== "new"}
          onSave={saveRecord}
          onBack={() => { setEditTarget(null); loadRecords(selectedForm); }}
        />
      </>
    );
  }

  /* ══════════════════════════════════════════════════════
     VIEW 2 — Records table for selected form
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "20px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Modals ── */}
      {deleteTarget !== null && (
        <DeleteModal
          count={1}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
      {bulkDeleteOpen && (
        <DeleteModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onClose={() => setBulkDeleteOpen(false)}
          deleting={deleting}
        />
      )}
      {importOpen && (
        <FormImportWizard
          formName={selectedForm.form_name}
          apiFetch={apiFetch}
          getToken={getToken}
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); showToast("Import complete!"); loadRecords(selectedForm); }}
        />
      )}

      {/* ── Academic-year locked banner (view-only) ── */}
      {ayLocked && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
          <Lock size={18} color="#b91c1c" strokeWidth={2} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              This academic year is locked — view-only mode.
            </div>
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 2 }}>
              Adding, editing, deleting and importing are disabled. You can still view, search and export.
            </div>
          </div>
        </div>
      )}

      {/* ── Locked banner ── */}
      {lockInfo.is_locked && (() => {
        const deadlineExpired =
          lockInfo.auto_locked ||
          (lockInfo.deadline_at && new Date(lockInfo.deadline_at).getTime() <= Date.now());
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
            {deadlineExpired
              ? <Clock size={18} color="#b91c1c" strokeWidth={2} style={{ flexShrink: 0 }} />
              : <Lock size={18} color="#b91c1c" strokeWidth={2} style={{ flexShrink: 0 }} />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
                {deadlineExpired
                  ? "This form deadline has expired for your institution. The form is automatically locked."
                  : "This form is currently locked by the institution admin."}
              </div>
              <div style={{ fontSize: 12, color: "#dc2626", marginTop: 2 }}>
                You can only view the records. Adding, editing, and deleting are disabled.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Page Header ── */}
      <PageHeader
        breadcrumb={[
          "Home",
          "Department",
          { label: "Forms & Data Entry", onClick: backToForms },
          selectedForm?.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        ]}
        title={
          <>
            {selectedForm?.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {lockInfo.is_locked && (
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 8px", verticalAlign: "middle", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Lock size={13} strokeWidth={2.2} /> Locked
              </span>
            )}
          </>
        }
        description={
          <>
            {recsLoading
              ? "Loading…"
              : searchTerm
                ? `${sortedRecords.length} of ${records.length} record${records.length !== 1 ? "s" : ""}`
                : `${records.length} record${records.length !== 1 ? "s" : ""}`}
            {schema && <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 11 }}>· {schema.year}</span>}
          </>
        }
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SortDropdown
              sortDir={sortDir}
              onSort={(dir) => { setSortDir(dir); setSortField("created_at"); setCurrentPage(1); setSelectedIds(new Set()); }}
            />
            <ExportDropdown formName={selectedForm?.form_name} accessToken={accessToken} language={lang} />
            <button
              onClick={() => { if (!readOnly) setImportOpen(true); }}
              disabled={readOnly}
              title={readOnly ? (lockInfo.is_locked ? "Form is locked" : "Switch to English to import") : ""}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${readOnly ? "#e2e8f0" : ACCENT}`, background: readOnly ? "#f8fafc" : "#ecfeff", fontSize: 13, fontWeight: 600, color: readOnly ? "#94a3b8" : ACCENT, cursor: readOnly ? "not-allowed" : "pointer" }}
            >
              <IcoUpload /> Import
            </button>
            <button
              onClick={() => { if (!readOnly) setEditTarget("new"); }}
              disabled={readOnly}
              title={lockInfo.is_locked ? "Form is locked — contact your institution admin" : viewingTranslated ? "Switch to English (EN) to add records" : ""}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, background: readOnly ? "#94a3b8" : ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: readOnly ? "not-allowed" : "pointer", boxShadow: readOnly ? "none" : `0 2px 8px ${ACCENT}40` }}
            >
              <IcoPlus /> Add Record
            </button>
          </div>
        }
      />

      {recsError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>
          {recsError}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && !readOnly && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalOnPage={pagedIds.length}
          onSelectAll={selectAllOnPage}
          onDeselectAll={deselectAll}
          onBulkDelete={() => setBulkDeleteOpen(true)}
          allSelected={allPageSelected}
        />
      )}

      {/* ── Records card ── */}
      <div style={tableCardStyle}>
        {/* Toolbar: search + record count */}
        {!recsLoading && records.length > 0 && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
              Records
              {searchTerm && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
                  · {sortedRecords.length} matching
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Table / Cards view toggle — both reuse the same handlers */}
              <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden", background: "#fff" }}>
                {[
                  { id: "table", Icon: Table2, title: "Table view" },
                  { id: "cards", Icon: LayoutGrid, title: "Card view" },
                ].map(({ id, Icon, title }) => {
                  const on = viewMode === id;
                  return (
                    <button key={id} onClick={() => setViewMode(id)} title={title} aria-label={title} aria-pressed={on}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 32, border: "none", cursor: "pointer", background: on ? ACCENT : "#fff", color: on ? "#fff" : "#94a3b8" }}>
                      <Icon size={16} strokeWidth={1.9} />
                    </button>
                  );
                })}
              </div>
              <div style={{ position: "relative", width: 260 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex" }}>
                  <IcoSearch />
                </span>
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search records..."
                  style={{ width: "100%", padding: "7px 30px 7px 32px", fontSize: 13, color: "#1e293b", border: "1px solid #e2e8f0", borderRadius: 8, outline: "none", background: "#fff" }}
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput("")}
                    title="Clear"
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "2px 6px" }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {recsLoading ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading records…</div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, margin: "0 auto 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FilePlus size={26} strokeWidth={1.6} color="#94a3b8" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No records yet</div>
            <div style={{ fontSize: 13 }}>Click "Add Record" to create the first entry, or Import from a file.</div>
          </div>
        ) : sortedRecords.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, margin: "0 auto 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SearchX size={26} strokeWidth={1.6} color="#94a3b8" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No matching records</div>
            <div style={{ fontSize: 13 }}>Try a different search term or clear the search to see all records.</div>
          </div>
        ) : viewMode === "cards" ? (
          /* ── Cards view — reuses the exact same edit/delete/select handlers ── */
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {pagedRecords.map((rec, i) => (
              <RecordCard
                key={rec.id}
                rec={rec}
                serial={(currentPage - 1) * pageSize + i + 1}
                fields={schemaFields}
                lang={lang}
                getToken={getToken}
                selected={selectedIds.has(rec.id)}
                onSelect={() => toggleSelectOne(rec.id)}
                onEdit={(e) => { e.stopPropagation(); setEditTarget(rec); }}
                onDelete={(e) => { e.stopPropagation(); setDeleteTarget(rec.id); }}
                canEdit={canEdit}
                readOnly={readOnly}
                viewingTranslated={viewingTranslated}
              />
            ))}
          </div>
        ) : (
          <div ref={vTable.containerRef} style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {/* Checkbox select-all — hidden in readOnly mode */}
                  {!readOnly && (
                    <th style={{ ...thStyle, width: 44, padding: "10px 12px" }}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                        onChange={toggleSelectAll}
                        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: "pointer" }}
                        title={allPageSelected ? "Deselect all on page" : "Select all on page"}
                      />
                    </th>
                  )}
                  <th style={thStyle}>#</th>
                  {schemaFields.map(f => (
                    <th key={dbCol(f.column_name)} style={thStyle}>
                      {f.label?.[lang] || f.label?.en || displayCol(f.column_name)}
                    </th>
                  ))}
                  <th style={thStyle}>{lang === "hi" ? "बनाया गया" : "Created"}</th>
                  {canEdit && <th style={{ ...thStyle, textAlign: "right" }}>{lang === "hi" ? "क्रियाएँ" : "Actions"}</th>}
                </tr>
              </thead>
              <tbody>
                {/* Top spacer for virtualized rows above the viewport */}
                {vTable.padTop > 0 && (
                  <tr style={{ height: vTable.padTop }}>
                    <td colSpan={(!readOnly ? 1 : 0) + 1 + schemaFields.length + 1 + (canEdit ? 1 : 0)} style={{ padding: 0, border: "none" }} />
                  </tr>
                )}
                {pagedRecords.slice(vTable.start, vTable.end).map((rec, localIdx) => {
                  const i = vTable.start + localIdx;
                  const isSelected = selectedIds.has(rec.id);
                  return (
                    <tr
                      key={rec.id}
                      style={{
                        borderBottom: i < pagedRecords.length - 1 ? "1px solid #f8fafc" : "none",
                        transition: "background .1s",
                        background: isSelected ? `${ACCENT}08` : undefined,
                        ...(virtualize ? { height: ROW_HEIGHT } : {}),
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? `${ACCENT}08` : ""; }}
                    >
                      {/* Row checkbox — hidden in readOnly mode */}
                      {!readOnly && (
                        <td style={{ padding: "13px 12px", verticalAlign: "middle" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(rec.id)}
                            style={{ width: 15, height: 15, accentColor: ACCENT, cursor: "pointer" }}
                          />
                        </td>
                      )}
                      {/* Serial number (global across pages) */}
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
                          {(currentPage - 1) * pageSize + i + 1}
                        </span>
                      </td>
                      {schemaFields.map(f => {
                        const col = dbCol(f.column_name); const raw = rec[col];
                        let cell, titleText;
                        if (f.type === "boolean") { cell = raw===true||raw==="true" ? "Yes" : raw===false||raw==="false" ? "No" : "—"; titleText = String(cell); }
                        else if (f.type === "document") { cell = <DocumentCell fileKey={raw} getToken={getToken} lang={lang} />; titleText = undefined; }
                        else { cell = raw ?? <span style={{ color: "#cbd5e1" }}>—</span>; titleText = raw != null ? String(raw) : undefined; }
                        return <td key={col} style={tdStyle}><span style={cellEllipsis} title={titleText}>{cell}</span></td>;
                      })}
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: sortField === "created_at" ? "#475569" : "#64748b", fontWeight: sortField === "created_at" ? 600 : 400, whiteSpace: "nowrap" }}>
                          {formatDate(rec.created_at)}
                        </span>
                      </td>
                      {canEdit && (
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditTarget(rec); }}
                              style={actionBtn}
                              title={viewingTranslated ? "Edit Hindi record" : "Edit record"}
                            >
                              <IcoEdit />
                            </button>
                            {/* Delete is driven from the English (source) row, so it stays English-only */}
                            {!readOnly && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(rec.id); }}
                                style={{ ...actionBtn, color: "#dc2626", borderColor: "#fecaca" }}
                                title="Delete record"
                              >
                                <IcoTrash />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Bottom spacer for virtualized rows below the viewport */}
                {vTable.padBottom > 0 && (
                  <tr style={{ height: vTable.padBottom }}>
                    <td colSpan={(!readOnly ? 1 : 0) + 1 + schemaFields.length + 1 + (canEdit ? 1 : 0)} style={{ padding: 0, border: "none" }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {!recsLoading && records.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "10px 4px", flexWrap: "wrap", gap: 10 }}>
          {/* Left: rows-per-page + record range */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <RowsPerPageDropdown pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {sortedRecords.length <= pageSize ? (
                <>
                  <strong style={{ color: "#1e293b" }}>{sortedRecords.length.toLocaleString()}</strong> record{sortedRecords.length !== 1 ? "s" : ""}
                  {searchTerm && records.length !== sortedRecords.length && <span style={{ color: "#94a3b8", marginLeft: 4 }}>(filtered from {records.length})</span>}
                </>
              ) : (
                <>
                  Showing{" "}
                  <strong style={{ color: "#1e293b" }}>
                    {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRecords.length)}
                  </strong>{" "}
                  of{" "}
                  <strong style={{ color: "#1e293b" }}>{sortedRecords.length.toLocaleString()}</strong>
                  {searchTerm && records.length !== sortedRecords.length && <span style={{ color: "#94a3b8", marginLeft: 4 }}>(filtered)</span>}
                </>
              )}
              {selectedIds.size > 0 && (
                <span style={{ marginLeft: 8, color: ACCENT, fontWeight: 700 }}>({selectedIds.size} selected)</span>
              )}
            </div>
          </div>
          {/* Right: page navigation */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => { setCurrentPage(1); setSelectedIds(new Set()); }} disabled={currentPage === 1} title="First page"
                style={{ ...pageBtn, opacity: currentPage === 1 ? 0.38 : 1, cursor: currentPage === 1 ? "default" : "pointer" }}>«</button>
              <button onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); setSelectedIds(new Set()); }} disabled={currentPage === 1}
                style={{ ...pageBtn, opacity: currentPage === 1 ? 0.38 : 1, cursor: currentPage === 1 ? "default" : "pointer" }}>‹ Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("ellipsis-" + p); acc.push(p); return acc; }, [])
                .map(item =>
                  String(item).startsWith("ellipsis") ? (
                    <span key={item} style={{ fontSize: 13, color: "#94a3b8", padding: "0 3px", userSelect: "none" }}>…</span>
                  ) : (
                    <button key={item} onClick={() => { setCurrentPage(item); setSelectedIds(new Set()); }}
                      style={{ ...pageBtn, minWidth: 36, justifyContent: "center", background: currentPage === item ? ACCENT : "#fff", color: currentPage === item ? "#fff" : "#475569", borderColor: currentPage === item ? ACCENT : "#e2e8f0", fontWeight: currentPage === item ? 700 : 500, cursor: currentPage === item ? "default" : "pointer" }}>
                      {item}
                    </button>
                  )
                )}
              <button onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); setSelectedIds(new Set()); }} disabled={currentPage === totalPages}
                style={{ ...pageBtn, opacity: currentPage === totalPages ? 0.38 : 1, cursor: currentPage === totalPages ? "default" : "pointer" }}>Next ›</button>
              <button onClick={() => { setCurrentPage(totalPages); setSelectedIds(new Set()); }} disabled={currentPage === totalPages} title="Last page"
                style={{ ...pageBtn, opacity: currentPage === totalPages ? 0.38 : 1, cursor: currentPage === totalPages ? "default" : "pointer" }}>»</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Window-scroll virtualization ────────────────────────────────────────
   Renders only the rows near the viewport for large pages, using the page's
   own scroll (no inner scroll container → UX unchanged). Rows are kept a
   fixed height via ellipsis cells, so the row-height estimate stays accurate.
   Disabled (renders everything) when the row count is small.                 */
const VIRTUAL_THRESHOLD = 60;
const ROW_HEIGHT = 47;       // fixed row height (ellipsis cells, 13px font)
const HEADER_HEIGHT = 41;

function useWindowVirtual(count, { rowHeight = ROW_HEIGHT, headerHeight = HEADER_HEIGHT, overscan = 8, enabled = true } = {}) {
  const containerRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: count });

  useEffect(() => {
    if (!enabled) { setRange({ start: 0, end: count }); return; }
    const compute = () => {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY; // table top in document
      const viewTop = window.scrollY - top - headerHeight;
      const start = Math.max(0, Math.floor(viewTop / rowHeight) - overscan);
      const visible = Math.ceil(window.innerHeight / rowHeight) + overscan * 2;
      const end = Math.min(count, start + visible);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [count, rowHeight, headerHeight, overscan, enabled]);

  const padTop    = enabled ? range.start * rowHeight : 0;
  const padBottom = enabled ? Math.max(0, (count - range.end) * rowHeight) : 0;
  return { containerRef, start: enabled ? range.start : 0, end: enabled ? range.end : count, padTop, padBottom };
}

/* ── Record card (Cards view) — reuses the same edit/delete/select handlers ── */
function RecordCard({ rec, serial, fields, lang, getToken, selected, onSelect, onEdit, onDelete, canEdit, readOnly, viewingTranslated }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${selected ? ACCENT : "#e5e7eb"}`, borderRadius: 8,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: selected ? `0 0 0 3px ${ACCENT}1f` : "0 1px 2px rgba(16,24,40,0.04)", transition: "border-color .12s, box-shadow .12s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!readOnly && (
          <input type="checkbox" checked={selected} onChange={onSelect} style={{ width: 15, height: 15, accentColor: ACCENT, cursor: "pointer", flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", flexShrink: 0 }}>#{serial}</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatDate(rec.created_at)}</span>
        {canEdit && (
          <div style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit} style={actionBtn} title={viewingTranslated ? "Edit Hindi record" : "Edit record"}><IcoEdit /></button>
            {!readOnly && <button onClick={onDelete} style={{ ...actionBtn, color: "#dc2626", borderColor: "#fecaca" }} title="Delete record"><IcoTrash /></button>}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 18px" }}>
        {fields.map((f) => {
          const col = dbCol(f.column_name); const raw = rec[col];
          let val;
          if (f.type === "boolean") val = raw === true || raw === "true" ? "Yes" : raw === false || raw === "false" ? "No" : "—";
          else if (f.type === "document") val = <DocumentCell fileKey={raw} getToken={getToken} lang={lang} />;
          else val = raw ?? "—";
          return (
            <div key={col} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
                {f.label?.[lang] || f.label?.en || displayCol(f.column_name)}
              </div>
              <div style={{ fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const cellEllipsis = { display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "#1e293b" };

const thStyle   = { padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" };
const tdStyle   = { padding: "13px 16px", verticalAlign: "middle" };
const actionBtn = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#475569" };
const pageBtn   = { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 11px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 3, transition: "all .12s", color: "#475569" };
