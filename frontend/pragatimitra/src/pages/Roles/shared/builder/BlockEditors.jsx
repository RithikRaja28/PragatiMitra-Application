/**
 * BlockEditors.jsx -- shared block editor components
 */
import React, { useRef, useEffect, useState } from "react";
import { useApi } from "../../../../hooks/useApi";
import { useLanguage } from "../../../../i18n/LanguageContext";

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
        color: active ? "#3730a3" : "#374151",
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

/* ── S3 upload helper ─────────────────────────────────────────────────── */
async function uploadToS3(file, apiFetch, folder) {
  if (!file) throw new Error("No file selected");
  if (file.size > 10 * 1024 * 1024) throw new Error("File must be under 10 MB");
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED.includes(file.type)) throw new Error("Only JPEG, PNG and WebP images are allowed");

  const presignRes = await apiFetch("/api/upload/presign", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, folder: folder || "report-images" }),
  });
  const presignData = await presignRes.json();
  if (!presignRes.ok) throw new Error(presignData.error || "Failed to get upload URL");

  const s3Res = await fetch(presignData.uploadUrl, {
    method: "PUT", body: file, headers: { "Content-Type": file.type },
  });
  if (!s3Res.ok) throw new Error("S3 upload failed");
  return presignData.publicUrl;
}

