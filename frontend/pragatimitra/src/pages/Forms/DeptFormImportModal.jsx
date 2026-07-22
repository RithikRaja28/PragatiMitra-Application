import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Upload, FileText, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { color } from "../../ui";

const STROKE = 1.75;

function Overlay({ children }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>,
    document.body
  );
}

function Alert({ type, children }) {
  const map = {
    error:   { bg: "#fef2f2", border: "#fecaca", col: "#b91c1c" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", col: "#15803d" },
    warning: { bg: "#fffbeb", border: "#fde68a", col: "#b45309" },
    info:    { bg: "#eff6ff", border: "#bfdbfe", col: "#1d4ed8" },
  };
  const s = map[type] || map.info;
  return (
    <div style={{ background: s.bg, border: `1.5px solid ${s.border}`, color: s.col, borderRadius: 9, padding: "10px 14px", fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   DeptFormImportModal

   Props:
     form       — { id, form_name }
     year       — academic year int | null
     onClose    — close callback
     onSuccess  — called with count after successful import (to trigger refresh)
───────────────────────────────────────────────────────────────────────── */
export default function DeptFormImportModal({ form, year, onClose, onSuccess }) {
  const { apiFetch } = useApi();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState("");

  const yearQs = year != null ? `?year=${year}` : "";

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ok = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!ok) { setError("Only CSV and Excel (.xlsx / .xls) files are supported."); return; }
    setError(""); setResult(null); setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ok = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!ok) { setError("Only CSV and Excel (.xlsx / .xls) files are supported."); return; }
    setError(""); setResult(null); setFile(f);
  }

  async function downloadSample(format) {
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/import/sample?format=${format}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.form_name}_import_sample.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download sample file.");
    }
  }

  async function handleImport() {
    if (!file) { setError("Please select a file to import."); return; }
    setImporting(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/api/department-form-data/${form.id}/import${yearQs}`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!d.success && !d.inserted) {
        setError(d.message || "Import failed.");
      } else {
        setResult(d);
        if (d.inserted > 0 && onSuccess) onSuccess(d.inserted);
      }
    } catch {
      setError("Import failed. Please check your file and try again.");
    } finally {
      setImporting(false);
    }
  }

  const btnBase = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: "none", transition: "opacity .15s",
  };

  return (
    <Overlay>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: color.text }}>Import Records</div>
            <div style={{ fontSize: 13, color: color.muted, marginTop: 2 }}>{form.form_name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: color.muted, padding: 4, borderRadius: 6, display: "flex" }}>
            <X size={20} strokeWidth={STROKE} />
          </button>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          {/* Step 1 — download sample */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Step 1 — Download Sample</div>
            <div style={{ fontSize: 13, color: color.text, marginBottom: 10 }}>
              Download the sample file to see the expected column headers, then fill it in with your data.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => downloadSample("csv")} style={{ ...btnBase, background: "#f1f5f9", color: color.text }}>
                <Download size={14} strokeWidth={STROKE} /> CSV
              </button>
              <button onClick={() => downloadSample("xlsx")} style={{ ...btnBase, background: "#f1f5f9", color: color.text }}>
                <Download size={14} strokeWidth={STROKE} /> Excel
              </button>
            </div>
          </div>

          {/* Step 2 — upload file */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Step 2 — Upload File</div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${file ? color.primary : color.border}`,
                borderRadius: 12, padding: "28px 20px", textAlign: "center",
                cursor: "pointer", background: file ? color.primarySoft : "#fafafa",
                transition: "border-color .15s, background .15s",
              }}
            >
              {file ? (
                <>
                  <FileText size={28} strokeWidth={STROKE} style={{ color: color.primary, marginBottom: 8 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
                </>
              ) : (
                <>
                  <Upload size={28} strokeWidth={STROKE} style={{ color: color.muted, marginBottom: 8 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: color.text }}>Drag & drop or click to browse</div>
                  <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>CSV, XLSX, or XLS · max 10 MB · max 10,000 rows</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
          </div>

          {error && <Alert type="error">{error}</Alert>}

          {result && (
            <div style={{ marginBottom: 16 }}>
              {result.inserted > 0 && (
                <Alert type="success">
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle2 size={15} strokeWidth={STROKE} />
                    {result.inserted} record{result.inserted !== 1 ? "s" : ""} imported successfully.
                  </span>
                </Alert>
              )}
              {result.failed > 0 && (
                <Alert type="warning">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <AlertTriangle size={15} strokeWidth={STROKE} />
                    {result.failed} row{result.failed !== 1 ? "s" : ""} could not be imported.
                  </div>
                  {result.errors?.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, paddingLeft: 6 }}>Row {e.row}: {e.error}</div>
                  ))}
                  {result.errors?.length > 5 && <div style={{ fontSize: 12, paddingLeft: 6 }}>…and {result.errors.length - 5} more</div>}
                </Alert>
              )}
              {result.unknownHeaders?.length > 0 && (
                <Alert type="info">
                  Unrecognised columns (skipped): {result.unknownHeaders.join(", ")}
                </Alert>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ ...btnBase, background: "#f1f5f9", color: color.text }}>
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                onClick={handleImport}
                disabled={!file || importing}
                style={{ ...btnBase, background: color.primary, color: "#fff", opacity: (!file || importing) ? 0.55 : 1 }}
              >
                <Upload size={14} strokeWidth={STROKE} />
                {importing ? "Importing…" : "Import"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
