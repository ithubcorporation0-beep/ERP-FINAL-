import "server-only";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { supplierInvoiceStatus } from "@/lib/inventory";
import { addMoney, compareMoney, money, subtractMoney } from "@/lib/money";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { SupplierInvoiceInput, SupplierInvoiceListQuery, SupplierPaymentInput } from "@/lib/validation";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { purchaseOrderRepository } from "@/server/repositories/purchase-order.repository";
import { supplierInvoiceRepository } from "@/server/repositories/supplier-invoice.repository";
import { supplierRepository } from "@/server/repositories/supplier.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";

/**
 * Supplier invoices ("bills", `BILL-0001`) and supplier payments (`SPAY-0001`) — the last steps of purchasing.
 * - Reading needs `purchases:view`. Recording a bill or a payment moves money in the ledger, so it also needs
 *   `accounting:create`; cancelling a bill or voiding a payment needs `accounting:edit`.
 * - Recording a bill posts rule B1 (Dr Purchases / Cr Accounts Payable); paying posts B3 (Dr Accounts Payable /
 *   Cr Cash or Bank); cancelling / voiding post reversals (B2 / B4) — see docs/inventory.md.
 * - A bill linked to a purchase order can't bring the billed subtotal of that order above the order total.
 * - Payments lock the bill row and can't exceed its open balance; the paid amount is recomputed from the valid
 *   payments, never incremented blindly.
 */

type SupplierInvoice = NonNullable<Awaited<ReturnType<typeof supplierInvoiceRepository.findById>>>;

const HISTORY_ACTIONS: Record<string, string> = {
  "supplier_invoice.create": "Recorded",
  "supplier_invoice.cancel": "Cancelled",
  "supplier_invoice.payment": "Payment recorded",
  "supplier_invoice.payment_void": "Payment voided",
};

export function billBalance(invoice: { total: { toString(): string }; amountPaid: { toString(): string } }) {
  return subtractMoney(money(invoice.total), money(invoice.amountPaid));
}

