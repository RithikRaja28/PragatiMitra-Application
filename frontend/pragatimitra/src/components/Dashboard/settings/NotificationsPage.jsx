import { useState, useEffect } from "react";
import { useApi } from "../../../hooks/useApi";
import {
  Bell, Edit3, Check, X, Save, Eye,
  Loader2, ChevronDown, Mail, Smartphone,
  Users, Building2, UserCheck, BookOpen, DollarSign, Settings2,
} from "lucide-react";

/* ── Role tabs ── */
const ROLE_TABS = [
  { id: "super_admin",      label: "Super Admin",      icon: Users },
  { id: "department_admin", label: "Department Admin", icon: Building2 },
  { id: "nodal_officer",    label: "Nodal Officer",    icon: UserCheck },
  { id: "publication_cell", label: "Publication Cell", icon: BookOpen },
  { id: "finance_officer",  label: "Finance Officer",  icon: DollarSign },
  { id: "system",           label: "System-Wide",      icon: Settings2 },
];

/* ── All available tokens ── */
const TOKENS = [
  { token: "{UserName}",         desc: "Full name" },
  { token: "{Email}",            desc: "Email address" },
  { token: "{TempPassword}",     desc: "Temporary password" },
  { token: "{LoginURL}",         desc: "Login URL" },
  { token: "{AppName}",          desc: "App name" },
  { token: "{DepartmentName}",   desc: "Department name" },
  { token: "{SectionName}",      desc: "Section name" },
  { token: "{NewRole}",          desc: "New role assigned" },
  { token: "{AnnouncementText}", desc: "Announcement content" },
  { token: "{MaintenanceDate}",  desc: "Maintenance date/time" },
];

const PREVIEW = {
  "{UserName}": "Arun Kumar", "{Email}": "arun@aiia.edu.in",
  "{TempPassword}": "Temp@1234", "{LoginURL}": "https://app.pragatimitra.in/login",
  "{AppName}": "PragatiMitra", "{DepartmentName}": "Computer Science",
  "{SectionName}": "Research Publications", "{NewRole}": "Department Admin",
  "{AnnouncementText}": "Important platform update scheduled.",
  "{MaintenanceDate}": "Sunday, 5th May at 2:00 AM IST",
};

function resolveTokens(str = "") {
  let out = str;
  Object.entries(PREVIEW).forEach(([k, v]) => { out = out.replaceAll(k, v); });
  return out;
}

