import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { E2E_OTHER_COMPANY, E2E_PASSWORD, E2E_USERS } from "./users";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
test.skip(!adminEmail || !adminPassword, "Needs a seeded database (SEED_ADMIN_*).");

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

async function signedIn(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

/** Drags with intermediate mouse moves, as a person would (a single jump doesn't always start an HTML5 drag). */
async function drag(page: Page, source: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source or target is not visible");
  await page.mouse.move(from.x + 20, from.y + from.height - 8);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + from.height, { steps: 5 });
  await page.mouse.move(to.x + 40, to.y + 60, { steps: 10 });
  await page.mouse.up();
}

async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("customer lifecycle: validate, create, edit, search, note, document, delete", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await signedIn(browser, adminEmail, adminPassword);
  const name = `E2E Customer ${Date.now()}`;

  await page.goto("/crm/customers");
  await page.getByRole("link", { name: "Add customer" }).first().click();
  await expect(page.getByRole("heading", { name: "New customer", level: 1 })).toBeVisible({
    timeout: 30_000,
  });

  // Validation happens before anything is saved.
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Enter the customer's name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Company").fill("Acme Gulf LLC");
  await page.getByLabel("Email").fill("buyer@acme-gulf.test");
  await page.getByLabel("Phone").fill("+971 4 123 4567");
  await page.getByLabel("WhatsApp").fill("+971 50 123 4567");
  await page.getByLabel("City").fill("Dubai");
  await choose(page, "Country", "United Arab Emirates");
  await page.getByLabel("Notes").fill("Key account");
  await page.getByRole("button", { name: "Create customer" }).click();

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText(/^CUS-\d{4} · Acme Gulf LLC$/)).toBeVisible();
  await expect(page.getByText("Key account")).toBeVisible();
  const customerUrl = page.url();

  // Edit
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("City").fill("Abu Dhabi");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Abu Dhabi")).toBeVisible();

  // Communication
  await page.getByRole("tab", { name: /Communication/ }).click();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("Asked for a quote on 20 laptops.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByRole("list", { name: "Communication log" }).getByText("Asked for a quote on 20 laptops."),
  ).toBeVisible();

  // Documents: upload, reject a disguised file, download link, delete with confirmation
  await page.getByRole("tab", { name: /Documents/ }).click();
  await page
    .getByLabel("Choose a document to upload")
    .setInputFiles({ name: "contract.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("list", { name: "Documents" }).getByText("contract.pdf")).toBeVisible();
  await page.getByLabel("Choose a document to upload").setInputFiles({
    name: "evil.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Upload a PDF" })).toBeVisible();
  const download = page.getByRole("link", { name: "Download contract.pdf" });
  const response = await page.request.get((await download.getAttribute("href")) ?? "");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(Buffer.from(await response.body())).toEqual(PDF);
  await page.getByRole("button", { name: "Delete contract.pdf" }).click();
  await page.getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByText("No documents yet")).toBeVisible();

  // History
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel", { name: "History" }).getByText("Changed: city")).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "History" }).getByText("Document deleted", { exact: true }),
  ).toBeVisible();

  // Sales relations are real (empty for a new customer); modules not built yet say so instead of showing rows.
  await page.getByRole("tab", { name: /^Invoices/ }).click();
  await expect(page.getByText("No invoices yet")).toBeVisible();
  await page.getByRole("tab", { name: "Projects" }).click();
  await expect(page.getByText(/Not tracked yet — appears when the Projects module/)).toBeVisible();

  // Search the list by name and by Customer ID
  await page.goto("/crm/customers");
  await page.getByLabel("Search customers").fill(name);
  await expect(page).toHaveURL(/search=/);
  await expect(page.getByRole("link", { name })).toBeVisible();

  // Delete with confirmation
  await page.goto(customerUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete customer" }).click();
  await expect(page).toHaveURL(/\/crm\/customers$/);
  await page.getByLabel("Search customers").fill(name);
  await expect(page.getByText("No matching customers")).toBeVisible();
});

