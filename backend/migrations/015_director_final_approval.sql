-- Migration 015: Add needs_director_approval flag to report_sections
-- When all workflow steps complete, section goes to director's office for
-- final approval before being marked APPROVED.

ALTER TABLE public.report_sections
ADD COLUMN IF NOT EXISTS needs_director_approval BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.report_sections.needs_director_approval IS
  'True when all workflow steps are approved and director''s office final approval is pending';
