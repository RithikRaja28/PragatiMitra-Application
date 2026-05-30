import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Trash2, FileText, FilePlus, Lock, Clock, Globe, SearchX } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { S, Toast, isAuthError, formatDate } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";
import { tableCardStyle } from "../../components/shared/ui";

const ACCENT = "#0891b2";

/* ── helpers ── */
function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}
function displayCol(col) {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IcoEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function IcoForm() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function IcoUpload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
function IcoFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IcoSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IcoClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/* ── Document upload field ── */
function DocumentUploadField({ label, required, value, onChange, getToken }) {
  const fileRef  = useRef(null);
  const [status, setStatus]   = useState("idle"); // idle | uploading | done | error
  const [errMsg, setErrMsg]   = useState("");
  const [fileName, setFileName] = useState("");

  /* if editing an existing record that already has a fileKey, show it */
  const hasExisting = !!value && status === "idle";

  async function handleFile(file) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrMsg("File type not allowed. Accepted: PDF, Word, Excel, images.");
      setStatus("error");
      return;
    }
    if (file.size > MAX_SIZE) {
      setErrMsg("File exceeds 10 MB limit.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setErrMsg("");
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token    = getToken();
      // Use raw fetch — must NOT set Content-Type so browser adds multipart boundary
      const res  = await fetch(`${API_BASE}/api/upload/document`, {
        method:  "POST",
        body:    formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed.");

      // Store the returned URL as the field value
      onChange(data.url);
      setStatus("done");
    } catch (err) {
      setErrMsg(err.message || "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <div>
      <label style={S.label}>{label}{required && " *"}</label>

      {/* drag-and-drop / click zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        style={{
          border: `2px dashed ${status === "error" ? "#f87171" : status === "done" ? "#34d399" : "#cbd5e1"}`,
          borderRadius: 10, padding: "18px 16px", textAlign: "center",
          cursor: status === "uploading" ? "not-allowed" : "pointer",
          background: status === "done" ? "#f0fdf4" : status === "error" ? "#fef2f2" : "#f8fafc",
          transition: "all .15s",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
          disabled={status === "uploading"}
        />

        {status === "uploading" && (
          <div style={{ fontSize: 13, color: "#64748b" }}>
            <div style={{ marginBottom: 6, color: "#94a3b8" }}>
              <IcoUpload />
            </div>
            Uploading <strong>{fileName}</strong>…
          </div>
        )}

        {status === "done" && (
          <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
            ✓ <strong>{fileName}</strong> uploaded.{" "}
            <span style={{ fontWeight: 400, color: "#64748b" }}>Click to replace.</span>
          </div>
        )}

        {status === "error" && (
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#dc2626", fontWeight: 600, marginBottom: 4 }}>{errMsg}</div>
            <span style={{ color: "#64748b", fontSize: 12 }}>Click to try again.</span>
          </div>
        )}

        {status === "idle" && (
          <div>
            <div style={{ color: "#94a3b8", marginBottom: 6, display: "flex", justifyContent: "center" }}>
              <IcoUpload />
            </div>
            {hasExisting ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>
                <IcoFile /> File already attached.{" "}
                <span style={{ color: ACCENT, fontWeight: 600 }}>Click to replace.</span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#64748b" }}>
                <span style={{ color: ACCENT, fontWeight: 600 }}>Click to upload</span> or drag & drop
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  PDF, Word, Excel, Images · max 10 MB
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Document cell — url is stored directly, open in new tab ── */
function DocumentCell({ url }) {
  if (!url) return <span style={{ color: "#cbd5e1" }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: ACCENT, fontSize: 12, fontWeight: 600, textDecoration: "none",
      }}
    >
      <IcoFile /> View Doc ↗
    </a>
  );
}

/* ── Dynamic field renderer ── */
function FieldInput({ field, value, onChange, getToken }) {
  const col    = dbCol(field.column_name);
  const label  = field.label?.en || displayCol(field.column_name);
  const type   = field.type;

  const commonStyle = S.input(false);

  if (type === "boolean") {
    return (
      <div>
        <label style={S.label}>{label}{field.required && " *"}</label>
        <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
          {[{ val: "true", text: "Yes" }, { val: "false", text: "No" }].map(({ val, text }) => (
            <label key={val} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
              <input
                type="radio"
                name={col}
                value={val}
                checked={String(value) === val}
                onChange={() => onChange(col, val === "true")}
                style={{ accentColor: ACCENT, width: 15, height: 15 }}
              />
              {text}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (type === "textarea" || type === "description") {
    return (
      <div>
        <label style={S.label}>{label}{field.required && " *"}</label>
        <textarea
          style={{ ...commonStyle, resize: "vertical", minHeight: 80 }}
          value={value || ""}
          onChange={(e) => onChange(col, e.target.value)}
          required={field.required}
        />
      </div>
    );
  }

  if (type === "document") {
    return (
      <DocumentUploadField
        label={label}
        required={field.required}
        value={value}
        onChange={(url) => onChange(col, url)}
        getToken={getToken}
      />
    );
  }

  const inputType = type === "number" ? "number" : type === "date" ? "date" : type === "email" ? "email" : type === "phone" ? "tel" : "text";

  return (
    <div>
      <label style={S.label}>{label}{field.required && " *"}</label>
      <input
        style={commonStyle}
        type={inputType}
        value={value || ""}
        onChange={(e) => onChange(col, e.target.value)}
        required={field.required}
      />
    </div>
  );
}

/* ── Modal ── */
function RecordModal({ fields, record, onSave, onClose, saving, error, getToken }) {
  const isEdit = !!record;
  const [formData, setFormData] = useState(() => {
    const init = {};
    fields.forEach((f) => {
      const col = dbCol(f.column_name);
      init[col] = record ? (record[col] ?? "") : "";
    });
    return init;
  });

  function handleChange(col, val) {
    setFormData((prev) => ({ ...prev, [col]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(formData);
  }

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            {isEdit ? "Edit Record" : "Add New Record"}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 18, color: "#94a3b8",
            cursor: "pointer", lineHeight: 1, padding: "0 4px",
          }}>×</button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {fields.map((field) => (
              <FieldInput
                key={dbCol(field.column_name)}
                field={field}
                value={formData[dbCol(field.column_name)]}
                onChange={handleChange}
                getToken={getToken}
              />
            ))}

            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c",
              }}>
                {error}
              </div>
            )}
          </div>

          {/* footer */}
          <div style={{
            padding: "16px 24px", borderTop: "1px solid #f1f5f9",
            display: "flex", justifyContent: "flex-end", gap: 10,
          }}>
            <button type="button" onClick={onClose} style={S.btnGhost} disabled={saving}>
              Cancel
            </button>
            <button type="submit" style={S.btnPrimary(saving)} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Update Record" : "Add Record"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

/* ── Delete confirm modal ── */
function DeleteModal({ onConfirm, onClose, deleting }) {
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 14, width: 380, padding: "28px 24px",
        boxShadow: "0 20px 48px rgba(0,0,0,0.16)", textAlign: "center",
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
          background: "#fef2f2", border: "1px solid #fecaca",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Trash2 size={24} strokeWidth={1.8} color="#dc2626" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Delete Record?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>This action cannot be undone.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={S.btnGhost} disabled={deleting}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{ ...S.btnPrimary(deleting), background: deleting ? "#fca5a5" : "#dc2626" }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ════════════════════════════════════════════════════════════════════
   FormDataPage — entry point for department admin
   View 1: Grid of available forms
   View 2: Records table for selected form + CRUD
════════════════════════════════════════════════════════════════════ */
export default function FormDataPage() {
  const { apiFetch } = useApi();
  const { accessToken } = useAuth();
  const { lang } = useLanguage();
  const getToken = useCallback(() => accessToken, [accessToken]);

  /* ── top-level view ── */
  const [view, setView]               = useState("forms"); // "forms" | "records"
  const [selectedForm, setSelectedForm] = useState(null);

  /* ── forms list ── */
  const [forms, setForms]         = useState([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsError, setFormsError]     = useState("");

  /* ── records ── */
  const [records, setRecords]   = useState([]);
  const [schema, setSchema]     = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]     = useState("");

  /* ── lock status ── */
  const [lockInfo, setLockInfo] = useState({ is_locked: false, locked_by: null, locked_at: null });

  /* ── search (live + debounced) ── */
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ── modal state ── */
  const [modalOpen, setModalOpen]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState("");

  /* ── toast ── */
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── load available forms ── */
  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    setFormsError("");
    try {
      const res  = await apiFetch("/api/forms/institution-forms");
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setFormsError(data.message || "Failed to load forms.");
    } catch (err) {
      if (!isAuthError(err)) setFormsError("Failed to load forms.");
    } finally {
      setFormsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadForms(); }, [loadForms]);

  /* ── load records for selected form, in the currently selected language ──
     Hindi rows already exist in the DB (language='hi'); we just fetch them.
     No translation happens here. */
  const loadRecords = useCallback(async (form) => {
    setRecsLoading(true);
    setRecsError("");
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
    } catch (err) {
      if (!isAuthError(err)) setRecsError("Failed to load records.");
    } finally {
      setRecsLoading(false);
    }
  }, [apiFetch, lang]);

  /* Load whenever a form is opened OR the language toggles while viewing
     records. loadRecords changes identity when `lang` changes, so flipping
     EN ⇄ HI re-fetches the matching-language rows (same pattern the
     institution view uses). */
  useEffect(() => {
    if (view === "records" && selectedForm) loadRecords(selectedForm);
  }, [view, selectedForm, loadRecords]);

  function openForm(form) {
    setSelectedForm(form);
    setView("records");
    setSearchInput("");
    setSearchTerm("");
  }

  function backToForms() {
    setView("forms");
    setSelectedForm(null);
    setSchema(null);
    setRecords([]);
    setRecsError("");
    setSearchInput("");
    setSearchTerm("");
    setLockInfo({ is_locked: false, locked_by: null, locked_at: null });
  }

  /* ── save (create or update) ── */
  async function handleSave(formData) {
    setSaving(true);
    setModalError("");
    try {
      let res;
      if (editRecord) {
        res = await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${editRecord.id}`, {
          method: "PUT",
          body: JSON.stringify({ data: formData }),
        });
      } else {
        res = await apiFetch(`/api/form-data/${selectedForm.form_name}/records`, {
          method: "POST",
          body: JSON.stringify({ data: formData }),
        });
      }
      const data = await res.json();
      if (data.success) {
        setModalOpen(false);
        setEditRecord(null);
        showToast(data.message);
        loadRecords(selectedForm);
      } else {
        setModalError(data.message || "Failed to save record.");
      }
    } catch (err) {
      if (!isAuthError(err)) setModalError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── delete ── */
  async function handleDelete() {
    setDeleting(true);
    try {
      const res  = await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteTarget(null);
        showToast(data.message);
        loadRecords(selectedForm);
      } else {
        showToast(data.message || "Failed to delete record.", "error");
        setDeleteTarget(null);
      }
    } catch (err) {
      if (!isAuthError(err)) showToast("Network error.", "error");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const excludedCols = new Set(schema?.schema?.excluded_fixed_columns || []);
  const schemaFields = (schema?.schema?.fields || []).filter(
    (f) => !excludedCols.has(dbCol(f.column_name)) && !excludedCols.has(f.column_name)
  );

  /* ── Filter records by debounced search across all schema-visible columns ── */
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

  /* Hindi rows are auto-generated mirrors of the English row (linked via
     source_row_id). Data entry must happen in English so the link stays
     intact, so the Hindi view is read-only — adding/editing/deleting is
     disabled while Hindi is selected (switch to English to make changes). */
  const viewingTranslated = lang === "hi";
  const readOnly = lockInfo.is_locked || viewingTranslated;


  /* ══════════════════════════════════════════════════════
     VIEW 1 — Form selection grid
  ══════════════════════════════════════════════════════ */
  if (view === "forms") {
    /* Department summary stats — derived from existing forms data, no backend change */
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
      { label: "Total Forms",      value: totalForms,   color: "#0891b2", bg: "#ecfeff", hint: "All accessible forms" },
      { label: "Active Forms",     value: activeForms,  color: "#16a34a", bg: "#f0fdf4", hint: "Open for submissions" },
      { label: "Pending Deadline", value: pendingForms, color: "#d97706", bg: "#fffbeb", hint: "Due within 7 days" },
      { label: "Expired Forms",    value: expiredForms, color: "#dc2626", bg: "#fef2f2", hint: "Past deadline" },
    ];

    return (
      <div style={{ padding: "20px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
        {toast && <Toast message={toast.message} type={toast.type} />}

        {/* Page header */}
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

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
          {summary.map((s) => (
            <div key={s.label} style={{
              background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 12, padding: "12px 14px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: s.bg, color: s.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, fontWeight: 800, flexShrink: 0, letterSpacing: -0.3,
              }}>
                {s.value}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 1 }}>
                  {s.hint}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Available Forms table */}
        <div style={tableCardStyle}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #eef2f6",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Available Forms</div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>
                {formsLoading ? "Loading…" : `${forms.length} form${forms.length !== 1 ? "s" : ""} accessible to your department`}
              </div>
            </div>
          </div>

          {formsLoading ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading forms…
            </div>
          ) : forms.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
                background: "#f1f5f9", border: "1px solid #e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
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
                      <th key={h} style={{
                        padding: "8px 14px", textAlign: h === "Actions" ? "right" : "left",
                        fontSize: 10.5, fontWeight: 700, color: "#94a3b8",
                        textTransform: "uppercase", letterSpacing: 0.5,
                        borderBottom: "1px solid #eef2f6", whiteSpace: "nowrap",
                      }}>{h}</th>
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
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: ACCENT + "18",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, color: ACCENT, fontWeight: 800, letterSpacing: 0.3,
                          }}>
                            {form.form_name.slice(0, 2).toUpperCase()}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1e293b", letterSpacing: 0.2 }}>
                            {form.form_name.toUpperCase()}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, fontFamily: "monospace" }}>
                            {form.form_name}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: 12.5, color: "#475569", fontWeight: 600 }}>{deadlineText}</span>
                            {deadlineSubBadge && (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                                background: deadlineSubBadge.color + "18", color: deadlineSubBadge.color,
                                alignSelf: "flex-start", whiteSpace: "nowrap", letterSpacing: 0.3,
                              }}>
                                {deadlineSubBadge.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: statusBadge.color + "18", color: statusBadge.color,
                            letterSpacing: 0.3, whiteSpace: "nowrap",
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusBadge.color, display: "inline-block" }} />
                            {statusBadge.label}
                          </span>
                        </td>
                        <td style={{ padding: "6px 14px", textAlign: "right" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openForm(form); }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              background: "#fff", color: ACCENT, border: `1px solid ${ACCENT}40`,
                              borderRadius: 7, padding: "0 12px", height: 30, fontSize: 11.5, fontWeight: 700,
                              cursor: "pointer", whiteSpace: "nowrap",
                              transition: "background .15s, border-color .15s",
                            }}
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
     VIEW 2 — Records table for selected form
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "20px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1440 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* modals */}
      {modalOpen && (
        <RecordModal
          fields={schemaFields}
          record={editRecord}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditRecord(null); setModalError(""); }}
          saving={saving}
          error={modalError}
          getToken={getToken}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* locked banner */}
      {lockInfo.is_locked && (() => {
        const deadlineExpired =
          lockInfo.auto_locked ||
          (lockInfo.deadline_at && new Date(lockInfo.deadline_at).getTime() <= Date.now());
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 10, padding: "12px 18px", marginBottom: 20,
          }}>
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

      {/* translated (Hindi) view banner — read-only, edits happen in English */}
      {viewingTranslated && !lockInfo.is_locked && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 10, padding: "12px 18px", marginBottom: 20,
        }}>
          <Globe size={18} color="#1e3a8a" strokeWidth={2} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a" }}>
              हिंदी अनुवाद देखा जा रहा है — केवल देखने का मोड।
            </div>
            <div style={{ fontSize: 12, color: "#2563eb", marginTop: 2 }}>
              रिकॉर्ड जोड़ने, संपादित करने या हटाने के लिए अंग्रेज़ी (EN) पर स्विच करें।
            </div>
          </div>
        </div>
      )}

      {/* header */}
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
              <span style={{
                marginLeft: 10, fontSize: 13, fontWeight: 600, color: "#dc2626",
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 6, padding: "2px 8px", verticalAlign: "middle",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
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
                ? `${filteredRecords.length} of ${records.length} record${records.length !== 1 ? "s" : ""}`
                : `${records.length} record${records.length !== 1 ? "s" : ""}`}
            {schema && (
              <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 11 }}>
                · {schema.year}
              </span>
            )}
          </>
        }
        actions={
          <button
            onClick={() => { if (!readOnly) { setEditRecord(null); setModalError(""); setModalOpen(true); } }}
            disabled={readOnly}
            title={
              lockInfo.is_locked
                ? "Form is locked — contact your institution admin"
                : viewingTranslated
                  ? "Switch to English (EN) to add records"
                  : ""
            }
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: readOnly ? "#94a3b8" : ACCENT,
              color: "#fff", border: "none", borderRadius: 10,
              padding: "0 16px", height: 34, fontSize: 12.5, fontWeight: 700,
              cursor: readOnly ? "not-allowed" : "pointer",
              boxShadow: readOnly ? "none" : `0 2px 8px ${ACCENT}40`,
            }}
          >
            <IcoPlus /> Add Record
          </button>
        }
      />

      {recsError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>
          {recsError}
        </div>
      )}

      {/* records card */}
      <div style={tableCardStyle}>
        {/* Toolbar: search bar */}
        {!recsLoading && records.length > 0 && (
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid #f1f5f9",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
              Records
              {searchTerm && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
                  · {filteredRecords.length} matching
                </span>
              )}
            </div>
            <div style={{ position: "relative", width: 260 }}>
              <span style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "#94a3b8", display: "flex",
              }}>
                <IcoSearch />
              </span>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search records..."
                style={{
                  width: "100%", padding: "7px 30px 7px 32px",
                  fontSize: 13, color: "#1e293b",
                  border: "1px solid #e2e8f0", borderRadius: 8, outline: "none",
                  background: "#fff",
                }}
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  title="Clear"
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "#94a3b8",
                    fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "2px 6px",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}

        {recsLoading ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading records…
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
              background: "#f1f5f9", border: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FilePlus size={26} strokeWidth={1.6} color="#94a3b8" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No records yet</div>
            <div style={{ fontSize: 13 }}>Click "Add Record" to create the first entry.</div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
              background: "#f1f5f9", border: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <SearchX size={26} strokeWidth={1.6} color="#94a3b8" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No matching records</div>
            <div style={{ fontSize: 13 }}>Try a different search term or clear the search to see all records.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>#</th>
                  {schemaFields.map((f) => (
                    <th key={dbCol(f.column_name)} style={thStyle}>
                      {f.label?.[lang] || f.label?.en || displayCol(f.column_name)}
                    </th>
                  ))}
                  <th style={thStyle}>Created</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, i) => (
                  <tr
                    key={rec.id}
                    style={{ borderBottom: i < filteredRecords.length - 1 ? "1px solid #f8fafc" : "none", transition: "background .1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{i + 1}</span>
                    </td>
                    {schemaFields.map((f) => {
                      const col = dbCol(f.column_name);
                      const raw = rec[col];

                      let cellContent;
                      if (f.type === "boolean") {
                        cellContent = raw === true || raw === "true" ? "Yes" : raw === false || raw === "false" ? "No" : "—";
                      } else if (f.type === "document") {
                        cellContent = <DocumentCell url={raw} />;
                      } else {
                        cellContent = raw ?? <span style={{ color: "#cbd5e1" }}>—</span>;
                      }

                      return (
                        <td key={col} style={tdStyle}>
                          <span style={{ fontSize: 13, color: "#1e293b" }}>{cellContent}</span>
                        </td>
                      );
                    })}
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{formatDate(rec.created_at)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
                        <button
                          onClick={() => { if (!readOnly) { setEditRecord(rec); setModalError(""); setModalOpen(true); } }}
                          disabled={readOnly}
                          style={{
                            ...actionBtn,
                            opacity: readOnly ? 0.35 : 1,
                            cursor: readOnly ? "not-allowed" : "pointer",
                          }}
                          title={lockInfo.is_locked ? "Form is locked" : viewingTranslated ? "Switch to English (EN) to edit" : "Edit"}
                        >
                          <IcoEdit />
                        </button>
                        <button
                          onClick={() => { if (!readOnly) setDeleteTarget(rec); }}
                          disabled={readOnly}
                          style={{
                            ...actionBtn,
                            color: readOnly ? "#94a3b8" : "#dc2626",
                            borderColor: readOnly ? "#e2e8f0" : "#fecaca",
                            opacity: readOnly ? 0.35 : 1,
                            cursor: readOnly ? "not-allowed" : "pointer",
                          }}
                          title={lockInfo.is_locked ? "Form is locked" : viewingTranslated ? "Switch to English (EN) to delete" : "Delete"}
                        >
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── table styles ── */
const thStyle = {
  padding: "8px 14px", textAlign: "left", fontSize: 10.5,
  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
  letterSpacing: 0.5, borderBottom: "1px solid #eef2f6",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "9px 14px", verticalAlign: "middle",
};

const actionBtn = {
  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
  width: 36, height: 36, minHeight: 36, display: "inline-flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer", color: "#475569",
  whiteSpace: "nowrap", flexShrink: 0,
};
