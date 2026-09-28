import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS } from "@/config/accounting";
import { todayInZone } from "@/lib/date-range";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { money } from "@/lib/money";
import type { TenantContext } from "@/lib/tenant";
import { expenseListQuerySchema, journalListQuerySchema, salesDocumentSchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";
import { customerService } from "@/server/services/customer.service";
import { expenseService } from "@/server/services/expense.service";
import { financialReportService } from "@/server/services/financial-report.service";
import { invoiceService } from "@/server/services/invoice.service";
import { ledgerService } from "@/server/services/ledger.service";
import { paymentService } from "@/server/services/payment.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");

async function accountId(ctx: TenantContext, systemKey: string) {
  const account = (await accountingService.accounts(ctx)).find((item) => item.systemKey === systemKey);
  if (!account) throw new Error(`No ${systemKey} account`);
  return account.id;
}

async function balances(ctx: TenantContext) {
  const accounts = await accountingService.accounts(ctx);
  return Object.fromEntries(
    accounts.filter((account) => account.systemKey).map((account) => [account.systemKey, account.balance]),
  );
}

async function issuedInvoice(ctx: TenantContext, unitPrice: string, taxRate = "0") {
  const customer = await customerService.create(ctx, { name: `Buyer ${unitPrice}` });
  const invoice = await invoiceService.create(
    ctx,
    salesDocumentSchema.parse({
      customerId: customer.id,
      issueDate: today(),
      endDate: today(),
      items: [{ description: "Work", quantity: "1", unitPrice, discountPercent: "0", taxRate }],
    }),
  );
  await invoiceService.markSent(ctx, invoice.id);
  return invoice;
}

const expense = (overrides: Record<string, unknown> = {}) => ({
  category: "RENT" as const,
  amount: "300.00",
  expenseDate: today(),
  vendor: "Landlord LLC",
  paymentMethod: "CASH" as const,
  description: "September rent",
  ...overrides,
});

