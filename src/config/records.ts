/**
 * Human-readable record numbers ("CUS-0001"). The database stores the integer from a per-company counter
 * (`number_sequences`); the prefix is presentation only. Invoices are the exception: their number is issued with
 * the company's configurable prefix and stored as text (`invoices.code`), because an issued number never changes.
 */
export const RECORD_PREFIXES = {
  customer: "CUS",
  lead: "LEAD",
  quotation: "QUO",
  order: "SO",
  payment: "PAY",
  expense: "EXP",
  journal: "JE",
  employee: "EMP",
  leave: "LV",
} as const;
export type RecordKind = keyof typeof RECORD_PREFIXES;

export function formatRecordNumber(kind: RecordKind, value: number): string {
  return `${RECORD_PREFIXES[kind]}-${String(value).padStart(4, "0")}`;
}

/** "CUS-0012", "cus-12" or "12" → 12, so people can search by the ID they see. */
export function parseRecordNumber(kind: RecordKind, text: string): number | undefined {
  const match = new RegExp(`^(?:${RECORD_PREFIXES[kind]}-?)?0*(\\d{1,9})$`, "i").exec(text.trim());
  return match?.[1] ? Number(match[1]) : undefined;
}

/** Invoice number as issued: the prefix from settings ("INV-") + the zero-padded sequence value. */
export function formatInvoiceCode(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(4, "0")}`;
}
