import "server-only";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS } from "@/config/sales";
import { addDays, dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { compareMoney, money } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { PaymentInput, PaymentListQuery } from "@/lib/validation";
import type { DbClient } from "@/server/repositories/helpers";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { writeAuditLog } from "./audit.service";
import { invoiceBalance } from "./invoice.service";
import { salesContext } from "./sales-shared";

/**
 * Payments against invoices. Each change runs in one transaction that locks the invoice row (SELECT … FOR
 * UPDATE), so concurrent payments can't overpay; the invoice's amount paid is recomputed from the payments
 * (never incremented blindly) and its status follows: nothing paid → SENT, part → PARTIALLY_PAID, all → PAID.
 * Payments are never deleted — a mistake is voided with a reason, which is audited.
 */

async function recompute(ctx: TenantContext, invoiceId: string, total: string, tx: DbClient) {
  const paid = money((await paymentRepository.sumActive(ctx.companyId, invoiceId, tx)) ?? "0");
  const status =
    compareMoney(paid, "0.00") === 0 ? "SENT" : compareMoney(paid, total) >= 0 ? "PAID" : "PARTIALLY_PAID";
  await invoiceRepository.setPaymentState(
    ctx.companyId,
    invoiceId,
    { amountPaid: paid, status },
    ctx.userId,
    tx,
  );
  return { paid, status };
}

export const paymentService = {
  async list(ctx: TenantContext, query: PaymentListQuery) {
    authorize(ctx, "payments:view");
    return paymentRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "payments:view");
    const payment = await paymentRepository.findById(ctx.companyId, id);
    if (!payment) throw new NotFoundError("Payment");
    return payment;
  },

  async listForInvoice(ctx: TenantContext, invoiceId: string) {
    authorize(ctx, "payments:view");
    return paymentRepository.listForInvoice(ctx.companyId, invoiceId);
  },

  async listForCustomer(ctx: TenantContext, customerId: string) {
    authorize(ctx, "payments:view");
    return paymentRepository.listForCustomer(ctx.companyId, customerId);
  },

  async record(ctx: TenantContext, input: PaymentInput) {
    authorize(ctx, "payments:create");
    const { today } = await salesContext(ctx);
    // Allow for the customer being a day ahead of the company's time zone, nothing more.
    if (input.paymentDate > addDays(today, 1)) {
      throw new ValidationError("The payment date can't be in the future.", {
        paymentDate: ["Can't be in the future."],
      });
    }
    const amount = money(input.amount);

    return db.$transaction(async (tx) => {
      if (!(await invoiceRepository.lock(ctx.companyId, input.invoiceId, tx)))
        throw new NotFoundError("Invoice");
      const invoice = await invoiceRepository.findById(ctx.companyId, input.invoiceId, tx);
      if (!invoice) throw new NotFoundError("Invoice");
      if (invoice.status === "DRAFT")
        throw new ConflictError("Send the invoice (or mark it as sent) before recording payments.");
      if (invoice.status === "CANCELLED")
        throw new ConflictError("A cancelled invoice can't receive payments.");
      if (invoice.status === "PAID") throw new ConflictError("This invoice is already paid in full.");
      const balance = invoiceBalance(invoice);
      if (compareMoney(amount, balance) > 0) {
        throw new ValidationError(`The amount is more than the balance due (${balance}).`, {
          amount: [`Can't be more than the balance due (${balance}).`],
        });
      }

      const number = await numberSequenceRepository.next(ctx.companyId, "payment", tx);
      const payment = await paymentRepository.create(
        ctx.companyId,
        number,
        {
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          amount,
          method: input.method,
          reference: input.reference || null,
          paymentDate: dateOnlyToDate(input.paymentDate),
          notes: input.notes || null,
        },
        ctx.userId,
        tx,
      );
      const total = money(invoice.total);
      const state = await recompute(ctx, invoice.id, total, tx);
      const code = formatRecordNumber("payment", number);
      await writeAuditLog(
        ctx,
        {
          action: "payment.record",
          entityType: "Payment",
          entityId: payment.id,
          after: {
            code,
            invoice: invoice.code,
            amount,
            method: input.method,
            reference: input.reference || null,
          },
        },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "invoice.payment_recorded",
          entityType: "Invoice",
          entityId: invoice.id,
          before: { status: invoice.status, amountPaid: money(invoice.amountPaid) },
          after: { status: state.status, amountPaid: state.paid },
          metadata: {
            summary: `${code}: ${amount} by ${PAYMENT_METHOD_LABELS[input.method].toLowerCase()}`,
            paymentId: payment.id,
          },
        },
        tx,
      );
      return payment;
    });
  },

  /** Voids a payment (it stays on record) and puts the amount back on the invoice's balance. */
  async void(ctx: TenantContext, id: string, reason: string) {
    authorize(ctx, "payments:delete");
    const payment = await this.get(ctx, id);
    if (payment.voidedAt) throw new ConflictError("This payment is already voided.");
    return db.$transaction(async (tx) => {
      if (!(await invoiceRepository.lock(ctx.companyId, payment.invoiceId, tx)))
        throw new NotFoundError("Invoice");
      const invoice = await invoiceRepository.findById(ctx.companyId, payment.invoiceId, tx);
      if (!invoice) throw new NotFoundError("Invoice");
      const { count } = await paymentRepository.void(ctx.companyId, id, reason, ctx.userId, tx);
      if (count === 0) throw new ConflictError("This payment is already voided.");
      const state = await recompute(ctx, invoice.id, money(invoice.total), tx);
      const code = formatRecordNumber("payment", payment.number);
      await writeAuditLog(
        ctx,
        {
          action: "payment.void",
          entityType: "Payment",
          entityId: id,
          before: { voided: false },
          after: { voided: true, reason },
        },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "invoice.payment_voided",
          entityType: "Invoice",
          entityId: invoice.id,
          before: { status: invoice.status, amountPaid: money(invoice.amountPaid) },
          after: { status: state.status, amountPaid: state.paid },
          metadata: { summary: `${code} voided: ${reason}`, paymentId: id },
        },
        tx,
      );
      return state;
    });
  },
};