test("lead pipeline: create, move on the board, convert to a customer", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await signedIn(browser, adminEmail, adminPassword);
  const name = `E2E Lead ${Date.now()}`;

  await page.goto("/crm/leads/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Company").fill("Pipeline Co");
  await choose(page, "Source", "Referral");
  await page.getByLabel(/Expected value/).fill("15000");
  await page.getByLabel("Follow-up date").fill("2020-01-15");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("(overdue)")).toBeVisible();

  await page.goto(`/crm/leads/pipeline?search=${encodeURIComponent(name)}`);
  const column = (stage: string) => page.getByRole("listitem", { name: new RegExp(`^${stage}: `) });
  await expect(column("New").getByRole("link", { name })).toBeVisible();

  // Keyboard-friendly move
  await page.getByRole("button", { name: `Move ${name}` }).click();
  await page.getByRole("menuitem", { name: "Qualified" }).click();
  await expect(column("Qualified").getByRole("link", { name })).toBeVisible();
  await expect(column("Qualified")).toHaveAccessibleName("Qualified: 1 leads");
  // Let the move finish saving (and the board re-render) before dragging.
  await expect(page.getByText(`${name} moved to Qualified.`)).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Drag and drop
  await drag(page, column("Qualified").getByRole("listitem", { name }), column("Proposal"));
  await expect(column("Proposal").getByRole("link", { name })).toBeVisible();
  // Saved on the server, not just moved on screen:
  await expect(page.getByText(`${name} moved to Proposal.`)).toBeVisible();
  await page.reload();
  await expect(column("Proposal").getByRole("link", { name })).toBeVisible();

  // Convert
  await column("Proposal").getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Convert to customer" }).click();
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page).toHaveURL(/\/crm\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Converted from")).toBeVisible();
});

test("permissions: Accountant reads customers only; Employee has no CRM access", async ({ browser }) => {
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/crm/customers");
  await expect(accountant.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
  await expect(accountant.getByRole("link", { name: "Add customer" })).toHaveCount(0);
  await expect(
    accountant.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leads" }),
  ).toHaveCount(0);
  await accountant.goto("/crm/customers/new");
  await expect(accountant.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await accountant.goto("/crm/leads");
  await expect(accountant.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  // The API refuses too — hiding buttons is not the protection.
  expect((await accountant.request.post("/api/customers", { data: { name: "Nope" } })).status()).toBe(403);
  expect((await accountant.request.get("/api/leads")).status()).toBe(403);

  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/crm/customers");
  await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  expect((await employee.request.get("/api/customers")).status()).toBe(403);
});

test("tenant isolation: another company's customer and lead pages are not found", async ({ browser }) => {
  const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const customer = await (
    await ownerB.request.post("/api/customers", { data: { name: `B-only ${Date.now()}` } })
  ).json();
  const lead = await (
    await ownerB.request.post("/api/leads", { data: { name: `B lead ${Date.now()}` } })
  ).json();

  const ownerA = await signedIn(browser, adminEmail, adminPassword);
  for (const path of [
    `/crm/customers/${customer.id}`,
    `/crm/customers/${customer.id}/edit`,
    `/crm/leads/${lead.id}`,
  ]) {
    await ownerA.goto(path);
    await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  expect((await ownerA.request.get(`/api/leads/${lead.id}`)).status()).toBe(404);
  expect((await ownerA.request.patch(`/api/leads/${lead.id}`, { data: { name: "Hijacked" } })).status()).toBe(
    404,
  );
  expect((await ownerA.request.delete(`/api/leads/${lead.id}`)).status()).toBe(404);
  expect((await ownerA.request.get(`/api/customers/${customer.id}/documents`)).status()).toBe(404);

  expect((await (await ownerB.request.get(`/api/leads/${lead.id}`)).json()).name).not.toBe("Hijacked");
  await ownerB.request.delete(`/api/leads/${lead.id}`);
  await ownerB.request.delete(`/api/customers/${customer.id}`);
});
