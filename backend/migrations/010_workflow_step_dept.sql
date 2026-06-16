-- =============================================================================
-- 010_workflow_step_dept.sql
-- Adds approver_department_id to workflow_steps so a step can target
-- "role X within department Y" rather than institution-wide.
-- If NULL, the role applies across the whole institution (original behaviour).
-- =============================================================================

ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS approver_department_id UUID
    REFERENCES public.departments(department_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wf_steps_dept
  ON public.workflow_steps (approver_department_id)
  WHERE approver_department_id IS NOT NULL;
