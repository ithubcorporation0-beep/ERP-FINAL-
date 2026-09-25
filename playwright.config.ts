import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: use an already-installed Chromium instead of `npx playwright install`.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
      },
    },
  ],
  webServer: {
    // CI tests the production build; locally the dev server is reused if already running.
    command: process.env.CI ? `npm run start -- --port ${PORT}` : `npm run dev -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
