import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_OTHER_COMPANY, E2E_PASSWORD, E2E_USERS } from "./users";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
test.skip(!adminEmail || !adminPassword, "Needs a seeded database (SEED_ADMIN_*).");

async function signedIn(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

const figures = (page: Page) => page.getByRole("region", { name: "Key figures" });

test("Super Admin sees every widget; modules not built yet say so instead of showing numbers", async ({
  browser,
}) => {
  const page = await signedIn(browser, adminEmail, adminPassword);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

  for (const label of ["Total revenue", "Net profit", "Total customers", "Low stock items"]) {
    await expect(figures(page).getByText(label, { exact: true })).toBeVisible();
  }
  await expect(figures(page).getByText(/Not tracked yet/)).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Customer growth" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revenue vs expenses" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create invoice/ })).toBeDisabled();
});

test("date filter is kept in the URL and reloads the figures", async ({ browser }) => {
  const page = await signedIn(browser, adminEmail, adminPassword);
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "Date range" }).click();
  await page.getByRole("option", { name: "Last 12 months" }).click();
  await expect(page).toHaveURL(/range=last-12-months/);
  await expect(figures(page).getByText(/new · last 12 months/)).toBeVisible();

  // An invalid value from a hand-edited URL falls back to the default instead of failing.
  await page.goto("/dashboard?range=forever");
  await expect(figures(page).getByText(/new · last 6 months/)).toBeVisible();
});

test("a new customer shows up in the figures and the activity feed", async ({ browser }) => {
  const page = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const name = `Dashboard customer ${Date.now()}`;
  const created = await page.request.post("/api/customers", { data: { name } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await page.request.delete(`/api/customers/${id}`);
});

test("widgets follow permissions: an Employee sees no company-wide money or customer figures", async ({
  browser,
}) => {
  const page = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await page.goto("/dashboard");
  await expect(figures(page).getByText("Active projects", { exact: true })).toBeVisible();
  await expect(figures(page).getByText("Pending tasks", { exact: true })).toBeVisible();
  for (const hidden of [
    "Total revenue",
    "Total expenses",
    "Net profit",
    "Total customers",
    "Total employees",
  ]) {
    await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Customer growth" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add customer/ })).toHaveCount(0);
});

test("an Accountant sees finance figures but not HR figures", async ({ browser }) => {
  const page = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await page.goto("/dashboard");
  await expect(figures(page).getByText("Total revenue", { exact: true })).toBeVisible();
  await expect(figures(page).getByText("Total customers", { exact: true })).toBeVisible();
  await expect(page.getByText("Total employees", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Employee attendance" })).toHaveCount(0);
});
