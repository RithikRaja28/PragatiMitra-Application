-- =============================================================================
-- 007_advanced_features.sql
-- Adds: block_comments, section_translations, block_translations,
--       compiled_reports, report_audit_log.
-- =============================================================================

-- 1. BLOCK COMMENTS (threaded) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     UUID        NOT NULL REFERENCES public.section_blocks(id) ON DELETE CASCADE,
  section_id   UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  parent_id    UUID        REFERENCES public.block_comments(id) ON DELETE CASCADE,
  body         TEXT        NOT NULL,
  is_resolved  BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_by   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  updated_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comments_block
  ON public.block_comments (block_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_section
  ON public.block_comments (section_id) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_comments_upd') THEN
    CREATE TRIGGER trg_comments_upd BEFORE UPDATE ON public.block_comments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2. SECTION TRANSLATIONS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_translations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  language    VARCHAR(10) NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  status      VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','IN_PROGRESS','REVIEW','APPROVED')),
  created_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, language)
);

CREATE INDEX IF NOT EXISTS idx_sec_translations_section
  ON public.section_translations (section_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sec_trans_upd') THEN
    CREATE TRIGGER trg_sec_trans_upd BEFORE UPDATE ON public.section_translations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 3. BLOCK TRANSLATIONS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_translations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id   UUID        NOT NULL REFERENCES public.section_blocks(id) ON DELETE CASCADE,
  language   VARCHAR(10) NOT NULL,
  content    JSONB       NOT NULL DEFAULT '{}',
  status     VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT','IN_PROGRESS','REVIEW','APPROVED')),
  created_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (block_id, language)
);

CREATE INDEX IF NOT EXISTS idx_blk_translations_block
  ON public.block_translations (block_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_blk_trans_upd') THEN
    CREATE TRIGGER trg_blk_trans_upd BEFORE UPDATE ON public.block_translations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. COMPILED REPORTS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compiled_reports (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  language          VARCHAR(10) NOT NULL DEFAULT 'en',
  format            VARCHAR(20) NOT NULL DEFAULT 'PDF'
                      CHECK (format IN ('PDF','DOCX','HTML','JSON')),
  storage_path      TEXT        NOT NULL,
  file_size         BIGINT,
  checksum          VARCHAR(64),
  compile_options   JSONB       NOT NULL DEFAULT '{}',
  included_sections UUID[]      NOT NULL DEFAULT '{}',
  compiled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  compiled_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_compiled_report_report
  ON public.compiled_reports (report_id, compiled_at DESC);

-- 5. REPORT AUDIT LOG (report-domain specific) ---------------------------------
CREATE TABLE IF NOT EXISTS public.report_audit_log (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID         REFERENCES public.institutions(institution_id) ON DELETE SET NULL,
  entity_type    VARCHAR(100) NOT NULL,
  entity_id      UUID         NOT NULL,
  action         VARCHAR(50)  NOT NULL,
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[],
  user_id        UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  ip_address     INET,
  user_agent     TEXT,
  session_id     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rpt_audit_entity
  ON public.report_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpt_audit_user
  ON public.report_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpt_audit_institution
  ON public.report_audit_log (institution_id, created_at DESC);

-- 6. Extend section_versions event types to include AUTO_SAVE ------------------
DO $$
BEGIN
  ALTER TABLE public.section_versions DROP CONSTRAINT IF EXISTS section_versions_event_check;
  ALTER TABLE public.section_versions
    ADD CONSTRAINT section_versions_event_check
    CHECK (event IN ('SUBMITTED','APPROVED','SENT_BACK','RESTORED','MANUAL','AUTO_SAVE'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add reviewer fields to section_versions if not present
ALTER TABLE public.section_versions
  ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision         VARCHAR(20)
                             CHECK (decision IN ('APPROVED','SENT_BACK') OR decision IS NULL),
  ADD COLUMN IF NOT EXISTS reviewer_comment TEXT;
