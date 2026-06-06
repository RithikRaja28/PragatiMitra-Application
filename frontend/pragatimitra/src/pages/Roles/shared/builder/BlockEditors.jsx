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

/* ---------- Toolbar primitives ------------------------------------------- */
function TBtn({ onClick, title, children, style }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      style={{
        border: "none", background: "transparent", color: "#374151",
        borderRadius: 4, padding: "2px 6px", fontSize: 12,
        cursor: "pointer", fontFamily: "inherit", fontWeight: 600, lineHeight: 1.4,
        ...style,
      }}
    >{children}</button>
  );
}

function Sep() {
  return (
    <span style={{
      display: "inline-block", width: 1, height: 16,
      background: "#d1d5db", margin: "0 3px", verticalAlign: "middle",
    }} />
  );
}

const FONT_SIZES = [
  { label: "8pt",  css: "8pt"  },
  { label: "10pt", css: "10pt" },
  { label: "12pt", css: "12pt" },
  { label: "14pt", css: "14pt" },
  { label: "18pt", css: "18pt" },
  { label: "24pt", css: "24pt" },
  { label: "36pt", css: "36pt" },
];

const TEXT_COLORS = [
  { label: "Black",  val: "#111827" }, { label: "Blue",   val: "#1d4ed8" },
  { label: "Green",  val: "#15803d" }, { label: "Red",    val: "#b91c1c" },
  { label: "Purple", val: "#7c3aed" }, { label: "Orange", val: "#c2410c" },
  { label: "Gray",   val: "#6b7280" },
];

const toolbarStyle = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1,
  padding: "4px 8px",
  background: "linear-gradient(to bottom, #f9fafb, #f3f4f6)",
  border: "1px solid #e5e7eb", borderRadius: "6px 6px 0 0",
  borderBottom: "none",
};

const selectSt = {
  fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 4,
  padding: "2px 5px", color: "#374151", background: "#fff",
  cursor: "pointer", outline: "none",
};

/* ---------- S3 upload helper -------------------------------------------- */
/**
 * Uploads a file to S3 via the backend presign endpoint.
 * Returns the permanent public URL of the uploaded file.
 */
async function uploadToS3(file, apiFetch, folder) {
  if (!file) throw new Error("No file selected");
  if (file.size > 10 * 1024 * 1024) throw new Error("File must be under 10 MB");

  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED.includes(file.type)) throw new Error("Only JPEG, PNG and WebP images are allowed");

  // 1. Get presigned upload URL from our backend
  const presignRes = await apiFetch("/api/upload/presign", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      folder:   folder || "report-images",
    }),
  });
  const presignData = await presignRes.json();
  if (!presignRes.ok) throw new Error(presignData.error || "Failed to get upload URL");

  const { uploadUrl, publicUrl } = presignData;

  // 2. PUT file directly to S3 (no auth header — presigned URL handles auth)
  const s3Res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!s3Res.ok) throw new Error("S3 upload failed — check bucket permissions");

  return publicUrl;
}

/* ---------- Upload button + file input (reusable) ----------------------- */
function UploadImageBtn({ onUploaded, apiFetch, folder, disabled }) {
  const fileRef  = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err,       setErr]       = useState("");

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const url = await uploadToS3(file, apiFetch, folder);
      onUploaded(url);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || disabled}
        style={{
          padding: "5px 11px", border: "1px solid #e2e8f0", borderRadius: 7,
          background: uploading ? "#f1f5f9" : "#fff", fontSize: 11, cursor: uploading || disabled ? "not-allowed" : "pointer",
          color: "#475569", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        }}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {err && <div style={{ fontSize: 10, color: "#b91c1c", maxWidth: 200 }}>{err}</div>}
    </div>
  );
}

