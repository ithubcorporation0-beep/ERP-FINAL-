import "server-only";
import { formatRecordNumber } from "@/config/records";
import { normalBalance } from "@/lib/accounting";
import type { DateRangePreset } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { fromCents, money, toCents } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { AccountInput, JournalEntryInput, JournalListQuery } from "@/lib/validation";
import { accountRepository } from "@/server/repositories/account.repository";
import { journalRepository, type DateBounds } from "@/server/repositories/journal.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { periodBounds, salesContext } from "./sales-shared";

/**
 * Chart of accounts and transactions (journal entries). Reading needs `accounting:view`; creating accounts and
 * manual transactions `accounting:create`; editing accounts `accounting:edit`; deleting accounts and reversing
 * transactions `accounting:delete`. Automatic postings come from ledger.service.ts.
 */

export const accountingService = {
  /** All accounts with their all-time balance on their normal side. */
  async accounts(ctx: TenantContext) {
    authorize(ctx, "accounting:view");
    await ledgerService.ensureAccounts(ctx.companyId);
    const [accounts, totals] = await Promise.all([
      accountRepository.list(ctx.companyId),
      journalRepository.totalsByAccount(ctx.companyId, {}),
    ]);
    const byAccount = new Map(totals.map((row) => [row.accountId, row]));
    return accounts.map((account) => {
      const total = byAccount.get(account.id);
      return {
        ...account,
        debit: money(total?.debit ?? "0"),
        credit: money(total?.credit ?? "0"),
        balance: normalBalance(account.type, total?.debit ?? "0", total?.credit ?? "0"),
      };
    });
  },

  async account(ctx: TenantContext, id: string) {
    authorize(ctx, "accounting:view");
    const account = await accountRepository.findById(ctx.companyId, id);
    if (!account) throw new NotFoundError("Account");
    return account;
  },

  async createAccount(ctx: TenantContext, input: AccountInput) {
    authorize(ctx, "accounting:create");
    return db.$transaction(async (tx) => {
      const account = await accountRepository.create(
        ctx.companyId,
        { code: input.code, name: input.name, type: input.type, description: input.description || null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "account.create", entityType: "Account", entityId: account.id, after: account },
        tx,
      );
      return account;
    });
  },

  /** Name, code, description and active flag can change; the type can't once the account has postings. */
  async updateAccount(ctx: TenantContext, id: string, input: AccountInput) {
    authorize(ctx, "accounting:edit");
    const before = await this.account(ctx, id);
    if (input.type !== before.type && (await accountRepository.countLines(ctx.companyId, id)) > 0) {
      throw new ValidationError("The type of an account with transactions can't change.", {
        type: ["Can't change: the account has transactions."],
      });
    }
    if (before.systemKey && input.type !== before.type) {
      throw new ValidationError("The type of a system account can't change.", { type: ["System account."] });
    }
    return db.$transaction(async (tx) => {
      const after = await accountRepository.update(
        ctx.companyId,
        id,
        {
          code: input.code,
          name: input.name,
          type: input.type,
          description: input.description || null,
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        ctx.userId,
        tx,
      );
      if (!after) throw new NotFoundError("Account");
      await writeAuditLog(
        ctx,
        { action: "account.update", entityType: "Account", entityId: id, before, after },
        tx,
      );
      return after;
    });
  },

  async deleteAccount(ctx: TenantContext, id: string) {
    authorize(ctx, "accounting:delete");
    const account = await this.account(ctx, id);
    if (account.systemKey) throw new ConflictError("System accounts can't be deleted.");
    await db.$transaction(async (tx) => {
      const { count } = await accountRepository.delete(ctx.companyId, id, tx);
      if (count === 0)
        throw new ConflictError("Accounts with transactions can't be deleted. Deactivate it instead.");
      await writeAuditLog(
        ctx,
        { action: "account.delete", entityType: "Account", entityId: id, before: account },
        tx,
      );
    });
  },

  async transactions(ctx: TenantContext, query: JournalListQuery) {
    authorize(ctx, "accounting:view");
    const dates: DateBounds = query.range ? await periodBounds(ctx, query.range) : {};
    return journalRepository.list(ctx.companyId, { ...query, dates: { from: dates.from, to: dates.to } });
  },

  async transaction(ctx: TenantContext, id: string) {
    authorize(ctx, "accounting:view");
    const entry = await journalRepository.findById(ctx.companyId, id);
    if (!entry) throw new NotFoundError("Transaction");
    return entry;
  },

  /** Journal entries posted for an invoice, payment or expense — to link a record to its accounting. */
  async entriesForSource(
    ctx: TenantContext,
    sourceType: "INVOICE" | "PAYMENT" | "EXPENSE" | "PAYROLL" | "ADVANCE",
    sourceId: string,
  ) {
    authorize(ctx, "accounting:view");
    return journalRepository.listBySource(ctx.companyId, sourceType, sourceId);
  },

  /** A manual transaction. Every account must belong to this company and be active. */
  async createTransaction(ctx: TenantContext, input: JournalEntryInput) {
    authorize(ctx, "accounting:create");
    const accounts = new Map(
      (await accountRepository.list(ctx.companyId)).map((account) => [account.id, account]),
    );
    input.lines.forEach((line, index) => {
      const account = accounts.get(line.accountId);
      if (!account || !account.isActive) {
        throw new ValidationError("Choose an active account of this company.", {
          [`lines.${index}.accountId`]: ["Choose an active account."],
        });
      }
    });
    return db.$transaction(async (tx) => {
      const entry = await ledgerService.post(
        ctx.companyId,
        ctx.userId,
        {
          type: input.type,
          date: input.entryDate,
          description: input.description,
          reference: input.reference || null,
          postingKey: null,
          sourceType: "MANUAL",
          sourceId: null,
          lines: input.lines.map((line) => ({
            account: { id: line.accountId },
            debit: line.debit || "0",
            credit: line.credit || "0",
            description: line.description || null,
          })),
        },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "journal.create",
          entityType: "JournalEntry",
          entityId: entry.id,
          after: {
            number: formatRecordNumber("journal", entry.number),
            type: entry.type,
            date: input.entryDate,
            lines: entry.lines.map((line) => ({
              account: line.account.code,
              debit: money(line.debit),
              credit: money(line.credit),
            })),
          },
        },
        tx,
      );
      return entry;
    });
  },

  /** Corrects a transaction by posting its mirror image; the original stays in the ledger. */
  async reverseTransaction(ctx: TenantContext, id: string) {
    authorize(ctx, "accounting:delete");
    const entry = await this.transaction(ctx, id);
    if (entry.sourceType !== "MANUAL") {
      throw new ConflictError(
        "Automatic postings are corrected from their source (cancel the invoice, void the payment…).",
      );
    }
    if (entry.reversalOfId) throw new ConflictError("A reversing entry can't be reversed again.");
    if (entry.reversals.length > 0) throw new ConflictError("This transaction has already been reversed.");
    const { today } = await salesContext(ctx);
    return db.$transaction(async (tx) => {
      const reversal = await ledgerService.reverse(
        ctx.companyId,
        ctx.userId,
        { id },
        {
          postingKey: `journal:${id}:reverse`,
          date: today,
          description: `Reversal of ${formatRecordNumber("journal", entry.number)}`,
        },
        tx,
      );
      if (!reversal) throw new NotFoundError("Transaction");
      await writeAuditLog(
        ctx,
        {
          action: "journal.reverse",
          entityType: "JournalEntry",
          entityId: id,
          after: { reversalId: reversal.id },
        },
        tx,
      );
      return reversal;
    });
  },

  /** Transaction history of one account with a running balance on its normal side. */
  async ledger(ctx: TenantContext, accountId: string, preset?: DateRangePreset) {
    const account = await this.account(ctx, accountId);
    const bounds = preset ? await periodBounds(ctx, preset) : null;
    const [opening, lines] = await Promise.all([
      bounds ? journalRepository.totalsByAccount(ctx.companyId, { to: bounds.from }) : Promise.resolve([]),
      journalRepository.accountLines(
        ctx.companyId,
        accountId,
        bounds ? { from: bounds.from, to: bounds.to } : {},
      ),
    ]);
    const openingRow = opening.find((row) => row.accountId === accountId);
    const openingBalance = normalBalance(account.type, openingRow?.debit ?? "0", openingRow?.credit ?? "0");
    let running = toCents(openingBalance);
    const rows = lines.map((line) => {
      running += toCents(normalBalance(account.type, line.debit.toString(), line.credit.toString()));
      return { ...line, debit: money(line.debit), credit: money(line.credit), balance: fromCents(running) };
    });
    return {
      account,
      openingBalance,
      rows,
      closingBalance: fromCents(running),
      truncated: lines.length >= 2000,
    };
  },
};
