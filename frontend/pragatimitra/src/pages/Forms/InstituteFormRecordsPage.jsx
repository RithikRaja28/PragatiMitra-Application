import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import { useLanguage } from "../../i18n/LanguageContext";
import { Toast, isAuthError, formatDate } from "../../components/shared/formUtils";

const ACCENT = "#0891b2";

/* ── helpers ── */
function dbCol(col) {
  return col.trim().toLowerCase().replace(/\s+/g, "_");
}
function displayCol(col) {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Icons ── */
function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconUnlock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

/* ── Document cell — open URL in new tab ── */
function DocumentCell({ url }) {
  if (!url) return <span style={{ color: "#cbd5e1" }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: ACCENT, fontSize: 12, fontWeight: 600, textDecoration: "none",
      }}
    >
      <IconFile /> View Doc ↗
    </a>
  );
}

const PAGE_SIZE = 15;

/* ════════════════════════════════════════════════════════════════════
   InstituteFormRecordsPage
   Institution-admin VIEW-ONLY page. ONE unified table — records are
   sorted by department but live in the same table, with department
   name shown on every row.
════════════════════════════════════════════════════════════════════ */
export default function InstituteFormRecordsPage({ form, onBack }) {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();

  const [grouped, setGrouped] = useState({});
  const [departments, setDepartments] = useState([]);
  const [schema, setSchema] = useState(null);
  const [lockInfo, setLockInfo] = useState({ is_locked: false, locked_by: null, locked_at: null });
  const [lockToggling, setLockToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("__all__");
  const [page, setPage] = useState(1);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch records and authoritative lock status in parallel.
      // Reading lock-status separately guarantees the toggle reflects the DB
      // even if the records payload is older / missing the lock field.
      const [recordsRes, lockRes] = await Promise.all([
        apiFetch(`/api/forms/${form.form_name}/institution-records?language=${lang}`),
        apiFetch(`/api/forms/${form.form_name}/lock-status`),
      ]);
      const data     = await recordsRes.json();
      const lockData = await lockRes.json();

      if (data.success) {
        setGrouped(data.grouped || {});
        setDepartments(data.departments || []);
        setSchema(data.schema);
      } else {
        setError(data.message || "Failed to load records.");
      }

      if (lockData.success) {
        setLockInfo({
          is_locked: !!lockData.is_locked,
          locked_by: lockData.locked_by ?? null,
          locked_at: lockData.locked_at ?? null,
          // deadline fields only come from the records payload
          deadline_at: data.lock?.deadline_at ?? null,
          auto_locked: data.lock?.auto_locked ?? false,
        });
      } else if (data.success) {
        // Fall back to the lock object embedded in the records response.
        setLockInfo(data.lock || { is_locked: false, locked_by: null, locked_at: null });
      }
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load records.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, form.form_name, lang]);

  useEffect(() => { load(); }, [load]);

  async function refreshLockFromDb() {
    try {
      const res  = await apiFetch(`/api/forms/${form.form_name}/lock-status`);
      const data = await res.json();
      if (data.success) {
        setLockInfo({
          is_locked: !!data.is_locked,
          locked_by: data.locked_by ?? null,
          locked_at: data.locked_at ?? null,
        });
      }
    } catch (err) {
      if (!isAuthError(err)) {
        /* leave existing state; toast already shown on toggle */
      }
    }
  }

  async function handleToggleLock() {
    const action = lockInfo.is_locked ? "unlock" : "lock";
    setLockToggling(true);
    try {
      const res  = await apiFetch(`/api/forms/${form.form_name}/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Re-read the authoritative boolean from the DB so the button always matches reality.
        await refreshLockFromDb();
        showToast(
          action === "lock"
            ? (lang === "hi" ? "फॉर्म लॉक कर दिया गया।" : "Form locked successfully.")
            : (lang === "hi" ? "फॉर्म अनलॉक कर दिया गया।" : "Form unlocked successfully.")
        );
      } else {
        showToast(data.message || `Failed to ${action} form.`, "error");
      }
    } catch (err) {
      if (!isAuthError(err)) showToast(`Failed to ${action} form.`, "error");
    } finally {
      setLockToggling(false);
    }
  }

  const excludedCols = useMemo(
    () => new Set(schema?.schema?.excluded_fixed_columns || []),
    [schema]
  );
  const schemaFields = useMemo(
    () => (schema?.schema?.fields || []).filter(
      (f) => !excludedCols.has(dbCol(f.column_name)) && !excludedCols.has(f.column_name)
    ),
    [schema, excludedCols]
  );

  /* ── Flatten grouped → single sorted list, tagging each row with its dept ── */
  const allRows = useMemo(() => {
    const flat = [];
    const deptNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    for (const name of deptNames) {
      for (const rec of grouped[name]) flat.push({ ...rec, __deptName: name });
    }
    return flat;
  }, [grouped]);

  /* ── Apply filters: department + free-text search ── */
  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (deptFilter !== "__all__") {
      rows = rows.filter((r) => r.__deptName === deptFilter);
    }
    const needle = search.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((r) => {
        if (r.__deptName.toLowerCase().includes(needle)) return true;
        return schemaFields.some((f) => {
          const v = r[dbCol(f.column_name)];
          return v != null && String(v).toLowerCase().includes(needle);
        });
      });
    }
    return rows;
  }, [allRows, deptFilter, search, schemaFields]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, deptFilter]);

  const totalRecords = allRows.length;
  const formTitle = form.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* View-only banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#eff6ff", border: "1px solid #bfdbfe",
        borderRadius: 10, padding: "10px 16px", marginBottom: 20,
      }}>
        <span style={{ color: ACCENT, display: "flex" }}><IconEye /></span>
        <div style={{ fontSize: 12, color: "#1e3a8a", fontWeight: 600 }}>
          {lang === "hi"
            ? "केवल देखने का मोड — रिकॉर्ड संपादित या हटाए नहीं जा सकते।"
            : "View-only mode — records cannot be edited or deleted from this page."}
        </div>
      </div>

      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <button
            onClick={onBack}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: "none", fontSize: 13, fontWeight: 600,
              color: ACCENT, cursor: "pointer", padding: 0, marginBottom: 12,
            }}
          >
            <IconBack /> {lang === "hi" ? "फॉर्म प्रबंधन पर वापस" : "Back to Form Management"}
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.3px", margin: "0 0 4px" }}>
            {formTitle}
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 600,
              color: lockInfo.is_locked ? "#dc2626" : "#16a34a",
              background: lockInfo.is_locked ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${lockInfo.is_locked ? "#fecaca" : "#bbf7d0"}`,
              borderRadius: 6, padding: "2px 8px", verticalAlign: "middle",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: lockInfo.is_locked ? "#dc2626" : "#16a34a",
              }} />
              {lockInfo.is_locked
                ? (lang === "hi" ? "लॉक है" : "Locked")
                : (lang === "hi" ? "खुला" : "Open")}
            </span>
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            {loading
              ? (lang === "hi" ? "लोड हो रहा है…" : "Loading…")
              : `${totalRecords} ${lang === "hi" ? "रिकॉर्ड" : "record"}${totalRecords !== 1 ? (lang === "hi" ? "" : "s") : ""} ${lang === "hi" ? "में से" : "across"} ${departments.length} ${lang === "hi" ? "विभाग" : "department"}${departments.length !== 1 ? (lang === "hi" ? "" : "s") : ""}`}
          </p>
        </div>

        {/* Lock / Unlock control */}
        <button
          onClick={handleToggleLock}
          disabled={lockToggling || loading}
          title={lockInfo.is_locked
            ? (lang === "hi" ? "इस फॉर्म को अनलॉक करें" : "Unlock this form")
            : (lang === "hi" ? "इस फॉर्म को लॉक करें" : "Lock this form")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: lockInfo.is_locked ? "#16a34a" : "#dc2626",
            color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700,
            cursor: lockToggling || loading ? "not-allowed" : "pointer",
            opacity: lockToggling || loading ? 0.7 : 1,
            boxShadow: `0 2px 8px ${lockInfo.is_locked ? "#16a34a40" : "#dc262640"}`,
            flexShrink: 0, alignSelf: "flex-start",
          }}
        >
          {lockToggling
            ? (lang === "hi" ? "कृपया प्रतीक्षा करें…" : "Please wait…")
            : lockInfo.is_locked
              ? <><IconUnlock /> {lang === "hi" ? "फॉर्म अनलॉक करें" : "Unlock Form"}</>
              : <><IconLock /> {lang === "hi" ? "फॉर्म लॉक करें" : "Lock Form"}</>}
        </button>
      </div>

      {/* Locked banner */}
      {lockInfo.is_locked && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, padding: "10px 16px", marginBottom: 18,
        }}>
          <span style={{ fontSize: 16 }}>🔒</span>
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>
            {lang === "hi"
              ? "यह फॉर्म लॉक है। विभाग के उपयोगकर्ता रिकॉर्ड नहीं जोड़, संपादित या हटा सकते।"
              : "This form is locked. Department users cannot add, edit, or delete records."}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* ── ONE unified card with one toolbar + one table + one pagination ── */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
        {/* Toolbar: department filter + global search */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
            {lang === "hi" ? "सभी विभाग रिकॉर्ड" : "All Department Records"}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
              · {filteredRows.length} {lang === "hi" ? "मिले" : "matching"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{
                padding: "7px 28px 7px 12px", fontSize: 12, color: "#1e293b",
                border: "1px solid #e2e8f0", borderRadius: 8, outline: "none",
                background:
                  "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E\") no-repeat right 10px center",
                appearance: "none",
                fontWeight: 600,
                minWidth: 180,
              }}
            >
              <option value="__all__">
                {lang === "hi" ? "सभी विभाग" : "All departments"} ({totalRecords})
              </option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.count})
                </option>
              ))}
            </select>
            <div style={{ position: "relative", width: 240 }}>
              <span style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "#94a3b8", display: "flex",
              }}>
                <IconSearch />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "hi" ? "रिकॉर्ड खोजें…" : "Search records…"}
                style={{
                  width: "100%", padding: "7px 10px 7px 30px",
                  fontSize: 12, color: "#1e293b",
                  border: "1px solid #e2e8f0", borderRadius: 8, outline: "none",
                  background: "#fff",
                }}
              />
            </div>
          </div>
        </div>

        {/* Table body */}
        {loading ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {lang === "hi" ? "रिकॉर्ड लोड हो रहे हैं…" : "Loading records…"}
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
              {search || deptFilter !== "__all__"
                ? (lang === "hi" ? "कोई मेल नहीं मिला" : "No matching records")
                : (lang === "hi" ? "अभी तक कोई रिकॉर्ड नहीं" : "No records yet")}
            </div>
            <div style={{ fontSize: 13 }}>
              {search || deptFilter !== "__all__"
                ? (lang === "hi" ? "अपनी खोज या फ़िल्टर बदलकर देखें।" : "Try adjusting your search or filter.")
                : (lang === "hi"
                    ? "विभाग अभी तक इस फॉर्म के लिए रिकॉर्ड जमा नहीं किए हैं।"
                    : "Departments haven’t submitted any records for this form yet.")}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>{lang === "hi" ? "विभाग" : "Department"}</th>
                  {schemaFields.map((f) => (
                    <th key={dbCol(f.column_name)} style={thStyle}>
                      {f.label?.[lang] || f.label?.en || displayCol(f.column_name)}
                    </th>
                  ))}
                  <th style={thStyle}>{lang === "hi" ? "बनाया गया" : "Created"}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((rec, i) => {
                  const prev = pageRows[i - 1];
                  const isNewGroup = !prev || prev.__deptName !== rec.__deptName;
                  return (
                    <tr
                      key={rec.id}
                      style={{
                        borderTop: isNewGroup ? "2px solid #e2e8f0" : "1px solid #f8fafc",
                        transition: "background .1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "3px 10px", borderRadius: 14,
                          background: ACCENT + "14", color: ACCENT,
                          fontSize: 12, fontWeight: isNewGroup ? 700 : 600,
                        }}>
                          {rec.__deptName}
                        </span>
                      </td>
                      {schemaFields.map((f) => {
                        const col = dbCol(f.column_name);
                        const raw = rec[col];

                        let cellContent;
                        if (f.type === "boolean") {
                          cellContent = raw === true || raw === "true"
                            ? (lang === "hi" ? "हाँ" : "Yes")
                            : raw === false || raw === "false"
                              ? (lang === "hi" ? "नहीं" : "No")
                              : "—";
                        } else if (f.type === "document") {
                          cellContent = <DocumentCell url={raw} />;
                        } else {
                          cellContent = raw ?? <span style={{ color: "#cbd5e1" }}>—</span>;
                        }
                        return (
                          <td key={col} style={tdStyle}>
                            <span style={{ fontSize: 13, color: "#1e293b" }}>{cellContent}</span>
                          </td>
                        );
                      })}
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{formatDate(rec.created_at)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination (single) */}
        {!loading && filteredRows.length > PAGE_SIZE && (
          <div style={{
            padding: "12px 22px", borderTop: "1px solid #f1f5f9",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 12, color: "#64748b",
          }}>
            <span>
              {lang === "hi" ? "दिखा रहे हैं" : "Showing"}{" "}
              <strong>{(page - 1) * PAGE_SIZE + 1}</strong>–
              <strong>{Math.min(page * PAGE_SIZE, filteredRows.length)}</strong>{" "}
              {lang === "hi" ? "में से" : "of"} <strong>{filteredRows.length}</strong>
            </span>
            <div style={{ display: "inline-flex", gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={pagerBtn(page === 1)}
              >
                ‹ {lang === "hi" ? "पिछला" : "Prev"}
              </button>
              <span style={{ alignSelf: "center", fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={pagerBtn(page === totalPages)}
              >
                {lang === "hi" ? "अगला" : "Next"} ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── table styles ── */
const thStyle = {
  padding: "10px 16px", textAlign: "left", fontSize: 11,
  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
  letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
};
const tdStyle = {
  padding: "13px 16px", verticalAlign: "middle",
};
const pagerBtn = (disabled) => ({
  background: disabled ? "#f8fafc" : "#fff",
  color: disabled ? "#cbd5e1" : "#475569",
  border: "1px solid #e2e8f0", borderRadius: 7,
  padding: "5px 10px", fontSize: 11, fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
});
