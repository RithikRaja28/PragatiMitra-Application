/**
 * AcademicYearContext.jsx
 * ─────────────────────────────────────────────────────────────
 * The institution's "current academic year context". The top-bar year selector
 * writes here; everything below (form creation, form visibility, …) reads here.
 *
 *   selectedYear  → integer START year (e.g. 2025) — this is the value stored on
 *                   custom_field_schemas.year / *_records.year.
 *   academicYear  → display string "2025-2026" (canonical YYYY-YYYY format,
 *                   shared with reporting_year — see RootLayout's toReportingYear).
 *   options       → dynamic list from academic_year_master (falls back to a
 *                   generated range when the institution has no years yet).
 *
 * Selection is INSTITUTION-SCOPED and persisted in sessionStorage (not local
 * component state, not localStorage) so it survives navigation within a session
 * but never leaks across logins/institutions.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useApi } from "../hooks/useApi";

const AcademicYearContext = createContext(null);
export const useAcademicYear = () => useContext(AcademicYearContext);

/* Canonical "YYYY-YYYY" format (plain hyphen, 4-digit end year) — must match
   backend's formatAcademicYear in academicYearService.js exactly. */
const fmt = (y) => `${y}-${y + 1}`;
const sessionKey = (inst) => `pm_academic_year_${inst || "none"}`;

export function AcademicYearProvider({ children }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const institutionId = user?.institutionId || null;

  const [years, setYears]               = useState([]);   // [{ academic_year, start_year, active }]
  const [selectedYear, setSelected]     = useState(null); // integer start year
  const [loading, setLoading]           = useState(false);

  /* Load the institution's academic years + current, then resolve the active
     selection (session → DB current → latest → calendar year). */
  const load = useCallback(async () => {
    if (!institutionId) { setYears([]); setSelected(null); return; }
    setLoading(true);
    try {
      const [yRes, cRes] = await Promise.all([
        apiFetch("/api/academic-years").then((r) => r.json()).catch(() => ({})),
        apiFetch("/api/academic-years/current").then((r) => r.json()).catch(() => ({})),
      ]);
      const list = yRes?.success ? yRes.years : [];
      setYears(list);

      const saved   = Number(sessionStorage.getItem(sessionKey(institutionId)));
      const current = cRes?.success ? cRes.current : null;
      const fallback = current?.start_year ?? list[0]?.start_year ?? new Date().getFullYear();
      const savedValid = list.some((y) => y.start_year === saved);
      setSelected(savedValid ? saved : fallback);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, institutionId]);

  useEffect(() => { load(); }, [load]);

  const setYear = useCallback((y) => {
    const yr = Number(y);
    if (!Number.isInteger(yr)) return;
    setSelected(yr);
    if (institutionId) sessionStorage.setItem(sessionKey(institutionId), String(yr));
  }, [institutionId]);

  /* Dropdown options — dynamic from the institution's created years; when none
     exist yet, offer a sensible range so the selector is still usable. */
  const options = useMemo(() => {
    if (years.length) {
      return years.map((y) => ({ value: y.start_year, label: y.academic_year, active: !!y.active }));
    }
    const now = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => now - 2 + i).map((y) => ({ value: y, label: fmt(y), active: false }));
  }, [years]);

  const academicYear = selectedYear != null ? fmt(selectedYear) : null;

  const value = useMemo(() => ({
    institutionId,
    selectedYear,
    academicYear,
    options,
    years,
    loading,
    setYear,
    reload: load,
  }), [institutionId, selectedYear, academicYear, options, years, loading, setYear, load]);

  return (
    <AcademicYearContext.Provider value={value}>
      {children}
    </AcademicYearContext.Provider>
  );
}
