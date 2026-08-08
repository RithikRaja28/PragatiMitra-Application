import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, GraduationCap, Search, Check, UserCheck, Trash2, Building2, AlertTriangle } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";

const ACCENT = "#7c3aed";

/* ─────────────────────────────────────────────────────────────────────────
   AssignPgStudentsModal

   Props:
     form       — { id, form_name }
     year       — academic year int | null
     scope      — "department" (default) | "institute"
                  Controls which students are LISTED:
                    department → only this dept's PG students
                    institute  → all institution PG students + dept filter dropdown
     formType   — "institute" (default) | "department"
                  Controls which endpoint is called for the actual ASSIGNMENT:
                    institute  → POST /api/form-assignments/pg-student
                    department → POST /api/form-assignments/dept-assign
     onClose    — () => void
     onAssigned — () => void
     showToast  — (msg, type?) => void

   Why scope ≠ formType:
     A department_admin on the Institute Form Data page needs scope="department"
     (they see only their dept's PG students) but formType="institute" (the form
     lives in table_list, so the pg-student endpoint must be called, not dept-assign
     which validates against department_table_list and returns 404 for inst forms).
 ─────────────────────────────────────────────────────────────────────────── */
export default function AssignPgStudentsModal({
  form, year,
  scope = "department",
  formType = "institute",
  onClose, onAssigned, showToast,
}) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();

  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [assigned, setAssigned]       = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter]   = useState("");
  const [selected, setSelected]       = useState(() => new Set());
  const [search, setSearch]           = useState("");
  const [errorMsg, setErrorMsg]       = useState("");

  // Always use /pg-students for listing — it handles both dept-scope (when the
  // caller has a departmentId) and institute-scope (when no departmentId) correctly.
  // /dept-assignable is ONLY for listing, but /pg-students covers both cases and
  // also returns the departments array needed for the inst-scope filter dropdown.
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const yq = year != null ? `&year=${year}` : "";
      const res = await apiFetch(`/api/form-assignments/pg-students?form_id=${form.id}${yq}`);
      const d = await res.json();
      if (d.success) {
        setAllStudents(d.pgStudents || []);
        setAssigned(d.assigned || []);
        if (scope === "institute") setDepartments(d.departments || []);
      } else {
        showToast?.(d.message || "Failed to load PG students.", "error");
      }
    } catch {
      showToast?.("Failed to load PG students.", "error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, form.id, year, scope, showToast]);

  useEffect(() => {
    setSelected(new Set());
    setSearch("");
    setDeptFilter("");
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const assignedIds = new Set(assigned.map((a) => a.assigned_to));

  const available = useMemo(() => {
    let list = allStudents.filter((s) => !assignedIds.has(s.id));
    if (scope === "institute" && deptFilter) {
      list = list.filter((s) => s.department_id === deptFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => s.full_name.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q));
    }
    return list;
  }, [allStudents, assignedIds, deptFilter, scope, search]);

  const visibleAssigned = useMemo(() => {
    if (scope === "institute" && deptFilter) {
      return assigned.filter((a) => a.department_id === deptFilter);
    }
    return assigned;
  }, [assigned, deptFilter, scope]);

  const toggle = (id) => {
    setErrorMsg("");
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  async function assign() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const ids = Array.from(selected);
      let url, body;
      // Use formType (not scope) to pick the endpoint — scope only controls which
      // students are listed, formType determines which form table the form lives in.
      if (formType === "department") {
        url  = "/api/form-assignments/dept-assign";
        body = JSON.stringify({ form_id: form.id, form_name: form.form_name, role: "pg_student", user_ids: ids, year });
      } else {
        url  = "/api/form-assignments/pg-student";
        body = JSON.stringify({ form_id: form.id, form_name: form.form_name, pg_student_ids: ids, year });
      }
      const res = await apiFetch(url, { method: "POST", body });
      const d = await res.json();
      if (d.success) {
        showToast?.(d.message || "Assigned successfully.");
        setSelected(new Set());
        onAssigned?.();
        onClose();
      } else {
        // Show error inline inside the modal so it's visible regardless of scroll
        setErrorMsg(d.message || "Failed to assign.");
        showToast?.(d.message || "Failed to assign.", "error");
        setSaving(false);
      }
    } catch {
      setErrorMsg("A network error occurred. Please try again.");
      showToast?.("Failed to assign.", "error");
      setSaving(false);
    }
  }

  async function unassign(id) {
    setErrorMsg("");
    try {
      const res = await apiFetch(`/api/form-assignments/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { await load(); onAssigned?.(); }
      else {
        setErrorMsg(d.message || "Failed to remove.");
        showToast?.(d.message || "Failed to remove.", "error");
      }
    } catch {
      setErrorMsg("Failed to remove.");
      showToast?.("Failed to remove.", "error");
    }
  }

  // Prefer the user's originally-typed name over the raw internal slug —
  // duplicate names are now auto-uniquified internally (krish/krish_2/...),
  // so showing the raw slug here would leak that suffix to users.
  const sub = `${(form.form_display_name || form.form_name || "").toUpperCase()}${year != null ? ` · ${year}–${year + 1}` : ""}`;

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(12,18,32,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(16,24,40,0.22)", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ width: 38, height: 38, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: ACCENT + "14", color: ACCENT }}>
            <GraduationCap size={18} strokeWidth={1.9} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#111827" }}>{t("Assign PG Students", lang)}</div>
            <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 6, borderRadius: 8, display: "inline-flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1 }}>

          {/* Inline error banner — always visible inside the modal */}
          {errorMsg && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 9, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 14 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Department filter — institute scope only */}
          {scope === "institute" && departments.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Building2 size={14} color="#6B7280" style={{ flexShrink: 0 }} />
              <select
                value={deptFilter}
                onChange={(e) => { setDeptFilter(e.target.value); setSelected(new Set()); }}
                style={{ flex: 1, height: 38, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 9, fontSize: 13, outline: "none", background: "#fff", color: "#374151", cursor: "pointer" }}
              >
                <option value="">{t("All Departments", lang)}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search PG students…", lang)}
              style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: "1px solid #D1D5DB", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            {scope === "institute" ? t("PG Students", lang) : t("Department PG Students", lang)}
          </div>

          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("Loading…", lang)}</div>
          ) : available.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              {search.trim() ? t("No matches.", lang) : t("No more PG students to assign.", lang)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 210, overflowY: "auto" }}>
              {available.map((u) => {
                const on = selected.has(u.id);
                return (
                  <label
                    key={u.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${on ? ACCENT : "#E5E7EB"}`, background: on ? ACCENT + "0c" : "#fff", cursor: "pointer" }}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(u.id)} style={{ accentColor: ACCENT, width: 16, height: 16 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{u.full_name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{u.email}</span>
                        {scope === "institute" && u.department_name && (
                          <span style={{ padding: "1px 7px", borderRadius: 4, background: "#f3f4f6", color: "#6B7280", fontWeight: 600 }}>{u.department_name}</span>
                        )}
                      </div>
                    </div>
                    {on && <Check size={14} color={ACCENT} style={{ marginLeft: "auto", flexShrink: 0 }} />}
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, margin: "18px 0 8px" }}>
            {t("Assigned", lang)} ({visibleAssigned.length})
          </div>
          {visibleAssigned.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{t("No PG students assigned yet.", lang)}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visibleAssigned.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, border: "1px solid #E5E7EB", background: "#F8FAFC" }}>
                  <UserCheck size={15} color={ACCENT} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.full_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{a.email}</span>
                      {scope === "institute" && a.department_name && (
                        <span style={{ padding: "1px 7px", borderRadius: 4, background: "#f3f4f6", color: "#6B7280", fontWeight: 600 }}>{a.department_name}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => unassign(a.id)}
                    title="Remove assignment"
                    style={{ background: "none", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 7, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#FAFBFC" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ height: 40, padding: "0 18px", borderRadius: 9, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            {t("Cancel", lang)}
          </button>
          <button
            onClick={assign}
            disabled={saving || selected.size === 0}
            style={{ height: 40, padding: "0 20px", borderRadius: 9, border: "none", background: (saving || selected.size === 0) ? ACCENT + "7f" : ACCENT, color: "#fff", fontWeight: 700, fontSize: 13, cursor: (saving || selected.size === 0) ? "not-allowed" : "pointer" }}
          >
            {saving ? t("Assigning…", lang) : (selected.size ? `${t("Assign", lang)} (${selected.size})` : t("Assign", lang))}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
