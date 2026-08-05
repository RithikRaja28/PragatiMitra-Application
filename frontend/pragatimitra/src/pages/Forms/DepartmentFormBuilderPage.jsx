import React, { useState, useEffect } from "react";
import { FileText, Wrench, ShieldCheck, Check, Trash2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { isAuthError } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";
import { color, Button } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";

/* Self-contained, department-scoped form builder. Independent of the
   institution FormBuilderPage (which must stay untouched). Posts to
   /api/department-forms and reuses the existing translation engine server-side. */

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "description", label: "Description (Paragraph)" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "document", label: "Document (Upload)" },
];

/* Department forms are always accessible to this fixed set of roles — the
   per-form role picker was removed. Display names only (server enforces the
   actual role keys: department_admin, nodal_officer, contributor). */
const FIXED_ACCESS_ROLES = ["Contributor", "Department Nodal Officer", "Department Admin"];

let _k = 0;
const nextKey = () => `dfk_${++_k}`;
const toIdentifier = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_");
const blankField = () => ({ _key: nextKey(), column_name: "", label: {}, type: "text", required: false, isNew: true });

const inputStyle = (err) => ({
  width: "100%", height: 44, padding: "0 14px", border: `1px solid ${err ? "#f87171" : color.borderStrong}`,
  borderRadius: 10, fontSize: 14, color: color.text, outline: "none", boxSizing: "border-box", background: "#fff",
});
const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 6 };
const card = { background: "#fff", borderRadius: 8, border: `1px solid ${color.border}`, boxShadow: "0 1px 3px rgba(16,24,40,0.04)", overflow: "hidden" };

function Stepper({ step }) {
  const { lang } = useLanguage();
  const steps = ["Form Details", "Schema Builder", "Review"];
  const pct = ((Math.min(step, steps.length) - 1) / (steps.length - 1)) * 100;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ position: "relative", height: 24, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 11, right: 11, height: 3, background: "#e5e7eb", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: 11, height: 3, background: color.primary, borderRadius: 2, width: `calc((100% - 22px) * ${pct / 100})`, transition: "width .35s" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%" }}>
          {steps.map((_, i) => {
            const idx = i + 1, done = idx < step, active = idx === step;
            return (
              <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", boxSizing: "border-box", background: done ? color.primary : "#fff", border: `2px solid ${done || active ? color.primary : "#cbd5e1"}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: active ? `0 0 0 4px ${color.primary}22` : "none" }}>
                {done && <Check size={12} color="#fff" strokeWidth={3.2} />}
                {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: color.primary }} />}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 11 }}>
        {steps.map((label, i) => {
          const idx = i + 1, done = idx < step, active = idx === step;
          return <div key={i} style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? color.primary : done ? "#334155" : color.muted, textAlign: i === 0 ? "left" : i === steps.length - 1 ? "right" : "center" }}>{t(label, lang)}</div>;
        })}
      </div>
    </div>
  );
}

