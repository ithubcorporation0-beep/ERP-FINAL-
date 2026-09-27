import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { memoryOutbox } from "@/lib/email";
import { rawDb } from "../integration/raw-db";

// Every table, children first. Kept explicit so a new table is a conscious addition.
const TABLES = [
  "audit_logs",
  "auth_tokens",
  "notifications",
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