export const supplierInvoiceService = {
  async list(ctx: TenantContext, query: SupplierInvoiceListQuery) {
    authorize(ctx, "purchases:view");
    return supplierInvoiceRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "purchases:view");
    const invoice = await supplierInvoiceRepository.findById(ctx.companyId, id);
    if (!invoice) throw new NotFoundError("Supplier invoice");
    return invoice;
  },

  abilities(ctx: TenantContext, invoice: SupplierInvoice) {
    const open = invoice.status === "UNPAID" || invoice.status === "PARTIALLY_PAID";
    return {
      pay: open && can(ctx, "accounting:create"),
      cancel: invoice.status === "UNPAID" && can(ctx, "accounting:edit"),
      voidPayments: can(ctx, "accounting:edit"),
    };
  },

  async create(ctx: TenantContext, input: SupplierInvoiceInput) {
    authorize(ctx, "purchases:view");
    authorize(ctx, "accounting:create");
    const supplier = await supplierRepository.findById(ctx.companyId, input.supplierId);
    if (!supplier) throw new ValidationError("Choose a supplier.", { supplierId: ["Choose a supplier."] });
    const orderId = input.orderId || null;
    const subtotal = money(input.subtotal);
    const taxAmount = money(input.taxAmount);
    const { currency } = await salesContext(ctx);
    return db.$transaction(async (tx) => {
      if (orderId) {
        const status = await purchaseOrderRepository.lock(ctx.companyId, orderId, tx);
        const order = await purchaseOrderRepository.findById(ctx.companyId, orderId, tx);
        if (
          !status ||
          !order ||
          order.supplierId !== supplier.id ||
          status === "DRAFT" ||
          status === "CANCELLED"
        ) {
          throw new ValidationError("Choose a placed purchase order of this supplier.", {
            orderId: ["Choose a placed order of this supplier."],
          });
        }
        const billed = money(await supplierInvoiceRepository.billedForOrder(ctx.companyId, orderId, tx));
        if (compareMoney(addMoney(billed, subtotal), money(order.total)) > 0) {
          throw new ValidationError("This bill would invoice more than the purchase order total.", {
            subtotal: [`At most ${subtractMoney(money(order.total), billed)} is left to bill on this order.`],
          });
        }
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "supplierInvoice", tx);
      const invoice = await supplierInvoiceRepository.create(
        ctx.companyId,
        { number, currency },
        {
          supplierId: supplier.id,
          orderId,
          supplierReference: input.supplierReference || null,
          invoiceDate: dateOnlyToDate(input.invoiceDate),
          dueDate: input.dueDate ? dateOnlyToDate(input.dueDate) : null,
          subtotal,
          taxAmount,
          total: addMoney(subtotal, taxAmount),
          notes: input.notes || null,
        },
        ctx.userId,
        tx,
      );
      const entry = await ledgerService.postSupplierInvoice(
        ctx.companyId,
        ctx.userId,
        invoice,
        supplier.name,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "supplier_invoice.create",
          entityType: "SupplierInvoice",
          entityId: invoice.id,
          after: {
            code: formatRecordNumber("supplierInvoice", number),
            supplierId: supplier.id,
            orderId,
            supplierReference: invoice.supplierReference,
            total: money(invoice.total),
          },
          metadata: { journalEntryId: entry.id },
        },
        tx,
      );
      return invoice;
    });
  },

  /** Cancels a bill nothing was paid on (reversal B2). */
  async cancel(ctx: TenantContext, id: string, reason: string) {
    authorize(ctx, "accounting:edit");
    const invoice = await this.get(ctx, id);
    const { today } = await salesContext(ctx);
    await db.$transaction(async (tx) => {
      if (!(await supplierInvoiceRepository.lock(ctx.companyId, id, tx)))
        throw new NotFoundError("Supplier invoice");
      const locked = await supplierInvoiceRepository.findById(ctx.companyId, id, tx);
      if (!locked || locked.status !== "UNPAID" || compareMoney(money(locked.amountPaid), "0.00") !== 0) {
        throw new ConflictError("Only unpaid bills can be cancelled. Void its payments first.");
      }
      await supplierInvoiceRepository.setState(
        ctx.companyId,
        id,
        { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
        ctx.userId,
        tx,
      );
      await ledgerService.postSupplierInvoiceCancelled(ctx.companyId, ctx.userId, invoice, today, tx);
      await writeAuditLog(
        ctx,
        {
          action: "supplier_invoice.cancel",
          entityType: "SupplierInvoice",
          entityId: id,
          before: { status: invoice.status },
          after: { status: "CANCELLED" },
          metadata: { summary: reason },
        },
        tx,
      );
    });
  },

  /** Records a payment to the supplier against a bill (rule B3). */
  async pay(ctx: TenantContext, input: SupplierPaymentInput) {
    authorize(ctx, "purchases:view");
    authorize(ctx, "accounting:create");
    const invoice = await this.get(ctx, input.invoiceId);
    const amount = money(input.amount);
    return db.$transaction(async (tx) => {
      if (!(await supplierInvoiceRepository.lock(ctx.companyId, invoice.id, tx)))
        throw new NotFoundError("Supplier invoice");
      const locked = await supplierInvoiceRepository.findById(ctx.companyId, invoice.id, tx);
      if (!locked || locked.status === "CANCELLED" || locked.status === "PAID") {
        throw new ConflictError("This bill is not open for payment.");
      }
      const balance = billBalance(locked);
      if (compareMoney(amount, balance) > 0) {
        throw new ValidationError(`The open balance is ${balance}.`, { amount: [`At most ${balance}.`] });
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "supplierPayment", tx);
      const payment = await supplierInvoiceRepository.createPayment(
        ctx.companyId,
        number,
        {
          supplierId: locked.supplierId,
          invoiceId: locked.id,
          amount,
          method: input.method,
          reference: input.reference || null,
          paymentDate: dateOnlyToDate(input.paymentDate),
          notes: input.notes || null,
        },
        ctx.userId,
        tx,
      );
      const paid = money(await supplierInvoiceRepository.paidTotal(ctx.companyId, locked.id, tx));
      const status = supplierInvoiceStatus(money(locked.total), paid);
      await supplierInvoiceRepository.setState(
        ctx.companyId,
        locked.id,
        { amountPaid: paid, status },
        ctx.userId,
        tx,
      );
      const code = formatRecordNumber("supplierInvoice", locked.number);
      const entry = await ledgerService.postSupplierPayment(
        ctx.companyId,
        ctx.userId,
        payment,
        code,
        locked.supplier.name,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "supplier_invoice.payment",
          entityType: "SupplierInvoice",
          entityId: locked.id,
          before: { status: locked.status, amountPaid: money(locked.amountPaid) },
          after: { status, amountPaid: paid },
          metadata: {
            summary: `${formatRecordNumber("supplierPayment", number)}: ${amount}`,
            paymentId: payment.id,
            journalEntryId: entry.id,
          },
        },
        tx,
      );
      return payment;
    });
  },

  /** Voids a payment (reason required): reversal B4, and the bill's balance is reopened. */
  async voidPayment(ctx: TenantContext, paymentId: string, reason: string) {
    authorize(ctx, "purchases:view");
    authorize(ctx, "accounting:edit");
    const payment = await supplierInvoiceRepository.findPayment(ctx.companyId, paymentId);
    if (!payment) throw new NotFoundError("Payment");
    const { today } = await salesContext(ctx);
    await db.$transaction(async (tx) => {
      if (!(await supplierInvoiceRepository.lock(ctx.companyId, payment.invoiceId, tx)))
        throw new NotFoundError("Supplier invoice");
      if (!(await supplierInvoiceRepository.voidPayment(ctx.companyId, paymentId, reason, ctx.userId, tx))) {
        throw new ConflictError("This payment was already voided.");
      }
      const locked = await supplierInvoiceRepository.findById(ctx.companyId, payment.invoiceId, tx);
      if (!locked) throw new NotFoundError("Supplier invoice");
      const paid = money(await supplierInvoiceRepository.paidTotal(ctx.companyId, locked.id, tx));
      const status = supplierInvoiceStatus(money(locked.total), paid);
      await supplierInvoiceRepository.setState(
        ctx.companyId,
        locked.id,
        { amountPaid: paid, status },
        ctx.userId,
        tx,
      );
      await ledgerService.postSupplierPaymentVoided(ctx.companyId, ctx.userId, payment, today, tx);
      await writeAuditLog(
        ctx,
        {
          action: "supplier_invoice.payment_void",
          entityType: "SupplierInvoice",
          entityId: locked.id,
          before: { status: locked.status, amountPaid: money(locked.amountPaid) },
          after: { status, amountPaid: paid },
          metadata: {
            summary: `${formatRecordNumber("supplierPayment", payment.number)}: ${reason}`,
            paymentId,
          },
        },
        tx,
      );
    });
  },

  async payments(
    ctx: TenantContext,
    query: { page: number; pageSize: number; supplierId?: string; search?: string },
  ) {
    authorize(ctx, "purchases:view");
    return supplierInvoiceRepository.listPayments(ctx.companyId, query);
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "SupplierInvoice", id, {
      actions: HISTORY_ACTIONS,
      fields: {},
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
