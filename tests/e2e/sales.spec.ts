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

test("lead → quotation → sales order → invoice → payment, with exact totals, PDF, print and sharing", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await signedIn(browser, adminEmail, adminPassword);
  const customerName = `Sales E2E ${Date.now()}`;
  const created = await page.request.post("/api/customers", {
    data: { name: customerName, email: "buyer@sales-e2e.test", whatsapp: "+971 50 555 0101" },
  });
  expect(created.status()).toBe(201);
  const customer = await created.json();

  // Quotation with two lines; the total updates while typing, exactly (0.1 + 0.2 = 0.30).
  await page.goto(`/sales/quotations/new?customerId=${customer.id}`);
  await page.getByLabel("Description of line 1").fill("Consulting hours");
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByLabel("Unit price").first().fill("19.99");
  await page.getByLabel("Discount %").first().fill("10");
  await page.getByLabel("Tax %").first().fill("5");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description of line 2").fill("Cable");
  await page.getByLabel("Unit price").nth(1).fill("0.10");
  const totals = page.getByRole("definition").last();
  await expect(totals).toHaveText("$56.77"); // 56.67 + 0.10
  await page.getByRole("button", { name: "Save quotation" }).click();
  await expect(page.getByRole("heading", { name: /^Quotation QUO-\d{4}$/, level: 1 })).toBeVisible();
  await expect(page.getByRole("article").getByText("$56.77")).toBeVisible();

  // PDF download is a real PDF.
  const pdfHref = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const pdf = await page.request.get(pdfHref ?? "");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Send by email (console transport in tests): draft → sent.
  await page.getByRole("button", { name: "Send by email" }).click();
  await expect(page.getByRole("textbox", { name: "To", exact: true })).toHaveValue("buyer@sales-e2e.test");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/^Sent QUO-\d{4} to buyer@sales-e2e.test\.$/)).toBeVisible();
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();

  // WhatsApp: opens wa.me with the customer's number and a public link to the PDF.
  // (wa.me itself is stubbed so the test doesn't depend on the internet.)
  await page.context().route("https://wa.me/**", (route) => route.fulfill({ status: 200, body: "WhatsApp" }));
  const [whatsapp] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "WhatsApp" }).click(),
  ]);
  await whatsapp.waitForURL(/wa\.me\/971505550101/);
  const text = new URL(whatsapp.url()).searchParams.get("text") ?? "";
  const shareUrl = text.match(/https?:\/\/\S+\/api\/share\/[A-Za-z0-9_-]{43}/)?.[0] ?? "";
  expect(shareUrl).not.toBe("");
  await whatsapp.close();
  // The link works without an account.
  const anonymous = await browser.newContext();
  const shared = await anonymous.request.get(new URL(shareUrl).pathname);
  expect(shared.status()).toBe(200);
  expect(shared.headers()["content-type"]).toBe("application/pdf");
  await anonymous.close();

  // Accept → sales order → invoice.
  await page.getByRole("button", { name: "Mark as accepted" }).click();
  await page.getByRole("button", { name: "Create sales order" }).click();
  await expect(page.getByRole("heading", { name: /^Sales order SO-\d{4}$/, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Convert to invoice" }).click();
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByRole("heading", { name: /^Invoice .+/, level: 1 })).toBeVisible();
  const invoiceUrl = page.url();

  // Issue it and take a partial payment.
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Balance due: $56.77")).toBeVisible();
  await page.getByRole("link", { name: "Record payment" }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("56.77");
  await page.getByLabel("Amount").fill("20.01");
  await choose(page, "Payment method", "Cash");
  await page.getByLabel("Transaction reference").fill("RCPT-9");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.waitForURL(invoiceUrl);
  await expect(page.getByText("Partially paid").first()).toBeVisible();
  await expect(page.getByText("Balance due: $36.76")).toBeVisible();

  // Overpaying is refused by the server.
  await page.goto(`/sales/payments/new?invoiceId=${invoiceUrl.split("/").at(-1)}`);
  await page.getByLabel("Amount").fill("36.77");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Can't be more than the balance due \(36\.76\)/)).toBeVisible();

  // Void the payment (reason required).
  await page.goto(invoiceUrl);
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByLabel("Reason").fill("Wrong customer");
  await page.getByRole("button", { name: "Void payment" }).click();
  await expect(page.getByText("Balance due: $56.77")).toBeVisible();

  // Print view: the same document, no app shell.
  await page.goto(invoiceUrl.replace("/sales/invoices/", "/print/invoices/"));
  await expect(page.getByRole("article").getByText("Consulting hours")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
});

test("permissions: Employee has no sales access; Accountant can't create quotations but records payments", async ({
  browser,
}) => {
  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/sales/invoices");
  await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  expect((await employee.request.get("/api/invoices")).status()).toBe(403);
  expect((await employee.request.get("/api/payments")).status()).toBe(403);

  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  await accountant.goto("/sales/quotations");
  await expect(accountant.getByRole("heading", { name: "Quotations", level: 1 })).toBeVisible();
  await expect(accountant.getByRole("link", { name: "New quotation" })).toHaveCount(0);
  expect((await accountant.request.post("/api/quotations", { data: {} })).status()).toBe(403);
  await accountant.goto("/sales/payments");
  await expect(accountant.getByRole("link", { name: "Record payment" }).first()).toBeVisible();
});

test("tenant isolation: another company's invoice, quotation and PDF are not found", async ({ browser }) => {
  const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const customer = await (
    await ownerB.request.post("/api/customers", { data: { name: `B buyer ${Date.now()}` } })
  ).json();
  const body = {
    customerId: customer.id,
    issueDate: "2026-09-01",
    endDate: "2026-09-30",
    items: [{ description: "B only", quantity: "1", unitPrice: "100", discountPercent: "0", taxRate: "0" }],
  };
  const invoice = await (await ownerB.request.post("/api/invoices", { data: body })).json();
  const quotation = await (await ownerB.request.post("/api/quotations", { data: body })).json();

  const ownerA = await signedIn(browser, adminEmail, adminPassword);
  for (const path of [
    `/sales/invoices/${invoice.id}`,
    `/sales/quotations/${quotation.id}`,
    `/print/invoices/${invoice.id}`,
  ]) {
    await ownerA.goto(path);
    await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  expect((await ownerA.request.get(`/api/invoices/${invoice.id}/pdf`)).status()).toBe(404);
  expect((await ownerA.request.put(`/api/invoices/${invoice.id}`, { data: body })).status()).toBe(404);
  expect((await ownerA.request.delete(`/api/quotations/${quotation.id}`)).status()).toBe(404);
  expect(
    (
      await ownerA.request.post("/api/payments", {
        data: { invoiceId: invoice.id, amount: "1.00", method: "CASH", paymentDate: "2026-09-01" },
      })
    ).status(),
  ).toBe(404);
  // A can't bill B's customer either.
  expect((await ownerA.request.post("/api/invoices", { data: body })).status()).toBe(422);
});
