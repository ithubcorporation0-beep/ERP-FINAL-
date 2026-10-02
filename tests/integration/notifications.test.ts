import { describe, expect, it, vi } from "vitest";
import { addDays, todayInZone } from "@/lib/date-range";
import { memoryOutbox } from "@/lib/email";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import {
  auditLogQuerySchema,
  notificationListQuerySchema,
  productSchema,
  projectSchema,
  salesDocumentSchema,
  stockOperationSchema,
  taskSchema,
  warehouseSchema,
} from "@/lib/validation";
import { db } from "@/lib/db";
import { auditLogService } from "@/server/services/audit-log.service";
import { authService } from "@/server/services/auth.service";
import { customerService } from "@/server/services/customer.service";
import { employeeService } from "@/server/services/employee.service";
import { invoiceService } from "@/server/services/invoice.service";
import { leaveService } from "@/server/services/leave.service";
import { notificationScheduleService } from "@/server/services/notification-schedule.service";
import { notificationService, notify } from "@/server/services/notification.service";
import { paymentService } from "@/server/services/payment.service";
import { productService } from "@/server/services/product.service";
import { projectService } from "@/server/services/project.service";
import { settingsService } from "@/server/services/settings.service";
import { stockService } from "@/server/services/stock.service";
import { taskService } from "@/server/services/task.service";
import { warehouseService } from "@/server/services/warehouse.service";
import { addMember, createCompanyWithOwner, TEST_PASSWORD } from "./helpers";
import { rawDb } from "./raw-db";

// Delivery to the addresses in `bouncing` fails, to exercise the outbox retries; everything else is delivered by
// the real memory transport.
const bouncing = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (message: import("@/lib/email").EmailMessage) => {
      if (bouncing.has(message.to)) throw new Error("Mailbox unavailable");
      return actual.sendEmail(message);
    }),
  };
});

const today = () => todayInZone("UTC");

function inbox(ctx: TenantContext) {
  return rawDb.notification.findMany({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    orderBy: { createdAt: "asc" },
  });
}

function outbox(ctx: TenantContext) {
  return rawDb.emailOutbox.findMany({ where: { companyId: ctx.companyId, userId: ctx.userId } });
}

/** A member with a built-in role whose login is linked to an employee record. */
async function linkedMember(owner: TenantContext, role: string, name: string) {
  const { ctx, email } = await addMember(owner, role);
  const employee = await employeeService.create(owner, {
    name,
    joiningDate: "2025-01-01",
    userId: ctx.userId,
  });
  return { ctx, email, employee };
}

function invoiceInput(customerId: string, dueDate: string) {
  return salesDocumentSchema.parse({
    customerId,
    issueDate: addDays(today(), -30),
    endDate: dueDate,
    items: [
      { description: "Consulting", quantity: "2", unitPrice: "150", discountPercent: "0", taxRate: "0" },
    ],
  });
}

