import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { PAYROLL_STATUS_LABELS, periodLabel, type PayrollStatusKey } from "@/config/payroll";
import type { PaymentMethodKey } from "@/config/sales";
import { formatRecordNumber } from "@/config/records";
import { addDays, dateOnlyToDate, dateToDateOnly, type DateRangePreset } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { money, subtractMoney, sumMoney } from "@/lib/money";
import { renderPayslipPdf } from "@/lib/pdf/payslip";
import {
  advancesToRecover,
  calculatePayroll,
  isNegative,
  PAYROLL_FIELDS,
  sumComponents,
  sumPayroll,
  type PayrollResult,
} from "@/lib/payroll";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import {
  payrollLinesSchema,
  type PayrollItemInput,
  type PayrollLine,
  type PayrollListQuery,
  type PayrollRunInput,
} from "@/lib/validation";
import { compensationRepository } from "@/server/repositories/compensation.repository";
import { employeeRepository } from "@/server/repositories/employee.repository";
import type { DbClient } from "@/server/repositories/helpers";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { payrollRepository, type PayrollItemData } from "@/server/repositories/payroll.repository";
import { salaryAdvanceRepository } from "@/server/repositories/salary-advance.repository";
import { salaryStructureRepository } from "@/server/repositories/salary-structure.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { recordHistory, snapshotText } from "./record-history";
import { companyService } from "./company.service";
import { companyParty, periodBounds, salesContext } from "./sales-shared";

/**
 * Payroll runs (`PRL-0001`), one per month: Draft → Submitted → Approved → Paid, or Cancelled.
 *
 * - `payroll:view` sees runs, payslips and reports (salary data — HR Manager, Accountant, Admin by default).
 * - `payroll:create` processes a month; `payroll:edit` adjusts draft payslips, recalculates and submits.
 * - `payroll:approve` / `payroll:reject` decide a submitted run — never the person who processed it.
 * - Paying posts the run to the ledger and needs `accounting:create`; `payroll:delete` cancels an unpaid run.
 *
 * Duplicate protection: one non-cancelled run per month (unique `active_period`), one item per employee and run,
 * status changes that only apply from the expected status, a row lock on the run for every change, an idempotent
 * ledger posting key and a database trigger that freezes the items of approved runs. The formula is checked by
 * the database on every item. Audit entries record who did what and which fields changed — never the amounts
 * (docs/payroll.md).
 */

type Run = NonNullable<Awaited<ReturnType<typeof payrollRepository.findRun>>>;
type Item = Awaited<ReturnType<typeof payrollRepository.listItems>>[number];

const EDITABLE: PayrollStatusKey[] = ["DRAFT"];
const CANCELLABLE: PayrollStatusKey[] = ["DRAFT", "SUBMITTED", "APPROVED"];

const HISTORY_ACTIONS: Record<string, string> = {
  "payroll.process": "Processed",
  "payroll.recalculate": "Recalculated",
  "payroll.item_update": "Payslip adjusted",
  "payroll.submit": "Submitted for approval",
  "payroll.approve": "Approved",
  "payroll.reject": "Sent back to draft",
  "payroll.pay": "Marked as paid",
  "payroll.cancel": "Cancelled",
};

function code(run: { number: number }): string {
  return formatRecordNumber("payroll", run.number);
}

function label(run: { periodYear: number; periodMonth: number }): string {
  return periodLabel(run.periodYear, run.periodMonth);
}

/** First and last calendar day of "YYYY-MM". */
function monthBounds(period: string): { year: number; month: number; start: string; end: string } {
  const [year = 0, month = 0] = period.split("-").map(Number);
  const start = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { year, month, start, end: addDays(next, -1) };
}

export function itemAmounts(item: Pick<Item, (typeof PAYROLL_FIELDS)[number] | "net">) {
  return {
    basic: money(item.basic),
    allowances: money(item.allowances),
    bonus: money(item.bonus),
    overtime: money(item.overtime),
    deductions: money(item.deductions),
    tax: money(item.tax),
    advances: money(item.advances),
    net: money(item.net),
  };
}

export function itemLines(item: { lines: Prisma.JsonValue }): PayrollLine[] {
  return payrollLinesSchema.parse(item.lines);
}

function refuseNegative(name: string, result: PayrollResult) {
  if (isNegative(result.net)) {
    throw new ValidationError(`${name}: deductions and tax are larger than the pay. Correct the amounts.`, {
      net: ["Net salary can't be negative."],
    });
  }
}

