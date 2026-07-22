import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { FilePlus, Search, RefreshCw, Lock, CalendarClock, Eye, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

const SLUG = "form-management";
import { useApi } from "../../hooks/useApi";
import { useAcademicYear } from "../../store/AcademicYearContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import DepartmentFormRecordsPage from "./DepartmentFormRecordsPage";
import { color, Button, PageHeader, Badge, EmptyState, DataTable } from "../../ui";

const STROKE = 1.75;
const PAGE_SIZE = 10;

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

function isFormExpired(form) { return !!(form.deadline_at && new Date(form.deadline_at).getTime() <= Date.now()); }
function isFormLocked(form) { return !!form.is_locked; }
function isFormOpen(form) { return !form.is_locked && !isFormExpired(form); }

/* Non-admin "fill" surface: lists only the department forms shared with the
   current user's role (active for the selected year), and opens the shared
   records page to fill/view. No create / manage / lifecycle controls. */
export default function DepartmentFormFillPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiFetch } = useApi();
  const { selectedYear, academicYear } = useAcademicYear() || {};

  const isRecords = location.pathname.endsWith("/records");
  const listPath  = `/${SLUG}`;
  const entity    = isRecords ? (location.state?.entity ?? null) : null;

  const [forms, setForms]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [toast, setToast]             = useState(null);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy]           = useState("name_asc");
  const [page, setPage]               = useState(1);

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
  useEffect(() => { setPage(1); }, [search, filterStatus, sortBy]);

  if (isRecords) {
    if (!entity) return <Navigate to={listPath} replace />;
    return <DepartmentFormRecordsPage form={entity} year={selectedYear} onBack={() => navigate(listPath)} />;
  }

  // --- Filter ---
  const q = search.trim().toLowerCase();
  let visible = forms.filter((f) => {
    const matchSearch = !q
      || titleOf(f.form_name).toLowerCase().includes(q)
      || f.form_name.toLowerCase().includes(q)
      || (f.form_description || "").toLowerCase().includes(q);
    const matchStatus =
      filterStatus === "all"     ? true :
      filterStatus === "open"    ? isFormOpen(f) :
      filterStatus === "locked"  ? isFormLocked(f) :
      filterStatus === "expired" ? isFormExpired(f) : true;
    return matchSearch && matchStatus;
  });

  // --- Sort ---
  visible = [...visible].sort((a, b) => {
    if (sortBy === "name_asc")  return titleOf(a.form_name).localeCompare(titleOf(b.form_name));
    if (sortBy === "name_desc") return titleOf(b.form_name).localeCompare(titleOf(a.form_name));
    if (sortBy === "deadline_asc") {
      const da = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity;
      const db = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity;
      return da - db;
    }
    if (sortBy === "deadline_desc") {
      const da = a.deadline_at ? new Date(a.deadline_at).getTime() : -Infinity;
      const db = b.deadline_at ? new Date(b.deadline_at).getTime() : -Infinity;
      return db - da;
    }
    return 0;
  });

  // --- Pagination ---
  const totalCount = visible.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const searching  = q.length > 0 || filterStatus !== "all";

  const SortIcon = sortBy.startsWith("name_")
    ? (sortBy === "name_asc" ? ChevronUp : ChevronDown)
    : sortBy.startsWith("deadline_")
      ? (sortBy === "deadline_asc" ? ChevronUp : ChevronDown)
      : ChevronsUpDown;

  const selectStyle = {
    height: 40, padding: "0 12px", border: `1px solid ${color.border}`,
    borderRadius: 10, fontSize: 13, color: color.text, outline: "none",
    background: color.surface, cursor: "pointer",
  };

  /* Columns mirror the Institution & Department-Admin forms tables (same ui/DataTable,
     same #/Form/Deadline/Access layout and icon-only action) so every forms list in
     the app looks identical. */
  const columns = [
    {
      key: "_sno", header: "#", width: 56, align: "left",
      render: (_form, i) => <span style={{ fontSize: 13, fontWeight: 600, color: color.muted }}>{(safePage - 1) * PAGE_SIZE + i + 1}</span>,
    },
    {
      key: "form", header: "Form Name", width: 340,
      render: (form) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: color.primarySoft, color: color.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{form.form_name.slice(0, 2).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ui-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, color: color.text }} title={titleOf(form.form_name)}>{titleOf(form.form_name)}</div>
            <div className="ui-ellipsis" style={{ fontSize: 11.5, color: color.muted, marginTop: 1, maxWidth: 260 }} title={form.form_description || form.form_name}>{form.form_description || form.form_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: "deadline", header: "Deadline", width: 150,
      render: (form) => {
        const d = deadlineInfo(form);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: color.text, fontWeight: 600 }}>{form.deadline_at ? d.dateText : "No Deadline"}</span>
            {d.label && <Badge tone={d.tone}>{d.label}</Badge>}
          </div>
        );
      },
    },
    {
      key: "access", header: "Access", width: 110,
      render: (form) => form.is_locked
        ? <Badge tone="danger" icon={<Lock size={11} strokeWidth={STROKE} />}>Locked</Badge>
        : <Badge tone="success">Open</Badge>,
    },
    {
      key: "actions", header: "", align: "right", width: 192,
      render: (form) => (
        <Button variant="secondary" iconOnly title={form.is_locked ? "View records" : "Open & fill records"} icon={<Eye size={18} strokeWidth={STROKE} />} onClick={() => navigate(`${listPath}/records`, { state: { entity: form } })} />
      ),
    },
  ];

  const paginationEl = totalCount > PAGE_SIZE ? (
    <>
      <span style={{ fontSize: 13, color: color.muted }}>
        {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalCount)} of {totalCount}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</Button>
        <span style={{ fontSize: 13, color: color.text }}>{safePage} / {totalPages}</span>
        <Button variant="secondary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
      </div>
    </>
  ) : null;

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
        rows={pageRows}
        rowKey={(f) => f.id}
        loading={loading}
        minWidth={860}
        pagination={paginationEl}
        toolbar={
          <>
            {/* Search */}
            <div style={{ position: "relative", flex: "0 1 260px", maxWidth: 260 }}>
              <Search size={16} strokeWidth={STROKE} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: color.muted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search forms…"
                style={{ width: "100%", height: 40, padding: "0 12px 0 34px", border: `1px solid ${color.border}`, borderRadius: 10, fontSize: 13, color: color.text, outline: "none", boxSizing: "border-box", background: color.surface }}
              />
            </div>

            {/* Status filter */}
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="locked">Locked</option>
              <option value="expired">Expired</option>
            </select>

            {/* Sort */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
              <option value="name_asc">Name A → Z</option>
              <option value="name_desc">Name Z → A</option>
              <option value="deadline_asc">Deadline ↑ (soonest)</option>
              <option value="deadline_desc">Deadline ↓ (latest)</option>
            </select>

            {(academicYear || selectedYear != null) && (
              <Badge tone="primary" icon={<CalendarClock size={12} strokeWidth={STROKE} />}>
                {academicYear || `${selectedYear}–${selectedYear + 1}`}
              </Badge>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={searching ? <Search size={26} strokeWidth={1.5} /> : <FilePlus size={26} strokeWidth={1.5} />}
            title={searching ? "No forms match your filters" : "No forms assigned to you"}
            description={searching ? "Try a different name or clear the filters." : "Forms your department admin shares with your role for this academic year will appear here."}
          />
        }
      />
    </div>
  );
}
