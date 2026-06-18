/**
 * FormImportWizard.jsx
 * 3-step modal wizard for importing a TABLE block from form data.
 *
 * Step 1 — Choose Form (dropdown) + Academic Year
 * Step 2 — Select Columns (checkboxes)
 * Step 3 — Preview 5 rows + Confirm import
 *
 * Props:
 *   sectionId  — UUID of the section to add the block to
 *   orderIndex — numeric order_index for the new block
 *   apiFetch   — authenticated fetch helper
 *   onImported(blockData) — called with the created block on success
 *   onClose    — called when the wizard is dismissed
 */
import React, { useState, useEffect } from "react";

const OVERLAY = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 2000, fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const CARD = {
  background: "#fff", borderRadius: 18,
  boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
  width: 660, maxWidth: "95vw", maxHeight: "90vh",
  display: "flex", flexDirection: "column", overflow: "hidden",
};

export default function FormImportWizard({ sectionId, orderIndex, apiFetch, onImported, onClose }) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [forms,         setForms]         = useState([]);
  const [loadingForms,  setLoadingForms]  = useState(true);
  const [selectedForm,  setSelectedForm]  = useState("");
  const [academicYear,  setAcademicYear]  = useState("");

  // Step 2 state
  const [columns,        setColumns]        = useState([]);
  const [loadingCols,    setLoadingCols]    = useState(false);
  const [selectedCols,   setSelectedCols]   = useState([]);

  // Step 3 state
  const [preview,        setPreview]        = useState(null); // { rows, total }
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Importing state
  const [importing,  setImporting]  = useState(false);
  const [importErr,  setImportErr]  = useState("");

  const [stepErr, setStepErr] = useState("");

  /* ── Load forms on mount ── */
  useEffect(() => {
    setLoadingForms(true);
    apiFetch("/api/report-integration/forms")
      .then(r => r.json())
      .then(d => { if (d.success) setForms(d.data || []); })
      .catch(() => {})
      .finally(() => setLoadingForms(false));
  }, [apiFetch]);

  /* ── Step 1 → 2: load columns ── */
  async function goToStep2() {
    if (!selectedForm) { setStepErr("Please select a form."); return; }
    setStepErr("");
    setLoadingCols(true);
    try {
      const q    = academicYear ? `?year=${encodeURIComponent(academicYear)}` : "";
      const res  = await apiFetch(`/api/report-integration/forms/${encodeURIComponent(selectedForm)}/columns${q}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load columns");
      // Backend returns { system: [...], dynamic: [...] }
      const combined = [
        ...(data.data?.system  || []).map(c => ({ ...c, type: "system" })),
        ...(data.data?.dynamic || []).map(c => ({ ...c, type: "dynamic" })),
      ];
      setColumns(combined);
      setSelectedCols(combined.map(c => c.key));
      setStep(2);
    } catch (ex) {
      setStepErr(ex.message || "Failed to load columns");
    } finally {
      setLoadingCols(false);
    }
  }

  /* ── Step 2 → 3: load preview ── */
  async function goToStep3() {
    if (selectedCols.length === 0) { setStepErr("Select at least one column."); return; }
    setStepErr("");
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams({ columns: selectedCols.join(",") });
      if (academicYear) params.set("year", academicYear);
      const res  = await apiFetch(`/api/report-integration/forms/${encodeURIComponent(selectedForm)}/preview?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load preview");
      setPreview({ rows: data.data?.rows || [], total: data.data?.total || 0 });
      setStep(3);
    } catch (ex) {
      setStepErr(ex.message || "Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  /* ── Step 3: Import ── */
  async function handleImport() {
    setImporting(true);
    setImportErr("");
    try {
      const res  = await apiFetch(`/api/report-integration/sections/${sectionId}/blocks/table-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_name:        selectedForm,
          academic_year:    academicYear || null,
          columns:          selectedCols,
          order_index:      orderIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Import failed");
      onImported(data.data);
    } catch (ex) {
      setImportErr(ex.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  /* ── Toggle column ── */
  function toggleCol(key) {
    setSelectedCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  const headerBg   = "linear-gradient(135deg,#4f46e5,#7c3aed)";
  const btnPrimary = { padding: "8px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const btnSecondary = { padding: "8px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

  const formObj = forms.find(f => f.form_name === selectedForm);

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={CARD}>

        {/* ── Header ── */}
        <div style={{ background: headerBg, padding: "20px 28px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>
                Import Table from Form Data
              </div>
              <div style={{ fontSize: 11, color: "#c4b5fd" }}>
                Step {step} of 3 —{" "}
                {step === 1 ? "Choose Form" : step === 2 ? "Select Columns" : "Preview & Confirm"}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8,
              color: "#fff", cursor: "pointer", fontSize: 16, width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>

          {/* Step progress bar */}
          <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: s <= step ? "#fff" : "rgba(255,255,255,0.25)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

          {/* ═══ STEP 1 — Choose Form ═══ */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>
                Which form should this table pull data from?
              </div>

              {loadingForms ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
                  Loading forms…
                </div>
              ) : forms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
                  No forms available. Forms must be created in the Form Builder first.
                </div>
              ) : (
                <>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Form *
                  </label>
                  <select
                    value={selectedForm}
                    onChange={e => setSelectedForm(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
                      borderRadius: 10, fontSize: 13, color: "#1e293b", background: "#fff",
                      outline: "none", marginBottom: 20, boxSizing: "border-box",
                    }}
                  >
                    <option value="">— Select a form —</option>
                    {forms.map(f => (
                      <option key={f.form_name} value={f.form_name}>
                        {f.form_display_name || f.form_name}
                        {f.record_count != null ? ` (${f.record_count} records)` : ""}
                      </option>
                    ))}
                  </select>

                  {formObj && (
                    <div style={{
                      padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 8, fontSize: 12, color: "#475569", marginBottom: 20,
                    }}>
                      <strong>{formObj.form_display_name || formObj.form_name}</strong>
                      {formObj.record_count != null && ` — ${formObj.record_count} records total`}
                    </div>
                  )}

                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Academic Year (optional filter)
                  </label>
                  <input
                    type="text"
                    value={academicYear}
                    onChange={e => setAcademicYear(e.target.value)}
                    placeholder="e.g. 2024-25"
                    style={{
                      width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
                      borderRadius: 10, fontSize: 13, color: "#1e293b", background: "#fff",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5 }}>
                    Leave blank to include all records regardless of academic year.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 2 — Select Columns ═══ */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                  Which columns should be included?
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setSelectedCols(columns.map(c => c.key))}
                    style={{ ...btnSecondary, fontSize: 11, padding: "5px 12px" }}
                  >Select All</button>
                  <button
                    onClick={() => setSelectedCols([])}
                    style={{ ...btnSecondary, fontSize: 11, padding: "5px 12px" }}
                  >Clear All</button>
                </div>
              </div>

              {loadingCols ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
                  Loading columns…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {columns.map(col => {
                    const checked = selectedCols.includes(col.key);
                    return (
                      <label key={col.key} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${checked ? "#c4b5fd" : "#e2e8f0"}`,
                        background: checked ? "#faf5ff" : "#fff",
                        transition: "all 0.12s",
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCol(col.key)}
                          style={{ width: 15, height: 15, accentColor: "#7c3aed", flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: checked ? 700 : 500, color: checked ? "#4c1d95" : "#1e293b" }}>
                            {col.label}
                          </div>
                          {col.description && (
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{col.description}</div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                          color: col.type === "system" ? "#0891b2" : "#7c3aed",
                          background: col.type === "system" ? "#e0f2fe" : "#ede9fe",
                          padding: "2px 6px", borderRadius: 4,
                        }}>
                          {col.type}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedCols.length > 0 && (
                <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 12, fontWeight: 600 }}>
                  {selectedCols.length} of {columns.length} columns selected
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 3 — Preview & Confirm ═══ */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                  Preview — first {Math.min(5, preview?.rows?.length || 0)} of {preview?.total || 0} records
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Importing from <strong>{formObj?.form_display_name || selectedForm}</strong>
                  {academicYear && ` · Academic Year: ${academicYear}`}
                  {" "}· {selectedCols.length} columns
                </div>
              </div>

              {loadingPreview ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
                  Loading preview…
                </div>
              ) : preview?.rows?.length === 0 ? (
                <div style={{
                  padding: "20px", background: "#fef3c7", border: "1px solid #fcd34d",
                  borderRadius: 8, fontSize: 12, color: "#92400e", textAlign: "center",
                }}>
                  No records found for this form{academicYear ? ` in ${academicYear}` : ""}. The table will be created empty and can be re-fetched later.
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        {selectedCols.map(key => {
                          const col = columns.find(c => c.key === key);
                          return (
                            <th key={key} style={{
                              padding: "8px 10px", textAlign: "left", fontWeight: 700,
                              color: "#374151", borderBottom: "1px solid #e2e8f0",
                              whiteSpace: "nowrap",
                            }}>
                              {col?.label || key}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, ri) => (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f9fafb" }}>
                          {selectedCols.map(key => (
                            <td key={key} style={{
                              padding: "7px 10px", color: "#475569",
                              borderBottom: "1px solid #f1f5f9",
                              maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {row[key] != null ? String(row[key]) : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview?.total > 5 && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, textAlign: "center" }}>
                  Showing 5 of {preview.total} records. All {preview.total} will be imported.
                </div>
              )}

              {importErr && (
                <div style={{
                  marginTop: 14, padding: "10px 14px", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c",
                }}>
                  {importErr}
                </div>
              )}
            </div>
          )}

          {/* Step-level error */}
          {stepErr && (
            <div style={{
              marginTop: 14, padding: "10px 14px", background: "#fef2f2",
              border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c",
            }}>
              {stepErr}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "16px 28px", borderTop: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0, background: "#fafbff",
        }}>
          <div>
            {step > 1 && (
              <button
                onClick={() => { setStep(s => s - 1); setStepErr(""); }}
                style={btnSecondary}
              >
                ← Back
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>

            {step === 1 && (
              <button
                onClick={goToStep2}
                disabled={!selectedForm || loadingCols}
                style={{ ...btnPrimary, opacity: !selectedForm || loadingCols ? 0.55 : 1 }}
              >
                {loadingCols ? "Loading…" : "Next: Select Columns →"}
              </button>
            )}

            {step === 2 && (
              <button
                onClick={goToStep3}
                disabled={selectedCols.length === 0 || loadingPreview}
                style={{ ...btnPrimary, opacity: selectedCols.length === 0 || loadingPreview ? 0.55 : 1 }}
              >
                {loadingPreview ? "Loading…" : "Next: Preview →"}
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ ...btnPrimary, opacity: importing ? 0.7 : 1 }}
              >
                {importing ? "Importing…" : "Import Table"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
