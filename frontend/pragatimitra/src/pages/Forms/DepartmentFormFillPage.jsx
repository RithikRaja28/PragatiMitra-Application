import React, { useState, useEffect, useCallback } from "react";
import { FilePlus, Search, RefreshCw, Lock, CalendarClock, ArrowRight, Languages } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import DepartmentFormRecordsPage from "./DepartmentFormRecordsPage";
import { color, Button, PageHeader, Badge, EmptyState, DataTable } from "../../ui";

const STROKE = 1.75;
function titleOf(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function deadlineInfo(form) {
  if (!form.deadline_at) return { dateText: "—", tone: null, label: null };
  const d = new Date(form.deadline_at);
  const dateText = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const msLeft = d.getTime() - Date.now();
  if (msLeft <= 0) return { dateText, tone: "danger", label: "EXPIRED" };
  const daysLeft = Math.ceil(msLeft / 86400000);
  return { dateText, tone: daysLeft <= 3 ? "warning" : "success", label: `${daysLeft} DAY${daysLeft !== 1 ? "S" : ""} LEFT` };
}

/* Non-admin "fill" surface: lists only the department forms shared with the
   current user's role (active for the selected year), and opens the shared
   records page to fill/view. No create / manage / lifecycle controls. */
export default function DepartmentFormFillPage() {
  const { apiFetch } = useApi();
  const { selectedYear, academicYear } = useAcademicYear() || {};

  const [view, setView] = useState("list");
  const [selectedForm, setSelectedForm] = useState(null);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = selectedYear != null ? `?year=${selectedYear}` : "";
      const res = await apiFetch(`/api/department-forms/assigned${qs}`);
      const d = await res.json();
      if (d.success) setForms(d.forms || []);
      else setError(d.message || "Failed to load forms.");
    } catch (e) { if (!isAuthError(e)) setError("Failed to load forms."); }
    finally { setLoading(false); }
  }, [apiFetch, selectedYear]);

  useEffect(() => { load(); }, [load]);

  if (view === "records" && selectedForm) {
    return <DepartmentFormRecordsPage form={selectedForm} year={selectedYear} onBack={() => { setView("list"); load(); }} />;
  }

  const q = search.trim().toLowerCase();
  const visible = forms.filter((f) => !q || titleOf(f.form_name).toLowerCase().includes(q) || f.form_name.toLowerCase().includes(q) || (f.form_description || "").toLowerCase().includes(q));
  const searching = q.length > 0;

  const columns = [
    {
      key: "form", header: "Form Name", width: 360,
      render: (form) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{form.form_name.slice(0, 2).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ui-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, color: color.text }} title={titleOf(form.form_name)}>{titleOf(form.form_name)}</div>
            <div className="ui-ellipsis" style={{ fontSize: 11.5, color: color.muted, marginTop: 1, maxWidth: 280 }} title={form.form_description || form.form_name}>{form.form_description || form.form_name}</div>
          </div>
        </div>
      ),
    },
    { key: "translation", header: "Translation", width: 130, render: (form) => form.translate_enabled ? <Badge tone="info" icon={<Languages size={12} strokeWidth={STROKE} />}>EN + हिंदी</Badge> : <Badge tone="neutral">English only</Badge> },
    {
      key: "deadline", header: "Deadline", width: 150,
      render: (form) => { const d = deadlineInfo(form); return (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 13, color: color.text, fontWeight: 600 }}>{d.dateText}</span>{d.label && <Badge tone={d.tone}>{d.label}</Badge>}</div>); },
    },
    { key: "access", header: "Access", width: 110, render: (form) => form.is_locked ? <Badge tone="danger" icon={<Lock size={11} strokeWidth={STROKE} />}>View only</Badge> : <Badge tone="success">Open</Badge> },
    {
      key: "actions", header: "", align: "right", width: 130,
      render: (form) => (
        <Button variant="primary" icon={<ArrowRight size={16} strokeWidth={STROKE} />} onClick={() => { setSelectedForm(form); setView("records"); }}>
          {form.is_locked ? "View" : "Open"}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <PageHeader
        breadcrumb={["Home", "Department", "Department Forms"]}
        title="Department Forms"
        description="Fill and view the forms assigned to your role for the selected academic year."
        actions={<Button variant="secondary" icon={<RefreshCw size={18} strokeWidth={STROKE} />} onClick={load}>Refresh</Button>}
      />

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(f) => f.id}
        loading={loading}
        minWidth={860}
        toolbar={
          <>
            <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search forms…"
                style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box", background: color.surface }} />
            </div>
            {(academicYear || selectedYear != null) && <Badge tone="primary" icon={<CalendarClock size={12} strokeWidth={STROKE} />}>{academicYear || `${selectedYear}–${selectedYear + 1}`}</Badge>}
          </>
        }
        empty={<EmptyState icon={searching ? <Search size={26} strokeWidth={1.5} /> : <FilePlus size={26} strokeWidth={1.5} />}
          title={searching ? "No forms match your search" : "No forms assigned to you"}
          description={searching ? "Try a different name or clear the search." : "Forms your department admin shares with your role for this academic year will appear here."} />}
      />
    </div>
  );
}