describe("ledger integrity", () => {
  it("gives every new company the default chart of accounts", async () => {
    const ctx = await createCompanyWithOwner("Ledger Co");
    const accounts = await accountingService.accounts(ctx);
    expect(accounts.map((account) => account.code)).toEqual(DEFAULT_ACCOUNTS.map((account) => account.code));
    expect(accounts.every((account) => account.balance === "0.00")).toBe(true);
  });

  it("refuses unbalanced or malformed transactions — in the service and in the database", async () => {
    const ctx = await createCompanyWithOwner("Strict Co");
    const [cash, equity] = [await accountId(ctx, "cash"), await accountId(ctx, "equity")];
    const entry = (lines: Array<{ accountId: string; debit: string; credit: string }>) =>
      accountingService.createTransaction(ctx, {
        type: "INCOME",
        entryDate: today(),
        description: "Capital",
        lines,
      });

    await expect(
      entry([
        { accountId: cash, debit: "100.00", credit: "" },
        { accountId: equity, debit: "", credit: "99.99" },
      ]),
    ).rejects.toThrow("Total debits must equal total credits.");
    await expect(
      entry([
        { accountId: cash, debit: "100.00", credit: "100.00" },
        { accountId: equity, debit: "", credit: "" },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);

    // Bypassing the service: the deferred trigger rejects the unbalanced entry at COMMIT.
    await expect(
      rawDb.journalEntry.create({
        data: {
          companyId: ctx.companyId,
          number: 999,
          type: "INCOME",
          entryDate: new Date(),
          description: "Sneaky",
          sourceType: "MANUAL",
          lines: { createMany: { data: [{ accountId: cash, position: 0, debit: "50", credit: "0" }] } },
        },
      }),
    ).rejects.toThrow(/not balanced/);
    // A line with both sides is refused by the CHECK constraint.
    await expect(
      rawDb.journalEntry.create({
        data: {
          companyId: ctx.companyId,
          number: 998,
          type: "INCOME",
          entryDate: new Date(),
          description: "Both sides",
          sourceType: "MANUAL",
          lines: {
            createMany: {
              data: [
                { accountId: cash, position: 0, debit: "5", credit: "5" },
                { accountId: equity, position: 1, debit: "0", credit: "0" },
              ],
            },
          },
        },
      }),
    ).rejects.toThrow(/journal_lines_one_side/);
    expect(await rawDb.journalEntry.count({ where: { companyId: ctx.companyId } })).toBe(0);
  });

  it("manual transactions post, list, and are corrected by reversal (never edited)", async () => {
    const ctx = await createCompanyWithOwner("Manual Co");
    const [bank, equity] = [await accountId(ctx, "bank"), await accountId(ctx, "equity")];
    const entry = await accountingService.createTransaction(ctx, {
      type: "INCOME",
      entryDate: today(),
      description: "Owner capital",
      reference: "DEP-1",
      lines: [
        { accountId: bank, debit: "10000", credit: "" },
        { accountId: equity, debit: "", credit: "10000" },
      ],
    });
    expect(entry.number).toBe(1);
    expect((await balances(ctx)).bank).toBe("10000.00");

    await accountingService.reverseTransaction(ctx, entry.id);
    expect((await balances(ctx)).bank).toBe("0.00");
    await expect(accountingService.reverseTransaction(ctx, entry.id)).rejects.toBeInstanceOf(ConflictError);
    const list = await accountingService.transactions(ctx, journalListQuerySchema.parse({ accountId: bank }));
    expect(list.total).toBe(2);

    const ledger = await accountingService.ledger(ctx, bank);
    expect(ledger.rows.map((row) => row.balance)).toEqual(["10000.00", "0.00"]);
  });
});

describe("automatic postings (docs/accounting.md)", () => {
  it("invoices, payments, voids and cancellations post balanced entries, exactly once", async () => {
    const ctx = await createCompanyWithOwner("Posting Co");
    const invoice = await issuedInvoice(ctx, "1000", "5"); // total 1050, tax 50
    let b = await balances(ctx);
    expect([b.receivable, b.revenue, b.tax_payable]).toEqual(["1050.00", "1000.00", "50.00"]);

    const payment = await paymentService.record(ctx, {
      invoiceId: invoice.id,
      amount: "400",
      method: "CASH",
      paymentDate: today(),
    });
    await paymentService.record(ctx, {
      invoiceId: invoice.id,
      amount: "100",
      method: "CARD",
      paymentDate: today(),
    });
    b = await balances(ctx);
    expect([b.cash, b.bank, b.receivable]).toEqual(["400.00", "100.00", "550.00"]);

    await paymentService.void(ctx, payment.id, "Bounced");
    b = await balances(ctx);
    expect([b.cash, b.receivable]).toEqual(["0.00", "950.00"]);

    // Cancelling a draft posts nothing; cancelling an issued invoice reverses its posting.
    const other = await issuedInvoice(ctx, "200");
    await invoiceService.cancel(ctx, other.id);
    b = await balances(ctx);
    expect([b.receivable, b.revenue]).toEqual(["950.00", "1000.00"]);

    // Running the seed's ledger sync again doesn't post anything twice.
    const before = await rawDb.journalEntry.count({ where: { companyId: ctx.companyId } });
    await ledgerService.syncAllCompanies();
    expect(await rawDb.journalEntry.count({ where: { companyId: ctx.companyId } })).toBe(before);
    expect(before).toBe(6); // invoice, 2 payments, void, invoice, cancellation
  });
});

describe("expenses: approval workflow", () => {
  it("employees submit their own; approvers approve or reject; approval posts to the ledger", async () => {
    const owner = await createCompanyWithOwner("Expense Co");
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: manager } = await addMember(owner, "Manager");
    const { ctx: accountant } = await addMember(owner, "Accountant");

    const rent = await expenseService.create(employee, expense());
    expect(rent).toMatchObject({
      number: 1,
      status: "PENDING",
      employeeId: employee.userId,
      amount: expect.anything(),
    });
    // Employees can't file for someone else, and see only their own.
    await expect(
      expenseService.create(employee, expense({ employeeId: manager.userId })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expenseService.create(accountant, expense({ description: "Accountant's own" }));
    expect((await expenseService.list(employee, expenseListQuerySchema.parse({}))).total).toBe(1);
    expect((await expenseService.list(manager, expenseListQuerySchema.parse({}))).total).toBe(2);

    await expect(expenseService.approve(employee, rent.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expenseService.approve(manager, rent.id);
    await expect(expenseService.update(employee, rent.id, expense({ amount: "1" }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(expenseService.remove(employee, rent.id)).rejects.toBeInstanceOf(ConflictError);
    let b = await balances(owner);
    expect([b.expense_rent, b.cash]).toEqual(["300.00", "-300.00"]);

    // Rejected → corrected → pending again.
    const taxi = await expenseService.create(
      employee,
      expense({ category: "TRANSPORTATION", amount: "45.50" }),
    );
    await expect(expenseService.reject(manager, taxi.id, "")).rejects.toThrow();
    await expenseService.reject(manager, taxi.id, "Missing receipt");
    expect((await expenseService.get(employee, taxi.id)).status).toBe("REJECTED");
    const resubmitted = await expenseService.update(
      employee,
      taxi.id,
      expense({ category: "TRANSPORTATION", amount: "45.50" }),
    );
    expect(resubmitted.status).toBe("PENDING");

    // Bought on credit → Accounts Payable, then paid from the bank.
    const software = await expenseService.create(
      accountant,
      expense({ category: "SOFTWARE", amount: "200", paymentMethod: "UNPAID", vendor: "SaaS Inc" }),
    );
    await expenseService.approve(accountant, software.id);
    b = await balances(owner);
    expect([b.expense_software, b.payable]).toEqual(["200.00", "200.00"]);
    await expect(
      expenseService.markPaid(manager, software.id, "BANK_TRANSFER", today()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expenseService.markPaid(accountant, software.id, "BANK_TRANSFER", today());
    b = await balances(owner);
    expect([b.payable, b.bank]).toEqual(["0.00", "-200.00"]);
    await expect(expenseService.markPaid(accountant, software.id, "CASH", today())).rejects.toBeInstanceOf(
      ConflictError,
    );

    const history = await expenseService.history(owner, software.id);
    expect(history.map((entry) => entry.label)).toEqual(["Marked as paid", "Approved", "Submitted"]);
  });

  it("stores receipts in company storage and checks their type", async () => {
    const ctx = await createCompanyWithOwner("Receipt Co");
    const item = await expenseService.create(ctx, expense());
    await expenseService.uploadReceipt(ctx, item.id, {
      name: "receipt.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 receipt"),
    });
    const receipt = await expenseService.receipt(ctx, item.id);
    expect(receipt).toMatchObject({ name: "receipt.pdf", contentType: "application/pdf" });
    await expect(
      expenseService.uploadReceipt(ctx, item.id, {
        name: "x.pdf",
        bytes: new TextEncoder().encode("<script>"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("financial reports", () => {
  it("add up: P&L, balance sheet, cash flow, receivables, payables, expenses and revenue", async () => {
    const ctx = await createCompanyWithOwner("Reports Co");
    const [bank, equity] = [await accountId(ctx, "bank"), await accountId(ctx, "equity")];
    await accountingService.createTransaction(ctx, {
      type: "INCOME",
      entryDate: today(),
      description: "Owner capital",
      lines: [
        { accountId: bank, debit: "10000", credit: "" },
        { accountId: equity, debit: "", credit: "10000" },
      ],
    });
    const invoice = await issuedInvoice(ctx, "1000", "5"); // 1050
    await paymentService.record(ctx, {
      invoiceId: invoice.id,
      amount: "400",
      method: "CASH",
      paymentDate: today(),
    });
    const rent = await expenseService.create(ctx, expense()); // 300 cash
    await expenseService.approve(ctx, rent.id);
    const software = await expenseService.create(
      ctx,
      expense({ category: "SOFTWARE", amount: "200", paymentMethod: "UNPAID", vendor: "SaaS Inc" }),
    );
    await expenseService.approve(ctx, software.id);

    const pl = await financialReportService.profitAndLoss(ctx, "this-month");
    expect([pl.totalRevenue, pl.totalExpenses, pl.netProfit]).toEqual(["1000.00", "500.00", "500.00"]);
    expect(pl.expenses.map((row) => [row.label, row.amount])).toEqual([
      ["Rent", "300.00"],
      ["Software", "200.00"],
    ]);

    const sheet = await financialReportService.balanceSheet(ctx);
    expect(sheet.assets.map((row) => [row.label, row.amount])).toEqual([
      ["Cash", "100.00"],
      ["Bank", "10000.00"],
      ["Accounts Receivable", "650.00"],
    ]);
    expect([sheet.totalAssets, sheet.totalLiabilities, sheet.totalEquity, sheet.balanced]).toEqual([
      "10750.00",
      "250.00",
      "10500.00",
      true,
    ]);

    const cash = await financialReportService.cashFlow(ctx, "this-month");
    expect([cash.opening, cash.totalIn, cash.totalOut, cash.closing]).toEqual([
      "0.00",
      "10400.00",
      "300.00",
      "10100.00",
    ]);
    expect(cash.byType.map((row) => [row.type, row.moneyIn, row.moneyOut])).toEqual([
      ["INCOME", "10000.00", "0.00"],
      ["EXPENSE", "0.00", "300.00"],
      ["PAYMENT", "400.00", "0.00"],
    ]);

    const receivables = await financialReportService.receivables(ctx);
    expect([receivables.total, receivables.ledgerBalance, receivables.reconciled]).toEqual([
      "650.00",
      "650.00",
      true,
    ]);
    const payables = await financialReportService.payables(ctx);
    expect([payables.total, payables.ledgerBalance, payables.reconciled]).toEqual(["200.00", "200.00", true]);

    const expenses = await financialReportService.expenses(ctx, "this-month");
    expect(expenses.total).toBe("500.00");
    expect(expenses.byCategory.map((row) => [row.label, row.amount, row.share])).toEqual([
      ["Rent", "300.00", "60.0"],
      ["Software", "200.00", "40.0"],
    ]);

    const revenue = await financialReportService.revenue(ctx, "this-month");
    expect([revenue.invoiced, revenue.totalReceived]).toEqual(["1050.00", "400.00"]);
  });
});

describe("finance permissions", () => {
  it("follow the roles", async () => {
    const owner = await createCompanyWithOwner("Finance Perms");
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: manager } = await addMember(owner, "Manager");
    const { ctx: hr } = await addMember(owner, "HR Manager");
    const cash = await accountId(owner, "cash");

    for (const ctx of [employee, manager, hr]) {
      await expect(accountingService.accounts(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(financialReportService.profitAndLoss(ctx, "this-month")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        accountingService.createTransaction(ctx, {
          type: "INCOME",
          entryDate: today(),
          description: "x",
          lines: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(expenseService.create(hr, expense())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(accountingService.deleteAccount(owner, cash)).rejects.toBeInstanceOf(ConflictError); // system account
  });
});

describe("finance tenant isolation", () => {
  it("Company A cannot see or use Company B's expenses, accounts or transactions", async () => {
    const a = await createCompanyWithOwner("Fin A");
    const b = await createCompanyWithOwner("Fin B");
    const expenseOfB = await expenseService.create(b, expense());
    await expenseService.approve(b, expenseOfB.id);
    const [bankOfB, equityOfB] = [await accountId(b, "bank"), await accountId(b, "equity")];
    const entryOfB = (await accountingService.transactions(b, journalListQuerySchema.parse({}))).items[0];
    if (!entryOfB) throw new Error("B has no entry");

    for (const attempt of [
      () => expenseService.get(a, expenseOfB.id),
      () => expenseService.approve(a, expenseOfB.id),
      () => expenseService.remove(a, expenseOfB.id),
      () => expenseService.receipt(a, expenseOfB.id),
      () => accountingService.account(a, bankOfB),
      () => accountingService.transaction(a, entryOfB.id),
      () => accountingService.reverseTransaction(a, entryOfB.id),
      () => accountingService.ledger(a, bankOfB),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }
    // B's accounts can't be used in A's transactions.
    await expect(
      accountingService.createTransaction(a, {
        type: "INCOME",
        entryDate: today(),
        description: "Hijack",
        lines: [
          { accountId: bankOfB, debit: "1", credit: "" },
          { accountId: equityOfB, debit: "", credit: "1" },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await expenseService.list(a, expenseListQuerySchema.parse({}))).total).toBe(0);
    expect((await financialReportService.profitAndLoss(a, "this-month")).totalExpenses).toBe("0.00");
    expect(money((await financialReportService.profitAndLoss(b, "this-month")).totalExpenses)).toBe("300.00");
  });
});
