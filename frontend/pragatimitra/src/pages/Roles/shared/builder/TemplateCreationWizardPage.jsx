/**
 * TemplateCreationWizardPage.jsx
 * Publication Cell — 3-step template creation wizard
 * Step 1: Details  →  Step 2: Structure & Blocks  →  Step 3: Review & Publish
 */
import React, { useState, useEffect, useRef } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import { Button } from "../../../../ui";
import {  Pencil, AlertTriangle } from "lucide-react";
import { useShell } from "../../../../components/Dashboard/shellContext";
import { BlockEditor, AddBlockMenu, DEFAULT_CONTENT, BLOCK_ICONS } from "./BlockEditors";

/* ─── colour tokens — matches app-wide theme (#2563eb blue) ────────────── */
/* Standardized to the project blue theme (src/ui/tokens.js). */
const C = {
  primary: "#2563eb", primaryDk: "#1d4ed8", primaryLt: "#dbeafe", primaryMid: "#93c5fd",
  success: "#16a34a", successLt: "#dcfce7",
  danger:  "#dc2626", dangerLt:  "#fef2f2",
  warning: "#d97706", warningLt: "#fef3c7",
  text:    "#111827", textSub: "#6b7280", textMuted: "#94a3b8",
  border:  "#e5e7eb", bg: "#f8fafc", surface: "#fff",
};
const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 13px", fontSize: 13,
  border: `1.5px solid ${C.border}`, borderRadius: 8, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const lbl = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.textSub,
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};

/* ─── block type colours ────────────────────────────────────────────────── */
const BLOCK_COLOR = {
  PARAGRAPH: "#3b82f6", HEADING: "#8b5cf6", TABLE: "#10b981",
  LIST: "#f59e0b", IMAGE: "#06b6d4", IMAGE_GRID: "#0d9488",
  FILE: "#ef4444", KPI: "#6366f1", CHART: "#f43f5e",
  DIVIDER: "#94a3b8", CHECKLIST: "#059669", EMBED: "#64748b",
};
const TYPE_LABELS = {
  PARAGRAPH: "Text", HEADING: "Heading", TABLE: "Table", LIST: "List",
  IMAGE: "Image", IMAGE_GRID: "Grid", DIVIDER: "Divider", FILE: "File",
  KPI: "KPI", CHART: "Chart", CHECKLIST: "Checklist", EMBED: "Embed",
};

const REPORT_TYPES = ["Annual", "Quarterly", "Monthly", "Assessment", "Accreditation", "Custom"];
const STEPS = ["Details", "Structure & Blocks", "Review & Publish"];

/* ─── helpers ───────────────────────────────────────────────────────────── */
async function apj(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(res.ok ? "Server returned unexpected response" : `Server error (${res.status}) — restart the backend`); }
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}
function buildTree(flat) {
  const map = {}; const roots = [];
  for (const s of flat) map[s.id] = { ...s, subsections: [] };
  for (const s of flat) {
    if (s.parent_id && map[s.parent_id]) map[s.parent_id].subsections.push(map[s.id]);
    else roots.push(map[s.id]);
  }
  roots.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  for (const r of roots) r.subsections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  return roots;
}

/* ─── SaveBadge ─────────────────────────────────────────────────────────── */
function SaveBadge({ label }) {
  if (!label) return null;
  const ok = label === "Saved" || label === "Deleted";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: ok ? C.successLt : "#eff6ff",
      color: ok ? C.success : C.primary,
      border: `1px solid ${ok ? "#86efac" : C.primaryMid}`,
    }}>
      {ok ? "✓" : "⟳"} {label}
    </span>
  );
}

/* ─── StepHeader ────────────────────────────────────────────────────────── */
function StepHeader({ step, onCancel, pageTitle }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50, background: C.surface,
      borderBottom: `1px solid ${C.border}`, padding: "0 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
    }}>
      {/* left: title */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.primaryLt,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="2" y="1" width="10" height="13" rx="1.5" stroke={C.primary} strokeWidth="1.4"/>
            <path d="M14 4v10a1.5 1.5 0 01-1.5 1.5H5" stroke={C.primary} strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M5 6h6M5 9h4" stroke={C.primary} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{pageTitle || "Create Report Template"}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
        </div>
      </div>

      {/* centre: step pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {STEPS.map((label, i) => {
          const done = i < step, active = i === step;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? C.success : active ? C.primary : C.bg,
                  color: done || active ? "#fff" : C.textMuted,
                  border: `2px solid ${done ? C.success : active ? C.primary : C.border}`,
                }}>{done ? "✓" : i + 1}</div>
                <span style={{ fontSize: 9, whiteSpace: "nowrap", fontWeight: active ? 700 : 400,
                  color: active ? C.primary : done ? C.success : C.textMuted }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 28, height: 2, marginBottom: 14, background: done ? C.success : C.border }} />
              )}
            </div>
          );
        })}
      </div>

      {/* right: cancel */}
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </header>
  );
}

