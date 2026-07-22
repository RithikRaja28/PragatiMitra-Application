-- =============================================================================
-- 004_reporting_cycles.sql
-- Adds reporting cycles and extends reports / sections / assignments / blocks
-- to match the v5 production schema.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- 1. REPORTING CYCLES -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reporting_cycles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID        NOT NULL
                        REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT,
  start_date          DATE        NOT NULL,
  end_date            DATE        NOT NULL,
  reporting_year      VARCHAR(20),
  submission_deadline TIMESTAMPTZ,
  review_deadline     TIMESTAMPTZ,
  approval_deadline   TIMESTAMPTZ,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','CLOSED','ARCHIVED')),
  closed_at           TIMESTAMPTZ,
  closed_by           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at         TIMESTAMPTZ,
  archived_by         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cycle_dates      CHECK (end_date >= start_date),
  CONSTRAINT chk_deadline_order   CHECK (
    (submission_deadline IS NULL OR review_deadline IS NULL OR submission_deadline <= review_deadline)
    AND (review_deadline IS NULL OR approval_deadline IS NULL OR review_deadline <= approval_deadline)
  )
);

CREATE INDEX IF NOT EXISTS idx_cycles_institution
  ON public.reporting_cycles (institution_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cycles_upd') THEN
    CREATE TRIGGER trg_cycles_upd BEFORE UPDATE ON public.reporting_cycles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2. NOTIFICATIONS TABLE --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         VARCHAR(50)  NOT NULL,
  title        TEXT         NOT NULL,
  body         TEXT,
  entity_type  VARCHAR(50),
  entity_id    UUID,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- 3. DEPARTMENT DEADLINE OVERRIDES ---------------------------------------------
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

-- 4. EXTEND reports ------------------------------------------------------------
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS cycle_id         UUID        REFERENCES public.reporting_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id      UUID,  -- FK added in migration 006
  ADD COLUMN IF NOT EXISTS is_locked        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by        UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_language VARCHAR(10) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS description      TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_cycle
  ON public.reports (cycle_id) WHERE deleted_at IS NULL;

-- 5. EXTEND report_sections ----------------------------------------------------
ALTER TABLE public.report_sections
  ADD COLUMN IF NOT EXISTS source_template_section_id UUID,
  ADD COLUMN IF NOT EXISTS workflow_template_id       UUID,  -- FK added in migration 005
  ADD COLUMN IF NOT EXISTS current_step_id            UUID,  -- FK added in migration 005
  ADD COLUMN IF NOT EXISTS submission_deadline        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_deadline            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_source_id             UUID;  -- FK added in migration 005

-- Align status values to v5 schema
-- Old: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, REVISION_REQUIRED
-- New: NOT_STARTED, IN_PROGRESS, SUBMITTED, UNDER_REVIEW, APPROVED, SENT_BACK, LOCKED
--
-- FIX: drop constraint FIRST (outside exception block), migrate data, THEN add new constraint.
-- The old DO $$ approach rolled back the DROP when ADD CONSTRAINT failed during validation,
-- leaving the old constraint in place while UPDATE tried to write 'IN_PROGRESS'.

-- Step 1: drop old constraint unconditionally so data migration can proceed
ALTER TABLE public.report_sections DROP CONSTRAINT IF EXISTS report_sections_status_check;

-- Step 2: migrate existing data to v5 status values (idempotent WHERE clauses)
UPDATE public.report_sections SET status = 'IN_PROGRESS' WHERE status = 'DRAFT';
UPDATE public.report_sections SET status = 'SENT_BACK'   WHERE status IN ('REJECTED','REVISION_REQUIRED');

-- Step 3: now ALL rows have valid v5 values — safe to add the new constraint
DO $$
BEGIN
  ALTER TABLE public.report_sections
    ADD CONSTRAINT report_sections_status_check
    CHECK (status IN ('NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW','APPROVED','SENT_BACK','LOCKED'));
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists from a previous run, ignore
END $$;

-- Step 4: update column default
ALTER TABLE public.report_sections ALTER COLUMN status SET DEFAULT 'NOT_STARTED';

-- 6. EXTEND section_assignments ------------------------------------------------
ALTER TABLE public.section_assignments
  ADD COLUMN IF NOT EXISTS due_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at  TIMESTAMPTZ;

-- 7. EXTEND section_blocks -----------------------------------------------------
ALTER TABLE public.section_blocks
  ADD COLUMN IF NOT EXISTS source_template_block_id UUID,
  ADD COLUMN IF NOT EXISTS data_source_id            UUID,
  ADD COLUMN IF NOT EXISTS is_required               BOOLEAN NOT NULL DEFAULT FALSE;

-- Update block_type check to include CHECKLIST and EMBED (from IMAGE_GRID migration)
DO $$
BEGIN
  ALTER TABLE public.section_blocks DROP CONSTRAINT IF EXISTS section_blocks_block_type_check;
  ALTER TABLE public.section_blocks
    ADD CONSTRAINT section_blocks_block_type_check
    CHECK (block_type IN (
      'PARAGRAPH','HEADING','IMAGE','IMAGE_GRID',
      'TABLE','KPI','CHART','LIST','CHECKLIST',
      'FILE','DIVIDER','EMBED'
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. SECTION DEPARTMENT ASSIGNMENTS --------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_department_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id    UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  department_id UUID        NOT NULL REFERENCES public.departments(department_id) ON DELETE CASCADE,
  assigned_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  due_at        TIMESTAMPTZ,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_sect_dept_assign_section
  ON public.section_department_assignments (section_id);
CREATE INDEX IF NOT EXISTS idx_sect_dept_assign_dept
  ON public.section_department_assignments (department_id);

-- 9. SECTION ACCESS CONTROL ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_access (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID        NOT NULL REFERENCES public.report_sections(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  role_name    VARCHAR(100),
  permission   VARCHAR(20) NOT NULL DEFAULT 'READ'
                 CHECK (permission IN ('READ','WRITE','REVIEW','ADMIN')),
  granted_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT chk_access_target CHECK (
    (user_id IS NOT NULL)::int + (role_name IS NOT NULL)::int >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_section_access_section
  ON public.section_access (section_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_section_access_user
  ON public.section_access (user_id) WHERE revoked_at IS NULL AND user_id IS NOT NULL;
