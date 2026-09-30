import { expect, test, type Browser, type Page } from "@playwright/test";
import { choose, openDialog } from "./helpers";
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

/** A warehouse, supplier and product unique to this run, created through the UI. */
async function setUp(owner: Page) {
  const stamp = Date.now();
  const warehouse = `Store ${stamp}`;
  const supplier = `Supplier ${stamp}`;
  const product = `Cable ${stamp}`;
  const sku = `E2E-${stamp}`;

  await owner.goto("/inventory/warehouses");
  await openDialog(owner, "Add warehouse");
  await owner.getByRole("dialog").getByLabel("Name").fill(warehouse);
  await owner.getByRole("dialog").getByRole("button", { name: "Add warehouse" }).click();
  await expect(owner.getByRole("cell", { name: warehouse, exact: true })).toBeVisible();

  await owner.goto("/purchasing/suppliers/new");
  await owner.getByRole("textbox", { name: "Name", exact: true }).fill(supplier);
  await owner.getByLabel(/Tax information/).fill("NTN-1234567");
  await owner.getByRole("button", { name: "Create supplier" }).click();
  await expect(owner.getByRole("heading", { name: supplier, level: 1 })).toBeVisible();

  await owner.goto("/inventory/products/new");
  await owner.getByLabel("Product name").fill(product);
  await owner.getByLabel("SKU").fill(sku);
  await owner.getByLabel("Minimum stock").fill("5");
  await owner.getByLabel(/Purchase price/).fill("2.50");
  await owner.getByLabel(/Selling price/).fill("6.00");
  await choose(owner, "Supplier", supplier);
  await choose(owner, "Default warehouse", warehouse);
  await owner.getByRole("button", { name: "Create product" }).click();
  await expect(owner.getByRole("heading", { name: product, level: 1 })).toBeVisible();
  const productId = owner.url().split("/").at(-1) ?? "";
  return { warehouse, supplier, product, sku, productId };
}

test("stock is recorded through movements, with low-stock alerts and history", async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await signedIn(browser, adminEmail, adminPassword);
  const { warehouse, product, sku, productId } = await setUp(owner);

  // A new product has no stock and is low (minimum 5).
  await expect(owner.getByText("Out of stock").first()).toBeVisible();
  await expect(owner.getByText(/Low-stock alert/)).toBeVisible();

  // Stock in 3 → still low.
  await owner.getByRole("link", { name: "Record stock movement" }).click();
  await owner.getByLabel(/^Quantity/).fill("3");
  await owner.getByRole("button", { name: "Record stock in" }).click();
  await expect(owner.getByRole("heading", { name: product, level: 1 })).toBeVisible();
  await expect(owner.getByText("3 pcs").first()).toBeVisible();
  await expect(owner.getByText(/Low-stock alert: reorder 2 pcs/)).toBeVisible();

  // Taking out more than is there is refused with the actual stock.
  await owner.goto(`/inventory/movements/new?productId=${productId}`);
  await choose(owner, "Operation", "Stock out");
  await owner.getByLabel(/^Quantity/).fill("4");
  await owner.getByRole("button", { name: "Record stock out" }).click();
  await expect(owner.getByText(/Only 3 pcs in stock/).first()).toBeVisible();

  // Adjustment to a counted 10 (reason required) → not low any more.
  await choose(owner, "Operation", "Stock adjustment (count)");
  await owner.getByLabel(/^Counted quantity/).fill("10");
  await owner.getByLabel("Reason").fill("Stock count");
  await owner.getByRole("button", { name: /Record stock adjustment/ }).click();
  await expect(owner.getByRole("heading", { name: product, level: 1 })).toBeVisible();
  await expect(owner.getByText("In stock", { exact: true }).first()).toBeVisible();

  // The history shows both movements; the products list finds it by SKU with its stock.
  const history = owner.getByRole("table", { name: `Stock movements of ${product}` });
  await expect(history.getByText("Adjustment")).toBeVisible();
  await expect(history.getByText("Stock in")).toBeVisible();
  await expect(history.getByText("+7 pcs")).toBeVisible();
  await owner.goto(`/inventory?search=${sku}`);
  await expect(owner.getByRole("cell", { name: "10 pcs" })).toBeVisible();
  await owner.goto(`/inventory/movements?search=${sku}`);
  await expect(owner.getByRole("cell", { name: warehouse }).first()).toBeVisible();
});