/* ─── StepHeading ───────────────────────────────────────────────────────── */
function StepHeading({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", color: C.primary }}>{icon}</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.textSub, margin: 0, paddingLeft: 34 }}>{subtitle}</p>
      <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginTop: 16 }} />
    </div>
  );
}

/* ─── NavBar ────────────────────────────────────────────────────────────── */
function NavBar({ onBack, onNext, busy, showBack = true, nextLabel = "Next →" }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 32 }}>
      {showBack && onBack && (
        <Button variant="secondary" onClick={onBack} disabled={busy}>← Back</Button>
      )}
      {onNext && (
        <Button variant="primary" onClick={onNext} loading={busy} disabled={busy} style={{ minWidth: 140 }}>
          {busy ? "Saving…" : nextLabel}
        </Button>
      )}
    </div>
  );
}

/* ─── F helper ──────────────────────────────────────────────────────────── */
function F({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEP 1 — Template Details
═══════════════════════════════════════════════════════════════════════════ */
function Step1Details({ name, setName, desc, setDesc, reportType, setReportType,
  version, setVersion, wfId, setWfId, workflows, onNext, busy }) {
  return (
    <div>
      <StepHeading icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>} title="Template Details"
        subtitle="Name and describe this template. A draft is created when you click Next." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
        <div style={{ gridColumn: "1/-1" }}>
          <F label="Template Name *">
            <input style={inp} value={name} autoFocus onChange={e => setName(e.target.value)}
              placeholder="e.g. Annual NAAC Report Template"
              onFocus={e => (e.target.style.borderColor = C.primary)}
              onBlur={e  => (e.target.style.borderColor = C.border)} />
          </F>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <F label="Description">
            <textarea style={{ ...inp, height: 72, resize: "vertical", lineHeight: 1.6 }}
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Briefly describe the purpose of this template…"
              onFocus={e => (e.target.style.borderColor = C.primary)}
              onBlur={e  => (e.target.style.borderColor = C.border)} />
          </F>
        </div>
        <F label="Report Type">
          <select style={inp} value={reportType} onChange={e => setReportType(e.target.value)}>
            <option value="">— Select type —</option>
            {REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </F>
        <F label="Version">
          <div style={{ ...inp, display: "flex", alignItems: "center", gap: 8,
            background: C.bg, color: C.textSub, cursor: "default", userSelect: "none" }}>
            <span style={{ fontWeight: 700, color: C.primary }}>v{version || "1.0"}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>— auto-increments on each save</span>
          </div>
        </F>
        <div style={{ gridColumn: "1/-1" }}>
          <F label="Default Workflow (optional)">
            <select style={inp} value={wfId} onChange={e => setWfId(e.target.value)}>
              <option value="">— None —</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_default ? " (Default)" : ""}</option>)}
            </select>
          </F>
        </div>
      </div>
      <NavBar showBack={false} onNext={onNext} busy={busy} nextLabel={busy ? "Creating…" : "Create & Continue →"} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEP 2 — Section Tree + Block Panel
═══════════════════════════════════════════════════════════════════════════ */

/* ── SectionRow (recursive) ─────────────────────────────────────────────── */
function SectionRow({ sec, depth, sectionIndex, subIndex, selectedId, onSelect, onRename, onAddSub, onDelete, immutable, blockCount }) {
  const [editing,    setEditing]    = useState(false);
  const [localTitle, setLocalTitle] = useState(sec.title);
  const inputRef = useRef(null);
  useEffect(() => { setLocalTitle(sec.title); }, [sec.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const isSelected = sec.id === selectedId;
  const bc = blockCount?.[sec.id] ?? 0;
  const isRoot = depth === 0;

  /* label: "1" for root, "1.1" for sub */
  const numLabel = isRoot
    ? String((sectionIndex ?? 0) + 1)
    : `${(sectionIndex ?? 0) + 1}.${(subIndex ?? 0) + 1}`;

  return (
    <>
      {/* connector line indent for subsections */}
      <div style={{ position: "relative" }}>
        {!isRoot && (
          <div style={{
            position: "absolute", left: 20, top: 0, bottom: 0,
            width: 1, background: C.primaryMid, opacity: 0.5,
          }} />
        )}

        <div
          onClick={() => onSelect(sec)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: isRoot ? "9px 10px 9px 10px" : "7px 10px 7px 36px",
            background: isSelected
              ? C.primaryLt
              : "transparent",
            borderLeft: `3px solid ${isSelected ? C.primary : "transparent"}`,
            cursor: "pointer", transition: "background 0.12s",
            borderBottom: `1px solid ${C.border}`,
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f0f7ff"; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
        >
          {/* number badge */}
          <div style={{
            minWidth: isRoot ? 24 : 28, height: isRoot ? 24 : 20,
            borderRadius: isRoot ? 6 : 5,
            flexShrink: 0, fontSize: isRoot ? 10 : 9, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isSelected ? C.primary : (isRoot ? C.primaryLt : "#dbeafe"),
            color: isSelected ? "#fff" : C.primary,
            border: `1px solid ${isSelected ? C.primary : C.primaryMid}`,
          }}>{numLabel}</div>

          {/* title or rename input */}
          {editing ? (
            <input
              ref={inputRef}
              value={localTitle}
              onClick={e => e.stopPropagation()}
              onChange={e => setLocalTitle(e.target.value)}
              onBlur={() => {
                setEditing(false);
                const t = localTitle.trim();
                if (t && t !== sec.title) onRename(sec.id, t);
                else setLocalTitle(sec.title);
              }}
              onKeyDown={e => {
                if (e.key === "Enter")  e.target.blur();
                if (e.key === "Escape") { setLocalTitle(sec.title); setEditing(false); }
              }}
              style={{
                flex: 1, border: `1.5px solid ${C.primary}`, borderRadius: 6,
                padding: "3px 8px", fontSize: 12, outline: "none", fontFamily: "inherit",
                background: "#fff", color: C.text,
              }}
            />
          ) : (
            <span style={{
              flex: 1, fontSize: isRoot ? 12 : 11,
              fontWeight: isRoot ? 700 : 500,
              color: isSelected ? C.primaryDk : C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}>
              {sec.title}
            </span>
          )}

          {/* block count badge */}
          {bc > 0 && (
            <span style={{
              fontSize: 9, padding: "2px 6px",
              background: isSelected ? C.primaryMid : "#dbeafe",
              color: isSelected ? C.primaryDk : C.primary,
              borderRadius: 10, fontWeight: 700, flexShrink: 0,
            }}>
              {bc} {bc === 1 ? "block" : "blocks"}
            </span>
          )}

          {/* action buttons — always visible, no hover-to-discover */}
          {!editing && !immutable && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {/* rename */}
              <button
                title="Rename"
                onClick={() => setEditing(true)}
                style={{
                  width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.border}`,
                  background: "#fff", cursor: "pointer", color: C.textSub,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                  transition: "border-color 0.12s, color 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; }}
              ><Pencil size={12} /></button>

              {/* add subsection (root sections only) */}
              {isRoot && (
                <button
                  title="Add subsection"
                  onClick={() => onAddSub(sec.id)}
                  style={{
                    height: 22, padding: "0 7px", borderRadius: 5,
                    border: `1px solid ${C.border}`,
                    background: "#fff", cursor: "pointer",
                    color: C.textSub, fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 2,
                    transition: "border-color 0.12s, color 0.12s, background 0.12s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.color = "#16a34a"; e.currentTarget.style.background = "#f0fdf4"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; e.currentTarget.style.background = "#fff"; }}
                >＋ Sub</button>
              )}

              {/* delete */}
              <button
                title="Delete"
                onClick={() => onDelete(sec.id)}
                style={{
                  width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.border}`,
                  background: "#fff", cursor: "pointer", color: C.textSub,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                  transition: "border-color 0.12s, color 0.12s, background 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#fca5a5"; e.currentTarget.style.color = C.danger; e.currentTarget.style.background = "#fef2f2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; e.currentTarget.style.background = "#fff"; }}
              >✕</button>
            </div>
          )}
        </div>
      </div>

      {sec.subsections?.map((sub, si) => (
        <SectionRow key={sub.id} sec={sub} depth={depth + 1}
          sectionIndex={sectionIndex} subIndex={si}
          selectedId={selectedId} onSelect={onSelect} onRename={onRename}
          onAddSub={onAddSub} onDelete={onDelete} immutable={immutable}
          blockCount={blockCount}
        />
      ))}
    </>
  );
}

/* ── BlockRow ────────────────────────────────────────────────────────────── */
function BlockRow({ blk, onContentChange, onToggleRequired, onDelete, immutable, templateId }) {
  const label = TYPE_LABELS[blk.block_type] || blk.block_type;
  const color  = BLOCK_COLOR[blk.block_type] || C.primary;

  return (
    <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      {/* block header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 6, flexShrink: 0,
          background: `${color}18`, color, border: `1px solid ${color}44`,
        }}>{label.toUpperCase()}</span>

        {blk.is_required ? (
          <span style={{ fontSize: 10, padding: "2px 8px", background: "#fef3c7", color: "#b45309",
            border: "1px solid #fde68a", borderRadius: 10, fontWeight: 700 }}>Required</span>
        ) : (
          <span style={{ fontSize: 10, padding: "2px 8px", background: C.bg, color: C.textMuted,
            border: `1px solid ${C.border}`, borderRadius: 10, fontWeight: 600 }}>Optional</span>
        )}

        {!immutable && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => onToggleRequired(blk.id, blk.is_required)} style={{
              padding: "3px 10px", borderRadius: 6, border: "1px solid", cursor: "pointer",
              fontFamily: "inherit", fontSize: 10, fontWeight: 600,
              background: blk.is_required ? "#fef3c7" : C.surface,
              borderColor: blk.is_required ? "#f59e0b" : C.border,
              color: blk.is_required ? "#b45309" : C.textMuted,
            }}>
              {blk.is_required ? "Make optional" : "Mark required"}
            </button>
            <button onClick={() => onDelete(blk.id)} title="Delete block"
              style={{
                padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600,
                background: C.surface, color: C.danger, transition: "background 0.12s, border-color 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
            >Delete</button>
          </div>
        )}
      </div>
      {/* block editor */}
      <div style={{ padding: "14px 16px", background: C.surface }}>
        <BlockEditor
          block={{ block_type: blk.block_type, content: blk.default_content || {} }}
          onChange={content => onContentChange(blk.id, content)}
          readOnly={immutable}
          templateId={templateId}
        />
      </div>
    </div>
  );
}

/* ── HindiTitleEditor — inline Hindi title field for a selected section ── */
function HindiTitleEditor({ sec, onSave, apiFetch, immutable }) {
  const [val,       setVal]       = useState(sec.title_translations?.hi || "");
  const [busy,      setBusy]      = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => { setVal(sec.title_translations?.hi || ""); setSaved(false); }, [sec.id, sec.title_translations?.hi]);

  

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    try {
      await onSave(sec.id, val.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: "#fffbeb" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        Hindi Title (हिंदी शीर्षक)
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={val}
          onChange={e => { setVal(e.target.value); setSaved(false); }}
          disabled={immutable || busy}
          placeholder="हिंदी शीर्षक यहाँ लिखें…"
          style={{
            ...inp, flex: 1, fontSize: 13,
            border: `1.5px solid ${saved ? "#86efac" : "#fcd34d"}`,
            background: immutable ? C.bg : "#fff",
          }}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
        />
        {!immutable && (
          <>
            
            <button
              onClick={save}
              disabled={busy || !val.trim()}
              style={{
                padding: "6px 12px", borderRadius: 7, border: "none",
                background: saved ? C.success : C.primary, color: "#fff",
                cursor: busy || !val.trim() ? "not-allowed" : "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              }}
            >{saved ? "✓ Saved" : "Save"}</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Step2Structure ─────────────────────────────────────────────────────── */
function Step2Structure({
  tree, sections, selectedSec, setSelectedSec, blocks,
  immutable, savingLabel,
  onAddSection, onDeleteSection, onRenameSection, onSaveHindiTitle,
  onAddBlock, onUpdateBlock, onToggleRequired, onDeleteBlock,
  onBack, onNext, apiFetch, templateId,
}) {
  const blockCount = {};
  for (const s of sections) blockCount[s.id] = (s.blocks || []).length;

  const rootSections = tree; // already filtered/sorted

  return (
    <div>
      {/* heading */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "0 0 4px" }}>Structure &amp; Blocks</h2>
          <p style={{ fontSize: 12, color: C.textSub, margin: 0 }}>
            {immutable
              ? "This template is ACTIVE — structure is read-only."
              : "Add sections, then click a section to add content blocks on the right. Use ＋ Sub to add subsections."}
          </p>
        </div>
        <SaveBadge label={savingLabel} />
      </div>

      {/* How-to guide strip */}
      {!immutable && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
        }}>
          {[
            { n: "1", t: "Add sections on the left" },
            { n: "2", t: "Use the edit icon to rename, or + Sub to nest" },
            { n: "3", t: "Click a section to add blocks →" },
          ].map(h => (
            <div key={h.n} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "6px 12px", borderRadius: 8,
              background: C.primaryLt, border: `1px solid ${C.primaryMid}`,
              fontSize: 11, color: C.primaryDk, fontWeight: 500,
              flex: "1 1 auto",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5, background: C.primary, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, flexShrink: 0,
              }}>{h.n}</div>
              {h.t}
            </div>
          ))}
        </div>
      )}

      <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginBottom: 16 }} />

      {/* Split panel */}
      <div style={{
        display: "flex", gap: 0, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
        height: sections.length === 0 ? 400 : 560,
      }}>

        {/* ── LEFT: Section Tree ── */}
        <div style={{
          width: 300, borderRight: `1px solid ${C.border}`,
          background: C.bg, display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          {/* tree header */}
          <div style={{
            padding: "11px 12px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            background: C.surface,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Sections</span>
              {sections.length > 0 && (
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 10,
                  background: C.primaryLt, color: C.primary, fontWeight: 700,
                }}>{sections.length}</span>
              )}
            </div>
            {!immutable && (
              <button
                onClick={() => onAddSection(null)}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "5px 12px",
                  background: C.primary, color: "#fff", border: "none",
                  borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <span style={{ fontSize: 13 }}>＋</span> Section
              </button>
            )}
          </div>

          {/* tree body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tree.length === 0 ? (
              /* empty state */
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 12, background: C.primaryLt,
                  margin: "0 auto 14px",
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.primary,
                }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  No sections yet
                </div>
                <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6, marginBottom: 16 }}>
                  Sections are the main chapters.<br />
                  Subsections break each chapter down further.
                </div>
                {!immutable && (
                  <button
                    onClick={() => onAddSection(null)}
                    style={{
                      padding: "7px 16px", background: C.primary, color: "#fff",
                      border: "none", borderRadius: 8, cursor: "pointer",
                      fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                    }}
                  >＋ Add First Section</button>
                )}
              </div>
            ) : (
              <>
                {rootSections.map((sec, si) => (
                  <SectionRow
                    key={sec.id}
                    sec={sec}
                    depth={0}
                    sectionIndex={si}
                    selectedId={selectedSec?.id}
                    onSelect={setSelectedSec}
                    onRename={onRenameSection}
                    onAddSub={onAddSection}
                    onDelete={onDeleteSection}
                    immutable={immutable}
                    blockCount={blockCount}
                  />
                ))}

                {/* ghost "Add section" at bottom of list */}
                {!immutable && (
                  <button
                    onClick={() => onAddSection(null)}
                    style={{
                      width: "100%", padding: "10px 0",
                      border: "none", borderTop: `1px dashed ${C.border}`,
                      background: "transparent",
                      fontSize: 11, fontWeight: 700, color: C.textSub,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      transition: "color 0.12s, background 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.primary; e.currentTarget.style.background = C.primaryLt; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 13 }}>＋</span> Add Another Section
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Block Editor ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.surface, overflow: "hidden" }}>
          {!selectedSec ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 10, padding: 24,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, background: C.primaryLt,
                display: "flex", alignItems: "center", justifyContent: "center", color: C.primary,
              }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {tree.length === 0 ? "Add a section first" : "Select a section"}
              </div>
              <div style={{ fontSize: 12, color: C.textSub, textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>
                {tree.length === 0
                  ? "Use the ＋ Section button on the left to create your first section."
                  : "Click any section or subsection on the left to manage its content blocks here."}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* selected section header */}
              <div style={{
                padding: "11px 16px", borderBottom: `1px solid ${C.border}`,
                background: C.primaryLt, display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: C.primary,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", flexShrink: 0,
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: C.primaryDk,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{selectedSec.title}</div>
                  <div style={{ fontSize: 10, color: C.primary, marginTop: 1 }}>
                    {blocks.length} block{blocks.length !== 1 ? "s" : ""}
                    {blocks.filter(b => b.is_required).length > 0
                      && ` · ${blocks.filter(b => b.is_required).length} required`}
                  </div>
                </div>
              </div>

              {/* Hindi title editor */}
              <HindiTitleEditor
                sec={selectedSec}
                onSave={onSaveHindiTitle}
                apiFetch={apiFetch}
                immutable={immutable}
              />

              {/* blocks list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                {blocks.length === 0 && (
                  <div style={{
                    textAlign: "center", padding: "24px 0 12px",
                    color: C.textMuted, fontSize: 12,
                  }}>
                    {immutable ? "No blocks in this section." : "No content blocks yet — add one below to define what contributors will fill in."}
                  </div>
                )}
                {blocks.map(blk => (
                  <BlockRow key={blk.id} blk={blk}
                    onContentChange={onUpdateBlock}
                    onToggleRequired={onToggleRequired}
                    onDelete={onDeleteBlock}
                    immutable={immutable}
                    templateId={templateId}
                  />
                ))}
                {!immutable && (
                  <div style={{
                    marginTop: 8, padding: "12px 14px",
                    background: C.bg, border: `1.5px dashed ${C.border}`,
                    borderRadius: 10,
                  }}>
                    <AddBlockMenu onAdd={onAddBlock} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* nav */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <button onClick={onBack} style={{
          padding: "9px 22px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
        }}>← Back</button>
        <button onClick={onNext} style={{
          padding: "9px 28px", background: C.primary, border: "none", borderRadius: 9, cursor: "pointer",
          fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "inherit",
          boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
        }}>Review →</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEP 3 — Review & Publish
═══════════════════════════════════════════════════════════════════════════ */
function SumCard({ label, icon, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}
function SumRow({ k, v, accent }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 5, alignItems: "flex-start" }}>
      <span style={{ color: C.textMuted, minWidth: 130, flexShrink: 0 }}>{k}:</span>
      <span style={{ color: accent || C.text, fontWeight: accent ? 700 : 600 }}>{String(v ?? "—")}</span>
    </div>
  );
}

function Step3Review({ name, desc, reportType, version, sections, tmplStatus, published, busy, onBack, onPublish, onReset, onDone, isEditing }) {
  const sectionCount  = sections.length;
  const totalBlocks   = sections.reduce((n, s) => n + (s.blocks?.length || 0), 0);
  const requiredBlocks = sections.reduce((n, s) => n + (s.blocks || []).filter(b => b.is_required).length, 0);
  const emptySections = sections.filter(s => !s.blocks?.length);

  if (published || tmplStatus === "ACTIVE") {
    return (
      <div style={{ textAlign: "center", padding: "56px 0" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.successLt,
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: C.success }}>Template Published!</h3>
        <p style={{ color: C.textSub, fontSize: 13, marginBottom: 32, maxWidth: 400, margin: "8px auto 32px" }}>
          <strong>{name}</strong> is now <strong>ACTIVE</strong> and visible to institute admins for stamping onto reports.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {!isEditing && (
            <button onClick={onReset} style={{
              padding: "9px 22px", background: C.surface, border: `1.5px solid ${C.border}`,
              borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
            }}>+ Create Another</button>
          )}
          <button onClick={onDone} style={{
            padding: "9px 28px", background: C.success, border: "none", borderRadius: 9, cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
          }}>Done ✓</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeading icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>} title="Review & Publish"
        subtitle="Everything is auto-saved. Publish to make this template available to institute admins." />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {/* summary card */}
        <SumCard label="Template Details" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}>
          <SumRow k="Name"        v={name || "—"} />
          <SumRow k="Description" v={desc || "—"} />
          <SumRow k="Report Type" v={reportType || "—"} />
          <SumRow k="Version"     v={version || "1.0"} />
          <SumRow k="Status"      v={tmplStatus}
            accent={tmplStatus === "ACTIVE" ? C.success : tmplStatus === "DRAFT" ? C.warning : undefined} />
        </SumCard>

        {/* structure card */}
        <SumCard label="Structure" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}>
          <SumRow k="Sections"       v={sectionCount} />
          <SumRow k="Total Blocks"   v={totalBlocks} />
          <SumRow k="Required Blocks" v={requiredBlocks} />
          {sections.slice(0, 8).map((s, i) => (
            <div key={s.id} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 12 }}>
              <span style={{ minWidth: 20, color: C.textMuted, fontWeight: 600 }}>{i + 1}.</span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                {s.title || "(untitled)"}
                {(s.blocks?.length || 0) > 0 && (
                  <span style={{ color: C.textMuted, fontWeight: 400 }}> — {s.blocks.length} block{s.blocks.length !== 1 ? "s" : ""}</span>
                )}
              </span>
            </div>
          ))}
          {sections.length > 8 && <div style={{ fontSize: 11, color: C.textMuted }}>…and {sections.length - 8} more</div>}
        </SumCard>

        {/* warnings */}
        {emptySections.length > 0 && (
          <div style={{ background: C.warningLt, border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> Sections with no blocks</div>
            {emptySections.map(s => (
              <div key={s.id} style={{ fontSize: 12, color: "#b45309", marginLeft: 8, marginBottom: 2 }}>• {s.title}</div>
            ))}
            <div style={{ fontSize: 11, color: "#d97706", marginTop: 8 }}>
              You can still publish — writers will see empty sections in the report.
            </div>
          </div>
        )}

        {/* info */}
        <div style={{ background: C.successLt, border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#166534" }}>
          All changes are saved in real time. Click <strong>Publish</strong> to make this template available, or <strong>Save as Draft</strong> to continue editing later.
        </div>
      </div>

      {/* action zone */}
      <div style={{
        padding: "20px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button onClick={onBack} style={{
          padding: "9px 22px", background: "transparent", border: `1.5px solid ${C.border}`,
          borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
        }}>← Back</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDone} style={{
            padding: "9px 22px", background: C.surface, border: `1.5px solid ${C.border}`,
            borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub, fontFamily: "inherit",
          }}>Save as Draft</button>
          <button onClick={onPublish} disabled={busy} style={{
            padding: "9px 28px", background: busy ? C.primaryMid : C.primary, border: "none", borderRadius: 9,
            cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: "#fff",
            fontFamily: "inherit", boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
          }}>{busy ? "Publishing…" : "Publish Template →"}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN WIZARD
═══════════════════════════════════════════════════════════════════════════ */
export default function TemplateCreationWizardPage({ initialId = null, onDone: onDoneProp }) {
  const { apiFetch } = useApi();
  const { user }     = useAuth();
  const shell        = useShell();

  const [step,      setStep]      = useState(0);
  const [err,       setErr]       = useState("");
  const [busy,      setBusy]      = useState(false);

  // Step 1 fields
  const [templateId, setTemplateId] = useState(null);
  const [name,       setName]       = useState("");
  const [desc,       setDesc]       = useState("");
  const [reportType, setReportType] = useState("");
  const [version,    setVersion]    = useState("1.0");
  const [wfId,       setWfId]       = useState("");
  const [workflows,  setWorkflows]  = useState([]);

  // Step 2 state
  const [sections,    setSections]    = useState([]);
  const [secFetched,  setSecFetched]  = useState(false);
  const [selectedSec, setSelectedSec] = useState(null);
  const [blocks,      setBlocks]      = useState([]);
  const [savingLabel, setSavingLabel] = useState("");

  // Step 3
  const [published,  setPublished]  = useState(false);
  const [tmplStatus, setTmplStatus] = useState("DRAFT");

  const tree     = buildTree(sections);
  const blkTimers = useRef({});

  const flash = (msg) => {
    setSavingLabel(msg);
    if (msg === "Saved" || msg === "Deleted") setTimeout(() => setSavingLabel(""), 1800);
  };

  // Load workflows
  useEffect(() => {
    if (!user?.institutionId) return;
    apiFetch(`/api/builder/workflows?institution_id=${user.institutionId}`)
      .then(r => r.json()).then(d => { if (d?.success) setWorkflows(d.data || []); }).catch(() => {});
  }, [user?.institutionId]);

  // When editing an existing template, pre-fill fields
  useEffect(() => {
    if (!initialId) return;
    setTemplateId(initialId);
    apj(apiFetch, `/api/builder/templates/${initialId}`)
      .then(d => {
        const t = d.data;
        setName(t.name || "");
        setDesc(t.description || "");
        setReportType(t.report_type || "");
        setVersion(t.version || "1.0");
        setWfId(t.default_workflow_id || "");
        setTmplStatus(t.status || "DRAFT");
      })
      .catch(() => {});
  }, [initialId]);

  // Load sections when template is created
  useEffect(() => {
    if (!templateId || secFetched) return;
    apj(apiFetch, `/api/builder/templates/${templateId}`)
      .then(d => { setSections(d.data?.sections || []); setTmplStatus(d.data?.status || "DRAFT"); setSecFetched(true); })
      .catch(() => setSecFetched(true));
  }, [templateId, secFetched]);

  // Sync blocks when selection changes
  useEffect(() => {
    if (!selectedSec) { setBlocks([]); return; }
    const sec = sections.find(s => s.id === selectedSec.id);
    setBlocks((sec?.blocks || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
  }, [selectedSec?.id, sections]);

  /* helpers */
  async function reloadSections() {
    const d = await apj(apiFetch, `/api/builder/templates/${templateId}`);
    setSections(d.data?.sections || []);
  }

  async function addSection(parentId) {
    setErr(""); flash("Saving…");
    try {
      const res = await apj(apiFetch, `/api/builder/templates/${templateId}/sections`, {
        method: "POST", body: JSON.stringify({ title: "New Section", parent_id: parentId || null }),
      });
      await reloadSections(); flash("Saved"); setSelectedSec(res.data);
    } catch (e) { setErr(e.message); flash(""); }
  }

  async function deleteSection(secId) {
    setErr(""); flash("Deleting…");
    try {
      await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${secId}`, { method: "DELETE" });
      if (selectedSec?.id === secId) setSelectedSec(null);
      await reloadSections(); flash("Deleted");
    } catch (e) { setErr(e.message); flash(""); }
  }

  async function renameSection(secId, title) {
    setErr(""); flash("Saving…");
    try {
      await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${secId}`, {
        method: "PUT", body: JSON.stringify({ title }),
      });
      setSections(prev => prev.map(s => s.id === secId ? { ...s, title } : s));
      if (selectedSec?.id === secId) setSelectedSec(prev => ({ ...prev, title }));
      flash("Saved");
    } catch (e) { setErr(e.message); flash(""); }
  }

  async function saveHindiTitle(secId, hiTitle) {
    const title_translations = { hi: hiTitle };
    await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${secId}`, {
      method: "PUT", body: JSON.stringify({ title_translations }),
    });
    setSections(prev => prev.map(s => s.id === secId
      ? { ...s, title_translations: { ...(s.title_translations || {}), hi: hiTitle } } : s));
    if (selectedSec?.id === secId)
      setSelectedSec(prev => ({ ...prev, title_translations: { ...(prev.title_translations || {}), hi: hiTitle } }));
  }

  async function addBlock(blockType) {
    if (!selectedSec) return;
    setErr(""); flash("Saving…");
    try {
      const res = await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${selectedSec.id}/blocks`, {
        method: "POST",
        body: JSON.stringify({ block_type: blockType, default_content: DEFAULT_CONTENT[blockType] || {}, is_required: false }),
      });
      const nb = res.data;
      setBlocks(prev => [...prev, nb]);
      setSections(prev => prev.map(s => s.id === selectedSec.id ? { ...s, blocks: [...(s.blocks || []), nb] } : s));
      flash("Saved");
    } catch (e) { setErr(e.message); flash(""); }
  }

  function updateBlockContent(blkId, content) {
    setBlocks(prev => prev.map(b => b.id === blkId ? { ...b, default_content: content } : b));
    clearTimeout(blkTimers.current[blkId]);
    blkTimers.current[blkId] = setTimeout(async () => {
      flash("Saving…");
      try {
        await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${selectedSec.id}/blocks/${blkId}`, {
          method: "PUT", body: JSON.stringify({ default_content: content }),
        });
        flash("Saved");
      } catch (e) { setErr(e.message); flash(""); }
    }, 700);
  }

  async function toggleRequired(blkId, current) {
    setErr(""); flash("Saving…");
    try {
      const res = await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${selectedSec.id}/blocks/${blkId}`, {
        method: "PUT", body: JSON.stringify({ is_required: !current }),
      });
      setBlocks(prev => prev.map(b => b.id === blkId ? { ...b, is_required: res.data.is_required } : b));
      flash("Saved");
    } catch (e) { setErr(e.message); flash(""); }
  }

  async function deleteBlock(blkId) {
    setErr(""); flash("Deleting…");
    try {
      await apj(apiFetch, `/api/builder/templates/${templateId}/sections/${selectedSec.id}/blocks/${blkId}`, { method: "DELETE" });
      setBlocks(prev => prev.filter(b => b.id !== blkId));
      setSections(prev => prev.map(s =>
        s.id === selectedSec.id ? { ...s, blocks: (s.blocks || []).filter(b => b.id !== blkId) } : s
      ));
      flash("Deleted");
    } catch (e) { setErr(e.message); flash(""); }
  }

  /* step navigation */
  async function handleStep1Next() {
    setErr(""); setBusy(true);
    try {
      if (!name.trim()) throw new Error("Template name is required");
      const payload = { name: name.trim(), description: desc || null, report_type: reportType || null,
        default_workflow_id: wfId || null };
      if (!templateId) {
        const res = await apj(apiFetch, "/api/builder/templates", { method: "POST", body: JSON.stringify(payload) });
        setTemplateId(res.data.id); setTmplStatus(res.data.status || "DRAFT");
        setVersion(res.data.version || "1.0");
      } else {
        const res = await apj(apiFetch, `/api/builder/templates/${templateId}`, { method: "PUT", body: JSON.stringify(payload) });
        setVersion(res.data.version || version);
      }
      setSecFetched(false); setStep(1);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function handlePublish() {
    setErr(""); setBusy(true);
    try {
      await apj(apiFetch, `/api/builder/templates/${templateId}/status`, {
        method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }),
      });
      setTmplStatus("ACTIVE"); setPublished(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function handleDone() {
    if (onDoneProp) { onDoneProp(); return; }
    shell?.setActiveId?.("pc-templates");
  }

  function resetWizard() {
    setStep(0); setTemplateId(null); setName(""); setDesc(""); setReportType(""); setVersion("1.0"); setWfId("");
    setSections([]); setSecFetched(false); setSelectedSec(null); setBlocks([]);
    setPublished(false); setTmplStatus("DRAFT"); setErr("");
  }

  const immutable = false;

  return (
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <StepHeader step={step} pageTitle={initialId ? "Edit Template" : "Create Report Template"} onCancel={handleDone} />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 100px" }}>
        {err && (
          <div style={{ background: C.dangerLt, border: "1px solid #fca5a5", borderRadius: 8,
            padding: "10px 16px", color: C.danger, fontSize: 13, marginBottom: 20 }}>
            {err}
          </div>
        )}

        {step === 0 && (
          <Step1Details
            name={name} setName={setName} desc={desc} setDesc={setDesc}
            reportType={reportType} setReportType={setReportType}
            version={version} setVersion={setVersion} wfId={wfId} setWfId={setWfId}
            workflows={workflows} onNext={handleStep1Next} busy={busy}
          />
        )}

        {step === 1 && templateId && (
          <Step2Structure
            tree={tree} sections={sections}
            selectedSec={selectedSec} setSelectedSec={setSelectedSec}
            blocks={blocks} immutable={immutable} savingLabel={savingLabel}
            onAddSection={addSection} onDeleteSection={deleteSection} onRenameSection={renameSection}
            onSaveHindiTitle={saveHindiTitle} apiFetch={apiFetch}
            onAddBlock={addBlock} onUpdateBlock={updateBlockContent}
            onToggleRequired={toggleRequired} onDeleteBlock={deleteBlock}
            onBack={() => setStep(0)} onNext={() => setStep(2)}
            templateId={templateId}
          />
        )}

        {step === 2 && (
          <Step3Review
            name={name} desc={desc} reportType={reportType} version={version}
            sections={sections} tmplStatus={tmplStatus}
            published={published} busy={busy}
            onBack={() => setStep(1)} onPublish={handlePublish}
            onReset={resetWizard} onDone={handleDone}
            isEditing={!!initialId}
          />
        )}
      </main>
    </div>
  );
}
