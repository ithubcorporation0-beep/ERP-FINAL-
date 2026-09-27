import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { dateToDateOnly, todayInZone } from "@/lib/date-range";
import { memoryOutbox } from "@/lib/email";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { money } from "@/lib/money";
import type { TenantContext } from "@/lib/tenant";
import {
  invoiceListQuerySchema,
  paymentListQuerySchema,
  quotationListQuerySchema,
  salesDocumentSchema,
} from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";
import { invoiceService } from "@/server/services/invoice.service";
import { leadService } from "@/server/services/lead.service";
import { paymentService } from "@/server/services/payment.service";
import { quotationService } from "@/server/services/quotation.service";
import { settingsService } from "@/server/services/settings.service";
import { shareLinkService } from "@/server/services/share-link.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");
const LINES = [
  { description: "Laptop", quantity: "3", unitPrice: "19.99", discountPercent: "10", taxRate: "5" },
  { description: "Setup service", quantity: "1.5", unitPrice: "0.35", discountPercent: "0", taxRate: "0" },
];

async function customerOf(ctx: TenantContext, name = "Buyer", email = "buyer@example.test") {
  return customerService.create(ctx, { name, email, phone: "+971 50 123 4567" });
}

function doc(customerId: string, overrides: Record<string, unknown> = {}) {
  return salesDocumentSchema.parse({
    customerId,
    issueDate: "2026-09-01",
    endDate: "2026-09-30",
    items: LINES,
    notes: "Thank you",
    terms: "Net 30",
    ...overrides,
  });
}

/** An invoice that's been issued (sent), ready for payments. */
async function issuedInvoice(ctx: TenantContext, customerId: string, items = LINES) {
  const invoice = await invoiceService.create(ctx, doc(customerId, { items, endDate: "2099-12-31" }));
  await invoiceService.markSent(ctx, invoice.id);
  return invoice;
}

const pay = (invoiceId: string, amount: string, extra: Record<string, unknown> = {}) => ({
  invoiceId,
  amount,
  method: "BANK_TRANSFER" as const,
  reference: "TRX-1",
  paymentDate: today(),
  notes: "",
  ...extra,
});

