import { execSync } from "node:child_process";

/** Creates the per-role e2e users (needs a seeded database). Skipped when the seed admin isn't configured. */
export default function globalSetup() {
  if (!process.env.SEED_ADMIN_EMAIL) return;
  execSync("npx tsx --conditions=react-server tests/e2e/fixtures/create-users.ts", {
    stdio: "inherit",
    // Invitation emails are captured in memory by the fixture script (never sent).
    env: { ...process.env, NODE_ENV: "test", EMAIL_TRANSPORT: "memory" },
  });
}
