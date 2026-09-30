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

const column = (page: Page, status: string) =>
  page.getByRole("listitem", { name: new RegExp(`^${status}: `) });

test("a manager runs a project: tasks, assignment, attachments, board moves and progress", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  await linkedEmployee(admin);
  const project = `Website relaunch ${Date.now()}`;

  // Project form
  await admin.goto("/projects/new");
  await admin.getByLabel("Project name").fill(project);
  await choose(admin, "Status", "Active");
  await choose(admin, "Manager", E2E_USERS.employee.name);
  await admin.getByLabel("Start date").fill(isoDay(-10));
  await admin.getByLabel("End date").fill(isoDay(20));
  await admin.getByLabel(/Budget/).fill("250000.50");
  await admin.getByRole("button", { name: "Create project" }).click();
  await expect(admin.getByRole("heading", { name: project, level: 1 })).toBeVisible();
  await expect(admin.getByText(/^PRJ-\d{4}/).first()).toBeVisible();
  await expect(admin.getByText("No tasks yet").first()).toBeVisible();
  const projectId = admin.url().split("/").at(-1) ?? "";

  // Task form, preselected with this project; assigned to the employee and already overdue.
  await admin.getByRole("link", { name: "New task" }).click();
  await admin.getByLabel("Task name").fill("Write homepage copy");
  await choose(admin, "Assigned employee", E2E_USERS.employee.name);
  await choose(admin, "Priority", "Urgent");
  await admin.getByLabel("Due date").fill(isoDay(-1));
  await admin.getByRole("button", { name: "Create task" }).click();
  await expect(admin.getByRole("heading", { name: "Write homepage copy", level: 1 })).toBeVisible();
  await expect(admin.getByText(/Overdue/).first()).toBeVisible();
  const taskId = admin.url().split("/").at(-1) ?? "";

  // Attachments
  await admin
    .getByLabel("Choose an attachment to upload")
    .setInputFiles({ name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Homepage brief") });
  await expect(admin.getByRole("list", { name: "Attachments" }).getByText("brief.txt")).toBeVisible();

  // A second task, created through the API, to move on the board.
  const second = await admin.request.post("/api/tasks", {
    data: { name: "Design hero image", projectId, priority: "MEDIUM", status: "TODO" },
  });
  expect(second.status()).toBe(201);

  // Board: move with the keyboard-friendly menu, then by drag and drop.
  await admin.goto(`/projects/board?projectId=${projectId}`);
  await expect(column(admin, "To do").getByRole("listitem", { name: "Write homepage copy" })).toBeVisible();
  await admin.getByRole("button", { name: "Move Write homepage copy" }).click();
  await admin.getByRole("menuitem", { name: "In progress" }).click();
  await expect(
    column(admin, "In progress").getByRole("listitem", { name: "Write homepage copy" }),
  ).toBeVisible();
  await expect(admin.getByText("Write homepage copy moved to In progress.")).toBeVisible();

  await column(admin, "To do")
    .getByRole("listitem", { name: "Design hero image" })
    .dragTo(column(admin, "Completed"));
  await expect(column(admin, "Completed").getByRole("listitem", { name: "Design hero image" })).toBeVisible();
  // Wait for the server to confirm before reloading (a reload would cancel the save).
  await expect(admin.getByText("Design hero image moved to Completed.")).toBeVisible();
  await admin.reload();
  await expect(column(admin, "Completed").getByRole("listitem", { name: "Design hero image" })).toBeVisible();

  // Progress on the project: 1 of 2 tasks done.
  await admin.goto(`/projects/${projectId}`);
  await expect(admin.getByRole("progressbar", { name: "Work done" })).toHaveAttribute("aria-valuenow", "50");
  await expect(admin.getByText("1 of 2 tasks completed")).toBeVisible();

  // Reassign on the task page; history records it.
  await admin.goto(`/projects/tasks/${taskId}`);
  await choose(admin, "Assigned to", "Unassigned");
  await expect(admin.getByText("Task unassigned.")).toBeVisible();
  await choose(admin, "Assigned to", E2E_USERS.employee.name);
  await expect(admin.getByText("Task assigned.")).toBeVisible();
  await expect(admin.getByText(`Assigned to ${E2E_USERS.employee.name}`)).toBeVisible();

  // Reports list the project and the employee's open work.
  await admin.goto("/projects/reports");
  await expect(admin.getByRole("link", { name: project })).toBeVisible();
  await expect(admin.getByRole("cell", { name: E2E_USERS.employee.name }).first()).toBeVisible();

  // A project with tasks can't be deleted.
  await admin.goto(`/projects/${projectId}`);
  await admin.getByRole("button", { name: "Delete" }).click();
  await admin.getByRole("button", { name: "Delete project" }).click();
  await expect(
    admin.getByRole("alert").filter({ hasText: /Projects with tasks can't be deleted/ }),
  ).toBeVisible();
});

test("an employee works on their own tasks but can't manage projects", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await signedIn(browser, adminEmail, adminPassword);
  await linkedEmployee(admin);
  const created = await admin.request.post("/api/projects", {
    data: { name: `Employee project ${Date.now()}`, status: "ACTIVE" },
  });
  expect(created.status()).toBe(201);
  const { id: projectId } = await created.json();
  const employees = await (
    await admin.request.get(`/api/employees?search=${encodeURIComponent(E2E_USERS.employee.name)}`)
  ).json();
  const assigneeId = (employees.items as { id: string; user: { email: string } | null }[]).find(
    (item) => item.user?.email === E2E_USERS.employee.email,
  )?.id;
  const name = `Own task ${Date.now()}`;
  const mine = await admin.request.post("/api/tasks", {
    data: { name, projectId, assigneeId, priority: "HIGH", status: "TODO" },
  });
  expect(mine.status()).toBe(201);
  const { id: taskId } = await mine.json();
  const hidden = await admin.request.post("/api/tasks", {
    data: { name: "Not for the employee", projectId, priority: "LOW", status: "TODO" },
  });
  const { id: hiddenId } = await hidden.json();

  const employee = await signedIn(browser, E2E_USERS.employee.email, E2E_PASSWORD);
  await employee.goto("/projects/tasks");
  await expect(employee.getByRole("link", { name })).toBeVisible();
  await expect(employee.getByRole("link", { name: "Not for the employee" })).toHaveCount(0);
  await expect(employee.getByRole("link", { name: "New task" })).toHaveCount(0);

  // Moves their own task, but can't edit it.
  await employee.getByRole("link", { name }).click();
  await expect(employee.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(employee.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await choose(employee, "Status", "Review");
  await expect(employee.getByText("Moved to Review.")).toBeVisible();

  // Server-side checks, not just hidden buttons.
  await employee.goto("/projects/new");
  await expect(employee.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  expect(
    (
      await employee.request.post("/api/tasks", {
        data: { name: "Sneaky", projectId, priority: "LOW", status: "TODO" },
      })
    ).status(),
  ).toBe(403);
  const rename = { name: "Renamed", projectId, priority: "HIGH", status: "REVIEW" };
  expect((await employee.request.put(`/api/tasks/${taskId}`, { data: rename })).status()).toBe(403);
  expect((await employee.request.get(`/api/tasks/${hiddenId}`)).status()).toBe(404);
  expect((await employee.request.delete(`/api/projects/${projectId}`)).status()).toBe(403);
});

test("another company can't see or change projects and tasks", async ({ browser }) => {
  const admin = await signedIn(browser, adminEmail, adminPassword);
  const created = await admin.request.post("/api/projects", {
    data: { name: `Private project ${Date.now()}`, status: "PLANNING" },
  });
  const { id: projectId } = await created.json();
  const task = await admin.request.post("/api/tasks", {
    data: { name: "Private task", projectId, priority: "LOW", status: "TODO" },
  });
  const { id: taskId } = await task.json();

  const other = await signedIn(browser, E2E_OTHER_COMPANY.owner.email, E2E_PASSWORD);
  expect((await other.request.get(`/api/projects/${projectId}`)).status()).toBe(404);
  expect((await other.request.get(`/api/tasks/${taskId}`)).status()).toBe(404);
  expect(
    (await other.request.post(`/api/tasks/${taskId}/status`, { data: { status: "COMPLETED" } })).status(),
  ).toBe(404);
  await other.goto(`/projects/${projectId}`);
  await expect(other.getByRole("heading", { name: /not found/i })).toBeVisible();
  const list = await (await other.request.get("/api/tasks")).json();
  expect((list.items as { id: string }[]).some((item) => item.id === taskId)).toBe(false);
});
