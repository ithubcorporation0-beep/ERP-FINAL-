import { expect, test, type Page } from "@playwright/test";

// Uses the admin created by `npm run db:seed` (same env vars). Skipped when they are not set.
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
test.skip(
  !email || !password,
  "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (and seed the database) to run.",
);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar navigation, breadcrumbs and active link", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();

    await nav.getByRole("link", { name: "Finance" }).click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Finance" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText("Finance");
  });

  test("global search opens with Ctrl+K and navigates", async ({ page }) => {
    await signIn(page);
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Search pages…").fill("payroll");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/payroll$/);
  });

  test("user menu signs out", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("menu opens, navigates and closes; no horizontal scrolling", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("link", { name: "HR" }).click();
    await expect(page).toHaveURL(/\/hr$/);
    await expect(sheet).toBeHidden();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
