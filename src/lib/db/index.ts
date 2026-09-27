import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";
import { tenantGuard } from "./tenant-guard";

function createClient() {
  const env = getServerEnv();
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }).$extends(tenantGuard);
}

export type Database = ReturnType<typeof createClient>;

/**
 * The shared client or a transaction client from `db.$transaction(async (tx) => …)`. Both carry the tenant guard.
 * Repositories accept this as their optional last argument.
 */
export type DbClient = Omit<Database, ITXClientDenyList>;

declare global {
  // Development only: survives hot reloads so each reload doesn't open a new connection pool.
  var __erpPrisma: Database | undefined;
}

/**
 * The shared database client. Queries on company-owned tables must be scoped by companyId — the tenant guard
 * rejects anything else (see ./tenant-guard.ts). Reuses one client across hot reloads in development.
 */
export const db: Database = globalThis.__erpPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalThis.__erpPrisma = db;

export { crossTenant, TenantScopeError } from "./tenant-guard";
