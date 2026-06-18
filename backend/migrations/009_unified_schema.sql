-- =============================================================================
-- 009_unified_schema.sql
-- Incremental migration from 001-008 to the complete production schema.
-- Safe to re-run: all CREATE uses IF NOT EXISTS; ALTER uses ADD COLUMN IF NOT
-- EXISTS; DO blocks guard constraints/triggers by name before adding.
--
-- Prerequisites: migrations 001-008 already applied.
-- Requires: PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT).
-- =============================================================================

-- =============================================================================
-- 1. REPORTING_CYCLES — add deadline-within-bounds constraint
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name   = 'chk_cycle_deadlines_within_bounds'
      AND table_name        = 'reporting_cycles'
  ) THEN
    ALTER TABLE public.reporting_cycles
      ADD CONSTRAINT chk_cycle_deadlines_within_bounds CHECK (
        (submission_deadline IS NULL
          OR submission_deadline::date BETWEEN start_date AND end_date)
        AND
        (review_deadline IS NULL
          OR review_deadline::date BETWEEN start_date AND end_date)
        AND
        (approval_deadline IS NULL
          OR approval_deadline::date BETWEEN start_date AND end_date)
      );
  END IF;
END $$;


-- =============================================================================
-- 2. DATA_SOURCES — remove deprecated 'MANUAL' source_type
-- =============================================================================
DO $$
BEGIN
  -- Migrate any MANUAL rows before tightening the constraint
  UPDATE public.data_sources SET source_type = 'SQL' WHERE source_type = 'MANUAL';

  ALTER TABLE public.data_sources DROP CONSTRAINT IF EXISTS data_sources_source_type_check;

  BEGIN
    ALTER TABLE public.data_sources
      ADD CONSTRAINT data_sources_source_type_check
      CHECK (source_type IN ('SQL','API','UPLOAD'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- =============================================================================
-- 3. REPORTS — add report-level deadline columns (cycle-level fallback, level 4)
-- =============================================================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_deadline     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_deadline   TIMESTAMPTZ;


-- =============================================================================
-- 4. NEW TABLE: report_department_deadlines
--    Per-report, per-department deadline defaults (level 3 in 5-level chain).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.report_department_deadlines (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID        NOT NULL
                        REFERENCES public.reports(id) ON DELETE CASCADE,
  department_id       UUID        NOT NULL
                        REFERENCES public.departments(department_id) ON DELETE CASCADE,

  submission_deadline TIMESTAMPTZ,
  review_deadline     TIMESTAMPTZ,
  approval_deadline   TIMESTAMPTZ,

  notes               TEXT,
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rpt_dept_deadline_order CHECK (
    (submission_deadline IS NULL OR review_deadline IS NULL
      OR submission_deadline <= review_deadline)
    AND
    (review_deadline IS NULL OR approval_deadline IS NULL
      OR review_deadline <= approval_deadline)
  ),
  UNIQUE (report_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_rpt_dept_deadlines_report
  ON public.report_department_deadlines (report_id);
CREATE INDEX IF NOT EXISTS idx_rpt_dept_deadlines_dept
  ON public.report_department_deadlines (department_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rpt_dept_dl_upd') THEN
    CREATE TRIGGER trg_rpt_dept_dl_upd BEFORE UPDATE ON public.report_department_deadlines
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;


-- =============================================================================
-- 5. NEW TABLE: report_access
--    Report-wide READ grant by role (no per-section configuration needed).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.report_access (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID         NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  role_name   VARCHAR(100) NOT NULL,
  granted_by  UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  UNIQUE (report_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_report_access_report
  ON public.report_access (report_id) WHERE revoked_at IS NULL;


-- =============================================================================
-- 6. REPORT_SECTIONS — add approval_deadline; fix order_index REAL → INTEGER
--    (001 created it as REAL for fractional indexing; new schema uses INTEGER)
-- =============================================================================
ALTER TABLE public.report_sections
  ADD COLUMN IF NOT EXISTS approval_deadline TIMESTAMPTZ;

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_sections'
        AND column_name='order_index') = 'real' THEN
    ALTER TABLE public.report_sections
      ALTER COLUMN order_index TYPE INTEGER USING ROUND(order_index)::INTEGER;
  END IF;
END $$;


-- =============================================================================
-- 7. SECTION_ACCESS — add department_id + update check constraint
-- =============================================================================
ALTER TABLE public.section_access
  ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES public.departments(department_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_section_access_department
  ON public.section_access (department_id)
  WHERE revoked_at IS NULL AND department_id IS NOT NULL;

-- Replace old chk_access_target (user/role only) with one that includes dept
DO $$
BEGIN
  ALTER TABLE public.section_access DROP CONSTRAINT IF EXISTS chk_access_target;
  ALTER TABLE public.section_access DROP CONSTRAINT IF EXISTS chk_section_access_target;

  ALTER TABLE public.section_access
    ADD CONSTRAINT chk_section_access_target CHECK (
      (user_id IS NOT NULL)::int
      + (role_name IS NOT NULL)::int
      + (department_id IS NOT NULL)::int >= 1
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- 8. NEW TABLE: section_workflow_assignments  (UNIFIED assignment table)
--    Replaces section_assignments + section_department_assignments.
--    Requires PG 15+ for UNIQUE NULLS NOT DISTINCT.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.section_workflow_assignments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  report_id        UUID        NOT NULL
                     REFERENCES public.reports(id) ON DELETE CASCADE,
  section_id       UUID        NOT NULL
                     REFERENCES public.report_sections(id) ON DELETE CASCADE,

  workflow_step_id UUID        REFERENCES public.workflow_steps(id) ON DELETE CASCADE,

  assignee_type    VARCHAR(20) NOT NULL
                     CHECK (assignee_type IN ('USER','DEPARTMENT','ROLE')),
  user_id          UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  department_id    UUID        REFERENCES public.departments(department_id) ON DELETE CASCADE,
  role_name        VARCHAR(100),

  due_at           TIMESTAMPTZ,

  assigned_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  notified_at      TIMESTAMPTZ,

  CONSTRAINT chk_assignee_identity CHECK (
    (assignee_type = 'USER'
      AND user_id IS NOT NULL AND department_id IS NULL AND role_name IS NULL) OR
    (assignee_type = 'DEPARTMENT'
      AND department_id IS NOT NULL AND user_id IS NULL AND role_name IS NULL) OR
    (assignee_type = 'ROLE'
      AND role_name IS NOT NULL AND user_id IS NULL AND department_id IS NULL)
  ),

  -- PG 15+: NULL workflow_step_id treated as equal for deduplication
  UNIQUE NULLS NOT DISTINCT (section_id, workflow_step_id, assignee_type, user_id, department_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_swa_report
  ON public.section_workflow_assignments (report_id);
CREATE INDEX IF NOT EXISTS idx_swa_section
  ON public.section_workflow_assignments (section_id);
CREATE INDEX IF NOT EXISTS idx_swa_step
  ON public.section_workflow_assignments (workflow_step_id)
  WHERE workflow_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swa_user
  ON public.section_workflow_assignments (user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swa_department
  ON public.section_workflow_assignments (department_id)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swa_role
  ON public.section_workflow_assignments (role_name)
  WHERE role_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swa_authoring
  ON public.section_workflow_assignments (section_id)
  WHERE workflow_step_id IS NULL;


-- =============================================================================
-- 9. SECTION_VERSIONS — add latest_decision_* columns; tighten event check
-- =============================================================================
ALTER TABLE public.section_versions
  ADD COLUMN IF NOT EXISTS latest_decision         VARCHAR(20)
    CHECK (latest_decision IN ('APPROVED','SENT_BACK') OR latest_decision IS NULL),
  ADD COLUMN IF NOT EXISTS latest_decision_by      UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_decision_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_decision_step_id UUID
    REFERENCES public.workflow_steps(id) ON DELETE SET NULL;

-- Remove decision-type events — decisions live in section_signoffs now
DO $$
BEGIN
  -- Reclassify any lingering decision events as MANUAL snapshots
  UPDATE public.section_versions
    SET event = 'MANUAL'
  WHERE event IN ('APPROVED','REJECTED','REVISION_REQUIRED');

  -- SENT_BACK is valid in 007's check, migrate to MANUAL as well
  UPDATE public.section_versions
    SET event = 'MANUAL'
  WHERE event = 'SENT_BACK';

  ALTER TABLE public.section_versions DROP CONSTRAINT IF EXISTS section_versions_event_check;

  ALTER TABLE public.section_versions
    ADD CONSTRAINT section_versions_event_check
    CHECK (event IN ('SUBMITTED','RESTORED','MANUAL','AUTO_SAVE'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 10. BUILDER_ATTACHMENTS — add checksum column
-- =============================================================================
ALTER TABLE public.builder_attachments
  ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);


-- =============================================================================
-- 11. NEW TABLE: section_signoffs  (immutable per-step decision record)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.section_signoffs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id       UUID        NOT NULL
                     REFERENCES public.report_sections(id) ON DELETE CASCADE,
  workflow_step_id UUID        NOT NULL
                     REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  reviewer_id      UUID        NOT NULL
                     REFERENCES public.users(id) ON DELETE CASCADE,
  decision         VARCHAR(20) NOT NULL
                     CHECK (decision IN ('APPROVED','SENT_BACK')),
  version_num      INTEGER     NOT NULL,
  comment          TEXT,
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signoffs_section
  ON public.section_signoffs (section_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signoffs_reviewer
  ON public.section_signoffs (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_signoffs_step
  ON public.section_signoffs (workflow_step_id);


-- =============================================================================
-- 12. TRIGGER FUNCTION: validate_report_dept_deadline
--     Validates report_department_deadlines against parent cycle bounds.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_report_dept_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cycle_start      DATE;
  v_cycle_end        DATE;
  v_cycle_submission TIMESTAMPTZ;
  v_cycle_review     TIMESTAMPTZ;
  v_cycle_approval   TIMESTAMPTZ;
BEGIN
  SELECT rc.start_date, rc.end_date,
         rc.submission_deadline, rc.review_deadline, rc.approval_deadline
  INTO   v_cycle_start, v_cycle_end,
         v_cycle_submission, v_cycle_review, v_cycle_approval
  FROM   public.reports r
  JOIN   public.reporting_cycles rc ON rc.id = r.cycle_id
  WHERE  r.id = NEW.report_id;

  IF v_cycle_start IS NULL THEN
    RETURN NEW; -- report has no cycle; skip
  END IF;

  IF NEW.submission_deadline IS NOT NULL THEN
    IF NEW.submission_deadline::date NOT BETWEEN v_cycle_start AND v_cycle_end THEN
      RAISE EXCEPTION 'submission_deadline (%) outside cycle bounds [%, %]',
        NEW.submission_deadline, v_cycle_start, v_cycle_end
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_cycle_submission IS NOT NULL AND NEW.submission_deadline > v_cycle_submission THEN
      RAISE EXCEPTION 'submission_deadline (%) cannot exceed cycle submission_deadline (%)',
        NEW.submission_deadline, v_cycle_submission
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.review_deadline IS NOT NULL THEN
    IF NEW.review_deadline::date NOT BETWEEN v_cycle_start AND v_cycle_end THEN
      RAISE EXCEPTION 'review_deadline (%) outside cycle bounds [%, %]',
        NEW.review_deadline, v_cycle_start, v_cycle_end
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_cycle_review IS NOT NULL AND NEW.review_deadline > v_cycle_review THEN
      RAISE EXCEPTION 'review_deadline (%) cannot exceed cycle review_deadline (%)',
        NEW.review_deadline, v_cycle_review
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.approval_deadline IS NOT NULL THEN
    IF NEW.approval_deadline::date NOT BETWEEN v_cycle_start AND v_cycle_end THEN
      RAISE EXCEPTION 'approval_deadline (%) outside cycle bounds [%, %]',
        NEW.approval_deadline, v_cycle_start, v_cycle_end
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_cycle_approval IS NOT NULL AND NEW.approval_deadline > v_cycle_approval THEN
      RAISE EXCEPTION 'approval_deadline (%) cannot exceed cycle approval_deadline (%)',
        NEW.approval_deadline, v_cycle_approval
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_rpt_dept_deadline') THEN
    CREATE TRIGGER trg_validate_rpt_dept_deadline
      BEFORE INSERT OR UPDATE ON public.report_department_deadlines
      FOR EACH ROW EXECUTE FUNCTION public.validate_report_dept_deadline();
  END IF;
END $$;


-- =============================================================================
-- 13. TRIGGER FUNCTION: validate_section_workflow_assignment_deadline
--     Enforces cycle bounds, deadline ceiling (authoring/review/approval), and
--     non-decreasing step ordering on section_workflow_assignments.due_at.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_section_workflow_assignment_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cycle_start      DATE;
  v_cycle_end        DATE;
  v_cycle_submission TIMESTAMPTZ;
  v_cycle_review     TIMESTAMPTZ;
  v_cycle_approval   TIMESTAMPTZ;
  v_my_step_order    INTEGER;
  v_template_id      UUID;
  v_max_step_order   INTEGER;
  v_is_last_step     BOOLEAN := FALSE;
  v_prev_due         TIMESTAMPTZ;
  v_next_due         TIMESTAMPTZ;
BEGIN
  IF NEW.due_at IS NULL THEN RETURN NEW; END IF;

  SELECT rc.start_date, rc.end_date,
         rc.submission_deadline, rc.review_deadline, rc.approval_deadline
  INTO   v_cycle_start, v_cycle_end,
         v_cycle_submission, v_cycle_review, v_cycle_approval
  FROM   public.reports r
  JOIN   public.reporting_cycles rc ON rc.id = r.cycle_id
  WHERE  r.id = NEW.report_id;

  -- (A) Must fall within cycle calendar window
  IF v_cycle_start IS NOT NULL AND v_cycle_end IS NOT NULL THEN
    IF NEW.due_at::date < v_cycle_start OR NEW.due_at::date > v_cycle_end THEN
      RAISE EXCEPTION 'due_at (%) is outside reporting cycle bounds [%, %]',
        NEW.due_at, v_cycle_start, v_cycle_end
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- (B) Ceiling check: depends on authoring stage vs. review/approval step
  IF NEW.workflow_step_id IS NULL THEN
    -- Authoring: must not exceed cycle submission deadline
    IF v_cycle_submission IS NOT NULL AND NEW.due_at > v_cycle_submission THEN
      RAISE EXCEPTION 'Authoring due_at (%) cannot exceed cycle submission_deadline (%)',
        NEW.due_at, v_cycle_submission
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT ws.step_order, ws.template_id
    INTO   v_my_step_order, v_template_id
    FROM   public.workflow_steps ws
    WHERE  ws.id = NEW.workflow_step_id;

    SELECT MAX(step_order) INTO v_max_step_order
    FROM   public.workflow_steps
    WHERE  template_id = v_template_id;

    v_is_last_step := (v_my_step_order = v_max_step_order);

    IF v_is_last_step THEN
      IF v_cycle_approval IS NOT NULL AND NEW.due_at > v_cycle_approval THEN
        RAISE EXCEPTION 'Final-step due_at (%) cannot exceed cycle approval_deadline (%)',
          NEW.due_at, v_cycle_approval
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF v_cycle_review IS NOT NULL AND NEW.due_at > v_cycle_review THEN
        RAISE EXCEPTION 'Step due_at (%) cannot exceed cycle review_deadline (%)',
          NEW.due_at, v_cycle_review
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- (C) Step-ordering: non-decreasing across stages for the same section
  IF NEW.workflow_step_id IS NULL THEN
    -- Authoring must be <= step-1
    SELECT MIN(swa.due_at) INTO v_next_due
    FROM   public.section_workflow_assignments swa
    JOIN   public.workflow_steps ws ON ws.id = swa.workflow_step_id
    WHERE  swa.section_id = NEW.section_id
      AND  ws.step_order = 1
      AND  swa.due_at IS NOT NULL
      AND  swa.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_next_due IS NOT NULL AND NEW.due_at > v_next_due THEN
      RAISE EXCEPTION 'Authoring due_at (%) must be <= step-1 due_at (%) for section %',
        NEW.due_at, v_next_due, NEW.section_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_template_id IS NULL THEN
      SELECT ws.step_order, ws.template_id
      INTO   v_my_step_order, v_template_id
      FROM   public.workflow_steps ws
      WHERE  ws.id = NEW.workflow_step_id;
    END IF;

    -- Must be >= previous stage
    IF v_my_step_order = 1 THEN
      SELECT MAX(swa.due_at) INTO v_prev_due
      FROM   public.section_workflow_assignments swa
      WHERE  swa.section_id = NEW.section_id
        AND  swa.workflow_step_id IS NULL
        AND  swa.due_at IS NOT NULL
        AND  swa.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    ELSE
      SELECT MAX(swa.due_at) INTO v_prev_due
      FROM   public.section_workflow_assignments swa
      JOIN   public.workflow_steps ws2 ON ws2.id = swa.workflow_step_id
      WHERE  swa.section_id = NEW.section_id
        AND  ws2.template_id = v_template_id
        AND  ws2.step_order = v_my_step_order - 1
        AND  swa.due_at IS NOT NULL
        AND  swa.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    END IF;

    IF v_prev_due IS NOT NULL AND NEW.due_at < v_prev_due THEN
      RAISE EXCEPTION 'Step due_at (%) must be >= previous stage due_at (%) for section %',
        NEW.due_at, v_prev_due, NEW.section_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Must be <= next stage
    SELECT MIN(swa.due_at) INTO v_next_due
    FROM   public.section_workflow_assignments swa
    JOIN   public.workflow_steps ws2 ON ws2.id = swa.workflow_step_id
    WHERE  swa.section_id = NEW.section_id
      AND  ws2.template_id = v_template_id
      AND  ws2.step_order = v_my_step_order + 1
      AND  swa.due_at IS NOT NULL
      AND  swa.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_next_due IS NOT NULL AND NEW.due_at > v_next_due THEN
      RAISE EXCEPTION 'Step due_at (%) must be <= next stage due_at (%) for section %',
        NEW.due_at, v_next_due, NEW.section_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_swa_deadline') THEN
    CREATE TRIGGER trg_validate_swa_deadline
      BEFORE INSERT OR UPDATE OF due_at ON public.section_workflow_assignments
      FOR EACH ROW EXECUTE FUNCTION public.validate_section_workflow_assignment_deadline();
  END IF;
END $$;


-- =============================================================================
-- 14. FUNCTION: get_effective_deadline
--     5-level deadline chain: swa(user>dept>role) → section → report_dept →
--     report → cycle.  deadline_type: 'submission' | 'review' | 'approval'.
--
--     NOTE: users table uses user_roles+roles join for role resolution
--     (no direct `role` column on users).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_effective_deadline(
  p_section_id    UUID,
  p_user_id       UUID,
  p_deadline_type TEXT
)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
DECLARE
  v_result        TIMESTAMPTZ;
  v_report_id     UUID;
  v_cycle_id      UUID;
  v_current_step  UUID;
  v_user_role     VARCHAR(100);
  v_user_dept     UUID;
  v_target_step   UUID;
BEGIN
  SELECT rs.report_id, rs.current_step_id, r.cycle_id
  INTO   v_report_id, v_current_step, v_cycle_id
  FROM   public.report_sections rs
  JOIN   public.reports r ON r.id = rs.report_id
  WHERE  rs.id = p_section_id;

  -- department_id is a direct column on users
  SELECT department_id INTO v_user_dept
  FROM   public.users WHERE id = p_user_id;

  -- roles are resolved via user_roles → roles join
  SELECT r.name INTO v_user_role
  FROM   public.user_roles ur
  JOIN   public.roles r ON r.id = ur.role_id
  WHERE  ur.user_id = p_user_id AND ur.revoked_at IS NULL
  LIMIT  1;

  -- submission lookups use authoring stage (step = NULL); review/approval use current step
  v_target_step := CASE WHEN p_deadline_type = 'submission' THEN NULL ELSE v_current_step END;

  -- LEVEL 1a: per-user SWA assignment
  SELECT due_at INTO v_result
  FROM   public.section_workflow_assignments
  WHERE  section_id = p_section_id
    AND  workflow_step_id IS NOT DISTINCT FROM v_target_step
    AND  assignee_type = 'USER' AND user_id = p_user_id
    AND  due_at IS NOT NULL
  LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- LEVEL 1b: per-department SWA assignment
  IF v_user_dept IS NOT NULL THEN
    SELECT due_at INTO v_result
    FROM   public.section_workflow_assignments
    WHERE  section_id = p_section_id
      AND  workflow_step_id IS NOT DISTINCT FROM v_target_step
      AND  assignee_type = 'DEPARTMENT' AND department_id = v_user_dept
      AND  due_at IS NOT NULL
    LIMIT 1;
    IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  END IF;

  -- LEVEL 1c: per-role SWA assignment
  IF v_user_role IS NOT NULL THEN
    SELECT due_at INTO v_result
    FROM   public.section_workflow_assignments
    WHERE  section_id = p_section_id
      AND  workflow_step_id IS NOT DISTINCT FROM v_target_step
      AND  assignee_type = 'ROLE' AND role_name = v_user_role
      AND  due_at IS NOT NULL
    LIMIT 1;
    IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  END IF;

  -- LEVEL 2: section-level deadline
  EXECUTE format(
    'SELECT %I FROM public.report_sections WHERE id = $1',
    p_deadline_type || '_deadline'
  ) INTO v_result USING p_section_id;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- LEVEL 3: report-department deadline
  IF v_user_dept IS NOT NULL THEN
    EXECUTE format(
      'SELECT %I FROM public.report_department_deadlines WHERE report_id = $1 AND department_id = $2',
      p_deadline_type || '_deadline'
    ) INTO v_result USING v_report_id, v_user_dept;
    IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  END IF;

  -- LEVEL 4: report-level deadline
  EXECUTE format(
    'SELECT %I FROM public.reports WHERE id = $1',
    p_deadline_type || '_deadline'
  ) INTO v_result USING v_report_id;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- LEVEL 5: cycle-wide ultimate fallback
  EXECUTE format(
    'SELECT %I FROM public.reporting_cycles WHERE id = $1',
    p_deadline_type || '_deadline'
  ) INTO v_result USING v_cycle_id;

  RETURN v_result;
END;
$$;


-- =============================================================================
-- 15. VIEW: effective_section_write_access
--     All users with WRITE (authoring) access, resolved from SWA rows where
--     workflow_step_id IS NULL.
--     Role matching: users → user_roles → roles (no direct role column on users).
-- =============================================================================
CREATE OR REPLACE VIEW public.effective_section_write_access AS
SELECT swa.section_id, swa.user_id, 'USER'::text AS source
FROM   public.section_workflow_assignments swa
WHERE  swa.assignee_type = 'USER'
  AND  swa.workflow_step_id IS NULL
  AND  swa.completed_at IS NULL

UNION

SELECT swa.section_id, u.id AS user_id, 'DEPARTMENT'::text AS source
FROM   public.section_workflow_assignments swa
JOIN   public.users u ON u.department_id = swa.department_id
WHERE  swa.assignee_type = 'DEPARTMENT'
  AND  swa.workflow_step_id IS NULL

UNION

SELECT swa.section_id, u.id AS user_id, 'ROLE'::text AS source
FROM   public.section_workflow_assignments swa
JOIN   public.user_roles ur ON ur.revoked_at IS NULL
JOIN   public.roles       ro ON ro.id = ur.role_id AND ro.name = swa.role_name
JOIN   public.users       u  ON u.id = ur.user_id
WHERE  swa.assignee_type = 'ROLE'
  AND  swa.workflow_step_id IS NULL;


-- =============================================================================
-- 16. VIEW: effective_section_review_access
--     All users with REVIEW access at the section's CURRENT workflow step,
--     including SWA assignments AND workflow_steps default approver fallback.
--     Role matching: users → user_roles → roles (no direct role column on users).
-- =============================================================================
CREATE OR REPLACE VIEW public.effective_section_review_access AS
SELECT rs.id AS section_id, swa.user_id, 'USER'::text AS source, swa.workflow_step_id
FROM   public.report_sections rs
JOIN   public.section_workflow_assignments swa
  ON   swa.section_id = rs.id AND swa.workflow_step_id = rs.current_step_id
WHERE  swa.assignee_type = 'USER'

UNION

SELECT rs.id AS section_id, u.id AS user_id, 'DEPARTMENT'::text AS source, swa.workflow_step_id
FROM   public.report_sections rs
JOIN   public.section_workflow_assignments swa
  ON   swa.section_id = rs.id AND swa.workflow_step_id = rs.current_step_id
JOIN   public.users u ON u.department_id = swa.department_id
WHERE  swa.assignee_type = 'DEPARTMENT'

UNION

SELECT rs.id AS section_id, u.id AS user_id, 'ROLE'::text AS source, swa.workflow_step_id
FROM   public.report_sections rs
JOIN   public.section_workflow_assignments swa
  ON   swa.section_id = rs.id AND swa.workflow_step_id = rs.current_step_id
JOIN   public.user_roles ur ON ur.revoked_at IS NULL
JOIN   public.roles       ro ON ro.id = ur.role_id AND ro.name = swa.role_name
JOIN   public.users       u  ON u.id = ur.user_id
WHERE  swa.assignee_type = 'ROLE'

UNION

-- Fallback: the workflow_steps definition (approver_user_id)
SELECT rs.id AS section_id, ws.approver_user_id AS user_id,
       'STEP_DEFAULT_USER'::text AS source, rs.current_step_id
FROM   public.report_sections rs
JOIN   public.workflow_steps ws ON ws.id = rs.current_step_id
WHERE  ws.approver_user_id IS NOT NULL

UNION

-- Fallback: the workflow_steps definition (approver_role → all matching users via user_roles)
SELECT rs.id AS section_id, u.id AS user_id,
       'STEP_DEFAULT_ROLE'::text AS source, rs.current_step_id
FROM   public.report_sections rs
JOIN   public.workflow_steps ws ON ws.id = rs.current_step_id
JOIN   public.user_roles ur ON ur.revoked_at IS NULL
JOIN   public.roles       ro ON ro.id = ur.role_id AND ro.name = ws.approver_role
JOIN   public.users       u  ON u.id = ur.user_id
WHERE  ws.approver_role IS NOT NULL;


-- =============================================================================
-- 17. UPDATE stamp_template_to_report (new version: no data_source_id from template)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.stamp_template_to_report(
  p_report_id   UUID,
  p_template_id UUID,
  p_created_by  UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count          INTEGER := 0;
  ts               RECORD;
  tb               RECORD;
  v_new_section_id UUID;
  v_id_map         JSONB := '{}';
  v_parent_id      UUID;
BEGIN
  FOR ts IN
    WITH RECURSIVE ordered AS (
      SELECT *, 0 AS depth FROM public.template_sections
      WHERE template_id = p_template_id AND parent_id IS NULL
      UNION ALL
      SELECT ts2.*, o.depth + 1 FROM public.template_sections ts2
      JOIN ordered o ON ts2.parent_id = o.id
      WHERE ts2.template_id = p_template_id
    )
    SELECT * FROM ordered ORDER BY depth, order_index
  LOOP
    v_parent_id := NULL;
    IF ts.parent_id IS NOT NULL THEN
      v_parent_id := (v_id_map ->> ts.parent_id::text)::uuid;
    END IF;

    INSERT INTO public.report_sections (
      report_id, parent_id, source_template_section_id,
      title, description, order_index,
      workflow_template_id, status, created_by
    ) VALUES (
      p_report_id, v_parent_id, ts.id,
      ts.title, ts.description, ts.order_index,
      ts.workflow_template_id, 'NOT_STARTED', p_created_by
    ) RETURNING id INTO v_new_section_id;

    v_id_map := v_id_map || jsonb_build_object(ts.id::text, v_new_section_id::text);
    v_count  := v_count + 1;

    FOR tb IN
      SELECT * FROM public.template_blocks
      WHERE template_section_id = ts.id ORDER BY order_index
    LOOP
      INSERT INTO public.section_blocks (
        section_id, source_template_block_id,
        block_type, order_index, content, is_required, created_by
      ) VALUES (
        v_new_section_id, tb.id,
        tb.block_type, tb.order_index, tb.default_content,
        tb.is_required, p_created_by
      );
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;


-- =============================================================================
-- 18. UPDATE rebalance_section_order (gaps of 10 for INTEGER order_index)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rebalance_section_order(p_report_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.report_sections AS s
  SET order_index = ranked.new_index, updated_at = NOW()
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY report_id, parent_id ORDER BY order_index
           ) * 10 AS new_index
    FROM public.report_sections
    WHERE report_id = p_report_id AND deleted_at IS NULL
  ) ranked
  WHERE s.id = ranked.id;
END;
$$;
