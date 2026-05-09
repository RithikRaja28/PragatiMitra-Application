import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { S, Toast, isAuthError, formatDate } from "../../components/shared/formUtils";
import FormBuilderPage from "./FormBuilderPage";

/* ── icons ── */
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconTemplate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}
function IconForm() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

const ACCENT = "#2563eb";

/* ── Badge ── */
function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: color + "18", color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

/* ── Empty state ── */
function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{subtitle}</div>
    </div>
  );
}

/* ── Section card ── */
function SectionCard({ title, subtitle, icon, action, children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)",
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 28,
    }}>
      <div style={{
        padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: "#eff6ff",
            display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FormManagementPage
   Props:
     isSuperAdmin  – boolean, controls visibility of share controls
═══════════════════════════════════════════════════════════════════ */
export default function FormManagementPage({ isSuperAdmin = false }) {
  const { apiFetch } = useApi();

  /* ── view state ── */
  const [view, setView]           = useState("list"); // "list" | "builder"
  const [builderMode, setBuilderMode] = useState(null); // "create" | "adapt" | "edit"
  const [selectedForm, setSelectedForm] = useState(null); // form obj passed to builder

  /* ── data ── */
  const [templates, setTemplates]   = useState([]);
  const [myForms, setMyForms]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [toast, setToast]           = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tRes, mRes] = await Promise.all([
        apiFetch("/api/forms/templates"),
        apiFetch("/api/forms/my-forms"),
      ]);
      const [tData, mData] = await Promise.all([tRes.json(), mRes.json()]);
      if (tData.success) setTemplates(tData.templates);
      if (mData.success) setMyForms(mData.forms);
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load form data.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  /* ── navigation ── */
  function openCreate() {
    setSelectedForm(null);
    setBuilderMode("create");
    setView("builder");
  }
  function openAdapt(template) {
    setSelectedForm(template);
    setBuilderMode("adapt");
    setView("builder");
  }
  function openEdit(form) {
    setSelectedForm(form);
    setBuilderMode("edit");
    setView("builder");
  }
  function onBuilderDone(message) {
    setView("list");
    showToast(message || "Form saved successfully.");
    load();
  }
  function onBuilderBack() {
    setView("list");
  }

  /* ── builder mode ── */
  if (view === "builder") {
    return (
      <FormBuilderPage
        mode={builderMode}
        initialData={selectedForm}
        isSuperAdmin={isSuperAdmin}
        onDone={onBuilderDone}
        onBack={onBuilderBack}
      />
    );
  }

  /* ── list view ── */
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: ACCENT + "12", borderRadius: 8, padding: "4px 12px", marginBottom: 10,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
              Form Management
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", margin: "0 0 6px" }}>
            Forms & Templates
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            Design data collection forms and manage field schemas per institution.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: ACCENT, color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
          }}
        >
          <IconPlus /> New Form
        </button>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* ── Shared Templates ── */}
      <SectionCard
        title="Shared Templates"
        subtitle="Forms available across institutions — adopt and customise for your needs"
        icon={<IconTemplate />}
      >
        {loading ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No shared templates"
            subtitle="Shared forms from other institutions will appear here"
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Form Name", "Institutions Using", "Created", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 20px", textAlign: "left", fontSize: 11,
                    fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
                    letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl, i) => (
                <tr
                  key={tpl.id}
                  style={{
                    borderBottom: i < templates.length - 1 ? "1px solid #f8fafc" : "none",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, background: "#dbeafe",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, color: ACCENT, fontWeight: 700,
                      }}>
                        {tpl.form_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {tpl.form_name}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>Shared template</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <Badge
                      label={`${(tpl.institute_access || []).length} institution${(tpl.institute_access || []).length !== 1 ? "s" : ""}`}
                      color="#0891b2"
                    />
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: "#64748b" }}>
                    {formatDate(tpl.created_at)}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <button
                      onClick={() => openAdapt(tpl)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: ACCENT + "10", color: ACCENT, border: `1px solid ${ACCENT}30`,
                        borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Use Template <IconArrow />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* ── My Forms ── */}
      <SectionCard
        title={isSuperAdmin ? "All Forms" : "Your Institution's Forms"}
        subtitle={isSuperAdmin ? "All registered form schemas across the platform" : "Forms configured for your institution"}
        icon={<IconForm />}
      >
        {loading ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading forms…
          </div>
        ) : myForms.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No forms yet"
            subtitle='Click "New Form" to create your first form schema'
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Form Name", "Year", "Version", "Shared", "Created", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 20px", textAlign: "left", fontSize: 11,
                    fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
                    letterSpacing: 0.6, borderBottom: "1px solid #f1f5f9",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myForms.map((form, i) => (
                <tr
                  key={form.id}
                  style={{
                    borderBottom: i < myForms.length - 1 ? "1px solid #f8fafc" : "none",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, background: "#dcfce7",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, color: "#16a34a", fontWeight: 700,
                      }}>
                        {form.form_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {form.form_name}
                        </div>
                        {isSuperAdmin && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                            {(form.institute_access || []).length} institution{(form.institute_access || []).length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "#475569" }}>
                    {form.year || "—"}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <Badge label={`v${form.schema_version || form.schema_count || 1}`} color="#7c3aed" />
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    {form.share_table ? (
                      <Badge label="Shared" color="#0891b2" />
                    ) : (
                      <Badge label="Private" color="#64748b" />
                    )}
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: "#64748b" }}>
                    {formatDate(form.created_at)}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <button
                      onClick={() => openEdit(form)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "#f8fafc", color: "#475569",
                        border: "1px solid #e2e8f0", borderRadius: 8,
                        padding: "7px 14px", fontSize: 12, fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <IconEdit /> Edit Schema
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