function UploadImageBtn({ onUploaded, apiFetch, folder, disabled }) {
  const fileRef  = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err,       setErr]       = useState("");

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr("");
    try { onUploaded(await uploadToS3(file, apiFetch, folder)); }
    catch (ex) { setErr(ex.message || "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleChange} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || disabled}
        style={{ padding: "5px 11px", border: "1px solid #e2e8f0", borderRadius: 7, background: uploading ? "#f1f5f9" : "#fff", fontSize: 11, cursor: uploading || disabled ? "not-allowed" : "pointer", color: "#475569", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {err && <div style={{ fontSize: 10, color: "#b91c1c", maxWidth: 200 }}>{err}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RICH TEXT PARAGRAPH BLOCK  —  Word-like editor
══════════════════════════════════════════════════════════════════ */
export function RichTextBlock({ content, onChange, readOnly }) {
  const editorRef   = useRef(null);
  const initialised = useRef(false);
  const savedSel    = useRef(null);

  useEffect(() => {
    if (editorRef.current && !initialised.current) {
      editorRef.current.innerHTML = content.html || content.text || "";
      initialised.current = true;
    }
  }, []);

  useEffect(() => {
    if (editorRef.current && initialised.current) {
      const incoming = content.html || content.text || "";
      if (editorRef.current.innerHTML !== incoming) editorRef.current.innerHTML = incoming;
    }
  }, [content.html]);

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

  const save = () => { if (editorRef.current) onChange({ html: editorRef.current.innerHTML }); };

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
    if (!sel || sel.isCollapsed) { alert("Select text first, then click Link."); return; }
    const url = window.prompt("Enter URL:", "https://");
    if (url) exec("createLink", url);
  };

  if (readOnly) {
    return (
      <div
        className="rtb-reader"
        style={{ lineHeight: 1.8, color: "#111827", wordBreak: "break-word", fontSize: 13, fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
        dangerouslySetInnerHTML={{ __html: content.html || content.text || "<em style='color:#9ca3af'>Empty paragraph</em>" }}
      />
    );
  }

  const TB_SEL = { ...selectSt };

  return (
    <div>
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
        <TBtn onClick={() => exec("justifyLeft")}   title="Align left"   style={{ fontSize: 12 }}>⬛L</TBtn>
        <TBtn onClick={() => exec("justifyCenter")} title="Center"       style={{ fontSize: 12 }}>⬛C</TBtn>
        <TBtn onClick={() => exec("justifyRight")}  title="Align right"  style={{ fontSize: 12 }}>⬛R</TBtn>
        <TBtn onClick={() => exec("justifyFull")}   title="Justify"      style={{ fontSize: 12 }}>⬛J</TBtn>
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
        <TBtn onClick={insertLink}             title="Insert link"   style={{ fontSize: 12 }}>🔗</TBtn>
        <TBtn onClick={() => exec("unlink")}   title="Remove link"   style={{ fontSize: 10 }}>🔗✕</TBtn>
        <Sep />

        {/* ─ Clear ─ */}
        <TBtn onClick={() => exec("removeFormat")} title="Clear all formatting" style={{ fontSize: 10, color: "#9ca3af" }}>Clr</TBtn>
      </div>

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
export function HeadingBlock({ content, onChange, readOnly }) {
  const level = content.level || 2;
  const sizes = { 1: 26, 2: 20, 3: 16 };
  return (
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
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={(e) => onChange({ ...content, text: e.currentTarget.innerText })}
        style={{ flex: 1, fontSize: sizes[level] || 20, fontWeight: 700, color: "#0f172a", outline: "none", borderBottom: readOnly ? "none" : "1px dashed #e2e8f0", padding: "4px 0" }}
        dangerouslySetInnerHTML={{ __html: content.text || "" }}
      />
    </div>
  );
}

/* ── Enhanced Image Block ─────────────────────────────────────────────── */
export function ImageBlock({ content, onChange, readOnly }) {
  const { apiFetch } = useApi();
  const widthPct = content.widthPct ?? 100;
  const align    = content.align || "center";
  const wrapStyle = { left: { display: "flex", justifyContent: "flex-start" }, center: { display: "flex", justifyContent: "center" }, right: { display: "flex", justifyContent: "flex-end" } }[align] || { display: "flex", justifyContent: "center" };

  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
            <input key={content.url} defaultValue={content.url || ""} onBlur={(e) => onChange({ ...content, url: e.target.value })} placeholder="Paste image URL…" style={{ flex: 1, padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            <UploadImageBtn apiFetch={apiFetch} folder="report-images" onUploaded={(url) => onChange({ ...content, url })} />
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
            <input key={"alt-" + content.alt} defaultValue={content.alt || ""} onBlur={(e) => onChange({ ...content, alt: e.target.value })} placeholder="Alt text…" style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, outline: "none" }} />
            <input key={"cap-" + content.caption} defaultValue={content.caption || ""} onBlur={(e) => onChange({ ...content, caption: e.target.value })} placeholder="Caption…" style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 11, outline: "none", color: "#64748b" }} />
          </div>
        </div>
      )}
      <div style={wrapStyle}>
        <div style={{ width: widthPct + "%" }}>
          {content.url ? (
            <img src={content.url} alt={content.alt || content.caption || ""} style={{ width: "100%", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div style={{ height: 80, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
              {readOnly ? "No image" : "Paste a URL or upload an image above"}
            </div>
          )}
          {content.caption && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 5, fontStyle: "italic" }}>{content.caption}</div>}
        </div>
      </div>
    </div>
  );
}

/* ── Image Grid ───────────────────────────────────────────────────────── */
export function ImageGridBlock({ content, onChange, readOnly }) {
  const { apiFetch } = useApi();
  const cols = content.cols || [{ url: "", caption: "", alt: "" }, { url: "", caption: "", alt: "" }];

  const update = (i, patch) => onChange({ ...content, cols: cols.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const addCol = () => { if (cols.length >= 4) return; onChange({ ...content, cols: [...cols, { url: "", caption: "", alt: "" }] }); };
  const removeCol = (i) => { if (cols.length <= 1) return; onChange({ ...content, cols: cols.filter((_, idx) => idx !== i) }); };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cols.length + ", 1fr)", gap: 10 }}>
        {cols.map((col, i) => (
          <div key={i}>
            {!readOnly && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Image {i + 1}</span>
                  {cols.length > 1 && <button onClick={() => removeCol(i)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>X</button>}
                </div>
                <input key={"url-" + i + "-" + col.url} defaultValue={col.url || ""} onBlur={(e) => update(i, { url: e.target.value })} placeholder="Image URL…" style={{ width: "100%", padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 4 }} />
                <UploadImageBtn apiFetch={apiFetch} folder="report-images" onUploaded={(url) => update(i, { url })} />
                <input key={"cap-" + i + "-" + col.caption} defaultValue={col.caption || ""} onBlur={(e) => update(i, { caption: e.target.value })} placeholder="Caption…" style={{ width: "100%", padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 10, outline: "none", boxSizing: "border-box", color: "#64748b", marginTop: 4 }} />
              </div>
            )}
            {col.url ? (
              <img src={col.url} alt={col.alt || col.caption || ("Image " + (i + 1))} style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div style={{ height: 80, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 11 }}>{readOnly ? "" : "URL or upload"}</div>
            )}
            {col.caption && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>{col.caption}</div>}
          </div>
        ))}
      </div>
      {!readOnly && cols.length < 4 && (
        <button onClick={addCol} style={{ ...ADD_BTN_STYLE, marginTop: 10, fontSize: 11 }}>+ Add Column</button>
      )}
    </div>
  );
}

/* ── Form-import TABLE sub-component ────────────────────────────────── */
function FormImportTableBlock({ blockId, content, onChange, onRefetched, readOnly, apiFetch }) {
  const [refetching,   setRefetching]   = useState(false);
  const [refetchErr,   setRefetchErr]   = useState("");
  const [confirmOpen,  setConfirmOpen]  = useState(false);

  const columns = content.columns || [];
  const rows    = content.rows    || [];

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
      // Backend returns { rows, imported_at, count } — update content without marking dirty
      const newContent = {
        ...content,
        rows:        data.data.rows        || [],
        imported_at: data.data.imported_at || new Date().toISOString(),
      };
      if (onRefetched) onRefetched(newContent);
      else onChange(newContent);
    } catch (ex) {
      setRefetchErr(ex.message || "Re-fetch failed");
    } finally {
      setRefetching(false);
    }
  }

  const cell = { border: "1px solid #d1d5db", padding: "6px 10px", fontSize: 12, minWidth: 80, verticalAlign: "top" };

  return (
    <div>
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

      {/* ── Table ── */}
      {columns.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 12, border: "1px dashed #e2e8f0", borderRadius: 8 }}>
          No columns defined. Re-fetch to populate data.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th key={ci} style={{ ...cell, background: "#f1f5f9", fontWeight: 700 }}>
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
                      <td key={ci} style={cell}>
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
export function TableBlock({ content, onChange, onRefetched, readOnly, blockId, apiFetch }) {
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
      />
    );
  }

  // Manual table (original behaviour)
  const rows    = content.rows    || [["", ""], ["", ""]];
  const headers = content.headers || Array(rows[0]?.length || 2).fill("");

  const updateCell   = (ri, ci, val) => { const n = rows.map((r) => [...r]); n[ri][ci] = val; onChange({ ...content, rows: n }); };
  const updateHeader = (ci, val)     => { const n = [...headers]; n[ci] = val; onChange({ ...content, headers: n }); };
  const addRow       = ()            => onChange({ ...content, rows: [...rows, Array(headers.length).fill("")] });
  const addCol       = ()            => onChange({ ...content, headers: [...headers, ""], rows: rows.map((r) => [...r, ""]) });
  const removeRow    = (ri)          => onChange({ ...content, rows: rows.filter((_, i) => i !== ri) });
  const removeCol    = (ci)          => onChange({ ...content, headers: headers.filter((_, i) => i !== ci), rows: rows.map((r) => r.filter((_, i) => i !== ci)) });

  const cell = { border: "1px solid #d1d5db", padding: "6px 10px", fontSize: 12, minWidth: 80, verticalAlign: "top" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {headers.map((h, ci) => (
              <th key={ci} style={{ ...cell, background: "#f1f5f9", fontWeight: 700 }}>
                {readOnly ? h : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input value={h} onChange={(e) => updateHeader(ci, e.target.value)} placeholder={"Col " + (ci + 1)} style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 12, flex: 1, outline: "none" }} />
                    {headers.length > 1 && <button onClick={() => removeCol(ci)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 11, padding: 0, flexShrink: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>X</button>}
                  </div>
                )}
              </th>
            ))}
            {!readOnly && <th style={{ ...cell, background: "#f1f5f9", width: 28 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? "#f9fafb" : "#fff" }}>
              {row.map((c, ci) => (
                <td key={ci} style={cell}>
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
  );
}

/* ══════════════════════════════════════════════════════════════════
   LIST BLOCK  —  with per-block font size + colour controls
══════════════════════════════════════════════════════════════════ */
export function ListBlock({ content, onChange, readOnly }) {
  const items    = Array.isArray(content.items) ? content.items : [];
  const ordered  = content.ordered  || false;
  const fontSize = content.fontSize || 13;   // stored in px
  const fontColor = content.fontColor || "#1e293b";

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
                background: ordered === isOrd ? "#4f46e5" : "#fff",
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
            onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange({ ...content, items: n }); }}
            placeholder={`Item ${i + 1}…`}
            style={{
              flex: 1, padding: "5px 10px",
              border: "1px solid #e2e8f0", borderRadius: 6,
              fontSize, color: fontColor,
              outline: "none", fontFamily: "inherit",
              background: "#fff",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#818cf8")}
            onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          />
          <button
            onClick={() => onChange({ ...content, items: items.filter((_, j) => j !== i) })}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 13, flexShrink: 0, padding: "0 2px" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
          >✕</button>
        </div>
      ))}

      <button onClick={() => onChange({ ...content, items: [...items, ""] })} style={{ ...ADD_BTN_STYLE, marginTop: 4 }}>
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
        <span style={{ fontSize:18, color:"#2563eb" }}>📊</span>
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
          <span style={{ fontSize:20, color:"#2563eb" }}>{CHART_ICON[selected.chart_type] || "📊"}</span>
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
          {loading ? "Loading KPIs…" : "📊 Click to select a KPI chart"}
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
              <span style={{ fontSize:16, color:"#2563eb", flexShrink:0, marginTop:1 }}>{CHART_ICON[k.chart_type] || "📊"}</span>
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
export function FileBlock({ content, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <span style={{ fontSize: 20 }}>Fil</span>
      <div style={{ flex: 1 }}>
        {readOnly
          ? <a href={content.url || "#"} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13 }}>{content.name || content.url || "File"}</a>
          : <>
              <input key={"name-" + content.name} defaultValue={content.name || ""} onBlur={(e) => onChange({ ...content, name: e.target.value })} placeholder="File name / label" style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, outline: "none", marginBottom: 4 }} />
              <input key={"url-" + content.url} defaultValue={content.url || ""} onBlur={(e) => onChange({ ...content, url: e.target.value })} placeholder="File URL or path" style={{ width: "100%", border: "none", background: "transparent", fontSize: 12, color: "#64748b", outline: "none" }} />
            </>
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
          <span style={{ fontSize: 14 }}>📊</span>
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
            >⚙ Options</button>
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
              {reimporting ? "Importing…" : "🔄 Re-import"}
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
export function BlockEditor({ block, onChange, onRefetched, readOnly, kpiScope = "department", blockId, apiFetch }) {
  const p = { content: block.content, onChange, readOnly };
  switch (block.block_type) {
    case "PARAGRAPH":  return <RichTextBlock  {...p} />;
    case "HEADING":    return <HeadingBlock   {...p} />;
    case "IMAGE":      return <ImageBlock     {...p} />;
    case "IMAGE_GRID": return <ImageGridBlock {...p} />;
    case "TABLE":      return <TableBlock     {...p} onRefetched={onRefetched} blockId={blockId || block.id} apiFetch={apiFetch} />;
    case "LIST":       return <ListBlock      {...p} />;
    case "DIVIDER":    return <DividerBlock />;
    case "FILE":       return <FileBlock      {...p} />;
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
