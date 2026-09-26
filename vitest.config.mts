import "dotenv/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` throws outside the Next.js server bundle; tests run server code directly.
  "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only.ts"),
};

// Integration tests use a real PostgreSQL database (never mocks). They run only when
// TEST_DATABASE_URL is set; CI always sets it. See docs/database.md → "Testing".
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.warn("⚠ TEST_DATABASE_URL is not set — skipping integration tests (see docs/database.md).");
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.ts"],
        },
      },
      ...(testDatabaseUrl
        ? [
            {
              extends: true as const,
              test: {
                name: "integration",
                environment: "node",
                include: ["tests/integration/**/*.test.ts"],
                env: {
                  DATABASE_URL: testDatabaseUrl,
                  NODE_ENV: "test",
                  // Emails are captured in memory so tests can follow the links they contain.
                  EMAIL_TRANSPORT: "memory",
                  AUTH_ALLOW_REGISTRATION: "true",
                  APP_URL: "http://localhost:3000",
                },
                globalSetup: ["tests/setup/integration-global.ts"],
                setupFiles: ["tests/setup/integration.ts"],
                // One shared database: run files one at a time.
                fileParallelism: false,
                testTimeout: 30_000,
                hookTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
  },
});
