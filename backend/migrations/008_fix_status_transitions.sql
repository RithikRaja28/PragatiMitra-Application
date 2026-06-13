-- =============================================================================
-- 008_fix_status_transitions.sql
-- Fixes guard_section_status_transition trigger to allow:
--   NOT_STARTED → SUBMITTED  (direct submit without editing first)
--   SENT_BACK   → SUBMITTED  (re-submit after revision)
-- Also aligns UNDER_REVIEW → IN_PROGRESS and SUBMITTED → IN_PROGRESS
-- to match the backend VALID_TRANSITIONS table in sections.js.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_section_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE allowed BOOLEAN := FALSE;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'NOT_STARTED'  THEN NEW.status IN ('IN_PROGRESS', 'SUBMITTED')
    WHEN 'IN_PROGRESS'  THEN NEW.status IN ('SUBMITTED', 'NOT_STARTED')
    WHEN 'SUBMITTED'    THEN NEW.status IN ('UNDER_REVIEW', 'SENT_BACK', 'IN_PROGRESS')
    WHEN 'UNDER_REVIEW' THEN NEW.status IN ('APPROVED', 'SENT_BACK', 'IN_PROGRESS')
    WHEN 'APPROVED'     THEN NEW.status IN ('LOCKED')
    WHEN 'SENT_BACK'    THEN NEW.status IN ('IN_PROGRESS', 'SUBMITTED')
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