describe("event notifications", () => {
  it("notifies members with the type's permission, never the actor, and respects preferences", async () => {
    const owner = await createCompanyWithOwner("Notify Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: employee } = await addMember(owner, "Employee");

    // New customer → everyone who can see customers except whoever created it.
    const customer = await customerService.create(owner, { name: "Acme" });
    expect((await inbox(accountant)).map((row) => [row.type, row.entityId, row.link])).toEqual([
      ["customer.created", customer.id, `/crm/customers/${customer.id}`],
    ]);
    expect(await inbox(owner)).toEqual([]);
    expect(await inbox(employee)).toEqual([]);

    // New invoice; the accountant chose email only for invoices.
    await notificationService.savePreferences(accountant, {
      preferences: [{ type: "invoice.created", inApp: false, email: true }],
    });
    const invoice = await invoiceService.create(owner, invoiceInput(customer.id, "2099-12-31"));
    expect((await inbox(accountant)).map((row) => row.type)).toEqual(["customer.created"]);
    const emails = await outbox(accountant);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      status: "PENDING",
      notificationId: null,
      link: `/sales/invoices/${invoice.id}`,
      attempts: 0,
    });
    expect(emails[0]?.subject).toContain("Notify Co");

    // A payment, recorded by the accountant: the owner hears about it, the accountant doesn't.
    await invoiceService.markSent(owner, invoice.id);
    await paymentService.record(accountant, {
      invoiceId: invoice.id,
      amount: "100.00",
      method: "CASH",
      reference: "",
      paymentDate: today(),
      notes: "",
    });
    expect((await inbox(owner)).map((row) => row.type)).toEqual(["payment.received"]);
    expect((await inbox(accountant)).map((row) => row.type)).toEqual(["customer.created"]);

    // Preferences: saved values merged with the defaults, and the change is audited.
    const preferences = await notificationService.preferences(accountant);
    expect(preferences.find((row) => row.type === "invoice.created")).toMatchObject({
      inApp: false,
      email: true,
    });
    expect(preferences.find((row) => row.type === "invoice.overdue")).toMatchObject({
      inApp: true,
      email: true,
    });
    expect(
      await rawDb.auditLog.count({
        where: {
          companyId: owner.companyId,
          action: "notification.preferences_update",
          actorId: accountant.userId,
        },
      }),
    ).toBe(1);
  });

  it("sends leave requests to approvers and the decision to the employee", async () => {
    const owner = await createCompanyWithOwner("Leave Notify Co");
    await settingsService.set(owner, "hr.workDays", [0, 1, 2, 3, 4, 5, 6]);
    const { ctx: hr } = await addMember(owner, "HR Manager");
    const { ctx: worker } = await linkedMember(owner, "Employee", "Wendy Worker");
    const { ctx: colleague } = await addMember(owner, "Employee");

    const leave = await leaveService.create(worker, {
      type: "ANNUAL",
      startDate: addDays(today(), 10),
      endDate: addDays(today(), 11),
      reason: "Family visit",
    });
    for (const approver of [owner, hr]) {
      expect((await inbox(approver)).map((row) => [row.type, row.title])).toEqual([
        ["leave.requested", "Leave request from Wendy Worker"],
      ]);
    }
    expect(await inbox(worker)).toEqual([]);
    expect(await inbox(colleague)).toEqual([]);

    await leaveService.approve(hr, leave.id);
    const decided = await inbox(worker);
    expect(decided.map((row) => [row.type, row.link])).toEqual([["leave.decided", `/hr/leave/${leave.id}`]]);
    // Email is on by default for leave decisions, linked to the in-app notification.
    expect((await outbox(worker)).map((row) => row.notificationId)).toEqual([decided[0]?.id]);
  });

  it("tells assignees about new tasks, but not when they assign themselves", async () => {
    const owner = await createCompanyWithOwner("Task Notify Co");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Tariq Tasker");
    const { ctx: manager, employee: managerEmployee } = await linkedMember(owner, "Manager", "Mona Manager");
    const project = await projectService.create(
      owner,
      projectSchema.parse({ name: "Launch", status: "ACTIVE" }),
    );
    const base = { projectId: project.id, priority: "HIGH", status: "TODO" };

    const assigned = await taskService.create(
      owner,
      taskSchema.parse({ ...base, name: "Write copy", assigneeId: employee.id }),
    );
    expect((await inbox(worker)).map((row) => [row.type, row.entityId])).toEqual([
      ["task.assigned", assigned.id],
    ]);

    await taskService.create(
      manager,
      taskSchema.parse({ ...base, name: "Plan", assigneeId: managerEmployee.id }),
    );
    expect(await inbox(manager)).toEqual([]);

    // Reassigning notifies the new assignee.
    await taskService.assign(owner, assigned.id, managerEmployee.id);
    expect((await inbox(manager)).map((row) => row.type)).toEqual(["task.assigned"]);
  });

  it("alerts when stock first drops to the minimum, once per crossing", async () => {
    const owner = await createCompanyWithOwner("Stock Notify Co");
    const { ctx: inventory } = await addMember(owner, "Inventory Manager");
    const warehouse = await warehouseService.create(owner, warehouseSchema.parse({ name: "Main" }));
    const product = await productService.create(
      owner,
      productSchema.parse({
        sku: "SKU-1",
        name: "Cable",
        purchasePrice: "1.00",
        sellingPrice: "2.00",
        unit: "pcs",
        minimumStock: "10",
        warehouseId: warehouse.id,
      }),
    );
    const move = (operation: string, quantity: string) =>
      stockService.record(
        owner,
        stockOperationSchema.parse({
          operation,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity,
          movementDate: today(),
        }),
      );
    await move("IN", "25");
    expect(await inbox(inventory)).toEqual([]);
    await move("OUT", "16"); // 9 left: crosses the minimum
    await move("OUT", "2"); // still low: no second alert
    const alerts = await inbox(inventory);
    expect(alerts.map((row) => [row.type, row.body])).toEqual([
      ["inventory.low_stock", "SKU-1: 9 pcs left (minimum 10)."],
    ]);
    await move("IN", "20"); // back above
    await move("OUT", "20"); // crosses again
    expect(await inbox(inventory)).toHaveLength(2);
  });

  it("rolls notifications back with the event", async () => {
    const owner = await createCompanyWithOwner("Rollback Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    await expect(
      db.$transaction(async (tx) => {
        const created = await notify(owner.companyId, { type: "customer.created", title: "Gone" }, tx);
        expect(created.inApp).toBe(2); // owner and accountant
        throw new Error("The event failed");
      }),
    ).rejects.toThrow("The event failed");
    expect(await inbox(accountant)).toEqual([]);
  });
});

