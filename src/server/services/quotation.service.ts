import "server-only";
import { formatRecordNumber } from "@/config/records";
import { QUOTATION_STATUS_LABELS, quotationDisplayStatus, type QuotationStatusKey } from "@/config/sales";
import { addDays, dateOnlyToDate, dateToDateOnly, todayInZone } from "@/lib/date-range";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { money } from "@/lib/money";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { QuotationListQuery, SalesDocumentInput, SendDocumentInput } from "@/lib/validation";
import { leadRepository } from "@/server/repositories/lead.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { quotationRepository, type QuotationData } from "@/server/repositories/quotation.repository";
import { writeAuditLog } from "./audit.service";
import { companyService } from "./company.service";
import { invoiceService } from "./invoice.service";
import { recordHistory, snapshotText } from "./record-history";
import {
  assertActiveCustomer,
  itemsToInput,
  presentDocument,
  priceItems,
  salesContext,
} from "./sales-shared";
import { settingsService } from "./settings.service";

/**
 * Quotations and sales orders. A quotation is DRAFT → SENT → CONFIRMED (it becomes a sales order and gets an
 * order number) → INVOICED; it can also be DECLINED or CANCELLED. "Expired" is derived from the expiry date.
 * Every change is permission-checked, company-scoped, guarded by the current status in the UPDATE itself and
 * audited in the same transaction.
 */

const EDITABLE: QuotationStatusKey[] = ["DRAFT", "SENT"];
const CONVERTIBLE: QuotationStatusKey[] = ["DRAFT", "SENT", "CONFIRMED"];
const DELETABLE: QuotationStatusKey[] = ["DRAFT", "DECLINED", "CANCELLED"];

type Quotation = NonNullable<Awaited<ReturnType<typeof quotationRepository.findById>>>;

export function quotationCode(quotation: { number: number; orderNumber: number | null }) {
  return {
    code: formatRecordNumber("quotation", quotation.number),
    orderCode: quotation.orderNumber === null ? null : formatRecordNumber("order", quotation.orderNumber),
  };
}

/** A snapshot for the audit log: header, totals and line count (the lines themselves are in the table). */
function auditSnapshot(quotation: Quotation) {
  return {
    ...quotationCode(quotation),
    status: quotation.status,
    customerId: quotation.customerId,
    quoteDate: dateToDateOnly(quotation.quoteDate),
    expiryDate: dateToDateOnly(quotation.expiryDate),
    total: money(quotation.total),
    lines: quotation.items.length,
  };
}

async function toData(ctx: TenantContext, input: SalesDocumentInput) {
  await assertActiveCustomer(ctx, input.customerId);
  if (input.leadId) {
    const lead = await leadRepository.findById(ctx.companyId, input.leadId);
    if (!lead) throw new ValidationError("Choose a lead of this company.", { leadId: ["Unknown lead."] });
  }
  const { items, totals } = priceItems(input.items);
  const data: QuotationData = {
    customerId: input.customerId,
    leadId: input.leadId || null,
    quoteDate: dateOnlyToDate(input.issueDate),
    expiryDate: dateOnlyToDate(input.endDate),
    notes: input.notes || null,
    terms: input.terms || null,
    ...totals,
  };
  return { data, items };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "quotation.create": "Quotation created",
  "quotation.update": "Quotation updated",
  "quotation.duplicate": "Created as a copy",
  "quotation.send": "Sent to customer",
  "quotation.share": "Share link created",
  "quotation.confirm": "Confirmed — became a sales order",
  "quotation.decline": "Declined by customer",
  "quotation.cancel": "Cancelled",
  "quotation.convert": "Converted to invoice",
  "quotation.delete": "Deleted",
};

