/**
 * BlockEditors.jsx -- shared block editor components
 */
import React, { useRef, useEffect, useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Settings } from "lucide-react";
import { useApi } from "../../../../hooks/useApi";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { useCompressionSettings } from "../../../../hooks/useCompressionSettings";
import { Toast } from "../../../../components/shared/formUtils";

function cfgTitle(cfg, lang) {
  return (lang === "hi" && cfg?.title_hi) ? cfg.title_hi : (cfg?.title || "KPI Chart");
}

export const BLOCK_ICONS = {
  PARAGRAPH:  "P",
  HEADING:    "H",
  IMAGE:      "Img",
  TABLE:      "Tbl",
  LIST:       "Lst",
  DIVIDER:    "--",
  FILE:       "Fil",
  KPI:        "KPI",
  IMAGE_GRID: "Grd",
};

export const ADD_BTN_STYLE = {
  padding: "5px 12px", border: "1px dashed #cbd5e1", borderRadius: 6,
  background: "none", fontSize: 12, color: "#64748b", cursor: "pointer",
};

/* ── Toolbar primitives ─────────────────────────────────────────────────── */
function TBtn({ onClick, title, children, style, active }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      style={{
        border: "none",
        background: active ? "#dde4ff" : "transparent",
        color: active ? "#1d4ed8" : "#374151",
        borderRadius: 4, padding: "3px 6px", fontSize: 13,
        cursor: "pointer", fontFamily: "inherit", fontWeight: 600, lineHeight: 1.3,
        transition: "background 0.1s",
        ...style,
      }}
    >{children}</button>
  );
}

function Sep() {
  return (
    <span style={{
      display: "inline-block", width: 1, height: 16,
      background: "#d1d5db", margin: "0 3px", verticalAlign: "middle", flexShrink: 0,
    }} />
  );
}

const selectSt = {
  fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 4,
  padding: "3px 5px", color: "#374151", background: "#fff",
  cursor: "pointer", outline: "none", height: 24,
};

/* ── Translate-from-English button (bilingual text block editors) ─────────
   getSource() returns either a string or a string[] (batch). onTranslated
   receives the matching shape back (string or string[]).
   isHtml=true — sends { html } to backend so all tags/styles are preserved. */
