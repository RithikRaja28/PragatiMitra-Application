import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";
import { useApi } from "../../hooks/useApi";
import { S as FS } from "./formUtils";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const S = {
  ...FS,
  btnDanger: {
    padding: "8px 16px", borderRadius: 9, border: "1.5px solid #fecaca",
    background: "#fef2f2", fontSize: 13, fontWeight: 600,
    color: "#dc2626", cursor: "pointer", flexShrink: 0,
  },
};

/* ─── Step indicator ─────────────────────────────────────────────── */
function StepBar({ current }) {
  const steps = ["Configure", "Map Fields", "Preview & Import"];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
      {steps.map((label, idx) => {
        const n = idx + 1; const active = current === n; const done = current > n;
        const bg = done ? "#10b981" : active ? "#2563eb" : "#e2e8f0";
        const fg = done || active ? "#fff" : "#94a3b8";
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, transition: "background .2s" }}>
                {done ? "✓" : n}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? "#2563eb" : done ? "#10b981" : "#94a3b8", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "#10b981" : "#e2e8f0", margin: "0 10px", marginBottom: 18, transition: "background .2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Inline alert ───────────────────────────────────────────────── */
function Alert({ type, children }) {
  const styles = {
    error:   { bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
    warning: { bg: "#fffbeb", border: "#fde68a", color: "#d97706" },
    info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{ background: s.bg, border: `1.5px solid ${s.border}`, color: s.color, borderRadius: 9, padding: "10px 14px", fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
      {children}
    </div>
  );
}

/* ─── Error Details Modal ────────────────────────────────────────── */
function ErrorDetailsModal({ errors, onClose }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(errors.length / PAGE_SIZE);
  const pageErrors = errors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 680, padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.28)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Skipped Rows — Details</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {errors.length} row{errors.length !== 1 ? "s" : ""} will be skipped due to validation errors
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "left", textTransform: "uppercase", width: 60 }}>Row</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "left", textTransform: "uppercase", width: 160 }}>Field</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "left", textTransform: "uppercase" }}>Issue</th>
              </tr>
            </thead>
            <tbody>
              {pageErrors.map((entry, ei) =>
                entry.errors.map((e, fi) => (
                  <tr key={`${ei}-${fi}`} style={{ borderTop: "1px solid #f1f5f9", background: fi === 0 ? "#fff" : "#fafafa" }}>
                    {fi === 0 && (
                      <td rowSpan={entry.errors.length} style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#2563eb", verticalAlign: "top" }}>
                        {entry.row}
                      </td>
                    )}
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#475569", fontWeight: 600 }}>
                      {e.field.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#dc2626" }}>{e.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {totalPages > 1 ? `Page ${page + 1} of ${totalPages}` : `${errors.length} row${errors.length !== 1 ? "s" : ""}`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {totalPages > 1 && (
              <>
                <button style={S.btnGhost} disabled={page === 0}             onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <button style={S.btnGhost} disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </>
            )}
            <button style={S.btnPrimary(false)} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── STEP 1: Configure ──────────────────────────────────────────── */
function Step1Configure({ file, settings, onFileChange, onSettingsChange, onNext, onDownloadSample, extraSettingsSlot }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) onFileChange(f);
  };
  const formatSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Upload File</h3>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong>, <strong>.xls</strong> — Max 25 MB
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? "#2563eb" : file ? "#10b981" : "#cbd5e1"}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", background: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#fafafa", cursor: "pointer", transition: "all .2s", marginBottom: 20 }}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
          onChange={(e) => e.target.files[0] && onFileChange(e.target.files[0])} />
        {file ? (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{file.name}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{formatSize(file.size)}</div>
            <div style={{ fontSize: 12, color: "#10b981", marginTop: 6, fontWeight: 600 }}>✓ File selected — click to change</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Drag & drop your file here</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>or click to browse</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        <button style={{ ...S.btnGhost, fontSize: 12 }} onClick={() => onDownloadSample("csv")}>↓ Sample CSV</button>
        <button style={{ ...S.btnGhost, fontSize: 12 }} onClick={() => onDownloadSample("xlsx")}>↓ Sample Excel (with dropdowns)</button>
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "20px 20px 16px", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Import Settings</div>

        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Duplicate Handling</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { value: "skip",      label: "Skip Duplicates",          desc: "Existing records will not be updated" },
              { value: "overwrite", label: "Overwrite Existing",       desc: "Update matching records" },
              { value: "new",       label: "Add as New",               desc: "Insert even if record already exists" },
            ].map(({ value, label, desc }) => (
              <label key={value} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="radio" name="dupHandling" value={value}
                  checked={settings.duplicateHandling === value}
                  onChange={() => onSettingsChange("duplicateHandling", value)}
                  style={{ marginTop: 2 }} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{label}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: extraSettingsSlot ? 16 : 0 }}>
          <div>
            <label style={S.label}>Character Encoding</label>
            <select style={S.select()} value={settings.encoding} onChange={(e) => onSettingsChange("encoding", e.target.value)}>
              <option value="UTF-8">UTF-8 (default)</option>
              <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
              <option value="Windows-1252">Windows-1252</option>
            </select>
          </div>
          <div>
            <label style={S.label}>CSV Delimiter</label>
            <select style={S.select()} value={settings.delimiter} onChange={(e) => onSettingsChange("delimiter", e.target.value)}>
              <option value=",">Comma ( , )</option>
              <option value=";">Semicolon ( ; )</option>
              <option value="\t">Tab</option>
            </select>
          </div>
        </div>

        {/* Entity-specific extra settings injected by parent */}
        {extraSettingsSlot}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button style={S.btnPrimary(!file)} disabled={!file} onClick={onNext}>
          Next: Map Fields →
        </button>
      </div>
    </div>
  );
}