test("purchasing: request → approval → order → goods received → supplier invoice → payment", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await signedIn(browser, adminEmail, adminPassword);
  const { supplier, product, productId } = await setUp(owner);

  // 1. Purchase request (the requester can't approve it).
  await owner.goto("/purchasing/requests/new");
  await owner.getByLabel("What is it for?").fill("Restock cables for the shop");
  await choose(owner, "Product of line 1", product);
  await owner.getByLabel("Quantity").fill("20");
  await owner.getByRole("button", { name: "Send for approval" }).click();
  await expect(owner.getByText("Pending approval").first()).toBeVisible();
  await expect(owner.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const requestUrl = owner.url();

  // 2. Someone else approves.
  const approver = await signedIn(browser, E2E_USERS.admin.email, E2E_PASSWORD);
  await approver.goto(requestUrl);
  await openDialog(approver, "Approve");
  await approver.getByRole("button", { name: "Approve request" }).click();
  await expect(approver.getByText("Approved", { exact: true }).first()).toBeVisible();

  // 3. Purchase order from the request, placed with the supplier.
  await owner.reload();
  await owner.getByRole("link", { name: "Create purchase order" }).click();
  await choose(owner, "Supplier", supplier);
  await owner.getByLabel(/^Unit price/).fill("2.40");
  await expect(owner.getByText(/48\.00/).first()).toBeVisible();
  await owner.getByRole("button", { name: "Create draft order" }).click();
  await expect(owner.getByText("Draft", { exact: true }).first()).toBeVisible();
  await expect(async () => {
    if (!(await owner.getByRole("alertdialog").isVisible())) {
      await owner.getByRole("button", { name: "Place order" }).click();
    }
    await expect(owner.getByRole("alertdialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await owner.getByRole("alertdialog").getByRole("button", { name: "Place order" }).click();
  await expect(owner.getByText("Ordered", { exact: true }).first()).toBeVisible();

  // 4. Goods received in part → stock goes up.
  await owner.getByRole("link", { name: "Receive goods" }).click();
  await owner.getByLabel(/Received now/).fill("12");
  await owner.getByRole("button", { name: "Record goods received" }).click();
  await expect(owner.getByText("Partly received").first()).toBeVisible();
  await expect(owner.getByText("8 pcs open")).toBeVisible();
  const orderUrl = owner.url();
  await owner.goto(`/inventory/products/${productId}`);
  await expect(owner.getByText("12 pcs").first()).toBeVisible();
  await expect(owner.getByText("Goods received").first()).toBeVisible();

  // 5. Supplier invoice for the order, then payment.
  await owner.goto(orderUrl);
  await owner.getByRole("link", { name: "Record supplier invoice" }).click();
  await owner.getByLabel("Supplier's invoice number").fill("SUP-INV-9");
  await expect(owner.getByLabel(/Amount before tax/)).toHaveValue("48.00");
  await owner.getByLabel(/^Tax/).fill("7.20");
  await owner.getByRole("button", { name: "Record supplier invoice" }).click();
  await expect(owner.getByText("Unpaid", { exact: true }).first()).toBeVisible();
  await openDialog(owner, "Record payment");
  await expect(owner.getByRole("dialog").getByLabel(/^Amount/)).toHaveValue("55.20");
  await owner.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await expect(owner.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(owner.getByRole("link", { name: /^JE-\d{4}$/ })).toHaveCount(2);

  // The supplier page shows the purchase and payment history.
  await owner.getByRole("link", { name: supplier }).first().click();
  await owner.getByRole("tab", { name: /Purchase history/ }).click();
  await expect(owner.getByRole("link", { name: /^PO-\d{4}$/ })).toBeVisible();
  await owner.getByRole("tab", { name: /Payment history/ }).click();
  await expect(owner.getByRole("link", { name: /^SPAY-\d{4}$/ })).toBeVisible();
});

test("inventory is isolated per company and closed to roles without access", async ({ browser }) => {
  const owner = await signedIn(browser, adminEmail, adminPassword);
  const stamp = Date.now();
  const created = await owner.request.post("/api/products", {
    data: {
      sku: `ISO-${stamp}`,
      name: `Private product ${stamp}`,
      unit: "pcs",
      purchasePrice: "1",
      sellingPrice: "2",
      minimumStock: "0",
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const other = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  expect((await other.request.get(`/api/products/${id}`)).status()).toBe(404);
  const list = await (await other.request.get(`/api/products?search=ISO-${stamp}`)).json();
  expect(list.total).toBe(0);
  await other.goto(`/inventory/products/${id}`);
  await expect(other.getByRole("heading", { name: /not found/i })).toBeVisible();

  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  expect((await employee.request.get("/api/products")).status()).toBe(403);
  expect((await employee.request.get("/api/purchases/orders")).status()).toBe(403);
  await employee.goto("/inventory");
  await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
});
