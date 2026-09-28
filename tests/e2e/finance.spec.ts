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

async function choose(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test("employee submits an expense, an approver approves it, and it is posted to the ledger", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const vendor = `Vendor E2E ${Date.now()}`;
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/finance/expenses/new");
  await choose(employee, "Category", "Transportation");
  await employee.getByLabel(/^Amount/).fill("42.50");
  await employee.getByLabel("Vendor").fill(vendor);
  await choose(employee, "Payment method", "Cash");
  await employee.getByLabel("Description").fill("Taxi to client meeting");
  // Employees file for themselves only: no employee picker.
  await expect(employee.getByRole("combobox", { name: "Employee" })).toHaveCount(0);
  await employee.getByRole("button", { name: "Submit expense" }).click();
  await expect(employee.getByRole("heading", { name: /^Expense EXP-\d{4}$/, level: 1 })).toBeVisible();
  await expect(employee.getByText("Pending approval", { exact: true })).toBeVisible();
  // No approve button for the submitter, and no ledger section.
  await expect(employee.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(employee.getByRole("heading", { name: "Accounting" })).toHaveCount(0);
  const expenseUrl = employee.url();
  const expenseId = expenseUrl.split("/").at(-1) ?? "";
  // The server refuses the approval too, not just the UI.
  expect((await employee.request.get("/api/accounting")).status()).toBe(403);

  const admin = await signedIn(browser, adminEmail, adminPassword);
  await admin.goto(`/finance/expenses/${expenseId}`);
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved", { exact: true }).first()).toBeVisible();
  const posting = admin.getByRole("link", { name: /^JE-\d{4}$/ });
  await expect(posting).toBeVisible();
  await posting.click();
  await expect(admin.getByRole("heading", { name: /^Transaction JE-\d{4}$/, level: 1 })).toBeVisible();
  await expect(admin.getByRole("row", { name: /Transportation.*\$42\.50/ })).toBeVisible();
  await expect(admin.getByRole("row", { name: /Cash.*\$42\.50/ })).toBeVisible();
  // Automatic postings can't be reversed by hand.
  await expect(admin.getByRole("button", { name: "Reverse" })).toHaveCount(0);

  // The accountant sees it in the expense report and in the P&L.
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/finance/reports/expenses?range=last-12-months");
  await expect(accountant.getByRole("row", { name: new RegExp(vendor) })).toBeVisible();
  await accountant.goto("/finance/reports/profit-and-loss?range=last-12-months");
  await expect(accountant.getByRole("heading", { name: "Profit & Loss", level: 1 })).toBeVisible();
  await expect(accountant.getByRole("row", { name: /Transportation/ })).toBeVisible();
  await accountant.goto("/finance/reports/balance-sheet");
  await expect(accountant.getByText("Balanced", { exact: true })).toBeVisible();
});

test("a manual transaction must balance; balanced ones post and can be reversed", async ({ browser }) => {
  test.setTimeout(90_000);
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/finance/transactions/new");
  await accountant.getByLabel("Description").fill(`Owner deposit ${Date.now()}`);
  await choose(accountant, "Line 1 account", /^1010 Bank$/);
  await accountant.getByLabel("Debit").first().fill("0.1");
  await choose(accountant, "Line 2 account", /^3000 Owner's Equity$/);
  await accountant.getByLabel("Credit").nth(1).fill("0.2");
  await expect(accountant.getByText("Total debits must equal total credits.")).toBeVisible();

  // The server refuses it as well (the UI check is only a convenience).
  const accounts: { id: string; code: string }[] = await (
    await accountant.request.get("/api/accounting")
  ).json();
  const bank = accounts.find((account) => account.code === "1010")?.id;
  const equity = accounts.find((account) => account.code === "3000")?.id;
  const refused = await accountant.request.post("/api/accounting/transactions", {
    data: {
      type: "INCOME",
      entryDate: "2026-09-01",
      description: "Unbalanced",
      lines: [
        { accountId: bank, debit: "100", credit: "" },
        { accountId: equity, debit: "", credit: "99.99" },
      ],
    },
  });
  expect(refused.status()).toBe(422);

  // 0.1 + 0.2 = 0.30 exactly.
  await accountant.getByRole("button", { name: "Add line" }).click();
  await choose(accountant, "Line 3 account", /^1010 Bank$/);
  await accountant.getByLabel("Debit").nth(2).fill("0.2");
  await accountant.getByLabel("Credit").nth(1).fill("0.30");
  await expect(accountant.getByText("Balanced — ready to post.")).toBeVisible();
  await accountant.getByRole("button", { name: "Post transaction" }).click();
  await expect(accountant.getByRole("heading", { name: /^Transaction JE-\d{4}$/, level: 1 })).toBeVisible();

  await accountant.getByRole("button", { name: "Reverse" }).click();
  await accountant.getByRole("alertdialog").getByRole("button", { name: "Post reversal" }).click();
  await expect(accountant.getByRole("link", { name: "Reverses the original transaction" })).toBeVisible();
});

test("permissions: employees see only their own expenses and no accounting", async ({ browser }) => {
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  for (const path of ["/finance/accounts", "/finance/transactions", "/finance/reports/profit-and-loss"]) {
    await employee.goto(path);
    await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  }
  expect((await employee.request.get("/api/accounting/transactions")).status()).toBe(403);
  expect((await employee.request.get("/api/accounting/reports/balance-sheet")).status()).toBe(403);
  await expect(employee.getByRole("link", { name: "Accounts" })).toHaveCount(0);

  const list = await (await employee.request.get("/api/expenses?pageSize=100")).json();
  for (const item of list.items as { employee: { name: string } | null }[]) {
    expect(item.employee?.name).toBe(E2E_USERS.employee.name);
  }
});

test("tenant isolation: another company's expenses and transactions are not found", async ({ browser }) => {
  const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const created = await ownerB.request.post("/api/expenses", {
    data: {
      category: "RENT",
      amount: "900",
      expenseDate: "2026-09-01",
      vendor: "B landlord",
      paymentMethod: "BANK_TRANSFER",
      description: "B only",
    },
  });
  expect(created.status()).toBe(201);
  const expense = await created.json();
  const accounts: { id: string }[] = await (await ownerB.request.get("/api/accounting")).json();

  const ownerA = await signedIn(browser, adminEmail, adminPassword);
  await ownerA.goto(`/finance/expenses/${expense.id}`);
  await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await ownerA.goto(`/finance/accounts/${accounts[0]?.id}`);
  await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await ownerA.request.get(`/api/expenses/${expense.id}`)).status()).toBe(404);
  expect((await ownerA.request.delete(`/api/expenses/${expense.id}`)).status()).toBe(404);
  // A can't post to B's accounts.
  const foreign = await ownerA.request.post("/api/accounting/transactions", {
    data: {
      type: "INCOME",
      entryDate: "2026-09-01",
      description: "Cross-tenant",
      lines: [
        { accountId: accounts[0]?.id, debit: "1", credit: "" },
        { accountId: accounts[1]?.id, debit: "", credit: "1" },
      ],
    },
  });
  expect(foreign.status()).toBe(422);
});
