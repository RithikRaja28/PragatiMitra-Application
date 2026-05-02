import { useState, useRef, useCallback } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";

const SCHEDULES = [
  { num: "1",   name: "Corpus / Capital Fund" },
  { num: "2",   name: "Reserves & Surplus" },
  { num: "3",   name: "Earmarked / Endowment Funds" },
  { num: "4",   name: "Secured Loans & Borrowings" },
  { num: "5",   name: "Unsecured Loans & Borrowings" },
  { num: "6",   name: "Deferred Credit Liabilities" },
  { num: "7",   name: "Current Liabilities & Provisions" },
  { num: "8",   name: "Fixed Assets" },
  { num: "9",   name: "Investments from Earmarked / Endowment Funds" },
  { num: "10",  name: "Investments - Others" },
  { num: "11",  name: "Current Assets, Loans, Advances" },
  { num: "12",  name: "Income from Sales / Services" },
  { num: "13",  name: "Grants / Subsidies" },
  { num: "14",  name: "Fees / Subscriptions" },
  { num: "15",  name: "Income from Investments" },
  { num: "16",  name: "Income from Royalty" },
  { num: "17",  name: "Interest Earned" },
  { num: "18",  name: "Other Income" },
  { num: "19",  name: "Stock of Finished Goods & Work in Progress" },
  { num: "20",  name: "Establishment Expenses" },
  { num: "21",  name: "Other Administrative Expenses" },
  { num: "21A", name: "Prior Period Expenses" },
  { num: "22",  name: "Expenditure on Grants, Subsidies etc." },
  { num: "23",  name: "Interest" },
  { num: "24",  name: "Significant Accounting Policies" },
  { num: "25",  name: "Contingent Liabilities and Note on Accounts" },
];

const STATUS_STYLES = {
  draft:     { bg: "#FAEEDA", color: "#633806", label: "Draft" },
  submitted: { bg: "#EAF3DE", color: "#27500A", label: "Submitted" },
  pending:   { bg: "#E6F1FB", color: "#0C447C", label: "Pending" },
};

function makeRow(id) {
  return { id, schedule: "", customName: "", date: "", files: [], useCustom: false };
}

function scheduleLabel(row) {
  if (!row.schedule) return "";
  if (row.schedule === "__custom__") return row.customName || "Custom";
  const found = SCHEDULES.find((s) => s.num === row.schedule);
  return found ? `Schedule ${found.num} — ${found.name}` : row.schedule;
}

function formatDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(str) {
  if (!str) return "—";
  const d = new Date(str);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  );
}

/* ─── Shared style tokens ─── */
const S = {
  card: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.07)",
    borderRadius: 12,
    padding: "20px 22px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  input: {
    height: 36,
    padding: "0 10px",
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 8,
    fontSize: 13,
    color: "#1e293b",
    background: "#fff",
    width: "100%",
    outline: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 5,
    display: "block",
  },
  btnPrimary: {
    background: "#185FA5",
    color: "#E6F1FB",
    border: "none",
    borderRadius: 8,
    padding: "0 20px",
    height: 36,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnOutline: {
    background: "transparent",
    color: "#1e293b",
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 8,
    padding: "0 16px",
    height: 36,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnSuccess: {
    background: "#3B6D11",
    color: "#EAF3DE",
    border: "none",
    borderRadius: 8,
    padding: "0 20px",
    height: 36,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
};

/* ─── File pill ─── */
function FilePill({ file, onRemove }) {
  const short = file.name.length > 20 ? file.name.slice(0, 18) + "…" : file.name;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: "#f1f5f9", border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 20, padding: "2px 10px", fontSize: 12, color: "#475569",
      margin: "2px 3px",
    }}>
      {short}
      <span
        onClick={onRemove}
        style={{ cursor: "pointer", color: "#94a3b8", fontSize: 14, lineHeight: 1, fontWeight: 700 }}
      >×</span>
    </span>
  );
}

/* ─── Upload zone ─── */
function UploadZone({ onFiles }) {
  const { lang } = useLanguage();
  const ref = useRef();
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 8,
        border: "1px dashed rgba(0,0,0,0.18)", borderRadius: 8,
        padding: "7px 12px", cursor: "pointer", background: "#f8fafc",
        fontSize: 12, color: "#64748b", minHeight: 36,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 2v8M5 5l3-3 3 3" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="11" width="12" height="2.5" rx="1" fill="#94a3b8" opacity=".35" />
      </svg>
      {t("Upload PDF / image", lang)}
      <input ref={ref} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }}
        onChange={(e) => { onFiles(e.target.files); ref.current.value = ""; }} />
    </label>
  );
}

