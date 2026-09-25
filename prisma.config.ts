import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    // react-server condition: lets the seed import server-only modules (db, services) outside Next.js.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Read lazily so `prisma generate` works without a database (e.g. in CI installs).
    url: process.env.DATABASE_URL ?? "",
  },
});
