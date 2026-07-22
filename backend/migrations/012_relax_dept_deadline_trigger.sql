-- Migration 012: Remove the cycle start_date..end_date bounds check from the
-- report_department_deadlines trigger.
--
-- Rationale: Deadlines naturally extend beyond the reporting period end date
-- (e.g. a June cycle can have July deadlines). We keep the rule that dept
-- deadlines must not EXCEED the cycle-level deadline ceilings.

CREATE OR REPLACE FUNCTION public.validate_report_dept_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cycle_submission TIMESTAMPTZ;
  v_cycle_review     TIMESTAMPTZ;
  v_cycle_approval   TIMESTAMPTZ;
BEGIN
  SELECT rc.submission_deadline, rc.review_deadline, rc.approval_deadline
  INTO   v_cycle_submission, v_cycle_review, v_cycle_approval
  FROM   public.reports r
  JOIN   public.reporting_cycles rc ON rc.id = r.cycle_id
  WHERE  r.id = NEW.report_id;

  -- If the report has no cycle, skip validation
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.submission_deadline IS NOT NULL
     AND v_cycle_submission IS NOT NULL
     AND NEW.submission_deadline > v_cycle_submission THEN
    RAISE EXCEPTION 'submission_deadline (%) cannot exceed cycle submission_deadline (%)',
      NEW.submission_deadline, v_cycle_submission
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_deadline IS NOT NULL
     AND v_cycle_review IS NOT NULL
     AND NEW.review_deadline > v_cycle_review THEN
    RAISE EXCEPTION 'review_deadline (%) cannot exceed cycle review_deadline (%)',
      NEW.review_deadline, v_cycle_review
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.approval_deadline IS NOT NULL
     AND v_cycle_approval IS NOT NULL
     AND NEW.approval_deadline > v_cycle_approval THEN
    RAISE EXCEPTION 'approval_deadline (%) cannot exceed cycle approval_deadline (%)',
      NEW.approval_deadline, v_cycle_approval
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
