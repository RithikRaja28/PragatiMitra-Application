import React, { useState, useEffect } from "react";
import { FileText, Wrench, ShieldCheck, Check, Trash2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { isAuthError } from "../../components/shared/formUtils";
import PageHeader from "../../components/shared/PageHeader";
import { color, Button } from "../../ui";

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
/* Mirrors backend translationService defaults (kept in sync with institution). */
const TRANSLATION_MODE = {
  text: "transliterate", textarea: "transliterate", description: "translate",
  number: "none", date: "none", boolean: "none", email: "none", phone: "none", document: "none",
};

let _k = 0;
const nextKey = () => `dfk_${++_k}`;
const toIdentifier = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_");
const blankField = () => ({ _key: nextKey(), column_name: "", label: {}, type: "text", required: false });

const inputStyle = (err) => ({
  width: "100%", height: 44, padding: "0 14px", border: `1px solid ${err ? "#f87171" : color.borderStrong}`,
  borderRadius: 10, fontSize: 14, color: color.text, outline: "none", boxSizing: "border-box", background: "#fff",
});
const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 6 };
const card = { background: "#fff", borderRadius: 8, border: `1px solid ${color.border}`, boxShadow: "0 1px 3px rgba(16,24,40,0.04)", overflow: "hidden" };

function Stepper({ step }) {
  const steps = ["Form Details", "Schema Builder", "Roles & Review"];
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
          return <div key={i} style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? color.primary : done ? "#334155" : color.muted, textAlign: i === 0 ? "left" : i === steps.length - 1 ? "right" : "center" }}>{label}</div>;
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

