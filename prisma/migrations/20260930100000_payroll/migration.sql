-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('ALLOWANCE', 'DEDUCTION', 'TAX');

-- CreateEnum
CREATE TYPE "SalaryAdvanceStatus" AS ENUM ('OUTSTANDING', 'RECOVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advances" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "advance_date" DATE NOT NULL,
    "payment_method" "payment_method" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SalaryAdvanceStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "recovered_run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "salary_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "active_period" VARCHAR(7),
    "pay_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "review_note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "paid_at" DATE,
    "paid_method" "payment_method",
    "paid_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_number" INTEGER NOT NULL,
    "employee_name" TEXT NOT NULL,
    "department_name" TEXT,
    "position" TEXT,
    "basic" DECIMAL(18,2) NOT NULL,
    "allowances" DECIMAL(18,2) NOT NULL,
    "bonus" DECIMAL(18,2) NOT NULL,
    "overtime" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "advances" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "partial_period" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_components_company_id_employee_id_idx" ON "salary_components"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "salary_advances_company_id_employee_id_status_idx" ON "salary_advances"("company_id", "employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_advances_company_id_number_key" ON "salary_advances"("company_id", "number");

-- CreateIndex
CREATE INDEX "payroll_runs_company_id_period_year_period_month_idx" ON "payroll_runs"("company_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_company_id_number_key" ON "payroll_runs"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_company_id_active_period_key" ON "payroll_runs"("company_id", "active_period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_id_company_id_key" ON "payroll_runs"("id", "company_id");

-- CreateIndex
CREATE INDEX "payroll_items_company_id_employee_id_idx" ON "payroll_items"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_run_id_employee_id_key" ON "payroll_items"("run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_recovered_run_id_company_id_fkey" FOREIGN KEY ("recovered_run_id", "company_id") REFERENCES "payroll_runs"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_company_id_fkey" FOREIGN KEY ("run_id", "company_id") REFERENCES "payroll_runs"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

