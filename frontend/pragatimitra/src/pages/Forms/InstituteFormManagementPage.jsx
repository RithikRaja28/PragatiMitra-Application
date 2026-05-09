import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { Toast, isAuthError, formatDate } from "../../components/shared/formUtils";
import FormBuilderPage from "./FormBuilderPage";

const ACCENT = "#0891b2";

/* ── Icons ── */
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

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

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: "#94a3b8" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No forms available</div>
      <div style={{ fontSize: 13 }}>Create a new form or contact your super admin to share one with your institution.</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   InstituteFormManagementPage
   Lists forms from table_list that this institution has access to.
   Provides "Manage" to edit field schema and "Create Form" button.
═══════════════════════════════════════════════════════════════════ */
export default function InstituteFormManagementPage() {
  const { apiFetch } = useApi();

  const [view, setView]               = useState("list"); // "list" | "builder"
  const [builderMode, setBuilderMode] = useState(null);   // "create" | "edit"
  const [selectedForm, setSelectedForm] = useState(null);

  const [forms, setForms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [toast, setToast]     = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await apiFetch("/api/forms/institution-forms");
      const data = await res.json();
      if (data.success) setForms(data.forms || []);
      else setError(data.message || "Failed to load forms.");
    } catch (err) {
      if (!isAuthError(err)) setError("Failed to load forms.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setSelectedForm(null);
    setBuilderMode("create");
    setView("builder");
  }

  function openManage(form) {
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

  if (view === "builder") {
    return (
      <FormBuilderPage
        mode={builderMode}
        initialData={selectedForm}
        isSuperAdmin={false}
        onDone={onBuilderDone}
        onBack={onBuilderBack}
      />
    );
  }

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page header */}
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
            Institution Forms
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            Manage data collection forms available to your institution.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={load}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconRefresh /> Refresh
          </button>
          <button
            onClick={openCreate}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: ACCENT, color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: `0 2px 8px ${ACCENT}40`,
            }}
          >
            <IconPlus /> Create Form
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* Forms table card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Available Forms</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {loading ? "Loading…" : `${forms.length} form${forms.length !== 1 ? "s" : ""} accessible to your institution`}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <EmptyState />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Form Name", "Visibility", "Institutions", "Created", "Action"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 20px", textAlign: h === "Action" ? "right" : "left",
                    fontSize: 11, fontWeight: 700, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: 0.6,
                    borderBottom: "1px solid #f1f5f9",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map((form, i) => (
                <tr
                  key={form.id}
                  style={{
                    borderBottom: i < forms.length - 1 ? "1px solid #f8fafc" : "none",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        background: ACCENT + "18",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, color: ACCENT, fontWeight: 700, flexShrink: 0,
                      }}>
                        {form.form_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {form.form_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                          {form.form_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    {form.share_table ? (
                      <Badge label="Shared" color="#0891b2" />
                    ) : (
                      <Badge label="Private" color="#64748b" />
                    )}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>
                      {(form.institute_access || []).length} institution{(form.institute_access || []).length !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: "#64748b" }}>
                    {formatDate(form.created_at)}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <button
                      onClick={() => openManage(form)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "#f0f9ff", color: ACCENT,
                        border: `1px solid ${ACCENT}30`, borderRadius: 8,
                        padding: "7px 14px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", transition: "background .15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT + "18")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                    >
                      <IconSettings /> Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
