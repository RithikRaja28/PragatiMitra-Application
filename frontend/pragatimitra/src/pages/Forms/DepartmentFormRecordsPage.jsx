import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Lock, FilePlus, Download, FileText as FileCsv, FileSpreadsheet, CalendarClock } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../store/AuthContext";
import { Toast, isAuthError } from "../../components/shared/formUtils";
import { color, Button, PageHeader, Badge, EmptyState, Modal, DataTable, Dropdown, MenuItem, MenuLabel } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import { t } from "../../i18n/translations";
import api from "../../services/api";
import { DocumentCell, RecordEditPage } from "./FormDataPage";

async function downloadDeptExport(formId, format, accessToken, year, lang = "en") {
  const yq = year != null ? `&year=${year}` : "";
  const res = await api.get(`/api/department-form-data/${formId}/export?format=${format}&language=${lang}${yq}`,
    { token: accessToken });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `export.${format}`; a.click();
  URL.revokeObjectURL(url);
}

const STROKE = 1.75;
const dbCol = (c) => c.trim().toLowerCase().replace(/\s+/g, "_");
const displayCol = (c) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function titleOf(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

/* Deadline badge for the records view: OPEN / EXPIRES IN N DAYS / EXPIRED.
   Driven by the form's year-scoped deadline_at (passed from the list row). */
function recordsDeadlineBadge(deadlineAt) {
  if (!deadlineAt) return { tone: "success", label: "OPEN" };
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return { tone: "danger", label: "EXPIRED" };
  const days = Math.ceil(ms / 86400000);
  if (days <= 1) return { tone: "warning", label: "EXPIRES TODAY" };
  return { tone: days <= 3 ? "warning" : "success", label: `EXPIRES IN ${days} DAYS` };
}

export default function DepartmentFormRecordsPage({ form, year = null, onBack }) {
  const { apiFetch } = useApi();
  const { accessToken, user } = useAuth();
  const { lang } = useLanguage();
  // Only contributors may enter/modify data. Admins & nodal officers (who reach
  // this page via "View records") get a read-only view.
  const roleNames = (user?.roles || []).map((r) => (typeof r === "string" ? r : r?.name));
  // TEMP (testing): contributor role not provisioned yet — allow department_admin
  // to enter data too. Remove "department_admin" once contributors exist.
  const canEnterData = roleNames.includes("contributor") || roleNames.includes("department_admin");
  const yq = year != null ? `&year=${year}` : "";
  const [records, setRecords] = useState([]);
  const [schema, setSchema] = useState(null);
  const [lock, setLock] = useState({ is_locked: false, message: null });
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // null = list · "new" = add · record = edit
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [acquiringLock, setAcquiringLock] = useState(null); // record id currently being locked
  const lockedRecordRef = useRef(null); // id of the record whose lock we currently hold
  const lockUrlRef = useRef(null);       // full path for the DELETE lock endpoint currently held
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  async function saveRecord(formData) {
    const editing = editTarget && editTarget !== "new" ? editTarget : null;
    const yqSave = year != null ? `?year=${year}` : "";
    try {
      const res = editing
        ? await apiFetch(`/api/department-form-data/${form.id}/records/${editing.id}${yqSave}`, {
            method: "PUT", body: JSON.stringify({ data: formData, year }),
          })
        : await apiFetch(`/api/department-form-data/${form.id}/records${yqSave}`, {
            method: "POST", body: JSON.stringify({ data: formData, year }),
          });
      const d = await res.json();
      if (d.success) {
        showToast(d.message || "Saved.");
        return { success: true, message: d.message };
      }
      return { success: false, message: d.message || "Failed to save record." };
    } catch (e) {
      if (!isAuthError(e)) return { success: false, message: "Network error. Please try again." };
      return { success: false };
    }
  }

  // Skeleton only on the FIRST load. On refreshes (year change, post-save reload)
  // keep the current rows visible and swap them in place — no flicker / height jump.
  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records?language=${lang}${yq}`);
      const d = await res.json();
      if (d.success) { setRecords(d.records || []); setSchema(d.schema?.schema || null); setLock(d.lock || { is_locked: false }); }
      else setError(d.message || t("Failed to load records.", lang));
    } catch (e) { if (!isAuthError(e)) setError(t("Failed to load records.", lang)); }
    finally { setLoading(false); hasLoadedRef.current = true; }
  }, [apiFetch, form.id, yq, lang]);

  useEffect(() => { load(); }, [load]);

  /* Avoid the loading skeleton "flashing" on fast fetches: only reveal it if the
     request is still pending after a short grace period. Fast loads go straight
     to the data with no flicker. */
  useEffect(() => {
    if (!loading) { setShowSkeleton(false); return; }
    const tmr = setTimeout(() => setShowSkeleton(true), 220);
    return () => clearTimeout(tmr);
  }, [loading]);

  /* Release any held lock when the browser tab/window is closed or component unmounts.
     Uses fetch+keepalive (not sendBeacon) because sendBeacon is POST-only and would
     hit the acquire endpoint instead of the release endpoint. The [] dependency array
     ensures this effect runs exactly once — no premature cleanup when apiFetch
     gets a new reference due to auth-context updates. */
  useEffect(() => {
    const releaseLockViaFetch = () => {
      const url = lockUrlRef.current;
      if (!url) return;
      try {
        fetch(`${api.API_BASE}${url}`, {
          method: "DELETE",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(accessTokenRef.current ? { Authorization: `Bearer ${accessTokenRef.current}` } : {}),
          },
        });
      } catch {} // best-effort
    };
    window.addEventListener("beforeunload", releaseLockViaFetch);
    return () => {
      window.removeEventListener("beforeunload", releaseLockViaFetch);
      // Also release on SPA navigation (component unmount without tab close).
      releaseLockViaFetch();
      lockUrlRef.current = null;
      lockedRecordRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Acquire the pre-edit lock then fetch the latest record from the DB so the
     edit form is never pre-populated with stale list-page data.
     Two separate try-catch blocks so step 1 (lock) and step 2 (record fetch)
     produce distinct, accurate error messages. */
  async function handleEditClick(r) {
    // Hindi mirror rows have source_row_id pointing to the English source.
    // Always lock and edit the English source so the translation pipeline can re-run on save.
    const sourceId = r.source_row_id || r.id;
    setAcquiringLock(r.id);
    const lockPath = `/api/department-form-data/${form.id}/records/${sourceId}/lock`;

    // ── Step 1: acquire the lock ──────────────────────────────────────────
    let lockData;
    try {
      const lockRes = await apiFetch(lockPath, { method: "POST" });
      lockData = await lockRes.json();
    } catch (e) {
      setAcquiringLock(null);
      if (!isAuthError(e)) showToast(t("Could not acquire edit lock. Please try again.", lang), "error");
      return;
    }

    if (lockData.acquired === false) {
      setAcquiringLock(null);
      showToast(
        `This record is currently being edited by ${lockData.lockedByName || "another user"}. Please try again later.`,
        "error"
      );
      return;
    }
    if (lockData.acquired !== true) {
      setAcquiringLock(null);
      showToast(lockData.message || t("Could not acquire edit lock. Please try again.", lang), "error");
      return;
    }

    // Lock acquired — register it so cleanup handlers can release it on unmount or tab close.
    lockUrlRef.current = lockPath;
    lockedRecordRef.current = sourceId;

    // ── Step 2: fetch the latest record from DB ───────────────────────────
    try {
      const recRes = await apiFetch(`/api/department-form-data/${form.id}/records/${sourceId}`);
      const recData = await recRes.json();

      if (!recData.success || !recData.record) {
        try { await apiFetch(lockPath, { method: "DELETE" }); } catch {}
        lockUrlRef.current = null;
        lockedRecordRef.current = null;
        if (recRes.status === 404) {
          showToast(t("This record has been deleted. Refreshing the list.", lang), "error");
          load();
        } else {
          showToast(recData.message || t("Failed to load the latest record data. Please try again.", lang), "error");
        }
        return;
      }

      // ── Step 3: open edit form with fresh data ─────────────────────────
      setEditTarget(recData.record);
    } catch (e) {
      // Record fetch failed (network error, server not yet restarted, etc.)
      try { await apiFetch(lockPath, { method: "DELETE" }); } catch {}
      lockUrlRef.current = null;
      lockedRecordRef.current = null;
      if (!isAuthError(e)) showToast(t("Failed to load the latest record data. Please try again.", lang), "error");
    } finally {
      setAcquiringLock(null);
    }
  }

  /* Release the lock and return to the list. Used for both Cancel and post-Save. */
  async function handleBackFromEdit() {
    if (lockUrlRef.current) {
      try {
        await apiFetch(lockUrlRef.current, { method: "DELETE" });
      } catch {} // best-effort — lock TTL will clean up
      lockUrlRef.current = null;
      lockedRecordRef.current = null;
    }
    setEditTarget(null);
    load();
  }

  const excluded = new Set(schema?.excluded_fixed_columns || []);
  const fields = (schema?.fields || []).filter((f) => !f.hidden && !excluded.has(dbCol(f.column_name)) && !excluded.has(f.column_name));

  const readOnly = lock.is_locked || !canEnterData;   // add/delete disabled when locked or non-contributor
  const canEdit = canEnterData && !lock.is_locked;    // row edit action only for contributors

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/department-form-data/${form.id}/records/${deleteId}${year != null ? `?year=${year}` : ""}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) { showToast(t("Record deleted.", lang)); load(); }
      else showToast(d.message || t("Failed to delete.", lang), "error");
    } catch (e) { if (!isAuthError(e)) showToast(t("Network error.", lang), "error"); }
    finally { setDeleting(false); setDeleteId(null); }
  }

  const columns = [
    { key: "entered_by", header: t("Added By", lang), width: 180, render: (r) => r.entered_by ? <span style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{r.entered_by}</span> : <span style={{ color: color.muted }}>—</span> },
    ...fields.map((f) => ({
      key: dbCol(f.column_name), header: f.label?.[lang] || f.label?.en || displayCol(f.column_name), ellipsis: true, width: 200,
      render: (r) => {
        const v = r[dbCol(f.column_name)];
        if (f.type === "boolean") return v === true || v === "true" ? t("Yes", lang) : v === false || v === "false" ? t("No", lang) : "—";
        if (f.type === "document") return <DocumentCell fileKey={v || ""} getToken={() => accessToken} lang={lang} />;
        return v ?? <span style={{ color: "#cbd5e1" }}>—</span>;
      },
    })),
    { key: "created_at", header: t("Created", lang), width: 140, render: (r) => <span style={{ fontSize: 12, color: color.muted }}>{r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span> },
    ...(canEdit ? [{
      key: "actions", header: "", align: "right", width: 100,
      render: (r) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="secondary" iconOnly title={t("Edit", lang)} icon={<Pencil size={16} strokeWidth={STROKE} />} loading={acquiringLock === r.id} disabled={!!acquiringLock} onClick={() => handleEditClick(r)} />
          {!readOnly && <Button variant="outlineDanger" iconOnly title={t("Delete", lang)} icon={<Trash2 size={16} strokeWidth={STROKE} />} onClick={() => setDeleteId(r.id)} />}
        </div>
      ),
    }] : []),
  ];

  /* Dedicated in-shell edit/add page (no overlay) — uses the shared RecordEditPage
     for the same two-pane (English editable / Hindi reference) layout as Institution Forms. */
  if (editTarget) {
    const editing = editTarget !== "new" ? editTarget : null;
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <RecordEditPage
          fields={fields}
          record={editing}
          formTitle={titleOf(form.form_name)}
          counterpartPath={editing?.id ? `/api/department-form-data/${form.id}/records/${editing.id}/counterpart` : null}
          apiFetch={apiFetch}
          getToken={() => accessToken}
          translationEnabled={true}
          viewOnly={editTarget !== "new" && lock.is_locked}
          onSave={saveRecord}
          onBack={handleBackFromEdit}
          breadcrumb={[
            t("Home", lang),
            t("Department", lang),
            { label: t("Department Forms", lang), onClick: handleBackFromEdit },
            titleOf(form.form_name),
            editing ? t("Edit Record", lang) : t("Add Record", lang),
          ]}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "24px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", maxWidth: 1600, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} width={420} title={t("Delete Record?", lang)}
          footer={<>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteId(null)}>{t("Cancel", lang)}</Button>
            <Button variant="danger" loading={deleting} disabled={deleting} onClick={handleDelete}>{t("Delete Record", lang)}</Button>
          </>}>
          <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.6 }}>{t("This record will be permanently deleted. This cannot be undone.", lang)}</div>
        </Modal>
      )}

      <PageHeader
        breadcrumb={[t("Home", lang), t("Department", lang), { label: t("Department Forms", lang), onClick: onBack }, titleOf(form.form_name)]}
        title={titleOf(form.form_name)}
        actions={
          <>
            <Dropdown align="right" width={200} button={({ toggle }) => (
              <Button variant="secondary" icon={<Download size={18} strokeWidth={STROKE} />} onClick={toggle}>{t("Export", lang)}</Button>
            )}>
              <MenuLabel>{t("Export", lang)}</MenuLabel>
              <MenuItem icon={<FileCsv size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "csv", accessToken, year, lang)}>{t("Download CSV", lang)}</MenuItem>
              <MenuItem icon={<FileSpreadsheet size={16} strokeWidth={STROKE} />} onClick={() => downloadDeptExport(form.id, "xlsx", accessToken, year, lang)}>{t("Download Excel", lang)}</MenuItem>
            </Dropdown>
            {canEnterData && (
              <Button
                variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} disabled={readOnly}
                title={lock.is_locked ? t("Form is locked", lang) : ""}
                onClick={() => { if (!readOnly) setEditTarget("new"); }}
              >
                {t("Add Record", lang)}
              </Button>
            )}
          </>
        }
      />

      {(() => {
        // When the form is locked, the access state is LOCKED — never show the
        // deadline's "OPEN" badge (which only reflects the deadline window and
        // would contradict the lock notice below).
        const b = recordsDeadlineBadge(form.deadline_at);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: lock.is_locked ? 12 : 20 }}>
            {lock.is_locked
              ? <Badge tone="danger" icon={<Lock size={12} strokeWidth={STROKE} />}>{t("LOCKED", lang)}</Badge>
              : <Badge tone={b.tone} icon={<CalendarClock size={12} strokeWidth={STROKE} />}>{b.label}</Badge>}
            {form.deadline_at && (
              <span style={{ fontSize: 12, color: color.muted }}>
                {t("Deadline:", lang)} {new Date(form.deadline_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        );
      })()}

      {lock.is_locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
          <Lock size={18} color="#B91C1C" strokeWidth={2} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>{lock.message || t("This form is view-only.", lang)}</div>
        </div>
      )}

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#B91C1C", marginBottom: 20 }}>{error}</div>}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {loading && !showSkeleton ? (
          <div style={{ flex: 1, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 16 }} />
        ) : (
          <DataTable
            fill
            columns={columns}
            rows={records}
            rowKey={(r) => r.id}
            loading={loading}
            minWidth={760}
            empty={<EmptyState icon={<FilePlus size={26} strokeWidth={1.5} />} title={t("No records yet", lang)} description={t("Click “Add Record” to create the first entry.", lang)}
              action={!readOnly ? <Button variant="primary" icon={<Plus size={18} strokeWidth={STROKE} />} onClick={() => setEditTarget("new")}>{t("Add Record", lang)}</Button> : undefined} />}
          />
        )}
      </div>
    </div>
  );
}
