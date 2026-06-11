import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../../hooks/useApi";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

const C = {
  primary: "#4f8ef7", primaryDark: "#1565c0", primaryLt: "#e8f0fe",
  success: "#43a047", successLt: "#e8f5e9",
  danger: "#e53935", dangerLt: "#fef2f2",
  warning: "#f9a825", warningLt: "#fffde7",
  text: "#1a1a2e", textSub: "#555", border: "#e0e4ea",
  bg: "#f7f8fa", surface: "#fff",
  purple: "#7c4dff", purpleLt: "#ede7f6",
};

const STATUS_META = {
  NOT_STARTED:  { label: "Not Started",  color: C.textSub,  bg: "#f0f0f0"  },
  IN_PROGRESS:  { label: "In Progress",  color: C.primary,  bg: C.primaryLt },
  SUBMITTED:    { label: "Submitted",    color: C.warning,  bg: C.warningLt },
  UNDER_REVIEW: { label: "Under Review", color: C.purple,   bg: C.purpleLt  },
  APPROVED:     { label: "Approved",     color: C.success,  bg: C.successLt },
  SENT_BACK:    { label: "Sent Back",    color: C.danger,   bg: C.dangerLt  },
  LOCKED:       { label: "Locked",       color: "#555",     bg: "#e0e0e0"   },
};

