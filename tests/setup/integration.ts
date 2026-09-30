import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { memoryOutbox } from "@/lib/email";
import { rawDb } from "../integration/raw-db";

// Every table, children first. Kept explicit so a new table is a conscious addition.
const TABLES = [
  "audit_logs",
  "auth_tokens",
  "notifications",
  "task_attachments",
  "tasks",
  "projects",
  "payroll_items",
  "salary_advances",
  "payroll_runs",
  "salary_components",
  "leave_requests",
  "attendance_records",
  "employee_documents",
  "employee_compensations",
  "employees",
  "departments",
  "journal_lines",
  "journal_entries",
  "accounts",
  "expenses",
  "share_links",
  "payments",
  "invoice_items",
  "invoices",
  "quotation_items",
  "quotations",
  "customer_documents",
  "customer_communications",
  "leads",
  "customers",
  "number_sequences",
  "settings",
  "memberships",
  "role_permissions",
  "roles",
  "sessions",
  "permissions",
  "companies",
  "users",
];

// Each test starts from an empty database (the schema itself stays migrated).
beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);
  memoryOutbox.length = 0;
});

afterAll(async () => {
  await Promise.all([db.$disconnect(), rawDb.$disconnect()]);
});