describe("scheduled reminders", () => {
  it("sends overdue and deadline reminders once, however often the check runs", async () => {
    const owner = await createCompanyWithOwner("Reminder Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Dana Due");
    const { ctx: manager, employee: managerEmployee } = await linkedMember(owner, "Manager", "Pat PM");
    const customer = await customerService.create(owner, { name: "Late Payer" });

    const overdue = await invoiceService.create(owner, invoiceInput(customer.id, addDays(today(), -3)));
    await invoiceService.markSent(owner, overdue.id);
    const notDue = await invoiceService.create(owner, invoiceInput(customer.id, addDays(today(), 3)));
    await invoiceService.markSent(owner, notDue.id);

    const project = await projectService.create(
      owner,
      projectSchema.parse({
        name: "Rollout",
        status: "ACTIVE",
        startDate: addDays(today(), -20),
        endDate: addDays(today(), 2),
        managerId: managerEmployee.id,
      }),
    );
    const dueTomorrow = await taskService.create(
      owner,
      taskSchema.parse({
        name: "Final check",
        projectId: project.id,
        priority: "HIGH",
        status: "IN_PROGRESS",
        assigneeId: employee.id,
        dueDate: addDays(today(), 1),
      }),
    );
    await taskService.create(
      owner,
      taskSchema.parse({
        name: "Later",
        projectId: project.id,
        priority: "LOW",
        status: "TODO",
        assigneeId: employee.id,
        dueDate: addDays(today(), 5),
      }),
    );
    await taskService.create(
      owner,
      taskSchema.parse({
        name: "Done already",
        projectId: project.id,
        priority: "LOW",
        status: "COMPLETED",
        assigneeId: employee.id,
        dueDate: addDays(today(), -1),
      }),
    );

    const first = await notificationScheduleService.checkCompany(owner.companyId, today());
    const second = await notificationScheduleService.checkCompany(owner.companyId, today());
    expect(first.invoices).toBeGreaterThan(0);
    expect(second).toEqual({ invoices: 0, tasks: 0, projects: 0 });

    const overdueAlerts = (await inbox(accountant)).filter((row) => row.type === "invoice.overdue");
    expect(overdueAlerts.map((row) => row.entityId)).toEqual([overdue.id]);
    expect(overdueAlerts[0]?.title).toContain("is overdue");

    const workerTypes = (await inbox(worker)).filter((row) => row.type === "task.deadline");
    expect(workerTypes.map((row) => [row.entityId, row.title])).toEqual([
      [dueTomorrow.id, "Task TSK-0001 is due tomorrow"],
    ]);
    // The project manager hears about the task and about the project.
    const managerTypes = (await inbox(manager))
      .map((row) => row.type)
      .filter((type) => type.endsWith(".deadline"))
      .sort();
    expect(managerTypes).toEqual(["project.deadline", "task.deadline"]);
    expect((await inbox(manager)).find((row) => row.type === "project.deadline")?.title).toBe(
      "Project Rollout is due in 2 days",
    );

    // The next stage (overdue) is a new reminder.
    const later = await notificationScheduleService.checkCompany(owner.companyId, addDays(today(), 2));
    expect(later.tasks).toBeGreaterThan(0);
    expect((await inbox(worker)).filter((row) => row.type === "task.deadline")).toHaveLength(2);
  });

  it("runs every active company and keeps them apart", async () => {
    const a = await createCompanyWithOwner("Run A");
    const b = await createCompanyWithOwner("Run B");
    const { ctx: accountantB } = await addMember(b, "Accountant");
    const customer = await customerService.create(a, { name: "Only A" });
    const invoice = await invoiceService.create(a, invoiceInput(customer.id, addDays(today(), -1)));
    await invoiceService.markSent(a, invoice.id);

    const results = await notificationScheduleService.runAll();
    expect(results.map((row) => row.companyId).sort()).toEqual([a.companyId, b.companyId].sort());
    expect(results.every((row) => row.error === undefined)).toBe(true);
    expect((await inbox(accountantB)).filter((row) => row.type === "invoice.overdue")).toEqual([]);
  });
});

