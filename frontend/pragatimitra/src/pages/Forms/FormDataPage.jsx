import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { S, Toast, isAuthError, formatDate } from "../../components/shared/formUtils";

const ACCENT = "#2563eb";

/* ── How many rows to send per API request ── */
const CHUNK_SIZE = 500;

/* ── How many records to show per page ── */
const PAGE_SIZE = 50;

function dbCol(col) { return col.trim().toLowerCase().replace(/\s+/g, "_"); }
function displayCol(col) { return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

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

const ALLOWED_TYPES = ["image/jpeg","image/png","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const MAX_SIZE = 10 * 1024 * 1024;

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
      const fd = new FormData(); fd.append("file", file);
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_BASE}/api/upload/document`, { method: "POST", body: fd, headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed.");
      onChange(data.url); setStatus("done");
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

function DocumentCell({ url }) {
  if (!url) return <span style={{ color: "#cbd5e1" }}>—</span>;
  return <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: ACCENT, fontSize: 12, fontWeight: 600, textDecoration: "none" }}><IcoFile /> View Doc ↗</a>;
}

function FieldInput({ field, value, onChange, getToken }) {
  const col = dbCol(field.column_name);
  const label = field.label?.en || displayCol(field.column_name);
  const type = field.type;
  const commonStyle = S.input(false);
  if (type === "boolean") return (
    <div><label style={S.label}>{label}{field.required && " *"}</label>
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        {[{val:"true",text:"Yes"},{val:"false",text:"No"}].map(({val,text}) => (
          <label key={val} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
            <input type="radio" name={col} value={val} checked={String(value)===val} onChange={() => onChange(col, val==="true")} style={{ accentColor: ACCENT, width: 15, height: 15 }} /> {text}
          </label>
        ))}
      </div>
    </div>
  );
  if (type === "textarea") return <div><label style={S.label}>{label}{field.required && " *"}</label><textarea style={{ ...commonStyle, resize: "vertical", minHeight: 80 }} value={value||""} onChange={e => onChange(col, e.target.value)} required={field.required} /></div>;
  if (type === "document") return <DocumentUploadField label={label} required={field.required} value={value} onChange={url => onChange(col, url)} getToken={getToken} />;
  const inputType = type==="number"?"number":type==="date"?"date":type==="email"?"email":type==="phone"?"tel":"text";
  return <div><label style={S.label}>{label}{field.required && " *"}</label><input style={commonStyle} type={inputType} value={value||""} onChange={e => onChange(col, e.target.value)} required={field.required} /></div>;
}

function RecordModal({ fields, record, onSave, onClose, saving, error, getToken }) {
  const isEdit = !!record;
  const [formData, setFormData] = useState(() => { const init = {}; fields.forEach(f => { const col = dbCol(f.column_name); init[col] = record ? (record[col]??"") : ""; }); return init; });
  function handleChange(col, val) { setFormData(prev => ({ ...prev, [col]: val })); }
  function handleSubmit(e) { e.preventDefault(); onSave(formData); }
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{isEdit ? "Edit Record" : "Add New Record"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer" }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {fields.map(field => <FieldInput key={dbCol(field.column_name)} field={field} value={formData[dbCol(field.column_name)]} onChange={handleChange} getToken={getToken} />)}
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" }}>{error}</div>}
          </div>
          <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={S.btnGhost} disabled={saving}>Cancel</button>
            <button type="submit" style={S.btnPrimary(saving)} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Record" : "Add Record"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ onConfirm, onClose, deleting }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 380, padding: "28px 24px", boxShadow: "0 20px 48px rgba(0,0,0,0.16)", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Delete Record?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>This action cannot be undone.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={S.btnGhost} disabled={deleting}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ ...S.btnPrimary(deleting), background: deleting ? "#fca5a5" : "#dc2626" }}>{deleting ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable progress bar ── */
function ProgressBar({ percent, color = ACCENT, height = 8 }) {
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(Math.max(percent, 0), 100)}%`, background: color, borderRadius: 99, transition: "width 0.25s ease" }} />
    </div>
  );
}

