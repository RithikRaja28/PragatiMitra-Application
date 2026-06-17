import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, UserPlus, Search, Check, UserCheck, Trash2 } from "lucide-react";
import { useApi } from "../../hooks/useApi";

const ACCENT = "#2563eb";

/* Assign Contributors modal — centered, 560px. Department Admin / Nodal Officer
   assign an already-accessible form to contributors in their own department for
   the selected academic year. Assignment only controls visibility. */
export default function AssignContributorsModal({ form, year, departmentName, onClose, onAssigned, showToast }) {
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contributors, setContributors] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");

  const yq = year != null ? `&year=${year}` : "";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/form-assignments/contributors?form_id=${form.id}${yq}`);
      const d = await res.json();
      if (d.success) { setContributors(d.contributors || []); setAssigned(d.assigned || []); }
      else showToast?.(d.message || "Failed to load contributors.", "error");
    } catch { showToast?.("Failed to load contributors.", "error"); }
    finally { setLoading(false); }
  }, [apiFetch, form.id, yq, showToast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const assignedIds = new Set(assigned.map((a) => a.assigned_to));
  const q = search.trim().toLowerCase();
  const available = contributors.filter(
    (c) => !assignedIds.has(c.id) && (!q || c.full_name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q))
  );

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function assign() {
    if (selected.size === 0 || saving) return;   // also guards against double-submit
    setSaving(true);
    try {
      const res = await apiFetch("/api/form-assignments", {
        method: "POST",
        body: JSON.stringify({ form_id: form.id, form_name: form.form_name, contributor_ids: Array.from(selected), year }),
      });
      const d = await res.json();
      if (d.success) {
        // Standard success lifecycle: notify parent (refresh) → reset → close.
        showToast?.(d.message || "Assigned successfully.");
        setSelected(new Set());
        onAssigned?.();
        onClose();
      } else {
        showToast?.(d.message || "Failed to assign.", "error");
        setSaving(false);
      }
    } catch {
      showToast?.("Failed to assign.", "error");
      setSaving(false);
    }
  }

  async function unassign(id) {
    try {
      const res = await apiFetch(`/api/form-assignments/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { await load(); onAssigned?.(); }
      else showToast?.(d.message || "Failed to remove.", "error");
    } catch { showToast?.("Failed to remove.", "error"); }
  }

  const sub = `${(form.form_name || "").toUpperCase()}${year != null ? ` · ${year}–${year + 1}` : ""}${departmentName ? ` · ${departmentName}` : ""}`;

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(12,18,32,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(16,24,40,0.22)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ width: 38, height: 38, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: ACCENT + "14", color: ACCENT }}><UserPlus size={18} strokeWidth={1.9} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#111827" }}>Assign Contributors</div>
            <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 6, borderRadius: 8, display: "inline-flex" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1 }}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contributors…" style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: "1px solid #D1D5DB", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Department Contributors</div>
          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : available.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{q ? "No matches." : "No more contributors to assign."}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 210, overflowY: "auto" }}>
              {available.map((c) => {
                const on = selected.has(c.id);
                return (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${on ? ACCENT : "#E5E7EB"}`, background: on ? ACCENT + "0c" : "#fff", cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ accentColor: ACCENT, width: 16, height: 16 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.email}</div>
                    </div>
                    {on && <Check size={14} color={ACCENT} style={{ marginLeft: "auto" }} />}
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, margin: "18px 0 8px" }}>Assigned ({assigned.length})</div>
          {assigned.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>No contributors assigned yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {assigned.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, border: "1px solid #E5E7EB", background: "#F8FAFC" }}>
                  <UserCheck size={15} color="#16a34a" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.full_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.email}</div>
                  </div>
                  <button onClick={() => unassign(a.id)} title="Remove assignment" style={{ background: "none", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 7, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#FAFBFC" }}>
          <button onClick={onClose} disabled={saving} style={{ height: 40, padding: "0 18px", borderRadius: 9, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={assign} disabled={saving || selected.size === 0} style={{ height: 40, padding: "0 20px", borderRadius: 9, border: "none", background: (saving || selected.size === 0) ? "#93c5fd" : ACCENT, color: "#fff", fontWeight: 700, fontSize: 13, cursor: (saving || selected.size === 0) ? "not-allowed" : "pointer" }}>
            {saving ? "Assigning…" : `Assign${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