describe("email outbox", () => {
  it("delivers queued emails once and retries failures with backoff, then gives up", async () => {
    const owner = await createCompanyWithOwner("Outbox Co");
    const { ctx: hr } = await addMember(owner, "HR Manager");
    const { ctx: bounced, email: bouncedEmail } = await addMember(owner, "HR Manager");
    bouncing.add(bouncedEmail);
    const { employee } = await linkedMember(owner, "Employee", "Eve Employee");
    await settingsService.set(owner, "hr.workDays", [0, 1, 2, 3, 4, 5, 6]);
    await leaveService.create(owner, {
      employeeId: employee.id,
      type: "CASUAL",
      startDate: addDays(today(), 5),
      endDate: addDays(today(), 5),
      reason: "Errand",
    });
    // Whoever filed the request on the employee's behalf isn't notified about it.
    expect(await outbox(owner)).toEqual([]);
    const [delivered] = await outbox(hr);
    expect(delivered?.status).toBe("PENDING");

    memoryOutbox.length = 0;
    const result = await notificationService.dispatchEmails(500);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(memoryOutbox.map((message) => message.to)).toEqual([
      (await rawDb.user.findUniqueOrThrow({ where: { id: hr.userId } })).email,
    ]);
    expect(memoryOutbox[0]?.text).toContain("/hr/leave/");
    expect((await outbox(hr))[0]).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
    expect((await outbox(hr))[0]?.sentAt).not.toBeNull();

    const [failing] = await outbox(bounced);
    expect(failing).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Mailbox unavailable" });
    expect(failing?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: nothing is retried, nothing is sent twice.
    expect(await notificationService.dispatchEmails(500)).toEqual({ claimed: 0, sent: 0, failed: 0 });

    // Make it due again until the last attempt.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await rawDb.emailOutbox.update({ where: { id: failing?.id }, data: { nextAttemptAt: new Date(0) } });
      await notificationService.dispatchEmails(500);
    }
    expect((await outbox(bounced))[0]).toMatchObject({ status: "FAILED", attempts: 5 });
    await rawDb.emailOutbox.update({ where: { id: failing?.id }, data: { nextAttemptAt: new Date(0) } });
    expect(await notificationService.dispatchEmails(500)).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });
});

