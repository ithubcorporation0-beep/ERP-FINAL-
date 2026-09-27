import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { customerListQuerySchema, customerSchema } from "@/lib/validation";
import { customerCommunicationService } from "@/server/services/customer-communication.service";
import { customerDocumentService } from "@/server/services/customer-document.service";
import { customerService } from "@/server/services/customer.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const query = (overrides: Record<string, unknown> = {}) => customerListQuerySchema.parse(overrides);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

const full = {
  name: "Aisha Rahman",
  companyName: "Rahman Trading",
  email: "Aisha@Rahman.test",
  phone: "+971 50 000 0000",
  whatsapp: "+971 50 000 0001",
  address: "Office 12, Deira",
  city: "Dubai",
  country: "AE",
  taxId: "TRN-100200",
  type: "BUSINESS" as const,
  status: "ACTIVE" as const,
  notes: "Prefers WhatsApp.",
};

describe("customers: CRUD", () => {
  it("creates with every field, numbers per company, audits, edits and soft-deletes", async () => {
    const ctx = await createCompanyWithOwner("CRM Co");
    const first = await customerService.create(ctx, customerSchema.parse(full));
    const second = await customerService.create(ctx, { name: "Second" });
    expect(first).toMatchObject({ ...full, email: "aisha@rahman.test", number: 1 });
    expect(second).toMatchObject({ number: 2, type: "BUSINESS", status: "ACTIVE", email: null });

    // "" clears a field, a missing key leaves it alone.
    const updated = await customerService.update(ctx, first.id, { city: "", status: "INACTIVE" });
    expect(updated).toMatchObject({ city: null, status: "INACTIVE", phone: full.phone });

    await customerService.remove(ctx, first.id);
    await expect(customerService.get(ctx, first.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      deletedAt: expect.any(Date),
    });
    // Numbers are never reused, even after a delete.
    expect((await customerService.create(ctx, { name: "Third" })).number).toBe(3);

    const actions = await rawDb.auditLog.findMany({
      where: { entityType: "Customer", entityId: first.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, actorId: true },
    });
    expect(actions).toEqual([
      { action: "customer.create", actorId: ctx.userId },
      { action: "customer.update", actorId: ctx.userId },
      { action: "customer.delete", actorId: ctx.userId },
    ]);

    const history = await customerService.history(ctx, second.id);
    expect(history.map((entry) => entry.label)).toEqual(["Customer created"]);
  });

  it("keeps numbering separate per company and unique under concurrent creates", async () => {
    const a = await createCompanyWithOwner("Numbers A");
    const b = await createCompanyWithOwner("Numbers B");
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, index) => customerService.create(a, { name: `A${index}` })),
    );
    expect(created.map((customer) => customer.number).sort((x, y) => x - y)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect((await customerService.create(b, { name: "B first" })).number).toBe(1);
  });

  it("searches by name, company, email, phone and Customer ID, filters and sorts", async () => {
    const ctx = await createCompanyWithOwner("Search Co");
    await customerService.create(ctx, full);
    await customerService.create(ctx, {
      name: "Bob Stone",
      type: "INDIVIDUAL",
      status: "BLOCKED",
      country: "GB",
    });
    await customerService.create(ctx, { name: "Carla Diaz", email: "carla@diaz.test" });

    const names = async (overrides: Record<string, unknown>) =>
      (await customerService.list(ctx, query(overrides))).items.map((customer) => customer.name);

    expect(await names({ search: "rahman trad" })).toEqual(["Aisha Rahman"]);
    expect(await names({ search: "diaz.test" })).toEqual(["Carla Diaz"]);
    expect(await names({ search: "000 0001" })).toEqual(["Aisha Rahman"]);
    expect(await names({ search: "CUS-0002" })).toEqual(["Bob Stone"]);
    expect(await names({ type: "INDIVIDUAL" })).toEqual(["Bob Stone"]);
    expect(await names({ status: "BLOCKED" })).toEqual(["Bob Stone"]);
    expect(await names({ country: "AE" })).toEqual(["Aisha Rahman"]);
    expect(await names({ sort: "name", dir: "asc" })).toEqual(["Aisha Rahman", "Bob Stone", "Carla Diaz"]);
    expect(await names({ sort: "number", dir: "desc" })).toEqual(["Carla Diaz", "Bob Stone", "Aisha Rahman"]);

    const paged = await customerService.list(
      ctx,
      query({ pageSize: 2, page: 2, sort: "number", dir: "asc" }),
    );
    expect(paged).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(paged.items.map((customer) => customer.name)).toEqual(["Carla Diaz"]);
  });
});

