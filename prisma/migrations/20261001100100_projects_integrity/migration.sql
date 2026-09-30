-- Phase 11: project and task rules the database enforces (see docs/projects.md).

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dates_ordered" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date"),
  ADD CONSTRAINT "projects_budget_not_negative" CHECK ("budget" IS NULL OR "budget" >= 0),
  ADD CONSTRAINT "projects_completed_at_matches_status" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_dates_ordered" CHECK ("start_date" IS NULL OR "due_date" IS NULL OR "due_date" >= "start_date"),
  ADD CONSTRAINT "tasks_completed_at_matches_status" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));
