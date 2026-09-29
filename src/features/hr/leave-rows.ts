import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveStatusKey, type LeaveTypeKey } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import type { SalesRow } from "@/features/sales/sales-lists";
import { formatCalendarDate } from "@/lib/format";
import { LEAVE_STATUS_TONES } from "./labels";

/** "3 days" / "1 day". */
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Server-side mapping from a leave request to a preformatted list row. */
export function leaveRow(
  leave: {
    id: string;
    number: number;
    type: LeaveTypeKey;
    status: LeaveStatusKey;
    startDate: Date;
    endDate: Date;
    days: number;
    employee: { name: string };
  },
  { locale }: { locale: string },
): SalesRow {
  const start = formatCalendarDate(leave.startDate, { locale });
  const end = formatCalendarDate(leave.endDate, { locale });
  return {
    id: leave.id,
    href: `/hr/leave/${leave.id}`,
    code: formatRecordNumber("leave", leave.number),
    reference: LEAVE_TYPE_LABELS[leave.type],
    customer: leave.employee.name,
    date: start === end ? start : `${start} – ${end}`,
    amount: dayCount(leave.days),
    status: { label: LEAVE_STATUS_LABELS[leave.status], tone: LEAVE_STATUS_TONES[leave.status] },
  };
}
