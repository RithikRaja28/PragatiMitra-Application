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
  primary: "#4f8ef7", primaryLt: "#e8f0fe",
  success: "#43a047", successLt: "#e8f5e9",
  danger: "#e53935", dangerLt: "#fef2f2",
  warning: "#f9a825", warningLt: "#fffde7",
  text: "#1a1a2e", textSub: "#555", border: "#e0e4ea",
  bg: "#f7f8fa", surface: "#fff",
};

const FORMAT_OPTIONS = [
  { value: "pdf",  label: "PDF",  icon: "📄", desc: "Portable Document Format — best for sharing" },
  { value: "docx", label: "DOCX", icon: "📝", desc: "Microsoft Word — editable document" },
  { value: "html", label: "HTML", icon: "🌐", desc: "Web page — view in browser" },
  { value: "json", label: "JSON", icon: "{ }", desc: "Structured data — for integrations" },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CompileReportPage({ reportId, onBack }) {
  const { apiFetch } = useApi();
  const [report,    setReport]    = useState(null);
  const [status,    setStatus]    = useState(null);
  const [history,   setHistory]   = useState([]);
  const [format,    setFormat]    = useState("pdf");
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
        body: JSON.stringify({ format }),
      });
      clearInterval(prog);
      setProgress(100);
      await new Promise(r => setTimeout(r, 500));
      setToast({ type: "success", message: `${format.toUpperCase()} compiled successfully!` });
      await load();

      // Trigger download
      if (res.data?.download_url) {
        window.open(res.data.download_url, "_blank");
      }
    } catch (err) {
      setToast({ type: "error", message: err.message || "Compilation failed" });
    } finally {
      setCompiling(false);
      setProgress(0);
    }
  };

  const handleDownload = (item) => {
    if (item.download_url) window.open(item.download_url, "_blank");
    else setToast({ type: "error", message: "Download URL not available" });
  };

  const readyCount  = status?.ready_count ?? 0;
  const totalCount  = status?.total_count ?? 0;
  const notReadyCount = status?.not_ready_count ?? 0;
  const canCompile  = notReadyCount === 0 && totalCount > 0;

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.textSub }}>
      Loading compile status…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* header */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
                       padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.primary }} onClick={onBack}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Compile Report</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{report?.title}</div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── pre-compile readiness check ── */}
        <ReadinessPanel status={status} readyCount={readyCount} totalCount={totalCount} notReadyCount={notReadyCount} />

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
                <span>Generating {format.toUpperCase()}…</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: C.primary,
                              borderRadius: 4, transition: "width .3s ease",
                              background: `linear-gradient(90deg, ${C.primary}, ${C.success})` }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button style={{ padding: "12px 32px", background: canCompile ? C.primary : "#ccc", color: "#fff",
                             border: "none", borderRadius: 8, cursor: canCompile ? "pointer" : "not-allowed",
                             fontSize: 14, fontWeight: 700, transition: "all .15s" }}
              disabled={!canCompile || compiling} onClick={handleCompile}>
              {compiling ? "Compiling…" : `⚙ Generate ${format.toUpperCase()}`}
            </button>
            {!canCompile && !compiling && (
              <div style={{ fontSize: 12, color: C.danger }}>
                {totalCount === 0 ? "No sections found" : `${notReadyCount} section(s) not ready for compilation`}
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
                    {["Format", "Status", "Generated At", "Size", "Actions"].map(h => (
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
                          {item.output_format?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <StatusDot status={item.compile_status || "DONE"} />
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSub, fontSize: 12 }}>
                        {item.compiled_at ? new Date(item.compiled_at).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSub, fontSize: 12 }}>
                        {item.file_size_bytes ? `${Math.round(item.file_size_bytes / 1024)} KB` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button style={{ padding: "4px 12px", background: C.primary, color: "#fff",
                                         border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11 }}
                          onClick={() => handleDownload(item)}>
                          ⬇ Download
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
