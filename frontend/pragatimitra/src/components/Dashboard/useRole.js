/**
 * useRole.js
 * ─────────────────────────────────────────────────────────────
 * Hook that resolves the current user's role and returns the
 * matching AppShell config (navItems + pages + defaultPage).
 *
 * RIGHT NOW:  reads role from localStorage (set at login)
 * FUTURE:     swap getRole() to call your auth API / context
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { getRoleConfig } from "./roleConfig";

/**
 * Resolve the role from wherever your auth layer stores it.
 *
 * Options (pick one, delete the rest):
 *
 *  A) localStorage — simplest, works for MVP
 *     return localStorage.getItem('user_role') ?? 'super_admin'
 *
 *  B) Decoded JWT
 *     import jwtDecode from 'jwt-decode'
 *     const token = localStorage.getItem('access_token')
 *     return token ? jwtDecode(token).role : null
 *
 *  C) React context (e.g. from an AuthProvider)
 *     — skip this file entirely and call useAuth() in RootLayout
 */
function getRole() {
  // ── A) localStorage (default for now) ──────────────────────
  return localStorage.getItem("user_role") ?? "super_admin";

  // ── B) Decoded JWT ──────────────────────────────────────────
  // try {
  //   const token = localStorage.getItem('access_token')
  //   if (!token) return null
  //   const payload = JSON.parse(atob(token.split('.')[1]))
  //   return payload.role ?? null
  // } catch {
  //   return null
  // }
}

/**
 * useRole()
 *
 * @returns {{
 *   role: string | null,
 *   config: { navItems, pages, defaultPage, user },
 *   loading: boolean,
 * }}
 */
export function useRole() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Synchronous for localStorage; wrap in async if fetching from API
    const resolved = getRole();
    setRole(resolved);
    setLoading(false);

    // ── FUTURE: fetch from backend ────────────────────────────
    // async function fetchRole() {
    //   try {
    //     const res  = await fetch('/api/me', { credentials: 'include' })
    //     const data = await res.json()
    //     setRole(data.role)
    //   } catch {
    //     setRole(null)
    //   } finally {
    //     setLoading(false)
    //   }
    // }
    // fetchRole()
  }, []);

  const config = getRoleConfig(role);
  return { role, config, loading };
}
