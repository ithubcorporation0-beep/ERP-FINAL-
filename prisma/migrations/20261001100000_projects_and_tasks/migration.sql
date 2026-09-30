-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "customer_id" UUID,
    "manager_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "budget" DECIMAL(18,2),
    "currency" CHAR(3) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "assignee_id" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "start_date" DATE,
    "due_date" DATE,
    "description" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_company_id_deleted_at_status_idx" ON "projects"("company_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "projects_company_id_customer_id_idx" ON "projects"("company_id", "customer_id");

-- CreateIndex
CREATE INDEX "projects_company_id_manager_id_idx" ON "projects"("company_id", "manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_number_key" ON "projects"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_company_id_key" ON "projects"("id", "company_id");

-- CreateIndex
CREATE INDEX "tasks_company_id_project_id_deleted_at_status_idx" ON "tasks"("company_id", "project_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "tasks_company_id_assignee_id_deleted_at_status_idx" ON "tasks"("company_id", "assignee_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "tasks_company_id_due_date_idx" ON "tasks"("company_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_company_id_number_key" ON "tasks"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_company_id_key" ON "tasks"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_attachments_storage_key_key" ON "task_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "task_attachments_company_id_task_id_created_at_idx" ON "task_attachments"("company_id", "task_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_company_id_fkey" FOREIGN KEY ("manager_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_company_id_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_company_id_fkey" FOREIGN KEY ("assignee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_company_id_fkey" FOREIGN KEY ("task_id", "company_id") REFERENCES "tasks"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

