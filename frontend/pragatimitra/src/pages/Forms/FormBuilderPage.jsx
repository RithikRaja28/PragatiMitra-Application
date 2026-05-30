import React, { useState, useEffect, useRef } from "react";
import { FileText, Wrench, CheckCircle2 } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { S, isAuthError } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";

/* ════════════════════════════════════════════════════════════════════
   FormBuilderPage — 3-step wizard for creating / adapting / editing
   a form schema.

   Props:
     mode        – "create" | "adapt" | "edit"
     initialData – the form/template object from the list (may be null)
     isSuperAdmin – boolean
     onDone(message) – called after successful save
     onBack()    – called on cancel / back from step 1
════════════════════════════════════════════════════════════════════ */

const ACCENT       = "#2563eb";
const CURRENT_YEAR = new Date().getFullYear();

/* field types shown to user; "boolean" renders as "Yes / No" in UI */
const FIELD_TYPES = [
  { value: "text",        label: "Text" },
  { value: "textarea",    label: "Long Text" },
  { value: "description", label: "Description (Paragraph)" },
  { value: "number",      label: "Number" },
  { value: "date",        label: "Date" },
  { value: "boolean",     label: "Yes / No" },
  { value: "email",       label: "Email" },
  { value: "phone",       label: "Phone" },
  { value: "document",    label: "Document (Upload)" },
];

/* Language-conversion mode is derived automatically from the field type and is
   never chosen by the admin. Mirrors the backend (translationService.js):
     transliterate — phonetic, for names/cities/proper nouns (Divakar → दिवाकर)
     translate     — real sentence translation (I am walking → मैं कॉलेज जा रहा हूँ)
     none          — copy the value verbatim (numbers, dates, emails, files)
   Kept in sync with the backend so existing `text` fields keep transliterating. */
const DEFAULT_TRANSLATION_MODE = {
  text: "transliterate", textarea: "transliterate", description: "translate",
  number: "none", date: "none", boolean: "none",
  email: "none", phone: "none", document: "none",
};
function defaultTranslationMode(type) {
  return DEFAULT_TRANSLATION_MODE[type] || "transliterate";
}

