import { useState, useMemo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

/* ─── Color tokens (matching screenshot blue theme) ─── */
const C = {
  primary:   "#2563eb",
  primaryLt: "#eff6ff",
  primaryMid:"#3b82f6",
  text:      "#1e293b",
  textSub:   "#64748b",
  border:    "rgba(37,99,235,0.13)",
  borderSoft:"rgba(0,0,0,0.07)",
  bg:        "#f8fafc",
  surface:   "#ffffff",
  success:   "#16a34a",
  successLt: "#dcfce7",
  warn:      "#d97706",
  warnLt:    "#fef3c7",
  danger:    "#dc2626",
  dangerLt:  "#fef2f2",
};

/* ─── Scheme → Programme data ─── */
const SCHEMES = {
  "A. Establishment Expenditure of the Centre": [
    "Secretariat",
    "National Medicinal Plants Board",
    "Pharmacopoeia Commission of Indian Medicine & Homoeopathy (PCIM&H)",
  ],
  "B. Statutory Bodies / Autonomous Bodies": [
    "Institute of Teaching & Research in Ayurveda",
    "National Commission for Indian System of Medicine",
    "National Commission for Homoeopathy",
    "Central Council for Research in Ayurvedic Sciences",
    "Central Council for Research in Unani Medicine",
    "Central Council for Research in Homoeopathy",
    "All India Institute of Ayurveda",
    "National Institute of Homoeopathy",
    "National Institute of Ayurveda",
    "Rashtriya Ayurveda Vidyapeeth",
    "National Institute of Siddha",
    "National Institute of Unani Medicine",
    "Morarji Desai National Institute of Yoga",
    "National Institute of Naturopathy",
    "North-Eastern Institute of Ayurveda & Homoeopathy",
    "Central Council for Research in Yoga & Naturopathy",
    "National Institute of Sowa Rigpa",
    "Institute of High Altitude Medicinal Plants",
    "Central Council for Research in Siddha",
    "North-Eastern Institute of Ayurveda and Folk Medicine Research",
    "Central Sector Scheme",
  ],
  "C. Central Sector Schemes": [
    "Information, Education and Communication",
    "Promotion of International Cooperation",
    "Champion Services Sector Scheme",
    "Central Sector Scheme for Conservation, Development and Sustainable Management of Medicinal Plants",
    "Ayush Madhadhvi Gunyatta Evum Uttapadan Sarvadharn Yojana",
    "Ayurswasthya Yojana",
    "Ayurgyan",
  ],
  "D. Centrally Sponsored Scheme": [
    "National Ayush Mission",
  ],
};

const SCHEME_KEYS = Object.keys(SCHEMES);

let _rid = 0;
const newRow = () => ({ id: ++_rid, description: "", be: "", re: "", ae: "" });

const inputSt = {
  width: "100%", boxSizing: "border-box",
  border: `0.5px solid rgba(0,0,0,0.12)`, borderRadius: 6,
  padding: "6px 9px", fontSize: 12, color: C.text,
  background: "#fafafa", outline: "none",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const numInput = { ...inputSt, textAlign: "right", fontVariantNumeric: "tabular-nums" };

const selectSt = { ...inputSt, cursor: "pointer", appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
  paddingRight: 28 };

const btn = (v = "ghost", size = "md") => ({
  border: "none", cursor: "pointer", borderRadius: 7,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5,
  padding: size === "sm" ? "4px 10px" : "9px 18px",
  fontSize: size === "sm" ? 11 : 12,
  transition: "opacity 0.15s",
  ...(v === "primary" ? { background: C.primary, color: "#fff", boxShadow: "0 2px 8px rgba(37,99,235,0.25)" }
    : v === "success" ? { background: C.success, color: "#fff", boxShadow: "0 2px 8px rgba(22,163,74,0.2)" }
    : v === "outline" ? { background: "transparent", color: C.primary, border: `0.5px solid ${C.primary}` }
    : v === "danger"  ? { background: C.dangerLt, color: C.danger }
    :                   { background: C.primaryLt, color: C.primary }),
});

function fmt(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

function ColTotal({ rows, field, label }) {
  const total = rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{total > 0 ? fmt(total) : "—"}</div>
    </div>
  );
}

/* ─── Saved entry card ─── */
function SavedCard({ entry, onEdit, onDelete }) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const total = (f) => entry.rows.reduce((s, r) => s + (parseFloat(r[f]) || 0), 0);
  return (
    <div style={{ background: C.surface, border: `0.5px solid ${C.border}`,
      borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(37,99,235,0.06)" }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{entry.programme}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{entry.scheme}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[["BE", "be"], ["RE", "re"], ["AE", "ae"]].map(([l, f]) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{total(f) > 0 ? fmt(total(f)) : "—"}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 10 }}>
          <button onClick={e => { e.stopPropagation(); onEdit(); }} style={btn("outline", "sm")}>{t("Edit", lang)}</button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={btn("danger", "sm")}>✕</button>
        </div>
        <span style={{ fontSize: 11, color: C.textSub, marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.primaryLt }}>
                {["#", "Description", "BE (₹)", "RE (₹)", "AE (₹)"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: h === "Description" || h === "#" ? "left" : "right",
                    fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `0.5px solid ${C.border}` }}>
                  <td style={{ padding: "6px 10px", color: C.textSub }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px", color: C.text, fontWeight: 500 }}>{r.description || "—"}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: C.text }}>{fmt(r.be)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: C.text }}>{fmt(r.re)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: C.text }}>{fmt(r.ae)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: entry.status === "Submitted" ? C.primaryLt : C.warnLt,
              color: entry.status === "Submitted" ? C.primary : C.warn }}>
              {entry.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function EstimatesPage() {
  const { lang } = useLanguage();
  const [scheme,      setScheme]      = useState("");
  const [programme,   setProgramme]   = useState("");
  const [rows,        setRows]        = useState([newRow(), newRow(), newRow()]);
  const [saved,       setSaved]       = useState([]);
  const [editingId,   setEditingId]   = useState(null);
  const [toast,       setToast]       = useState(null);
  const [activeTab,   setActiveTab]   = useState("entry"); // "entry" | "saved"
  const [managingSchemes, setManagingSchemes] = useState(false);
  const [customSchemes,   setCustomSchemes]   = useState({ ...SCHEMES });
  const [newSchemeName,   setNewSchemeName]   = useState("");
  const [newProgName,     setNewProgName]     = useState("");
  const [editSchemeKey,   setEditSchemeKey]   = useState("");

  const programmes = useMemo(() => scheme ? (customSchemes[scheme] || []) : [], [scheme, customSchemes]);

  const showToast = (msg, color = C.success) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2800);
  };

  const updateRow = (id, field, value) =>
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row));

  const addRow = () => setRows(r => [...r, newRow()]);
  const delRow = (id) => setRows(r => r.filter(row => row.id !== id));

  const resetForm = () => { setScheme(""); setProgramme(""); setRows([newRow(), newRow(), newRow()]); setEditingId(null); };

  const validate = () => {
    if (!scheme) { showToast("Please select a Scheme.", C.danger); return false; }
    if (!programme) { showToast("Please select a Programme.", C.danger); return false; }
    if (rows.every(r => !r.description && !r.be && !r.re && !r.ae)) {
      showToast("Please fill at least one row.", C.danger); return false;
    }
    return true;
  };

  const handleSave = (status) => {
    if (!validate()) return;
    const entry = { id: editingId || Date.now(), scheme, programme, rows: [...rows], status };
    if (editingId) {
      setSaved(s => s.map(e => e.id === editingId ? entry : e));
      showToast("Entry updated successfully.");
    } else {
      setSaved(s => [...s, entry]);
      showToast(status === "Submitted" ? "Submitted for approval!" : "Saved as draft.");
    }
    resetForm();
    setActiveTab("saved");
  };

  const handleEdit = (entry) => {
    setScheme(entry.scheme); setProgramme(entry.programme);
    setRows(entry.rows.map(r => ({ ...r }))); setEditingId(entry.id);
    setActiveTab("entry");
  };

  const handleDelete = (id) => {
    setSaved(s => s.filter(e => e.id !== id));
    showToast("Entry deleted.", C.warn);
  };

  const totals = { be: rows.reduce((s,r)=>s+(parseFloat(r.be)||0),0),
                   re: rows.reduce((s,r)=>s+(parseFloat(r.re)||0),0),
                   ae: rows.reduce((s,r)=>s+(parseFloat(r.ae)||0),0) };

  /* ── Manage schemes helpers ── */
  const addScheme = () => {
    if (!newSchemeName.trim()) return;
    setCustomSchemes(s => ({ ...s, [newSchemeName.trim()]: [] }));
    setNewSchemeName("");
  };
  const deleteScheme = (k) => {
    setCustomSchemes(s => { const n={...s}; delete n[k]; return n; });
    if (scheme === k) { setScheme(""); setProgramme(""); }
  };
  const addProg = () => {
    if (!editSchemeKey || !newProgName.trim()) return;
    setCustomSchemes(s => ({ ...s, [editSchemeKey]: [...(s[editSchemeKey]||[]), newProgName.trim()] }));
    setNewProgName("");
  };
  const deleteProg = (sk, prog) => {
    setCustomSchemes(s => ({ ...s, [sk]: s[sk].filter(p => p !== prog) }));
    if (scheme === sk && programme === prog) setProgramme("");
  };

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column", gap: 16, minHeight: "100vh", background: C.bg }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.color, color: "#fff", padding: "10px 20px",
          borderRadius: 10, fontSize: 12, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)", animation: "fadeIn 0.2s" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            background: C.primaryLt, borderRadius: 6, padding: "3px 11px", marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("Finance Module", lang)}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.4px" }}>{t("Estimates", lang)}</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Budget Estimate (BE) · Revised Estimate (RE) · Actual Expenditure (AE)</p>
        </div>
        <button onClick={() => setManagingSchemes(true)}
          style={{ ...btn("outline"), fontSize: 11, padding: "8px 14px" }}>⚙ {t("Manage Schemes", lang)}</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, background: C.surface, border: `0.5px solid ${C.border}`,
        borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["entry", editingId ? `✎ ${t("Edit Entry", lang)}` : `+ ${t("New Entry", lang)}`], ["saved", `${t("Saved Entries", lang)} (${saved.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ ...btn(activeTab === id ? "primary" : "ghost", "sm"), borderRadius: 7, padding: "7px 18px", fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ENTRY FORM ── */}
      {activeTab === "entry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Scheme + Programme selectors */}
          <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14,
            padding: "16px 18px", boxShadow: "0 1px 5px rgba(37,99,235,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke={C.primary} strokeWidth="1.5"/></svg>
              {t("Scheme & Programme Selection", lang)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>{t("Scheme", lang)}</label>
                <select value={scheme} onChange={e => { setScheme(e.target.value); setProgramme(""); }} style={selectSt}>
                  <option value="">{t("— Select Scheme —", lang)}</option>
                  {Object.keys(customSchemes).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>{t("Programme", lang)}</label>
                <select value={programme} onChange={e => setProgramme(e.target.value)} style={{ ...selectSt, opacity: scheme ? 1 : 0.5 }} disabled={!scheme}>
                  <option value="">{t("— Select Programme —", lang)}</option>
                  {programmes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Breadcrumb pill */}
            {scheme && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12,
                background: C.primaryLt, borderRadius: 7, padding: "7px 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.primary }}>{scheme}</span>
                {programme && <>
                  <span style={{ fontSize: 11, color: C.textSub }}>›</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{programme}</span>
                </>}
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14,
            overflow: "hidden", boxShadow: "0 1px 5px rgba(37,99,235,0.06)" }}>
            <div style={{ padding: "14px 18px", borderBottom: `0.5px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("Estimate Table", lang)}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{t("Enter BE, RE and AE values (in ₹)", lang)}</div>
              </div>
              <button onClick={addRow} style={btn("outline", "sm")}>+ {t("Add Row", lang)}</button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["#", "Description / Sub-Head", "BE (Budget Estimate) ₹", "RE (Revised Estimate) ₹", "AE (Actual Expenditure) ₹", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, color: C.textSub,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        textAlign: i === 0 || i === 1 ? "left" : i === 5 ? "center" : "right",
                        borderBottom: `0.5px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id} style={{ borderBottom: `0.5px solid ${C.border}`,
                      background: idx % 2 === 0 ? C.surface : "#fafbff" }}>
                      <td style={{ padding: "8px 12px", fontSize: 11, color: C.textSub, width: 32, verticalAlign: "middle" }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: "6px 8px", verticalAlign: "middle", minWidth: 220 }}>
                        <input value={row.description} onChange={e => updateRow(row.id, "description", e.target.value)}
                          placeholder="Enter description…"
                          style={{ ...inputSt, fontSize: 12 }} />
                      </td>
                      {["be","re","ae"].map(f => (
                        <td key={f} style={{ padding: "6px 8px", verticalAlign: "middle", width: 150 }}>
                          <input type="number" value={row[f]} onChange={e => updateRow(row.id, f, e.target.value)}
                            placeholder="0"
                            style={{ ...numInput }} />
                        </td>
                      ))}
                      <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", width: 40 }}>
                        <button onClick={() => delRow(row.id)}
                          style={{ ...btn("danger","sm"), padding: "3px 8px", borderRadius: 6, fontSize: 11 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)", borderTop: `1.5px solid ${C.border}` }}>
                    <td colSpan={2} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.text }}>{t("TOTAL", lang)}</td>
                    {["be","re","ae"].map(f => (
                      <td key={f} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontSize: 13, color: C.primary }}>
                        {totals[f] > 0 ? fmt(totals[f]) : "—"}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Summary pills + actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[["BE Total", totals.be], ["RE Total", totals.re], ["AE Total", totals.ae]].map(([label, val]) => (
                <div key={label} style={{ background: C.surface, border: `0.5px solid ${C.border}`,
                  borderRadius: 20, padding: "6px 14px", display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.textSub, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
                  <span style={{ fontSize: 12, color: C.primary, fontWeight: 700 }}>{val > 0 ? fmt(val) : "—"}</span>
                </div>
              ))}
              <div style={{ background: C.surface, border: `0.5px solid ${C.border}`,
                borderRadius: 20, padding: "6px 14px", display: "flex", gap: 7, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: C.textSub, fontWeight: 700, textTransform: "uppercase" }}>Rows</span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{rows.length}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={resetForm} style={{ ...btn("ghost"), padding: "9px 16px" }}>✕ {t("Clear", lang)}</button>
              <button onClick={() => handleSave("Draft")}
                style={{ ...btn("outline"), padding: "9px 18px" }}>💾 {t("Save as Draft", lang)}</button>
              <button onClick={() => handleSave("Submitted")}
                style={{ ...btn("success"), padding: "9px 18px" }}>✓ {t("Submit for Approval", lang)}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAVED ENTRIES ── */}
      {activeTab === "saved" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {saved.length === 0
            ? <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14,
                padding: "48px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{t("No entries yet", lang)}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16 }}>{t("Create your first estimate using the entry form.", lang)}</div>
                <button onClick={() => setActiveTab("entry")} style={btn("primary")}>+ {t("New Entry", lang)}</button>
              </div>
            : <>
                {/* Summary row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  {[
                    { label: "Total Entries",   value: saved.length,                                          color: C.primary  },
                    { label: "Submitted",        value: saved.filter(e=>e.status==="Submitted").length,        color: C.success  },
                    { label: "Drafts",           value: saved.filter(e=>e.status==="Draft").length,            color: C.warn     },
                    { label: "Total BE",         value: fmt(saved.reduce((s,e)=>s+e.rows.reduce((sr,r)=>sr+(parseFloat(r.be)||0),0),0)),  color: C.primary },
                  ].map(c => (
                    <div key={c.label} style={{ background: C.surface, border: `0.5px solid ${C.border}`,
                      borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden",
                      boxShadow: "0 1px 4px rgba(37,99,235,0.06)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                        letterSpacing: "0.07em", marginBottom: 8 }}>{t(c.label, lang)}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: c.color, opacity: 0.3 }} />
                    </div>
                  ))}
                </div>
                {saved.map(e => (
                  <SavedCard key={e.id} entry={e}
                    onEdit={() => handleEdit(e)}
                    onDelete={() => handleDelete(e.id)} />
                ))}
              </>
          }
        </div>
      )}

      {/* ── MANAGE SCHEMES MODAL ── */}
      {managingSchemes && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "min(680px,95vw)", maxHeight: "85vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>⚙ {t("Manage Schemes & Programmes", lang)}</span>
              <button onClick={() => setManagingSchemes(false)} style={{ ...btn("ghost","sm") }}>✕ {t("Close", lang)}</button>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Add new scheme */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase",
                  letterSpacing: "0.06em", marginBottom: 8 }}>{t("Add New Scheme", lang)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newSchemeName} onChange={e => setNewSchemeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addScheme()}
                    placeholder="Scheme name…" style={{ ...inputSt, flex: 1 }} />
                  <button onClick={addScheme} style={btn("primary","sm")}>+ Add</button>
                </div>
              </div>
              {/* Scheme list */}
              {Object.keys(customSchemes).map(sk => (
                <div key={sk} style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", background: C.primaryLt,
                    borderBottom: `0.5px solid ${C.border}` }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.text }}>{sk}</span>
                    <button onClick={() => setEditSchemeKey(editSchemeKey === sk ? "" : sk)}
                      style={{ ...btn("outline","sm") }}>
                      {editSchemeKey === sk ? `▲ ${t("Hide", lang)}` : `▼ ${t("Programmes", lang)}`}
                    </button>
                    <button onClick={() => deleteScheme(sk)} style={{ ...btn("danger","sm") }}>✕</button>
                  </div>
                  {editSchemeKey === sk && (
                    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {(customSchemes[sk] || []).map(p => (
                        <div key={p} style={{ display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 0", borderBottom: `0.5px solid ${C.borderSoft}` }}>
                          <span style={{ flex: 1, fontSize: 11, color: C.text }}>• {p}</span>
                          <button onClick={() => deleteProg(sk, p)} style={{ ...btn("danger","sm"), padding: "2px 7px", fontSize: 10 }}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 7, marginTop: 6 }}>
                        <input value={newProgName} onChange={e => setNewProgName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addProg()}
                          placeholder="Add programme…" style={{ ...inputSt, flex: 1, fontSize: 11, padding: "5px 8px" }} />
                        <button onClick={addProg} style={{ ...btn("primary","sm") }}>+ Add</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}