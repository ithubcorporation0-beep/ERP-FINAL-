import { execSync } from "node:child_process";

/** Refuses to touch any database whose name does not contain "test" — protects dev/production data. */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run integration tests against "${name}": the database name must contain "test".`,
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  }
  return url;
}

/** Runs once before all integration tests: applies every migration to the test database. */
export default function setup() {
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL);
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