/* ---------- Rich Text Paragraph Block ------------------------------------ */
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
      if (editorRef.current.innerHTML !== incoming) {
        editorRef.current.innerHTML = incoming;
      }
    }
  }, [content.html]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSel.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (!savedSel.current || !editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(savedSel.current); }
  };

  const exec = (cmd, val) => {
    restoreSelection();
    document.execCommand(cmd, false, val === undefined ? null : val);
    saveSelection();
  };

  const applyFontSize = (cssSize) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const frag = range.extractContents();
    const span = document.createElement("span");
    span.style.fontSize = cssSize;
    span.appendChild(frag);
    range.insertNode(span);
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(nr);
    savedSel.current = nr.cloneRange();
    save();
  };

  const applyColor = (color) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) { document.execCommand("foreColor", false, color); return; }
    const frag = range.extractContents();
    const span = document.createElement("span");
    span.style.color = color;
    span.appendChild(frag);
    range.insertNode(span);
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(nr);
    savedSel.current = nr.cloneRange();
    save();
  };

  const save = () => {
    if (editorRef.current) onChange({ html: editorRef.current.innerHTML });
  };

  if (readOnly) {
    return (
      <div
        style={{ lineHeight: 1.8, color: "#111827", wordBreak: "break-word", fontSize: 13 }}
        dangerouslySetInnerHTML={{
          __html: content.html || content.text || "<em style='color:#9ca3af'>Empty paragraph</em>",
        }}
      />
    );
  }

  return (
    <div>
      <div style={toolbarStyle}>
        <TBtn onClick={() => exec("bold")}          title="Bold"><b>B</b></TBtn>
        <TBtn onClick={() => exec("italic")}        title="Italic"><i style={{ fontFamily: "Georgia,serif" }}>I</i></TBtn>
        <TBtn onClick={() => exec("underline")}     title="Underline"><u>U</u></TBtn>
        <TBtn onClick={() => exec("strikeThrough")} title="Strikethrough"><s>S</s></TBtn>
        <TBtn onClick={() => exec("superscript")}   title="Superscript" style={{ fontSize: 10 }}>x2</TBtn>
        <TBtn onClick={() => exec("subscript")}     title="Subscript"   style={{ fontSize: 10 }}>x2</TBtn>

        <Sep />

        <select
          title="Font size -- select text first"
          style={selectSt}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => applyFontSize(e.target.value)}
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.css} value={s.css}>{s.label}</option>
          ))}
        </select>

        <select
          title="Text color -- select text first"
          style={{ ...selectSt, width: 68 }}
          value=""
          onMouseDown={saveSelection}
          onChange={(e) => applyColor(e.target.value)}
        >
          <option value="" disabled>Color</option>
          {TEXT_COLORS.map((c) => (
            <option key={c.val} value={c.val}>{c.label}</option>
          ))}
        </select>

        <Sep />

        <TBtn onClick={() => exec("justifyLeft")}   title="Align left">L=</TBtn>
        <TBtn onClick={() => exec("justifyCenter")} title="Center"    >=C=</TBtn>
        <TBtn onClick={() => exec("justifyRight")}  title="Align right">=R</TBtn>
        <TBtn onClick={() => exec("justifyFull")}   title="Justify"   >=J=</TBtn>

        <Sep />

        <TBtn onClick={() => exec("insertUnorderedList")} title="Bullet list">UL</TBtn>
        <TBtn onClick={() => exec("insertOrderedList")}   title="Numbered list">OL</TBtn>

        <Sep />

        <TBtn onClick={() => exec("indent")}  title="Indent">--&gt;</TBtn>
        <TBtn onClick={() => exec("outdent")} title="Outdent">&lt;--</TBtn>

        <Sep />

        <TBtn onClick={() => exec("removeFormat")} title="Clear formatting" style={{ fontSize: 11, color: "#9ca3af" }}>Clr</TBtn>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={save}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onKeyDown={(e) => {
          if (e.key === "Tab") { e.preventDefault(); exec("insertHTML", "    "); }
        }}
        style={{
          minHeight: 80, padding: "10px 12px",
          border: "1px solid #e5e7eb", borderRadius: "0 0 6px 6px",
          fontSize: 13, lineHeight: 1.8, color: "#111827",
          outline: "none", whiteSpace: "pre-wrap", wordBreak: "break-word",
          background: "#fff",
        }}
      />
    </div>
  );
}

/* ---------- Heading ------------------------------------------------------- */
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

/* ---------- Enhanced Image Block (URL + S3 upload) ----------------------- */
export function ImageBlock({ content, onChange, readOnly }) {
  const { apiFetch } = useApi();
  const widthPct = content.widthPct ?? 100;
  const align    = content.align || "center";
  const wrapStyle = {
    left:   { display: "flex", justifyContent: "flex-start" },
    center: { display: "flex", justifyContent: "center" },
    right:  { display: "flex", justifyContent: "flex-end" },
  }[align] || { display: "flex", justifyContent: "center" };

  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 8 }}>
          {/* URL input + Upload button row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
            <input
              key={content.url}
              defaultValue={content.url || ""}
              onBlur={(e) => onChange({ ...content, url: e.target.value })}
              placeholder="Paste image URL…"
              style={{ flex: 1, padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box" }}
            />
            <UploadImageBtn
              apiFetch={apiFetch}
              folder="report-images"
              onUploaded={(url) => onChange({ ...content, url })}
            />
          </div>

          {/* Width + alignment controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Width</span>
            <input
              type="range" min="10" max="100" step="5" value={widthPct}
              onChange={(e) => onChange({ ...content, widthPct: Number(e.target.value) })}
              style={{ flex: 1, minWidth: 80 }}
            />
            <span style={{ fontSize: 11, color: "#374151", minWidth: 34, fontWeight: 600 }}>{widthPct}%</span>
            <Sep />
            {[["left", "L"], ["center", "C"], ["right", "R"]].map(([a, icon]) => (
              <button key={a} title={"Align " + a}
                onMouseDown={() => onChange({ ...content, align: a })}
                style={{ border: "1px solid", borderRadius: 5, padding: "2px 7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: align === a ? "#dbeafe" : "#f9fafb", borderColor: align === a ? "#93c5fd" : "#e2e8f0", color: align === a ? "#1d4ed8" : "#6b7280" }}>
                {icon}
              </button>
            ))}
          </div>

          {/* Alt + caption */}
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