describe("notification center", () => {
  it("lets users read and mark only their own notifications", async () => {
    const owner = await createCompanyWithOwner("Center Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: other } = await addMember(owner, "Accountant");
    await customerService.create(owner, { name: "First" });
    await customerService.create(owner, { name: "Second" });

    expect(await notificationService.unreadCount(accountant)).toBe(2);
    const page = await notificationService.list(accountant, notificationListQuerySchema.parse({}));
    expect(page.total).toBe(2);
    const [newest, oldest] = page.items;
    expect(newest?.title).toContain("Second");

    // Another user's ids are simply not matched.
    expect(await notificationService.setRead(other, [newest?.id ?? ""], true)).toBe(0);
    await expect(notificationService.open(other, newest?.id ?? "")).rejects.toBeInstanceOf(NotFoundError);

    expect(await notificationService.open(accountant, newest?.id ?? "")).toMatch(/^\/crm\/customers\//);
    expect(await notificationService.unreadCount(accountant)).toBe(1);
    const unread = await notificationService.list(
      accountant,
      notificationListQuerySchema.parse({ status: "unread" }),
    );
    expect(unread.items.map((row) => row.id)).toEqual([oldest?.id]);

    expect(await notificationService.setRead(accountant, [newest?.id ?? ""], false)).toBe(1);
    expect(await notificationService.markAllRead(accountant)).toBe(2);
    expect(await notificationService.unreadCount(accountant)).toBe(0);
    expect(await notificationService.unreadCount(other)).toBe(2);

    // Another company's member sees nothing of this company.
    const elsewhere = await createCompanyWithOwner("Center Other Co");
    expect(await notificationService.unreadCount(elsewhere)).toBe(0);
    await expect(notificationService.open(elsewhere, oldest?.id ?? "")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("audit log", () => {
  it("records who did what, from where, in the right company", async () => {
    const owner = await createCompanyWithOwner("Audit Co");
    const withClient: TenantContext = { ...owner, client: { ipAddress: "203.0.113.9", userAgent: "Vitest" } };
    const customer = await customerService.create(withClient, { name: "Tracked" });
    const entry = await rawDb.auditLog.findFirstOrThrow({
      where: { companyId: owner.companyId, action: "customer.create", entityId: customer.id },
    });
    expect(entry).toMatchObject({
      actorId: owner.userId,
      entityType: "Customer",
      ipAddress: "203.0.113.9",
      userAgent: "Vitest",
    });

    // Sign-in and sign-out land in the company's log.
    const user = await rawDb.user.findUniqueOrThrow({ where: { id: owner.userId } });
    await authService.verifyCredentials(
      { email: user.email, password: TEST_PASSWORD },
      { ipAddress: "198.51.100.1" },
    );
    await authService.recordLogout(owner.userId, { ipAddress: "198.51.100.1" }, owner.companyId);
    const auth = await rawDb.auditLog.findMany({
      where: { companyId: owner.companyId, action: { in: ["auth.login", "auth.logout"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(auth.map((row) => [row.action, row.ipAddress])).toEqual([
      ["auth.login", "198.51.100.1"],
      ["auth.logout", "198.51.100.1"],
    ]);
  });

  it("can't be changed or deleted, not even directly in the database", async () => {
    const owner = await createCompanyWithOwner("Immutable Co");
    await customerService.create(owner, { name: "Kept" });
    const entry = await rawDb.auditLog.findFirstOrThrow({ where: { companyId: owner.companyId } });
    await expect(
      rawDb.auditLog.update({ where: { id: entry.id }, data: { action: "customer.nothing" } }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(rawDb.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/cannot be deleted/);
    expect(await rawDb.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry);
  });

  it("searches and filters the company's log for authorized users only", async () => {
    const owner = await createCompanyWithOwner("Viewer Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: employee } = await addMember(owner, "Employee");
    const acme = await customerService.create(owner, { name: "Acme" });
    // Accountants can't create customers — the attempt is refused and not logged.
    await expect(customerService.create(accountant, { name: "Beta" })).rejects.toBeInstanceOf(ForbiddenError);
    const invoice = await invoiceService.create(accountant, invoiceInput(acme.id, "2099-12-31"));

    const other = await createCompanyWithOwner("Viewer Other Co");
    await customerService.create(other, { name: "Acme" });

    const all = await auditLogService.list(owner, auditLogQuerySchema.parse({ pageSize: 100 }));
    // Only this company's entries.
    expect(all.total).toBe(await rawDb.auditLog.count({ where: { companyId: owner.companyId } }));

    const invoices = await auditLogService.list(owner, auditLogQuerySchema.parse({ action: "invoice" }));
    expect(invoices.items.map((row) => row.action)).toEqual(["invoice.create"]);
    const exact = await auditLogService.list(owner, auditLogQuerySchema.parse({ action: "customer.create" }));
    expect(exact.items.map((row) => row.entityId)).toEqual([acme.id]);
    const byActor = await auditLogService.list(
      owner,
      auditLogQuerySchema.parse({ actorId: accountant.userId }),
    );
    expect(byActor.items.map((row) => row.entityId)).toContain(invoice.id);
    expect(byActor.items.every((row) => row.actor?.id === accountant.userId)).toBe(true);
    const byType = await auditLogService.list(owner, auditLogQuerySchema.parse({ entityType: "Invoice" }));
    expect(byType.items.map((row) => row.entityId)).toEqual([invoice.id]);
    const searched = await auditLogService.list(
      owner,
      auditLogQuerySchema.parse({ search: "Accountant User" }),
    );
    expect(searched.items.length).toBeGreaterThan(0);
    expect(searched.items.every((row) => row.actor?.id === accountant.userId)).toBe(true);
    const future = await auditLogService.list(
      owner,
      auditLogQuerySchema.parse({ from: addDays(today(), 1) }),
    );
    expect(future.total).toBe(0);
    const todays = await auditLogService.list(
      owner,
      auditLogQuerySchema.parse({ from: today(), to: today() }),
    );
    expect(todays.total).toBe(all.total);

    const options = await auditLogService.filterOptions(owner);
    expect(options.groups.map((group) => group.value)).toEqual(
      expect.arrayContaining(["customer", "invoice"]),
    );
    expect(options.entityTypes).toEqual(expect.arrayContaining(["Customer", "Invoice"]));

    // Another company's entry is not found; people without the permission are refused.
    const foreign = await rawDb.auditLog.findFirstOrThrow({ where: { companyId: other.companyId } });
    await expect(auditLogService.get(owner, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(auditLogService.list(employee, auditLogQuerySchema.parse({}))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(auditLogService.list(accountant, auditLogQuerySchema.parse({}))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(auditLogService.exportCsv(employee, auditLogQuerySchema.parse({}))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("exports the filtered entries as CSV, and audits the export", async () => {
    const owner = await createCompanyWithOwner("Export Co");
    await customerService.create(owner, { name: "Exported" });
    const { csv, rows, truncated } = await auditLogService.exportCsv(
      owner,
      auditLogQuerySchema.parse({ action: "customer" }),
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Time (UTC),User,Email,Action,Entity,Entity ID,IP address");
    expect(rows).toBe(1);
    expect(truncated).toBe(false);
    expect(lines[1]).toContain(",customer.create,Customer,");
    expect(
      await rawDb.auditLog.count({ where: { companyId: owner.companyId, action: "audit_log.export" } }),
    ).toBe(1);
  });
});