describe("quotations and sales orders", () => {
  it("prices lines exactly, numbers per company and follows the workflow to an invoice", async () => {
    const ctx = await createCompanyWithOwner("Sales Co");
    const customer = await customerOf(ctx);
    const quotation = await quotationService.create(ctx, doc(customer.id));
    expect(quotation).toMatchObject({ number: 1, status: "DRAFT", currency: "USD", orderNumber: null });
    expect(
      [quotation.subtotal, quotation.discountTotal, quotation.taxTotal, quotation.total].map(money),
    ).toEqual(["60.50", "6.00", "2.70", "57.20"]);
    expect(quotation.items.map((item) => money(item.lineTotal))).toEqual(["56.67", "0.53"]);

    // Edit: fewer lines, new totals.
    const edited = await quotationService.update(ctx, quotation.id, doc(customer.id, { items: [LINES[0]] }));
    expect(money(edited.total)).toBe("56.67");
    expect(edited.items).toHaveLength(1);

    // Duplicate: a new draft with the same lines.
    const copy = await quotationService.duplicate(ctx, quotation.id);
    expect(copy).toMatchObject({ number: 2, status: "DRAFT" });
    expect(money(copy.total)).toBe("56.67");

    // Send by email: PDF attached, draft → sent.
    await quotationService.send(ctx, { id: quotation.id, to: "buyer@example.test", message: "Here you go" });
    const email = memoryOutbox.at(-1);
    expect(email?.subject).toBe("Quotation QUO-0001 from Sales Co");
    expect(email?.attachments?.[0]?.filename).toBe("QUO-0001.pdf");
    expect(new TextDecoder().decode(email?.attachments?.[0]?.content.slice(0, 5))).toBe("%PDF-");
    expect((await quotationService.get(ctx, quotation.id)).status).toBe("SENT");

    // Confirm: becomes sales order SO-0001, then can't be edited.
    expect(await quotationService.confirm(ctx, quotation.id)).toBe("SO-0001");
    await expect(quotationService.update(ctx, quotation.id, doc(customer.id))).rejects.toBeInstanceOf(
      ConflictError,
    );
    const orders = await quotationService.list(ctx, quotationListQuerySchema.parse({ orders: "1" }));
    expect(orders.items.map((order) => order.orderNumber)).toEqual([1]);

    // Convert to invoice: same lines and totals, quotation marked invoiced, once only.
    const invoice = await quotationService.convertToInvoice(ctx, quotation.id);
    expect(invoice).toMatchObject({ code: "INV-0001", status: "DRAFT", quotationId: quotation.id });
    expect(money(invoice.total)).toBe("56.67");
    expect((await quotationService.get(ctx, quotation.id)).status).toBe("INVOICED");
    await expect(quotationService.convertToInvoice(ctx, quotation.id)).rejects.toBeInstanceOf(ConflictError);

    const history = await quotationService.history(ctx, quotation.id);
    expect(history.map((entry) => entry.label)).toEqual([
      "Converted to invoice",
      "Confirmed — became a sales order",
      "Sent to customer",
      "Quotation updated",
      "Quotation created",
    ]);
  });

  it("links a quotation to a lead, declines, cancels and deletes only in allowed states", async () => {
    const ctx = await createCompanyWithOwner("Quote States");
    const customer = await customerOf(ctx);
    const lead = await leadService.create(ctx, { name: "Lead" });
    const quotation = await quotationService.create(ctx, doc(customer.id, { leadId: lead.id }));
    expect(quotation.lead).toMatchObject({ id: lead.id });

    await quotationService.setClosed(ctx, quotation.id, "DECLINED");
    await expect(quotationService.confirm(ctx, quotation.id)).rejects.toBeInstanceOf(ConflictError);
    await quotationService.remove(ctx, quotation.id);
    await expect(quotationService.get(ctx, quotation.id)).rejects.toBeInstanceOf(NotFoundError);

    const other = await quotationService.create(ctx, doc(customer.id));
    await quotationService.confirm(ctx, other.id);
    await expect(quotationService.remove(ctx, other.id)).rejects.toBeInstanceOf(ConflictError);
    await quotationService.setClosed(ctx, other.id, "CANCELLED");
    await quotationService.remove(ctx, other.id);
  });

  it("derives Expired from the expiry date", async () => {
    const ctx = await createCompanyWithOwner("Expiry Co");
    const customer = await customerOf(ctx);
    await quotationService.create(ctx, doc(customer.id, { issueDate: "2020-01-01", endDate: "2020-01-31" }));
    await quotationService.create(ctx, doc(customer.id, { issueDate: today(), endDate: "2099-01-01" }));
    const expired = await quotationService.list(ctx, quotationListQuerySchema.parse({ status: "EXPIRED" }));
    const drafts = await quotationService.list(ctx, quotationListQuerySchema.parse({ status: "DRAFT" }));
    expect(expired.items.map((item) => item.number)).toEqual([1]);
    expect(drafts.items.map((item) => item.number)).toEqual([2]);
  });
});

