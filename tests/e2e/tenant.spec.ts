import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_MULTI_USER, E2E_OTHER_COMPANY, E2E_PASSWORD, E2E_USERS } from "./users";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
test.skip(!adminEmail || !adminPassword, "Needs a seeded database (SEED_ADMIN_*).");

// A valid 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function signedIn(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

test.describe("cross-company API access", () => {
  test("Company A cannot read, update or delete Company B's records", async ({ browser }) => {
    const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
    const created = await ownerB.request.post("/api/customers", { data: { name: `B-only ${Date.now()}` } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const ownerA = await signedIn(browser, adminEmail, adminPassword);
    // Read
    expect((await ownerA.request.get(`/api/customers/${id}`)).status()).toBe(404);
    const listA = await (await ownerA.request.get("/api/customers?pageSize=100")).json();
    expect(listA.items.map((customer: { id: string }) => customer.id)).not.toContain(id);
    // Update
    expect(
      (await ownerA.request.patch(`/api/customers/${id}`, { data: { name: "Hijacked" } })).status(),
    ).toBe(404);
    // Delete
    expect((await ownerA.request.delete(`/api/customers/${id}`)).status()).toBe(404);

    // B's record is untouched.
    const stillThere = await ownerB.request.get(`/api/customers/${id}`);
    expect(stillThere.status()).toBe(200);
    expect((await stillThere.json()).name).not.toBe("Hijacked");
    await ownerB.request.delete(`/api/customers/${id}`);
  });
});

test.describe("company switcher", () => {
  test("switches company and applies that company's role", async ({ browser }) => {
    const page = await signedIn(browser, E2E_MULTI_USER.email, E2E_PASSWORD);
    const nav = page.getByRole("navigation", { name: "Main" });

    // Default company: the seeded company, where this user is an Employee (no accounting).
    await expect(nav.getByRole("link", { name: "Accounts" })).toHaveCount(0);
    await page.goto("/finance/accounts");
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();

    await page.getByRole("button", { name: /Switch company/ }).click();
    await page.getByRole("menuitem", { name: new RegExp(E2E_OTHER_COMPANY.name) }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`Current company: ${E2E_OTHER_COMPANY.name}`) }),
    ).toBeVisible();

    // In company B the same person is an Accountant.
    await expect(nav.getByRole("link", { name: "Accounts" })).toBeVisible();
    await page.goto("/finance/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Chart of accounts" })).toBeVisible();

    // Switch back so the next run starts from the default company.
    await page.getByRole("button", { name: /Switch company/ }).click();
    await page.getByRole("menuitem").first().click();
    await expect(
      page.getByRole("button", { name: new RegExp(`Current company: ${E2E_OTHER_COMPANY.name}`) }),
    ).toHaveCount(0);
  });
});

test.describe("company settings", () => {
  test("are read-only for an Admin", async ({ browser }) => {
    const page = await signedIn(browser, E2E_USERS.admin.email, E2E_PASSWORD);
    await page.goto("/settings");
    await expect(page.getByText(/Only people with the “Manage settings” permission/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save company profile" })).toHaveCount(0);
    await expect(page.getByLabel("Company name")).toBeDisabled();
  });

  test("let the Super Admin upload a logo that appears in the header", async ({ browser }) => {
    const page = await signedIn(browser, adminEmail, adminPassword);
    await page.goto("/settings");
    await page
      .getByLabel("Choose logo image")
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Logo updated.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Current company logo" })).toBeVisible();
    await expect(page.locator('header img[src^="/api/company/logo"]')).toBeVisible();

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove logo" }).click();
    await expect(page.getByText("Logo removed.")).toBeVisible();
  });

  test("reject a disguised non-image upload", async ({ browser }) => {
    const page = await signedIn(browser, adminEmail, adminPassword);
    await page.goto("/settings");
    // The file input only reacts once the page's scripts have loaded.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Choose logo image").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from("<svg><script>alert(1)</script></svg>"),
    });
    await expect(page.getByText("Upload a PNG, JPEG or WebP image.")).toBeVisible();
  });
});
