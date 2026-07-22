-- =============================================================================
-- 005_workflow_system.sql
-- Adds workflow_templates, workflow_steps, data_sources.
-- Wires FKs onto report_sections that were deferred in migration 004.
-- =============================================================================

-- 1. WORKFLOW TEMPLATES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID        NOT NULL
                   REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_templates_institution
  ON public.workflow_templates (institution_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wf_templates_upd') THEN
    CREATE TRIGGER trg_wf_templates_upd BEFORE UPDATE ON public.workflow_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2. WORKFLOW STEPS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID        NOT NULL
                     REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_order       INTEGER     NOT NULL,
  step_name        TEXT        NOT NULL,
  approver_role    VARCHAR(100),
  approver_user_id UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_step_approver CHECK (
    (approver_role IS NOT NULL)::int + (approver_user_id IS NOT NULL)::int >= 1
  ),
  UNIQUE (template_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_template
  ON public.workflow_steps (template_id, step_order);

-- 3. DATA SOURCES --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_sources (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID        NOT NULL
                   REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  source_type    VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
                   CHECK (source_type IN ('MANUAL','SQL','API','UPLOAD')),
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

-- 4. WIRE FKs on report_sections deferred from 004 ----------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_sections_workflow_template_id_fkey'
  ) THEN
    ALTER TABLE public.report_sections
      ADD CONSTRAINT report_sections_workflow_template_id_fkey
      FOREIGN KEY (workflow_template_id) REFERENCES public.workflow_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_sections_current_step_id_fkey'
  ) THEN
    ALTER TABLE public.report_sections
      ADD CONSTRAINT report_sections_current_step_id_fkey
      FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_sections_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.report_sections
      ADD CONSTRAINT report_sections_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'section_blocks_data_source_id_fkey'
  ) THEN
    ALTER TABLE public.section_blocks
      ADD CONSTRAINT section_blocks_data_source_id_fkey
      FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Section status transition guard trigger (v5 version) ----------------------
CREATE OR REPLACE FUNCTION public.guard_section_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE allowed BOOLEAN := FALSE;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'NOT_STARTED'  THEN NEW.status IN ('IN_PROGRESS')
    WHEN 'IN_PROGRESS'  THEN NEW.status IN ('SUBMITTED','NOT_STARTED')
    WHEN 'SUBMITTED'    THEN NEW.status IN ('UNDER_REVIEW','SENT_BACK')
    WHEN 'UNDER_REVIEW' THEN NEW.status IN ('APPROVED','SENT_BACK')
    WHEN 'APPROVED'     THEN NEW.status IN ('LOCKED')
    WHEN 'SENT_BACK'    THEN NEW.status IN ('IN_PROGRESS')
    WHEN 'LOCKED'       THEN FALSE
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid section status transition: % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_section_status_guard') THEN
    CREATE TRIGGER trg_section_status_guard
      BEFORE UPDATE OF status ON public.report_sections
      FOR EACH ROW EXECUTE FUNCTION public.guard_section_status_transition();
  END IF;
END $$;

-- 6. Cascade lock: report locked → APPROVED sections become LOCKED -------------
CREATE OR REPLACE FUNCTION public.cascade_report_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_locked = TRUE AND OLD.is_locked = FALSE THEN
    UPDATE public.report_sections
    SET status = 'LOCKED', updated_at = NOW()
    WHERE report_id = NEW.id AND status = 'APPROVED' AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_report_cascade_lock') THEN
    CREATE TRIGGER trg_report_cascade_lock
      AFTER UPDATE OF is_locked ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.cascade_report_lock();
  END IF;
END $$;
