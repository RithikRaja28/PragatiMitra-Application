-- =============================================================================
-- 002_report_branding.sql
-- Adds visual branding fields to reports and a branding_assignments table.
-- Run once, after 001_report_builder.sql.
-- =============================================================================

-- ── 1. Branding columns on reports ───────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS bg_image_url    TEXT;

-- ── 2. Branding assignments ───────────────────────────────────────────────────
-- Each row assigns one "asset slot" (cover / logo / bg) to a user so they
-- appear in that user's My Sections page as a task.
CREATE TABLE IF NOT EXISTS public.branding_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  asset_type  VARCHAR(20) NOT NULL
                CHECK (asset_type IN ('COVER_IMAGE', 'LOGO', 'BG_IMAGE')),
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  asset_url   TEXT,
  assigned_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, asset_type)
);

CREATE INDEX IF NOT EXISTS idx_branding_user
  ON public.branding_assignments (user_id)
  WHERE user_id IS NOT NULL;