describe("invoices", () => {
  it("uses the company's number prefix, edits drafts only, and cancels or deletes safely", async () => {
    const ctx = await createCompanyWithOwner("Invoice Co");
    const customer = await customerOf(ctx);
    const first = await invoiceService.create(ctx, doc(customer.id));
    expect(first.code).toBe("INV-0001");
    await settingsService.set(ctx, "documents.invoiceNumberPrefix", "AE-2026-");
    const second = await invoiceService.create(ctx, doc(customer.id));
    expect(second.code).toBe("AE-2026-0002");
    // An issued number never changes when the prefix does.
    expect((await invoiceService.get(ctx, first.id)).code).toBe("INV-0001");

    await invoiceService.update(ctx, first.id, doc(customer.id, { notes: "Updated" }));
    await invoiceService.markSent(ctx, first.id);
    await expect(invoiceService.update(ctx, first.id, doc(customer.id))).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(invoiceService.remove(ctx, first.id)).rejects.toBeInstanceOf(ConflictError);
    await invoiceService.cancel(ctx, first.id);
    expect((await invoiceService.get(ctx, first.id)).status).toBe("CANCELLED");

    await invoiceService.remove(ctx, second.id);
    await expect(invoiceService.get(ctx, second.id)).rejects.toBeInstanceOf(NotFoundError);
    // Numbers are never reused.
    expect((await invoiceService.create(ctx, doc(customer.id))).code).toBe("AE-2026-0003");
  });

  it("rejects bad documents: unknown customer, due before issue, too many decimals", async () => {
    const ctx = await createCompanyWithOwner("Invalid Co");
    const customer = await customerOf(ctx);
    await expect(invoiceService.create(ctx, doc(crypto.randomUUID()))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(salesDocumentSchema.safeParse({ ...doc(customer.id), endDate: "2026-08-01" }).success).toBe(false);
    for (const item of [
      { ...LINES[0], unitPrice: "1.005" },
      { ...LINES[0], quantity: "0" },
      { ...LINES[0], taxRate: "150" },
      { ...LINES[0], description: "" },
    ]) {
      expect(salesDocumentSchema.safeParse({ ...doc(customer.id), items: [item] }).success).toBe(false);
    }
    expect(salesDocumentSchema.safeParse({ ...doc(customer.id), items: [] }).success).toBe(false);
  });

  it("emails an invoice with its PDF and derives Overdue", async () => {
    const ctx = await createCompanyWithOwner("Mail Co");
    const customer = await customerOf(ctx);
    const invoice = await invoiceService.create(
      ctx,
      doc(customer.id, { issueDate: "2026-08-01", endDate: "2026-08-31" }),
    );
    await invoiceService.send(ctx, { id: invoice.id, to: "ap@buyer.test" });
    expect(memoryOutbox.at(-1)).toMatchObject({
      to: "ap@buyer.test",
      subject: "Invoice INV-0001 from Mail Co",
    });
    const overdue = await invoiceService.list(ctx, invoiceListQuerySchema.parse({ status: "OVERDUE" }));
    expect(overdue.items.map((item) => item.code)).toEqual(["INV-0001"]); // sent, unpaid, due date passed
    const sent = await invoiceService.list(ctx, invoiceListQuerySchema.parse({ status: "SENT" }));
    expect(sent.total).toBe(0); // an overdue invoice is listed as overdue, not as sent
  });

  it("renders a valid PDF, even for names outside the PDF font", async () => {
    const ctx = await createCompanyWithOwner("PDF Co");
    const customer = await customerOf(ctx, "محمد Müller 王");
    const many = Array.from({ length: 60 }, (_, index) => ({
      ...LINES[0],
      description: `Line ${index + 1} ${"long ".repeat(20)}`,
    }));
    const invoice = await invoiceService.create(ctx, doc(customer.id, { items: many }));
    const { bytes, filename } = await invoiceService.pdf(ctx, invoice.id);
    expect(filename).toBe("INV-0001.pdf");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("Invoice INV-0001");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});

describe("payments", () => {
  it("tracks partial and full payment with an exact balance, and voids", async () => {
    const ctx = await createCompanyWithOwner("Pay Co");
    const customer = await customerOf(ctx);
    const invoice = await issuedInvoice(ctx, customer.id); // total 57.20

    const first = await paymentService.record(ctx, pay(invoice.id, "20.10"));
    expect(first).toMatchObject({ number: 1, method: "BANK_TRANSFER", reference: "TRX-1" });
    let current = await invoiceService.get(ctx, invoice.id);
    expect([current.status, money(current.amountPaid)]).toEqual(["PARTIALLY_PAID", "20.10"]);

    await expect(paymentService.record(ctx, pay(invoice.id, "37.11"))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await paymentService.record(ctx, pay(invoice.id, "37.10", { method: "CASH" }));
    current = await invoiceService.get(ctx, invoice.id);
    expect([current.status, money(current.amountPaid)]).toEqual(["PAID", "57.20"]);
    await expect(paymentService.record(ctx, pay(invoice.id, "0.01"))).rejects.toBeInstanceOf(ConflictError);

    await paymentService.void(ctx, first.id, "Bounced transfer");
    current = await invoiceService.get(ctx, invoice.id);
    expect([current.status, money(current.amountPaid)]).toEqual(["PARTIALLY_PAID", "37.10"]);
    await expect(paymentService.void(ctx, first.id, "again")).rejects.toBeInstanceOf(ConflictError);
    await expect(invoiceService.cancel(ctx, invoice.id)).rejects.toBeInstanceOf(ConflictError);

    const list = await paymentService.list(ctx, paymentListQuerySchema.parse({ search: "PAY-0001" }));
    expect(list.items).toMatchObject([{ number: 1, voidReason: "Bounced transfer" }]);

    const history = await invoiceService.history(ctx, invoice.id);
    expect(history.slice(0, 3).map((entry) => entry.detail)).toEqual([
      "PAY-0001 voided: Bounced transfer",
      "PAY-0002: 37.10 by cash",
      "PAY-0001: 20.10 by bank transfer",
    ]);
  });

  it("refuses payments on drafts and cancelled invoices, and future dates", async () => {
    const ctx = await createCompanyWithOwner("Pay Rules");
    const customer = await customerOf(ctx);
    const draft = await invoiceService.create(ctx, doc(customer.id));
    await expect(paymentService.record(ctx, pay(draft.id, "1.00"))).rejects.toBeInstanceOf(ConflictError);
    await invoiceService.cancel(ctx, draft.id);
    await expect(paymentService.record(ctx, pay(draft.id, "1.00"))).rejects.toBeInstanceOf(ConflictError);
    const open = await issuedInvoice(ctx, customer.id);
    await expect(
      paymentService.record(ctx, pay(open.id, "1.00", { paymentDate: "2099-01-01" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("can't be overpaid by simultaneous payments", async () => {
    const ctx = await createCompanyWithOwner("Race Co");
    const customer = await customerOf(ctx);
    const invoice = await issuedInvoice(ctx, customer.id, [
      { description: "Item", quantity: "1", unitPrice: "100", discountPercent: "0", taxRate: "0" },
    ]);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => paymentService.record(ctx, pay(invoice.id, "60.00"))),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const after = await invoiceService.get(ctx, invoice.id);
    expect([after.status, money(after.amountPaid)]).toEqual(["PARTIALLY_PAID", "60.00"]);
  });

  it("the database itself refuses impossible amounts", async () => {
    const ctx = await createCompanyWithOwner("Checks Co");
    const customer = await customerOf(ctx);
    const invoice = await issuedInvoice(ctx, customer.id);
    await expect(
      rawDb.invoice.update({ where: { id: invoice.id }, data: { amountPaid: "999999" } }),
    ).rejects.toThrow(/invoices_amount_paid_in_range/);
    await expect(
      rawDb.payment.create({
        data: {
          companyId: ctx.companyId,
          number: 99,
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: "-5",
          method: "CASH",
          paymentDate: new Date(),
        },
      }),
    ).rejects.toThrow(/payments_amount_positive/);
  });
});

describe("share links (WhatsApp)", () => {
  it("open exactly one document's PDF until revoked or expired", async () => {
    const ctx = await createCompanyWithOwner("Share Co");
    const customer = await customerOf(ctx);
    const invoice = await invoiceService.create(ctx, doc(customer.id));
    const { url } = await shareLinkService.create(ctx, "INVOICE", invoice.id, invoice.code);
    const token = url.split("/").at(-1) ?? "";
    const opened = await shareLinkService.openDocument(token);
    expect(opened?.filename).toBe("INV-0001.pdf");

    expect(await shareLinkService.openDocument("x".repeat(43))).toBeNull();
    expect(await shareLinkService.openDocument("not a token")).toBeNull();

    await rawDb.shareLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await shareLinkService.openDocument(token)).toBeNull();

    const second = await shareLinkService.create(ctx, "INVOICE", invoice.id, invoice.code);
    await shareLinkService.revokeAll(ctx, "INVOICE", invoice.id);
    expect(await shareLinkService.openDocument(second.url.split("/").at(-1) ?? "")).toBeNull();
  });
});

describe("sales permissions", () => {
  it("follow the roles: Employee none, Accountant invoices + payments, Manager quotations + invoices", async () => {
    const owner = await createCompanyWithOwner("Sales Perms");
    const customer = await customerOf(owner);
    const quotation = await quotationService.create(owner, doc(customer.id));
    const invoice = await issuedInvoice(owner, customer.id);
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: manager } = await addMember(owner, "Manager");

    for (const attempt of [
      () => quotationService.list(employee, quotationListQuerySchema.parse({})),
      () => invoiceService.get(employee, invoice.id),
      () => paymentService.list(employee, paymentListQuerySchema.parse({})),
      () => invoiceService.pdf(employee, invoice.id),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError);
    }

    await expect(quotationService.get(accountant, quotation.id)).resolves.toBeTruthy();
    await expect(quotationService.create(accountant, doc(customer.id))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(quotationService.convertToInvoice(accountant, quotation.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await invoiceService.create(accountant, doc(customer.id));
    await paymentService.record(accountant, pay(invoice.id, "1.00"));

    await quotationService.create(manager, doc(customer.id));
    await quotationService.convertToInvoice(manager, quotation.id);
    await expect(paymentService.record(manager, pay(invoice.id, "1.00"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(invoiceService.remove(manager, invoice.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("sales tenant isolation", () => {
  it("Company A cannot read, change, send, pay, share or convert Company B's documents", async () => {
    const a = await createCompanyWithOwner("Sales A");
    const b = await createCompanyWithOwner("Sales B");
    const customerOfA = await customerOf(a, "A's customer");
    const customerOfB = await customerOf(b, "B's customer");
    const quotationOfB = await quotationService.create(b, doc(customerOfB.id));
    const invoiceOfB = await issuedInvoice(b, customerOfB.id);
    const paymentOfB = await paymentService.record(b, pay(invoiceOfB.id, "10.00"));

    expect((await quotationService.list(a, quotationListQuerySchema.parse({}))).total).toBe(0);
    expect((await invoiceService.list(a, invoiceListQuerySchema.parse({}))).total).toBe(0);
    expect((await paymentService.list(a, paymentListQuerySchema.parse({}))).total).toBe(0);

    for (const attempt of [
      () => quotationService.get(a, quotationOfB.id),
      () => quotationService.update(a, quotationOfB.id, doc(customerOfA.id)),
      () => quotationService.send(a, { id: quotationOfB.id, to: "x@example.test" }),
      () => quotationService.confirm(a, quotationOfB.id),
      () => quotationService.convertToInvoice(a, quotationOfB.id),
      () => quotationService.pdf(a, quotationOfB.id),
      () => quotationService.remove(a, quotationOfB.id),
      () => invoiceService.get(a, invoiceOfB.id),
      () => invoiceService.update(a, invoiceOfB.id, doc(customerOfA.id)),
      () => invoiceService.cancel(a, invoiceOfB.id),
      () => invoiceService.pdf(a, invoiceOfB.id),
      () => invoiceService.send(a, { id: invoiceOfB.id, to: "x@example.test" }),
      () => paymentService.record(a, pay(invoiceOfB.id, "1.00")),
      () => paymentService.get(a, paymentOfB.id),
      () => paymentService.void(a, paymentOfB.id, "hijack"),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }
    // B's customer can't be put on A's documents.
    await expect(quotationService.create(a, doc(customerOfB.id))).rejects.toBeInstanceOf(ValidationError);
    await expect(invoiceService.create(a, doc(customerOfB.id))).rejects.toBeInstanceOf(ValidationError);
    // The database refuses cross-company links too.
    await expect(
      rawDb.invoice.update({ where: { id: invoiceOfB.id }, data: { companyId: a.companyId } }),
    ).rejects.toThrow();

    const after = await invoiceService.get(b, invoiceOfB.id);
    expect([after.status, money(after.amountPaid)]).toEqual(["PARTIALLY_PAID", "10.00"]);
    // Per-company numbering.
    expect((await quotationService.create(a, doc(customerOfA.id))).number).toBe(1);
    expect(dateToDateOnly(after.invoiceDate)).toBe("2026-09-01");
  });
});
