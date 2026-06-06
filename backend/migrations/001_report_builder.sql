-- =============================================================================
-- 001_report_builder.sql
-- Collaborative Institutional Report Builder
-- Run once against the pragati_mitra database.
-- =============================================================================

-- ── Extension (idempotent) ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. REPORTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  report_type    VARCHAR(100),                        -- 'NAAC', 'Annual', 'Department', etc.
  academic_year  VARCHAR(20),
  status         VARCHAR(30) NOT NULL DEFAULT 'DRAFT' -- DRAFT | PUBLISHED | ARCHIVED
                   CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ                           -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_reports_institution
  ON public.reports (institution_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.reports (institution_id, status)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- 2. REPORT SECTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.report_sections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  parent_id    UUID        REFERENCES public.report_sections(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  order_index  REAL        NOT NULL DEFAULT 0,         -- REAL enables fractional indexing
  status       VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN (
                   'DRAFT','SUBMITTED','UNDER_REVIEW',
                   'APPROVED','REJECTED','REVISION_REQUIRED'
                 )),
  version_lock INTEGER     NOT NULL DEFAULT 0,         -- optimistic concurrency counter
  locked_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  locked_at    TIMESTAMPTZ,                             -- NULL = unlocked; expires after 15 min
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sections_report
  ON public.report_sections (report_id, order_index)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sections_parent
  ON public.report_sections (parent_id)
  WHERE deleted_at IS NULL AND parent_id IS NOT NULL;

-- Ensures only one active lock per section (ignored when locked_by is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_section_lock
  ON public.report_sections (id)
  WHERE locked_by IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- 3. SECTION ASSIGNMENTS  (who is responsible for writing a section)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.section_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role           VARCHAR(50) NOT NULL DEFAULT 'CONTRIBUTOR'
                   CHECK (role IN ('OWNER','CONTRIBUTOR','REVIEWER')),
  assigned_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (section_id, user_id)
);

-- Partial unique: only one OWNER per section at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_section_owner
  ON public.section_assignments (section_id)
  WHERE role = 'OWNER' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_user
  ON public.section_assignments (user_id);

-- =============================================================================
-- 4. SECTION BLOCKS  (ordered content blocks inside a section)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.section_blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  block_type   VARCHAR(50) NOT NULL
                 CHECK (block_type IN (
                   'PARAGRAPH','HEADING','IMAGE','TABLE',
                   'KPI','CHART','LIST','FILE','DIVIDER'
                 )),
  order_index  REAL        NOT NULL DEFAULT 0,
  content      JSONB       NOT NULL DEFAULT '{}',
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blocks_section
  ON public.section_blocks (section_id, order_index)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_blocks_content_gin
  ON public.section_blocks USING GIN (content)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- 5. SECTION VERSIONS  (snapshots on submit / approval events)
--    Intentionally NO ON DELETE CASCADE on section_id — history is preserved
--    even if the section is soft-deleted.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.section_versions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID        NOT NULL REFERENCES public.report_sections(id),
  version_num  INTEGER     NOT NULL,
  event        VARCHAR(50) NOT NULL
                 CHECK (event IN ('SUBMITTED','APPROVED','REJECTED','REVISION_REQUIRED','RESTORED','MANUAL')),
  snapshot     JSONB       NOT NULL,  -- { section: {...}, blocks: [...], meta: {...} }
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_versions_section
  ON public.section_versions (section_id, version_num DESC);

-- =============================================================================
-- 6. APPROVALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.builder_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  reviewer_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  decision     VARCHAR(30) NOT NULL
                 CHECK (decision IN ('APPROVED','REJECTED','REVISION_REQUIRED')),
  comments     TEXT,
  version_num  INTEGER,               -- the version this decision was made on
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_section
  ON public.builder_approvals (section_id, created_at DESC);

-- =============================================================================
-- 7. BUILDER ATTACHMENTS  (files uploaded as block assets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.builder_attachments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID        REFERENCES public.reports(id) ON DELETE CASCADE,
  section_id   UUID        REFERENCES public.report_sections(id) ON DELETE SET NULL,
  block_id     UUID        REFERENCES public.section_blocks(id) ON DELETE SET NULL,
  file_name    TEXT        NOT NULL,
  file_size    BIGINT,
  mime_type    VARCHAR(200),
  storage_path TEXT        NOT NULL,
  uploaded_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_report
  ON public.builder_attachments (report_id);

-- =============================================================================
-- updated_at auto-update trigger (shared function)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reports_updated_at'
  ) THEN
    CREATE TRIGGER trg_reports_updated_at
      BEFORE UPDATE ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sections_updated_at'
  ) THEN
    CREATE TRIGGER trg_sections_updated_at
      BEFORE UPDATE ON public.report_sections
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_blocks_updated_at'
  ) THEN
    CREATE TRIGGER trg_blocks_updated_at
      BEFORE UPDATE ON public.section_blocks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