export const quotationService = {
  async list(ctx: TenantContext, query: QuotationListQuery) {
    authorize(ctx, "quotations:view");
    const { today } = await salesContext(ctx);
    return quotationRepository.list(ctx.companyId, query, today);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:view");
    const quotation = await quotationRepository.findById(ctx.companyId, id);
    if (!quotation) throw new NotFoundError("Quotation");
    return quotation;
  },

  /** Defaults for a new quotation: today, validity from settings, default terms. */
  async defaults(ctx: TenantContext) {
    authorize(ctx, "quotations:create");
    const { today } = await salesContext(ctx);
    const [validity, terms] = await Promise.all([
      settingsService.get(ctx, "sales.quotationValidityDays"),
      settingsService.get(ctx, "sales.documentTerms"),
    ]);
    return { issueDate: today, endDate: addDays(today, validity), terms };
  },

  async create(ctx: TenantContext, input: SalesDocumentInput) {
    authorize(ctx, "quotations:create");
    const [{ data, items }, { currency }] = await Promise.all([toData(ctx, input), salesContext(ctx)]);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "quotation", tx);
      const quotation = await quotationRepository.create(
        ctx.companyId,
        { number, currency },
        data,
        items,
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "quotation.create",
          entityType: "Quotation",
          entityId: quotation.id,
          after: auditSnapshot(quotation),
        },
        tx,
      );
      return quotation;
    });
  },

  async update(ctx: TenantContext, id: string, input: SalesDocumentInput) {
    authorize(ctx, "quotations:edit");
    const before = await this.get(ctx, id);
    if (!EDITABLE.includes(before.status)) {
      throw new ConflictError("Only draft and sent quotations can be edited.");
    }
    const { data, items } = await toData(ctx, input);
    return db.$transaction(async (tx) => {
      if (!(await quotationRepository.replace(ctx.companyId, id, EDITABLE, data, items, ctx.userId, tx))) {
        throw new ConflictError("The quotation changed meanwhile. Reload and try again.");
      }
      const after = await quotationRepository.findById(ctx.companyId, id, tx);
      if (!after) throw new NotFoundError("Quotation");
      await writeAuditLog(
        ctx,
        {
          action: "quotation.update",
          entityType: "Quotation",
          entityId: id,
          before: auditSnapshot(before),
          after: auditSnapshot(after),
        },
        tx,
      );
      return after;
    });
  },

  /** A new draft with the same customer and lines, dated today. */
  async duplicate(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:create");
    const source = await this.get(ctx, id);
    const defaults = await this.defaults(ctx);
    const copy = await this.create(ctx, {
      customerId: source.customerId,
      leadId: source.leadId ?? "",
      issueDate: defaults.issueDate,
      endDate: defaults.endDate,
      items: itemsToInput(source.items),
      notes: source.notes ?? "",
      terms: source.terms ?? "",
    });
    await writeAuditLog(ctx, {
      action: "quotation.duplicate",
      entityType: "Quotation",
      entityId: copy.id,
      metadata: { summary: `Copy of ${quotationCode(source).code}`, from: id },
    });
    return copy;
  },

  /** The document as shown on screen, printed and in the PDF. */
  async presentation(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:view");
    const quotation = await this.get(ctx, id);
    const sales = await salesContext(ctx);
    const { code, orderCode } = quotationCode(quotation);
    const isOrder = orderCode !== null;
    const status = quotationDisplayStatus(
      quotation.status,
      dateToDateOnly(quotation.expiryDate),
      sales.today,
    );
    const view = presentDocument(sales, {
      title: isOrder ? "Sales order" : "Quotation",
      code: orderCode ?? code,
      status: isOrder ? `Quotation ${code}` : QUOTATION_STATUS_LABELS[status],
      currency: quotation.currency,
      customer: quotation.customer,
      facts: [
        { label: "Date", value: quotation.quoteDate },
        isOrder && quotation.confirmedAt
          ? { label: "Confirmed", value: dateOnlyToDate(todayInZone(sales.timeZone, quotation.confirmedAt)) }
          : { label: "Valid until", value: quotation.expiryDate },
      ],
      items: quotation.items,
      totals: [
        { label: "Subtotal", value: quotation.subtotal },
        { label: "Discount", value: `-${money(quotation.discountTotal)}` },
        { label: "Tax", value: quotation.taxTotal },
        { label: "Total", value: quotation.total, strong: true },
      ],
      notes: quotation.notes,
      terms: quotation.terms,
    });
    return { view, filename: `${orderCode ?? code}.pdf`, quotation };
  },

  async pdf(ctx: TenantContext, id: string) {
    const { view, filename, quotation } = await this.presentation(ctx, id);
    const bytes = await renderSalesDocumentPdf({ ...view, logo: await companyService.getLogo(ctx) });
    return { bytes, filename, quotation };
  },

  /** Emails the PDF to the customer and marks a draft as sent. */
  async send(ctx: TenantContext, input: SendDocumentInput) {
    authorize(ctx, "quotations:edit");
    const { bytes, filename, quotation } = await this.pdf(ctx, input.id);
    if (!["DRAFT", "SENT", "CONFIRMED"].includes(quotation.status)) {
      throw new ConflictError("This quotation can no longer be sent.");
    }
    const sales = await salesContext(ctx);
    const { code, orderCode } = quotationCode(quotation);
    await sendEmail({
      ...emailTemplates.salesDocument(input.to, {
        companyName: sales.company.name,
        documentLabel: orderCode ? "Sales order" : "Quotation",
        code: orderCode ?? code,
        customerName: quotation.customer.name,
        total:
          formatMoney(money(quotation.total), { locale: sales.locale, currency: quotation.currency }) ?? "",
        dateLine: `Valid until ${formatCalendarDate(quotation.expiryDate, sales)}`,
        message: input.message || undefined,
      }),
      replyTo: sales.company.email ?? undefined,
      attachments: [{ filename, content: bytes, contentType: "application/pdf" }],
    });
    await db.$transaction(async (tx) => {
      // A draft becomes "sent"; a sent quotation or a sales order only records the new sending time.
      const data =
        quotation.status === "DRAFT"
          ? { status: "SENT" as const, sentAt: new Date() }
          : { sentAt: new Date() };
      await quotationRepository.transition(ctx.companyId, input.id, [quotation.status], data, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "quotation.send",
          entityType: "Quotation",
          entityId: input.id,
          metadata: { to: input.to, summary: `To ${input.to}` },
        },
        tx,
      );
    });
  },

  /** The customer accepted: the quotation becomes a sales order with its own number. */
  async confirm(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:edit");
    const quotation = await this.get(ctx, id);
    if (!EDITABLE.includes(quotation.status))
      throw new ConflictError("Only draft or sent quotations can be confirmed.");
    return db.$transaction(async (tx) => {
      const orderNumber = await numberSequenceRepository.next(ctx.companyId, "sales_order", tx);
      const moved = await quotationRepository.transition(
        ctx.companyId,
        id,
        EDITABLE,
        { status: "CONFIRMED", orderNumber, confirmedAt: new Date() },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The quotation changed meanwhile. Reload and try again.");
      const orderCode = formatRecordNumber("order", orderNumber);
      await writeAuditLog(
        ctx,
        {
          action: "quotation.confirm",
          entityType: "Quotation",
          entityId: id,
          after: { status: "CONFIRMED", orderCode },
          metadata: { summary: `Sales order ${orderCode}` },
        },
        tx,
      );
      return orderCode;
    });
  },

  async setClosed(ctx: TenantContext, id: string, to: "DECLINED" | "CANCELLED") {
    authorize(ctx, "quotations:edit");
    const quotation = await this.get(ctx, id);
    const from: QuotationStatusKey[] = to === "DECLINED" ? EDITABLE : [...EDITABLE, "CONFIRMED"];
    if (!from.includes(quotation.status))
      throw new ConflictError(`This quotation can't be ${to.toLowerCase()} now.`);
    await db.$transaction(async (tx) => {
      if (!(await quotationRepository.transition(ctx.companyId, id, from, { status: to }, ctx.userId, tx))) {
        throw new ConflictError("The quotation changed meanwhile. Reload and try again.");
      }
      await writeAuditLog(
        ctx,
        {
          action: to === "DECLINED" ? "quotation.decline" : "quotation.cancel",
          entityType: "Quotation",
          entityId: id,
          before: { status: quotation.status },
          after: { status: to },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:delete");
    const quotation = await this.get(ctx, id);
    if (!DELETABLE.includes(quotation.status)) {
      throw new ConflictError("Only draft, declined or cancelled quotations can be deleted.");
    }
    await db.$transaction(async (tx) => {
      const { count } = await quotationRepository.softDelete(ctx.companyId, id, DELETABLE, ctx.userId, tx);
      if (count === 0) throw new ConflictError("The quotation changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action: "quotation.delete",
          entityType: "Quotation",
          entityId: id,
          before: auditSnapshot(quotation),
        },
        tx,
      );
    });
  },

  /** Creates an invoice with the quotation's lines and marks the quotation as invoiced — one transaction. */
  async convertToInvoice(ctx: TenantContext, id: string) {
    authorize(ctx, "quotations:edit");
    authorize(ctx, "invoices:create");
    const quotation = await this.get(ctx, id);
    if (!CONVERTIBLE.includes(quotation.status))
      throw new ConflictError("This quotation can't be converted any more.");
    const { code, orderCode } = quotationCode(quotation);
    return db.$transaction(async (tx) => {
      const moved = await quotationRepository.transition(
        ctx.companyId,
        id,
        CONVERTIBLE,
        { status: "INVOICED" },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The quotation changed meanwhile. Reload and try again.");
      const invoice = await invoiceService.createInTransaction(
        ctx,
        {
          customerId: quotation.customerId,
          items: itemsToInput(quotation.items),
          notes: quotation.notes ?? "",
          terms: quotation.terms ?? "",
        },
        { quotationId: id, source: orderCode ?? code },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "quotation.convert",
          entityType: "Quotation",
          entityId: id,
          before: { status: quotation.status },
          after: { status: "INVOICED", invoiceId: invoice.id },
          metadata: { summary: `Invoice ${invoice.code}` },
        },
        tx,
      );
      return invoice;
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Quotation", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        total: "total",
        customerId: "customer",
        quoteDate: "date",
        expiryDate: "expiry date",
        lines: "lines",
        status: "status",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
