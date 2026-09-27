import { formatRecordNumber, OPEN_LEAD_STATUSES, type LeadSourceKey, type LeadStatusKey } from "@/config/crm";
import { zonedParts } from "@/lib/date-range";
import type { BoardLead } from "./lead-board";
import type { LeadRow } from "./lead-list";
import { formatCalendarDate, formatDate, formatMoney, type CompanyFormat } from "./format";

/** The lead fields list and board views need (as returned by the lead repository). */
interface LeadRecord {
  id: string;
  number: number;
  name: string;
  companyName: string | null;
  status: LeadStatusKey;
  source: LeadSourceKey;
  expectedValue: { toString(): string } | null;
  followUpDate: Date | null;
  createdAt: Date;
  assignedTo: { name: string } | null;
}

/** Today's date ("YYYY-MM-DD") in the company's time zone. */
export function companyToday(timeZone: string, now = new Date()): string {
  const { year, month, day } = zonedParts(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** An open lead whose follow-up date is before today. */
export function isFollowUpOverdue(lead: Pick<LeadRecord, "status" | "followUpDate">, today: string): boolean {
  return (
    lead.followUpDate !== null &&
    OPEN_LEAD_STATUSES.includes(lead.status) &&
    lead.followUpDate.toISOString().slice(0, 10) < today
  );
}

export function toBoardLead(lead: LeadRecord, format: CompanyFormat, today: string): BoardLead {
  return {
    id: lead.id,
    code: formatRecordNumber("lead", lead.number),
    name: lead.name,
    companyName: lead.companyName,
    status: lead.status,
    expectedValue: lead.expectedValue?.toString() ?? null,
    expectedValueLabel: formatMoney(lead.expectedValue, format),
    followUpLabel: lead.followUpDate ? formatCalendarDate(lead.followUpDate, format) : null,
    followUpOverdue: isFollowUpOverdue(lead, today),
    assigneeName: lead.assignedTo?.name ?? null,
  };
}

export function toLeadRow(lead: LeadRecord, format: CompanyFormat, today: string): LeadRow {
  const board = toBoardLead(lead, format, today);
  return {
    id: board.id,
    code: board.code,
    name: board.name,
    companyName: board.companyName,
    status: lead.status,
    source: lead.source,
    assigneeName: board.assigneeName,
    expectedValueLabel: board.expectedValueLabel,
    followUpLabel: board.followUpLabel,
    followUpOverdue: board.followUpOverdue,
    createdAt: formatDate(lead.createdAt, format),
  };
}
