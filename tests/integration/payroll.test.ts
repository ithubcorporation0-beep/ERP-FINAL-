import { describe, expect, it } from "vitest";
import { todayInZone } from "@/lib/date-range";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import { compensationSchema, payrollListQuerySchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";
import { compensationService } from "@/server/services/compensation.service";
import { employeeService } from "@/server/services/employee.service";
import { payrollService } from "@/server/services/payroll.service";
import { salaryAdvanceService } from "@/server/services/salary-advance.service";
import { salaryStructureService } from "@/server/services/salary-structure.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");
const thisMonth = () => today().slice(0, 7);

/** An employee with a basic salary and a structure. */
async function paidEmployee(
  owner: TenantContext,
  name: string,
  salary: string,
  structure: Array<{ kind: "ALLOWANCE" | "DEDUCTION" | "TAX"; name: string; amount: string }> = [],
) {
  const employee = await employeeService.create(owner, { name, joiningDate: "2025-01-01" });
  await compensationService.update(owner, employee.id, compensationSchema.parse({ salary }));
  for (const component of structure) await salaryStructureService.add(owner, employee.id, component);
  return employee;
}

async function balances(ctx: TenantContext) {
  const accounts = await accountingService.accounts(ctx);
  return Object.fromEntries(
    accounts.filter((account) => account.systemKey).map((account) => [account.systemKey, account.balance]),
  );
}

