/**
 * Seed = system data only, never fake business data:
 *   1. syncs the permission catalogue,
 *   2. creates (or updates) the first company, its built-in roles and its Owner account.
 * Idempotent — safe to run on every deploy. Run with `npm run db:seed`.
 */
import "dotenv/config";
import { z } from "zod";
import { db } from "@/lib/db";
import { companyService } from "@/server/services/company.service";

const seedEnv = z.object({
  SEED_COMPANY_NAME: z.string().trim().min(2).default("IT Hub"),
  SEED_ADMIN_NAME: z.string().trim().min(2).default("Administrator"),
  SEED_ADMIN_EMAIL: z.email("SEED_ADMIN_EMAIL must be an email address"),
  SEED_ADMIN_PASSWORD: z.string().min(12, "SEED_ADMIN_PASSWORD must be at least 12 characters"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const parsed = seedEnv.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Cannot seed:\n${problems.join("\n")}\nSee .env.example.`);
  }
  const env = parsed.data;

  const result = await companyService.bootstrap({
    company: { name: env.SEED_COMPANY_NAME, slug: slugify(env.SEED_COMPANY_NAME) },
    owner: { email: env.SEED_ADMIN_EMAIL, name: env.SEED_ADMIN_NAME, password: env.SEED_ADMIN_PASSWORD },
  });

  console.log(
    `Seed complete — company "${result.company.name}" (${result.createdCompany ? "created" : "already existed"}), ` +
      `owner ${env.SEED_ADMIN_EMAIL.toLowerCase()} (${result.createdOwner ? "created" : "already existed"}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
