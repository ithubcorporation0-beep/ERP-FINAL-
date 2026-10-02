import { expect, test, type Browser, type Page } from "@playwright/test";
import { choose } from "./helpers";
import { E2E_PASSWORD, E2E_USERS } from "./users";

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

test("a new customer notifies the accountant: bell, notification center, read state", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  const name = `Notified ${Date.now()}`;
  const created = await admin.request.post("/api/customers", { data: { name } });
  expect(created.status()).toBe(201);
  const title = `New customer: ${name}`;

  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/dashboard");
  const bell = accountant.getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const dropdown = accountant.getByRole("list", { name: "Latest notifications" });
  await expect(dropdown.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await accountant.getByRole("link", { name: "See all notifications" }).click();

  // Notification center: mark read and unread, then open it.
  await expect(accountant.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  const list = accountant.getByRole("list", { name: "Notifications" });
  await list.getByRole("button", { name: `Mark “${title}” as read` }).click();
  await expect(list.getByRole("button", { name: `Mark “${title}” as unread` })).toBeVisible();
  await list.getByRole("button", { name: `Mark “${title}” as unread` }).click();
  await expect(list.getByRole("button", { name: `Mark “${title}” as read` })).toBeVisible();

  await choose(accountant, "Types", "New customer");
  await expect(accountant).toHaveURL(/type=customer\.created/);
  await list.getByRole("button", { name: title, exact: true }).click();
  await expect(accountant.getByRole("heading", { name, level: 1 })).toBeVisible();

  // The admin created it, so the admin isn't notified about it.
  const mine = await (await admin.request.get("/api/notifications?type=customer.created")).json();
  expect((mine.items as { title: string }[]).some((item) => item.title === title)).toBe(false);
});

test("users choose their notification channels", async ({ browser }) => {
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/notifications/preferences");
  await expect(employee.getByRole("heading", { name: "Notification settings", level: 1 })).toBeVisible();
  const email = employee.getByRole("checkbox", { name: "Task deadline by email" });
  const wasChecked = await email.isChecked();
  await email.click();
  await employee.getByRole("button", { name: "Save settings" }).click();
  await expect(employee.getByText(/saved/i).first()).toBeVisible();
  await employee.reload();
  await expect(employee.getByRole("checkbox", { name: "Task deadline by email" })).toBeChecked({
    checked: !wasChecked,
  });
  // WhatsApp and SMS are not offered yet.
  await expect(employee.getByText("Coming later").first()).toBeVisible();

  // Only known types are accepted.
  const response = await employee.request.put("/api/notifications/preferences", {
    data: { preferences: [{ type: "sms.sent", inApp: true, email: true }] },
  });
  expect(response.status()).toBe(422);
});

test("the audit log is searchable, filterable and exportable for authorized users only", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  const name = `Audited ${Date.now()}`;
  const created = await admin.request.post("/api/customers", { data: { name } });
  const customerId: string = (await created.json()).id;

  await admin.goto("/audit-logs");
  await expect(admin.getByRole("heading", { name: "Audit Logs", level: 1 })).toBeVisible();
  await admin.getByRole("searchbox", { name: "Search the audit log" }).fill(customerId);
  await expect(admin).toHaveURL(new RegExp(`search=${customerId}`));
  const table = admin.getByRole("table", { name: "Audit log" });
  await expect(table.getByRole("cell", { name: new RegExp(customerId) })).toBeVisible();
  await choose(admin, "Areas", "Customers");
  await expect(admin).toHaveURL(/action=customer/);
  await table.getByRole("link", { name: "Create" }).first().click();
  await expect(admin.getByRole("heading", { name: "Customers: Create", level: 1 })).toBeVisible();
  await expect(admin.getByText(name).first()).toBeVisible();

  const csv = await admin.request.get(`/api/audit-logs/export?search=${customerId}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(`customer.create,Customer,${customerId}`);

  // Entries can't be changed through the API.
  const entries = await (await admin.request.get(`/api/audit-logs?search=${customerId}`)).json();
  const entryId: string = entries.items[0].id;
  for (const method of ["put", "patch", "delete"] as const) {
    expect((await admin.request[method](`/api/audit-logs/${entryId}`, { data: {} })).status()).toBe(405);
  }

  // Employees have no access.
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/audit-logs");
  await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  expect((await employee.request.get("/api/audit-logs")).status()).toBe(403);
  expect((await employee.request.get("/api/audit-logs/export")).status()).toBe(403);
});

test("the scheduler endpoint is closed without its secret", async ({ request }) => {
  const response = await request.post("/api/cron/notifications", {
    headers: { authorization: "Bearer not-the-secret" },
  });
  // 404 when CRON_SECRET isn't configured, 401 when it is and the secret is wrong.
  expect([401, 404]).toContain(response.status());
});
