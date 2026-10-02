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

/** A month far in the future, different on every run (a month can only be processed once). */
function uniqueMonth(): string {
  const seconds = Math.floor(Date.now() / 1000);
  return `${2100 + (seconds % 800)}-${String((Math.floor(seconds / 800) % 12) + 1).padStart(2, "0")}`;
}

test("process → adjust → submit → approve (by someone else) → pay, with a salary slip", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const hr = await signedIn(browser, E2E_USERS.admin.email, E2E_PASSWORD);
  const name = `Payroll E2E ${Date.now()}`;
  const created = await hr.request.post("/api/employees", { data: { name, joiningDate: "2026-01-05" } });
  expect(created.status()).toBe(201);
  const employee = await created.json();
  expect(
    (
      await hr.request.put(`/api/employees/${employee.id}/compensation`, { data: { salary: "50000" } })
    ).status(),
  ).toBe(204);
  expect(
    (
      await hr.request.post(`/api/employees/${employee.id}/salary-structure`, {
        data: { kind: "TAX", name: "Income tax", amount: "2500.25" },
      })
    ).status(),
  ).toBe(201);

  // Salary structure on the profile.
  await hr.goto(`/hr/employees/${employee.id}`);
  await hr.getByRole("tab", { name: "Salary & bank" }).click();
  await expect(hr.getByRole("cell", { name: "Income tax", exact: true })).toBeVisible();

  // Process a month.
  const month = uniqueMonth();
  await hr.goto("/payroll/runs/new");
  // Fill until the values stick (typing before the page is interactive would be reset by hydration).
  await expect(async () => {
    await hr.getByLabel("Payroll month").fill(month);
    await hr.getByLabel("Pay date").fill(`${month}-28`);
    await expect(hr.getByLabel("Payroll month")).toHaveValue(month, { timeout: 500 });
    await expect(hr.getByLabel("Pay date")).toHaveValue(`${month}-28`, { timeout: 500 });
  }).toPass();
  await hr.getByRole("button", { name: "Process payroll" }).click();
  await expect(hr.getByRole("heading", { name: /^Payroll PRL-\d{4}$/, level: 1 })).toBeVisible();
  const runUrl = hr.url();
  const runId = runUrl.split("/").at(-1) ?? "";

  // Adjust this employee's payslip: bonus 1000.10 → net 50000 + 1000.10 − 2500.25 = 48499.85 (live preview).
  await hr.getByRole("button", { name: `Adjust payslip of ${name}` }).click();
  const dialog = hr.getByRole("dialog");
  await dialog.getByLabel("Bonus").fill("1000.10");
  await expect(dialog.getByText("$48,499.85")).toBeVisible();
  await dialog.getByRole("button", { name: "Save payslip" }).click();
  await expect(hr.getByRole("row", { name: new RegExp(`${name}.*\\$48,499\\.85`) })).toBeVisible();

  // The same month can't be processed twice.
  const again = await hr.request.post("/api/payroll", { data: { period: month, payDate: `${month}-28` } });
  expect(again.status()).toBe(409);

  await hr.getByRole("button", { name: "Submit for approval" }).click();
  await hr.getByRole("alertdialog").getByRole("button", { name: "Submit" }).click();
  await expect(hr.getByText("Waiting for approval").first()).toBeVisible();
  // The person who processed it can't approve it.
  await expect(hr.getByRole("button", { name: "Approve" })).toHaveCount(0);
  expect(
    (await hr.request.post(`/api/payroll/${runId}/status`, { data: { action: "approve" } })).status(),
  ).toBe(403);

  const approver = await signedIn(browser, adminEmail, adminPassword);
  await approver.goto(runUrl);
  await approver.getByRole("button", { name: "Approve" }).click();
  await approver.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(approver.getByText("Approved").first()).toBeVisible();

  // The accountant pays it (posts to the ledger).
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto(runUrl);
  await accountant.getByRole("button", { name: "Mark as paid" }).click();
  await accountant.getByRole("dialog").getByRole("button", { name: "Mark as paid" }).click();
  await expect(accountant.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(accountant.getByRole("link", { name: /^JE-\d{4}$/ })).toBeVisible();

  // Salary slip PDF.
  const detail = await (await accountant.request.get(`/api/payroll/${runId}`)).json();
  const item = (detail.items as { id: string; employeeName: string }[]).find(
    (row) => row.employeeName === name,
  );
  const slip = await accountant.request.get(`/api/payroll/${runId}/items/${item?.id}/slip`);
  expect(slip.headers()["content-type"]).toBe("application/pdf");
  expect((await slip.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Payroll history on the employee profile.
  await approver.goto(`/hr/employees/${employee.id}`);
  await approver.getByRole("tab", { name: /Payroll/ }).click();
  await expect(approver.getByText("$48,499.85")).toBeVisible();
});

test("permissions: salary data stays hidden from employees and managers", async ({ browser }) => {
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  for (const path of ["/payroll/runs", "/payroll/advances", "/payroll/reports"]) {
    await employee.goto(path);
    await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  }
  expect((await employee.request.get("/api/payroll")).status()).toBe(403);
  expect((await employee.request.get("/api/payroll/report")).status()).toBe(403);
  await expect(employee.getByRole("link", { name: "Payroll runs" })).toHaveCount(0);

  // The accountant can see payroll but can't process it or change salary structures.
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/payroll/runs");
  await expect(accountant.getByRole("heading", { name: "Payroll runs", level: 1 })).toBeVisible();
  await expect(accountant.getByRole("link", { name: "Process payroll" })).toHaveCount(0);
  expect(
    (
      await accountant.request.post("/api/payroll", { data: { period: "2099-01", payDate: "2099-01-31" } })
    ).status(),
  ).toBe(403);
});

test("tenant isolation: another company's payroll is not found", async ({ browser }) => {
  const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const employee = await (
    await ownerB.request.post("/api/employees", {
      data: { name: `B payee ${Date.now()}`, joiningDate: "2026-01-05" },
    })
  ).json();
  await ownerB.request.put(`/api/employees/${employee.id}/compensation`, { data: { salary: "1000" } });
  const month = uniqueMonth();
  const processed = await ownerB.request.post("/api/payroll", {
    data: { period: month, payDate: `${month}-28` },
  });
  expect(processed.status()).toBe(201);
  const { run } = await processed.json();

  const ownerA = await signedIn(browser, adminEmail, adminPassword);
  await ownerA.goto(`/payroll/runs/${run.id}`);
  await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await ownerA.request.get(`/api/payroll/${run.id}`)).status()).toBe(404);
  expect(
    (await ownerA.request.post(`/api/payroll/${run.id}/status`, { data: { action: "submit" } })).status(),
  ).toBe(404);
  expect((await ownerA.request.get(`/api/employees/${employee.id}/salary-structure`)).status()).toBe(404);
});
