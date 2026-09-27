import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { leadListQuerySchema, leadSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";
import { leadService } from "@/server/services/lead.service";
import { memberService } from "@/server/services/member.service";
import { roleService } from "@/server/services/role.service";
import { addMember, contextFor, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const query = (overrides: Record<string, unknown> = {}) => leadListQuerySchema.parse(overrides);

describe("leads: CRUD and pipeline", () => {
  it("creates with every field, edits, moves through the pipeline and soft-deletes, with audit", async () => {
    const ctx = await createCompanyWithOwner("Leads Co");
    const input = leadSchema.parse({
      name: "Omar Khalid",
      companyName: "Khalid Logistics",
      phone: "+968 9000 0000",
      email: "omar@khalid.test",
      source: "REFERRAL",
      assignedToId: ctx.userId,
      status: "NEW",
      expectedValue: "12500.50",
      notes: "Needs fleet tracking.",
      followUpDate: "2026-10-05",
    });
    const lead = await leadService.create(ctx, input);
    expect(lead).toMatchObject({
      number: 1,
      name: "Omar Khalid",
      source: "REFERRAL",
      status: "NEW",
      assignedTo: { id: ctx.userId },
      followUpDate: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(lead.expectedValue?.toString()).toBe("12500.5");

    await leadService.update(ctx, lead.id, { followUpDate: "", assignedToId: "" });
    expect(await leadService.get(ctx, lead.id)).toMatchObject({ followUpDate: null, assignedTo: null });

    for (const status of ["CONTACTED", "QUALIFIED", "PROPOSAL"] as const)
      await leadService.setStatus(ctx, lead.id, status);
    expect((await leadService.get(ctx, lead.id)).status).toBe("PROPOSAL");

    const history = await leadService.history(ctx, lead.id);
    expect(history.slice(0, 3).map((entry) => entry.detail)).toEqual([
      "Qualified → Proposal",
      "Contacted → Qualified",
      "New → Contacted",
    ]);
    expect(history.at(-1)?.label).toBe("Lead created");

    await leadService.remove(ctx, lead.id);
    await expect(leadService.get(ctx, lead.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await rawDb.auditLog.count({ where: { entityType: "Lead", entityId: lead.id } })).toBe(6);
  });

  it("lists with search, filters and pagination, and builds the board per stage", async () => {
    const ctx = await createCompanyWithOwner("Board Co");
    const { ctx: manager } = await addMember(ctx, "Manager");
    await leadService.create(ctx, { name: "Alpha", source: "WEBSITE", expectedValue: "100" });
    await leadService.create(ctx, {
      name: "Bravo",
      source: "EVENT",
      assignedToId: manager.userId,
      expectedValue: "250.25",
    });
    await leadService.create(ctx, {
      name: "Charlie",
      status: "WON",
      assignedToId: ctx.userId,
      expectedValue: "1000",
    });

    const names = async (overrides: Record<string, unknown>) =>
      (await leadService.list(ctx, query(overrides))).items.map((lead) => lead.name);
    expect(await names({ search: "brav" })).toEqual(["Bravo"]);
    expect(await names({ search: "LEAD-0003" })).toEqual(["Charlie"]);
    expect(await names({ source: "WEBSITE" })).toEqual(["Alpha"]);
    expect(await names({ status: "WON" })).toEqual(["Charlie"]);
    expect(await names({ assignee: "me" })).toEqual(["Charlie"]);
    expect(await names({ assignee: "none" })).toEqual(["Alpha"]);
    expect(await names({ assignee: manager.userId })).toEqual(["Bravo"]);
    expect(await leadService.list(ctx, query({ pageSize: 2, page: 2 }))).toMatchObject({
      total: 3,
      items: [{ name: "Alpha" }],
    });

    const board = await leadService.board(ctx, {});
    expect(
      board.map((column) => [column.status, column.total, column.expectedValue?.toString() ?? null]),
    ).toEqual([
      ["NEW", 2, "350.25"],
      ["CONTACTED", 0, null],
      ["QUALIFIED", 0, null],
      ["PROPOSAL", 0, null],
      ["NEGOTIATION", 0, null],
      ["WON", 1, "1000"],
      ["LOST", 0, null],
    ]);
  });

  it("only assigns leads to active members of the same company", async () => {
    const a = await createCompanyWithOwner("Assign A");
    const b = await createCompanyWithOwner("Assign B");
    await expect(leadService.create(a, { name: "X", assignedToId: b.userId })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const lead = await leadService.create(a, { name: "Y" });
    await expect(leadService.update(a, lead.id, { assignedToId: b.userId })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await leadService.assignableUsers(a)).map((user) => user.id)).toEqual([a.userId]);
  });

  it("converts a lead into a customer once, marking it Won and linking both", async () => {
    const ctx = await createCompanyWithOwner("Convert Co");
    await customerService.create(ctx, { name: "Existing" });
    const lead = await leadService.create(ctx, {
      name: "Nadia",
      companyName: "Nadia Studio",
      email: "nadia@studio.test",
      phone: "+1 555 0100",
      status: "NEGOTIATION",
      notes: "Warm",
    });
    const customer = await leadService.convert(ctx, lead.id);
    expect(customer).toMatchObject({
      number: 2,
      name: "Nadia",
      companyName: "Nadia Studio",
      email: "nadia@studio.test",
      phone: "+1 555 0100",
      type: "BUSINESS",
      notes: "Warm",
    });
    expect(await leadService.get(ctx, lead.id)).toMatchObject({
      status: "WON",
      customer: { id: customer.id, number: 2 },
    });
    await expect(leadService.convert(ctx, lead.id)).rejects.toBeInstanceOf(ConflictError);

    expect((await customerService.convertedLeads(ctx, customer.id))?.map((item) => item.code)).toEqual([
      "LEAD-0001",
    ]);
    const customerHistory = await customerService.history(ctx, customer.id);
    expect(customerHistory[0]).toMatchObject({
      label: "Customer created",
      detail: "Converted from lead LEAD-0001",
    });
  });
});

describe("leads: permissions", () => {
  it("Employee and Accountant have no lead access; Manager has full access; conversion needs customers:create", async () => {
    const owner = await createCompanyWithOwner("Lead Perms");
    const lead = await leadService.create(owner, { name: "Guarded" });
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: manager } = await addMember(owner, "Manager");

    for (const ctx of [employee, accountant]) {
      await expect(leadService.list(ctx, query())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.get(ctx, lead.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.board(ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.create(ctx, { name: "No" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.setStatus(ctx, lead.id, "WON")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.remove(ctx, lead.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(leadService.convert(ctx, lead.id)).rejects.toBeInstanceOf(ForbiddenError);
    }

    const own = await leadService.create(manager, { name: "Manager's" });
    await leadService.setStatus(manager, own.id, "QUALIFIED");
    await leadService.convert(manager, own.id);
    await leadService.remove(manager, lead.id);

    // A custom role that can edit leads but not create customers can't convert.
    const role = await roleService.create(owner, {
      name: "Lead editor",
      description: "",
      permissions: ["leads:view", "leads:edit"],
    });
    const { ctx: editor } = await addMember(owner, "Employee");
    const membership = await rawDb.membership.findUniqueOrThrow({
      where: { companyId_userId: { companyId: owner.companyId, userId: editor.userId } },
    });
    await memberService.changeRole(owner, membership.id, role.id);
    const leadEditor = await contextFor(editor.userId, owner.companyId);
    const another = await leadService.create(owner, { name: "Another" });
    await expect(leadService.convert(leadEditor, another.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leadService.setStatus(leadEditor, another.id, "CONTACTED")).resolves.toMatchObject({
      status: "CONTACTED",
    });
  });
});

describe("leads: tenant isolation", () => {
  it("Company A cannot read, change, move, convert or delete Company B's leads", async () => {
    const a = await createCompanyWithOwner("Lead Iso A");
    const b = await createCompanyWithOwner("Lead Iso B");
    const leadOfB = await leadService.create(b, { name: "B pipeline", expectedValue: "999" });

    expect((await leadService.list(a, query())).total).toBe(0);
    expect((await leadService.board(a, {})).every((column) => column.total === 0)).toBe(true);
    for (const attempt of [
      () => leadService.get(a, leadOfB.id),
      () => leadService.update(a, leadOfB.id, { name: "Hijacked" }),
      () => leadService.setStatus(a, leadOfB.id, "LOST"),
      () => leadService.convert(a, leadOfB.id),
      () => leadService.remove(a, leadOfB.id),
      () => leadService.history(a, leadOfB.id),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(await leadService.get(b, leadOfB.id)).toMatchObject({
      name: "B pipeline",
      status: "NEW",
      customerId: null,
    });
    expect(await rawDb.customer.count({ where: { companyId: a.companyId } })).toBe(0);
    // Lead numbers are per company.
    expect((await leadService.create(a, { name: "A first" })).number).toBe(1);
  });
});