/* derive DB identifier from human-readable form name */
function toIdentifier(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/* stable unique key for each field instance */
let _keyCounter = 0;
function nextKey() { return `fk_${++_keyCounter}`; }

/* ── Icons ── */
function IcoChevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {up ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Step indicator ── */
function StepBar({ step }) {
  const steps = ["Form Basics", "Schema Builder", "Review & Save"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 22 }}>
      {steps.map((label, i) => {
        const idx    = i + 1;
        const done   = idx < step;
        const active = idx === step;
        return (
          <React.Fragment key={idx}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center",
                background: done ? "#10b981" : active ? ACCENT : "#e2e8f0",
                color: done || active ? "#fff" : "#94a3b8",
                fontSize: 12, fontWeight: 700, transition: "all .2s",
              }}>
                {done ? "✓" : idx}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
                color: active ? ACCENT : done ? "#10b981" : "#94a3b8",
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 8px", marginBottom: 18,
                background: done ? "#10b981" : "#e2e8f0", transition: "background .2s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Field row — uses stable _key so expanded state survives typing ── */
function FieldRow({ field, index, total, isFixed, onChange, onRemove, onMoveUp, onMoveDown, languages, usedColumnNames, currentColumnNames }) {
  const [expanded, setExpanded] = useState(false);

  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type;

  return (
    <div style={{
      border: `1.5px solid ${isFixed ? "#e0f2fe" : "#e2e8f0"}`,
      borderRadius: 12, overflow: "hidden", marginBottom: 10,
      background: isFixed ? "#f0f9ff" : "#fff",
    }}>
      {/* header row — clicking toggles expansion */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer" }}
        onClick={() => setExpanded((x) => !x)}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: isFixed ? "#bae6fd" : "#cffafe",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10.5, fontWeight: 700, color: isFixed ? "#0369a1" : ACCENT,
        }}>
          {index + 1}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>
              {field.column_name || <span style={{ color: "#94a3b8", fontStyle: "italic", fontFamily: "inherit" }}>unnamed_field</span>}
            </span>
            {isFixed && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#2563eb18", color: "#2563eb", textTransform: "uppercase" }}>Fixed</span>
            )}
            {field.required && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#fef3c718", color: "#d97706", textTransform: "uppercase" }}>Required</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
            {field.label?.en || "No label"} · {typeLabel}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMoveUp(index)} disabled={index === 0} title="Move up"
            style={{ ...ghostBtn, opacity: index === 0 ? 0.3 : 1 }}>
            <IcoChevron up />
          </button>
          <button onClick={() => onMoveDown(index)} disabled={index === total - 1} title="Move down"
            style={{ ...ghostBtn, opacity: index === total - 1 ? 0.3 : 1 }}>
            <IcoChevron />
          </button>
          {!isFixed && (
            <button onClick={() => onRemove(index)} title="Remove field" style={{ ...ghostBtn, color: "#dc2626" }}>
              <IcoTrash />
            </button>
          )}
        </div>

        <div style={{ color: "#94a3b8", flexShrink: 0 }}>
          <IcoChevron up={expanded} />
        </div>
      </div>

      {/* expanded detail — stop propagation so clicks inside don't toggle collapse */}
      {expanded && (
        <div
          style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* column_name — accepts spaces; stored as snake_case */}
          <div>
            <label style={S.label}>Column Name *</label>
            {(() => {
              const normalized = field.column_name.trim().toLowerCase().replace(/\s+/g, "_");
              const isReused = !isFixed && normalized &&
                usedColumnNames?.has(normalized) &&
                !currentColumnNames?.has(normalized);
              return (
                <>
                  <input
                    style={S.input(isReused)}
                    value={field.column_name}
                    readOnly={isFixed}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^a-zA-Z0-9\s_]/g, "");
                      onChange(index, "column_name", raw);
                    }}
                    placeholder="e.g. Student Name"
                  />
                  {isReused && (
                    <div style={S.errorText}>
                      "{normalized}" was previously used and cannot be reused — choose a different name.
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* field type */}
          <div>
            <label style={S.label}>Field Type</label>
            <select
              style={S.select(false)}
              value={field.type}
              onChange={(e) => onChange(index, "type", e.target.value)}
              disabled={isFixed}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* language labels — one input per supported language */}
          {languages.map((lang) => (
            <div key={lang.code}>
              <label style={S.label}>Label ({lang.name})</label>
              <input
                style={S.input(false)}
                value={field.label?.[lang.code] || ""}
                onChange={(e) => onChange(index, `label.${lang.code}`, e.target.value)}
                placeholder={`Label in ${lang.name}`}
              />
            </div>
          ))}

          {/* required toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onChange(index, "required", e.target.checked)}
                style={{ accentColor: ACCENT, width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Required field</span>
            </label>
          </div>

          {/* document hint */}
          {field.type === "document" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{
                background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8,
                padding: "10px 14px", fontSize: 12, color: "#0369a1",
              }}>
                Document fields store a file URL. The file upload UI will be shown when filling this form.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "#64748b",
};

/* ── blank field factory ── */
function blankField(order) {
  return {
    _key:        nextKey(),
    isNew:       true,   // not yet saved to DB — safe to fully remove
    column_name: "",
    label:       {},
    type:        "text",
    is_fixed:    false,
    required:    false,
    order,
    options:     [],
  };
}

/* ── convert a DB column row into a field object ── */
function dbColToField(col, order) {
  const typeMap = {
    "character varying": "text", text: "text",
    integer: "number", bigint: "number", numeric: "number",
    date: "date", "timestamp with time zone": "date",
    boolean: "boolean", jsonb: "text",
  };
  return {
    _key:        nextKey(),
    column_name: col.column_name,
    label:       { en: col.column_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) },
    type:        typeMap[col.data_type] || "text",
    is_fixed:    true,
    required:    col.is_nullable === "NO",
    order,
    options:     [],
  };
}

/* ════════════════════════════════════════════════════════════════════
   Main component
════════════════════════════════════════════════════════════════════ */
export default function FormBuilderPage({ mode, initialData, isSuperAdmin, onDone, onBack }) {
  const { apiFetch } = useApi();

  const isCreate = mode === "create";
  const isAdapt  = mode === "adapt";
  const isEdit   = mode === "edit";
  const modeLabel = isCreate ? "Create New Form" : isAdapt ? "Adapt Template" : "Edit Schema";

  /* ── Step 1 state ── */
  const [step, setStep]     = useState(1);
  const [basics, setBasics] = useState({
    form_name:   isEdit || isAdapt ? (initialData?.form_name?.replace(/_/g, " ") || "") : "",
    description: "",
    share_table: false,
    year:        CURRENT_YEAR,
  });
  const [basicsErrors, setBasicsErrors] = useState({});

  /* derived identifier — e.g. "Student Records" → "student_records" */
  const identifier = isEdit || isAdapt
    ? (initialData?.form_name || "")
    : toIdentifier(basics.form_name);

  /* ── Languages ── */
  const [languages, setLanguages] = useState([{ code: "en", name: "English" }]);
  useEffect(() => {
    apiFetch("/api/forms/languages")
      .then((r) => r.json())
      .then((d) => { if (d.success && d.languages?.length) setLanguages(d.languages); })
      .catch(() => {});
  }, [apiFetch]);

  /* ── Step 2 state ── */
  const [fields, setFields]               = useState([]);
  // column names excluded from the active form (fixed toggles + any removed fields in edit mode)
  const [excludedFixed, setExcludedFixed] = useState(new Set());
  const [colsLoading, setColsLoading]     = useState(false);
  const [colsError, setColsError]         = useState("");
  // column names ever used in this form's schema (prevents reuse of deleted columns)
  const [usedColumnNames, setUsedColumnNames] = useState(new Set());

  /* ── Submit state ── */
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");

  /* ── Load existing schema in edit mode ── */
  useEffect(() => {
    if (!isEdit || !initialData?.form_name) return;

    function applySchema(existingSchema, year) {
      if (!existingSchema?.fields) return;
      // Deduplicate by normalised column name — old saves could have ghost duplicates
      const seen = new Set();
      const uniqueFields = existingSchema.fields.filter((f) => {
        const col = f.column_name?.trim().toLowerCase().replace(/\s+/g, "_");
        if (!col || seen.has(col)) return false;
        seen.add(col);
        return true;
      });
      setFields(uniqueFields.map((f, i) => ({ _key: nextKey(), ...f, order: i })));
      // Populate excludedFixed from: explicit excluded_fixed_columns + legacy hidden:true fields
      const fromExcluded = existingSchema.excluded_fixed_columns || [];
      const fromHidden   = existingSchema.fields.filter((f) => f.hidden).map((f) => f.column_name);
      setExcludedFixed(new Set([...fromExcluded, ...fromHidden]));
      setBasics((b) => ({
        ...b,
        description: existingSchema.description || b.description,
        year: year || b.year,
      }));
    }

    // If initialData already carries a full schema object, use it directly
    if (initialData.schema?.fields) {
      applySchema(initialData.schema, initialData.year);
      if (initialData.used_column_names?.length) {
        setUsedColumnNames(new Set(initialData.used_column_names));
      }
      return;
    }

    // Otherwise fetch the active schema from the API
    setColsLoading(true);
    setColsError("");
    apiFetch(`/api/forms/${initialData.form_name}/schema`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.schema) {
          applySchema(data.schema.schema, data.schema.year);
          if (data.schema.used_column_names?.length) {
            setUsedColumnNames(new Set(data.schema.used_column_names));
          }
        } else {
          setColsError(data.message || "Could not load schema.");
        }
      })
      .catch((err) => { if (!isAuthError(err)) setColsError("Failed to fetch schema."); })
      .finally(() => setColsLoading(false));
  }, [isEdit, initialData, apiFetch]);

  /* ── Load table columns in adapt mode ── */
  useEffect(() => {
    if (!isAdapt || !initialData?.form_name) return;
    setColsLoading(true);
    setColsError("");
    apiFetch(`/api/forms/${initialData.form_name}/table-columns`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setFields(data.columns.map((col, i) => dbColToField(col, i)));
        else setColsError(data.message || "Could not load table columns.");
      })
      .catch((err) => { if (!isAuthError(err)) setColsError("Failed to fetch table columns."); })
      .finally(() => setColsLoading(false));
  }, [isAdapt, initialData, apiFetch]);

  /* ── Step 1 validation ── */
  function validateBasics() {
    const errs = {};
    if (!isEdit && !basics.form_name.trim()) {
      errs.form_name = "Form name is required.";
    } else if (!isEdit && !/^[a-z]/.test(identifier)) {
      errs.form_name = "Form name must start with a letter.";
    }
    if (!basics.year || basics.year < 2020 || basics.year > 2100) errs.year = "Enter a valid year.";
    setBasicsErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /* ── Field helpers ── */
  function addField() {
    setFields((f) => [...f, blankField(f.length)]);
  }

  function updateField(idx, path, value) {
    setFields((prev) => {
      const next  = [...prev];
      const field = { ...next[idx] };
      if (path.includes(".")) {
        const [outer, inner] = path.split(".");
        field[outer] = { ...field[outer], [inner]: value };
      } else {
        field[path] = value;
      }
      next[idx] = field;
      return next;
    });
  }

  function removeField(idx) {
    setFields((prev) => {
      const removed = prev[idx];
      const colName = removed.column_name?.trim().toLowerCase().replace(/\s+/g, "_");
      if (isEdit && colName && !removed.isNew) {
        // Field came from the DB: keep it in fields[] so schema.fields stays
        // complete; express exclusion only via excluded_fixed_columns.
        setExcludedFixed((ex) => { const n = new Set(ex); n.add(colName); return n; });
        return prev;
      }
      // New field (never saved) or create/adapt mode: remove it entirely.
      return prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i }));
    });
  }

  function moveField(idx, dir) {
    setFields((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
  }

  function toggleExclude(colName) {
    setExcludedFixed((prev) => {
      const next = new Set(prev);
      next.has(colName) ? next.delete(colName) : next.add(colName);
      return next;
    });
  }

  const activeFields = (isAdapt || isEdit)
    ? fields.filter((f) => {
        const col = f.column_name?.trim().toLowerCase().replace(/\s+/g, "_") || f.column_name;
        return !excludedFixed.has(f.column_name) && !excludedFixed.has(col);
      })
    : fields;

  /* ── Build schema object ── */
  function buildSchema() {
    // All fields are kept in fields[] regardless of exclusion status.
    // excluded_fixed_columns is the sole indicator of what is inactive.
    const allFields = fields.map((f, i) => {
      const { _key, hidden, isNew, ...rest } = f; // strip internal flags
      return {
        // translation_mode is always derived from the field type (never chosen
        // by the admin); this explicit value overrides any older stored mode.
        ...rest,
        column_name: f.column_name.trim().toLowerCase().replace(/\s+/g, "_"),
        translation_mode: defaultTranslationMode(f.type),
        order: i,
      };
    });

    return {
      display_label: basics.form_name.trim() || identifier,
      description:   basics.description.trim(),
      fields: allFields,
      excluded_fixed_columns: Array.from(excludedFixed).map((c) =>
        c.trim().toLowerCase().replace(/\s+/g, "_")
      ),
    };
  }

  /* ── Validate step 2 ── */
  function validateFields() {
    const currentColumnNames = new Set(
      fields.map((f) => f.column_name.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean)
    );
    for (const f of activeFields) {
      if (!f.column_name.trim()) { setSubmitError("All fields must have a column name."); return false; }
      if (!f.label?.en?.trim())  { setSubmitError("All fields must have an English label."); return false; }
      if (!f.is_fixed) {
        const normalized = f.column_name.trim().toLowerCase().replace(/\s+/g, "_");
        if (usedColumnNames.has(normalized) && !currentColumnNames.has(normalized)) {
          setSubmitError(`Column name "${normalized}" was previously used and cannot be reused.`);
          return false;
        }
      }
    }
    setSubmitError("");
    return true;
  }

  /* ── Submit ── */
  async function handleSubmit() {
    if (!validateFields()) return;
    setSubmitting(true);
    setSubmitError("");
    const schema = buildSchema();

    try {
      let res;
      if (isCreate) {
        res = await apiFetch("/api/forms", {
          method: "POST",
          body: JSON.stringify({ form_name: identifier, share_table: basics.share_table, schema, year: basics.year }),
        });
      } else if (isAdapt) {
        res = await apiFetch("/api/forms/adopt", {
          method: "POST",
          body: JSON.stringify({ form_name: initialData.form_name, schema, year: basics.year }),
        });
      } else {
        res = await apiFetch(`/api/forms/${initialData.form_name}/schema`, {
          method: "PUT",
          body: JSON.stringify({ schema, year: initialData.year || basics.year }),
        });
      }

      const data = await res.json();
      if (data.success) onDone(data.message);
      else setSubmitError(data.message || "Failed to save form.");
    } catch (err) {
      if (!isAuthError(err)) setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ══════════════ RENDER ══════════════ */
  return (
    <div style={{ background: "#f8f9fb", minHeight: "100%", padding: "20px 0", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .fb-input:focus, .fb-input:focus-visible {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.14);
          outline: none;
        }
      `}</style>
      {/* page header — full-width, top-left after the navbar; "Forms" crumb cancels back to the forms list */}
      <div style={{ padding: "0 28px" }}>
        <PageHeader
          breadcrumb={["Home", { label: "Forms", onClick: onBack }, modeLabel]}
          title={
            <>
              {modeLabel}
              {(isAdapt || isEdit) && initialData?.form_name && (
                <span style={{ fontSize: 13.5, color: "#94a3b8", fontWeight: 500, marginLeft: 10 }}>
                  · {initialData.form_name}
                </span>
              )}
            </>
          }
          description={
            isCreate ? "Define a new form with a custom field schema."
            : isAdapt ? "Customise this shared template for your institution."
            : isEdit  ? "Revise the field schema. A new version will be created."
            : ""
          }
        />
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 28px" }}>
      <StepBar step={step} />

      {/* ─── Step 1: Basics ─── */}
      {step === 1 && (
        <>
          <div style={card}>
            <CardHeader
              icon={<FileText size={18} color="#2563eb" strokeWidth={2} />}
              title="Form Details"
              subtitle="Give your form a name and optional description"
              action={<CancelFormButton onClick={onBack} />}
            />
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Form name — human readable; identifier shown below */}
              <div>
                <label style={S.label}>Form Name *</label>
                <input
                  className="fb-input"
                  style={S.input(!!basicsErrors.form_name)}
                  value={basics.form_name}
                  readOnly={isEdit || isAdapt}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9\s]/g, "");
                    setBasics((b) => ({ ...b, form_name: val }));
                    if (basicsErrors.form_name) setBasicsErrors((er) => ({ ...er, form_name: "" }));
                  }}
                  placeholder="e.g. Student Records"
                />
                <div style={hintStyle}>A short, descriptive name. Stored as <span style={monoHint}>{identifier || "your_form_id"}</span>.</div>
                {basicsErrors.form_name && <div style={S.errorText}>{basicsErrors.form_name}</div>}
              </div>

              {/* description */}
              <div>
                <label style={S.label}>Description</label>
                <textarea
                  className="fb-input"
                  style={{ ...S.input(false), resize: "vertical", minHeight: 72 }}
                  value={basics.description}
                  onChange={(e) => setBasics((b) => ({ ...b, description: e.target.value }))}
                  placeholder="What is this form used for?"
                />
                <div style={hintStyle}>Helps your team understand the form's purpose at a glance.</div>
              </div>

              {/* year */}
              <div style={{ maxWidth: 220 }}>
                <label style={S.label}>Schema Year *</label>
                <input
                  className="fb-input"
                  type="number"
                  style={S.input(!!basicsErrors.year)}
                  value={basics.year}
                  onChange={(e) => {
                    setBasics((b) => ({ ...b, year: Number(e.target.value) }));
                    if (basicsErrors.year) setBasicsErrors((er) => ({ ...er, year: "" }));
                  }}
                  min={2020} max={2100}
                />
                <div style={hintStyle}>The academic / fiscal year this schema applies to.</div>
                {basicsErrors.year && <div style={S.errorText}>{basicsErrors.year}</div>}
              </div>

            </div>
          </div>

          <div style={stepBar}>
            <button type="button" disabled style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "#e2e8f0", color: "#94a3b8", border: "none",
              borderRadius: 8, padding: "0 16px", height: 34, fontSize: 12.5, fontWeight: 700,
              cursor: "not-allowed", whiteSpace: "nowrap",
            }}>
              ← Previous Step
            </button>
            <button type="button" onClick={() => { if (validateBasics()) setStep(2); }} style={S.btnPrimary(false)}>
              Next: Schema Builder →
            </button>
          </div>
        </>
      )}

      {/* ─── Step 2: Schema Builder ─── */}
      {step === 2 && (
        <>
        <div style={card}>
          <CardHeader
            icon={<Wrench size={18} color="#2563eb" strokeWidth={2} />}
            title="Define Schema"
            subtitle={isAdapt ? "Toggle fixed columns on/off, then add extra custom fields" : "Define the fields that will be collected by this form"}
            action={<CancelFormButton onClick={onBack} />}
          />

          {colsLoading && (
            <div style={{ padding: "32px 28px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              {isEdit ? "Loading existing schema…" : "Loading table columns…"}
            </div>
          )}
          {colsError && (
            <div style={{ margin: "16px 28px", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c" }}>
              {colsError}
            </div>
          )}

          {!colsLoading && (
            <div style={{ padding: "14px 20px" }}>

              {/* adapt mode: fixed column toggles */}
              {isAdapt && fields.filter((f) => f.is_fixed).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                    Fixed Columns — toggle to include / exclude
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {fields.filter((f) => f.is_fixed).map((f) => {
                      const excluded = excludedFixed.has(f.column_name);
                      return (
                        <button key={f.column_name} type="button" onClick={() => toggleExclude(f.column_name)} style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          cursor: "pointer", transition: "all .15s",
                          background: excluded ? "#f1f5f9" : "#cffafe",
                          color:      excluded ? "#94a3b8"  : ACCENT,
                          border:     `1.5px solid ${excluded ? "#e2e8f0" : "#a5f3fc"}`,
                          textDecoration: excluded ? "line-through" : "none",
                        }}>
                          {excluded ? "✕" : "✓"} {f.column_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* active fields list */}
              {activeFields.length === 0 && !isAdapt && (
                <div style={{
                  textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13,
                  border: "1.5px dashed #e2e8f0", borderRadius: 12, marginBottom: 16,
                }}>
                  No fields yet — click "Add Field" to start building your schema.
                </div>
              )}

              {activeFields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                    Fields ({activeFields.length}) — click to expand and edit
                  </div>
                  {(() => {
                    const currentColumnNames = new Set(
                      fields.map((f) => f.column_name.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean)
                    );
                    return activeFields.map((field, i) => {
                      const globalIdx = fields.indexOf(field);
                      return (
                        <FieldRow
                          key={field._key}
                          field={field}
                          index={i}
                          total={activeFields.length}
                          isFixed={field.is_fixed}
                          languages={languages}
                          usedColumnNames={usedColumnNames}
                          currentColumnNames={currentColumnNames}
                          onChange={(_, path, val) => updateField(globalIdx !== -1 ? globalIdx : i, path, val)}
                          onRemove={() => removeField(globalIdx !== -1 ? globalIdx : i)}
                          onMoveUp={() => moveField(i, -1)}
                          onMoveDown={() => moveField(i, 1)}
                        />
                      );
                    });
                  })()}
                </div>
              )}

              <button type="button" onClick={addField} style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "#f8fafc", color: "#475569", border: "1.5px dashed #cbd5e1",
                borderRadius: 8, padding: "0 16px", height: 34, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", width: "100%", justifyContent: "center",
              }}>
                <IcoPlus /> Add Custom Field
              </button>

              {/* Restore excluded columns — edit mode only */}
              {isEdit && excludedFixed.size > 0 && (
                <div style={{ marginTop: 20, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                    Excluded Columns — click to restore
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(() => {
                      const seenCols = new Set();
                      return fields.filter((f) => {
                        const col = f.column_name?.trim().toLowerCase().replace(/\s+/g, "_");
                        if (!col || seenCols.has(col)) return false;
                        if (!excludedFixed.has(f.column_name) && !excludedFixed.has(col)) return false;
                        seenCols.add(col);
                        return true;
                      });
                    })()
                      .map((f) => {
                        const col = f.column_name?.trim().toLowerCase().replace(/\s+/g, "_") || f.column_name;
                        const typeLabel = FIELD_TYPES.find((t) => t.value === f.type)?.label || f.type;
                        return (
                          <button
                            key={col}
                            type="button"
                            onClick={() => {
                              setExcludedFixed((prev) => {
                                const next = new Set(prev);
                                next.delete(f.column_name);
                                next.delete(col);
                                return next;
                              });
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                              cursor: "pointer", transition: "all .15s",
                              background: "#fef3c7", color: "#92400e",
                              border: "1.5px solid #fde68a",
                            }}
                          >
                            ↩ {col}
                            <span style={{ fontSize: 10, color: "#b45309", fontWeight: 400 }}>({typeLabel})</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* consent to share — create mode only */}
              {isCreate && (
                <div style={{ marginTop: 20, background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "14px 18px" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={basics.share_table}
                      onChange={(e) => setBasics((b) => ({ ...b, share_table: e.target.checked }))}
                      style={{ accentColor: ACCENT, width: 16, height: 16, marginTop: 1 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0369a1" }}>Consent to share with other institutions</div>
                      <div style={{ fontSize: 12, color: "#2563eb", marginTop: 3 }}>Enabling this allows other institutions to adopt and customise this form as a template.</div>
                    </div>
                  </label>
                </div>
              )}

              {submitError && (
                <div style={{ marginTop: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" }}>
                  {submitError}
                </div>
              )}
            </div>
          )}

        </div>

        <div style={stepBar}>
          <button type="button" onClick={() => setStep(1)} style={S.btnGhost}>← Previous Step</button>
          <button type="button" onClick={() => { if (validateFields()) setStep(3); }} style={S.btnPrimary(false)}>
            Next: Review & Save →
          </button>
        </div>
        </>
      )}

      {/* ─── Step 3: Review & Save ─── */}
      {step === 3 && (
        <>
        <div style={card}>
          <CardHeader
            icon={<CheckCircle2 size={18} color="#2563eb" strokeWidth={2} />}
            title="Review & Save"
            subtitle="Confirm the form details before saving"
            action={<CancelFormButton onClick={onBack} />}
          />

          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <ReviewSection title="Form Metadata Review">
              <ReviewRow label="Form Name"       value={basics.form_name || initialData?.form_name} />
              <ReviewRow label="Schema Year"     value={String(basics.year)} />
              {basics.description && <ReviewRow label="Description" value={basics.description} />}
              {isSuperAdmin && isCreate && (
                <ReviewRow label="Shared Template" value={basics.share_table ? "Yes — available to all institutions" : "No — private to this institution"} />
              )}
            </ReviewSection>

            <ReviewSection title={`Schema Architecture Preview · ${activeFields.length} field${activeFields.length !== 1 ? "s" : ""}`}>
              {activeFields.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No fields defined.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {activeFields.map((f, i) => (
                    <div key={f._key || i} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                      background: f.is_fixed ? "#f0f9ff" : "#f8fafc", borderRadius: 8,
                    }}>
                      <span style={{ width: 22, fontSize: 11, color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1e293b", fontWeight: 600, minWidth: 160 }}>{f.column_name}</span>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{f.label?.en}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
                        {FIELD_TYPES.find((t) => t.value === f.type)?.label || f.type}
                      </span>
                      {f.is_fixed && <span style={{ fontSize: 10, color: "#2563eb", fontWeight: 700, background: "#e0f2fe", padding: "1px 7px", borderRadius: 20 }}>FIXED</span>}
                      {f.required && <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700, background: "#fef3c7", padding: "1px 7px", borderRadius: 20 }}>REQ</span>}
                    </div>
                  ))}
                </div>
              )}
            </ReviewSection>

            {isAdapt && excludedFixed.size > 0 && (
              <ReviewSection title="Excluded Fixed Columns">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Array.from(excludedFixed).map((col) => (
                    <span key={col} style={{ fontFamily: "monospace", fontSize: 12, padding: "3px 10px", background: "#fef2f2", color: "#b91c1c", borderRadius: 6, border: "1px solid #fecaca" }}>
                      {col}
                    </span>
                  ))}
                </div>
              </ReviewSection>
            )}

            {submitError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" }}>
                {submitError}
              </div>
            )}
          </div>

        </div>

        <div style={stepBar}>
          <button type="button" onClick={() => setStep(2)} style={S.btnGhost} disabled={submitting}>← Back to Schema</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: submitting ? "#86efac" : "#16a34a",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "0 18px", height: 34, fontSize: 12.5, fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: submitting ? "none" : "0 2px 8px rgba(22,163,74,0.30)",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 16, height: 16, borderRadius: 4, background: "rgba(255,255,255,0.22)",
              fontSize: 11, fontWeight: 700, lineHeight: 1,
            }}>✓</span>
            {submitting ? "Publishing…" : isEdit ? "Save New Version" : isAdapt ? "Adopt Template" : "Finalize & Publish Form"}
          </button>
        </div>
        </>
      )}
      </div>
    </div>
  );
}

/* ── shared layout sub-components ── */

const card = {
  background: "#fff", borderRadius: 14, border: "1px solid rgba(15,23,42,0.06)",
  boxShadow: "0 8px 28px rgba(15,23,42,0.07), 0 2px 6px rgba(15,23,42,0.04)",
  overflow: "hidden",
};

const footerRow = {
  padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 10,
  borderTop: "1px solid #eef2f6", marginTop: 4,
};

/* External step button bar — sits BELOW the card, not inside it */
const stepBar = {
  marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
};

const hintStyle = {
  fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.4,
};

const monoHint = {
  fontFamily: "monospace", color: "#64748b", background: "#f1f5f9",
  padding: "1px 6px", borderRadius: 4, fontSize: 10.5,
};

/* Secondary gray cancel button — muted red "X" glyph, gray label and border */
function CancelFormButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "#fff", color: "#475569", border: "1px solid #cbd5e1",
        borderRadius: 8, padding: "0 12px", height: 30, fontSize: 11.5, fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap",
        transition: "background .15s, border-color .15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#94a3b8"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: 4, background: "#fee2e2",
        color: "#dc2626", fontSize: 10, fontWeight: 700, lineHeight: 1,
      }}>✕</span>
      Cancel Form
    </button>
  );
}

function CardHeader({ icon, title, subtitle, action }) {
  return (
    <div style={{ padding: "12px 18px 12px 16px", borderBottom: "1px solid #eef2f6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ecfeff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

function ReviewSection({ title, children }) {
  return (
    <div style={{ border: "1px solid #f1f5f9", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9" }}>
        {title}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1e293b", fontFamily: mono ? "monospace" : "inherit" }}>
        {value || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}
      </span>
    </div>
  );
}