function CardHeader({ icon, title, subtitle }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${color.border}`, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: color.muted, marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function FieldRow({ field, index, total, onChange, onRemove, onMove, isEdit }) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(true);
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type;

  // Bug 8 — the DB column key is IMMUTABLE once a field has been saved. A "rename"
  // must change only the human label, never the column_name: the schema PUT only
  // ADDs columns (it never renames the underlying table column), so editing the
  // name of an already-saved field would orphan its data into a new empty column.
  // Lock the column name for existing fields in edit mode; new fields stay editable.
  const lockColumnName = isEdit && !field.isNew;
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: color.text, fontFamily: "monospace" }}>{field.column_name || <span style={{ color: color.muted, fontStyle: "italic" }}>{t("unnamed_field", lang)}</span>}</span>
          <span style={{ fontSize: 11, color: color.muted, marginLeft: 8 }}>{field.label?.en || t("No label", lang)} · {t(typeLabel, lang)}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" iconOnly disabled={index === 0} title={t("Move up", lang)} icon={<ChevronUp size={15} />} onClick={() => onMove(index, -1)} />
          <Button variant="ghost" iconOnly disabled={index === total - 1} title={t("Move down", lang)} icon={<ChevronDown size={15} />} onClick={() => onMove(index, 1)} />
          <Button variant="ghost" iconOnly title={t("Remove", lang)} icon={<Trash2 size={15} color={color.danger} />} onClick={() => onRemove(index)} />
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${color.hover}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} onClick={(e) => e.stopPropagation()}>
          <div>
            <label style={labelStyle}>{t("Column Name *", lang)}</label>
            <input style={inputStyle(false)} value={field.column_name} placeholder={t("e.g. Student Name", lang)}
              readOnly={lockColumnName}
              onChange={(e) => onChange(index, "column_name", e.target.value.replace(/[^a-zA-Z0-9\s_]/g, ""))} />
            {lockColumnName && (
              <div style={{ fontSize: 11.5, color: color.muted, marginTop: 6, lineHeight: 1.4 }}>
                The column name is locked after creation to preserve existing data. Edit the label below to rename this field.
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t("Field Type", lang)}</label>
            {/* Locked once saved (Bug 9): the records column is created with this
                type and never ALTERed, so a change would corrupt stored data. */}
            <select style={inputStyle(false)} value={field.type} disabled={lockColumnName}
              onChange={(e) => onChange(index, "type", e.target.value)}>
              {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{t(ft.label, lang)}</option>)}
            </select>
            {lockColumnName && (
              <div style={{ fontSize: 11.5, color: color.muted, marginTop: 6, lineHeight: 1.4 }}>
                The field type is locked after creation to keep existing records readable.
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t("Label (English) *", lang)}</label>
            <input style={inputStyle(false)} value={field.label?.en || ""} placeholder={t("e.g. Student Name", lang)}
              onChange={(e) => onChange(index, "label.en", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>
    {t("Label (Hindi)", lang)}
    <span
        style={{
            fontSize: 11,
            color: color.muted,
            fontWeight: 400
        }}
    >
        ({t("Optional", lang)})
    </span>
</label>
            <input style={inputStyle(false)} value={field.label?.hi || ""} placeholder="जैसे छात्र का नाम"
              onChange={(e) => onChange(index, "label.hi", e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={!!field.required} onChange={(e) => onChange(index, "required", e.target.checked)} style={{ accentColor: color.primary, width: 15, height: 15 }} />
            <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{t("Required field", lang)}</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function DepartmentFormBuilderPage({ mode, initialData, onDone, onBack }) {
  const { apiFetch } = useApi();
  const { selectedYear } = useAcademicYear() || {};
  const { lang } = useLanguage();
  const isEdit = mode === "edit";

  const [step, setStep] = useState(1);
  const [name, setName] = useState(isEdit ? (initialData?.form_name?.replace(/_/g, " ") || "") : "");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState([]);
  /* Optional deadline (create flow only — default OFF). Edit manages it from the
     form list's Deadline modal. Date + time are combined in the local timezone. */
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [nameErr, setNameErr] = useState("");

  const identifier = isEdit ? (initialData?.form_name || "") : toIdentifier(name);

  /* Edit mode: load existing schema for this department form */
  useEffect(() => {
    if (!isEdit || !initialData?.id) return;
    apiFetch(`/api/department-forms/${initialData.id}/schema?year=${selectedYear ?? ""}`).then((r) => r.json()).then((d) => {
      if (d.success && d.schema) {
        setDescription(d.schema.description || "");
        setFields((d.schema.fields || []).map((f) => ({ _key: nextKey(), ...f })));
      }
    }).catch((e) => { if (!isAuthError(e)) setError(t("Failed to load schema.", lang)); });
  }, [isEdit, initialData, apiFetch, lang]);

  function updateField(idx, path, val) {
    setFields((prev) => {
      const next = [...prev]; const f = { ...next[idx] };
      if (path.includes(".")) { const [o, i] = path.split("."); f[o] = { ...f[o], [i]: val }; }
      else f[path] = val;
      next[idx] = f; return next;
    });
  }
  function removeField(idx) { setFields((prev) => prev.filter((_, i) => i !== idx)); }
  function moveField(idx, dir) {
    setFields((prev) => { const next = [...prev]; const j = idx + dir; if (j < 0 || j >= next.length) return prev; [next[idx], next[j]] = [next[j], next[idx]]; return next; });
  }
  function validateDetails() {
    if (!isEdit && !name.trim()) { setNameErr(t("Form name is required.", lang)); return false; }
    if (!isEdit && !/^[a-z]/.test(identifier)) { setNameErr(t("Form name must start with a letter.", lang)); return false; }
    setNameErr(""); return true;
  }
  function validateFields() {
    for (const f of fields) {
      if (!f.column_name.trim()) { setError(t("Every field needs a column name.", lang)); return false; }
      if (!f.label?.en?.trim()) { setError(t("Every field needs a Label (English).", lang)); return false; }
    }
    if (fields.length === 0) { setError(t("Add at least one field.", lang)); return false; }
    setError(""); return true;
  }

  function buildSchema() {
    return {
      display_label: name.trim() || identifier,
      description: description.trim(),
      fields: fields.map((f, i) => ({
        column_name: f.column_name.trim().toLowerCase().replace(/\s+/g, "_"),
        label: f.label || {},
        type: f.type,
        required: !!f.required,
        order: i,
      })),
    };
  }

  async function handleSubmit() {
    if (!validateFields()) { setStep(2); return; }
    setSubmitting(true); setError("");
    const schema = buildSchema();
    try {
      let res;
      if (isEdit) {
        res = await apiFetch(`/api/department-forms/${initialData.id}/schema`, {
          method: "PUT", body: JSON.stringify({ schema, year: selectedYear }),
        });
      } else {
        const deadline = (deadlineEnabled && deadlineDate)
          ? new Date(`${deadlineDate}T${deadlineTime || "23:59"}:00`).toISOString()
          : null;
        res = await apiFetch("/api/department-forms", {
          method: "POST",
          body: JSON.stringify({ form_name: identifier, form_description: description.trim(), schema, year: selectedYear, deadline }),
        });
      }
      const data = await res.json();
      if (!data.success) { setError(data.message || t("Failed to save form.", lang)); setSubmitting(false); return; }
      onDone(data.message || "Form saved successfully.");
    } catch (err) {
      if (!isAuthError(err)) setError(t("Network error. Please try again.", lang));
      setSubmitting(false);
    }
  }

  const modeLabel = isEdit ? t("Edit Department Form", lang) : t("Create Department Form", lang);

  return (
    <div style={{ background: "transparent", minHeight: "100%", padding: "20px 0", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: "0 28px" }}>
        <PageHeader
          breadcrumb={[t("Home", lang), { label: t("Department Forms", lang), onClick: onBack }, modeLabel]}
          title={modeLabel}
          description={isEdit ? t("Revise the field schema for this department form.", lang) : t("Define a new form scoped to your department.", lang)}
        />
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 28px" }}>
        <Stepper step={step} />

        {step === 1 && (
          <>
            <div style={card}>
              <CardHeader icon={<FileText size={18} />} title={t("Form Details", lang)} subtitle={t("Name your form and choose translation behavior.", lang)} />
              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>{t("Form Name *", lang)}</label>
                  <input style={inputStyle(!!nameErr)} value={name} readOnly={isEdit} placeholder={t("e.g. Student Feedback", lang)}
                    onChange={(e) => { setName(e.target.value.replace(/[^a-zA-Z0-9\s]/g, "")); setNameErr(""); }} />
                  <div style={{ fontSize: 11, color: color.muted, marginTop: 4 }}>{t("Stored as", lang)} <code style={{ fontFamily: "monospace", background: color.hover, padding: "1px 6px", borderRadius: 4 }}>dept_form_{identifier || "your_form"}</code></div>
                  {nameErr && <div style={{ fontSize: 11, color: color.danger, marginTop: 4 }}>{nameErr}</div>}
                </div>
                <div>
                  <label style={labelStyle}>{t("Description", lang)}</label>
                  <textarea style={{ ...inputStyle(false), height: "auto", minHeight: 80, padding: "12px 14px", resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("What is this form used for?", lang)} />
                </div>
                <div style={{ fontSize: 12, color: color.muted }}>
                  {t("Academic year:", lang)} <strong style={{ color: color.text }}>{selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : t("current", lang)}</strong> {t("— set from the top-bar selector.", lang)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" onClick={onBack}>{t("Cancel", lang)}</Button>
              <Button variant="primary" onClick={() => { if (validateDetails()) setStep(2); }}>{t("Next: Schema Builder →", lang)}</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={card}>
              <CardHeader icon={<Wrench size={18} />} title={t("Define Schema", lang)} subtitle={t("Add the fields this form will collect.", lang)} />
              <div style={{ padding: "16px 20px" }}>
                {fields.length === 0 && (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: color.muted, fontSize: 13, border: `1.5px dashed ${color.border}`, borderRadius: 8, marginBottom: 14 }}>
                    {t("No fields yet — click “Add Field” to start.", lang)}
                  </div>
                )}
                {fields.map((f, i) => (
                  <FieldRow key={f._key} field={f} index={i} total={fields.length} onChange={updateField} onRemove={removeField} onMove={moveField} isEdit={isEdit} />
                ))}
                <Button variant="secondary" icon={<Plus size={16} />} fullWidth onClick={() => setFields((p) => [...p, blankField()])}>{t("Add Field", lang)}</Button>
                {error && <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>{error}</div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setStep(1)}>{t("← Back", lang)}</Button>
              <Button variant="primary" onClick={() => { if (validateFields()) setStep(3); }}>{t("Next: Review →", lang)}</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={card}>
              <CardHeader icon={<ShieldCheck size={18} />} title={t("Review", lang)} subtitle={t("Confirm the details before saving this form.", lang)} />
              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={labelStyle}>{t("Who can access this form", lang)}</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {FIXED_ACCESS_ROLES.map((r) => (
                      <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                                              border: `1.5px solid ${color.primary}`, background: color.primarySoft, color: color.primary }}>
                        <Check size={13} /> {t(r, lang)}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: color.muted, marginTop: 8 }}>{t("Department forms are always available to these roles. Access also requires the same institution & department.", lang)}</div>
                </div>

                {!isEdit && (
                  <div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", background: color.hover, border: `1px solid ${color.border}`, borderRadius: 10, padding: "12px 14px" }}>
                      <input type="checkbox" checked={deadlineEnabled} onChange={(e) => setDeadlineEnabled(e.target.checked)} style={{ accentColor: color.primary, width: 16, height: 16, marginTop: 1 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{t("Enable submission deadline", lang)}</div>
                        <div style={{ fontSize: 12, color: color.muted, marginTop: 2 }}>{t("After this date & time the form auto-locks for your department", lang)} ({selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : t("current year", lang)} {t("only", lang)}) — {t("members can still view and export. You can change it later.", lang)}</div>
                      </div>
                    </label>
                    {deadlineEnabled && (
                      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                        <div style={{ flex: 1.4 }}>
                          <label style={labelStyle}>{t("Deadline Date", lang)}</label>
                          <input type="date" style={inputStyle(false)} value={deadlineDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeadlineDate(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={labelStyle}>{t("Time", lang)}</label>
                          <input type="time" style={inputStyle(false)} value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: color.hover, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("Summary", lang)}</div>
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                    <Row label={t("Form Name", lang)} value={name || identifier} />
                    <Row label={t("Stored Table", lang)} value={`dept_form_${identifier}`} mono />
                    <Row label={t("Academic Year", lang)} value={selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : t("current", lang)} />
                    <Row label={t("Fields", lang)} value={String(fields.length)} />
                    {!isEdit && <Row label={t("Deadline", lang)} value={deadlineEnabled && deadlineDate ? `${deadlineDate} ${deadlineTime || "23:59"}` : t("None", lang)} />}
                  </div>
                </div>
                {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>{error}</div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" disabled={submitting} onClick={() => setStep(2)}>{t("← Back", lang)}</Button>
              <Button variant="primary" loading={submitting} disabled={submitting} icon={<Check size={18} strokeWidth={2} />} onClick={handleSubmit}>
                {isEdit ? t("Save Changes", lang) : t("Create Form", lang)}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, minWidth: 130 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1e293b", fontFamily: mono ? "monospace" : "inherit" }}>{value || "—"}</span>
    </div>
  );
}
