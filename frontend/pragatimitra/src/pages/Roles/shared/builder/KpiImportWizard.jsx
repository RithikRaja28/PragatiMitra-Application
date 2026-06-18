/**
 * KpiImportWizard.jsx
 * 2-step modal for importing a KPI chart block.
 *
 * Step 1 — Browse & Filter KPI list (title, year, exported date)
 * Step 2 — Preview SVG + data summary table → Confirm import
 *
 * Props:
 *   sectionId    — UUID of the section
 *   orderIndex   — numeric order_index for the new block
 *   defaultYear  — pre-fill the academic year filter (from the report)
 *   apiFetch     — authenticated fetch helper
 *   onImported(blockData) — called with the created block on success
 *   onClose      — dismiss the wizard
 */
import React, { useState, useEffect, useRef } from "react";

const OVERLAY = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 2100, fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const CARD_BASE = {
  background: "#fff", borderRadius: 18,
  boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
  display: "flex", flexDirection: "column", overflow: "hidden",
  maxHeight: "92vh",
};

function fmtYear(y) {
  if (!y) return "—";
  return `${y}-${String(Number(y) + 1).slice(-2)}`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNum(n) {
  return typeof n === "number" ? n.toLocaleString() : n;
}

export default function KpiImportWizard({ sectionId, orderIndex, defaultYear, apiFetch, onImported, onClose }) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [years,       setYears]       = useState([]);
  const [filterYear,  setFilterYear]  = useState(defaultYear || "");
  const [search,      setSearch]      = useState("");
  const [kpiList,     setKpiList]     = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listErr,     setListErr]     = useState("");

  // Step 2 state
  const [selected,       setSelected]       = useState(null); // kpi metadata row
  const [kpiDetail,      setKpiDetail]      = useState(null); // { svg_data, extracted, ... }
  const [loadingDetail,  setLoadingDetail]  = useState(false);
  const [detailErr,      setDetailErr]      = useState("");

  // Import state
  const [importing,  setImporting]  = useState(false);
  const [importErr,  setImportErr]  = useState("");

  const searchRef = useRef(null);

  /* ── Load distinct years on mount ── */
  useEffect(() => {
    apiFetch("/api/report-integration/kpi-reports/years")
      .then(r => r.json())
      .then(d => { if (d.success) setYears(d.data || []); })
      .catch(() => {});
  }, [apiFetch]);

  /* ── Load KPI list whenever year filter changes ── */
  useEffect(() => {
    setLoadingList(true);
    setListErr("");
    const params = new URLSearchParams();
    if (filterYear) params.set("year", filterYear);
    apiFetch(`/api/report-integration/kpi-reports?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setKpiList(d.data || []);
        else setListErr(d.message || "Failed to load");
      })
      .catch(() => setListErr("Network error"))
      .finally(() => setLoadingList(false));
  }, [apiFetch, filterYear]);

  /* ── Load full KPI detail when user selects a row ── */
  async function handleSelectRow(row) {
    setSelected(row);
    setStep(2);
    setLoadingDetail(true);
    setDetailErr("");
    setKpiDetail(null);
    try {
      const res  = await apiFetch(`/api/report-integration/kpi-reports/${row.id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load KPI");
      setKpiDetail(data.data);
    } catch (ex) {
      setDetailErr(ex.message || "Failed to load KPI detail");
    } finally {
      setLoadingDetail(false);
    }
  }

  /* ── Confirm import ── */
  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    setImportErr("");
    try {
      const res  = await apiFetch(`/api/report-integration/sections/${sectionId}/blocks/kpi-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpi_report_id: selected.id,
          order_index:   orderIndex,
          caption:       "",
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

  // Client-side search filter
  const visibleList = search.trim()
    ? kpiList.filter(k => k.title.toLowerCase().includes(search.trim().toLowerCase()))
    : kpiList;

  const headerBg = "linear-gradient(135deg,#7c3aed,#4f46e5)";

  const btnPrimary = {
    padding: "8px 22px", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  };
  const btnSecondary = {
    padding: "8px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0",
    background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };

  const detail   = kpiDetail;
  const exData   = detail?.extracted || {};
  const columns  = exData.columns  || [];
  const series   = exData.series   || [];
  const totals   = exData.totals   || [];
  const hasData  = columns.length > 0;

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...CARD_BASE, width: step === 1 ? 700 : 800, maxWidth: "96vw" }}>

        {/* ── Header ── */}
        <div style={{ background: headerBg, padding: "20px 28px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>
                Import KPI Chart
              </div>
              <div style={{ fontSize: 11, color: "#c4b5fd" }}>
                {step === 1 ? "Step 1 of 2 — Browse & Select a KPI" : "Step 2 of 2 — Preview & Confirm"}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8,
              color: "#fff", cursor: "pointer", fontSize: 16, width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
            {[1, 2].map(s => (
              <div key={s} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: s <= step ? "#fff" : "rgba(255,255,255,0.25)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        </div>

        {/* ═══ STEP 1 — Browse ═══ */}
        {step === 1 && (
          <>
            <div style={{ padding: "16px 24px 10px", flexShrink: 0, borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {/* Year filter */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Academic Year</label>
                  <select
                    value={filterYear}
                    onChange={e => setFilterYear(e.target.value)}
                    style={{
                      padding: "7px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
                      fontSize: 12, color: "#1e293b", background: "#fff", cursor: "pointer", outline: "none", minWidth: 110,
                    }}
                  >
                    <option value="">All years</option>
                    {years.map(y => (
                      <option key={y} value={y}>{fmtYear(y)}</option>
                    ))}
                  </select>
                </div>

                {/* Search */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Search</label>
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter by title…"
                    style={{
                      padding: "7px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
                      fontSize: 12, color: "#1e293b", outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* KPI list */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {loadingList ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "#94a3b8", fontSize: 13 }}>Loading KPI reports…</div>
              ) : listErr ? (
                <div style={{ padding: "20px 24px", color: "#b91c1c", fontSize: 12 }}>{listErr}</div>
              ) : visibleList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "#94a3b8", fontSize: 13 }}>
                  {search ? `No KPIs matching "${search}"` : "No KPI reports found."}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                      <th style={{ padding: "10px 24px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0" }}>Title</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>Year</th>
                      <th style={{ padding: "10px 24px 10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>Exported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleList.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => handleSelectRow(row)}
                        style={{
                          cursor: "pointer",
                          borderBottom: i < visibleList.length - 1 ? "1px solid #f1f5f9" : "none",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#faf5ff"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                      >
                        <td style={{ padding: "11px 24px", fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{row.title}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: "#7c3aed", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtYear(row.academic_year)}</td>
                        <td style={{ padding: "11px 24px 11px 12px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtDate(row.exported_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#fafbff" }}>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {!loadingList && `Showing ${visibleList.length} of ${kpiList.length} KPI${kpiList.length !== 1 ? "s" : ""}`}
              </div>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
            </div>
          </>
        )}

        {/* ═══ STEP 2 — Preview ═══ */}
        {step === 2 && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", minHeight: 0 }}>
              {/* Back + title */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <button
                  onClick={() => { setStep(1); setKpiDetail(null); setDetailErr(""); setImportErr(""); }}
                  style={{ ...btnSecondary, padding: "5px 12px", fontSize: 12, flexShrink: 0 }}
                >← Back</button>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1e293b", marginBottom: 2 }}>
                    {selected?.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {fmtYear(selected?.academic_year)}
                    {selected?.exported_at && ` · Exported ${fmtDate(selected.exported_at)}`}
                  </div>
                </div>
              </div>

              {loadingDetail ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 13 }}>
                  Loading KPI chart…
                </div>
              ) : detailErr ? (
                <div style={{ padding: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c" }}>
                  {detailErr}
                </div>
              ) : (
                <>
                  {/* SVG preview */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", background: "#fff", padding: 8, marginBottom: 16 }}>
                    {detail?.svg_data ? (
                      <div
                        style={{ pointerEvents: "none", lineHeight: 0, overflow: "hidden" }}
                        dangerouslySetInnerHTML={{ __html: detail.svg_data }}
                      />
                    ) : (
                      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                        No SVG data available
                      </div>
                    )}
                  </div>

                  {/* Data summary table */}
                  {hasData ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Data Summary — will appear as a table in compiled report
                      </div>
                      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: "#f1f5f9" }}>
                              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>Series</th>
                              {columns.map((col, i) => (
                                <th key={i} style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {series.map((s, si) => (
                              <tr key={si}>
                                <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1e293b", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{s.display_name || s.name}</td>
                                {(s.values || []).map((v, vi) => (
                                  <td key={vi} style={{ padding: "6px 10px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9" }}>{fmtNum(v)}</td>
                                ))}
                              </tr>
                            ))}
                            {totals.length > 0 && (
                              <tr style={{ background: "#f8fafc" }}>
                                <td style={{ padding: "6px 10px", fontWeight: 700, color: "#1e293b" }}>Total</td>
                                {totals.map((v, vi) => (
                                  <td key={vi} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{fmtNum(v)}</td>
                                ))}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 16px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
                      Data summary could not be extracted from this chart. The chart will still be imported — data extraction will be skipped.
                    </div>
                  )}

                  {/* Info note */}
                  <div style={{ marginTop: 14, fontSize: 11, color: "#64748b", lineHeight: 1.6, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    This KPI will be added as a chart image
                    {hasData ? " with a data summary table" : ""}
                    {" "}in the compiled report (PDF / Word). You can control which parts are included from the block's Options panel.
                  </div>
                </>
              )}

              {importErr && (
                <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c" }}>
                  {importErr}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 28px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0, background: "#fafbff" }}>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
              <button
                onClick={handleImport}
                disabled={importing || loadingDetail || !!detailErr}
                style={{ ...btnPrimary, opacity: importing || loadingDetail || !!detailErr ? 0.6 : 1 }}
              >
                {importing ? "Adding…" : "Add to Section →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
