import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../../../hooks/useApi";
import Toast from "../../../../components/shared/Toast";

async function apiJson(apiFetch, path, opts) {
  const res  = await apiFetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

async function downloadViaFetch(apiFetch, path, filename) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const C = {
  primary: "#2563eb", primaryLt: "#dbeafe",
  success: "#16a34a", successLt: "#dcfce7",
  danger: "#dc2626", dangerLt: "#fef2f2",
  warning: "#d97706", warningLt: "#fef3c7",
  text: "#111827", textSub: "#6b7280", border: "#e5e7eb",
  bg: "#f8fafc", surface: "#fff",
};

const FORMAT_OPTIONS = [
  { value: "pdf",  label: "PDF",  icon: "📄", desc: "Portable Document Format — best for sharing" },
  { value: "docx", label: "DOCX", icon: "📝", desc: "Microsoft Word — editable document" },
  { value: "html", label: "HTML", icon: "🌐", desc: "Web page — view in browser" },
  { value: "json", label: "JSON", icon: "{ }", desc: "Structured data — for integrations" },
];

const LANG_OPTIONS = [
  { value: "en", label: "English", short: "EN", desc: "Compile using English block content" },
  { value: "hi", label: "हिंदी",   short: "HI", desc: "Compile using Hindi translations" },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CompileReportPage({ reportId, onBack }) {
  const { apiFetch } = useApi();
  const [report,    setReport]    = useState(null);
  const [status,    setStatus]    = useState(null);
  const [history,   setHistory]   = useState([]);
  const [format,    setFormat]    = useState("pdf");
  const [language,  setLanguage]  = useState("en");
  const [loading,   setLoading]   = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [toast,     setToast]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, statusRes, histRes] = await Promise.all([
        apiJson(apiFetch, `/api/builder/reports/${reportId}`),
        apiJson(apiFetch, `/api/builder/compile/report/${reportId}/status`),
        apiJson(apiFetch, `/api/builder/compile/report/${reportId}/history`).catch(() => ({ data: [] })),
      ]);
      setReport(repRes.data);
      setStatus(statusRes.data);
      setHistory(histRes.data || []);
    } catch {
      setToast({ type: "error", message: "Failed to load report data" });
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const handleCompile = async () => {
    setCompiling(true);
    setProgress(5);
    try {
      const prog = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 400);
      const res = await apiJson(apiFetch, `/api/builder/compile/report/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, language }),
      });
      clearInterval(prog);
      setProgress(100);
      await new Promise(r => setTimeout(r, 500));
      setToast({ type: "success", message: `${format.toUpperCase()} compiled successfully!` });
      await load();

      // Auto-download the freshly compiled file
      if (res.data?.id) {
        const dlPath = `/api/builder/compile/report/${reportId}/${res.data.id}/download`;
        const fname  = `report_${res.data.id.slice(0, 8)}.${format.toLowerCase()}`;
        await downloadViaFetch(apiFetch, dlPath, fname).catch(() => {});
      }
    } catch (err) {
      setToast({ type: "error", message: err.message || "Compilation failed" });
    } finally {
      setCompiling(false);
      setProgress(0);
    }
  };

  const handleDownload = async (item) => {
    try {
      const dlPath = `/api/builder/compile/report/${reportId}/${item.id}/download`;
      const fname  = `report_${item.id.slice(0, 8)}.${(item.format || "docx").toLowerCase()}`;
      await downloadViaFetch(apiFetch, dlPath, fname);
    } catch {
      setToast({ type: "error", message: "Download failed" });
    }
  };

  const readyCount  = status?.ready_count ?? 0;
  const totalCount  = status?.total_count ?? 0;
  const notReadyCount = status?.not_ready_count ?? 0;
  const canCompile  = notReadyCount === 0 && totalCount > 0;

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, color: C.textSub }}>Loading compile status…</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* header */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
                       padding: "14px 32px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 14px", borderRadius: 8,
          border: "1.5px solid #e5e7eb", background: "#fff",
          fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
          flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.borderColor = "#d1d5db"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff";    e.currentTarget.style.borderColor = "#e5e7eb"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
        <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.textSub }}>Report Builder</span>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>›</span>
            <span style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>Compile</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginTop: 1 }}>
            Compile Report
          </div>
        </div>
        {report?.title && (
          <div style={{
            padding: "6px 14px", borderRadius: 8, background: C.bg,
            fontSize: 12, color: C.textSub, border: `1px solid ${C.border}`,
            maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {report.title}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── pre-compile readiness check ── */}
        <ReadinessPanel status={status} readyCount={readyCount} totalCount={totalCount} notReadyCount={notReadyCount} />

        {/* ── language selector ── */}
        <div style={{ marginTop: 28, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Output Language</div>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
            Choose whether the compiled document uses English content or Hindi translations.
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {LANG_OPTIONS.map(l => (
              <div
                key={l.value}
                onClick={() => setLanguage(l.value)}
                style={{
                  flex: 1, border: `2px solid ${language === l.value ? C.primary : C.border}`,
                  borderRadius: 9, padding: "14px 16px", cursor: "pointer",
                  background: language === l.value ? C.primaryLt : C.surface,
                  transition: "all .12s", display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: language === l.value ? C.primary : "#f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800,
                  color: language === l.value ? "#fff" : C.textSub,
                  fontFamily: l.value === "hi" ? "'Noto Sans Devanagari', 'Mangal', sans-serif" : "inherit",
                }}>
                  {l.short}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: language === l.value ? C.primary : C.text,
                                fontFamily: l.value === "hi" ? "'Noto Sans Devanagari', 'Mangal', sans-serif" : "inherit" }}>
                    {l.label}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{l.desc}</div>
                </div>
                {language === l.value && (
                  <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%",
                                background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
          {language === "hi" && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fefce8", border: "1px solid #fde047",
                          borderRadius: 6, fontSize: 11, color: "#92400e", display: "flex", alignItems: "flex-start", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              Hindi compilation uses saved translations. Blocks without Hindi translations will fall back to English content.
            </div>
          )}
        </div>

        {/* ── format selector ── */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Output Format</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            {FORMAT_OPTIONS.map(f => (
              <FormatCard key={f.value} {...f} selected={format === f.value} onClick={() => setFormat(f.value)} />
            ))}
          </div>
        </div>

        {/* ── compile button + progress ── */}
        <div style={{ marginTop: 28, background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: 24 }}>
          {compiling && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
                            color: C.textSub, marginBottom: 6 }}>
                <span>Generating {format.toUpperCase()} ({language.toUpperCase()})…</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: C.primary,
                              borderRadius: 4, transition: "width .3s ease",
                              background: `linear-gradient(90deg, ${C.primary}, ${C.success})` }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              disabled={!canCompile || compiling} onClick={handleCompile}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "0 28px", height: 42,
                background: canCompile ? C.primary : "#e5e7eb",
                color: canCompile ? "#fff" : "#9ca3af",
                border: "none", borderRadius: 8,
                cursor: canCompile && !compiling ? "pointer" : "not-allowed",
                fontSize: 13.5, fontWeight: 700, transition: "background .15s",
                boxShadow: canCompile ? "0 2px 8px rgba(37,99,235,0.22)" : "none",
              }}
              onMouseEnter={e => { if (canCompile && !compiling) e.currentTarget.style.background = "#1d4ed8"; }}
              onMouseLeave={e => { if (canCompile) e.currentTarget.style.background = C.primary; }}>
              {compiling ? (
                <>
                  <div style={{ width: 14, height: 14, border: "2.5px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                  Compiling…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 0 4.93 19.07"/>
                  </svg>
                  Generate {format.toUpperCase()} · {language.toUpperCase()}
                </>
              )}
            </button>
            {!canCompile && !compiling && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.danger }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                {totalCount === 0 ? "No sections found" : `${notReadyCount} section(s) not yet approved`}
              </div>
            )}
          </div>
        </div>

        {/* ── compiled artifacts history ── */}
        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Compilation History</div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {["Format", "Language", "Generated At", "Size", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11,
                                           fontWeight: 700, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, i) => (
                    <tr key={item.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                                       background: C.primaryLt, color: C.primary }}>
                          {item.format?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                                       background: item.language === "hi" ? "#fdf4ff" : "#f0fdf4",
                                       color: item.language === "hi" ? "#7c3aed" : "#16a34a" }}>
                          {item.language === "hi" ? "HI" : "EN"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSub, fontSize: 12 }}>
                        {item.compiled_at ? new Date(item.compiled_at).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSub, fontSize: 12 }}>
                        {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button onClick={() => handleDownload(item)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", background: C.primary, color: "#fff",
                            border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "#1d4ed8"}
                          onMouseLeave={e => e.currentTarget.style.background = C.primary}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────── */
function ReadinessPanel({ status, readyCount, totalCount, notReadyCount }) {
  const pct    = totalCount ? Math.round((readyCount / totalCount) * 100) : 0;
  const ready  = notReadyCount === 0 && totalCount > 0;
  const border = ready ? C.success : notReadyCount > 0 ? C.warning : C.border;

  return (
    <div style={{ border: `2px solid ${border}`, borderRadius: 10, padding: 20,
                  background: ready ? C.successLt : C.warningLt }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 32 }}>{ready ? "✅" : "⚠️"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {ready ? "Ready to Compile" : "Sections Not Ready"}
          </div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
            {readyCount}/{totalCount} sections are approved or locked
          </div>
          {notReadyCount > 0 && (
            <div style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>
              {notReadyCount} section(s) still need approval before compiling.
            </div>
          )}
        </div>
        <div>
          <CircleProgress pct={pct} />
        </div>
      </div>

      {/* Not-ready sections list */}
      {status?.not_ready_sections?.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${border}33`, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, marginBottom: 6 }}>NEEDS APPROVAL:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {status.not_ready_sections.map((s, i) => (
              <span key={i} style={{ padding: "3px 10px", background: C.dangerLt, color: C.danger,
                                     borderRadius: 5, fontSize: 11, border: `1px solid ${C.danger}44` }}>
                {s.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CircleProgress({ pct }) {
  const r  = 28;
  const c  = 2 * Math.PI * r;
  const d  = c * (1 - pct / 100);
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={r} fill="none" stroke={C.border} strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={pct === 100 ? C.success : C.primary}
        strokeWidth={6} strokeDasharray={c} strokeDashoffset={d}
        strokeLinecap="round" transform="rotate(-90 36 36)" style={{ transition: "stroke-dashoffset .4s" }} />
      <text x={36} y={41} textAnchor="middle" fontSize={14} fontWeight={800} fill={C.text}>{pct}%</text>
    </svg>
  );
}

function FormatCard({ value, label, icon, desc, selected, onClick }) {
  return (
    <div onClick={onClick}
      style={{ border: `2px solid ${selected ? C.primary : C.border}`, borderRadius: 9, padding: "14px 12px",
               cursor: "pointer", background: selected ? C.primaryLt : C.surface, transition: "all .12s",
               textAlign: "center" }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? C.primary : C.text }}>{label}</div>
      <div style={{ fontSize: 10, color: C.textSub, marginTop: 3 }}>{desc}</div>
      {selected && <div style={{ fontSize: 10, color: C.primary, fontWeight: 700, marginTop: 6 }}>✓ Selected</div>}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    DONE:    { color: C.success, label: "Done" },
    ERROR:   { color: C.danger,  label: "Error" },
    PENDING: { color: C.warning, label: "Pending" },
  };
  const m = map[status] || map.DONE;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />
      <span style={{ fontSize: 11, color: m.color }}>{m.label}</span>
    </span>
  );
}
