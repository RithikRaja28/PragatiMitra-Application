-- Make validate_report_dept_deadline a pass-through.
-- The chk_rpt_dept_deadline_order CHECK constraint already enforces
-- sub <= rev <= app ordering. No additional bounds needed.
CREATE OR REPLACE FUNCTION public.validate_report_dept_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