/* ─── STEP 2: Map Fields ─────────────────────────────────────────── */
function Step2MapFields({ systemFields, fileColumns, mapping, onMappingChange, onNext, onBack, parseError, validating }) {
  const unmappedRequired = systemFields.filter((f) => f.required && !mapping[f.key]);
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Map Fields</h3>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Match your file's columns to system fields. Required fields must be mapped.
      </p>

      {parseError && <Alert type="error">{parseError}</Alert>}

      {unmappedRequired.length > 0 && (
        <Alert type="warning">
          Required field{unmappedRequired.length > 1 ? "s" : ""}{" "}
          <strong>{unmappedRequired.map((f) => f.label).join(", ")}</strong>{" "}
          {unmappedRequired.length > 1 ? "are" : "is"} not mapped yet.
        </Alert>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f8fafc", borderRadius: "10px 10px 0 0", border: "1px solid #e2e8f0", borderBottom: "none", padding: "10px 16px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7 }}>System Field</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7 }}>Your File Column</span>
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
        {systemFields.map((field, idx) => {
          const mapped = !!mapping[field.key];
          const isLast = idx === systemFields.length - 1;
          return (
            <div key={field.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "12px 16px", alignItems: "center", borderBottom: isLast ? "none" : "1px solid #f1f5f9", background: mapped ? "#fff" : field.required ? "#fffbeb" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{field.label}</span>
                {field.required
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "1px 7px", borderRadius: 20 }}>Required</span>
                  : <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", padding: "1px 7px", borderRadius: 20 }}>Optional</span>
                }
              </div>
              <div style={{ paddingRight: 8 }}>
                <select
                  style={{ ...S.select(!mapped && field.required), fontSize: 12, color: mapping[field.key] ? "#1e293b" : "#94a3b8" }}
                  value={mapping[field.key] || ""}
                  onChange={(e) => onMappingChange(field.key, e.target.value)}
                >
                  <option value="">— Not mapped —</option>
                  {fileColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <Alert type="info">Fields auto-mapped using alias matching. You can override any mapping using the dropdowns above.</Alert>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button style={S.btnGhost} onClick={onBack} disabled={validating}>← Previous</button>
        <button style={S.btnPrimary(unmappedRequired.length > 0 || validating)} disabled={unmappedRequired.length > 0 || validating} onClick={onNext}>
          {validating ? "Validating…" : "Next: Preview & Import →"}
        </button>
      </div>
    </div>
  );
}

/* ─── STEP 3: Preview & Import ───────────────────────────────────── */
function Step3Preview({ entityLabel, systemFields, mapping, parsedData, validationResult, onBack, onImport, importing, importProgress, importResult }) {
  const [showErrors, setShowErrors] = useState(false);

  if (importResult) {
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{importResult.failed === 0 ? "🎉" : "⚠️"}</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
            Import {importResult.failed === 0 ? "Complete!" : "Finished with some errors"}
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total",    value: importResult.total,    color: "#2563eb", bg: "#eff6ff" },
            { label: "Imported", value: importResult.imported, color: "#10b981", bg: "#f0fdf4" },
            { label: "Skipped",  value: importResult.skipped,  color: "#f59e0b", bg: "#fffbeb" },
            { label: "Failed",   value: importResult.failed,   color: "#dc2626", bg: "#fef2f2" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        {importResult.errors?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 10 }}>Failed Rows ({importResult.errors.length})</div>
            <div style={{ background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca", maxHeight: 200, overflowY: "auto", padding: 12 }}>
              {importResult.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "#7f1d1d", padding: "3px 0", borderBottom: i < importResult.errors.length - 1 ? "1px solid #fecaca" : "none" }}>
                  <strong>Row {e.row}:</strong> {e.error}
                </div>
              ))}
            </div>
          </div>
        )}
        <Alert type={importResult.failed === 0 ? "success" : "info"}>
          {importResult.imported > 0 ? `${importResult.imported} ${entityLabel.toLowerCase()} successfully imported.` : "No records were imported."}
          {importResult.skipped > 0 ? ` ${importResult.skipped} skipped (duplicates).` : ""}
        </Alert>
      </div>
    );
  }

  const previewCols = systemFields.filter((f) => mapping[f.key]).map((f) => ({ key: f.key, label: f.label, col: mapping[f.key] }));

  const stats = validationResult
    ? { total: validationResult.total, ready: validationResult.ready, skipped: validationResult.skipped, unmapped: validationResult.unmappedRequired }
    : { total: parsedData.totalRows, ready: parsedData.totalRows, skipped: 0, unmapped: systemFields.filter((f) => !mapping[f.key]).length };

  const errorRows = validationResult?.errors || [];

  return (
    <div>
      {showErrors && errorRows.length > 0 && <ErrorDetailsModal errors={errorRows} onClose={() => setShowErrors(false)} />}

      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Preview & Import</h3>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Review the import summary and first 5 rows, then click Import.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total Rows",        value: stats.total,   color: "#2563eb", bg: "#eff6ff" },
          { label: "Ready to Import",   value: stats.ready,   color: "#10b981", bg: "#f0fdf4" },
          { label: "Will Be Skipped",   value: stats.skipped, color: "#f59e0b", bg: "#fffbeb" },
          { label: "Unmapped Required", value: stats.unmapped, color: stats.unmapped > 0 ? "#dc2626" : "#10b981", bg: stats.unmapped > 0 ? "#fef2f2" : "#f0fdf4" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {errorRows.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <Alert type="warning">
              <strong>{errorRows.length} row{errorRows.length !== 1 ? "s" : ""}</strong> will be skipped due to validation errors.
            </Alert>
          </div>
          <button style={S.btnDanger} onClick={() => setShowErrors(true)}>View Details</button>
        </div>
      )}

      {stats.ready === 0 && <Alert type="error">No valid rows found. Please go back and fix your field mapping.</Alert>}

      {previewCols.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 10 }}>
            Preview (first {Math.min(5, parsedData.preview.length)} rows)
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", maxHeight: 260 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "left", textTransform: "uppercase" }}>#</th>
                  {previewCols.map(({ key, label }) => (
                    <th key={key} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.preview.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: ri < parsedData.preview.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "#94a3b8" }}>{ri + 1}</td>
                    {previewCols.map(({ key, col }) => (
                      <td key={key} style={{ padding: "9px 14px", fontSize: 12, color: "#1e293b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Real-time progress bar — visible only while the SSE stream is active */}
      {importing && (
        <div style={{ marginBottom: 8, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>
              {importProgress.total > 0 ? "Importing records…" : "Preparing…"}
            </span>
            {importProgress.total > 0 && (
              <span style={{ fontWeight: 700, color: "#2563eb" }}>
                {importProgress.done.toLocaleString()} / {importProgress.total.toLocaleString()}
                {" "}({Math.round((importProgress.done / importProgress.total) * 100)}%)
              </span>
            )}
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 999, height: 8, overflow: "hidden" }}>
            <div style={{
              background: "linear-gradient(90deg,#2563eb,#3b82f6)",
              height: "100%",
              borderRadius: 999,
              width: importProgress.total > 0
                ? `${Math.round((importProgress.done / importProgress.total) * 100)}%`
                : "0%",
              transition: "width 0.35s ease",
            }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <button style={S.btnGhost} onClick={onBack} disabled={importing}>← Previous</button>
        <button style={S.btnPrimary(importing || stats.ready === 0)} disabled={importing || stats.ready === 0} onClick={onImport}>
          {importing
            ? importProgress.total > 0
              ? `Importing… ${Math.round((importProgress.done / importProgress.total) * 100)}%`
              : "Preparing…"
            : `Import ${stats.ready} ${entityLabel}`
          }
        </button>
      </div>
    </div>
  );
}

/* ─── Main ImportWizard — generic, full-page ─────────────────────── */
/*
 * Props:
 *   apiPath       — e.g. "/api/users" or "/api/institutions"
 *   entityLabel   — e.g. "Users" or "Institutions"
 *   entityIcon    — emoji for the card header (default "📥")
 *   extraSettingsSlot — optional React node rendered inside the settings box
 *   extraImportBody   — optional object merged into the execute POST body
 *   onBack        — navigate back to the list
 *   onSuccess     — called after successful import with the result object
 */
export default function ImportWizard({
  apiPath      = "/api/users",
  entityLabel  = "Records",
  entityIcon   = "📥",
  extraSettingsSlot = null,
  extraImportBody   = {},
  onBack,
  onSuccess,
}) {
  const { accessToken } = useAuth();
  const { apiFetch }    = useApi();

  const [step,             setStep]             = useState(1);
  const [file,             setFile]             = useState(null);
  const [settings,         setSettings]         = useState({ duplicateHandling: "skip", encoding: "UTF-8", delimiter: "," });
  const [systemFields,     setSystemFields]     = useState([]);
  const [fileColumns,      setFileColumns]      = useState([]);
  const [parsedData,       setParsedData]       = useState(null);
  const [mapping,          setMapping]          = useState({});
  const [parseLoading,     setParseLoading]     = useState(false);
  const [parseError,       setParseError]       = useState("");
  const [validating,       setValidating]       = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validateError,    setValidateError]    = useState("");
  const [importing,        setImporting]        = useState(false);
  const [importProgress,   setImportProgress]   = useState({ done: 0, total: 0 });
  const [importResult,     setImportResult]     = useState(null);
  const [importError,      setImportError]      = useState("");

  useEffect(() => {
    apiFetch(`${apiPath}/import/schema`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setSystemFields(d.fields); })
      .catch(() => {});
  }, [apiFetch, apiPath]);

  const handleSettingsChange = useCallback((key, value) => setSettings((s) => ({ ...s, [key]: value })), []);
  const handleMappingChange  = useCallback((k, v) => setMapping((m) => ({ ...m, [k]: v })), []);

  /* Step 1 → 2: parse file */
  const handleStep1Next = async () => {
    if (!file) return;
    setParseLoading(true); setParseError("");
    try {
      const fd = new FormData();
      fd.append("file",      file);
      fd.append("encoding",  settings.encoding);
      fd.append("delimiter", settings.delimiter);
      const res  = await fetch(`${API_BASE}${apiPath}/import/parse`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: fd,
      });
      const data = await res.json();
      if (!data.success) { setParseError(data.message || "Failed to parse file."); return; }
      setParsedData(data); setFileColumns(data.columns);
      setMapping(data.autoMapping || {}); setValidationResult(null);
      setStep(2);
    } catch { setParseError("Network error while parsing file. Please try again."); }
    finally   { setParseLoading(false); }
  };

  /* Step 2 → 3: server-side validation */
  const handleStep2Next = async () => {
    if (!parsedData?.rows) return;
    setValidating(true); setValidateError("");
    try {
      const res  = await apiFetch(`${apiPath}/import/validate`, {
        method: "POST",
        body: JSON.stringify({ mapping, data: parsedData.rows, ...extraImportBody }),
      });
      const data = await res.json();
      if (data.success) { setValidationResult(data); setStep(3); }
      else setValidateError(data.message || "Validation failed.");
    } catch { setValidateError("Network error during validation. Please try again."); }
    finally   { setValidating(false); }
  };

  /* Sample file download */
  const handleDownloadSample = async (format) => {
    try {
      const res  = await apiFetch(`${apiPath}/export/sample?format=${format}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `import_sample.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  /* Execute import — streams SSE progress from the server */
  const handleImport = async () => {
    if (!parsedData?.rows) return;
    setImporting(true);
    setImportError("");
    setImportProgress({ done: 0, total: 0 });

    try {
      const res = await fetch(`${API_BASE}${apiPath}/import/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({
          mapping,
          data:              parsedData.rows,
          duplicateHandling: settings.duplicateHandling,
          ...extraImportBody,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setImportError(errData.message || "Import failed.");
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        /* SSE messages are separated by \n\n */
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop(); // keep incomplete trailing chunk

        for (const chunk of chunks) {
          const match = chunk.match(/^data: (.+)/m);
          if (!match) continue;
          try {
            const event = JSON.parse(match[1]);
            if (event.complete) {
              setImportResult(event);
              if (event.imported > 0 && onSuccess) onSuccess(event);
            } else if (event.error) {
              setImportError(event.message || "Import failed.");
            } else if (event.phase === "importing") {
              setImportProgress({ done: event.done, total: event.total });
            }
          } catch (_) {}
        }
      }
    } catch {
      setImportError("Network error during import. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  /* ── Page layout (same structure as FormScreen) ───────────────── */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {/* Back nav */}
      <button
        type="button" onClick={onBack} disabled={importing}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#2563eb", cursor: importing ? "not-allowed" : "pointer", padding: 0, marginBottom: 24, opacity: importing ? 0.5 : 1 }}
      >
        ← Back to {entityLabel}
      </button>

      {/* Wizard card */}
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {/* Card header */}
        <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {entityIcon}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Import {entityLabel}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>Upload CSV or Excel file to bulk-create {entityLabel.toLowerCase()}</div>
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: "28px 28px 32px" }}>
          <StepBar current={step} />

          {/* Parsing spinner */}
          {parseLoading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontSize: 13 }}>
              <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
              Parsing file…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && !parseLoading && (
            <Step1Configure
              file={file}
              settings={settings}
              extraSettingsSlot={extraSettingsSlot}
              onFileChange={(f) => { setFile(f); setParsedData(null); setParseError(""); setValidationResult(null); }}
              onSettingsChange={handleSettingsChange}
              onNext={handleStep1Next}
              onDownloadSample={handleDownloadSample}
            />
          )}

          {/* Step 2 */}
          {step === 2 && !parseLoading && (
            <>
              {validateError && <div style={{ marginBottom: 12 }}><Alert type="error">{validateError}</Alert></div>}
              <Step2MapFields
                systemFields={systemFields}
                fileColumns={fileColumns}
                mapping={mapping}
                parseError={parseError}
                validating={validating}
                onMappingChange={handleMappingChange}
                onBack={() => setStep(1)}
                onNext={handleStep2Next}
              />
            </>
          )}

          {/* Step 3 */}
          {step === 3 && !parseLoading && (
            <>
              {importError && <div style={{ marginBottom: 12 }}><Alert type="error">{importError}</Alert></div>}
              <Step3Preview
                entityLabel={entityLabel}
                systemFields={systemFields}
                mapping={mapping}
                parsedData={parsedData}
                validationResult={validationResult}
                onBack={() => setStep(2)}
                onImport={handleImport}
                importing={importing}
                importProgress={importProgress}
                importResult={importResult}
              />
              {importResult && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, borderTop: "1px solid #f1f5f9", paddingTop: 20 }}>
                  <button style={S.btnGhost} onClick={onBack}>← Back to {entityLabel}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}