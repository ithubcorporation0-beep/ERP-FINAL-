import "server-only";
import { type ExpensePaymentMethodKey, type ExpenseStatusKey } from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { isUnpaid } from "@/lib/accounting";
import { dateOnlyToDate, addDays } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { money } from "@/lib/money";
import { companyKey, getStorage } from "@/lib/storage";
import {
  cleanFileName,
  detectDocumentType,
  DOCUMENT_TYPES_HINT,
  MAX_DOCUMENT_BYTES,
} from "@/lib/storage/documents";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { ExpenseInput, ExpenseListQuery } from "@/lib/validation";
import { expenseRepository, type ExpenseScope } from "@/server/repositories/expense.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";

/**
 * Expenses and their approval workflow: PENDING → APPROVED (posted to the ledger, rule E1) or REJECTED (with a
 * reason; can be corrected and resubmitted). Record-level rule: people who can't approve or manage expenses see and
 * change only their own (submitted by them or for them). Approved expenses are locked; an unpaid one can later be
 * marked as paid (rule E2).
 */

const OPEN: ExpenseStatusKey[] = ["PENDING", "REJECTED"];

type Expense = NonNullable<Awaited<ReturnType<typeof expenseRepository.findById>>>;

/** May see and manage everyone's expenses (approvers, accountants). */
function seesAll(ctx: TenantContext): boolean {
  return can(ctx, "expenses:approve") || can(ctx, "expenses:edit") || can(ctx, "accounting:view");
}

function scope(ctx: TenantContext): ExpenseScope {
  return seesAll(ctx) ? {} : { ownerId: ctx.userId };
}

function isOwn(ctx: TenantContext, expense: Pick<Expense, "employeeId" | "createdById">): boolean {
  return expense.employeeId === ctx.userId || expense.createdById === ctx.userId;
}

/** Change a not-yet-approved expense: `expenses:<action>` for anyone's, or `expenses:create` for your own. */
function mayChange(
  ctx: TenantContext,
  expense: Pick<Expense, "employeeId" | "createdById">,
  action: "edit" | "delete",
): boolean {
  return can(ctx, `expenses:${action}`) || (isOwn(ctx, expense) && can(ctx, "expenses:create"));
}

function assertCanChange(ctx: TenantContext, expense: Expense, action: "edit" | "delete") {
  if (!mayChange(ctx, expense, action)) throw new ForbiddenError();
}

