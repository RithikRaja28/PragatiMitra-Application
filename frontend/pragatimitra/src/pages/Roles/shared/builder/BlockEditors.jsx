/**
 * BlockEditors.jsx -- shared block editor components
 */
import React, { useRef, useEffect, useState } from "react";
import { useApi } from "../../../../hooks/useApi";

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

/* ── Table ────────────────────────────────────────────────────────────── */
export function TableBlock({ content, onChange, readOnly }) {
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

/* ── Block router ─────────────────────────────────────────────────────── */
export function BlockEditor({ block, onChange, readOnly }) {
  const p = { content: block.content, onChange, readOnly };
  switch (block.block_type) {
    case "PARAGRAPH":  return <RichTextBlock  {...p} />;
    case "HEADING":    return <HeadingBlock   {...p} />;
    case "IMAGE":      return <ImageBlock     {...p} />;
    case "IMAGE_GRID": return <ImageGridBlock {...p} />;
    case "TABLE":      return <TableBlock     {...p} />;
    case "LIST":       return <ListBlock      {...p} />;
    case "DIVIDER":    return <DividerBlock />;
    case "FILE":       return <FileBlock      {...p} />;
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
  KPI:        { kpi_id: "" },
};

/* ── Add-block strip ──────────────────────────────────────────────────── */
const BLOCK_MENU = [
  { type: "PARAGRAPH",  icon: "P",   label: "Text" },
  { type: "HEADING",    icon: "H",   label: "Heading" },
  { type: "TABLE",      icon: "Tbl", label: "Table" },
  { type: "LIST",       icon: "Lst", label: "List" },
  { type: "IMAGE",      icon: "Img", label: "Image" },
  { type: "IMAGE_GRID", icon: "Grd", label: "Image Grid" },
  { type: "DIVIDER",    icon: "--",  label: "Divider" },
  { type: "FILE",       icon: "Fil", label: "File" },
];

export function AddBlockMenu({ onAdd }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Add block</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BLOCK_MENU.map((t) => (
          <button key={t.type} onClick={() => onAdd(t.type)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "1px dashed #e2e8f0", borderRadius: 6, background: "#fff", fontSize: 12, color: "#64748b", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.color = "#7c3aed"; e.currentTarget.style.background = "#faf5ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "#fff"; }}
          >
            <span style={{ fontSize: 11, fontWeight: 700 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
