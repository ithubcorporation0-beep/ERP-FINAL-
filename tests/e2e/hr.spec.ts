import { expect, test, type Browser, type Page } from "@playwright/test";
import { choose, isoDay, linkedEmployee } from "./helpers";
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

test("HR adds an employee with restricted salary and bank details", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  const department = `Dept ${Date.now()}`;
  await admin.goto("/hr/departments");
  await admin.getByRole("button", { name: "Add department" }).click();
  await admin.getByRole("dialog").getByLabel("Name").fill(department);
  await admin.getByRole("dialog").getByRole("button", { name: "Add department" }).click();
  await expect(admin.getByRole("cell", { name: department, exact: true })).toBeVisible();

  const name = `Employee E2E ${Date.now()}`;
  await admin.goto("/hr/employees/new");
  await admin.getByLabel("Full name").fill(name);
  await admin.getByLabel("Email").fill("new.hire@example.test");
  await choose(admin, "Department", department);
  await admin.getByLabel("Position").fill("Accountant");
  await admin.getByRole("button", { name: "Add employee" }).click();
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(admin.getByText(/EMP-\d{4} · Accountant/)).toBeVisible();
  const employeeId = admin.url().split("/").at(-1) ?? "";

  // Salary and bank details: masked after saving, full numbers only on request.
  await admin.getByRole("tab", { name: "Salary & bank" }).click();
  await admin.getByRole("button", { name: "Edit salary & bank" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel(/Monthly salary/).fill("185000.50");
  await dialog.getByLabel("Bank").fill("Meezan Bank");
  await dialog.getByLabel("Account number").fill("0101-2345678901");
  await dialog.getByLabel("IBAN").fill("PK36SCBL0000001123456702");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText("•••• 8901")).toBeVisible();
  await expect(admin.getByText("0101-2345678901")).toHaveCount(0);
  await admin.getByRole("button", { name: "Show full numbers" }).click();
  await expect(admin.getByText("0101-2345678901")).toBeVisible();

  // Status workflow: resigning needs a last working day.
  await admin.getByRole("button", { name: "Change status" }).click();
  await choose(admin, "New status", "On notice");
  await admin.getByRole("dialog").getByRole("button", { name: "Save status" }).click();
  await expect(admin.getByText("On notice").first()).toBeVisible();

  // The profile API never carries pay; the accountant can't read pay or employees at all.
  const profile = await (await admin.request.get(`/api/employees/${employeeId}`)).text();
  expect(profile).not.toContain("185000");
  const accountant = await signedIn(browser, E2E_USERS.accountant.email, E2E_PASSWORD);
  expect((await accountant.request.get(`/api/employees/${employeeId}/compensation`)).status()).toBe(403);
  expect((await accountant.request.get(`/api/employees/${employeeId}`)).status()).toBe(403);
  await accountant.goto(`/hr/employees/${employeeId}`);
  await expect(accountant.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
});

test("an employee checks in and requests leave; an approver approves it", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  await linkedEmployee(admin);

  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/hr/attendance");
  const checkIn = employee.getByRole("button", { name: "Check in" });
  if (await checkIn.isVisible()) {
    await checkIn.click();
    await expect(employee.getByText("Checked in.")).toBeVisible();
  }
  await expect(employee.getByText(/Check-in: \d/)).toBeVisible();
  // Employees don't get the company dashboard or other people's records.
  await expect(employee.getByRole("heading", { name: "Today", exact: true })).toHaveCount(0);
  expect((await employee.request.get("/api/attendance/today")).status()).toBe(403);
  expect((await employee.request.get("/api/employees")).status()).toBe(403);

  // A week far in the future, different on every run so requests never overlap.
  const offset = 400 + (Math.floor(Date.now() / 1000) % 2_000) * 7;
  await employee.goto("/hr/leave/new");
  await choose(employee, "Leave type", "Annual leave");
  await employee.getByLabel("Start date").fill(isoDay(offset));
  await employee.getByLabel("End date").fill(isoDay(offset + 6));
  await employee.getByLabel("Reason").fill("Family trip");
  await employee.getByRole("button", { name: "Request leave" }).click();
  await expect(employee.getByRole("heading", { name: /^Leave request LV-\d{4}$/, level: 1 })).toBeVisible();
  await expect(employee.getByText("5 days")).toBeVisible();
  await expect(employee.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const leaveUrl = employee.url();

  // Overlapping dates are refused by the server.
  const overlap = await employee.request.post("/api/leaves", {
    // Five days always contain working days, so the only refusal reason is the overlap.
    data: { type: "CASUAL", startDate: isoDay(offset + 1), endDate: isoDay(offset + 5), reason: "Overlap" },
  });
  expect(overlap.status()).toBe(409);

  await admin.goto(leaveUrl);
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved").first()).toBeVisible();

  await employee.reload();
  await expect(employee.getByText("Approved").first()).toBeVisible();
  await expect(employee.getByRole("button", { name: "Cancel request" })).toHaveCount(0);

  // HR sees today's attendance dashboard and the report.
  await admin.goto("/hr/attendance");
  for (const label of ["Present", "Absent", "Late", "On leave", "Total employees"]) {
    await expect(admin.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await admin.goto("/hr/attendance/report");
  await expect(admin.getByRole("heading", { name: "Attendance report", level: 1 })).toBeVisible();
});

test("tenant isolation: another company's employees and leave are not found", async ({ browser }) => {
  const ownerB = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  const created = await ownerB.request.post("/api/employees", {
    data: { name: `B person ${Date.now()}`, joiningDate: "2026-01-05" },
  });
  expect(created.status()).toBe(201);
  const employee = await created.json();
  const leave = await ownerB.request.post("/api/leaves", {
    data: {
      employeeId: employee.id,
      type: "SICK",
      startDate: "2026-02-02",
      endDate: "2026-02-03",
      reason: "B only",
    },
  });
  expect(leave.status()).toBe(201);
  const leaveId = (await leave.json()).id;

  const ownerA = await signedIn(browser, adminEmail, adminPassword);
  await ownerA.goto(`/hr/employees/${employee.id}`);
  await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await ownerA.goto(`/hr/leave/${leaveId}`);
  await expect(ownerA.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await ownerA.request.get(`/api/employees/${employee.id}/compensation`)).status()).toBe(404);
  expect((await ownerA.request.delete(`/api/employees/${employee.id}`)).status()).toBe(404);
  expect(
    (
      await ownerA.request.post(`/api/leaves/${leaveId}/decision`, { data: { decision: "approve" } })
    ).status(),
  ).toBe(404);
});
