import "server-only";
import { formatInvoiceCode, formatRecordNumber } from "@/config/records";
import { INVOICE_STATUS_LABELS, invoiceDisplayStatus, type InvoiceStatusKey } from "@/config/sales";
import { addDays, dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { compareMoney, money, subtractMoney } from "@/lib/money";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document";
import { authorize, type TenantContext } from "@/lib/tenant";
import type {
  InvoiceListQuery,
  LineItemInput,
  SalesDocumentInput,
  SendDocumentInput,
} from "@/lib/validation";
import type { DbClient } from "@/server/repositories/helpers";
import { invoiceRepository, type InvoiceData } from "@/server/repositories/invoice.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { companyService } from "./company.service";
import { recordHistory, snapshotText } from "./record-history";
import { assertActiveCustomer, presentDocument, priceItems, salesContext } from "./sales-shared";
import { settingsService } from "./settings.service";

/**
 * Customer invoices. DRAFT (editable, deletable) → SENT → PARTIALLY_PAID → PAID, or CANCELLED (only without
 * payments). "Overdue" is derived from the due date. The invoice number is issued once, at creation, with the
 * company's prefix and never changes. Payment amounts are maintained by payment.service.ts.
 */

type Invoice = NonNullable<Awaited<ReturnType<typeof invoiceRepository.findById>>>;

/** Exact balance: total − amount paid. */
export function invoiceBalance(invoice: {
  total: { toString(): string };
  amountPaid: { toString(): string };
}) {
  return subtractMoney(money(invoice.total), money(invoice.amountPaid));
}

function auditSnapshot(invoice: Invoice) {
  return {
    code: invoice.code,
    status: invoice.status,
    customerId: invoice.customerId,
    invoiceDate: dateToDateOnly(invoice.invoiceDate),
    dueDate: dateToDateOnly(invoice.dueDate),
    total: money(invoice.total),
    amountPaid: money(invoice.amountPaid),
    lines: invoice.items.length,
  };
}

async function toData(
  ctx: TenantContext,
  input: SalesDocumentInput,
): Promise<{ data: InvoiceData; items: ReturnType<typeof priceItems>["items"] }> {
  await assertActiveCustomer(ctx, input.customerId);
  const { items, totals } = priceItems(input.items);
  return {
    data: {
      customerId: input.customerId,
      invoiceDate: dateOnlyToDate(input.issueDate),
      dueDate: dateOnlyToDate(input.endDate),
      notes: input.notes || null,
      terms: input.terms || null,
      ...totals,
    },
    items,
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "invoice.create": "Invoice created",
  "invoice.update": "Invoice updated",
  "invoice.send": "Sent to customer",
  "invoice.mark_sent": "Marked as sent",
  "invoice.share": "Share link created",
  "invoice.cancel": "Cancelled",
  "invoice.delete": "Deleted",
  "invoice.payment_recorded": "Payment recorded",
  "invoice.payment_voided": "Payment voided",
};

export const invoiceService = {
  async list(ctx: TenantContext, query: InvoiceListQuery) {
    authorize(ctx, "invoices:view");
    const { today } = await salesContext(ctx);
    return invoiceRepository.list(ctx.companyId, query, today);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "invoices:view");
    const invoice = await invoiceRepository.findById(ctx.companyId, id);
    if (!invoice) throw new NotFoundError("Invoice");
    return invoice;
  },

  /** Defaults for a new invoice: today, due date from the payment terms setting, default terms. */
  async defaults(ctx: TenantContext) {
    const { today } = await salesContext(ctx);
    const [termsDays, terms] = await Promise.all([
      settingsService.get(ctx, "sales.paymentTermsDays"),
      settingsService.get(ctx, "sales.documentTerms"),
    ]);
    return { issueDate: today, endDate: addDays(today, termsDays), terms };
  },

  async create(ctx: TenantContext, input: SalesDocumentInput) {
    authorize(ctx, "invoices:create");
    const { data, items } = await toData(ctx, input);
    return db.$transaction((tx) => this.insert(ctx, data, items, null, tx));
  },

  /**
   * Creates an invoice inside a caller's transaction (quotation → invoice). Dates come from today and the
   * payment terms setting.
   */
  async createInTransaction(
    ctx: TenantContext,
    input: { customerId: string; items: LineItemInput[]; notes: string; terms: string },
    link: { quotationId: string; source: string },
    tx: DbClient,
  ) {
    authorize(ctx, "invoices:create");
    const defaults = await this.defaults(ctx);
    const { data, items } = await toData(ctx, {
      ...input,
      issueDate: defaults.issueDate,
      endDate: defaults.endDate,
    });
    return this.insert(ctx, data, items, link, tx);
  },

  async insert(
    ctx: TenantContext,
    data: InvoiceData,
    items: ReturnType<typeof priceItems>["items"],
    link: { quotationId: string; source: string } | null,
    tx: DbClient,
  ) {
    const [{ currency }, prefix] = await Promise.all([
      salesContext(ctx),
      settingsService.get(ctx, "documents.invoiceNumberPrefix"),
    ]);
    const number = await numberSequenceRepository.next(ctx.companyId, "invoice", tx);
    const invoice = await invoiceRepository.create(
      ctx.companyId,
      { number, code: formatInvoiceCode(prefix, number), currency, quotationId: link?.quotationId ?? null },
      data,
      items,
      ctx.userId,
      tx,
    );
    await writeAuditLog(
      ctx,
      {
        action: "invoice.create",
        entityType: "Invoice",
        entityId: invoice.id,
        after: auditSnapshot(invoice),
        metadata: link ? { summary: `From ${link.source}`, quotationId: link.quotationId } : undefined,
      },
      tx,
    );
    return invoice;
  },

  async update(ctx: TenantContext, id: string, input: SalesDocumentInput) {
    authorize(ctx, "invoices:edit");
    const before = await this.get(ctx, id);
    if (before.status !== "DRAFT")
      throw new ConflictError("Only draft invoices can be edited. Cancel and re-issue instead.");
    const { data, items } = await toData(ctx, input);
    return db.$transaction(async (tx) => {
      if (!(await invoiceRepository.replaceDraft(ctx.companyId, id, data, items, ctx.userId, tx))) {
        throw new ConflictError("The invoice changed meanwhile. Reload and try again.");
      }
      const after = await invoiceRepository.findById(ctx.companyId, id, tx);
      if (!after) throw new NotFoundError("Invoice");
      await writeAuditLog(
        ctx,
        {
          action: "invoice.update",
          entityType: "Invoice",
          entityId: id,
          before: auditSnapshot(before),
          after: auditSnapshot(after),
        },
        tx,
      );
      return after;
    });
  },

  /** Issues a draft without emailing it (e.g. handed over on paper). */
  async markSent(ctx: TenantContext, id: string) {
    authorize(ctx, "invoices:edit");
    const invoice = await this.get(ctx, id);
    if (invoice.status !== "DRAFT") throw new ConflictError("Only draft invoices can be marked as sent.");
    await db.$transaction(async (tx) => {
      if (
        !(await invoiceRepository.transition(
          ctx.companyId,
          id,
          ["DRAFT"],
          { status: "SENT", sentAt: new Date() },
          ctx.userId,
          tx,
        ))
      ) {
        throw new ConflictError("The invoice changed meanwhile. Reload and try again.");
      }
      // Rule S1: an issued invoice is posted to the ledger.
      await ledgerService.postInvoiceIssued(ctx.companyId, ctx.userId, invoice, tx);
      await writeAuditLog(
        ctx,
        {
          action: "invoice.mark_sent",
          entityType: "Invoice",
          entityId: id,
          before: { status: "DRAFT" },
          after: { status: "SENT" },
        },
        tx,
      );
    });
  },

  /** The document as shown on screen, printed and in the PDF. */
  async presentation(ctx: TenantContext, id: string) {
    authorize(ctx, "invoices:view");
    const invoice = await this.get(ctx, id);
    const sales = await salesContext(ctx);
    const status = invoiceDisplayStatus(invoice.status, dateToDateOnly(invoice.dueDate), sales.today);
    const balance = invoiceBalance(invoice);
    const view = presentDocument(sales, {
      title: "Invoice",
      code: invoice.code,
      status: INVOICE_STATUS_LABELS[status],
      currency: invoice.currency,
      customer: invoice.customer,
      facts: [
        { label: "Invoice date", value: invoice.invoiceDate },
        { label: "Due date", value: invoice.dueDate },
        ...(invoice.quotation
          ? [
              {
                label: "Reference",
                value:
                  invoice.quotation.orderNumber === null
                    ? formatRecordNumber("quotation", invoice.quotation.number)
                    : formatRecordNumber("order", invoice.quotation.orderNumber),
              },
            ]
          : []),
      ],
      items: invoice.items,
      totals: [
        { label: "Subtotal", value: invoice.subtotal },
        { label: "Discount", value: `-${money(invoice.discountTotal)}` },
        { label: "Tax", value: invoice.taxTotal },
        { label: "Total", value: invoice.total, strong: true },
        { label: "Paid", value: invoice.amountPaid },
        { label: "Balance due", value: balance, strong: true },
      ],
      notes: invoice.notes,
      terms: invoice.terms,
    });
    return { view, filename: `${invoice.code}.pdf`, invoice };
  },

  async pdf(ctx: TenantContext, id: string) {
    const { view, filename, invoice } = await this.presentation(ctx, id);
    const bytes = await renderSalesDocumentPdf({ ...view, logo: await companyService.getLogo(ctx) });
    return { bytes, filename, invoice };
  },

  /** Emails the PDF to the customer; a draft becomes "sent". */
  async send(ctx: TenantContext, input: SendDocumentInput) {
    authorize(ctx, "invoices:edit");
    const { bytes, filename, invoice } = await this.pdf(ctx, input.id);
    if (invoice.status === "CANCELLED") throw new ConflictError("A cancelled invoice can't be sent.");
    const sales = await salesContext(ctx);
    const balance = invoiceBalance(invoice);
    await sendEmail({
      ...emailTemplates.salesDocument(input.to, {
        companyName: sales.company.name,
        documentLabel: "Invoice",
        code: invoice.code,
        customerName: invoice.customer.name,
        total: formatMoney(balance, { locale: sales.locale, currency: invoice.currency }) ?? "",
        dateLine: `Due on ${formatCalendarDate(invoice.dueDate, sales)}`,
        message: input.message || undefined,
      }),
      replyTo: sales.company.email ?? undefined,
      attachments: [{ filename, content: bytes, contentType: "application/pdf" }],
    });
    await db.$transaction(async (tx) => {
      const data =
        invoice.status === "DRAFT" ? { status: "SENT" as const, sentAt: new Date() } : { sentAt: new Date() };
      await invoiceRepository.transition(ctx.companyId, input.id, [invoice.status], data, ctx.userId, tx);
      if (invoice.status === "DRAFT")
        await ledgerService.postInvoiceIssued(ctx.companyId, ctx.userId, invoice, tx);
      await writeAuditLog(
        ctx,
        {
          action: "invoice.send",
          entityType: "Invoice",
          entityId: input.id,
          metadata: { to: input.to, summary: `To ${input.to}` },
        },
        tx,
      );
    });
  },

  /** Cancels an invoice that has no payments (void payments first). */
  async cancel(ctx: TenantContext, id: string) {
    authorize(ctx, "invoices:edit");
    const invoice = await this.get(ctx, id);
    const cancellable: InvoiceStatusKey[] = ["DRAFT", "SENT"];
    if (!cancellable.includes(invoice.status) || compareMoney(money(invoice.amountPaid), "0.00") !== 0) {
      throw new ConflictError("Only invoices without payments can be cancelled. Void the payments first.");
    }
    await db.$transaction(async (tx) => {
      const moved = await invoiceRepository.transition(
        ctx.companyId,
        id,
        cancellable,
        { status: "CANCELLED", cancelledAt: new Date() },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The invoice changed meanwhile. Reload and try again.");
      // Rule S2: an issued invoice's posting is reversed (a draft was never posted).
      if (invoice.status !== "DRAFT") {
        const { today } = await salesContext(ctx);
        await ledgerService.postInvoiceCancelled(ctx.companyId, ctx.userId, invoice, today, tx);
      }
      await writeAuditLog(
        ctx,
        {
          action: "invoice.cancel",
          entityType: "Invoice",
          entityId: id,
          before: { status: invoice.status },
          after: { status: "CANCELLED" },
        },
        tx,
      );
    });
  },

  /** Drafts only; an issued invoice is cancelled instead, so its number stays accounted for. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "invoices:delete");
    const invoice = await this.get(ctx, id);
    if (invoice.status !== "DRAFT")
      throw new ConflictError("Only draft invoices can be deleted. Cancel it instead.");
    await db.$transaction(async (tx) => {
      const { count } = await invoiceRepository.softDeleteDraft(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) throw new ConflictError("The invoice changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        { action: "invoice.delete", entityType: "Invoice", entityId: id, before: auditSnapshot(invoice) },
        tx,
      );
    });
  },

  async listForCustomer(ctx: TenantContext, customerId: string) {
    authorize(ctx, "invoices:view");
    return invoiceRepository.listForCustomer(ctx.companyId, customerId);
  },

  /** Invoices that can receive a payment. */
  async listPayable(ctx: TenantContext, customerId?: string) {
    authorize(ctx, "payments:create");
    return invoiceRepository.listPayable(ctx.companyId, customerId);
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Invoice", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        total: "total",
        customerId: "customer",
        invoiceDate: "invoice date",
        dueDate: "due date",
        lines: "lines",
        status: "status",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
