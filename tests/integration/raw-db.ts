import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Unguarded client for TEST ASSERTIONS ONLY: inspects the database directly (e.g. "no row changed in company B"),
 * bypassing the tenant guard that the application's `db` enforces. Never import this from src/.
 */
export const rawDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