describe("payroll processing", () => {
  it("processes a month from salary structures with the exact formula, once", async () => {
    const owner = await createCompanyWithOwner("Payroll Co");
    const sara = await paidEmployee(owner, "Sara", "100000", [
      { kind: "ALLOWANCE", name: "House rent", amount: "15000" },
      { kind: "ALLOWANCE", name: "Medical", amount: "2500.50" },
      { kind: "DEDUCTION", name: "Provident fund", amount: "5000" },
      { kind: "TAX", name: "Income tax", amount: "8750.25" },
    ]);
    await paidEmployee(owner, "Ali", "60000.10");
    await employeeService.create(owner, { name: "No Salary", joiningDate: "2025-01-01" });
    await salaryAdvanceService.create(owner, {
      employeeId: sara.id,
      amount: "10000",
      advanceDate: `${thisMonth()}-01`,
      paymentMethod: "CASH",
      reason: "Emergency",
    });

    const { run, employees, skipped } = await payrollService.process(owner, {
      period: thisMonth(),
      payDate: today(),
    });
    expect({ employees, skipped }).toEqual({ employees: 2, skipped: ["No Salary"] });
    expect(run).toMatchObject({ number: 1, status: "DRAFT" });

    const detail = await payrollService.detail(owner, run.id);
    const saraItem = detail.items.find((item) => item.employeeId === sara.id);
    // 100000 + 17500.50 + 0 + 0 − 5000 − 8750.25 − 10000 = 93750.25
    expect(
      saraItem && {
        allowances: saraItem.allowances.toString(),
        advances: saraItem.advances.toString(),
        net: saraItem.net.toString(),
      },
    ).toEqual({ allowances: "17500.5", advances: "10000", net: "93750.25" });
    expect(detail.totals).toMatchObject({
      gross: "177500.60",
      totalDeductions: "23750.25",
      net: "153750.35",
    });

    // A pay date far from the month is a typo, not a payroll.
    await expect(
      payrollService.process(owner, { period: "2026-06", payDate: "2198-04-28" }),
    ).rejects.toBeInstanceOf(ValidationError);
    // The same month can't be processed twice…
    await expect(
      payrollService.process(owner, { period: thisMonth(), payDate: today() }),
    ).rejects.toBeInstanceOf(ConflictError);
    // …not even by writing to the database directly.
    await expect(
      rawDb.payrollRun.create({
        data: {
          companyId: owner.companyId,
          number: 99,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          activePeriod: thisMonth(),
          payDate: run.payDate,
          currency: "USD",
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
    // The database enforces the formula on every payslip.
    await expect(
      rawDb.payrollItem.update({ where: { id: saraItem?.id ?? "" }, data: { net: "93750.26" } }),
    ).rejects.toThrow(/payroll_items_net_formula/);
  });

  it("adjusts draft payslips, refuses a negative net, and recalculates keeping bonus and overtime", async () => {
    const owner = await createCompanyWithOwner("Adjust Co");
    const employee = await paidEmployee(owner, "Omar", "50000", [
      { kind: "TAX", name: "Income tax", amount: "2000" },
    ]);
    const { run } = await payrollService.process(owner, { period: "2026-01", payDate: "2026-01-31" });
    const [item] = (await payrollService.detail(owner, run.id)).items;
    if (!item) throw new Error("No payslip");
    const edit = (overrides: Record<string, string>) =>
      payrollService.updateItem(owner, run.id, item.id, {
        basic: "50000",
        allowances: "0",
        bonus: "0",
        overtime: "0",
        deductions: "0",
        tax: "2000",
        ...overrides,
      });
    await edit({ bonus: "7500", overtime: "1250.75", note: "Q4 bonus" });
    expect((await payrollService.detail(owner, run.id)).totals.net).toBe("56750.75");
    await expect(edit({ deductions: "60000" })).rejects.toBeInstanceOf(ValidationError);

    // A new allowance shows up on recalculation; the typed bonus and overtime stay.
    await salaryStructureService.add(owner, employee.id, { kind: "ALLOWANCE", name: "Fuel", amount: "3000" });
    await payrollService.recalculate(owner, run.id);
    expect((await payrollService.detail(owner, run.id)).totals).toMatchObject({
      allowances: "3000.00",
      bonus: "7500.00",
      overtime: "1250.75",
      net: "59750.75",
    });

    // Audit entries say what changed, never the amounts.
    const edits = await rawDb.auditLog.findMany({
      where: { companyId: owner.companyId, action: "payroll.item_update" },
    });
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ before: null, after: null });
    expect(edits[0]?.metadata).toMatchObject({ summary: "Omar: changed bonus, overtime" });
  });

  it("runs the approval workflow with segregation of duties and posts the paid run to the ledger", async () => {
    const owner = await createCompanyWithOwner("Approve Co");
    const { ctx: hr } = await addMember(owner, "HR Manager");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const employee = await paidEmployee(owner, "Zara", "80000", [
      { kind: "DEDUCTION", name: "Loan", amount: "1000" },
      { kind: "TAX", name: "Income tax", amount: "4000" },
    ]);
    await salaryAdvanceService.create(hr, {
      employeeId: employee.id,
      amount: "5000",
      advanceDate: "2026-02-10",
      paymentMethod: "BANK_TRANSFER",
      reason: "Rent",
    });
    const { run } = await payrollService.process(hr, { period: "2026-02", payDate: "2026-02-28" });

    // Only drafts can be approved after submission; the processor can't approve their own run.
    await expect(payrollService.approve(owner, run.id)).rejects.toBeInstanceOf(ConflictError);
    await payrollService.submit(hr, run.id);
    await expect(payrollService.approve(hr, run.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(payrollService.reject(owner, run.id, "")).rejects.toBeInstanceOf(ValidationError);
    await payrollService.reject(owner, run.id, "Check Zara's loan");
    expect((await payrollService.get(owner, run.id)).status).toBe("DRAFT");
    await payrollService.submit(hr, run.id);
    await payrollService.approve(owner, run.id, "OK");

    // Approved payslips are frozen, also in the database.
    const [item] = (await payrollService.detail(owner, run.id)).items;
    await expect(
      payrollService.updateItem(owner, run.id, item?.id ?? "", {
        basic: "1",
        allowances: "0",
        bonus: "0",
        overtime: "0",
        deductions: "0",
        tax: "0",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      rawDb.payrollItem.update({ where: { id: item?.id ?? "" }, data: { note: "sneaky" } }),
    ).rejects.toThrow(/cannot be changed/);

    // Paying needs accounting rights: the HR manager can't, the accountant can — once.
    await expect(
      payrollService.markPaid(hr, run.id, { paidAt: "2026-02-28", method: "BANK_TRANSFER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await payrollService.markPaid(accountant, run.id, { paidAt: "2026-02-28", method: "BANK_TRANSFER" });
    await expect(
      payrollService.markPaid(accountant, run.id, { paidAt: "2026-02-28", method: "BANK_TRANSFER" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Ledger: advance paid (Dr Other Assets 5000 / Cr Bank) then payroll: gross 80000 = tax 4000 + loan 1000 +
    // advance 5000 + net 70000.
    expect(await balances(owner)).toMatchObject({
      expense_salaries: "80000.00",
      tax_payable: "4000.00",
      liabilities: "1000.00",
      assets: "0.00",
      bank: "-75000.00",
    });
    const advances = await salaryAdvanceService.list(owner, { employeeId: employee.id });
    expect(advances.map((advance) => advance.status)).toEqual(["RECOVERED"]);
    // A paid run can't be cancelled and the month stays taken.
    await expect(payrollService.cancel(owner, run.id, "Oops")).rejects.toBeInstanceOf(ConflictError);

    const history = await payrollService.history(owner, run.id);
    expect(history.map((entry) => entry.label)).toEqual([
      "Marked as paid",
      "Approved",
      "Submitted for approval",
      "Sent back to draft",
      "Submitted for approval",
      "Processed",
    ]);
    expect(
      (await payrollService.employeeHistory(owner, employee.id)).map((row) => row.net.toString()),
    ).toEqual(["70000"]);

    const slip = await payrollService.payslipPdf(accountant, run.id, item?.id ?? "");
    expect(Buffer.from(slip.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(slip.filename).toMatch(/^salary-slip-PRL-0001-EMP-0001\.pdf$/);

    const report = await payrollService.report(owner, "last-12-months");
    expect(report.totals.net).toBe("70000.00");
  });

  it("frees a cancelled month for reprocessing and keeps advances that don't fit for later", async () => {
    const owner = await createCompanyWithOwner("Cancel Co");
    const employee = await paidEmployee(owner, "Nadia", "3000");
    await salaryAdvanceService.create(owner, {
      employeeId: employee.id,
      amount: "2000",
      advanceDate: "2026-03-01",
      paymentMethod: "CASH",
      reason: "First",
    });
    await salaryAdvanceService.create(owner, {
      employeeId: employee.id,
      amount: "1500",
      advanceDate: "2026-03-02",
      paymentMethod: "CASH",
      reason: "Second",
    });
    const first = await payrollService.process(owner, { period: "2026-03", payDate: "2026-03-31" });
    // Only the first advance fits in 3000; the second waits for next month.
    expect((await payrollService.detail(owner, first.run.id)).totals).toMatchObject({
      advances: "2000.00",
      net: "1000.00",
    });
    await expect(payrollService.cancel(owner, first.run.id, "")).rejects.toBeInstanceOf(ValidationError);
    await payrollService.cancel(owner, first.run.id, "Wrong pay date");
    const second = await payrollService.process(owner, { period: "2026-03", payDate: "2026-03-30" });
    expect(second.run.number).toBe(2);
  });
});

describe("payroll permissions and isolation", () => {
  it("never shows salary data to people without payroll or salary rights", async () => {
    const owner = await createCompanyWithOwner("Secret Co");
    const employee = await paidEmployee(owner, "Private", "90000");
    const { run } = await payrollService.process(owner, { period: "2026-04", payDate: "2026-04-30" });
    const { ctx: manager } = await addMember(owner, "Manager");
    const { ctx: worker } = await addMember(owner, "Employee");

    for (const ctx of [manager, worker]) {
      await expect(payrollService.list(ctx, payrollListQuerySchema.parse({}))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(payrollService.detail(ctx, run.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(payrollService.employeeHistory(ctx, employee.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(salaryStructureService.get(ctx, employee.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(payrollService.report(ctx, "this-month")).rejects.toBeInstanceOf(ForbiddenError);
    }
    // The accountant sees payroll (to pay it) but can't change structures or process.
    const { ctx: accountant } = await addMember(owner, "Accountant");
    expect((await payrollService.detail(accountant, run.id)).totals.net).toBe("90000.00");
    await expect(
      salaryStructureService.add(accountant, employee.id, { kind: "ALLOWANCE", name: "Car", amount: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      payrollService.process(accountant, { period: "2026-05", payDate: "2026-05-31" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Another company sees nothing.
    const other = await createCompanyWithOwner("Other Payroll Co");
    await expect(payrollService.detail(other, run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(payrollService.approve(other, run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(salaryStructureService.get(other, employee.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      salaryAdvanceService.create(other, {
        employeeId: employee.id,
        amount: "1",
        advanceDate: "2026-04-01",
        paymentMethod: "CASH",
        reason: "Cross-tenant",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await payrollService.list(other, payrollListQuerySchema.parse({}))).total).toBe(0);
  });
});