/* ── Toggle switch ── */
function Toggle({ on, onChange }) {
  return (
    <button onClick={e => { e.stopPropagation(); onChange(!on); }} style={{
      width: 36, height: 20, borderRadius: 20,
      background: on ? "#2563eb" : "#e2e8f0",
      border: "none", cursor: "pointer", position: "relative",
      transition: "background 0.2s", flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 19 : 3,
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

/* ── Token chip ── */
function TokenChip({ token, onCopy, copied }) {
  return (
    <button onClick={() => { navigator.clipboard?.writeText(token); onCopy(token); }} style={{
      fontFamily: "'Courier New', monospace", fontSize: 10, fontWeight: 700,
      color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe",
      borderRadius: 4, padding: "2px 6px", cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 3,
    }}>
      {token}
      {copied === token && <Check size={9} color="#10b981" />}
    </button>
  );
}

/* ── Template editor ── */
function TemplateEditor({ template, onSave, onCancel, saving }) {
  const [subject,  setSubject]  = useState(template.email_subject);
  const [body,     setBody]     = useState(template.email_body);
  const [appMsg,   setAppMsg]   = useState(template.app_message || "");
  const [tab,      setTab]      = useState("email");
  const [copied,   setCopied]   = useState(null);
  const [showPrev, setShowPrev] = useState(false);

  const inputStyle = {
    width: "100%", padding: "8px 11px", borderRadius: 7,
    border: "1.5px solid #e2e8f0", fontSize: 12.5, color: "#1e293b",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "16px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, background: "#f1f5f9", borderRadius: 7, padding: 3, width: "fit-content" }}>
        {[{ key: "email", label: "Email", Icon: Mail }, { key: "app", label: "App", Icon: Smartphone }].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer",
            fontSize: 11.5, fontWeight: 600,
            background: tab === key ? "#2563eb" : "transparent",
            color: tab === key ? "#fff" : "#64748b",
          }}><Icon size={13} strokeWidth={2} /> {label}</button>
        ))}
      </div>

      {/* Token bar */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
          Available tokens — click to copy
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {TOKENS.map(({ token, desc }) => (
            <div key={token} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <TokenChip token={token} onCopy={t => { setCopied(t); setTimeout(() => setCopied(null), 1500); }} copied={copied} />
              <span style={{ fontSize: 9, color: "#94a3b8" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {tab === "email" ? (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle}
                onFocus={e => e.target.style.borderColor = "#2563eb"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
                style={{ ...inputStyle, fontFamily: "'Courier New', monospace", fontSize: 11.5, lineHeight: 1.7, resize: "vertical" }}
                onFocus={e => e.target.style.borderColor = "#2563eb"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
          </div>
          <div style={{ width: 250, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>Preview</label>
              <button onClick={() => setShowPrev(p => !p)} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>
                <Eye size={11} />{showPrev ? "Hide" : "Show"}
              </button>
            </div>
            {showPrev ? (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "8px 12px" }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                    {["#f87171","#fbbf24","#34d399"].map(c => <span key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block" }} />)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{resolveTokens(subject)}</div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <pre style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: 11, color: "#334155", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>
                    {resolveTokens(body)}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ height: 140, borderRadius: 8, border: "1.5px dashed #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <Eye size={18} color="#cbd5e1" />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Click Show to preview</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Message</label>
            <textarea value={appMsg} onChange={e => setAppMsg(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = "#2563eb"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 3, display: "block" }}>Keep under 100 characters.</span>
          </div>
          <div style={{ width: 250, flexShrink: 0 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 7 }}>Preview</label>
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 9, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bell size={13} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>PragatiMitra</div>
                <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>{resolveTokens(appMsg) || "—"}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onSave({ email_subject: subject, email_body: body, app_message: appMsg })}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 7, border: "none", background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? <Loader2 size={12} /> : <Save size={12} />}
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Category section ── */
function CategorySection({ category, templates, editingId, savedId, saving, onEdit, onSave, onCancel, onToggle }) {
  const [open, setOpen] = useState(true);
  const enabledCount = templates.filter(t => t.email_enabled || t.app_enabled).length;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 12 }}>

      {/* Section header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", cursor: "pointer", userSelect: "none",
          borderBottom: open ? "1px solid #f3f4f6" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{category}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "#6b7280",
            background: "#f3f4f6", borderRadius: 20,
            padding: "2px 10px", border: "1px solid #e5e7eb",
          }}>
            {enabledCount}/{templates.length}
          </span>
          <ChevronDown size={16} color="#9ca3af" style={{ transition: "transform 0.2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
        </div>
      </div>

      {/* Rows */}
      {open && templates.map((t, idx) => {
        const isEdit  = editingId === t.event_id;
        const isSaved = savedId   === t.event_id;
        const isLast  = idx === templates.length - 1;

        return (
          <div key={t.event_id}>
            <div
              style={{
                display: "flex", alignItems: "center",
                padding: "14px 20px",
                borderBottom: (!isEdit && !isLast) ? "1px solid #f9fafb" : "none",
                background: isEdit ? "#fafbff" : "#fff",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { if (!isEdit) e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={e => { if (!isEdit) e.currentTarget.style.background = isEdit ? "#fafbff" : "#fff"; }}
            >
              {/* Label */}
              <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: "#111827" }}>{t.label}</span>
                    {isSaved && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#10b981", fontWeight: 600 }}>
                        <Check size={9} /> Saved
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 2, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.email_subject}
                  </div>
                </div>
              </div>

              {/* Right side controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>Email</span>
                  <Toggle on={t.email_enabled} onChange={() => onToggle(t.event_id, "email_enabled")} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>App</span>
                  <Toggle on={t.app_enabled} onChange={() => onToggle(t.event_id, "app_enabled")} />
                </div>
                <button
                  onClick={() => isEdit ? onCancel() : onEdit(t.event_id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "5px 12px", borderRadius: 7,
                    border: `1.5px solid ${isEdit ? "#2563eb" : "#e5e7eb"}`,
                    background: isEdit ? "#eff6ff" : "#fff",
                    fontSize: 11.5, fontWeight: 600,
                    color: isEdit ? "#2563eb" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  {isEdit ? <><X size={11} /> Close</> : <><Edit3 size={11} /> Edit</>}
                </button>
              </div>
            </div>

            {/* Inline editor */}
            {isEdit && (
              <TemplateEditor
                template={t}
                onSave={updates => onSave(t.event_id, updates)}
                onCancel={onCancel}
                saving={saving}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function NotificationsPage() {
  const { apiFetch } = useApi();

  const [templates,  setTemplates]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [activeRole, setActiveRole] = useState("super_admin");
  const [editingId,  setEditingId]  = useState(null);
  const [savedId,    setSavedId]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/notification-templates")
      .then(r => r.json())
      .then(d => {
        if (d.success) setTemplates(d.templates);
        else setError(d.message || "Failed to load.");
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  const handleToggle = async (event_id, field) => {
    const tmpl = templates.find(t => t.event_id === event_id);
    const updated = { ...tmpl, [field]: !tmpl[field] };
    setTemplates(ts => ts.map(t => t.event_id === event_id ? updated : t));
    try {
      await apiFetch(`/api/notification-templates/${event_id}`, {
        method: "PUT",
        body: JSON.stringify({
          email_enabled: updated.email_enabled,
          app_enabled:   updated.app_enabled,
          email_subject: updated.email_subject,
          email_body:    updated.email_body,
          app_message:   updated.app_message,
        }),
      });
    } catch {
      setTemplates(ts => ts.map(t => t.event_id === event_id ? tmpl : t));
    }
  };

  const handleSave = async (event_id, updates) => {
    setSaving(true); setSaveError("");
    try {
      const tmpl = templates.find(t => t.event_id === event_id);
      const res  = await apiFetch(`/api/notification-templates/${event_id}`, {
        method: "PUT",
        body: JSON.stringify({
          email_enabled: tmpl.email_enabled,
          app_enabled:   tmpl.app_enabled,
          ...updates,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(ts => ts.map(t => t.event_id === event_id ? data.template : t));
        setEditingId(null);
        setSavedId(event_id);
        setTimeout(() => setSavedId(null), 2500);
      } else {
        setSaveError(data.message || "Failed to save.");
      }
    } catch {
      setSaveError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const roleTemplates = templates.filter(t => t.role_group === activeRole);
  const byCategory = roleTemplates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50%", gap: 10, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#94a3b8" }}>
      <Loader2 size={20} style={{ animation: "spin 0.6s linear infinite" }} />
      Loading templates…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 18px", color: "#dc2626", fontSize: 13 }}>{error}</div>
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 960 }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb14", borderRadius: 6, padding: "3px 10px", marginBottom: 8 }}>
          <Bell size={10} color="#2563eb" />
          <span style={{ fontSize: 9, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: 1 }}>
            Settings · Notifications
          </span>
        </div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", letterSpacing: "-0.4px", marginBottom: 4 }}>
          Notification Templates
        </h1>
        <p style={{ color: "#6b7280", fontSize: 13 }}>
          Configure email and in-app notifications per role and event.
        </p>
      </div>

      {/* Role tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {ROLE_TABS.map(({ id, label, icon: Icon }) => {
          const count = templates.filter(t => t.role_group === id).length;
          const isOn  = activeRole === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveRole(id); setEditingId(null); setSaveError(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                border: `1.5px solid ${isOn ? "#2563eb" : "#e5e7eb"}`,
                background: isOn ? "#eff6ff" : "#fff",
                color: isOn ? "#2563eb" : "#6b7280",
                fontSize: 12.5, fontWeight: isOn ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <Icon size={13} />
              {label}
              <span style={{
                fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 7px",
                background: isOn ? "#2563eb" : "#f3f4f6",
                color: isOn ? "#fff" : "#9ca3af",
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Save error */}
      {saveError && (
        <div style={{ marginBottom: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "9px 14px", color: "#dc2626", fontSize: 12 }}>
          {saveError}
        </div>
      )}

      {/* Category sections */}
      {Object.keys(byCategory).length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af", fontSize: 13, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          No templates for this role yet.
        </div>
      ) : (
        Object.entries(byCategory).map(([category, catTemplates]) => (
          <CategorySection
            key={category}
            category={category}
            templates={catTemplates}
            editingId={editingId}
            savedId={savedId}


            
            saving={saving}
            onEdit={id => setEditingId(id)}
            onSave={handleSave}
            onCancel={() => { setEditingId(null); setSaveError(""); }}
            onToggle={handleToggle}
          />
        ))
      )}
    </div>
  );
}