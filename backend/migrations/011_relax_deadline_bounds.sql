-- Migration 011: Remove the requirement that submission/review/approval deadlines
-- must fall within start_date..end_date of the reporting cycle.
--
-- Rationale: The reporting *period* (start_date/end_date) describes which academic
-- period is being reported on.  The process deadlines (submission, review, approval)
-- describe when participants must act — these naturally extend beyond the period's
-- end date (e.g. a June-cycle can have a July approval deadline).
-- The existing chk_deadline_order constraint already enforces ordering between
-- deadlines; we just need to drop the BETWEEN start_date AND end_date checks.

ALTER TABLE public.reporting_cycles
  DROP CONSTRAINT IF EXISTS chk_dates;

ALTER TABLE public.reporting_cycles
  ADD CONSTRAINT chk_dates CHECK (start_date <= end_date);
