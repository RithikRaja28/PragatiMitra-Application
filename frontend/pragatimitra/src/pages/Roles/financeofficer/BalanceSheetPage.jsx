"use client";
import { useEffect, useState, useCallback, useRef } from "react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "http://localhost:3000/api/radiology";

async function apiFetch(path, opts = {}) {
  const res  = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────
function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtBytes(b) {
  if (!b) return "—";
  return b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
}

// ─── sub-components ───────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "1.25rem",
      marginBottom: "1.25rem",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, textTransform: "uppercase",
      letterSpacing: ".08em", color: "var(--color-text-tertiary)",
      marginBottom: ".75rem",
    }}>
      {children}
    </div>
  );
}

function Badge({ children, color }) {
  // color: "success" | "info" | "warning" | "default"
  const map = {
    success: ["var(--color-background-success)", "var(--color-text-success)"],
    info:    ["var(--color-background-info)",    "var(--color-text-info)"],
    warning: ["var(--color-background-warning)", "var(--color-text-warning)"],
    default: ["var(--color-background-secondary)", "var(--color-text-secondary)"],
  };
  const [bg, fg] = map[color] || map.default;
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 600,
      padding: "2px 9px", borderRadius: 20,
      background: bg, color: fg, letterSpacing: ".04em",
    }}>
      {children}
    </span>
  );
}

