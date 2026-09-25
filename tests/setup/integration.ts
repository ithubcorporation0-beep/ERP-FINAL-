import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

// Every table, children first. Kept explicit so a new table is a conscious addition.
const TABLES = [
  "audit_logs",
  "notifications",
  "customers",
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
});

afterAll(async () => {
  await db.$disconnect();
});