function snapshot(expense: Expense) {
  return {
    code: formatRecordNumber("expense", expense.number),
    category: expense.category,
    amount: money(expense.amount),
    expenseDate: expense.expenseDate.toISOString().slice(0, 10),
    vendor: expense.vendor,
    paymentMethod: expense.paymentMethod,
    description: expense.description,
    employeeId: expense.employeeId,
    status: expense.status,
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "expense.create": "Submitted",
  "expense.update": "Updated",
  "expense.approve": "Approved",
  "expense.reject": "Rejected",
  "expense.pay": "Marked as paid",
  "expense.receipt_upload": "Receipt attached",
  "expense.receipt_delete": "Receipt removed",
  "expense.delete": "Deleted",
};

export const expenseService = {
  /** Whether the list shows everyone's expenses or only the user's own. */
  seesAll,

  /** What the user may do with this expense now — drives the buttons; every action re-checks on the server. */
  abilities(
    ctx: TenantContext,
    expense: Pick<Expense, "employeeId" | "createdById" | "status" | "paymentMethod" | "paidAt">,
  ) {
    const open = OPEN.includes(expense.status);
    return {
      change: open && mayChange(ctx, expense, "edit"),
      delete: open && mayChange(ctx, expense, "delete"),
      approve: expense.status === "PENDING" && can(ctx, "expenses:approve"),
      reject: expense.status === "PENDING" && can(ctx, "expenses:reject"),
      pay: isUnpaid(expense) && can(ctx, "accounting:create"),
    };
  },

  async list(ctx: TenantContext, query: ExpenseListQuery) {
    authorize(ctx, "expenses:view");
    const own = query.mine || !seesAll(ctx) ? { ownerId: ctx.userId } : {};
    return expenseRepository.list(ctx.companyId, query, own);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "expenses:view");
    const expense = await expenseRepository.findById(ctx.companyId, id, scope(ctx));
    if (!expense) throw new NotFoundError("Expense");
    return expense;
  },

  /** People an expense can be filed for (approvers only; everyone else files for themselves). */
  async employees(ctx: TenantContext) {
    authorize(ctx, "expenses:view");
    return seesAll(ctx) ? membershipRepository.listActiveUsers(ctx.companyId) : [];
  },

  async resolveEmployee(ctx: TenantContext, employeeId: string | undefined) {
    if (!employeeId || employeeId === ctx.userId) return ctx.userId;
    if (!seesAll(ctx)) throw new ForbiddenError("You can only submit your own expenses.");
    const membership = await membershipRepository.findByUser(ctx.companyId, employeeId);
    if (membership?.status !== "ACTIVE") {
      throw new ValidationError("Choose a member of this company.", {
        employeeId: ["Choose a member of this company."],
      });
    }
    return employeeId;
  },

  async assertDate(ctx: TenantContext, date: string) {
    const { today } = await salesContext(ctx);
    if (date > addDays(today, 1)) {
      throw new ValidationError("The expense date can't be in the future.", {
        expenseDate: ["Can't be in the future."],
      });
    }
  },

  async create(ctx: TenantContext, input: ExpenseInput) {
    authorize(ctx, "expenses:create");
    await this.assertDate(ctx, input.expenseDate);
    const [employeeId, { currency }] = await Promise.all([
      this.resolveEmployee(ctx, input.employeeId),
      salesContext(ctx),
    ]);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "expense", tx);
      const expense = await expenseRepository.create(
        ctx.companyId,
        number,
        currency,
        {
          category: input.category,
          amount: money(input.amount),
          expenseDate: dateOnlyToDate(input.expenseDate),
          vendor: input.vendor || null,
          paymentMethod: input.paymentMethod,
          description: input.description,
          employeeId,
        },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "expense.create", entityType: "Expense", entityId: expense.id, after: snapshot(expense) },
        tx,
      );
      return expense;
    });
  },

  /** Edits a pending or rejected expense; a rejected one goes back to pending (resubmitted). */
  async update(ctx: TenantContext, id: string, input: ExpenseInput) {
    const before = await this.get(ctx, id);
    assertCanChange(ctx, before, "edit");
    if (!OPEN.includes(before.status)) throw new ConflictError("Approved expenses can't be changed.");
    await this.assertDate(ctx, input.expenseDate);
    const employeeId =
      input.employeeId === undefined ? before.employeeId : await this.resolveEmployee(ctx, input.employeeId);
    return db.$transaction(async (tx) => {
      const updated = await expenseRepository.update(
        ctx.companyId,
        id,
        OPEN,
        {
          category: input.category,
          amount: money(input.amount),
          expenseDate: dateOnlyToDate(input.expenseDate),
          vendor: input.vendor || null,
          paymentMethod: input.paymentMethod,
          description: input.description,
          employeeId,
          status: "PENDING",
          decisionNote: null,
          decidedAt: null,
          decidedById: null,
        },
        ctx.userId,
        tx,
      );
      if (!updated) throw new ConflictError("The expense changed meanwhile. Reload and try again.");
      const after = await expenseRepository.findById(ctx.companyId, id, {}, tx);
      if (!after) throw new NotFoundError("Expense");
      await writeAuditLog(
        ctx,
        {
          action: "expense.update",
          entityType: "Expense",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  },

  async approve(ctx: TenantContext, id: string, note?: string) {
    authorize(ctx, "expenses:approve");
    const expense = await this.get(ctx, id);
    if (expense.status !== "PENDING") throw new ConflictError("Only pending expenses can be approved.");
    return db.$transaction(async (tx) => {
      const moved = await expenseRepository.update(
        ctx.companyId,
        id,
        ["PENDING"],
        { status: "APPROVED", decisionNote: note || null, decidedAt: new Date(), decidedById: ctx.userId },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The expense changed meanwhile. Reload and try again.");
      // Rule E1: the approved expense is posted to the ledger in the same transaction.
      const entry = await ledgerService.postExpenseApproved(ctx.companyId, ctx.userId, expense, tx);
      await writeAuditLog(
        ctx,
        {
          action: "expense.approve",
          entityType: "Expense",
          entityId: id,
          before: { status: "PENDING" },
          after: { status: "APPROVED" },
          metadata: {
            summary: `Posted as ${formatRecordNumber("journal", entry.number)}`,
            journalEntryId: entry.id,
          },
        },
        tx,
      );
    });
  },

  async reject(ctx: TenantContext, id: string, note: string) {
    authorize(ctx, "expenses:reject");
    if (note.trim().length < 3) {
      throw new ValidationError("Say why the expense is rejected.", {
        note: ["Say why the expense is rejected."],
      });
    }
    const expense = await this.get(ctx, id);
    if (expense.status !== "PENDING") throw new ConflictError("Only pending expenses can be rejected.");
    await db.$transaction(async (tx) => {
      const moved = await expenseRepository.update(
        ctx.companyId,
        id,
        ["PENDING"],
        { status: "REJECTED", decisionNote: note, decidedAt: new Date(), decidedById: ctx.userId },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The expense changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action: "expense.reject",
          entityType: "Expense",
          entityId: id,
          before: { status: "PENDING" },
          after: { status: "REJECTED" },
          metadata: { summary: note },
        },
        tx,
      );
    });
  },

  /** Pays an approved expense that was bought on credit (rule E2: Accounts Payable → Cash/Bank). */
  async markPaid(
    ctx: TenantContext,
    id: string,
    method: Exclude<ExpensePaymentMethodKey, "UNPAID">,
    paidAt: string,
  ) {
    authorize(ctx, "accounting:create");
    const expense = await this.get(ctx, id);
    if (expense.status !== "APPROVED" || expense.paymentMethod !== "UNPAID") {
      throw new ConflictError("Only approved expenses that weren't paid yet can be marked as paid.");
    }
    if (expense.paidAt) throw new ConflictError("This expense is already paid.");
    if (paidAt < expense.expenseDate.toISOString().slice(0, 10)) {
      throw new ValidationError("The payment date can't be before the expense date.", {
        paidAt: ["Before the expense date."],
      });
    }
    await this.assertDate(ctx, paidAt);
    await db.$transaction(async (tx) => {
      const moved = await expenseRepository.update(
        ctx.companyId,
        id,
        ["APPROVED"],
        { paidAt: dateOnlyToDate(paidAt), paidMethod: method },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The expense changed meanwhile. Reload and try again.");
      const entry = await ledgerService.postExpensePaid(
        ctx.companyId,
        ctx.userId,
        expense,
        { method, date: paidAt },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "expense.pay",
          entityType: "Expense",
          entityId: id,
          after: { paidAt, method },
          metadata: {
            summary: `Posted as ${formatRecordNumber("journal", entry.number)}`,
            journalEntryId: entry.id,
          },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    const expense = await this.get(ctx, id);
    assertCanChange(ctx, expense, "delete");
    if (!OPEN.includes(expense.status)) throw new ConflictError("Approved expenses can't be deleted.");
    await db.$transaction(async (tx) => {
      const { count } = await expenseRepository.softDelete(ctx.companyId, id, OPEN, ctx.userId, tx);
      if (count === 0) throw new ConflictError("The expense changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        { action: "expense.delete", entityType: "Expense", entityId: id, before: snapshot(expense) },
        tx,
      );
    });
  },

  // ─── Receipt ───

  async uploadReceipt(ctx: TenantContext, id: string, file: { name: string; bytes: Uint8Array }) {
    const expense = await this.get(ctx, id);
    assertCanChange(ctx, expense, "edit");
    if (file.bytes.byteLength === 0) throw new ValidationError("Choose a file to upload.");
    if (file.bytes.byteLength > MAX_DOCUMENT_BYTES)
      throw new ValidationError("Files must be 10 MB or smaller.");
    const name = cleanFileName(file.name);
    const type = detectDocumentType(file.bytes, name);
    if (!type) throw new ValidationError(`Upload a ${DOCUMENT_TYPES_HINT} file.`);
    const key = companyKey(ctx.companyId, "expenses", id, `${crypto.randomUUID()}.${type.extension}`);
    const storage = getStorage();
    await storage.put(key, file.bytes, type.contentType);
    try {
      await db.$transaction(async (tx) => {
        // Receipts can be added in any status (they often arrive after approval) — they don't change the amounts.
        const updated = await expenseRepository.update(
          ctx.companyId,
          id,
          ["PENDING", "REJECTED", "APPROVED"],
          {
            receiptKey: key,
            receiptName: name,
            receiptContentType: type.contentType,
            receiptSize: file.bytes.byteLength,
          },
          ctx.userId,
          tx,
        );
        if (!updated) throw new NotFoundError("Expense");
        await writeAuditLog(
          ctx,
          {
            action: "expense.receipt_upload",
            entityType: "Expense",
            entityId: id,
            metadata: { summary: name },
          },
          tx,
        );
      });
    } catch (error) {
      await storage
        .delete(key)
        .catch((cleanupError: unknown) => logger.warn("Orphaned receipt file", { key, cleanupError }));
      throw error;
    }
    if (expense.receiptKey) {
      await storage
        .delete(expense.receiptKey)
        .catch((error: unknown) =>
          logger.warn("Could not delete replaced receipt", { key: expense.receiptKey, error }),
        );
    }
  },

  async receipt(ctx: TenantContext, id: string) {
    const expense = await this.get(ctx, id);
    if (!expense.receiptKey || !expense.receiptContentType) throw new NotFoundError("Receipt");
    const body = await getStorage().get(expense.receiptKey);
    if (!body) {
      logger.error("Receipt file missing from storage", { expenseId: id, key: expense.receiptKey });
      throw new NotFoundError("Receipt");
    }
    return { body, name: expense.receiptName ?? "receipt", contentType: expense.receiptContentType };
  },

  async removeReceipt(ctx: TenantContext, id: string) {
    const expense = await this.get(ctx, id);
    assertCanChange(ctx, expense, "edit");
    if (!OPEN.includes(expense.status))
      throw new ConflictError("The receipt of an approved expense is kept as evidence.");
    if (!expense.receiptKey) throw new NotFoundError("Receipt");
    await db.$transaction(async (tx) => {
      await expenseRepository.update(
        ctx.companyId,
        id,
        OPEN,
        { receiptKey: null, receiptName: null, receiptContentType: null, receiptSize: null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "expense.receipt_delete",
          entityType: "Expense",
          entityId: id,
          metadata: { summary: expense.receiptName },
        },
        tx,
      );
    });
    await getStorage()
      .delete(expense.receiptKey)
      .catch((error: unknown) =>
        logger.warn("Could not delete receipt file", { key: expense.receiptKey, error }),
      );
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Expense", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        category: "category",
        amount: "amount",
        expenseDate: "date",
        vendor: "vendor",
        paymentMethod: "payment method",
        description: "description",
        employeeId: "employee",
        status: "status",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
