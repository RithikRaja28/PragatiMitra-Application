/**
 * useCompressionSettings
 *
 * Fetches the global compression limits set by Super Admin and caches the
 * result in module scope so every upload component shares a single fetch.
 * Call invalidateCompressionCache() after saving new settings so the next
 * consumer gets a fresh copy.
 *
 * Returned shape:
 *   { settings, loading, error }
 *
 * settings: {
 *   image_min_kb: number,   // e.g. 40
 *   image_max_kb: number,   // e.g. 200
 *   pdf_min_mb:   number,   // e.g. 1.0
 *   pdf_max_mb:   number,   // e.g. 2.0
 * }
 */

import { useState, useEffect } from "react";
import { useApi } from "./useApi";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_SETTINGS = {
  image_min_kb: 40,
  image_max_kb: 200,
  pdf_min_mb:   1.0,
  pdf_max_mb:   2.0,
};

/* Module-level cache shared across all hook instances */
let _cached     = null;   // { settings, ts }
let _inFlight   = null;   // Promise while fetch is in progress

export function invalidateCompressionCache() {
  _cached   = null;
  _inFlight = null;
}

export function useCompressionSettings() {
  const { apiFetch } = useApi();
  const [settings, setSettings] = useState(_cached?.settings ?? DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(!_cached);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    const now = Date.now();
    if (_cached && now - _cached.ts < CACHE_TTL_MS) {
      setSettings(_cached.settings);
      setLoading(false);
      return;
    }

    if (!_inFlight) {
      _inFlight = apiFetch("/api/compression-settings")
        .then(r => r.json())
        .then(d => {
          const s = d.success ? d.settings : DEFAULT_SETTINGS;
          _cached   = { settings: s, ts: Date.now() };
          _inFlight = null;
          return s;
        })
        .catch(() => {
          _inFlight = null;
          return DEFAULT_SETTINGS;
        });
    }

    _inFlight.then(s => {
      setSettings(s);
      setLoading(false);
    }).catch(() => {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      setError("Could not load compression settings.");
    });
  }, [apiFetch]);

  return { settings, loading, error };
}