/**
 * Builds the payslips of a month from the salary structures: every employee expected in the period (joined by its
 * last day, not left before its first day, not suspended) who has a basic salary. Bonus, overtime and notes are
 * carried over from `keep` (recalculation). Returns the items and the people skipped for lack of a salary.
 */
async function buildItems(
  ctx: TenantContext,
  period: { start: string; end: string },
  keep: ReadonlyMap<string, { bonus: string; overtime: string; note: string | null }>,
  client: DbClient,
) {
  const employees = await employeeRepository.listForAttendance(
    ctx.companyId,
    { from: period.start, to: period.end },
    {},
    client,
  );
  const ids = employees.map((employee) => employee.id);
  const [salaries, components, advances] = await Promise.all([
    compensationRepository.listSalaries(ctx.companyId, ids, client),
    salaryStructureRepository.listActive(ctx.companyId, ids, client),
    salaryAdvanceRepository.listOutstanding(ctx.companyId, ids, period.end, client),
  ]);
  const salaryOf = new Map(salaries.map((row) => [row.employeeId, row.salary]));
  const items: PayrollItemData[] = [];
  const skipped: string[] = [];
  for (const employee of employees) {
    const salary = salaryOf.get(employee.id);
    if (!salary) {
      skipped.push(employee.name);
      continue;
    }
    const own = components.filter((component) => component.employeeId === employee.id);
    const kept = keep.get(employee.id);
    const base = {
      basic: money(salary),
      allowances: sumComponents(own, "ALLOWANCE"),
      bonus: kept?.bonus ?? "0.00",
      overtime: kept?.overtime ?? "0.00",
      deductions: sumComponents(own, "DEDUCTION"),
      tax: sumComponents(own, "TAX"),
    };
    const beforeAdvances = calculatePayroll({ ...base, advances: "0" });
    refuseNegative(employee.name, beforeAdvances);
    const recovery = advancesToRecover(
      beforeAdvances.net,
      advances.filter((advance) => advance.employeeId === employee.id),
    );
    const result = calculatePayroll({ ...base, advances: recovery.total });
    const joined = dateToDateOnly(employee.joiningDate);
    const left = employee.exitDate ? dateToDateOnly(employee.exitDate) : null;
    items.push({
      employeeId: employee.id,
      employeeNumber: employee.number,
      employeeName: employee.name,
      departmentName: employee.department?.name ?? null,
      position: employee.position,
      basic: result.basic,
      allowances: result.allowances,
      bonus: result.bonus,
      overtime: result.overtime,
      deductions: result.deductions,
      tax: result.tax,
      advances: result.advances,
      net: result.net,
      lines: [
        ...own.map((component) => ({
          kind: component.kind,
          name: component.name,
          amount: money(component.amount),
        })),
        ...recovery.recovered.map((advance) => ({
          kind: "ADVANCE" as const,
          name: `Advance ${formatRecordNumber("advance", advance.number)}`,
          amount: money(advance.amount),
          advanceId: advance.id,
        })),
      ],
      partialPeriod: joined > period.start || (left !== null && left < period.end),
      note: kept?.note ?? null,
    });
  }
  return { items, skipped };
}

/** Locks the run for this transaction and checks it is in one of `allowed` statuses. */
async function lockIn(
  ctx: TenantContext,
  run: Run,
  allowed: readonly PayrollStatusKey[],
  action: string,
  client: DbClient,
) {
  const status = await payrollRepository.lockRun(ctx.companyId, run.id, client);
  if (!status) throw new NotFoundError("Payroll run");
  if (!allowed.includes(status)) {
    throw new ConflictError(`A ${status.toLowerCase().replace("_", " ")} payroll can't be ${action}.`);
  }
}

