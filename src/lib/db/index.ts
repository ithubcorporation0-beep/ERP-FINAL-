import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const env = getServerEnv();
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reuse one client across hot reloads in development to avoid exhausting connections.
export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
