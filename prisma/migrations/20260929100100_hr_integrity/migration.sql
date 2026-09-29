-- Phase 09: data rules the database enforces on HR tables (see docs/hr.md).

-- Resigned / terminated employees must have a last working day, not before they joined.
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_exit_date_required"
    CHECK ("status" NOT IN ('RESIGNED', 'TERMINATED') OR "exit_date" IS NOT NULL),
  ADD CONSTRAINT "employees_exit_after_joining"
    CHECK ("exit_date" IS NULL OR "exit_date" >= "joining_date");

ALTER TABLE "employee_compensations"
  ADD CONSTRAINT "employee_compensations_salary_not_negative" CHECK ("salary" IS NULL OR "salary" >= 0);

-- An absent day has no times; a present day has a check-in; check-out is never before check-in.
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_times_match_status"
    CHECK (("status" = 'ABSENT') = ("check_in_at" IS NULL)),
  ADD CONSTRAINT "attendance_records_check_out_after_in"
    CHECK ("check_out_at" IS NULL OR ("check_in_at" IS NOT NULL AND "check_out_at" >= "check_in_at")),
  ADD CONSTRAINT "attendance_records_minutes_not_negative"
    CHECK ("late_minutes" >= 0 AND "early_leave_minutes" >= 0 AND ("worked_minutes" IS NULL OR "worked_minutes" >= 0));

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_dates_ordered" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "leave_requests_days_positive" CHECK ("days" > 0);