/* ── Import progress panel shown in Step 2 while executing ── */
function ImportProgressPanel({ total, processed, remaining, percent, chunksDone, chunksTotal }) {
  return (
    <div style={{ background: "#f8fafc", border: `1.5px solid ${ACCENT}30`, borderRadius: 12, padding: "16px 18px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: `2.5px solid ${ACCENT}30`,
            borderTopColor: ACCENT,
            animation: "spin 0.8s linear infinite",
          }} />
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

/* ══════════════════════════════════════════════════════════════
   FormImportWizard  —  3-step import flow
══════════════════════════════════════════════════════════════ */
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
      if (data.departmentId && !selectedDepartmentId) {
        setSelectedDepartmentId(data.departmentId);
      }
      setStep(2);
    } catch { setParseError("Network error. Please try again."); }
    finally { setParsing(false); }
  }

  async function handleExecute() {
    setExecuting(true); setExecError("");
    const chunks = [];
    for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
      chunks.push(allRows.slice(i, i + CHUNK_SIZE));
    }

    const total = allRows.length;
    setChunksTotal(chunks.length);
    setChunksDone(0);
    setImportPercent(0);
    setImportProcessed(0);
    setImportRemaining(total);

    let totalImported = 0;
    let totalSkipped  = 0;
    let totalFailed   = 0;
    const allErrors   = [];

    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        const res = await apiFetch(`/api/form-data/${formName}/import/execute-chunk`, {
          method: "POST",
          body: JSON.stringify({
            mapping,
            chunk:             chunks[ci],
            chunkIndex:        ci,
            totalChunks:       chunks.length,
            duplicateHandling,
            departmentId:      selectedDepartmentId || null,
            year:              null,
          }),
        });
        const data = await res.json();

        if (!data.success) {
          setExecError(data.message || `Batch ${ci + 1} failed.`);
          setExecuting(false);
          return;
        }

        totalImported += data.imported || 0;
        totalSkipped  += data.skipped  || 0;
        totalFailed   += data.failed   || 0;
        allErrors.push(...(data.errors || []));

        const processed = Math.min((ci + 1) * CHUNK_SIZE, total);
        const pct       = (processed / total) * 100;
        setChunksDone(ci + 1);
        setImportPercent(pct);
        setImportProcessed(processed);
        setImportRemaining(Math.max(0, total - processed));
        await new Promise(r => setTimeout(r, 0));
      }

      setImportPercent(100);
      setImportProcessed(total);
      setImportRemaining(0);
      setResult({
        imported: totalImported,
        skipped:  totalSkipped,
        failed:   totalFailed,
        errors:   allErrors,
        total,
        message:  `Import complete: ${totalImported} inserted, ${totalSkipped} skipped, ${totalFailed} failed.`,
      });
      setStep(3);
    } catch {
      setExecError("Network error. Please try again.");
    } finally {
      setExecuting(false);
    }
  }

  async function downloadSample(format) {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/form-data/${formName}/export/sample?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href = url; a.download = `${formName}_sample.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error("Sample download error:", err); }
  }

  const mappedCount  = schemaFields.filter(f => mapping[f.col]).length;
  const isDeptAdmin  = userRole === "department_admin";
  const isInstAdmin  = userRole === "institute_admin" || userRole === "super_admin";
  const steps        = ["Upload File", "Map Columns", "Result"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.5)", overflowY: "auto", padding: "20px" }}
      onClick={e => { if (e.target === e.currentTarget && !executing) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 640, margin: "0 auto", boxShadow: "0 28px 72px rgba(0,0,0,0.2)", overflow: "hidden" }}>

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

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div style={{ padding: "16px 20px" }}>
              {isDeptAdmin && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#15803d" }}>
                  🏢 Importing as Department Admin — data will be saved to your department only.
                </div>
              )}
              {isInstAdmin && (
                <div style={{ background: ACCENT + "0d", border: `1px solid ${ACCENT}25`, borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#1d4ed8" }}>
                  🏛️ Importing as Institute Admin — you can tag data to a specific department below.
                </div>
              )}

              {isInstAdmin && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Department (optional)</label>
                  <div style={{ position: "relative" }}>
                    <select value={selectedDepartmentId || ""} onChange={e => setSelectedDepartmentId(e.target.value || null)}
                      style={{ width: "100%", padding: "8px 32px 8px 12px", fontSize: 13, border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#1e293b", appearance: "none", outline: "none", cursor: "pointer" }}>
                      <option value="">— All departments (institution-wide) —</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }}><IcoChevronDown /></div>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    {selectedDepartmentId ? "All imported rows will be tagged to the selected department." : "No department selected — rows will be institution-wide."}
                  </div>
                </div>
              )}

              <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                style={{ border: `2px dashed ${file ? ACCENT : "#cbd5e1"}`, borderRadius: 10, padding: "18px 24px", textAlign: "center", cursor: "pointer", background: file ? ACCENT + "08" : "#f8fafc", marginBottom: 14, transition: "all .15s" }}>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />
                <div style={{ color: file ? ACCENT : "#94a3b8", marginBottom: 8, display: "flex", justifyContent: "center" }}><IcoUpload /></div>
                {file ? (
                  <div><div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{file.name}</div><div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div></div>
                ) : (
                  <div><div style={{ fontSize: 13, color: "#64748b" }}><span style={{ color: ACCENT, fontWeight: 700 }}>Click to upload</span> or drag & drop</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>CSV, Excel (.xlsx, .xls) · max 50 MB · up to 10,500 rows</div>
                  </div>
                )}
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
                    { val: "skip",      label: "Skip duplicates",   desc: "Existing matching rows are left unchanged" },
                    { val: "overwrite", label: "Overwrite",          desc: "Existing matching rows are updated with new values" },
                    { val: "new",       label: "Always insert new",  desc: "Every row is inserted regardless of duplicates" },
                  ].map(({ val, label, desc }) => (
                    <label key={val} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${duplicateHandling===val?ACCENT+"60":"#e2e8f0"}`, background: duplicateHandling===val?ACCENT+"06":"#fff", cursor: "pointer", transition: "all .12s" }}>
                      <input type="radio" name="dup" value={val} checked={duplicateHandling===val} onChange={() => setDuplicateHandling(val)} style={{ accentColor: ACCENT, marginTop: 2 }} />
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{label}</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{desc}</div></div>
                    </label>
                  ))}
                </div>
              </div>

              {parseError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 13px", fontSize: 13, color: "#b91c1c", display: "flex", gap: 8, alignItems: "center" }}>
                  <IcoAlert /> {parseError}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Map + Execute */}
          {step === 2 && (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ background: ACCENT + "08", border: `1px solid ${ACCENT}20`, borderRadius: 8, padding: "9px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
                <IcoFile />
                <span style={{ color: "#475569" }}>
                  <strong style={{ color: "#1e293b" }}>{totalRows.toLocaleString()} rows</strong> detected ·{" "}
                  <strong style={{ color: "#1e293b" }}>{mappedCount}</strong> of{" "}
                  <strong style={{ color: "#1e293b" }}>{schemaFields.length}</strong> columns mapped
                  {selectedDepartmentId && departments.find(d => d.id === selectedDepartmentId) && (
                    <span style={{ marginLeft: 10, color: "#059669", fontWeight: 600 }}>
                      → {departments.find(d => d.id === selectedDepartmentId)?.name}
                    </span>
                  )}
                  {!selectedDepartmentId && isInstAdmin && (
                    <span style={{ marginLeft: 10, color: "#94a3b8" }}>→ Institution-wide</span>
                  )}
                  {totalRows > 1000 && (
                    <span style={{ marginLeft: 10, color: "#7c3aed", fontWeight: 600 }}>
                      · {Math.ceil(totalRows / CHUNK_SIZE)} batches of {CHUNK_SIZE}
                    </span>
                  )}
                </span>
              </div>

              {schemaFields.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No schema fields found. Check that a schema is configured for your institution.
                </div>
              ) : (
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: "0 8px", padding: "7px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Schema Field</div>
                    <div />
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Your File Column</div>
                  </div>
                  {schemaFields.map((field, idx) => (
                    <div key={field.col} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: "0 8px", padding: "9px 12px", alignItems: "center", borderBottom: idx < schemaFields.length - 1 ? "1px solid #f1f5f9" : "none", background: "#fff" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{field.label}{field.required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginTop: 1 }}>{field.col}</div>
                      </div>
                      <div style={{ color: mapping[field.col] ? "#16a34a" : "#cbd5e1", textAlign: "center", fontSize: 16 }}>→</div>
                      <div style={{ position: "relative" }}>
                        <select value={mapping[field.col] || ""} onChange={e => setMapping(prev => ({ ...prev, [field.col]: e.target.value }))} disabled={executing}
                          style={{ width: "100%", padding: "6px 26px 6px 9px", fontSize: 12, border: `1.5px solid ${mapping[field.col] ? "#86efac" : "#e2e8f0"}`, borderRadius: 6, background: "#fff", color: "#1e293b", appearance: "none", cursor: executing ? "not-allowed" : "pointer", outline: "none" }}>
                          <option value="">— skip —</option>
                          {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                        <div style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }}><IcoChevronDown /></div>
                      </div>
                    </div>
                  ))}
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

              {executing && (
                <ImportProgressPanel
                  total={totalRows}
                  processed={importProcessed}
                  remaining={importRemaining}
                  percent={importPercent}
                  chunksDone={chunksDone}
                  chunksTotal={chunksTotal}
                />
              )}

              {execError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 13px", fontSize: 13, color: "#b91c1c", marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                  <IcoAlert /> {execError}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Result */}
          {step === 3 && result && (
            <div style={{ padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>
                {result.failed === 0 ? "✅" : result.imported === 0 ? "❌" : "⚠️"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Import Complete</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{result.message}</div>

              <div style={{ marginBottom: 20, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                  <span>All {result.total.toLocaleString()} rows processed</span>
                  <span style={{ fontWeight: 700, color: "#16a34a" }}>100%</span>
                </div>
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
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#dc2626", marginBottom: 3 }}>
                      Row {e.row} · <strong>{e.field}</strong>: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {step === 2 && !executing && (
              <button onClick={() => setStep(1)} style={S.btnGhost}>← Back</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {step !== 3 && (
              <button onClick={onClose} style={S.btnGhost} disabled={parsing || executing}>
                Cancel
              </button>
            )}
            {step === 1 && (
              <button onClick={handleParse} disabled={!file || parsing} style={S.btnPrimary(!file || parsing)}>
                {parsing ? "Parsing…" : "Next →"}
              </button>
            )}
            {step === 2 && (
              <button onClick={handleExecute} disabled={executing || mappedCount === 0} style={S.btnPrimary(executing || mappedCount === 0)}>
                {executing ? `Importing… ${Math.round(importPercent)}%` : `Import ${totalRows.toLocaleString()} Rows`}
              </button>
            )}
            {step === 3 && (
              <button onClick={onDone} style={{ ...S.btnPrimary(false), background: "#16a34a" }}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Export dropdown with real progress bar ── */
function ExportDropdown({ formName, accessToken }) {
  const [open, setOpen]                     = useState(false);
  const [exporting, setExporting]           = useState(null);
  const [exportPercent, setExportPercent]   = useState(0);

  async function download(path, filename, key) {
    setOpen(false);
    setExporting(key);
    setExportPercent(0);

    const interval = setInterval(() => {
      setExportPercent(p => p < 80 ? p + Math.random() * 12 : p);
    }, 220);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_BASE}${path}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      clearInterval(interval);
      if (!res.ok) { setExporting(null); return; }

      setExportPercent(95);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setExportPercent(100);
      setTimeout(() => { setExporting(null); setExportPercent(0); }, 900);
    } catch (err) {
      clearInterval(interval);
      console.error("Export error:", err);
      setExporting(null);
    }
  }

  const options = [
    { key: "csv",  label: "Export as CSV",   action: () => download(`/api/form-data/${formName}/export?format=csv`,  `${formName}_export.csv`,  "csv")  },
    { key: "xlsx", label: "Export as Excel",  action: () => download(`/api/form-data/${formName}/export?format=xlsx`, `${formName}_export.xlsx`, "xlsx") },
  ];

  return (
    <div style={{ position: "relative" }}>
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
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, background: "#fff", borderRadius: 10, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, overflow: "hidden" }}>
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
   FormDataPage
════════════════════════════════════════════════════════════════════ */
export default function FormDataPage() {
  const { apiFetch }    = useApi();
  const { accessToken } = useAuth();
  const getToken        = useCallback(() => accessToken, [accessToken]);

  const [view, setView]                 = useState("forms");
  const [selectedForm, setSelectedForm] = useState(null);
  const [importOpen, setImportOpen]     = useState(false);

  const [forms, setForms]                   = useState([]);
  const [formsLoading, setFormsLoading]     = useState(true);
  const [formsError, setFormsError]         = useState("");

  const [records, setRecords]         = useState([]);
  const [schema, setSchema]           = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]     = useState("");

  const [modalOpen, setModalOpen]       = useState(false);
  const [editRecord, setEditRecord]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [modalError, setModalError]     = useState("");

  const [toast, setToast] = useState(null);

  /* ── Pagination state ── */
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (message, type = "success") => {
    setToast({ message, type }); setTimeout(() => setToast(null), 3500);
  };

  const loadForms = useCallback(async () => {
    setFormsLoading(true); setFormsError("");
    try {
      const res  = await apiFetch("/api/forms/institution-forms");
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setFormsError(data.message || "Failed to load forms.");
    } catch (err) { if (!isAuthError(err)) setFormsError("Failed to load forms."); }
    finally { setFormsLoading(false); }
  }, [apiFetch]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const loadRecords = useCallback(async (form) => {
    setRecsLoading(true); setRecsError("");
    try {
      const res  = await apiFetch(`/api/form-data/${form.form_name}/records`);
      const data = await res.json();
      if (data.success) { setRecords(data.records || []); setSchema(data.schema); }
      else setRecsError(data.message || "Failed to load records.");
    } catch (err) { if (!isAuthError(err)) setRecsError("Failed to load records."); }
    finally { setRecsLoading(false); }
  }, [apiFetch]);

  /* Reset page to 1 whenever a new form is opened */
  function openForm(form) {
    setSelectedForm(form);
    setView("records");
    setCurrentPage(1);
    loadRecords(form);
  }

  function backToForms() {
    setView("forms");
    setSelectedForm(null);
    setSchema(null);
    setRecords([]);
    setRecsError("");
    setCurrentPage(1);
  }

  async function handleSave(formData) {
    setSaving(true); setModalError("");
    try {
      const res = editRecord
        ? await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${editRecord.id}`, { method: "PUT",  body: JSON.stringify({ data: formData }) })
        : await apiFetch(`/api/form-data/${selectedForm.form_name}/records`,                  { method: "POST", body: JSON.stringify({ data: formData }) });
      const data = await res.json();
      if (data.success) { setModalOpen(false); setEditRecord(null); showToast(data.message); loadRecords(selectedForm); }
      else setModalError(data.message || "Failed to save record.");
    } catch (err) { if (!isAuthError(err)) setModalError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res  = await apiFetch(`/api/form-data/${selectedForm.form_name}/records/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { setDeleteTarget(null); showToast(data.message); loadRecords(selectedForm); }
      else { showToast(data.message || "Failed to delete.", "error"); setDeleteTarget(null); }
    } catch (err) { if (!isAuthError(err)) showToast("Network error.", "error"); setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  const excludedCols = new Set(schema?.schema?.excluded_fixed_columns || []);
  const schemaFields = (schema?.schema?.fields || []).filter(
    f => !excludedCols.has(dbCol(f.column_name)) && !excludedCols.has(f.column_name)
  );

  /* ── Pagination derived values ── */
  const totalPages   = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pagedRecords = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /* ── VIEW 1: forms grid ── */
  if (view === "forms") {
    return (
      <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: ACCENT + "12", borderRadius: 8, padding: "4px 12px", marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>Data Entry</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: "0 0 6px" }}>Forms</h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Select a form to view, add, or manage its records.</p>
        </div>
        {formsError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>{formsError}</div>}
        {formsLoading ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "#94a3b8", fontSize: 13 }}>Loading forms…</div>
        ) : forms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No forms available</div>
            <div style={{ fontSize: 13 }}>Your institution doesn't have access to any forms yet.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {forms.map(form => (
              <button key={form.id} onClick={() => openForm(form)}
                style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "22px 20px", textAlign: "left", cursor: "pointer", transition: "all .15s", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT + "60"; e.currentTarget.style.boxShadow = `0 4px 16px ${ACCENT}18`; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = ""; }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: ACCENT + "14", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><IcoForm /></div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{form.form_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{form.form_name}</div>
                <div style={{ marginTop: 14, fontSize: 11, color: ACCENT, fontWeight: 600 }}>Open →</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── VIEW 2: records table ── */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {modalOpen && (
        <RecordModal fields={schemaFields} record={editRecord} onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditRecord(null); setModalError(""); }}
          saving={saving} error={modalError} getToken={getToken} />
      )}
      {deleteTarget && (
        <DeleteModal onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} deleting={deleting} />
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

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <button onClick={backToForms} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", fontSize: 13, fontWeight: 600, color: ACCENT, cursor: "pointer", padding: 0, marginBottom: 12 }}>
            <IcoBack /> Back to Forms
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.3px", margin: "0 0 4px" }}>
            {selectedForm?.form_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            {recsLoading ? "Loading…" : `${records.length.toLocaleString()} record${records.length !== 1 ? "s" : ""}`}
            {schema && <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 11 }}>· {schema.year}</span>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExportDropdown formName={selectedForm?.form_name} accessToken={accessToken} />
          <button onClick={() => setImportOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, border: "1.5px solid #2563eb", background: "#eff6ff", fontSize: 13, fontWeight: 600, color: "#2563eb", cursor: "pointer" }}>
            <IcoUpload /> Import
          </button>
          <button onClick={() => { setEditRecord(null); setModalError(""); setModalOpen(true); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: `0 2px 8px ${ACCENT}40` }}>
            <IcoPlus /> Add Record
          </button>
        </div>
      </div>

      {recsError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>{recsError}</div>}

      {/* Records table */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {recsLoading ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading records…</div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No records yet</div>
            <div style={{ fontSize: 13 }}>Click "Add Record" to create the first entry, or Import from a file.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>#</th>
                  {schemaFields.map(f => <th key={dbCol(f.column_name)} style={thStyle}>{f.label?.en || displayCol(f.column_name)}</th>)}
                  <th style={thStyle}>Created</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((rec, i) => (
                  <tr key={rec.id} style={{ borderBottom: i < pagedRecords.length - 1 ? "1px solid #f8fafc" : "none", transition: "background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    {/* Serial number is global across pages */}
                    <td style={tdStyle}><span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{(currentPage - 1) * PAGE_SIZE + i + 1}</span></td>
                    {schemaFields.map(f => {
                      const col = dbCol(f.column_name); const raw = rec[col];
                      let cell;
                      if (f.type === "boolean") cell = raw===true||raw==="true" ? "Yes" : raw===false||raw==="false" ? "No" : "—";
                      else if (f.type === "document") cell = <DocumentCell url={raw} />;
                      else cell = raw ?? <span style={{ color: "#cbd5e1" }}>—</span>;
                      return <td key={col} style={tdStyle}><span style={{ fontSize: 13, color: "#1e293b" }}>{cell}</span></td>;
                    })}
                    <td style={tdStyle}><span style={{ fontSize: 12, color: "#64748b" }}>{formatDate(rec.created_at)}</span></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => { setEditRecord(rec); setModalError(""); setModalOpen(true); }} style={actionBtn} title="Edit"><IcoEdit /></button>
                        <button onClick={() => setDeleteTarget(rec)} style={{ ...actionBtn, color: "#dc2626", borderColor: "#fecaca" }} title="Delete"><IcoTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination controls ── */}
      {!recsLoading && records.length > PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "10px 4px" }}>
          {/* Left: record range label */}
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Showing{" "}
            <strong style={{ color: "#1e293b" }}>
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, records.length)}
            </strong>{" "}
            of{" "}
            <strong style={{ color: "#1e293b" }}>{records.length.toLocaleString()}</strong> records
          </div>

          {/* Right: navigation buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {/* First */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              title="First page"
              style={{ ...pageBtn, opacity: currentPage === 1 ? 0.38 : 1, cursor: currentPage === 1 ? "default" : "pointer" }}
            >«</button>

            {/* Prev */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ ...pageBtn, opacity: currentPage === 1 ? 0.38 : 1, cursor: currentPage === 1 ? "default" : "pointer" }}
            >‹ Prev</button>

            {/* Page number pills with ellipsis */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push("ellipsis-" + p);
                acc.push(p);
                return acc;
              }, [])
              .map((item) =>
                String(item).startsWith("ellipsis") ? (
                  <span key={item} style={{ fontSize: 13, color: "#94a3b8", padding: "0 3px", userSelect: "none" }}>…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    style={{
                      ...pageBtn,
                      minWidth: 36,
                      justifyContent: "center",
                      background: currentPage === item ? ACCENT : "#fff",
                      color: currentPage === item ? "#fff" : "#475569",
                      borderColor: currentPage === item ? ACCENT : "#e2e8f0",
                      fontWeight: currentPage === item ? 700 : 500,
                      cursor: currentPage === item ? "default" : "pointer",
                    }}
                  >{item}</button>
                )
              )}

            {/* Next */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ ...pageBtn, opacity: currentPage === totalPages ? 0.38 : 1, cursor: currentPage === totalPages ? "default" : "pointer" }}
            >Next ›</button>

            {/* Last */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              title="Last page"
              style={{ ...pageBtn, opacity: currentPage === totalPages ? 0.38 : 1, cursor: currentPage === totalPages ? "default" : "pointer" }}
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle   = { padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" };
const tdStyle   = { padding: "13px 16px", verticalAlign: "middle" };
const actionBtn = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#475569" };
const pageBtn   = { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 11px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 3, transition: "all .12s", color: "#475569" };