function FieldRow({ field, index, total, languages, onChange, onRemove, onMove }) {
  const [open, setOpen] = useState(true);
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type;
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: color.text, fontFamily: "monospace" }}>{field.column_name || <span style={{ color: color.muted, fontStyle: "italic" }}>unnamed_field</span>}</span>
          <span style={{ fontSize: 11, color: color.muted, marginLeft: 8 }}>{field.label?.en || "No label"} · {typeLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" iconOnly disabled={index === 0} title="Move up" icon={<ChevronUp size={15} />} onClick={() => onMove(index, -1)} />
          <Button variant="ghost" iconOnly disabled={index === total - 1} title="Move down" icon={<ChevronDown size={15} />} onClick={() => onMove(index, 1)} />
          <Button variant="ghost" iconOnly title="Remove" icon={<Trash2 size={15} color={color.danger} />} onClick={() => onRemove(index)} />
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${color.hover}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} onClick={(e) => e.stopPropagation()}>
          <div>
            <label style={labelStyle}>Column Name *</label>
            <input style={inputStyle(false)} value={field.column_name} placeholder="e.g. Student Name"
              onChange={(e) => onChange(index, "column_name", e.target.value.replace(/[^a-zA-Z0-9\s_]/g, ""))} />
          </div>
          <div>
            <label style={labelStyle}>Field Type</label>
            <select style={inputStyle(false)} value={field.type} onChange={(e) => onChange(index, "type", e.target.value)}>
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {languages.map((lng) => (
            <div key={lng.code}>
              <label style={labelStyle}>Label ({lng.name})</label>
              <input style={inputStyle(false)} value={field.label?.[lng.code] || ""} placeholder={`Label in ${lng.name}`}
                onChange={(e) => onChange(index, `label.${lng.code}`, e.target.value)} />
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!field.required} onChange={(e) => onChange(index, "required", e.target.checked)} style={{ accentColor: color.primary, width: 15, height: 15 }} />
            <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Required field</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function DepartmentFormBuilderPage({ mode, initialData, onDone, onBack }) {
  const { apiFetch } = useApi();
  const { selectedYear } = useAcademicYear() || {};
  const isEdit = mode === "edit";

  const [step, setStep] = useState(1);
  const [name, setName] = useState(isEdit ? (initialData?.form_name?.replace(/_/g, " ") || "") : "");
  const [description, setDescription] = useState("");
  const [translate, setTranslate] = useState(true);
  const [fields, setFields] = useState([]);
  const [languages, setLanguages] = useState([{ code: "en", name: "English" }]);
  const [allRoles, setAllRoles] = useState([]);
  const [roles, setRoles] = useState([]);            // selected role names
  const [roleSearch, setRoleSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [nameErr, setNameErr] = useState("");

  const identifier = isEdit ? (initialData?.form_name || "") : toIdentifier(name);

  /* Languages + roles lookups (reuse existing endpoints) */
  useEffect(() => {
    apiFetch("/api/forms/languages").then((r) => r.json()).then((d) => { if (d.success && d.languages?.length) setLanguages(d.languages); }).catch(() => {});
    apiFetch("/api/lookup/roles").then((r) => r.json()).then((d) => { if (d.success) setAllRoles(d.roles || []); }).catch(() => {});
  }, [apiFetch]);

  /* Edit mode: load existing schema + roles for this department form */
  useEffect(() => {
    if (!isEdit || !initialData?.id) return;
    apiFetch(`/api/department-forms/${initialData.id}/schema`).then((r) => r.json()).then((d) => {
      if (d.success && d.schema) {
        setDescription(d.schema.description || "");
        setFields((d.schema.fields || []).map((f) => ({ _key: nextKey(), ...f })));
        setTranslate(d.translate_enabled !== false);
      }
    }).catch((e) => { if (!isAuthError(e)) setError("Failed to load schema."); });
    apiFetch(`/api/department-forms/${initialData.id}/roles`).then((r) => r.json()).then((d) => { if (d.success) setRoles(d.roles || []); }).catch(() => {});
  }, [isEdit, initialData, apiFetch]);

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
  function toggleRole(rn) { setRoles((prev) => prev.includes(rn) ? prev.filter((r) => r !== rn) : [...prev, rn]); }

  function validateDetails() {
    if (!isEdit && !name.trim()) { setNameErr("Form name is required."); return false; }
    if (!isEdit && !/^[a-z]/.test(identifier)) { setNameErr("Form name must start with a letter."); return false; }
    setNameErr(""); return true;
  }
  function validateFields() {
    for (const f of fields) {
      if (!f.column_name.trim()) { setError("Every field needs a column name."); return false; }
      if (!f.label?.en?.trim()) { setError("Every field needs an English label."); return false; }
    }
    if (fields.length === 0) { setError("Add at least one field."); return false; }
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
        translation_mode: TRANSLATION_MODE[f.type] || "transliterate",
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
          method: "PUT", body: JSON.stringify({ schema, translate_enabled: translate }),
        });
      } else {
        res = await apiFetch("/api/department-forms", {
          method: "POST",
          body: JSON.stringify({ form_name: identifier, form_description: description.trim(), schema, translate_enabled: translate, roles, year: selectedYear }),
        });
      }
      const data = await res.json();
      if (!data.success) { setError(data.message || "Failed to save form."); setSubmitting(false); return; }
      // Edit: persist role changes too.
      if (isEdit) {
        await apiFetch(`/api/department-forms/${initialData.id}/roles`, { method: "PUT", body: JSON.stringify({ roles }) }).catch(() => {});
      }
      onDone(data.message || "Form saved successfully.");
    } catch (err) {
      if (!isAuthError(err)) setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const modeLabel = isEdit ? "Edit Department Form" : "Create Department Form";

  return (
    <div style={{ background: color.bg, minHeight: "100%", padding: "20px 0", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: "0 28px" }}>
        <PageHeader
          breadcrumb={["Home", { label: "Department Forms", onClick: onBack }, modeLabel]}
          title={modeLabel}
          description={isEdit ? "Revise the field schema and role access for this department form." : "Define a new form scoped to your department."}
        />
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 28px" }}>
        <Stepper step={step} />

        {step === 1 && (
          <>
            <div style={card}>
              <CardHeader icon={<FileText size={18} />} title="Form Details" subtitle="Name your form and choose translation behavior." />
              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Form Name *</label>
                  <input style={inputStyle(!!nameErr)} value={name} readOnly={isEdit} placeholder="e.g. Student Feedback"
                    onChange={(e) => { setName(e.target.value.replace(/[^a-zA-Z0-9\s]/g, "")); setNameErr(""); }} />
                  <div style={{ fontSize: 11, color: color.muted, marginTop: 4 }}>Stored as <code style={{ fontFamily: "monospace", background: color.hover, padding: "1px 6px", borderRadius: 4 }}>dept_form_{identifier || "your_form"}</code></div>
                  {nameErr && <div style={{ fontSize: 11, color: color.danger, marginTop: 4 }}>{nameErr}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea style={{ ...inputStyle(false), height: "auto", minHeight: 80, padding: "12px 14px", resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this form used for?" />
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", background: color.hover, border: `1px solid ${color.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} style={{ accentColor: color.primary, width: 16, height: 16, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>Translate submitted data to Hindi</div>
                    <div style={{ fontSize: 12, color: color.muted, marginTop: 2 }}>When enabled, records automatically create a Hindi mirror row. When off, only the original is stored.</div>
                  </div>
                </label>
                <div style={{ fontSize: 12, color: color.muted }}>
                  Academic year: <strong style={{ color: color.text }}>{selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : "current"}</strong> — set from the top-bar selector.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" onClick={onBack}>Cancel</Button>
              <Button variant="primary" onClick={() => { if (validateDetails()) setStep(2); }}>Next: Schema Builder →</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={card}>
              <CardHeader icon={<Wrench size={18} />} title="Define Schema" subtitle="Add the fields this form will collect." />
              <div style={{ padding: "16px 20px" }}>
                {fields.length === 0 && (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: color.muted, fontSize: 13, border: `1.5px dashed ${color.border}`, borderRadius: 8, marginBottom: 14 }}>
                    No fields yet — click “Add Field” to start.
                  </div>
                )}
                {fields.map((f, i) => (
                  <FieldRow key={f._key} field={f} index={i} total={fields.length} languages={languages} onChange={updateField} onRemove={removeField} onMove={moveField} />
                ))}
                <Button variant="secondary" icon={<Plus size={16} />} fullWidth onClick={() => setFields((p) => [...p, blankField()])}>Add Field</Button>
                {error && <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>{error}</div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" onClick={() => { if (validateFields()) setStep(3); }}>Next: Roles & Review →</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={card}>
              <CardHeader icon={<ShieldCheck size={18} />} title="Role Access & Review" subtitle="Choose which roles can see and fill this form." />
              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={labelStyle}>Roles with access {roles.length > 0 && <span style={{ color: color.muted, fontWeight: 400 }}>· {roles.length} selected</span>}</label>
                  {allRoles.length > 6 && (
                    <input value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} placeholder="Search roles…"
                      style={{ ...inputStyle, height: 40, marginBottom: 10 }} />
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {allRoles.length === 0 ? <span style={{ fontSize: 12.5, color: color.muted }}>No roles available.</span> : (() => {
                      const q = roleSearch.trim().toLowerCase();
                      const list = q ? allRoles.filter((r) => (r.display_name || r.name).toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : allRoles;
                      if (list.length === 0) return <span style={{ fontSize: 12.5, color: color.muted }}>No roles match “{roleSearch}”.</span>;
                      return list.map((r) => {
                        const on = roles.includes(r.name);
                        return (
                          <button key={r.id || r.name} type="button" onClick={() => toggleRole(r.name)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                     border: `1.5px solid ${on ? color.primary : color.border}`, background: on ? color.primarySoft : "#fff", color: on ? color.primary : "#475569" }}>
                            {on && <Check size={13} />} {r.display_name || r.name}
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ fontSize: 11.5, color: color.muted, marginTop: 8 }}>Leave empty to keep the form visible to the whole department. Access also requires the same institution &amp; department.</div>
                </div>
                <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: color.hover, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Summary</div>
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                    <Row label="Form Name" value={name || identifier} />
                    <Row label="Stored Table" value={`dept_form_${identifier}`} mono />
                    <Row label="Academic Year" value={selectedYear != null ? `${selectedYear}–${selectedYear + 1}` : "current"} />
                    <Row label="Fields" value={String(fields.length)} />
                    <Row label="Translate to Hindi" value={translate ? "Enabled" : "Disabled"} />
                  </div>
                </div>
                {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>{error}</div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="secondary" disabled={submitting} onClick={() => setStep(2)}>← Back</Button>
              <Button variant="primary" loading={submitting} disabled={submitting} icon={<Check size={18} strokeWidth={2} />} onClick={handleSubmit}>
                {isEdit ? "Save Changes" : "Create Form"}
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