// ─── Expandable SVG row ───────────────────────────────────────────────────────
function SvgRow({ record, index }) {
  const [expanded,    setExpanded]    = useState(false);
  const [svgContent,  setSvgContent]  = useState(null);   // full svg_data string
  const [loading,     setLoading]     = useState(false);
  const [loadError,   setLoadError]   = useState("");
  const previewRef = useRef(null);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    // Fetch svg_data only on first expand
    if (!svgContent) {
      setLoading(true);
      setLoadError("");
      try {
        const full = await apiFetch(`/svgs/${record.id}`);
        setSvgContent(full.svg_data);
      } catch (e) {
        setLoadError(e.message);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  };

  // Inject SVG into the container div safely (it's our own DB content)
  useEffect(() => {
    if (expanded && svgContent && previewRef.current) {
      previewRef.current.innerHTML = svgContent;
      // Make the SVG responsive
      const svgEl = previewRef.current.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("width", "100%");
        svgEl.style.display = "block";
      }
    }
  }, [expanded, svgContent]);

  const chartTypeLabel = {
    bar: "Grouped bar", line: "Line", area: "Area",
    bar_stack: "Stacked bar", pie: "Pie", doughnut: "Doughnut",
    radar: "Radar", scatter: "Scatter",
  }[record.chart_type] || record.chart_type;

  return (
    <div style={{
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-md)",
      overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* ── Row header (always visible) ── */}
      <div
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          background: expanded
            ? "var(--color-background-secondary)"
            : "var(--color-background-primary)",
          cursor: "pointer",
          userSelect: "none",
          transition: "background .15s",
        }}
      >
        {/* Index */}
        <span style={{
          minWidth: 26, height: 26, borderRadius: "50%",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)",
          flexShrink: 0,
        }}>
          {index + 1}
        </span>

        {/* Title + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 500,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {record.title || "Untitled"}
          </div>
          {record.description && (
            <div style={{
              fontSize: 12, color: "var(--color-text-tertiary)",
              marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {record.description}
            </div>
          )}
        </div>

        {/* Meta pills */}
        <div style={{
          display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
          flexWrap: "wrap", justifyContent: "flex-end",
        }}>
          <Badge color="success">Final</Badge>
          <span style={{
            fontSize: 11, color: "var(--color-text-tertiary)",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 6, padding: "2px 8px",
          }}>
            {chartTypeLabel}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {fmtBytes(record.svg_bytes)}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {fmt(record.created_at)}
          </span>
        </div>

        {/* Chevron */}
        <span style={{
          fontSize: 16, color: "var(--color-text-tertiary)",
          transition: "transform .2s",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          flexShrink: 0,
        }}>
          ▾
        </span>
      </div>

      {/* ── Expandable SVG preview ── */}
      {expanded && (
        <div style={{
          borderTop: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
          padding: "1.25rem",
        }}>
          {loading && (
            <div style={{
              textAlign: "center", padding: "2rem",
              color: "var(--color-text-secondary)", fontSize: 13,
            }}>
              ⏳ Loading SVG…
            </div>
          )}
          {loadError && (
            <div style={{
              textAlign: "center", padding: "1rem",
              color: "var(--color-text-danger)", fontSize: 13,
            }}>
              Failed to load: {loadError}
            </div>
          )}
          {svgContent && !loading && (
            <>
              {/* Metadata strip */}
              <div style={{
                display: "flex", gap: 16, flexWrap: "wrap",
                marginBottom: "1rem", fontSize: 12,
                color: "var(--color-text-secondary)",
              }}>
                <span><strong>ID:</strong> {record.id}</span>
                <span><strong>Chart:</strong> {chartTypeLabel}</span>
                <span><strong>Size:</strong> {fmtBytes(record.svg_bytes)}</span>
                <span><strong>Created:</strong> {fmt(record.created_at)}</span>
                {record.updated_at && (
                  <span><strong>Updated:</strong> {fmt(record.updated_at)}</span>
                )}
              </div>

              {/* SVG render */}
              <div style={{
                background: "#ffffff",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-md)",
                padding: "1rem",
                overflowX: "auto",
              }}>
                <div ref={previewRef} />
              </div>

              {/* Download button */}
              <div style={{ marginTop: ".75rem", textAlign: "right" }}>
                <button
                  onClick={() => {
                    const blob = new Blob([svgContent], { type: "image/svg+xml" });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement("a");
                    a.href     = url;
                    a.download = `report-${record.id}-${record.chart_type}.svg`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    padding: "6px 16px", fontSize: 12,
                    background: "var(--color-background-info)",
                    color: "var(--color-text-info)",
                    cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}
                >
                  ↓ Download SVG
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          height: 56, borderRadius: "var(--border-radius-md)",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      textAlign: "center", padding: "3rem 1rem",
      color: "var(--color-text-tertiary)",
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>
        No finalised reports yet
      </div>
      <div style={{ fontSize: 13 }}>
        Go to the Radiology page, generate a chart and click{" "}
        <strong>Save Final SVG → DB</strong>.
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BalanceSheetPage() {
  const [records,  setRecords]  = useState([]);
  const [status,   setStatus]   = useState("loading"); // loading | ok | error
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [sortDir,  setSortDir]  = useState("desc");    // newest first

  const load = useCallback(() => {
    setStatus("loading");
    // Fetch only final SVGs
    apiFetch("/svgs?status=final")
      .then((rows) => {
        setRecords(rows);
        setStatus("ok");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── derived list ─────────────────────────────────────────
  const filtered = records
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (r.title       || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.chart_type  || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });

  // ── render states ─────────────────────────────────────────
  if (status === "loading") {
    return (
      <div style={{ padding: "1.5rem", maxWidth: 1000, fontFamily: "var(--font-sans)" }}>
        <Card>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: ".25rem" }}>
            Balance Sheet — Finalised Reports
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Fetching from svg_reports…
          </div>
        </Card>
        <Skeleton />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ padding: "1.5rem", maxWidth: 1000, fontFamily: "var(--font-sans)" }}>
        <Card>
          <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 8, color: "var(--color-text-primary)" }}>
            ⚠️ Cannot load reports
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            {error}
          </div>
          <button
            onClick={load}
            style={{
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "6px 18px", fontSize: 13, cursor: "pointer",
              background: "var(--color-background-info)",
              color: "var(--color-text-info)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, fontFamily: "var(--font-sans)" }}>

      {/* ── Header card ───────────────────────────────────── */}
      <Card>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>
              All India Institute of Ayurveda (AIIA)
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
              Balance Sheet — Finalised Radiology Reports
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <Badge color="success">Final</Badge>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                {records.length} record{records.length !== 1 ? "s" : ""} in svg_reports
              </span>
            </div>
          </div>

          <button
            onClick={load}
            style={{
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </Card>

      {/* ── Toolbar ───────────────────────────────────────── */}
      {records.length > 0 && (
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          marginBottom: "1rem", flexWrap: "wrap",
        }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search by title, description or chart type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 220,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "7px 12px", fontSize: 13,
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
          />

          {/* Sort toggle */}
          <button
            onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
            style={{
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "7px 14px", fontSize: 12, cursor: "pointer",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-sans)",
              whiteSpace: "nowrap",
            }}
          >
            {sortDir === "desc" ? "↓ Newest first" : "↑ Oldest first"}
          </button>

          {/* Result count */}
          {search && (
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* ── Report list ───────────────────────────────────── */}
      <Card style={{ padding: "1rem" }}>
        <SectionLabel>
          Finalised SVG reports — click any row to expand preview
        </SectionLabel>

        {filtered.length === 0 && records.length === 0 && <EmptyState />}

        {filtered.length === 0 && records.length > 0 && (
          <div style={{
            textAlign: "center", padding: "2rem",
            color: "var(--color-text-tertiary)", fontSize: 13,
          }}>
            No records match "{search}"
          </div>
        )}

        {filtered.map((record, i) => (
          <SvgRow key={record.id} record={record} index={i} />
        ))}
      </Card>

    </div>
  );
}