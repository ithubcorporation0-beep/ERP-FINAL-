import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the redirect that follows a successful sign-in before navigating elsewhere.
  await page.waitForURL((url) => url.pathname !== "/login");
}

const PROTECTED_PAGES = ["/dashboard", "/crm", "/finance", "/users", "/roles", "/profile", "/settings"];

test.describe("signed-out visitors", () => {
  for (const path of PROTECTED_PAGES) {
    test(`cannot open ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }

  test("get 401 from protected API endpoints", async ({ request }) => {
    const response = await request.get("/api/customers");
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("see a generic answer on forgot password (no account enumeration)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody-here@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
  });

  test("cannot use an invalid reset link", async ({ page }) => {
    await page.goto(`/reset-password?token=${"x".repeat(43)}`);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });
});

test.describe("an Employee", () => {
  test.skip(!adminEmail, "Needs a seeded database (SEED_ADMIN_EMAIL).");

  test("returns to the requested page after signing in", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/next=%2Fprojects/);
    await page.getByLabel("Email").fill(E2E_USERS.employee.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("only sees what the role allows in the menu", async ({ page }) => {
    await signIn(page, E2E_USERS.employee.email, E2E_PASSWORD);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
    for (const hidden of ["Users", "Roles", "Finance", "Settings", "Audit Logs"]) {
      await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
    }
  });

  test("is refused on pages outside the role, even by typing the URL", async ({ page }) => {
    await signIn(page, E2E_USERS.employee.email, E2E_PASSWORD);
    for (const path of ["/users", "/roles", "/finance", "/settings", "/roles/new"]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "You don't have access to this page" }),
        path,
      ).toBeVisible();
    }
  });

  test("gets 403 from the API for data outside the role", async ({ page }) => {
    await signIn(page, E2E_USERS.employee.email, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    const response = await page.request.get("/api/customers");
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  test("can open and edit their own profile", async ({ page }) => {
    await signIn(page, E2E_USERS.employee.email, E2E_PASSWORD);
    await page.goto("/profile");
    await page.getByLabel("Job title").fill(`Field technician ${Date.now()}`);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
  });
});

test.describe("an Accountant", () => {
  test.skip(!adminEmail, "Needs a seeded database (SEED_ADMIN_EMAIL).");

  test("can read customers through the API but not delete them", async ({ page }) => {
    await signIn(page, E2E_USERS.accountant.email, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await page.request.get("/api/customers")).status()).toBe(200);
    const response = await page.request.delete("/api/customers/0192a1f0-0000-7000-8000-000000000000");
    expect(response.status()).toBe(403);
  });
});

test.describe("the Super Admin", () => {
  test.skip(!adminEmail || !adminPassword, "Needs a seeded database (SEED_ADMIN_*).");

  test("manages users and roles", async ({ page }) => {
    await signIn(page, adminEmail ?? "", adminPassword ?? "");
    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
    await expect(page.getByRole("cell", { name: new RegExp(E2E_USERS.employee.email) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite user" })).toBeVisible();

    await page.goto("/roles");
    await page.getByRole("link", { name: "Employee" }).click();
    await expect(page.getByText("Built-in roles can't be changed")).toBeVisible();
    await page.getByRole("link", { name: "Duplicate" }).click();

    const name = `E2E role ${Date.now()}`;
    await page.getByLabel("Role name").fill(name);
    await page.getByRole("checkbox", { name: "View leads" }).check();
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText("The role was created.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.getByRole("button", { name: "Delete role" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete role" }).click();
    await expect(page).toHaveURL(/\/roles\?deleted=1$/);
  });
});