const inp = {
  width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13,
  border: `1px solid ${C.border}`, borderRadius: 6, outline: "none",
  fontFamily: "inherit", background: C.surface, color: C.text,
};
const primaryBtn = {
  padding: "8px 18px", background: C.primary, color: "#fff",
  border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const outlineBtn = { ...primaryBtn, background: "transparent", color: C.primary, border: `1px solid ${C.primary}` };

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ReportStructurePage({ reportId, onNavigate }) {
  const { apiFetch } = useApi();
  const [report,   setReport]   = useState(null);
  const [sections, setSections] = useState([]);
  const [deptProgress, setDeptProgress] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [expanded, setExpanded] = useState({});
  const [hover,    setHover]    = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [newSecTitle, setNewSecTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, dashRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/reports/${reportId}`),
        apiJson(apiFetch, `/api/builder/reports/${reportId}/dashboard`).catch(() => ({ data: {} })),
      ]);
      setReport(repRes.data);
      const raw = repRes.data?.sections || [];
      // Build tree
      const roots = raw.filter(s => !s.parent_id).sort((a, b) => a.order_index - b.order_index);
      const tree  = roots.map(r => ({
        ...r,
        children: raw.filter(c => c.parent_id === r.id).sort((a, b) => a.order_index - b.order_index),
      }));
      setSections(tree);
      setDeptProgress(dashRes.data?.dept_progress || []);
    } catch {
      setToast({ type: "error", message: "Failed to load report structure" });
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const addSection = async (parentId = null) => {
    if (!newSecTitle.trim()) return;
    setBusy(true);
    try {
      const siblings = parentId
        ? (sections.find(s => s.id === parentId)?.children || [])
        : sections;
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order_index || 0), 0);
      await apiJson(apiFetch, "/api/builder/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id:   reportId,
          parent_id:   parentId || undefined,
          title:       newSecTitle.trim(),
          order_index: maxOrder + 1000,
        }),
      });
      setNewSecTitle("");
      setAddingTo(null);
      await load();
    } catch {
      setToast({ type: "error", message: "Failed to add section" });
    } finally {
      setBusy(false);
    }
  };

  const deleteSection = async (secId) => {
    if (!confirm("Delete this section and all its content?")) return;
    try {
      await apiJson(apiFetch, `/api/builder/sections/${secId}`, { method: "DELETE" });
      await load();
      setToast({ type: "success", message: "Section deleted" });
    } catch {
      setToast({ type: "error", message: "Failed to delete section" });
    }
  };

  /* ── progress math ── */
  const allSections = sections.flatMap(s => [s, ...(s.children || [])]);
  const total       = allSections.length;
  const done        = allSections.filter(s => ["APPROVED", "LOCKED"].includes(s.status)).length;
  const inProg      = allSections.filter(s => s.status === "IN_PROGRESS").length;
  const pct         = total ? Math.round((done / total) * 100) : 0;

  if (loading) return <LoadingState />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── header ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
                       padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{report?.title}</div>
          <div style={{ fontSize: 12, color: C.textSub }}>
            {report?.report_type} · {report?.academic_year} ·{" "}
            <StatusBadge status={report?.status} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={outlineBtn} onClick={() => onNavigate?.("assign", reportId)}>Assign Sections</button>
          <button style={primaryBtn} onClick={() => onNavigate?.("compile", reportId)}>Compile Report</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        {/* ── progress banner ── */}
        <ProgressBanner pct={pct} total={total} done={done} inProg={inProg} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, marginTop: 24 }}>

          {/* ── LEFT: section tree ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Sections</div>
              <button style={{ ...outlineBtn, fontSize: 12, padding: "5px 12px" }} onClick={() => setAddingTo("root")}>+ Add Section</button>
            </div>

            {addingTo === "root" && (
              <AddSectionInline
                value={newSecTitle} onChange={setNewSecTitle}
                onAdd={() => addSection(null)} onCancel={() => { setAddingTo(null); setNewSecTitle(""); }}
                busy={busy} />
            )}

            {sections.length === 0 && addingTo !== "root" && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#bbb", fontSize: 14 }}>
                No sections yet. Add the first section.
              </div>
            )}

            {sections.map(sec => (
              <SectionCard key={sec.id} sec={sec} depth={0}
                expanded={expanded[sec.id]} onToggle={() => toggleExpand(sec.id)}
                hover={hover} onHover={setHover}
                onEdit={() => onNavigate?.("editor", reportId)}
                onDelete={() => deleteSection(sec.id)}
                onAddChild={() => { setAddingTo(sec.id); setNewSecTitle(""); }}
                addingChild={addingTo === sec.id}
                newTitle={newSecTitle} onNewTitleChange={setNewSecTitle}
                onAddChildConfirm={() => addSection(sec.id)}
                onAddChildCancel={() => { setAddingTo(null); setNewSecTitle(""); }}
                busy={busy}
              />
            ))}
          </div>

          {/* ── RIGHT: department grid + status legend ── */}
          <div>
            <StatusDistribution sections={allSections} />
            {deptProgress.length > 0 && <DeptGrid depts={deptProgress} />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── SectionCard ─────────────────────────────────────────────────────────── */
function SectionCard({ sec, depth, expanded, onToggle, hover, onHover,
                       onEdit, onDelete, onAddChild,
                       addingChild, newTitle, onNewTitleChange, onAddChildConfirm, onAddChildCancel, busy }) {
  const meta    = STATUS_META[sec.status] || STATUS_META.NOT_STARTED;
  const isHover = hover === sec.id;
  const hasKids = (sec.children?.length ?? 0) > 0;

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onMouseEnter={() => onHover(sec.id)} onMouseLeave={() => onHover(null)}
        style={{ background: C.surface, border: `1px solid ${isHover ? C.primary : C.border}`,
                 borderRadius: 8, padding: "10px 14px", transition: "all .12s",
                 marginLeft: depth * 20, display: "flex", alignItems: "center", gap: 10,
                 boxShadow: isHover ? "0 2px 8px rgba(79,142,247,.12)" : "none" }}>

        {/* expand toggle */}
        <span style={{ width: 20, cursor: hasKids ? "pointer" : "default", color: "#aaa",
                       userSelect: "none", fontSize: 12, textAlign: "center" }}
          onClick={hasKids ? onToggle : undefined}>
          {hasKids ? (expanded ? "▼" : "▶") : "·"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis" }}>{sec.title}</div>
          {sec.description && (
            <div style={{ fontSize: 11, color: C.textSub, marginTop: 1 }}>{sec.description}</div>
          )}
        </div>

        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                       color: meta.color, background: meta.bg, flexShrink: 0 }}>
          {meta.label}
        </span>

        {/* hover actions */}
        {isHover && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <ActionBtn label="Edit" color={C.primary} onClick={onEdit} />
            {depth === 0 && <ActionBtn label="+ Sub" color={C.success} onClick={onAddChild} />}
            <ActionBtn label="Del" color={C.danger} onClick={onDelete} />
          </div>
        )}
      </div>

      {/* add subsection inline */}
      {addingChild && depth === 0 && (
        <div style={{ marginLeft: 20, marginTop: 4 }}>
          <AddSectionInline value={newTitle} onChange={onNewTitleChange}
            onAdd={onAddChildConfirm} onCancel={onAddChildCancel} busy={busy} />
        </div>
      )}

      {/* children */}
      {expanded && (sec.children || []).map(child => (
        <SectionCard key={child.id} sec={child} depth={depth + 1}
          expanded={false} onToggle={() => {}} hover={hover} onHover={onHover}
          onEdit={onEdit} onDelete={onDelete}
          addingChild={false} busy={false} />
      ))}
    </div>
  );
}

function AddSectionInline({ value, onChange, onAdd, onCancel, busy }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6,
                  background: C.primaryLt, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.primary}33` }}>
      <input style={{ ...inp, flex: 1 }} placeholder="Section title…" value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onAdd()} autoFocus />
      <button style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }} disabled={busy || !value.trim()} onClick={onAdd}>
        {busy ? "…" : "Add"}
      </button>
      <button style={{ ...outlineBtn, padding: "6px 10px", fontSize: 12 }} onClick={onCancel}>✕</button>
    </div>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ padding: "3px 9px", fontSize: 10, fontWeight: 700, border: `1px solid ${color}`,
               borderRadius: 5, cursor: "pointer", background: "transparent", color }}>
      {label}
    </button>
  );
}