describe("customers: communications and documents", () => {
  it("logs communications and notes with history", async () => {
    const ctx = await createCompanyWithOwner("Comms Co");
    const customer = await customerService.create(ctx, { name: "Talky" });
    await customerCommunicationService.add(ctx, customer.id, { channel: "NOTE", body: "VIP" });
    const call = await customerCommunicationService.add(ctx, customer.id, {
      channel: "CALL",
      direction: "OUTBOUND",
      subject: "Renewal",
      body: "Agreed to renew.",
      occurredAt: new Date("2026-09-01T10:00:00Z"),
    });
    expect(call).toMatchObject({ direction: "OUTBOUND", createdBy: { name: expect.any(String) } });

    const { items, total } = await customerCommunicationService.list(ctx, customer.id);
    expect(total).toBe(2);
    expect(items.map((item) => item.channel)).toEqual(["NOTE", "CALL"]); // newest occurrence first

    await customerCommunicationService.remove(ctx, customer.id, call.id);
    expect((await customerCommunicationService.list(ctx, customer.id)).total).toBe(1);

    const history = await customerService.history(ctx, customer.id);
    expect(history.map((entry) => [entry.label, entry.detail])).toEqual([
      ["Communication removed", "Call"],
      ["Communication logged", "Call: Renewal"],
      ["Communication logged", "Note"],
      ["Customer created", null],
    ]);
  });

  it("stores documents in company storage, checks their type and deletes them", async () => {
    const ctx = await createCompanyWithOwner("Docs Co");
    const customer = await customerService.create(ctx, { name: "Papers" });
    const document = await customerDocumentService.upload(ctx, customer.id, {
      name: "../../Contract 2026.pdf",
      bytes: PDF,
    });
    expect(document).toMatchObject({ name: "Contract 2026.pdf", contentType: "application/pdf" });
    expect(document.storageKey.startsWith(`companies/${ctx.companyId}/customers/${customer.id}/`)).toBe(true);

    const { body } = await customerDocumentService.download(ctx, customer.id, document.id);
    expect(new Uint8Array(body)).toEqual(PDF);

    await expect(
      customerDocumentService.upload(ctx, customer.id, {
        name: "invoice.pdf",
        bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await customerDocumentService.remove(ctx, customer.id, document.id);
    expect(await customerDocumentService.list(ctx, customer.id)).toEqual([]);
    expect(await getStorage().get(document.storageKey)).toBeNull();
  });
});

describe("customers: permissions", () => {
  it("follow the role: Accountant reads only, Employee has no access, Manager has full access", async () => {
    const owner = await createCompanyWithOwner("Perm Co");
    const customer = await customerService.create(owner, { name: "Guarded" });
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: manager } = await addMember(owner, "Manager");

    await expect(customerService.get(accountant, customer.id)).resolves.toMatchObject({ name: "Guarded" });
    await expect(customerService.create(accountant, { name: "No" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(customerService.update(accountant, customer.id, { name: "No" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(customerService.remove(accountant, customer.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      customerCommunicationService.add(accountant, customer.id, { channel: "NOTE", body: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      customerDocumentService.upload(accountant, customer.id, { name: "a.pdf", bytes: PDF }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(customerService.list(employee, query())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(customerService.get(employee, customer.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(customerService.history(employee, customer.id)).rejects.toBeInstanceOf(ForbiddenError);

    const created = await customerService.create(manager, { name: "Managed" });
    await customerService.update(manager, created.id, { city: "Muscat" });
    await customerService.remove(manager, created.id);
    // Nothing was written by the refused calls.
    expect(await rawDb.customer.count({ where: { companyId: owner.companyId } })).toBe(2);
  });
});

describe("customers: tenant isolation", () => {
  it("Company A cannot read, change or delete Company B's customers, notes or documents", async () => {
    const a = await createCompanyWithOwner("Iso A");
    const b = await createCompanyWithOwner("Iso B");
    const customerOfB = await customerService.create(b, { name: "B secret", email: "b@b.test" });
    const noteOfB = await customerCommunicationService.add(b, customerOfB.id, {
      channel: "NOTE",
      body: "B only",
    });
    const documentOfB = await customerDocumentService.upload(b, customerOfB.id, {
      name: "b.pdf",
      bytes: PDF,
    });

    expect((await customerService.list(a, query({ search: "secret" }))).items).toEqual([]);
    expect((await customerService.list(a, query({ search: "CUS-0001" }))).total).toBe(0);
    const refused = [
      () => customerService.get(a, customerOfB.id),
      () => customerService.update(a, customerOfB.id, { name: "Hijacked" }),
      () => customerService.remove(a, customerOfB.id),
      () => customerService.history(a, customerOfB.id),
      () => customerCommunicationService.list(a, customerOfB.id),
      () => customerCommunicationService.add(a, customerOfB.id, { channel: "NOTE", body: "x" }),
      () => customerCommunicationService.remove(a, customerOfB.id, noteOfB.id),
      () => customerDocumentService.list(a, customerOfB.id),
      () => customerDocumentService.download(a, customerOfB.id, documentOfB.id),
      () => customerDocumentService.remove(a, customerOfB.id, documentOfB.id),
      () => customerDocumentService.upload(a, customerOfB.id, { name: "x.pdf", bytes: PDF }),
    ];
    for (const attempt of refused) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);

    // A's own customer can't be used to reach B's note or document either.
    const customerOfA = await customerService.create(a, { name: "A's" });
    await expect(customerDocumentService.download(a, customerOfA.id, documentOfB.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(customerCommunicationService.remove(a, customerOfA.id, noteOfB.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // B's data is untouched.
    expect(await customerService.get(b, customerOfB.id)).toMatchObject({
      name: "B secret",
    });
    expect((await customerCommunicationService.list(b, customerOfB.id)).total).toBe(1);
    expect(await customerDocumentService.list(b, customerOfB.id)).toHaveLength(1);
  });

  it("the database refuses a document or note that points at another company's customer", async () => {
    const a = await createCompanyWithOwner("FK A");
    const b = await createCompanyWithOwner("FK B");
    const customerOfB = await customerService.create(b, { name: "B" });
    await expect(
      rawDb.customerCommunication.create({
        data: {
          companyId: a.companyId,
          customerId: customerOfB.id,
          channel: "NOTE",
          body: "x",
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow(/foreign key/i);
  });
});
