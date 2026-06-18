import React, { useState, useEffect, useCallback } from "react";
import { useApi }  from "../../../../hooks/useApi";
import { useAuth } from "../../../../store/AuthContext";
import TemplateCreationWizardPage from "./TemplateCreationWizardPage";

/* ── design tokens ─────────────────────────────────────────────────────── */
const C = {
  primary:   "#4f46e5", primaryDk: "#3730a3", primaryLt: "#eef2ff", primaryMid: "#818cf8",
  success:   "#059669", successLt: "#ecfdf5", successMid: "#34d399",
  warning:   "#d97706", warningLt: "#fffbeb", warningMid: "#fbbf24",
  danger:    "#dc2626", dangerLt:  "#fef2f2",
  slate:     "#64748b", slateLt:   "#f1f5f9", slateMid:  "#cbd5e1",
  text:      "#0f172a", textSub: "#475569", textMuted: "#94a3b8",
  border:    "#e2e8f0", bg: "#f8fafc", surface: "#fff",
};

const STATUS = {
  DRAFT:    { label: "Draft",    accent: "#f59e0b", accentLt: "#fef9c3", accentDk: "#92400e", dot: "#f59e0b" },
  ACTIVE:   { label: "Active",   accent: "#059669", accentLt: "#dcfce7", accentDk: "#14532d", dot: "#10b981" },
  ARCHIVED: { label: "Archived", accent: "#94a3b8", accentLt: "#f1f5f9", accentDk: "#475569", dot: "#94a3b8" },
};

async function apj(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(res.ok ? "Unexpected server response" : `Server error (${res.status})`);
  }
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

/* ════════════════════════════════════════════════════════════════════════
   ROOT — switches between list / create / edit views
════════════════════════════════════════════════════════════════════════ */
export default function TemplateListPage() {
  const [view,   setView]   = useState("list");
  const [editId, setEditId] = useState(null);

  const goList   = useCallback(() => { setView("list"); setEditId(null); }, []);
  const goCreate = useCallback(() => setView("create"), []);
  const goEdit   = useCallback((id) => { setEditId(id); setView("edit"); }, []);

  if (view === "create") return <TemplateCreationWizardPage onDone={goList} />;
  if (view === "edit" && editId) return <TemplateCreationWizardPage initialId={editId} onDone={goList} />;
  return <TemplateList onCreateNew={goCreate} onEdit={goEdit} />;
}