/* ── ProgressBanner ──────────────────────────────────────────────────────── */
function ProgressBanner({ pct, total, done, inProg }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: C.text }}>Overall Progress</span>
            <span style={{ fontWeight: 700, color: C.primary }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: C.primary,
                          borderRadius: 4, transition: "width .4s ease" }} />
          </div>
        </div>
        <Stat label="Total" value={total} color={C.text} />
        <Stat label="Approved" value={done} color={C.success} />
        <Stat label="In Progress" value={inProg} color={C.primary} />
        <Stat label="Pending" value={total - done - inProg} color={C.textSub} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textSub }}>{label}</div>
    </div>
  );
}

/* ── StatusDistribution ─────────────────────────────────────────────────── */
function StatusDistribution({ sections }) {
  const groups = {};
  for (const s of sections) groups[s.status] = (groups[s.status] || 0) + 1;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Status Distribution</div>
      {Object.entries(STATUS_META).map(([k, v]) => {
        const n = groups[k] || 0;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11, color: C.text }}>{v.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: n > 0 ? v.color : "#ccc" }}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── DeptGrid ────────────────────────────────────────────────────────────── */
function DeptGrid({ depts }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Department Progress</div>
      {depts.map((d, i) => {
        const pct = d.total ? Math.round((d.approved / d.total) * 100) : 0;
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: C.text, fontWeight: 600 }}>{d.department_name}</span>
              <span style={{ color: C.textSub }}>{d.approved}/{d.total}</span>
            </div>
            <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: C.success, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.NOT_STARTED;
  return (
    <span style={{ padding: "1px 7px", borderRadius: 8, fontSize: 10, fontWeight: 700,
                   color: m.color, background: m.bg }}>{m.label}</span>
  );
}

function LoadingState() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.textSub }}>
      Loading report structure…
    </div>
  );
}
