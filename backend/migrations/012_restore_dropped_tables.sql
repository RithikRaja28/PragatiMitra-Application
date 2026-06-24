-- =============================================================================
-- 012_restore_dropped_tables.sql
--
-- Schema drift fix: `data_sources` and `cycle_department_deadlines` were
-- defined in migrations 004/005 (and referenced by 006/009) but were missing
-- from the live database — `data_sources` had clearly existed at some point,
-- since report_sections.data_source_id, section_blocks.data_source_id,
-- template_sections.data_source_id and template_blocks.data_source_id all
-- still carry the orphaned UUID column with no FK constraint (a dropped
-- table CASCADE-drops the FKs that pointed at it). This migration recreates
-- both tables (final state, post-009) and restores the FK constraints.
-- =============================================================================

-- 1. DATA SOURCES (matches 005, with 009's tightened source_type check already applied) ----
CREATE TABLE IF NOT EXISTS public.data_sources (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID        NOT NULL
                   REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  source_type    VARCHAR(30) NOT NULL DEFAULT 'SQL'
                   CHECK (source_type IN ('SQL','API','UPLOAD')),
  query          TEXT,
  connection_id  VARCHAR(255),
  params         JSONB       NOT NULL DEFAULT '{}',
  column_map     JSONB       NOT NULL DEFAULT '[]',
  created_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_sources_institution
  ON public.data_sources (institution_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_data_sources_upd') THEN
    CREATE TRIGGER trg_data_sources_upd BEFORE UPDATE ON public.data_sources
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2. CYCLE DEPARTMENT DEADLINES (matches 004) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.cycle_department_deadlines (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            UUID        NOT NULL
                        REFERENCES public.reporting_cycles(id) ON DELETE CASCADE,
  department_id       UUID        NOT NULL
                        REFERENCES public.departments(department_id) ON DELETE CASCADE,
  submission_deadline TIMESTAMPTZ,
  review_deadline     TIMESTAMPTZ,
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_cycle_dept_deadlines
  ON public.cycle_department_deadlines (cycle_id);

-- 3. RESTORE FOREIGN KEYS THAT POINTED AT data_sources ----------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_sections_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.report_sections
      ADD CONSTRAINT report_sections_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'section_blocks_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.section_blocks
      ADD CONSTRAINT section_blocks_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'template_sections_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.template_sections
      ADD CONSTRAINT template_sections_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'template_blocks_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.template_blocks
      ADD CONSTRAINT template_blocks_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;
