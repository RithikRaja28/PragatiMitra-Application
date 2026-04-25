import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../../hooks/useApi";

/* ── Helpers ─────────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function normalizeStatus(s) {
  return (s || "").toUpperCase();
}

/* ── Toast ───────────────────────────────────────────────────── */
function Toast({ message, type }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        background: type === "error" ? "#dc2626" : "#1e293b",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        maxWidth: 420,
        lineHeight: 1.5,
      }}
    >
      {type === "error" ? "✕ " : "✓ "}
      {message}
    </div>
  );
}

/* ── Confirm Dialog ──────────────────────────────────────────── */
function ConfirmDialog({ dept, onConfirm, onCancel, loading }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 32,
          width: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#fef2f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            fontSize: 22,
          }}
        >
          ⚠️
        </div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 8,
          }}
        >
          Deactivate Department
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            marginBottom: 6,
            lineHeight: 1.6,
          }}
        >
          You are about to deactivate{" "}
          <strong style={{ color: "#1e293b" }}>{dept.name}</strong>.
        </p>
        <p
          style={{
            fontSize: 13,
            color: "#94a3b8",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          All members of this department must be inactive before proceeding.
          This action sets the department status to inactive in the database.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "1.5px solid #e2e8f0",
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: "#64748b",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              border: "none",
              background: "#dc2626",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Department Card ─────────────────────────────────────────── */
function DepartmentCard({ dept, onDeactivate }) {
  const status = normalizeStatus(dept.status);
  const isActive = status === "ACTIVE";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${isActive ? "rgba(0,0,0,0.07)" : "#f1f5f9"}`,
        borderRadius: 14,
        padding: "22px 24px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        opacity: isActive ? 1 : 0.72,
      }}
    >
      {/* Card header: code badge + name + status pill */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 11,
              background: isActive ? "#eff6ff" : "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              color: isActive ? "#2563eb" : "#94a3b8",
              letterSpacing: 0.5,
            }}
          >
            {dept.code || "—"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {dept.name}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Since {formatDate(dept.created_at)}
            </div>
          </div>
        </div>

        <span
          style={{
            padding: "3px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: isActive ? "#d1fae5" : "#f1f5f9",
            color: isActive ? "#065f46" : "#94a3b8",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 16,
          padding: "12px 14px",
          background: "#f8fafc",
          borderRadius: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
            Members
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {Number(dept.member_count)}
          </div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
            Code
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1e293b",
              fontFamily: "monospace",
            }}
          >
            {dept.code || "—"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onDeactivate(dept)}
          disabled={!isActive}
          style={{
            flex: 1,
            padding: "7px 0",
            borderRadius: 8,
            border: "1.5px solid",
            borderColor: isActive ? "#fee2e2" : "#e2e8f0",
            background: "#fff",
            fontSize: 12,
            fontWeight: 600,
            color: isActive ? "#dc2626" : "#cbd5e1",
            cursor: isActive ? "pointer" : "not-allowed",
          }}
          title={isActive ? "Deactivate department" : "Already inactive"}
        >
          {isActive ? "Deactivate" : "Inactive"}
        </button>
      </div>
    </div>
  );
}

/* ── Skeleton card (loading placeholder) ─────────────────────── */
function SkeletonCard() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 14,
        padding: "22px 24px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {[44, 20, 56, 32].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 42 : 14,
            width: `${w}%`,
            background: "#f1f5f9",
            borderRadius: 8,
            marginBottom: 12,
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

/* ── Select ──────────────────────────────────────────────────── */
function StyledSelect({ value, onChange, children, minWidth = 180 }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px",
        border: "1.5px solid #e2e8f0",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        color: "#1e293b",
        background: "#fff",
        outline: "none",
        cursor: "pointer",
        minWidth,
      }}
    >
      {children}
    </select>
  );
}

/* ── Main Export ─────────────────────────────────────────────── */
export default function DepartmentManagementPage() {
  const { apiFetch } = useApi();

  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [institutionsError, setInstitutionsError] = useState(null);

  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const [toast, setToast] = useState(null); // { message, type }
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(
      () => setToast(null),
      type === "error" ? 5000 : 3000
    );
  }, []);

  /* ── Fetch institutions once on mount ── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingInstitutions(true);
      setInstitutionsError(null);
      try {
        const res = await apiFetch("/api/departments/institutions");
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data.length > 0) {
          setInstitutions(data.data);
          setSelectedInstitutionId(data.data[0].institution_id);
        } else if (data.success) {
          setInstitutions([]);
          setInstitutionsError("No institutions found.");
        } else {
          setInstitutionsError(data.message || "Failed to load institutions.");
        }
      } catch (err) {
        if (cancelled) return;
        if (!isAuthError(err)) {
          setInstitutionsError("Failed to load institutions. Please refresh.");
        }
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiFetch]);

  /* ── Fetch departments when institution changes ── */
  const fetchDepartments = useCallback(
    async (institutionId) => {
      if (!institutionId) return;
      setLoadingDepts(true);
      setDepartments([]);
      try {
        const res = await apiFetch(
          `/api/departments?institution_id=${institutionId}`
        );
        const data = await res.json();
        if (data.success) {
          setDepartments(data.data);
        } else {
          showToast(data.message || "Failed to load departments.", "error");
        }
      } catch (err) {
        if (!isAuthError(err)) {
          showToast("Failed to load departments.", "error");
        }
      } finally {
        setLoadingDepts(false);
      }
    },
    [apiFetch, showToast]
  );

  useEffect(() => {
    fetchDepartments(selectedInstitutionId);
  }, [selectedInstitutionId, fetchDepartments]);

  /* ── Deactivate handler ── */
  async function handleDeactivate() {
    if (!confirmDeactivate) return;
    setDeactivating(true);
    try {
      const res = await apiFetch(
        `/api/departments/${confirmDeactivate.department_id}/deactivate`,
        {
          method: "PATCH",
          body: JSON.stringify({ institution_id: selectedInstitutionId }),
        }
      );
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        setConfirmDeactivate(null);
        fetchDepartments(selectedInstitutionId);
      } else {
        showToast(data.message || "Failed to deactivate.", "error");
        setConfirmDeactivate(null);
      }
    } catch (err) {
      if (!isAuthError(err)) {
        showToast("Failed to deactivate department.", "error");
      }
      setConfirmDeactivate(null);
    } finally {
      setDeactivating(false);
    }
  }

  /* ── Client-side status filter ── */
  const filteredDepts = departments.filter((d) => {
    if (statusFilter === "ALL") return true;
    return normalizeStatus(d.status) === statusFilter;
  });

  const selectedInstitutionName =
    institutions.find((i) => i.institution_id === selectedInstitutionId)
      ?.institution_name || "";

  /* ── Render ── */
  return (
    <div
      style={{
        padding: "32px 36px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* pulse animation keyframes */}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

      {/* Modals */}
      {confirmDeactivate && (
        <ConfirmDialog
          dept={confirmDeactivate}
          onConfirm={handleDeactivate}
          onCancel={() => !deactivating && setConfirmDeactivate(null)}
          loading={deactivating}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#05966914",
              borderRadius: 8,
              padding: "4px 12px",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#059669",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#059669",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Dept Management
            </span>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#1e293b",
              letterSpacing: "-0.4px",
              marginBottom: 6,
            }}
          >
            Departments
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            View and manage departments across institutions.
          </p>
        </div>

        {/* Institution selector */}
        {!loadingInstitutions && !institutionsError && institutions.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Institution
            </span>
            <StyledSelect
              value={selectedInstitutionId ?? ""}
              onChange={(v) => setSelectedInstitutionId(Number(v))}
              minWidth={220}
            >
              {institutions.map((inst) => (
                <option
                  key={inst.institution_id}
                  value={inst.institution_id}
                >
                  {inst.institution_name}
                </option>
              ))}
            </StyledSelect>
          </div>
        )}
      </div>

      {/* ── Institution load error ── */}
      {institutionsError && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "16px 20px",
            color: "#b91c1c",
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {institutionsError}
        </div>
      )}

      {/* ── Filter bar ── */}
      {!institutionsError && !loadingInstitutions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {loadingDepts ? (
              "Loading…"
            ) : (
              <>
                <strong style={{ color: "#1e293b" }}>{filteredDepts.length}</strong>{" "}
                {statusFilter === "ALL"
                  ? "department(s)"
                  : `${statusFilter.toLowerCase()} department(s)`}{" "}
                {selectedInstitutionName && (
                  <>
                    in{" "}
                    <strong style={{ color: "#1e293b" }}>
                      {selectedInstitutionName}
                    </strong>
                  </>
                )}
              </>
            )}
          </div>

          <StyledSelect
            value={statusFilter}
            onChange={setStatusFilter}
            minWidth={150}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </StyledSelect>
        </div>
      )}

      {/* ── Department grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {loadingDepts
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : filteredDepts.length > 0
          ? filteredDepts.map((dept) => (
              <DepartmentCard
                key={dept.department_id}
                dept={dept}
                onDeactivate={setConfirmDeactivate}
              />
            ))
          : !loadingInstitutions && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "60px 0",
                  color: "#94a3b8",
                  fontSize: 14,
                }}
              >
                {statusFilter !== "ALL"
                  ? `No ${statusFilter.toLowerCase()} departments found.`
                  : "No departments found for this institution."}
              </div>
            )}
      </div>
    </div>
  );
}

/* ── Utility: detect auth errors thrown by useApi ── */
function isAuthError(err) {
  const msg = err?.message || "";
  return (
    msg.includes("Session expired") ||
    msg.includes("signed in from another device") ||
    msg.includes("sign in again")
  );
}
