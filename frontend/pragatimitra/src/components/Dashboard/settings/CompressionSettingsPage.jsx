import { useState, useEffect } from "react";
import { useApi } from "../../../hooks/useApi";
import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import PageHeader from "../../../ui/PageHeader";
import { invalidateCompressionCache } from "../../../hooks/useCompressionSettings";
import { Save, Loader2, Check, ImageIcon, FileText, Info } from "lucide-react";

const FIELD_STYLE = {
  width: "100%",
  padding: "8px 11px",
  borderRadius: 7,
  border: "1.5px solid #e2e8f0",
  fontSize: 13,
  color: "#1e293b",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

function NumberInput({ value, onChange, min = 1, step = 1, suffix }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...FIELD_STYLE, width: 130 }}
        onFocus={e  => (e.target.style.borderColor = "#2563eb")}
        onBlur={e   => (e.target.style.borderColor = "#e2e8f0")}
      />
      {suffix && (
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, flexShrink: 0 }}>{suffix}</span>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "16px 20px",
        borderBottom: "1px solid #f3f4f6",
        background: "#f8fafc",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: "linear-gradient(135deg, #2563eb, #3b82f6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={17} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{description}</div>
        </div>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
      <div style={{ minWidth: 160, paddingTop: 9 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export default function CompressionSettingsPage() {
  const { apiFetch } = useApi();
  const { lang } = useLanguage();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const [error,   setError]     = useState("");
  const [formErr, setFormErr]   = useState("");

  const [imgMin,  setImgMin]    = useState("40");
  const [imgMax,  setImgMax]    = useState("200");
  const [pdfMin,  setPdfMin]    = useState("1.0");
  const [pdfMax,  setPdfMax]    = useState("2.0");

  useEffect(() => {
    apiFetch("/api/compression-settings")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const s = d.settings;
          setImgMin(String(s.image_min_kb));
          setImgMax(String(s.image_max_kb));
          setPdfMin(String(s.pdf_min_mb));
          setPdfMax(String(s.pdf_max_mb));
        } else {
          setError(d.message || "Failed to load settings.");
        }
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  async function handleSave() {
    setFormErr("");
    const iMin = parseInt(imgMin, 10);
    const iMax = parseInt(imgMax, 10);
    const pMin = parseFloat(pdfMin);
    const pMax = parseFloat(pdfMax);

    if (!iMin || !iMax || iMin < 1 || iMax < 1) {
      setFormErr("Image sizes must be positive integers."); return;
    }
    if (iMin >= iMax) {
      setFormErr("Image minimum must be less than maximum."); return;
    }
    if (!pMin || !pMax || pMin < 0.01 || pMax < 0.01) {
      setFormErr("PDF sizes must be positive numbers."); return;
    }
    if (pMin >= pMax) {
      setFormErr("PDF minimum must be less than maximum."); return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/compression-settings", {
        method: "PUT",
        body: JSON.stringify({
          image_min_kb: iMin,
          image_max_kb: iMax,
          pdf_min_mb:   pMin,
          pdf_max_mb:   pMax,
        }),
      });
      const data = await res.json();
      if (data.success) {
        invalidateCompressionCache();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setFormErr(data.message || "Failed to save.");
      }
    } catch {
      setFormErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "50%", gap: 10, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#94a3b8",
    }}>
      <Loader2 size={20} style={{ animation: "spin 0.6s linear infinite" }} />
      {t("Loading…", lang)}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 18px", color: "#dc2626", fontSize: 13 }}>
        {error}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 680 }}>

      <PageHeader
        breadcrumb={[t("Home", lang), t("Settings", lang), t("File Compression Settings", lang)]}
        title={t("File Compression Settings", lang)}
        description={t("Set the allowed size range for image and PDF uploads across the application.", lang)}
      />

      {/* Info banner */}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: "#eff6ff", border: "1px solid #bfdbfe",
        borderRadius: 9, padding: "11px 14px", marginBottom: 20,
      }}>
        <Info size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "#1d4ed8", lineHeight: 1.6 }}>
          {t("These settings apply globally to all upload fields in Forms and Reports. Files outside the configured size range will be rejected at upload time.", lang)}
        </div>
      </div>

      {/* Image compression */}
      <SectionCard
        icon={ImageIcon}
        title={t("Image Compression", lang)}
        description={t("Allowed size range for JPEG, PNG and WebP image uploads.", lang)}
      >
        <FieldRow
          label={t("Minimum Size", lang)}
          hint={t("Reject images smaller than this", lang)}
        >
          <NumberInput value={imgMin} onChange={setImgMin} min={1} step={1} suffix="KB" />
        </FieldRow>
        <FieldRow
          label={t("Maximum Size", lang)}
          hint={t("Reject images larger than this", lang)}
        >
          <NumberInput value={imgMax} onChange={setImgMax} min={1} step={1} suffix="KB" />
        </FieldRow>
        <div style={{
          background: "#f8fafc", borderRadius: 7, border: "1px solid #e2e8f0",
          padding: "9px 13px", fontSize: 11.5, color: "#64748b",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Info size={12} color="#94a3b8" />
          {t("Default: 40 KB minimum · 200 KB maximum", lang)}
        </div>
      </SectionCard>

      {/* PDF compression */}
      <SectionCard
        icon={FileText}
        title={t("PDF Compression", lang)}
        description={t("Allowed size range for PDF document uploads.", lang)}
      >
        <FieldRow
          label={t("Minimum Size", lang)}
          hint={t("Reject PDFs smaller than this", lang)}
        >
          <NumberInput value={pdfMin} onChange={setPdfMin} min={0.01} step={0.1} suffix="MB" />
        </FieldRow>
        <FieldRow
          label={t("Maximum Size", lang)}
          hint={t("Reject PDFs larger than this", lang)}
        >
          <NumberInput value={pdfMax} onChange={setPdfMax} min={0.01} step={0.1} suffix="MB" />
        </FieldRow>
        <div style={{
          background: "#f8fafc", borderRadius: 7, border: "1px solid #e2e8f0",
          padding: "9px 13px", fontSize: 11.5, color: "#64748b",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Info size={12} color="#94a3b8" />
          {t("Default: 1 MB minimum · 2 MB maximum", lang)}
        </div>
      </SectionCard>

      {/* Validation error */}
      {formErr && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 7, padding: "9px 14px",
          color: "#dc2626", fontSize: 12, marginBottom: 14,
        }}>
          {formErr}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 20px", borderRadius: 8,
          border: "none", cursor: saving ? "not-allowed" : "pointer",
          background: saved ? "#10b981" : "#2563eb",
          color: "#fff", fontSize: 13, fontWeight: 700,
          opacity: saving ? 0.75 : 1,
          transition: "background 0.2s",
        }}
      >
        {saving ? (
          <><Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> {t("Saving…", lang)}</>
        ) : saved ? (
          <><Check size={14} /> {t("Saved", lang)}</>
        ) : (
          <><Save size={14} /> {t("Save Settings", lang)}</>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