export const payrollService = {
  async list(ctx: TenantContext, query: PayrollListQuery) {
    authorize(ctx, "payroll:view");
    const page = await payrollRepository.listRuns(ctx.companyId, query);
    const totals = await payrollRepository.totalsByRun(
      ctx.companyId,
      page.items.map((run) => run.id),
    );
    const byRun = new Map(totals.map((row) => [row.runId, row]));
    return {
      ...page,
      items: page.items.map((run) => ({
        ...run,
        employees: byRun.get(run.id)?.count ?? 0,
        net: money(byRun.get(run.id)?.sums.net ?? "0"),
      })),
    };
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "payroll:view");
    const run = await payrollRepository.findRun(ctx.companyId, id);
    if (!run) throw new NotFoundError("Payroll run");
    return run;
  },

  /** The run with its payslips and exact totals. */
  async detail(ctx: TenantContext, id: string) {
    const run = await this.get(ctx, id);
    const items = await payrollRepository.listItems(ctx.companyId, id);
    const amounts = items.map(itemAmounts);
    return { run, items, totals: sumPayroll(amounts), label: label(run) };
  },

  /** What the user may do with this run now — drives the buttons; every action re-checks on the server. */
  abilities(ctx: TenantContext, run: Run) {
    return {
      edit: run.status === "DRAFT" && can(ctx, "payroll:edit"),
      submit: run.status === "DRAFT" && can(ctx, "payroll:edit"),
      approve: run.status === "SUBMITTED" && can(ctx, "payroll:approve") && run.createdById !== ctx.userId,
      reject: run.status === "SUBMITTED" && can(ctx, "payroll:reject"),
      pay: run.status === "APPROVED" && can(ctx, "accounting:create"),
      cancel: CANCELLABLE.includes(run.status) && can(ctx, "payroll:delete"),
    };
  },

  /** Processes a month: creates the run and one payslip per eligible employee from their salary structure. */
  async process(ctx: TenantContext, input: PayrollRunInput) {
    authorize(ctx, "payroll:create");
    const period = monthBounds(input.period);
    const { currency } = await salesContext(ctx);
    // The pay date belongs to the month: from its first day to 31 days after its last (catches typos).
    if (input.payDate < period.start || input.payDate > addDays(period.end, 31)) {
      throw new ValidationError("The pay date must be in the payroll month or within 31 days after it.", {
        payDate: ["Between the start of the month and 31 days after its end."],
      });
    }
    const existing = await payrollRepository.findActiveRun(ctx.companyId, input.period);
    if (existing) {
      throw new ConflictError(
        `Payroll for ${label(existing)} already exists (${code(existing)}). Cancel it first to process the month again.`,
      );
    }
    return db.$transaction(async (tx) => {
      const { items, skipped } = await buildItems(ctx, period, new Map(), tx);
      if (items.length === 0) {
        throw new ValidationError(
          "No employee in this month has a basic salary. Set salaries on the employees' Salary & bank tab first.",
        );
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "payroll", tx);
      // The unique active_period also stops two simultaneous requests for the same month.
      const run = await payrollRepository.createRun(
        ctx.companyId,
        number,
        {
          periodYear: period.year,
          periodMonth: period.month,
          periodStart: dateOnlyToDate(period.start),
          periodEnd: dateOnlyToDate(period.end),
          activePeriod: input.period,
          payDate: dateOnlyToDate(input.payDate),
          currency,
          notes: input.notes || null,
        },
        ctx.userId,
        tx,
      );
      await payrollRepository.createItems(ctx.companyId, run.id, items, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "payroll.process",
          entityType: "PayrollRun",
          entityId: run.id,
          after: { period: input.period, status: "DRAFT", employees: items.length },
          metadata: {
            summary: `${label(run)}: ${items.length} payslips${skipped.length ? `; skipped (no salary): ${skipped.join(", ")}` : ""}`,
          },
        },
        tx,
      );
      return { run, employees: items.length, skipped };
    });
  },

  /**
   * Rebuilds a draft's payslips from the current salary structures, employees and advances. Bonus, overtime and
   * notes typed in are kept; other manual changes are replaced.
   */
  async recalculate(ctx: TenantContext, id: string) {
    authorize(ctx, "payroll:edit");
    const run = await this.get(ctx, id);
    return db.$transaction(async (tx) => {
      await lockIn(ctx, run, EDITABLE, "recalculated", tx);
      const current = await payrollRepository.listItems(ctx.companyId, id, tx);
      const keep = new Map(
        current.map((item) => [
          item.employeeId,
          { bonus: money(item.bonus), overtime: money(item.overtime), note: item.note },
        ]),
      );
      const { items, skipped } = await buildItems(
        ctx,
        { start: dateToDateOnly(run.periodStart), end: dateToDateOnly(run.periodEnd) },
        keep,
        tx,
      );
      await payrollRepository.deleteItems(ctx.companyId, id, tx);
      await payrollRepository.createItems(ctx.companyId, id, items, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "payroll.recalculate",
          entityType: "PayrollRun",
          entityId: id,
          metadata: {
            summary: `${items.length} payslips${skipped.length ? `; skipped (no salary): ${skipped.join(", ")}` : ""}`,
          },
        },
        tx,
      );
      return { employees: items.length, skipped };
    });
  },

  /** Adjusts one draft payslip (bonus, overtime, one-off deductions, a prorated basic…). Advances stay as computed. */
  async updateItem(ctx: TenantContext, runId: string, itemId: string, input: PayrollItemInput) {
    authorize(ctx, "payroll:edit");
    const run = await this.get(ctx, runId);
    await db.$transaction(async (tx) => {
      await lockIn(ctx, run, EDITABLE, "edited", tx);
      const item = await payrollRepository.findItem(ctx.companyId, runId, itemId, tx);
      if (!item) throw new NotFoundError("Payslip");
      const before = itemAmounts(item);
      const result = calculatePayroll({ ...input, advances: before.advances });
      refuseNegative(item.employeeName, result);
      const changed = PAYROLL_FIELDS.filter(
        (field) => field !== "advances" && result[field] !== before[field],
      );
      if (changed.length === 0 && (input.note || null) === item.note) return;
      await payrollRepository.updateItem(
        ctx.companyId,
        runId,
        itemId,
        {
          basic: result.basic,
          allowances: result.allowances,
          bonus: result.bonus,
          overtime: result.overtime,
          deductions: result.deductions,
          tax: result.tax,
          net: result.net,
          note: input.note || null,
        },
        ctx.userId,
        tx,
      );
      // Which fields changed — not the amounts (salary data stays out of the audit log).
      await writeAuditLog(
        ctx,
        {
          action: "payroll.item_update",
          entityType: "PayrollRun",
          entityId: runId,
          metadata: {
            itemId,
            employeeId: item.employeeId,
            summary: `${item.employeeName}: ${changed.length ? `changed ${changed.join(", ")}` : "note"}`,
          },
        },
        tx,
      );
    });
  },

  async submit(ctx: TenantContext, id: string) {
    authorize(ctx, "payroll:edit");
    const run = await this.get(ctx, id);
    await this.move(ctx, run, EDITABLE, "SUBMITTED", "payroll.submit", "submitted", {}, null);
  },

  /** Approves a submitted run. The person who processed it can't approve it (segregation of duties). */
  async approve(ctx: TenantContext, id: string, note?: string) {
    authorize(ctx, "payroll:approve");
    const run = await this.get(ctx, id);
    if (run.createdById === ctx.userId) {
      throw new ForbiddenError("The person who processed a payroll can't approve it. Ask another approver.");
    }
    await this.move(
      ctx,
      run,
      ["SUBMITTED"],
      "APPROVED",
      "payroll.approve",
      "approved",
      {
        approvedById: ctx.userId,
        approvedAt: new Date(),
        reviewNote: note || null,
      },
      note || null,
    );
  },

  /** Sends a submitted run back to draft with a reason. */
  async reject(ctx: TenantContext, id: string, note: string) {
    authorize(ctx, "payroll:reject");
    if (note.trim().length < 3) throw new ValidationError("Give a reason.", { note: ["Give a reason."] });
    const run = await this.get(ctx, id);
    await this.move(
      ctx,
      run,
      ["SUBMITTED"],
      "DRAFT",
      "payroll.reject",
      "sent back",
      { reviewNote: note },
      note,
    );
  },

  /** Cancels an unpaid run; its month can then be processed again. Paid runs are final. */
  async cancel(ctx: TenantContext, id: string, reason: string) {
    authorize(ctx, "payroll:delete");
    if (reason.trim().length < 3) throw new ValidationError("Give a reason.", { note: ["Give a reason."] });
    const run = await this.get(ctx, id);
    await this.move(
      ctx,
      run,
      CANCELLABLE,
      "CANCELLED",
      "payroll.cancel",
      "cancelled",
      {
        activePeriod: null,
        cancelReason: reason,
      },
      reason,
    );
  },

  async move(
    ctx: TenantContext,
    run: Run,
    from: readonly PayrollStatusKey[],
    to: PayrollStatusKey,
    action: string,
    verb: string,
    data: Prisma.PayrollRunUncheckedUpdateManyInput,
    note: string | null,
  ) {
    await db.$transaction(async (tx) => {
      await lockIn(ctx, run, from, verb, tx);
      if (to === "SUBMITTED" && (await payrollRepository.listItems(ctx.companyId, run.id, tx)).length === 0) {
        throw new ConflictError("A payroll without payslips can't be submitted.");
      }
      if (
        !(await payrollRepository.updateRun(
          ctx.companyId,
          run.id,
          from,
          { ...data, status: to },
          ctx.userId,
          tx,
        ))
      )
        throw new ConflictError("The payroll changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action,
          entityType: "PayrollRun",
          entityId: run.id,
          before: { status: run.status },
          after: { status: to },
          metadata: { summary: note ?? undefined },
        },
        tx,
      );
    });
  },

  /**
   * Marks an approved run as paid: posts it to the ledger (rule P3), marks the recovered advances and freezes the
   * run. Needs `accounting:create` besides seeing payroll. Posting keys make a repeated request a no-op.
   */
  async markPaid(ctx: TenantContext, id: string, payment: { paidAt: string; method: PaymentMethodKey }) {
    authorize(ctx, "payroll:view");
    authorize(ctx, "accounting:create");
    const run = await this.get(ctx, id);
    const { today } = await salesContext(ctx);
    if (payment.paidAt > today)
      throw new ValidationError("The payment date can't be in the future.", { paidAt: ["In the future."] });
    const { method } = payment;
    await db.$transaction(async (tx) => {
      await lockIn(ctx, run, ["APPROVED"], "paid", tx);
      const items = await payrollRepository.listItems(ctx.companyId, id, tx);
      const totals = sumPayroll(items.map(itemAmounts));
      const advanceIds = items.flatMap((item) =>
        itemLines(item).flatMap((line) => (line.advanceId ? [line.advanceId] : [])),
      );
      if (advanceIds.length > 0) {
        const recovered = await salaryAdvanceRepository.markRecovered(
          ctx.companyId,
          advanceIds,
          id,
          ctx.userId,
          tx,
        );
        if (recovered !== advanceIds.length) {
          throw new ConflictError(
            "An advance in this payroll was cancelled or recovered elsewhere. Cancel this payroll and process the month again.",
          );
        }
      }
      if (
        !(await payrollRepository.updateRun(
          ctx.companyId,
          id,
          ["APPROVED"],
          {
            status: "PAID",
            paidAt: dateOnlyToDate(payment.paidAt),
            paidMethod: method,
            paidById: ctx.userId,
          },
          ctx.userId,
          tx,
        ))
      )
        throw new ConflictError("The payroll changed meanwhile. Reload and try again.");
      const entry = await ledgerService.postPayrollPaid(
        ctx.companyId,
        ctx.userId,
        { id, number: run.number, periodLabel: label(run) },
        totals,
        { method, date: payment.paidAt },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "payroll.pay",
          entityType: "PayrollRun",
          entityId: id,
          before: { status: "APPROVED" },
          after: { status: "PAID", paidAt: payment.paidAt, method },
          metadata: {
            journalEntryId: entry?.id,
            summary: entry ? `Posted as ${formatRecordNumber("journal", entry.number)}` : "Nothing to post",
          },
        },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "PayrollRun", id, {
      actions: HISTORY_ACTIONS,
      fields: { status: "status" },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  async item(ctx: TenantContext, runId: string, itemId: string) {
    const run = await this.get(ctx, runId);
    const item = await payrollRepository.findItem(ctx.companyId, runId, itemId);
    if (!item) throw new NotFoundError("Payslip");
    return { run, item };
  },

  /**
   * The salary slip of one payslip as a PDF. Draft and submitted runs are marked as such on the slip; cancelled
   * runs have no slips.
   */
  async payslipPdf(ctx: TenantContext, runId: string, itemId: string) {
    const { run, item } = await this.item(ctx, runId, itemId);
    if (run.status === "CANCELLED") throw new ConflictError("A cancelled payroll has no salary slips.");
    const sales = await salesContext(ctx);
    const show = (value: string) =>
      formatMoney(value, { locale: sales.locale, currency: run.currency }) ?? value;
    const amounts = itemAmounts(item);
    const result = calculatePayroll(amounts);
    const lines = itemLines(item);
    const named = (kind: PayrollLine["kind"]) =>
      lines
        .filter((line) => line.kind === kind)
        .map((line) => ({ label: line.name, amount: show(line.amount) }));
    const earnings = [
      { label: "Basic salary", amount: show(amounts.basic) },
      ...withRemainder(named("ALLOWANCE"), lines, "ALLOWANCE", amounts.allowances, "Allowances", show),
      ...(amounts.bonus !== "0.00" ? [{ label: "Bonus", amount: show(amounts.bonus) }] : []),
      ...(amounts.overtime !== "0.00" ? [{ label: "Overtime", amount: show(amounts.overtime) }] : []),
    ];
    const deductions = [
      ...withRemainder(named("DEDUCTION"), lines, "DEDUCTION", amounts.deductions, "Deductions", show),
      ...withRemainder(named("TAX"), lines, "TAX", amounts.tax, "Tax", show),
      ...withRemainder(named("ADVANCE"), lines, "ADVANCE", amounts.advances, "Advance recovery", show),
    ];
    const bytes = await renderPayslipPdf({
      company: companyParty(sales),
      logo: await companyService.getLogo(ctx),
      reference: `${code(run)} · ${label(run)}`,
      status: PAYROLL_STATUS_LABELS[run.status],
      employee: {
        name: item.employeeName,
        lines: [
          formatRecordNumber("employee", item.employeeNumber),
          [item.position, item.departmentName].filter(Boolean).join(" · "),
        ],
      },
      facts: [
        {
          label: "Pay period",
          value: `${formatCalendarDate(run.periodStart, sales)} – ${formatCalendarDate(run.periodEnd, sales)}`,
        },
        { label: "Pay date", value: formatCalendarDate(run.paidAt ?? run.payDate, sales) },
        { label: "Currency", value: run.currency },
      ],
      earnings,
      deductions: deductions.length ? deductions : [{ label: "None", amount: show("0.00") }],
      gross: show(result.gross),
      totalDeductions: show(result.totalDeductions),
      net: show(result.net),
      note: item.note,
      footer: `${sales.company.name} · computer-generated salary slip`,
    });
    const filename = `salary-slip-${code(run)}-${formatRecordNumber("employee", item.employeeNumber)}.pdf`;
    return { bytes, filename };
  },

  /** An employee's payslips in approved and paid runs (payroll history). */
  async employeeHistory(ctx: TenantContext, employeeId: string) {
    authorize(ctx, "payroll:view");
    if (!(await employeeRepository.findById(ctx.companyId, employeeId))) throw new NotFoundError("Employee");
    return payrollRepository.listEmployeeItems(ctx.companyId, employeeId);
  },

  /**
   * Payroll reports for approved and paid runs whose month falls in the period: totals per month, cost per
   * department, and per-employee totals (incl. tax withheld).
   */
  async report(ctx: TenantContext, preset: DateRangePreset) {
    authorize(ctx, "payroll:view");
    const bounds = await periodBounds(ctx, preset);
    const runs = await payrollRepository.listReportRuns(ctx.companyId, {
      from: bounds.from.slice(0, 7),
      to: addDays(bounds.to, -1).slice(0, 7),
    });
    const items = await payrollRepository.listItemsOfRuns(
      ctx.companyId,
      runs.map((run) => run.id),
    );
    const group = (key: (item: Item) => string) => {
      const groups = new Map<string, ReturnType<typeof itemAmounts>[]>();
      for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), itemAmounts(item)]);
      return groups;
    };
    const byRun = group((item) => item.runId);
    const byDepartment = group((item) => item.departmentName ?? "No department");
    const byEmployee = group((item) => `${item.employeeId}|${item.employeeName}|${item.employeeNumber}`);
    return {
      period: bounds.label,
      runs: runs.map((run) => ({
        run,
        label: label(run),
        totals: sumPayroll(byRun.get(run.id) ?? []),
        employees: byRun.get(run.id)?.length ?? 0,
      })),
      departments: [...byDepartment.entries()]
        .map(([name, rows]) => ({ name, totals: sumPayroll(rows), payslips: rows.length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      employees: [...byEmployee.entries()]
        .map(([key, rows]) => {
          const [employeeId = "", name = "", number = "0"] = key.split("|");
          return {
            employeeId,
            name,
            number: Number(number),
            totals: sumPayroll(rows),
            payslips: rows.length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      totals: sumPayroll(items.map(itemAmounts)),
    };
  },
};

/**
 * The structure lines of one kind, plus a row for any difference to the payslip's total (a one-off adjustment
 * typed in for this run). Exact: the difference is computed in cents.
 */
function withRemainder(
  rows: Array<{ label: string; amount: string }>,
  lines: readonly PayrollLine[],
  kind: PayrollLine["kind"],
  total: string,
  label: string,
  show: (value: string) => string,
): Array<{ label: string; amount: string }> {
  const listed = sumMoney(lines.filter((line) => line.kind === kind).map((line) => money(line.amount)));
  const rest = subtractMoney(total, listed);
  if (rest === "0.00") return rows;
  return [...rows, { label: rows.length ? `${label} (adjustment)` : label, amount: show(rest) }];
}