function TranslateButton({ apiFetch, getSource, onTranslated, label = "Translate from English", isHtml = false }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  async function run() {
    setErr("");
    const source = getSource();
    const isBatch = Array.isArray(source);
    if (isBatch ? !source.some((s) => s && s.trim()) : !source || !source.trim()) return;
    setBusy(true);
    try {
      const body = isBatch ? { texts: source } : isHtml ? { html: source } : { text: source };
      const res  = await apiFetch("/api/report-integration/translate", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Translation failed");
      onTranslated(isBatch ? data.data.translations : data.data.hi);
    } catch (ex) {
      setErr(ex.message || "Translation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <button
        type="button"
        onClick={run}
        disabled={busy || !apiFetch}
        style={{
          padding: "4px 10px", border: "1px solid #c4b5fd", borderRadius: 6,
          background: busy ? "#f5f3ff" : "#faf5ff", color: "#7c3aed",
          fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        }}
      >
        {busy ? "Translating…" : label}
      </button>
      {err && <div style={{ fontSize: 10, color: "#b91c1c" }}>{err}</div>}
    </div>
  );
}

/* ── Image upload helper ──────────────────────────────────────────────── */
async function uploadImageFile(file, apiFetch, purpose, compressionSettings, scope = {}) {
  if (!file) throw new Error("No file selected");
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "image/svg+xml"];
  if (!ALLOWED.includes(file.type)) throw new Error("Only JPEG, PNG, WebP, GIF, BMP, TIFF and SVG images are allowed");

  if (compressionSettings) {
    const sizeKB = file.size / 1024;
    const minKB  = Number(compressionSettings.image_min_kb);
    const maxKB  = Number(compressionSettings.image_max_kb);
    if (sizeKB < minKB || sizeKB > maxKB) {
      throw new Error(`Uploaded image size: ${Math.round(sizeKB)} KB. Allowed size: ${minKB} KB – ${maxKB} KB.`);
    }
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", purpose || "report-image");
  if (scope.reportId) fd.append("reportId", scope.reportId);
  if (scope.templateId) fd.append("templateId", scope.templateId);

  const uploadRes = await apiFetch("/api/upload/image", { method: "POST", body: fd });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.error || "Upload failed");
  return uploadData.publicUrl;
}

function UploadImageBtn({ onUploaded, apiFetch, purpose, disabled, reportId, templateId }) {
  const fileRef  = useRef(null);
  const [uploading,    setUploading]    = useState(false);
  const [err,          setErr]          = useState("");
  const [uploadResult, setUploadResult] = useState(null); // null | "success" | "error"
  const [toast,        setToast]        = useState(null);
  const { settings: compressionSettings } = useCompressionSettings();

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(""); setUploadResult(null);
    try {
      const url = await uploadImageFile(file, apiFetch, purpose, compressionSettings, { reportId, templateId });
      onUploaded({ url, fileName: file.name });
      setUploadResult("success");
      showToast("Upload Successful");
      setTimeout(() => setUploadResult(null), 2500);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
      setUploadResult("error");
      showToast("Upload Failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleChange} />

      {uploadResult === "success" ? (
        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Uploaded Successfully</div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || disabled}
          style={{ padding: "5px 11px", border: "1px solid #e2e8f0", borderRadius: 7, background: uploading ? "#f1f5f9" : "#fff", fontSize: 11, cursor: uploading || disabled ? "not-allowed" : "pointer", color: "#475569", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      )}

      <div style={{ fontSize: 10, color: "#94a3b8" }}>
        Images (JPG, JPEG, PNG): {Number(compressionSettings.image_min_kb)} KB – {Number(compressionSettings.image_max_kb)} KB
      </div>

      {uploadResult === "error" && err && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, maxWidth: 240 }}>
          <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>{err}</div>
          <button
            type="button"
            onClick={() => { setErr(""); setUploadResult(null); fileRef.current?.click(); }}
            style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", background: "none", border: "1px solid #f87171", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}
          >
            ↩ Click to Upload Again
          </button>
        </div>
      )}
    </div>
  );
}

async function uploadDocumentFile(file, apiFetch, scope = {}) {
  if (!file) throw new Error("No file selected");
  const ALLOWED = [
    "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg", "image/png", "image/webp"
  ];
  if (!ALLOWED.includes(file.type)) throw new Error("File type not allowed");

  const fd = new FormData();
  fd.append("file", file);

  if (scope.templateId) {
    fd.append("templateId", scope.templateId);
    const res = await apiFetch("/api/upload/template-file", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
    return data.publicUrl;
  } else if (scope.reportId) {
    fd.append("context", "report_submission");
    fd.append("reportId", scope.reportId);
    const res = await apiFetch("/api/upload/document", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
    return data.fileKey;
  } else {
    throw new Error("Missing scope for upload");
  }
}

function UploadFileBtn({ onUploaded, apiFetch, disabled, reportId, templateId }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(""); setUploadResult(null);
    try {
      const url = await uploadDocumentFile(file, apiFetch, { reportId, templateId });
      onUploaded({ url, name: file.name });
      setUploadResult("success");
      showToast("Upload Successful");
      setTimeout(() => setUploadResult(null), 2500);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
      setUploadResult("error");
      showToast("Upload Failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleChange} />
      {uploadResult === "success" ? (
        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Uploaded</div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || disabled}
          style={{ padding: "5px 11px", border: "1px solid #e2e8f0", borderRadius: 7, background: uploading ? "#f1f5f9" : "#fff", fontSize: 11, cursor: uploading || disabled ? "not-allowed" : "pointer", color: "#475569", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          {uploading ? "Uploading..." : "Upload File"}
        </button>
      )}
      {uploadResult === "error" && err && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, maxWidth: 200 }}>
          <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>{err}</div>
          <button type="button" onClick={() => { setErr(""); setUploadResult(null); fileRef.current?.click(); }} style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RICH TEXT PARAGRAPH BLOCK  —  Word-like editor
══════════════════════════════════════════════════════════════════ */
export function RichTextBlock({ content, onChange, readOnly, lang = "en", apiFetch, translations, onSaveTranslation }) {
  const editorRef = useRef(null);
  const savedSel  = useRef(null);
  const isHi      = lang === "hi";
  const hiHtml    = translations?.hi?.html || "";
  const [linkUrl, setLinkUrl] = useState(null); // null = closed, "" or string = modal open
  const [rtMsg,   setRtMsg]   = useState("");    // transient inline hint

  // Resync the contentEditable DOM whenever the active language's field changes
  // externally (initial mount, language toggle, or a translate-button update) —
  // but skip when it already matches (i.e. the user is mid-edit).
  useEffect(() => {
    if (!editorRef.current) return;
    const incoming = isHi ? hiHtml : (content.html || content.text || "");
    if (editorRef.current.innerHTML !== incoming) editorRef.current.innerHTML = incoming;
  }, [lang, content.html, hiHtml]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode))
      savedSel.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    if (!savedSel.current || !editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(savedSel.current); }
  };

  const save = () => {
    if (!editorRef.current) return;
    if (isHi) onSaveTranslation?.("hi", { html: editorRef.current.innerHTML });
    else onChange({ ...content, html: editorRef.current.innerHTML });
  };

  /* execCommand-based formatting — always save after */
  const exec = (cmd, val) => {
    restoreSelection();
    document.execCommand(cmd, false, val === undefined ? null : val);
    saveSelection();
    save();
  };

  /* Span-based inline style (for font family, size, bg color) */
  const applySpanStyle = (prop, val) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const frag = range.extractContents();
    const span = document.createElement("span");
    span.style[prop] = val;
    span.appendChild(frag);
    range.insertNode(span);
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.removeAllRanges(); sel.addRange(nr);
    savedSel.current = nr.cloneRange();
    save();
  };

  const applyColor = (color) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) { document.execCommand("foreColor", false, color); save(); return; }
    applySpanStyle("color", color);
  };

  const insertLink = () => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setRtMsg("Select text first, then click Link.");
      setTimeout(() => setRtMsg(""), 2500);
      return;
    }
    saveSelection();           // keep the highlighted range while the modal is open
    setLinkUrl("https://");
  };
  const applyLink = () => {
    const url = (linkUrl || "").trim();
    setLinkUrl(null);
    if (url && url !== "https://") {
      editorRef.current?.focus();   // execCommand needs the editor focused
      restoreSelection();
      exec("createLink", url);
    }
  };

  if (readOnly) {
    const html = isHi ? hiHtml : (content.html || content.text || "");
    return (
      <div
        className="rtb-reader"
        style={{ lineHeight: 1.8, color: "#111827", wordBreak: "break-word", fontSize: 13, fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
        dangerouslySetInnerHTML={{ __html: html || "<em style='color:#9ca3af'>Empty paragraph</em>" }}
      />
    );
  }

  const TB_SEL = { ...selectSt };
  const isStale = !!translations?.hi?._stale;
  const needsTranslation = isHi && (!hiHtml || isStale) && (content.html || content.text);

  return (
    <div>
      {rtMsg && (
        <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 600, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "5px 10px" }}>{rtMsg}</div>
      )}
      {linkUrl !== null && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setLinkUrl(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>Insert link</div>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkUrl(null); }}
              placeholder="https://example.com"
              style={{ width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setLinkUrl(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={applyLink} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Insert</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .rtb-editor ul  { list-style-type: disc;    margin: 4px 0 8px 0; padding-left: 28px; }
        .rtb-editor ol  { list-style-type: decimal; margin: 4px 0 8px 0; padding-left: 28px; }
        .rtb-editor li  { margin-bottom: 2px; padding-left: 2px; }
        .rtb-editor a   { color: #2563eb; text-decoration: underline; }
        .rtb-editor blockquote { border-left: 3px solid #c7d2fe; margin: 6px 0; padding: 4px 12px; color: #4b5563; }
        .rtb-reader ul  { list-style-type: disc;    padding-left: 24px; margin: 4px 0 8px 0; }
        .rtb-reader ol  { list-style-type: decimal; padding-left: 24px; margin: 4px 0 8px 0; }
        .rtb-reader li  { margin-bottom: 2px; }
        .rtb-reader a   { color: #2563eb; text-decoration: underline; }
      `}</style>

      {/* ══ TOOLBAR ══ */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1,
        padding: "5px 8px",
        background: "linear-gradient(to bottom, #f8fafc, #f1f5f9)",
        border: "1px solid #d1d5db", borderRadius: "8px 8px 0 0",
        borderBottom: "1px solid #e5e7eb",
        userSelect: "none",
      }}>

        {/* ─ Undo / Redo ─ */}
        <TBtn onClick={() => exec("undo")} title="Undo (Ctrl+Z)">↶</TBtn>
        <TBtn onClick={() => exec("redo")} title="Redo (Ctrl+Y)">↷</TBtn>
        <Sep />

        {/* ─ Font family ─ */}
        <select
          title="Font family — select text first"
          style={{ ...TB_SEL, width: 108 }}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => { applySpanStyle("fontFamily", e.target.value); e.target.value = ""; }}
        >
          <option value="" disabled>Font</option>
          <option value="Calibri, sans-serif">Calibri</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="Tahoma, sans-serif">Tahoma</option>
        </select>

        {/* ─ Font size ─ */}
        <select
          title="Font size — select text first"
          style={{ ...TB_SEL, width: 58 }}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => { applySpanStyle("fontSize", e.target.value); e.target.value = ""; }}
        >
          <option value="" disabled>Size</option>
          {["8pt","9pt","10pt","11pt","12pt","13pt","14pt","16pt","18pt","20pt","24pt","28pt","36pt"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Sep />

        {/* ─ Inline format ─ */}
        <TBtn onClick={() => exec("bold")}          title="Bold (Ctrl+B)"       style={{ fontWeight: 800, fontFamily: "Georgia,serif", fontSize: 14 }}>B</TBtn>
        <TBtn onClick={() => exec("italic")}        title="Italic (Ctrl+I)"     style={{ fontStyle: "italic", fontFamily: "Georgia,serif", fontSize: 14 }}>I</TBtn>
        <TBtn onClick={() => exec("underline")}     title="Underline (Ctrl+U)"  style={{ textDecoration: "underline", fontSize: 14 }}>U</TBtn>
        <TBtn onClick={() => exec("strikeThrough")} title="Strikethrough"       style={{ textDecoration: "line-through", fontSize: 14 }}>S</TBtn>
        <TBtn onClick={() => exec("superscript")}   title="Superscript"         style={{ fontSize: 10 }}>x²</TBtn>
        <TBtn onClick={() => exec("subscript")}     title="Subscript"           style={{ fontSize: 10 }}>x₂</TBtn>
        <Sep />

        {/* ─ Text colour ─ */}
        <select
          title="Text colour — select text first"
          style={{ ...TB_SEL, width: 74 }}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => { applyColor(e.target.value); e.target.value = ""; }}
        >
          <option value="" disabled>Color</option>
          {[
            ["Black",   "#111827"], ["Dark Blue","#1e3a8a"], ["Blue",   "#2563eb"],
            ["Teal",    "#0f766e"], ["Green",    "#15803d"], ["Red",    "#b91c1c"],
            ["Purple",  "#7c3aed"], ["Orange",   "#c2410c"], ["Gray",   "#6b7280"],
          ].map(([l, v]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {/* ─ Highlight ─ */}
        <select
          title="Highlight — select text first"
          style={{ ...TB_SEL, width: 80 }}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => { const v = e.target.value; applySpanStyle("backgroundColor", v === "none" ? "" : v); e.target.value = ""; }}
        >
          <option value="" disabled>Highlight</option>
          <option value="none">None</option>
          {[
            ["Yellow",  "#fef08a"], ["Green",  "#bbf7d0"], ["Blue",  "#bfdbfe"],
            ["Pink",    "#fbcfe8"], ["Orange", "#fed7aa"], ["Lilac", "#e9d5ff"],
          ].map(([l, v]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Sep />

        {/* ─ Alignment ─ */}
        <TBtn onClick={() => exec("justifyLeft")}   title="Align left"   style={{ display: "inline-flex", alignItems: "center" }}><AlignLeft size={14} /></TBtn>
        <TBtn onClick={() => exec("justifyCenter")} title="Center"       style={{ display: "inline-flex", alignItems: "center" }}><AlignCenter size={14} /></TBtn>
        <TBtn onClick={() => exec("justifyRight")}  title="Align right"  style={{ display: "inline-flex", alignItems: "center" }}><AlignRight size={14} /></TBtn>
        <TBtn onClick={() => exec("justifyFull")}   title="Justify"      style={{ display: "inline-flex", alignItems: "center" }}><AlignJustify size={14} /></TBtn>
        <Sep />

        {/* ─ Lists ─ */}
        <TBtn onClick={() => exec("insertUnorderedList")} title="Bullet list">• ≡</TBtn>
        <TBtn onClick={() => exec("insertOrderedList")}   title="Numbered list">1 ≡</TBtn>
        <Sep />

        {/* ─ Indent ─ */}
        <TBtn onClick={() => exec("outdent")} title="Decrease indent" style={{ fontSize: 12 }}>⇤</TBtn>
        <TBtn onClick={() => exec("indent")}  title="Increase indent" style={{ fontSize: 12 }}>⇥</TBtn>
        <Sep />

        {/* ─ Link ─ */}
        <TBtn onClick={insertLink}           title="Insert link"  style={{ lineHeight: 0 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></TBtn>
        <TBtn onClick={() => exec("unlink")} title="Remove link" style={{ lineHeight: 0, color: "#9ca3af" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="4" y1="4" x2="20" y2="20"/></svg></TBtn>
        <Sep />

        {/* ─ Clear ─ */}
        <TBtn onClick={() => exec("removeFormat")} title="Clear all formatting" style={{ fontSize: 10, color: "#9ca3af" }}>Clr</TBtn>
      </div>

      {isHi && (content.html || content.text) && (
        <div style={{ padding: "6px 10px", background: isStale ? "#fffbeb" : "#faf5ff", border: `1px solid ${isStale ? "#fcd34d" : "#e9d5ff"}`, borderTop: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: isStale ? "#b45309" : "#7c3aed" }}>
            {isStale ? "Hindi may be outdated —" : hiHtml ? "Re-translate to fix formatting —" : "No Hindi content yet —"}
          </span>
          <TranslateButton
            apiFetch={apiFetch}
            isHtml
            label={hiHtml ? "Re-translate from English" : "Translate from English"}
            getSource={() => content.html || content.text || ""}
            onTranslated={(hi) => onSaveTranslation?.("hi", { html: hi, _stale: false })}
          />
        </div>
      )}

      {/* ══ EDITOR AREA ══ */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="rtb-editor"
        onBlur={save}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onKeyDown={(e) => {
          if (e.key === "Tab") { e.preventDefault(); exec("insertHTML", "    "); }
        }}
        style={{
          minHeight: 100, padding: "12px 14px",
          border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px",
          fontSize: 13, lineHeight: 1.85, color: "#111827",
          outline: "none", wordBreak: "break-word",
          background: "#fff",
          fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)",
        }}
      />
    </div>
  );
}

/* ── Heading ──────────────────────────────────────────────────────────── */
export function HeadingBlock({ content, onChange, readOnly, lang = "en", apiFetch, translations, onSaveTranslation }) {
  const level    = content.level || 2;
  const sizes    = { 1: 26, 2: 20, 3: 16 };
  const isHi     = lang === "hi";
  const hiText   = translations?.hi?.text || "";
  const text     = isHi ? hiText : (content.text || "");
  const isStale  = !!translations?.hi?._stale;
  const needsTranslation = !readOnly && isHi && (!hiText || isStale) && content.text;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!readOnly && (
          <select
            value={level}
            onChange={(e) => onChange({ ...content, level: Number(e.target.value) })}
            style={{ flexShrink: 0, padding: "3px 7px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, color: "#64748b", background: "#f8fafc", cursor: "pointer", outline: "none" }}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        )}
        <div
          key={isHi ? "hi" : "en"}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onBlur={(e) => {
            const val = e.currentTarget.innerText;
            if (isHi) onSaveTranslation?.("hi", { text: val });
            else onChange({ ...content, text: val });
          }}
          style={{ flex: 1, fontSize: sizes[level] || 20, fontWeight: 700, color: "#0f172a", outline: "none", borderBottom: readOnly ? "none" : "1px dashed #e2e8f0", padding: "4px 0" }}
          dangerouslySetInnerHTML={{ __html: text }}
        />
      </div>
      {needsTranslation && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          {isStale && <span style={{ fontSize: 11, color: "#b45309" }}>Hindi translation may be outdated —</span>}
          <TranslateButton
            apiFetch={apiFetch}
            getSource={() => content.text}
            onTranslated={(hi) => onSaveTranslation?.("hi", { text: hi, _stale: false })}
          />
        </div>
      )}
    </div>
  );
}

/* ── Enhanced Image Block ─────────────────────────────────────────────── */
export function ImageBlock({ content, onChange, readOnly, lang = "en", translations, onSaveTranslation, reportId, templateId }) {
  const { apiFetch } = useApi();
  const widthPct = content.widthPct ?? 100;
  const align    = content.align || "center";
  const wrapStyle = { left: { display: "flex", justifyContent: "flex-start" }, center: { display: "flex", justifyContent: "center" }, right: { display: "flex", justifyContent: "flex-end" } }[align] || { display: "flex", justifyContent: "center" };

  const isHi    = lang === "hi";
  const hiAlt   = translations?.hi?.alt     || "";
  const hiCap   = translations?.hi?.caption || "";
  const alt     = isHi ? hiAlt : (content.alt     || "");
  const caption = isHi ? hiCap : (content.caption || "");
  const isStale = !!translations?.hi?._stale;
  const needsTranslation = !readOnly && isHi && (!hiCap && !hiAlt || isStale) && (content.caption || content.alt);

  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
            <input key={content.url} defaultValue={content.fileName || content.url || ""} onBlur={(e) => onChange({ ...content, url: e.target.value })} placeholder="Paste image URL…" style={{ flex: 1, padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            <UploadImageBtn apiFetch={apiFetch} purpose="report-image" reportId={reportId} templateId={templateId} onUploaded={({ url, fileName }) => onChange({ ...content, url, fileName })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Width</span>
            <input type="range" min="10" max="100" step="5" value={widthPct} onChange={(e) => onChange({ ...content, widthPct: Number(e.target.value) })} style={{ flex: 1, minWidth: 80 }} />
            <span style={{ fontSize: 11, color: "#374151", minWidth: 34, fontWeight: 600 }}>{widthPct}%</span>
            <Sep />
            {[["left", "L"], ["center", "C"], ["right", "R"]].map(([a, icon]) => (
              <button key={a} title={"Align " + a} onMouseDown={() => onChange({ ...content, align: a })}
                style={{ border: "1px solid", borderRadius: 5, padding: "2px 7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: align === a ? "#dbeafe" : "#f9fafb", borderColor: align === a ? "#93c5fd" : "#e2e8f0", color: align === a ? "#1d4ed8" : "#6b7280" }}>
                {icon}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            <input
              key={"alt-" + (isHi ? "hi" : "en") + "-" + alt}
              defaultValue={alt}
              onBlur={(e) => isHi ? onSaveTranslation?.("hi", { alt: e.target.value }) : onChange({ ...content, alt: e.target.value })}
              placeholder="Alt text…"
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, outline: "none" }}
            />
            <input
              key={"cap-" + (isHi ? "hi" : "en") + "-" + caption}
              defaultValue={caption}
              onBlur={(e) => isHi ? onSaveTranslation?.("hi", { caption: e.target.value }) : onChange({ ...content, caption: e.target.value })}
              placeholder="Caption…"
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, outline: "none", color: "#64748b" }}
            />
          </div>
          {needsTranslation && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              {isStale && <span style={{ fontSize: 11, color: "#b45309" }}>May be outdated —</span>}
              <TranslateButton
                apiFetch={apiFetch}
                getSource={() => [content.caption || "", content.alt || ""]}
                onTranslated={([capHi, altHi]) => onSaveTranslation?.("hi", { caption: capHi, alt: altHi, _stale: false })}
              />
            </div>
          )}
        </div>
      )}
      <div style={wrapStyle}>
        <div style={{ width: widthPct + "%" }}>
          {content.url ? (
            <img src={content.url} alt={alt || caption || ""} style={{ width: "100%", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div style={{ height: 80, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
              {readOnly ? "No image" : "Paste a URL or upload an image above"}
            </div>
          )}
          {caption && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 5, fontStyle: "italic" }}>{caption}</div>}
        </div>
      </div>
    </div>
  );
}

/* ── Image Grid ───────────────────────────────────────────────────────── */
export function ImageGridBlock({ content, onChange, readOnly, lang = "en", translations, onSaveTranslation, reportId, templateId }) {
  const { apiFetch } = useApi();
  const cols   = content.cols || [{ url: "", caption: "", alt: "" }, { url: "", caption: "", alt: "" }];
  const isHi   = lang === "hi";
  const hiCols = translations?.hi?.cols || [];

  const update = (i, patch) => onChange({ ...content, cols: cols.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const isStale = !!translations?.hi?._stale;
  const updateHi = (i, patch) => {
    const nextHiCols = cols.map((_, idx) => ({ ...(hiCols[idx] || {}), ...(idx === i ? patch : {}) }));
    onSaveTranslation?.("hi", { cols: nextHiCols, _stale: false });
  };
  const addCol = () => { if (cols.length >= 4) return; onChange({ ...content, cols: [...cols, { url: "", caption: "", alt: "" }] }); };
  const removeCol = (i) => { if (cols.length <= 1) return; onChange({ ...content, cols: cols.filter((_, idx) => idx !== i) }); };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cols.length + ", 1fr)", gap: 10 }}>
        {cols.map((col, i) => {
          const hiCol = hiCols[i] || {};
          const caption = isHi ? (hiCol.caption || "") : (col.caption || "");
          const alt     = isHi ? (hiCol.alt     || "") : (col.alt     || "");
          const needsTranslation = !readOnly && isHi && (!hiCol.caption && !hiCol.alt || isStale) && (col.caption || col.alt);
          return (
            <div key={i}>
              {!readOnly && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Image {i + 1}</span>
                    {cols.length > 1 && <button onClick={() => removeCol(i)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>X</button>}
                  </div>
                  <input key={"url-" + i + "-" + col.url} defaultValue={col.fileName || col.url || ""} onBlur={(e) => update(i, { url: e.target.value })} placeholder="Image URL…" style={{ width: "100%", padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 4 }} />
                  <UploadImageBtn apiFetch={apiFetch} purpose="report-image" reportId={reportId} templateId={templateId} onUploaded={({ url, fileName }) => update(i, { url, fileName })} />
                  <input
                    key={"cap-" + (isHi ? "hi" : "en") + "-" + i + "-" + caption}
                    defaultValue={caption}
                    onBlur={(e) => isHi ? updateHi(i, { caption: e.target.value }) : update(i, { caption: e.target.value })}
                    placeholder="Caption…"
                    style={{ width: "100%", padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 10, outline: "none", boxSizing: "border-box", color: "#64748b", marginTop: 4 }}
                  />
                  {needsTranslation && (
                    <div style={{ marginTop: 5 }}>
                      <TranslateButton
                        apiFetch={apiFetch}
                        getSource={() => [col.caption || "", col.alt || ""]}
                        onTranslated={([capHi, altHi]) => updateHi(i, { caption: capHi, alt: altHi })}
                      />
                    </div>
                  )}
                </div>
              )}
              {col.url ? (
                <img src={col.url} alt={alt || caption || ("Image " + (i + 1))} style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ height: 80, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 11 }}>{readOnly ? "" : "URL or upload"}</div>
              )}
              {caption && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>{caption}</div>}
            </div>
          );
        })}
      </div>
      {!readOnly && cols.length < 4 && (
        <button onClick={addCol} style={{ ...ADD_BTN_STYLE, marginTop: 10, fontSize: 11 }}>+ Add Column</button>
      )}
    </div>
  );
}

/* ── Form-import TABLE sub-component ────────────────────────────────── */
function FormImportTableBlock({ blockId, content, onChange, onRefetched, readOnly, apiFetch, lang = "en", translations }) {
  const [refetching,   setRefetching]   = useState(false);
  const [refetchErr,   setRefetchErr]   = useState("");
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [switching,    setSwitching]    = useState(false);
  const [switchErr,    setSwitchErr]    = useState("");

  const dataLanguage = content.language === "hi" ? "hi" : "en";
  // Auto-fetched translation (persisted at import/refetch time) — used automatically
  // when it covers the active language, so no manual "switch" step is needed.
  const autoTranslation = lang !== dataLanguage ? translations?.[lang] : null;
  const effective = autoTranslation || content;
  const columns = effective.columns || [];
  const rows    = effective.rows    || [];
  const langMismatch = !readOnly && dataLanguage !== lang && !autoTranslation;

  const lastFetched = content.imported_at
    ? new Date(content.imported_at).toLocaleString()
    : null;

  async function doRefetch() {
    setConfirmOpen(false);
    setRefetching(true);
    setRefetchErr("");
    try {
      const res  = await apiFetch(`/api/report-integration/blocks/${blockId}/refetch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Re-fetch failed");
      // Backend returns { rows, columns, imported_at, count, translations }.
      // Always apply the fresh column meta so col.key matches the row keys returned
      // by the rebuilt query (prevents blank-cell key-mismatch after schema changes).
      const newContent = {
        ...content,
        rows:        data.data.rows        || [],
        columns:     data.data.columns     || content.columns || [],
        imported_at: data.data.imported_at || new Date().toISOString(),
      };
      if (onRefetched) onRefetched(newContent, data.data.translations);
      else onChange(newContent);
    } catch (ex) {
      setRefetchErr(ex.message || "Re-fetch failed");
    } finally {
      setRefetching(false);
    }
  }

  async function doSwitchLanguage() {
    setSwitching(true);
    setSwitchErr("");
    try {
      const res  = await apiFetch(`/api/report-integration/blocks/${blockId}/switch-language`, {
        method: "POST", body: JSON.stringify({ language: lang }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Switch failed");
      // Backend returns the full updated content object
      if (onRefetched) onRefetched(data.data);
      else onChange(data.data);
    } catch (ex) {
      setSwitchErr(ex.message || "Failed to switch language");
    } finally {
      setSwitching(false);
    }
  }

  const headerBg  = content.header_color || "#f1f5f9";
  const colWidths = content.col_widths   || [];
  const hasW      = colWidths.some(w => w);
  const colStyle  = (ci) => colWidths[ci] ? { width: colWidths[ci], minWidth: colWidths[ci] } : {};
  const cell = { border: "1px solid #d1d5db", padding: "6px 10px", fontSize: 12, minWidth: 80, verticalAlign: "top" };

  return (
    <div>
      {langMismatch && (
        <div style={{
          marginBottom: 10, padding: "9px 14px", background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 12, color: "#92400e",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span>
            This table was imported in <strong>{dataLanguage === "hi" ? "Hindi" : "English"}</strong>, but you're
            editing in <strong>{lang === "hi" ? "Hindi" : "English"}</strong>.
          </span>
          <button
            onClick={doSwitchLanguage}
            disabled={switching}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #d97706",
              background: switching ? "#fef3c7" : "#fff", color: "#92400e",
              fontSize: 11, fontWeight: 700, cursor: switching ? "not-allowed" : "pointer", fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            {switching ? "Switching…" : `Switch to ${lang === "hi" ? "Hindi" : "English"} data`}
          </button>
          {switchErr && <div style={{ width: "100%", color: "#b91c1c" }}>{switchErr}</div>}
        </div>
      )}

      {/* ── Metadata bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 12px", background: "#f0f9ff", border: "1px solid #bae6fd",
        borderRadius: 8, marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
            color: "#0369a1", background: "#e0f2fe", padding: "2px 7px", borderRadius: 4,
          }}>Form Import</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0c4a6e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {content.form_display_name || content.form_name || "Unknown form"}
          </span>
          {content.academic_year && (
            <span style={{ fontSize: 10, color: "#0369a1", background: "#e0f2fe", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>
              {content.academic_year}
            </span>
          )}
          {autoTranslation && (
            <span title="Showing the auto-fetched Hindi translation for this table" style={{ fontSize: 10, color: "#15803d", background: "#dcfce7", padding: "1px 6px", borderRadius: 4, flexShrink: 0, fontWeight: 700 }}>
              Hindi translation
            </span>
          )}
          <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0 }}>
            {rows.length} rows
          </span>
          {lastFetched && (
            <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
              · fetched {lastFetched}
            </span>
          )}
        </div>

        {!readOnly && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={refetching}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
              border: "1px solid #0369a1", borderRadius: 7,
              background: refetching ? "#e0f2fe" : "#fff",
              color: "#0369a1", fontSize: 11, fontWeight: 700, cursor: refetching ? "not-allowed" : "pointer",
              flexShrink: 0, fontFamily: "inherit",
            }}
          >
            {refetching ? "Fetching…" : "↻ Re-fetch"}
          </button>
        )}
      </div>

      {refetchErr && (
        <div style={{ marginBottom: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, fontSize: 11, color: "#b91c1c" }}>
          {refetchErr}
        </div>
      )}

      {/* ── Confirm re-fetch dialog ── */}
      {confirmOpen && (
        <div style={{
          marginBottom: 10, padding: "12px 16px", background: "#fffbeb",
          border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Re-fetch data from form?</div>
          <div style={{ marginBottom: 10 }}>
            This will replace all current table rows with fresh data from the form. Manual edits will be lost.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doRefetch} style={{
              padding: "5px 14px", borderRadius: 7, border: "none",
              background: "#d97706", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>Yes, Re-fetch</button>
            <button onClick={() => setConfirmOpen(false)} style={{
              padding: "5px 12px", borderRadius: 7, border: "1px solid #e2e8f0",
              background: "#fff", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Table style controls (edit mode only) ── */}
      {!readOnly && columns.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          marginBottom: 8, padding: "6px 10px", background: "#f8fafc",
          border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, color: "#64748b",
        }}>
          <span style={{ fontWeight: 700, color: "#475569" }}>Table Style</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span>Header color</span>
            <input
              type="color"
              value={content.header_color || "#f1f5f9"}
              onChange={e => onChange({ ...content, header_color: e.target.value })}
              style={{ width: 28, height: 22, border: "1px solid #e2e8f0", borderRadius: 4, cursor: "pointer", padding: 1 }}
              title="Header background color"
            />
          </label>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span>Col widths (px):</span>
          {columns.map((_, ci) => (
            <input
              key={ci}
              type="number"
              value={colWidths[ci] ?? ""}
              placeholder="auto"
              onChange={e => {
                const w = [...(content.col_widths || Array(columns.length).fill(null))];
                w[ci] = e.target.value !== "" ? Number(e.target.value) : null;
                onChange({ ...content, col_widths: w });
              }}
              style={{
                width: 52, fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4,
                padding: "2px 4px", textAlign: "center", fontFamily: "inherit",
              }}
              title={`Column ${ci + 1} width`}
            />
          ))}
        </div>
      )}

      {/* ── Table ── */}
      {columns.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 12, border: "1px dashed #e2e8f0", borderRadius: 8 }}>
          No columns defined. Re-fetch to populate data.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", ...(hasW ? { tableLayout: "fixed" } : {}) }}>
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th key={ci} style={{ ...cell, ...colStyle(ci), background: headerBg, fontWeight: 700 }}>
                    {col.label || col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...cell, textAlign: "center", color: "#94a3b8", fontStyle: "italic", padding: "20px" }}>
                    No data — use Re-fetch to load records from the form.
                  </td>
                </tr>
              ) : (
                rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 1 ? "#f9fafb" : "#fff" }}>
                    {columns.map((col, ci) => (
                      <td key={ci} style={{ ...cell, ...colStyle(ci) }}>
                        {readOnly
                          ? (row[col.key] != null ? String(row[col.key]) : "")
                          : (
                            <textarea
                              value={row[col.key] != null ? String(row[col.key]) : ""}
                              onChange={e => {
                                const newRows = rows.map((r, idx) => idx === ri ? { ...r, [col.key]: e.target.value } : r);
                                onChange({ ...content, rows: newRows });
                              }}
                              rows={1}
                              style={{ border: "none", background: "transparent", fontSize: 12, width: "100%", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                            />
                          )
                        }
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && columns.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => {
              const emptyRow = {};
              columns.forEach(c => { emptyRow[c.key] = ""; });
              onChange({ ...content, rows: [...rows, emptyRow] });
            }}
            style={ADD_BTN_STYLE}
          >+ Row</button>
        </div>
      )}
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────────────────── */
export function TableBlock({ content, onChange, onRefetched, readOnly, blockId, apiFetch, lang = "en", translations, onSaveTranslation }) {
  // Form-import variant
  if (content.source === "form_import") {
    return (
      <FormImportTableBlock
        blockId={blockId}
        content={content}
        onChange={onChange}
        onRefetched={onRefetched}
        readOnly={readOnly}
        apiFetch={apiFetch}
        lang={lang}
        translations={translations}
      />
    );
  }

  // Manual table (original behaviour)
  const enRows    = content.rows    || [["", ""], ["", ""]];
  const enHeaders = content.headers || Array(enRows[0]?.length || 2).fill("");
  const isHi      = lang === "hi";
  const hiHeaders = translations?.hi?.headers;
  const hiRows    = translations?.hi?.rows;
  const rows    = isHi ? (hiRows    || enRows.map((r) => r.map(() => ""))) : enRows;
  const headers = isHi ? (hiHeaders || enHeaders.map(() => ""))           : enHeaders;
  const isStale = !!translations?.hi?._stale;
  const needsTranslation = !readOnly && isHi && (!hiRows && !hiHeaders || isStale) &&
    (enHeaders.some(Boolean) || enRows.some((r) => r.some(Boolean)));

  const updateCell = (ri, ci, val) => {
    const n = rows.map((r) => [...r]); n[ri][ci] = val;
    if (isHi) onSaveTranslation?.("hi", { rows: n }); else onChange({ ...content, rows: n });
  };
  const updateHeader = (ci, val) => {
    const n = [...headers]; n[ci] = val;
    if (isHi) onSaveTranslation?.("hi", { headers: n }); else onChange({ ...content, headers: n });
  };
  const addRow = () => {
    const n = [...rows, Array(headers.length).fill("")];
    if (isHi) onSaveTranslation?.("hi", { rows: n }); else onChange({ ...content, rows: n });
  };
  const addCol = () => {
    const nh = [...headers, ""], nr = rows.map((r) => [...r, ""]);
    if (isHi) {
      onSaveTranslation?.("hi", { headers: nh, rows: nr });
    } else {
      const nw = content.col_widths ? [...content.col_widths, null] : undefined;
      onChange({ ...content, headers: nh, rows: nr, ...(nw ? { col_widths: nw } : {}) });
    }
  };
  const removeRow = (ri) => {
    const n = rows.filter((_, i) => i !== ri);
    if (isHi) onSaveTranslation?.("hi", { rows: n }); else onChange({ ...content, rows: n });
  };
  const removeCol = (ci) => {
    const nh = headers.filter((_, i) => i !== ci), nr = rows.map((r) => r.filter((_, i) => i !== ci));
    if (isHi) {
      onSaveTranslation?.("hi", { headers: nh, rows: nr });
    } else {
      const nw = (content.col_widths || []).filter((_, i) => i !== ci);
      onChange({ ...content, headers: nh, rows: nr, col_widths: nw });
    }
  };

  const headerBg  = content.header_color || "#f1f5f9";
  const colWidths = content.col_widths   || [];
  const hasW      = colWidths.some(w => w);
  const colStyle  = (ci) => colWidths[ci] ? { width: colWidths[ci], minWidth: colWidths[ci] } : {};
  const cell = { border: "1px solid #d1d5db", padding: "6px 10px", fontSize: 12, minWidth: 80, verticalAlign: "top" };

  return (
    <div>
      {needsTranslation && (
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          {isStale && <span style={{ fontSize: 11, color: "#b45309" }}>Hindi translation may be outdated —</span>}
          <TranslateButton
            label="Translate all cells from English"
            apiFetch={apiFetch}
            getSource={() => [...enHeaders, ...enRows.flat()]}
            onTranslated={(flat) => {
              const newHeaders = flat.slice(0, enHeaders.length);
              const cellsFlat  = flat.slice(enHeaders.length);
              const newRows = [];
              let idx = 0;
              for (const r of enRows) { newRows.push(cellsFlat.slice(idx, idx + r.length)); idx += r.length; }
              onSaveTranslation?.("hi", { headers: newHeaders, rows: newRows, _stale: false });
            }}
          />
        </div>
      )}

      {/* ── Table style controls (edit / English mode only) ── */}
      {!readOnly && !isHi && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          marginBottom: 8, padding: "6px 10px", background: "#f8fafc",
          border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, color: "#64748b",
        }}>
          <span style={{ fontWeight: 700, color: "#475569" }}>Table Style</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span>Header color</span>
            <input
              type="color"
              value={content.header_color || "#f1f5f9"}
              onChange={e => onChange({ ...content, header_color: e.target.value })}
              style={{ width: 28, height: 22, border: "1px solid #e2e8f0", borderRadius: 4, cursor: "pointer", padding: 1 }}
              title="Header background color"
            />
          </label>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span>Col widths (px):</span>
          {enHeaders.map((_, ci) => (
            <input
              key={ci}
              type="number"
              value={colWidths[ci] ?? ""}
              placeholder="auto"
              onChange={e => {
                const w = [...(content.col_widths || Array(enHeaders.length).fill(null))];
                w[ci] = e.target.value !== "" ? Number(e.target.value) : null;
                onChange({ ...content, col_widths: w });
              }}
              style={{
                width: 52, fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4,
                padding: "2px 4px", textAlign: "center", fontFamily: "inherit",
              }}
              title={`Column ${ci + 1} width`}
            />
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", ...(hasW ? { tableLayout: "fixed" } : {}) }}>
          <thead>
            <tr>
              {headers.map((h, ci) => (
                <th key={ci} style={{ ...cell, ...colStyle(ci), background: headerBg, fontWeight: 700 }}>
                  {readOnly ? h : (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input value={h} onChange={(e) => updateHeader(ci, e.target.value)} placeholder={"Col " + (ci + 1)} style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 12, flex: 1, outline: "none" }} />
                      {headers.length > 1 && <button onClick={() => removeCol(ci)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 11, padding: 0, flexShrink: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>X</button>}
                    </div>
                  )}
                </th>
              ))}
              {!readOnly && <th style={{ ...cell, background: headerBg, width: 28 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "#f9fafb" : "#fff" }}>
                {row.map((c, ci) => (
                  <td key={ci} style={{ ...cell, ...colStyle(ci) }}>
                    {readOnly ? c : <textarea value={c} onChange={(e) => updateCell(ri, ci, e.target.value)} rows={1} style={{ border: "none", background: "transparent", fontSize: 12, width: "100%", outline: "none", resize: "vertical", fontFamily: "inherit" }} />}
                  </td>
                ))}
                {!readOnly && (
                  <td style={{ ...cell, textAlign: "center", width: 28, padding: "4px" }}>
                    <button onClick={() => removeRow(ri)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 13, padding: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>X</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={addRow} style={ADD_BTN_STYLE}>+ Row</button>
            <button onClick={addCol} style={ADD_BTN_STYLE}>+ Column</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LIST BLOCK  —  with per-block font size + colour controls
══════════════════════════════════════════════════════════════════ */
export function ListBlock({ content, onChange, readOnly, lang = "en", apiFetch, translations, onSaveTranslation }) {
  const isHi      = lang === "hi";
  const enItems   = Array.isArray(content.items) ? content.items : [];
  const hiItems   = Array.isArray(translations?.hi?.items) ? translations.hi.items : null;
  const items     = isHi ? (hiItems || enItems.map(() => "")) : enItems;
  const ordered   = content.ordered  || false;
  const fontSize  = content.fontSize || 13;   // stored in px
  const fontColor = content.fontColor || "#1e293b";
  const isStale = !!translations?.hi?._stale;
  const needsTranslation = !readOnly && isHi && (!hiItems || isStale) && enItems.some(Boolean);

  if (readOnly) {
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag style={{ paddingLeft: 28, fontSize, color: fontColor, lineHeight: 1.8, margin: "4px 0 8px" }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
      </Tag>
    );
  }

  return (
    <div>
      {needsTranslation && (
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          {isStale && <span style={{ fontSize: 11, color: "#b45309" }}>May be outdated —</span>}
          <TranslateButton
            label="Translate all items from English"
            apiFetch={apiFetch}
            getSource={() => enItems}
            onTranslated={(itemsHi) => onSaveTranslation?.("hi", { items: itemsHi, _stale: false })}
          />
        </div>
      )}
      {/* ─ List toolbar ─ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        marginBottom: 10, padding: "6px 10px",
        background: "#f8fafc", border: "1px solid #e5e7eb",
        borderRadius: 7,
      }}>
        {/* Ordered / unordered toggle */}
        <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
          {[["• Bullet", false], ["1. Numbered", true]].map(([label, isOrd]) => (
            <button key={String(isOrd)}
              onClick={() => onChange({ ...content, ordered: isOrd })}
              style={{
                padding: "4px 10px", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                background: ordered === isOrd ? "#2563eb" : "#fff",
                color: ordered === isOrd ? "#fff" : "#6b7280",
                fontWeight: ordered === isOrd ? 700 : 400,
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Text size</span>
          <select
            value={fontSize}
            onChange={(e) => onChange({ ...content, fontSize: Number(e.target.value) })}
            style={{ ...selectSt, width: 60 }}
          >
            {[9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
        </div>

        {/* Font colour */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>Color</span>
          <select
            value={fontColor}
            onChange={(e) => onChange({ ...content, fontColor: e.target.value })}
            style={{ ...selectSt, width: 80 }}
          >
            {[
              ["Black",   "#1e293b"], ["Dark Blue","#1e3a8a"], ["Blue",   "#1d4ed8"],
              ["Green",   "#15803d"], ["Red",      "#b91c1c"], ["Gray",   "#4b5563"],
              ["Purple",  "#7c3aed"], ["Orange",   "#c2410c"],
            ].map(([l, v]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* ─ Items ─ */}
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "center" }}>
          {/* Bullet / number indicator */}
          <span style={{
            color: "#94a3b8", fontSize: Math.min(fontSize, 14),
            minWidth: 24, textAlign: "right", flexShrink: 0, fontWeight: 600,
          }}>
            {ordered ? `${i + 1}.` : "•"}
          </span>
          <input
            value={item}
            onChange={(e) => {
              const n = [...items]; n[i] = e.target.value;
              if (isHi) onSaveTranslation?.("hi", { items: n });
              else onChange({ ...content, items: n });
            }}
            placeholder={`Item ${i + 1}…`}
            style={{
              flex: 1, padding: "5px 10px",
              border: "1px solid #e2e8f0", borderRadius: 6,
              fontSize, color: fontColor,
              outline: "none", fontFamily: "inherit",
              background: "#fff",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#60a5fa")}
            onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          />
          <button
            onClick={() => {
              const n = items.filter((_, j) => j !== i);
              if (isHi) onSaveTranslation?.("hi", { items: n });
              else onChange({ ...content, items: n });
            }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 13, flexShrink: 0, padding: "0 2px" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
          >✕</button>
        </div>
      ))}

      <button
        onClick={() => {
          const n = [...items, ""];
          if (isHi) onSaveTranslation?.("hi", { items: n });
          else onChange({ ...content, items: n });
        }}
        style={{ ...ADD_BTN_STYLE, marginTop: 4 }}
      >
        + Add item
      </button>
    </div>
  );
}

/* ── Divider ──────────────────────────────────────────────────────────── */
export function DividerBlock() {
  return <hr style={{ border: "none", borderTop: "2px solid #e2e8f0", margin: "8px 0" }} />;
}

/* ── KPI ─────────────────────────────────────────────────────────────── */
const CHART_ICON = {
  bar: "▊", bar_stack: "▊", line: "╱", area: "◬", pie: "◑", doughnut: "◎",
};

export function KpiBlock({ content, onChange, readOnly, kpiScope = "department" }) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();
  const [kpis,    setKpis]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [open,    setOpen]    = useState(false);

  const selectedId = content?.kpi_id ? String(content.kpi_id) : "";
  const selected   = kpis.find(k => String(k.id) === selectedId);

  // Load KPI list when picker opens (or on mount in edit mode).
  // scope= ensures only KPIs belonging to the same context (institute/department)
  // are shown, even when the logged-in user holds both roles via NOA.
  useEffect(() => {
    if (readOnly) return;
    setLoading(true); setError("");
    apiFetch(`/api/kpi/configs?scope=${kpiScope}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setKpis(j.data || []); else throw new Error(j.error); })
      .catch(e => setError(e.message || "Failed to load KPIs"))
      .finally(() => setLoading(false));
  }, [kpiScope]); // eslint-disable-line

  if (readOnly) {
    if (!selectedId) return (
      <div style={{ padding:"12px 16px", background:"#f8fafc", border:"1px dashed #cbd5e1", borderRadius:8, fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>
        No KPI selected
      </div>
    );
    return (
      <div style={{ padding:"12px 16px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, display:"flex", alignItems:"center", gap:10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ flexShrink: 0 }}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"#1e40af" }}>
            {(lang === "hi" && content.kpi_title_hi) ? content.kpi_title_hi : (content.kpi_title || `KPI #${selectedId}`)}
          </div>
          {content.kpi_description && <div style={{ fontSize:11, color:"#3b82f6" }}>{content.kpi_description}</div>}
          {(content.kpi_academic_year || content.kpi_chart_type || content.kpi_aggregation_type) && (
            <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
              {content.kpi_academic_year && <span style={{ marginRight:6 }}>AY: {content.kpi_academic_year}</span>}
              {content.kpi_chart_type && <span style={{ marginRight:6, textTransform:"capitalize" }}>{content.kpi_chart_type}</span>}
              {content.kpi_aggregation_type && content.kpi_aggregation_type !== "none" && (
                <span style={{ color:"#7c3aed", fontWeight:600 }}>{content.kpi_aggregation_type.toUpperCase()}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {/* Current selection display */}
      {selected ? (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:9 }}>
          <span style={{ fontSize:20, color:"#2563eb", lineHeight:1 }}>{CHART_ICON[selected.chart_type] || <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e40af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cfgTitle(selected, lang)}</div>
            {selected.description && <div style={{ fontSize:11, color:"#3b82f6", marginTop:1 }}>{(lang === "hi" && selected.description_hi) ? selected.description_hi : selected.description}</div>}
            <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
              {selected.academic_year && <span style={{ marginRight:8, fontWeight:600 }}>AY: {selected.academic_year}</span>}
              <span style={{ textTransform:"capitalize" }}>{selected.chart_type || "chart"}</span>
              {selected.aggregation_type && selected.aggregation_type !== "none" && (
                <span style={{ marginLeft:6, color:"#7c3aed" }}>· {selected.aggregation_type.toUpperCase()}</span>
              )}
            </div>
          </div>
          <button onClick={() => { onChange({ kpi_id: "" }); setOpen(false); }}
            style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #fecaca", background:"#fef2f2", fontSize:11, color:"#dc2626", cursor:"pointer", flexShrink:0 }}>
            Clear
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(v => !v)}
          style={{ padding:"10px 14px", border:"1.5px dashed #bfdbfe", borderRadius:9, background:"#f8fafc", fontSize:13, color:"#64748b", cursor:"pointer", textAlign:"left" }}>
          {loading ? "Loading KPIs…" : "Click to select a KPI chart"}
        </button>
      )}

      {error && <div style={{ fontSize:11, color:"#dc2626", padding:"6px 10px", background:"#fef2f2", borderRadius:6 }}>{error}</div>}

      {/* KPI picker list */}
      {!selected && (open || !selectedId) && !loading && kpis.length > 0 && (
        <div style={{ border:"1.5px solid #e2e8f0", borderRadius:10, maxHeight:280, overflowY:"auto", background:"#fff" }}>
          {kpis.map(k => (
            <div key={k.id}
              onClick={() => {
                onChange({
                  kpi_id:               k.id,
                  kpi_title:            k.title,
                  kpi_title_hi:         k.title_hi || "",
                  kpi_description:      k.description || "",
                  kpi_description_hi:   k.description_hi || "",
                  kpi_academic_year:    k.academic_year || "",
                  kpi_chart_type:       k.chart_type || "bar",
                  kpi_aggregation_type: k.aggregation_type || "none",
                });
                setOpen(false);
              }}
              style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize:16, color:"#2563eb", flexShrink:0, marginTop:1, lineHeight:1 }}>{CHART_ICON[k.chart_type] || <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#1e293b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cfgTitle(k, lang)}</div>
                {k.description && (
                  <div style={{ fontSize:11, color:"#64748b", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(lang === "hi" && k.description_hi) ? k.description_hi : k.description}</div>
                )}
                <div style={{ display:"flex", gap:8, marginTop:3, flexWrap:"wrap" }}>
                  {k.academic_year && (
                    <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:"#eff6ff", color:"#1d4ed8", fontWeight:600 }}>{k.academic_year}</span>
                  )}
                  <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:"#f1f5f9", color:"#64748b", textTransform:"capitalize" }}>{k.chart_type || "bar"}</span>
                  {k.aggregation_type && k.aggregation_type !== "none" && (
                    <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:"#f5f3ff", color:"#7c3aed", fontWeight:600 }}>{k.aggregation_type.toUpperCase()}</span>
                  )}
                  <span style={{ fontSize:10, color:"#94a3b8" }}>{k.table_name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && kpis.length === 0 && !error && (
        <div style={{ fontSize:12, color:"#94a3b8", padding:"8px 12px", background:"#f8fafc", borderRadius:6 }}>
          No KPI charts found. Create one in the KPI module first.
        </div>
      )}
    </div>
  );
}

/* ── File ─────────────────────────────────────────────────────────────── */
export function FileBlock({ content, onChange, readOnly, reportId, templateId }) {
  const { apiFetch } = useApi();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(e) {
    if (!content.url || content.url.startsWith("http")) return;
    e.preventDefault();
    setDownloading(true);
    try {
      // Secure local file: we must fetch a fresh download token
      const res = await apiFetch(`/api/file/token?key=${encodeURIComponent(content.url)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to get download token");
      
      // Open the clean URL which the browser can natively download
      window.open(json.url, "_blank");
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <span style={{ fontSize: 20, marginTop: 4 }}>Fil</span>
      <div style={{ flex: 1 }}>
        {readOnly
          ? <a href={content.url?.startsWith("http") ? content.url : "#"} onClick={handleDownload} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13, textDecoration: "underline", cursor: downloading ? "wait" : "pointer", display: "inline-block", padding: "4px 0" }}>
              {downloading ? "Downloading..." : (content.name || content.url || "File")}
            </a>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input key={"name-" + content.name} defaultValue={content.name || ""} onBlur={(e) => onChange({ ...content, name: e.target.value })} placeholder="File name / label" style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, outline: "none" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input key={"url-" + content.url} defaultValue={content.url || ""} onBlur={(e) => onChange({ ...content, url: e.target.value })} placeholder="File URL or path" style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, color: "#64748b", outline: "none" }} />
                <UploadFileBtn apiFetch={apiFetch} reportId={reportId} templateId={templateId} onUploaded={({ url, name }) => onChange({ ...content, url, name: content.name || name })} />
              </div>
            </div>
        }
      </div>
    </div>
  );
}

/* ── KPI Import Block ─────────────────────────────────────────────── */
export function KpiImportBlock({ blockId, content, onChange, onRefetched, readOnly, apiFetch }) {
  const [reimporting,  setReimporting]  = useState(false);
  const [reimportErr,  setReimportErr]  = useState("");
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [optionsOpen,  setOptionsOpen]  = useState(false);

  const opts        = content.compile_options || {};
  const showChart   = opts.show_chart       !== false;
  const showTable   = opts.show_data_table  !== false;
  const caption     = opts.caption          || "";

  const year        = content.academic_year;
  const yearLabel   = year ? `${year}-${String(year + 1).slice(-2)}` : "";
  const importedAt  = content.imported_at
    ? new Date(content.imported_at).toLocaleString()
    : null;

  const data     = content.data     || {};
  const columns  = data.columns     || [];
  const series   = data.series      || [];
  const totals   = data.totals      || [];

  async function doReimport() {
    setConfirmOpen(false);
    setReimporting(true);
    setReimportErr("");
    try {
      const res  = await apiFetch(`/api/report-integration/blocks/${blockId}/kpi-reimport`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Re-import failed");
      // Backend returns { content: { ...updatedContent } }
      if (onRefetched) onRefetched(json.data.content);
      else onChange(json.data.content);
    } catch (ex) {
      setReimportErr(ex.message || "Re-import failed");
    } finally {
      setReimporting(false);
    }
  }

  function patchOpts(patch) {
    onChange({ ...content, compile_options: { ...opts, ...patch } });
  }

  const fmtNum = n => (typeof n === "number" ? n.toLocaleString() : n);

  return (
    <div>
      {/* ── Metadata bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 12px", background: "#f5f3ff", border: "1px solid #ddd6fe",
        borderRadius: 8, marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4c1d95", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {content.title || "KPI Chart"}
              {yearLabel && <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 500, marginLeft: 6 }}>({yearLabel})</span>}
            </div>
            {importedAt && (
              <div style={{ fontSize: 10, color: "#9f7aea" }}>Imported {importedAt}</div>
            )}
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setOptionsOpen(o => !o)}
              style={{
                padding: "4px 10px", border: `1px solid ${optionsOpen ? "#7c3aed" : "#c4b5fd"}`,
                borderRadius: 6, background: optionsOpen ? "#ede9fe" : "#fff",
                color: optionsOpen ? "#6d28d9" : "#7c3aed", fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            ><Settings size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Options</button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={reimporting}
              style={{
                padding: "4px 10px", border: "1px solid #7c3aed",
                borderRadius: 6, background: reimporting ? "#ede9fe" : "#fff",
                color: "#7c3aed", fontSize: 11, fontWeight: 700,
                cursor: reimporting ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}
            >
              {reimporting ? "Importing…" : "Re-import"}
            </button>
          </div>
        )}
      </div>

      {reimportErr && (
        <div style={{ marginBottom: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, fontSize: 11, color: "#b91c1c" }}>
          {reimportErr}
        </div>
      )}

      {/* ── Confirm re-import ── */}
      {confirmOpen && (
        <div style={{
          marginBottom: 10, padding: "14px 16px", background: "#fef3c7",
          border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>Re-import KPI Chart?</div>
          <div style={{ marginBottom: 3 }}>
            This will fetch the latest version of <strong>{content.title}</strong>.
          </div>
          <div style={{ fontSize: 11, color: "#a16207", marginBottom: 10 }}>
            The current chart and data will be replaced with the latest exported version.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doReimport} style={{
              padding: "5px 14px", borderRadius: 7, border: "none",
              background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>Re-import →</button>
            <button onClick={() => setConfirmOpen(false)} style={{
              padding: "5px 12px", borderRadius: 7, border: "1px solid #e2e8f0",
              background: "#fff", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Compile options ── */}
      {optionsOpen && !readOnly && (
        <div style={{
          marginBottom: 12, padding: "12px 16px", background: "#fafafe",
          border: "1px solid #e2e8f0", borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Compile Options
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#374151" }}>
              <input type="checkbox" checked={showChart} onChange={e => patchOpts({ show_chart: e.target.checked })} style={{ accentColor: "#7c3aed", width: 14, height: 14 }} />
              Include chart image in compiled report (PDF / Word)
            </label>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#374151" }}>
              <input type="checkbox" checked={showTable} onChange={e => patchOpts({ show_data_table: e.target.checked })} style={{ accentColor: "#7c3aed", width: 14, height: 14 }} />
              Include data summary table in compiled report
            </label>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Caption</label>
            <input
              type="text"
              value={caption}
              onChange={e => patchOpts({ caption: e.target.value })}
              placeholder="e.g. Figure __ — X-Ray Monthly Statistics"
              style={{
                width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0",
                borderRadius: 7, fontSize: 12, outline: "none", fontFamily: "inherit",
                color: "#1e293b", boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      )}

      {/* ── SVG Chart ── */}
      {content.svg_data ? (
        <div style={{
          border: "1px solid #e2e8f0", borderRadius: 8, overflow: "auto",
          background: "#fff", padding: 4, marginBottom: showTable && columns.length > 0 ? 10 : 0,
        }}>
          <div
            style={{ pointerEvents: "none", lineHeight: 0, overflow: "hidden" }}
            dangerouslySetInnerHTML={{ __html: content.svg_data }}
          />
        </div>
      ) : (
        <div style={{
          height: 120, border: "1px dashed #e2e8f0", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#94a3b8", fontSize: 12, background: "#f9fafb",
          marginBottom: columns.length > 0 ? 10 : 0,
        }}>
          No chart — re-import to load
        </div>
      )}

      {/* ── Data Summary Table ── */}
      {columns.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Data Summary
          </div>
          <div style={{ overflowX: "auto", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>Series</th>
                  {columns.map((col, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s, si) => (
                  <tr key={si} style={{ background: "#fff" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 600, color: "#1e293b", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{s.display_name || s.name}</td>
                    {(s.values || []).map((v, vi) => (
                      <td key={vi} style={{ padding: "5px 10px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9" }}>{fmtNum(v)}</td>
                    ))}
                  </tr>
                ))}
                {totals.length > 0 && (
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 700, color: "#1e293b" }}>Total</td>
                    {totals.map((v, vi) => (
                      <td key={vi} style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{fmtNum(v)}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Block router ─────────────────────────────────────────────────────── */
// kpiScope: "institute" | "department" — controls which KPIs appear in the KPI picker.
// Pass this from the report builder so the picker only shows KPIs belonging to the
// same scope as the report being authored.
export function BlockEditor({ block, onChange, onRefetched, readOnly, kpiScope = "department", blockId, apiFetch, lang = "en", onSaveTranslation, reportId, templateId }) {
  const p = { content: block.content, onChange, readOnly, lang, translations: block.translations, onSaveTranslation };
  switch (block.block_type) {
    case "PARAGRAPH":  return <RichTextBlock  {...p} apiFetch={apiFetch} />;
    case "HEADING":    return <HeadingBlock   {...p} apiFetch={apiFetch} />;
    case "IMAGE":      return <ImageBlock     {...p} reportId={reportId} templateId={templateId} />;
    case "IMAGE_GRID": return <ImageGridBlock {...p} reportId={reportId} templateId={templateId} />;
    case "TABLE":      return <TableBlock     {...p} onRefetched={onRefetched} blockId={blockId || block.id} apiFetch={apiFetch} />;
    case "LIST":       return <ListBlock      {...p} apiFetch={apiFetch} />;
    case "DIVIDER":    return <DividerBlock />;
    case "FILE":       return <FileBlock      {...p} reportId={reportId} templateId={templateId} />;
    case "KPI":
      if ((block.content || {}).source === "kpi_import") {
        return <KpiImportBlock blockId={blockId || block.id} content={block.content} onChange={onChange} onRefetched={onRefetched} readOnly={readOnly} apiFetch={apiFetch} />;
      }
      return <KpiBlock {...p} kpiScope={kpiScope} />;
    default:           return <div style={{ color: "#94a3b8", fontSize: 13 }}>[{block.block_type}]</div>;
  }
}

/* ── Default content ──────────────────────────────────────────────────── */
export const DEFAULT_CONTENT = {
  PARAGRAPH:  { html: "" },
  HEADING:    { text: "Heading", level: 2 },
  IMAGE:      { url: "", alt: "", caption: "", widthPct: 100, align: "center" },
  IMAGE_GRID: { cols: [{ url: "", caption: "", alt: "" }, { url: "", caption: "", alt: "" }] },
  TABLE:      { headers: ["Column 1", "Column 2"], rows: [["", ""], ["", ""]] },
  LIST:       { items: [""], ordered: false, fontSize: 13, fontColor: "#1e293b" },
  DIVIDER:    {},
  FILE:       { name: "", url: "" },
  KPI:        { kpi_id: "", kpi_title: "", kpi_description: "", kpi_academic_year: "", kpi_chart_type: "bar", kpi_aggregation_type: "none" },
};

/* ── Add-block strip ──────────────────────────────────────────────────── */
const BLOCK_MENU = [
  { type: "PARAGRAPH",  icon: "P",   label: "Text",       hint: "Rich text paragraph — fill in with formatted text (font, size, color, alignment, bold/italic etc.)" },
  { type: "HEADING",    icon: "H",   label: "Heading",    hint: "A section heading line — choose H1/H2/H3 and type the heading text." },
  { type: "TABLE",      icon: "Tbl", label: "Table",      hint: "A grid of rows and columns — fill in headers and cell values, or import from a form." },
  { type: "LIST",       icon: "Lst", label: "List",       hint: "A bulleted or numbered list — add one item per line." },
  { type: "IMAGE",      icon: "Img", label: "Image",      hint: "A single image — upload or paste a URL, set width/alignment, add a caption." },
  { type: "IMAGE_GRID", icon: "Grd", label: "Image Grid", hint: "Multiple images side by side — upload up to 4 images, each with its own caption." },
  { type: "DIVIDER",    icon: "--",  label: "Divider",    hint: "A plain horizontal line used to visually separate content — no data to fill in." },
  { type: "FILE",       icon: "Fil", label: "File",       hint: "A downloadable file attachment — provide a file name/label and its URL or path." },
];

export function AddBlockMenu({ onAdd }) {
  const [hovered, setHovered] = useState(null);
  const active = BLOCK_MENU.find(t => t.type === hovered);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Add block</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BLOCK_MENU.map((t) => (
          <button key={t.type} onClick={() => onAdd(t.type)}
            title={t.hint}
            onMouseEnter={(e) => { setHovered(t.type); e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.color = "#7c3aed"; e.currentTarget.style.background = "#faf5ff"; }}
            onMouseLeave={(e) => { setHovered(null); e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "#fff"; }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "1px dashed #e2e8f0", borderRadius: 6, background: "#fff", fontSize: 12, color: "#64748b", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{
        marginTop: 8, minHeight: 16, fontSize: 11, color: "#7c3aed",
        fontStyle: active ? "normal" : "italic",
      }}>
        {active ? active.hint : "Hover a block type to see what it's for."}
      </div>
    </div>
  );
}
