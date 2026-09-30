import { PAYROLL_STATUS_LABELS, periodLabel, type PayrollStatusKey } from "@/config/payroll";
import { formatRecordNumber } from "@/config/records";
import type { SalesRow } from "@/features/sales/sales-lists";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { PAYROLL_STATUS_TONES } from "./labels";

/** Server-side mapping from a payroll run to a preformatted list row. */
export function payrollRunRow(
  run: {
    id: string;
    number: number;
    periodYear: number;
    periodMonth: number;
    payDate: Date;
    currency: string;
    status: PayrollStatusKey;
    employees: number;
    net: string;
  },
  { locale }: { locale: string },
): SalesRow {
  return {
    id: run.id,
    href: `/payroll/runs/${run.id}`,
    code: formatRecordNumber("payroll", run.number),
    customer: periodLabel(run.periodYear, run.periodMonth, locale),
    date: formatCalendarDate(run.payDate, { locale }),
    secondary: `${run.employees} ${run.employees === 1 ? "employee" : "employees"}`,
    amount: formatMoney(run.net, { locale, currency: run.currency }) ?? run.net,
    status: { label: PAYROLL_STATUS_LABELS[run.status], tone: PAYROLL_STATUS_TONES[run.status] },
  };
}