/* ════════════════════════════════════════════════════════════════════════
   TEMPLATE LIST
════════════════════════════════════════════════════════════════════════ */
function TemplateList({ onCreateNew, onEdit }) {
  const { apiFetch } = useApi();
  const { user }     = useAuth();

  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [busyId,    setBusyId]    = useState(null);
  const [filter,    setFilter]    = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const d = await apj(apiFetch, "/api/builder/templates");
      setTemplates(d.data || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id, status) {
    setBusyId(id);
    try {
      await apj(apiFetch, `/api/builder/templates/${id}/status`, {
        method: "PATCH", body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch (e) { setErr(e.message); }
    finally { setBusyId(null); }
  }

  const counts = { ALL: templates.length, DRAFT: 0, ACTIVE: 0, ARCHIVED: 0 };
  for (const t of templates) if (counts[t.status] !== undefined) counts[t.status]++;
  const visible = filter === "ALL" ? templates : templates.filter(t => t.status === filter);

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100vh", background: C.bg }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "28px 36px 24px",
      }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: C.primaryLt, border: `1.5px solid ${C.primaryMid}55`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>📋</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>
                Report Templates
              </h1>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: C.textSub }}>
                Build reusable section structures and publish them for report creation.
              </p>
            </div>
          </div>
          <button onClick={onCreateNew} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10,
            background: C.primary, color: "#fff",
            border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: 700,
            boxShadow: "0 2px 8px rgba(79,70,229,0.3)",
            transition: "transform 0.1s, box-shadow 0.1s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(79,70,229,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(79,70,229,0.3)"; }}
          >
            <span style={{ fontSize: 16, fontWeight: 400 }}>+</span>
            New Template
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 48px" }}>

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total",    value: counts.ALL,      color: C.primary,  bg: C.primaryLt, icon: "📁" },
            { label: "Active",   value: counts.ACTIVE,   color: C.success,  bg: C.successLt, icon: "✅" },
            { label: "Drafts",   value: counts.DRAFT,    color: C.warning,  bg: C.warningLt, icon: "✏️" },
            { label: "Archived", value: counts.ARCHIVED, color: C.slate,    bg: C.slateLt,   icon: "📦" },
          ].map(s => (
            <div key={s.label} style={{
              background: C.surface, borderRadius: 14, padding: "16px 18px",
              border: `1px solid ${C.border}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10,
                background: s.bg, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 18, flexShrink: 0,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, marginTop: 3,
                  textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Info banner ──────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", marginBottom: 20,
          background: "linear-gradient(90deg, #eff6ff, #f0f9ff)",
          border: "1px solid #bfdbfe", borderRadius: 10,
          fontSize: 12, color: "#1e40af",
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span>
            Only <strong>Active</strong> templates appear when institute admins create reports.
            Draft templates are invisible until published.
          </span>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {err && (
          <div style={{
            background: C.dangerLt, border: "1px solid #fca5a5", borderRadius: 10,
            padding: "12px 16px", color: C.danger, fontSize: 13, marginBottom: 20,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <span>✕</span><span>{err}</span>
          </div>
        )}

        {/* ── Filter tabs ──────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 20,
          background: C.surface, borderRadius: 10, padding: 5,
          border: `1px solid ${C.border}`, width: "fit-content",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          {[
            { key: "ALL",      label: "All" },
            { key: "ACTIVE",   label: "Active" },
            { key: "DRAFT",    label: "Drafts" },
            { key: "ARCHIVED", label: "Archived" },
          ].map(tab => {
            const active = filter === tab.key;
            return (
              <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
                padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                background: active ? C.primary : "transparent",
                color: active ? "#fff" : C.textSub,
                boxShadow: active ? "0 2px 6px rgba(79,70,229,0.25)" : "none",
              }}>
                {tab.label}
                <span style={{
                  marginLeft: 6, padding: "1px 7px", borderRadius: 20,
                  fontSize: 10, fontWeight: 700,
                  background: active ? "rgba(255,255,255,0.22)" : C.bg,
                  color: active ? "#fff" : C.textMuted,
                }}>{counts[tab.key]}</span>
              </button>
            );
          })}
        </div>

        {/* ── Loading skeletons ─────────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 16 }}>
            {[1,2,3].map(n => (
              <div key={n} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
                padding: 22, height: 180 }}>
                {[80, 50, 65].map((w,i) => (
                  <div key={i} style={{
                    height: i === 0 ? 16 : 11, width: `${w}%`, borderRadius: 6,
                    background: "#e2e8f0",
                    marginBottom: i === 0 ? 14 : 10,
                  }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && visible.length === 0 && (
          <div style={{
            textAlign: "center", padding: "64px 24px",
            background: C.surface, borderRadius: 16,
            border: `2px dashed ${C.border}`,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: C.primaryLt, margin: "0 auto 20px",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
            }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              {filter === "ALL" ? "No templates yet" : `No ${filter.toLowerCase()} templates`}
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 28, maxWidth: 340, margin: "0 auto 28px" }}>
              {filter === "ALL"
                ? "Create your first template to give report creators a head start with pre-built sections."
                : `No templates with "${filter.toLowerCase()}" status. Try switching the filter.`}
            </div>
            {filter === "ALL" && (
              <button onClick={onCreateNew} style={{
                padding: "11px 28px", background: C.primary, color: "#fff",
                border: "none", borderRadius: 10, cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                boxShadow: "0 4px 12px rgba(79,70,229,0.3)",
              }}>Create First Template</button>
            )}
          </div>
        )}

        {/* ── Template cards grid ───────────────────────────────────────── */}
        {!loading && visible.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px,1fr))", gap: 16 }}>
            {visible.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                busy={busyId === t.id}
                onEdit={onEdit}
                onChangeStatus={changeStatus}
              />
            ))}
          </div>
        )}

        {/* ── Draft warning bar ─────────────────────────────────────────── */}
        {!loading && counts.DRAFT > 0 && filter !== "ACTIVE" && (
          <div style={{
            marginTop: 24, padding: "13px 18px",
            background: "linear-gradient(90deg, #fffbeb, #fef3c7)",
            border: "1px solid #fde68a", borderRadius: 10,
            fontSize: 12, color: "#92400e",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>{counts.DRAFT} draft{counts.DRAFT !== 1 ? "s" : ""}</strong> not yet visible
              in report creation. Publish {counts.DRAFT === 1 ? "it" : "them"} to make
              {counts.DRAFT === 1 ? " it" : " them"} available.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TEMPLATE CARD
════════════════════════════════════════════════════════════════════════ */
function TemplateCard({ template: t, busy, onEdit, onChangeStatus }) {
  const [hover, setHover] = useState(false);
  const cfg   = STATUS[t.status] || STATUS.DRAFT;
  const isDraft    = t.status === "DRAFT";
  const isActive   = t.status === "ACTIVE";
  const isArchived = t.status === "ARCHIVED";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.surface, borderRadius: 14, overflow: "hidden",
        border: `1px solid ${hover ? cfg.accent + "55" : C.border}`,
        boxShadow: hover
          ? `0 8px 28px rgba(0,0,0,0.10), 0 0 0 1px ${cfg.accent}22`
          : "0 2px 8px rgba(0,0,0,0.05)",
        transition: "all 0.2s ease",
        display: "flex", flexDirection: "column",
        transform: hover ? "translateY(-2px)" : "none",
      }}
    >
      {/* coloured top strip by status */}
      <div style={{ height: 4, background: cfg.accent, flexShrink: 0 }} />

      {/* card body */}
      <div style={{ padding: "18px 20px 14px", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* top row: status badge + type pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {/* status */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: cfg.accentLt, color: cfg.accentDk,
            border: `1px solid ${cfg.accent}44`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
            {cfg.label}
          </div>

          {/* type pill */}
          {t.report_type && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
              background: C.primaryLt, color: C.primary,
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>{t.report_type}</span>
          )}
        </div>

        {/* name */}
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 5, lineHeight: 1.3 }}>
          {t.name}
        </div>

        {/* description */}
        {t.description ? (
          <div style={{
            fontSize: 12, color: C.textSub, marginBottom: 14, lineHeight: 1.55,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>{t.description}</div>
        ) : (
          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic", marginBottom: 14 }}>
            No description
          </div>
        )}

        {/* meta row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <MetaPill icon="📑" value={`${t.section_count ?? 0} section${Number(t.section_count) !== 1 ? "s" : ""}`}
            color={Number(t.section_count) > 0 ? C.primary : C.textMuted}
            bg={Number(t.section_count) > 0 ? C.primaryLt : C.bg} />
          <MetaPill icon="🔖" value={`v${t.version || "1.0"}`} color={C.textSub} bg={C.bg} />
        </div>

        {/* created by */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7, marginBottom: 16,
          paddingTop: 12, borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "linear-gradient(135deg, #c7d2fe, #a5b4fc)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: C.primaryDk, flexShrink: 0,
          }}>
            {(t.created_by_name || "?")[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 11, color: C.textMuted }}>
            {t.created_by_name || "Unknown"}
          </span>
        </div>

        {/* action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          {isDraft && (
            <>
              <CardBtn
                onClick={() => onEdit(t.id)}
                variant="ghost"
                style={{ flex: 1 }}
              >✏ Edit</CardBtn>
              <CardBtn
                onClick={() => onChangeStatus(t.id, "ACTIVE")}
                variant="success"
                busy={busy}
                style={{ flex: 1 }}
              >{busy ? "Publishing…" : "🚀 Publish"}</CardBtn>
            </>
          )}
          {isActive && (
            <>
              <CardBtn
                onClick={() => onEdit(t.id)}
                variant="primary"
                style={{ flex: 1 }}
              >✏ Edit</CardBtn>
              <CardBtn
                onClick={() => onChangeStatus(t.id, "ARCHIVED")}
                variant="ghost"
                busy={busy}
                style={{ flex: 1 }}
              >{busy ? "…" : "📦 Archive"}</CardBtn>
            </>
          )}
          {isArchived && (
            <>
              <CardBtn
                onClick={() => onEdit(t.id)}
                variant="ghost"
                style={{ flex: 1 }}
              >✏ Edit</CardBtn>
              <CardBtn
                onClick={() => onChangeStatus(t.id, "DRAFT")}
                variant="warning"
                busy={busy}
                style={{ flex: 1 }}
              >{busy ? "…" : "↩ Restore"}</CardBtn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── small helpers ─────────────────────────────────────────────────────── */
function MetaPill({ icon, value, color, bg }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: bg, color,
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      {value}
    </div>
  );
}

const CARD_BTN_STYLES = {
  primary: { bg: C.primaryLt,   color: C.primary,  border: `1px solid ${C.primaryMid}55` },
  success: { bg: "#dcfce7",     color: "#15803d",   border: "1px solid #86efac" },
  warning: { bg: "#fef9c3",     color: "#854d0e",   border: "1px solid #fde047" },
  ghost:   { bg: C.bg,          color: C.textSub,   border: `1px solid ${C.border}` },
};

function CardBtn({ onClick, variant = "ghost", busy, style: extraStyle, children }) {
  const s = CARD_BTN_STYLES[variant] || CARD_BTN_STYLES.ghost;
  return (
    <button
      onClick={onClick}
      disabled={!!busy}
      style={{
        padding: "7px 12px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontSize: 11, fontWeight: 700, border: s.border,
        background: s.bg, color: s.color, opacity: busy ? 0.6 : 1,
        transition: "opacity 0.15s", whiteSpace: "nowrap",
        textAlign: "center",
        ...extraStyle,
      }}
    >{children}</button>
  );
}