/* ---------- Image Grid Block (side-by-side, URL + S3 upload) ------------- */
export function ImageGridBlock({ content, onChange, readOnly }) {
  const { apiFetch } = useApi();
  const cols = content.cols || [
    { url: "", caption: "", alt: "" },
    { url: "", caption: "", alt: "" },
  ];

  const update = (i, patch) => {
    const next = cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange({ ...content, cols: next });
  };
  const addCol = () => {
    if (cols.length >= 4) return;
    onChange({ ...content, cols: [...cols, { url: "", caption: "", alt: "" }] });
  };
  const removeCol = (i) => {
    if (cols.length <= 1) return;
    onChange({ ...content, cols: cols.filter((_, idx) => idx !== i) });
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cols.length + ", 1fr)", gap: 10 }}>
        {cols.map((col, i) => (
          <div key={i}>
            {!readOnly && (
              <div style={{ marginBottom: 6 }}>
                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Image {i + 1}</span>
                  {cols.length > 1 && (
                    <button onClick={() => removeCol(i)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>X</button>
                  )}
                </div>

                {/* URL input */}
                <input
                  key={"url-" + i + "-" + col.url}
                  defaultValue={col.url || ""}
                  onBlur={(e) => update(i, { url: e.target.value })}
                  placeholder="Image URL…"
                  style={{ width: "100%", padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 4 }}
                />

                {/* Upload button */}
                <UploadImageBtn
                  apiFetch={apiFetch}
                  folder="report-images"
                  onUploaded={(url) => update(i, { url })}
                />

                {/* Caption */}
                <input
                  key={"cap-" + i + "-" + col.caption}
                  defaultValue={col.caption || ""}
                  onBlur={(e) => update(i, { caption: e.target.value })}
                  placeholder="Caption…"
                  style={{ width: "100%", padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 10, outline: "none", boxSizing: "border-box", color: "#64748b", marginTop: 4 }}
                />
              </div>
            )}

            {col.url ? (
              <img src={col.url} alt={col.alt || col.caption || ("Image " + (i + 1))} style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div style={{ height: 80, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 11 }}>
                {readOnly ? "" : "URL or upload"}
              </div>
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

/* ---------- Table --------------------------------------------------------- */
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
                    {headers.length > 1 && (
                      <button onClick={() => removeCol(ci)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 11, padding: 0, flexShrink: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>X</button>
                    )}
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

/* ---------- List ---------------------------------------------------------- */
export function ListBlock({ content, onChange, readOnly }) {
  const items   = Array.isArray(content.items) ? content.items : [];
  const ordered = content.ordered || false;

  if (readOnly) {
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag style={{ paddingLeft: 24, fontSize: 13, color: "#1e293b", lineHeight: 1.75 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </Tag>
    );
  }

  return (
    <div>
      <label style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <input type="checkbox" checked={ordered} onChange={(e) => onChange({ ...content, ordered: e.target.checked })} />
        Numbered list
      </label>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <span style={{ color: "#94a3b8", fontSize: 13, minWidth: 18 }}>{ordered ? (i + 1) + "." : "."}</span>
          <input value={item} onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange({ ...content, items: n }); }} style={{ flex: 1, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, outline: "none" }} />
          <button onClick={() => onChange({ ...content, items: items.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 13 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}>X</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...content, items: [...items, ""] })} style={ADD_BTN_STYLE}>+ Item</button>
    </div>
  );
}

/* ---------- Divider ------------------------------------------------------- */
export function DividerBlock() {
  return <hr style={{ border: "none", borderTop: "2px solid #e2e8f0", margin: "8px 0" }} />;
}

/* ---------- File ---------------------------------------------------------- */
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

/* ---------- Router -------------------------------------------------------- */
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

/* ---------- Default content per block type -------------------------------- */
export const DEFAULT_CONTENT = {
  PARAGRAPH:  { html: "" },
  HEADING:    { text: "Heading", level: 2 },
  IMAGE:      { url: "", alt: "", caption: "", widthPct: 100, align: "center" },
  IMAGE_GRID: { cols: [{ url: "", caption: "", alt: "" }, { url: "", caption: "", alt: "" }] },
  TABLE:      { headers: ["Column 1", "Column 2"], rows: [["", ""], ["", ""]] },
  LIST:       { items: [""], ordered: false },
  DIVIDER:    {},
  FILE:       { name: "", url: "" },
  KPI:        { kpi_id: "" },
};

/* ---------- Add-block strip ----------------------------------------------- */
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
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        Add block
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BLOCK_MENU.map((t) => (
          <button
            key={t.type}
            onClick={() => onAdd(t.type)}
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
