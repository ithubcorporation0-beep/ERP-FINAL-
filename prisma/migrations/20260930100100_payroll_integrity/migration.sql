-- Phase 10: payroll rules the database enforces (see docs/payroll.md).

ALTER TABLE "salary_components"
  ADD CONSTRAINT "salary_components_amount_not_negative" CHECK ("amount" >= 0);

ALTER TABLE "salary_advances"
  ADD CONSTRAINT "salary_advances_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "salary_advances_recovered_has_run" CHECK (("status" = 'RECOVERED') = ("recovered_run_id" IS NOT NULL));

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_month_valid" CHECK ("period_month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "payroll_runs_period_ordered" CHECK ("period_end" >= "period_start"),
  -- A cancelled run releases its month; every other run holds it.
  ADD CONSTRAINT "payroll_runs_active_period" CHECK (
    ("status" = 'CANCELLED' AND "active_period" IS NULL)
    OR ("status" <> 'CANCELLED' AND "active_period" = to_char("period_year", 'FM0000') || '-' || to_char("period_month", 'FM00'))
  ),
  ADD CONSTRAINT "payroll_runs_paid_has_date" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL));

-- The PRD formula, enforced on every row: Net = Basic + Allowances + Bonus + Overtime − Deductions − Tax − Advances.
ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_amounts_not_negative" CHECK (
    "basic" >= 0 AND "allowances" >= 0 AND "bonus" >= 0 AND "overtime" >= 0
    AND "deductions" >= 0 AND "tax" >= 0 AND "advances" >= 0 AND "net" >= 0
  ),
  ADD CONSTRAINT "payroll_items_net_formula" CHECK (
    "net" = "basic" + "allowances" + "bonus" + "overtime" - "deductions" - "tax" - "advances"
  );

-- Items of an approved, paid or cancelled run are frozen (corrections go into a later run).
CREATE FUNCTION payroll_items_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_status "PayrollStatus";
BEGIN
  SELECT status INTO run_status FROM payroll_runs
   WHERE id = COALESCE(NEW.run_id, OLD.run_id) AND company_id = COALESCE(NEW.company_id, OLD.company_id);
  IF run_status IN ('APPROVED', 'PAID', 'CANCELLED') THEN
    RAISE EXCEPTION 'Payroll items of a % run cannot be changed', lower(run_status::text)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER payroll_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON "payroll_items"
  FOR EACH ROW EXECUTE FUNCTION payroll_items_frozen();
