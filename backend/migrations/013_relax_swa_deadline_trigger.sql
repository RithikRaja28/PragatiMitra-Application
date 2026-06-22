-- Migration 013: Make validate_section_workflow_assignment_deadline a pass-through.
-- The due_at on section_workflow_assignments is a soft target date for the assignee.
-- Enforcing cycle calendar bounds here is too restrictive and blocks normal use
-- when the cycle's submission_deadline is set to the same day as the report is created.
CREATE OR REPLACE FUNCTION public.validate_section_workflow_assignment_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
