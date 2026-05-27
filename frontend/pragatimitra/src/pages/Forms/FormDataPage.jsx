import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { S, Toast, isAuthError, formatDate } from "../../components/shared/formUtils";

const ACCENT = "#2563eb";

/* ── helpers ── */
function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}
function displayCol(col) {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
function IcoBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
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

  if (type === "textarea") {
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

  return (
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
    </div>
  );
}

/* ── Delete confirm modal ── */
function DeleteModal({ onConfirm, onClose, deleting }) {
  return (
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
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
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
    </div>
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

  /* ── load records for selected form ── */
  const loadRecords = useCallback(async (form) => {
    setRecsLoading(true);
    setRecsError("");
    try {
      const res  = await apiFetch(`/api/form-data/${form.form_name}/records`);
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
  }, [apiFetch]);

  function openForm(form) {
    setSelectedForm(form);
    setView("records");
    loadRecords(form);
  }

  function backToForms() {
    setView("forms");
    setSelectedForm(null);
    setSchema(null);
    setRecords([]);
    setRecsError("");
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

  /* Reset the search box when switching forms */
  useEffect(() => {
    setSearchInput("");
    setSearchTerm("");
  }, [selectedForm?.form_name]);

  /* ══════════════════════════════════════════════════════
     VIEW 1 — Form selection grid
  ══════════════════════════════════════════════════════ */
  if (view === "forms") {
    return (
      <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
        {toast && <Toast message={toast.message} type={toast.type} />}

        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: ACCENT + "12", borderRadius: 8, padding: "4px 12px", marginBottom: 10,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
              Data Entry
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: "0 0 6px" }}>
            Forms
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            Select a form to view, add, or manage its records.
          </p>
        </div>

        {formsError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>
            {formsError}
          </div>
        )}

        {formsLoading ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "#94a3b8", fontSize: 13 }}>
            Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No forms available</div>
            <div style={{ fontSize: 13 }}>Your institution doesn't have access to any forms yet.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {forms.map((form) => (
              <button
                key={form.id}
                onClick={() => openForm(form)}
                style={{
                  background: "#fff", border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14, padding: "22px 20px", textAlign: "left",
                  cursor: "pointer", transition: "all .15s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT + "60";
                  e.currentTarget.style.boxShadow = `0 4px 16px ${ACCENT}18`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                  e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                  e.currentTarget.style.transform = "";
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 11,
                  background: ACCENT + "14", color: ACCENT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 14,
                }}>
                  <IcoForm />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                  {form.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                  {form.form_name}
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: ACCENT, fontWeight: 600 }}>
                  Open →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     VIEW 2 — Records table for selected form
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
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
      {lockInfo.is_locked && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, padding: "12px 18px", marginBottom: 20,
        }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              This form is currently locked by the institution admin.
            </div>
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 2 }}>
              You can only view the records. Adding, editing, and deleting are disabled.
            </div>
          </div>
        </div>
      )}

      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <button
            onClick={backToForms}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: "none", fontSize: 13, fontWeight: 600,
              color: ACCENT, cursor: "pointer", padding: 0, marginBottom: 12,
            }}
          >
            <IcoBack /> Back to Forms
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.3px", margin: "0 0 4px" }}>
            {selectedForm?.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {lockInfo.is_locked && (
              <span style={{
                marginLeft: 10, fontSize: 13, fontWeight: 600, color: "#dc2626",
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 6, padding: "2px 8px", verticalAlign: "middle",
              }}>
                🔒 Locked
              </span>
            )}
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
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
          </p>
        </div>
        <button
          onClick={() => { setEditRecord(null); setModalError(""); setModalOpen(true); }}
          disabled={lockInfo.is_locked}
          title={lockInfo.is_locked ? "Form is locked — contact your institution admin" : ""}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: lockInfo.is_locked ? "#94a3b8" : ACCENT,
            color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700,
            cursor: lockInfo.is_locked ? "not-allowed" : "pointer",
            boxShadow: lockInfo.is_locked ? "none" : `0 2px 8px ${ACCENT}40`,
          }}
        >
          <IcoPlus /> Add Record
        </button>
      </div>

      {recsError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>
          {recsError}
        </div>
      )}

      {/* records card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
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
            <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No records yet</div>
            <div style={{ fontSize: 13 }}>Click "Add Record" to create the first entry.</div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
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
                      {f.label?.en || displayCol(f.column_name)}
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
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          onClick={() => { if (!lockInfo.is_locked) { setEditRecord(rec); setModalError(""); setModalOpen(true); } }}
                          disabled={lockInfo.is_locked}
                          style={{
                            ...actionBtn,
                            opacity: lockInfo.is_locked ? 0.35 : 1,
                            cursor: lockInfo.is_locked ? "not-allowed" : "pointer",
                          }}
                          title={lockInfo.is_locked ? "Form is locked" : "Edit"}
                        >
                          <IcoEdit />
                        </button>
                        <button
                          onClick={() => { if (!lockInfo.is_locked) setDeleteTarget(rec); }}
                          disabled={lockInfo.is_locked}
                          style={{
                            ...actionBtn,
                            color: lockInfo.is_locked ? "#94a3b8" : "#dc2626",
                            borderColor: lockInfo.is_locked ? "#e2e8f0" : "#fecaca",
                            opacity: lockInfo.is_locked ? 0.35 : 1,
                            cursor: lockInfo.is_locked ? "not-allowed" : "pointer",
                          }}
                          title={lockInfo.is_locked ? "Form is locked" : "Delete"}
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
  padding: "10px 16px", textAlign: "left", fontSize: 11,
  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
  letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "13px 16px", verticalAlign: "middle",
};

const actionBtn = {
  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7,
  width: 30, height: 30, display: "inline-flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer", color: "#475569",
};