/* ─── Single row entry in form ─── */
function RowEntry({ row, onUpdate, onRemove, onAddFiles, onRemoveFile, canRemove }) {
  const { lang } = useLanguage();
  return (
    <div style={{
      background: "#f8fafc", border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1.1fr 1.8fr 36px", gap: 10, alignItems: "start" }}>

        {/* Schedule selector */}
        <div>
          <span style={S.label}>{t("Schedule", lang)}</span>
          <select
            value={row.schedule}
            onChange={(e) => onUpdate("schedule", e.target.value)}
            style={{ ...S.input, paddingRight: 4 }}
          >
            <option value="">{t("Select schedule…", lang)}</option>
            {SCHEDULES.map((s) => (
              <option key={s.num} value={s.num}>Schedule {s.num} — {s.name}</option>
            ))}
            <option value="__custom__">+ {t("Custom schedule name", lang)}</option>
          </select>
          {row.useCustom && (
            <input
              type="text"
              placeholder={t("Enter custom schedule name", lang)}
              value={row.customName}
              onChange={(e) => onUpdate("customName", e.target.value)}
              style={{ ...S.input, marginTop: 6 }}
            />
          )}
        </div>

        {/* Date */}
        <div>
          <span style={S.label}>{t("Date", lang)}</span>
          <input
            type="date"
            value={row.date}
            onChange={(e) => onUpdate("date", e.target.value)}
            style={S.input}
          />
        </div>

        {/* Files */}
        <div>
          <span style={S.label}>{t("Supporting files", lang)}</span>
          <UploadZone onFiles={onAddFiles} />
          {row.files.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap" }}>
              {row.files.map((f, fi) => (
                <FilePill key={fi} file={f} onRemove={() => onRemoveFile(fi)} />
              ))}
            </div>
          )}
        </div>

        {/* Remove */}
        <div style={{ paddingTop: 20 }}>
          {canRemove && (
            <button
              onClick={onRemove}
              style={{
                background: "transparent", border: "1px solid #fca5a5",
                borderRadius: 8, color: "#ef4444", width: 36, height: 36,
                cursor: "pointer", fontSize: 16, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── File icon (PDF / generic) ─── */
function FileIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="#94a3b8" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="#94a3b8" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h4" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Thumbnail cell (shared between card strip & detail grid) ─── */
function ThumbCell({ file, size = 64, onClick }) {
  const isImg = file.type && file.type.startsWith("image/");
  return (
    <div
      onClick={onClick}
      title={file.name}
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        border: "1px solid rgba(0,0,0,0.09)", overflow: "hidden",
        background: "#f1f5f9", display: "flex", alignItems: "center",
        justifyContent: "center", cursor: onClick ? "pointer" : "default",
        position: "relative",
      }}
    >
      {isImg ? (
        <img src={file.url} alt={file.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <FileIcon size={size * 0.38} />
          <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.4px" }}>PDF</span>
        </div>
      )}
      {onClick && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0)", borderRadius: 8,
          transition: "background 0.15s", display: "flex", alignItems: "center",
          justifyContent: "center",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.18)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0 }}
            className="thumb-zoom">
            <circle cx="11" cy="11" r="7" stroke="#fff" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 11h6M11 8v6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ─── Lightbox ─── */
function Lightbox({ files, startIndex, onClose }) {
  const { lang } = useLanguage();
  const [idx, setIdx] = useState(startIndex);
  const file = files[idx];
  const isImg = file.type && file.type.startsWith("image/");
  const prev = () => setIdx((i) => (i - 1 + files.length) % files.length);
  const next = () => setIdx((i) => (i + 1) % files.length);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,14,23,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Main panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14,
          width: "100%", maxWidth: 820,
          display: "flex", flexDirection: "column", overflow: "hidden",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid rgba(0,0,0,0.07)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
              {idx + 1} of {files.length} &nbsp;·&nbsp; {isImg ? t("Image", lang) : "PDF"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {files.length > 1 && (
              <>
                <button onClick={prev} style={{
                  ...S.btnOutline, width: 32, height: 32, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button onClick={next} style={{
                  ...S.btnOutline, width: 32, height: 32, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
            <a
              href={file.url}
              download={file.name}
              style={{
                ...S.btnOutline, display: "inline-flex", alignItems: "center",
                gap: 5, textDecoration: "none", fontSize: 12,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 8l3 4 3-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="2" y="12" width="12" height="2" rx="1" fill="currentColor" opacity=".4" />
              </svg>
              {t("Download", lang)}
            </a>
            <button onClick={onClose} style={{
              ...S.btnOutline, width: 32, height: 32, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderColor: "rgba(0,0,0,0.1)",
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div style={{
          flex: 1, overflow: "auto", background: "#f8fafc",
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 320, padding: 24,
        }}>
          {isImg ? (
            <img
              src={file.url} alt={file.name}
              style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.06)", objectFit: "contain" }}
            />
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 80, height: 80, borderRadius: 12, background: "#e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
              }}>
                <FileIcon size={36} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
                {t("PDF preview not available in browser — use the download button above.", lang)}
              </div>
              <a href={file.url} download={file.name} style={{ ...S.btnPrimary, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M5 8l3 4 3-4" stroke="#E6F1FB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2" y="12" width="12" height="2" rx="1" fill="#E6F1FB" opacity=".6" />
                </svg>
                {t("Download PDF", lang)}
              </a>
            </div>
          )}
        </div>

        {/* Filmstrip */}
        {files.length > 1 && (
          <div style={{
            display: "flex", gap: 8, padding: "10px 18px",
            borderTop: "1px solid rgba(0,0,0,0.07)", overflowX: "auto", flexShrink: 0,
          }}>
            {files.map((f, i) => (
              <div
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  flexShrink: 0, borderRadius: 6, overflow: "hidden",
                  border: i === idx ? "2px solid #185FA5" : "2px solid transparent",
                  cursor: "pointer", opacity: i === idx ? 1 : 0.55,
                  transition: "opacity 0.15s, border-color 0.15s",
                }}
              >
                <ThumbCell file={f} size={48} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Schedule card (cards view) ─── */
function ScheduleCard({ entry, onClick }) {
  const { lang } = useLanguage();
  const st = STATUS_STYLES[entry.status] || STATUS_STYLES.draft;
  const previewFiles = entry.files.slice(0, 3);
  const extra = entry.files.length - 3;

  return (
    <div
      onClick={onClick}
      style={{
        ...S.card,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex", flexDirection: "column", gap: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(24,95,165,0.35)";
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(24,95,165,0.09)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(0,0,0,0.07)";
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
      }}
    >
      {/* Thumbnail strip */}
      {entry.files.length > 0 ? (
        <div style={{
          display: "flex", gap: 6, marginBottom: 14,
          alignItems: "center",
        }}>
          {previewFiles.map((f, i) => (
            <ThumbCell key={i} file={f} size={52} />
          ))}
          {extra > 0 && (
            <div style={{
              width: 52, height: 52, borderRadius: 8, background: "#f1f5f9",
              border: "1px solid rgba(0,0,0,0.08)", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, color: "#64748b",
            }}>+{extra}</div>
          )}
        </div>
      ) : (
        <div style={{
          height: 52, marginBottom: 14, borderRadius: 8, background: "#f8fafc",
          border: "1px dashed rgba(0,0,0,0.1)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 11, color: "#cbd5e1" }}>{t("No files", lang)}</span>
        </div>
      )}

      {/* Schedule number */}
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
        {entry.schedule === "__custom__" ? "Custom" : `Schedule ${entry.schedule}`}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: "#1e293b",
        lineHeight: 1.4, marginBottom: 12, flexGrow: 1,
      }}>
        {scheduleLabel(entry)}
      </div>

      {/* Footer row */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", paddingTop: 10,
        borderTop: "1px solid rgba(0,0,0,0.05)",
      }}>
        <span style={{
          background: st.bg, color: st.color,
          borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
        }}>{st.label}</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(entry.date)}</div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 1 }}>
            {entry.files.length} file{entry.files.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail view ─── */
function DetailView({ entry, onBack, onEdit }) {
  const { lang } = useLanguage();
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const st = STATUS_STYLES[entry.status] || STATUS_STYLES.draft;

  return (
    <div>
      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          files={entry.files}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {/* Back nav */}
      <div
        onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          cursor: "pointer", fontSize: 13, color: "#64748b", marginBottom: 20,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("Back to schedules", lang)}
      </div>

      {/* Main card */}
      <div style={S.card}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 12, marginBottom: 18,
        }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "#0891b214", borderRadius: 6, padding: "3px 10px", marginBottom: 8,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0891b2" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#0891b2",
                textTransform: "uppercase", letterSpacing: "0.8px" }}>
                {entry.schedule === "__custom__" ? "Custom" : `Schedule ${entry.schedule}`}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", lineHeight: 1.3 }}>
              {scheduleLabel(entry)}
            </div>
          </div>
          <span style={{
            background: st.bg, color: st.color, flexShrink: 0,
            borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 600,
          }}>{st.label}</span>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", margin: "0 0 18px" }} />

        {/* Meta row */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16, marginBottom: 22,
        }}>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
            <span style={S.label}>{t("Document date", lang)}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{formatDate(entry.date)}</div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
            <span style={S.label}>{t("Saved on", lang)}</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{formatDateTime(entry.savedAt)}</div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
            <span style={S.label}>{t("Files uploaded", lang)}</span>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#185FA5" }}>{entry.files.length}</div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", margin: "0 0 18px" }} />

        {/* Files section */}
        <div style={{ marginBottom: 4 }}>
          <span style={S.label}>{t("Uploaded files", lang)}</span>
        </div>

        {entry.files.length === 0 ? (
          <div style={{
            padding: "32px 0", textAlign: "center",
            border: "1px dashed rgba(0,0,0,0.1)", borderRadius: 10,
            color: "#94a3b8", fontSize: 13,
          }}>
            {t("No files attached to this schedule entry.", lang)}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: 12,
          }}>
            {entry.files.map((f, i) => {
              const isImg = f.type && f.type.startsWith("image/");
              return (
                <div
                  key={i}
                  onClick={() => setLightboxIdx(i)}
                  style={{
                    background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 10, overflow: "hidden", cursor: "pointer",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(24,95,165,0.3)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(24,95,165,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Preview area */}
                  <div style={{
                    height: 110, overflow: "hidden", background: "#f1f5f9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}>
                    {isImg ? (
                      <img src={f.url} alt={f.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, background: "#e2e8f0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <FileIcon size={22} />
                        </div>
                        <span style={{
                          fontSize: 10, color: "#94a3b8", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.5px",
                        }}>PDF</span>
                      </div>
                    )}
                    {/* Hover overlay hint */}
                    <div style={{
                      position: "absolute", bottom: 6, right: 6,
                      background: "rgba(255,255,255,0.9)", borderRadius: 6,
                      padding: "3px 7px", fontSize: 10, color: "#185FA5", fontWeight: 600,
                    }}>
                      {t("Preview", lang)}
                    </div>
                  </div>

                  {/* File name */}
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: "#1e293b",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} title={f.name}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      {isImg ? t("Image", lang) : "PDF"} &nbsp;·&nbsp; {t("click to preview", lang)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, gap: 10 }}>
        <button style={S.btnOutline} onClick={onBack}>{t("Back", lang)}</button>
        <button style={S.btnPrimary} onClick={onEdit}>{t("Edit entry", lang)}</button>
      </div>
    </div>
  );
}

/* ─── Report metadata bar ─── */
function ReportMeta({ meta }) {
  const { lang } = useLanguage();
  if (!meta) return null;
  return (
    <div style={{
      ...S.card, padding: "12px 16px", marginTop: 14,
      display: "flex", gap: 28, flexWrap: "wrap",
    }}>
      <div>
        <span style={S.label}>{t("Last saved", lang)}</span>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{formatDateTime(meta.savedAt)}</div>
      </div>
      {meta.submittedAt && (
        <div>
          <span style={S.label}>{t("Submitted", lang)}</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#27500A" }}>{formatDateTime(meta.submittedAt)}</div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN PAGE COMPONENT
════════════════════════════════════════════ */
export default function BalanceSheetPage() {
  const { lang } = useLanguage();
  const [view, setView] = useState("form");         // "form" | "cards" | "detail"
  const [rows, setRows] = useState([makeRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [savedEntries, setSavedEntries] = useState([]);
  const [detailEntry, setDetailEntry] = useState(null);
  const [reportMeta, setReportMeta] = useState(null);

  /* ── Row helpers ── */
  const updateRow = useCallback((id, key, val) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [key]: val };
        if (key === "schedule") updated.useCustom = val === "__custom__";
        return updated;
      })
    );
  }, []);

  const removeRow = useCallback((id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, makeRow(nextId)]);
    setNextId((n) => n + 1);
  }, [nextId]);

  const addFiles = useCallback((id, fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
      size: f.size,
    }));
    setRows((prev) =>
      prev.map((r) => r.id === id ? { ...r, files: [...r.files, ...newFiles] } : r)
    );
  }, []);

  const removeFile = useCallback((rowId, fileIdx) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const files = [...r.files];
        files.splice(fileIdx, 1);
        return { ...r, files };
      })
    );
  }, []);

  /* ── Save / Submit ── */
  const persist = (status) => {
    const valid = rows.filter((r) => r.schedule);
    if (!valid.length) {
      alert("Please fill at least one schedule row before saving.");
      return false;
    }
    const now = new Date().toISOString();
    setSavedEntries((prev) => {
      const next = [...prev];
      valid.forEach((row) => {
        const idx = next.findIndex((e) => e.id === row.id);
        const entry = { ...row, status, savedAt: now };
        if (idx >= 0) next[idx] = entry;
        else next.push(entry);
      });
      return next;
    });
    return true;
  };

  const handleSave = () => {
    if (!persist("draft")) return;
    setReportMeta({ savedAt: new Date().toISOString() });
    setRows([makeRow(nextId)]);
    setNextId((n) => n + 1);
    setView("cards");
  };

  const handleSubmit = () => {
    if (!persist("submitted")) return;
    const now = new Date().toISOString();
    setReportMeta({ savedAt: now, submittedAt: now });
    setRows([makeRow(nextId)]);
    setNextId((n) => n + 1);
    setView("cards");
  };

  const handleEdit = (entry) => {
    setRows([{ ...entry, status: undefined, savedAt: undefined }]);
    setView("form");
  };

  /* ── Views ── */
  const pageStyle = {
    padding: "32px 36px",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: "#1e293b",
  };

  /* Detail view */
  if (view === "detail" && detailEntry) {
    return (
      <div style={pageStyle}>
        <DetailView
          entry={detailEntry}
          onBack={() => setView("cards")}
          onEdit={() => handleEdit(detailEntry)}
        />
      </div>
    );
  }

  /* Cards view */
  if (view === "cards") {
    return (
      <div style={pageStyle}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#0891b214", borderRadius: 8, padding: "4px 12px", marginBottom: 10,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0891b2" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", textTransform: "uppercase", letterSpacing: 1 }}>
                {t("Balance Sheet", lang)}
              </span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 4 }}>
              {t("Schedule uploads", lang)}
            </h1>
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              {savedEntries.length} schedule{savedEntries.length !== 1 ? "s" : ""} saved
            </p>
          </div>
          <button style={S.btnPrimary} onClick={() => setView("form")}>+ {t("New entry", lang)}</button>
        </div>

        {/* Report metadata */}
        <ReportMeta meta={reportMeta} />

        {/* Cards grid */}
        {savedEntries.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 0",
            color: "#94a3b8", fontSize: 14,
          }}>
            {t("No entries saved yet. Click \"New entry\" to begin.", lang)}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
            marginTop: 20,
          }}>
            {savedEntries.map((entry) => (
              <ScheduleCard
                key={entry.id}
                entry={entry}
                onClick={() => { setDetailEntry(entry); setView("detail"); }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* Form view (default) */
  return (
    <div style={pageStyle}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#0891b214", borderRadius: 8, padding: "4px 12px", marginBottom: 10,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0891b2" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", textTransform: "uppercase", letterSpacing: 1 }}>
              {t("Balance Sheet", lang)}
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 4 }}>
            {t("Schedule upload", lang)}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            {t("Add schedule entries with supporting documents", lang)}
          </p>
        </div>
        {savedEntries.length > 0 && (
          <button style={S.btnOutline} onClick={() => setView("cards")}>
            {t("View saved", lang)} ({savedEntries.length})
          </button>
        )}
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <RowEntry
          key={row.id}
          row={row}
          canRemove={rows.length > 1}
          onUpdate={(key, val) => updateRow(row.id, key, val)}
          onRemove={() => removeRow(row.id)}
          onAddFiles={(files) => addFiles(row.id, files)}
          onRemoveFile={(fi) => removeFile(row.id, fi)}
        />
      ))}

      {/* Add row */}
      <button
        onClick={addRow}
        style={{
          width: "100%",
          borderStyle: "dashed",
          borderColor: "rgba(0,0,0,0.14)",
          borderRadius: 12,
          background: "transparent",
          color: "#94a3b8",
          fontSize: 13,
          height: 40,
          cursor: "pointer",
          marginBottom: 24,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        + {t("Add row", lang)}
      </button>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={S.btnOutline} onClick={handleSave}>{t("Save as draft", lang)}</button>
        <button style={S.btnSuccess} onClick={handleSubmit}>{t("Submit for approval", lang)}</button>
      </div>
    </div>
  );
}