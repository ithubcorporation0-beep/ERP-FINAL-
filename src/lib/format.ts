/** Server-side display formatting in the company's locale and time zone (avoids browser/server mismatches). */
export interface CompanyFormat {
  locale: string;
  timeZone: string;
  currency: string;
}

export function formatDate(value: Date, { locale, timeZone }: CompanyFormat): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(value);
}

export function formatDateTime(value: Date, { locale, timeZone }: CompanyFormat): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(value);
}

/** A DATE column (no time zone): shown as the calendar date it was entered as. */
export function formatCalendarDate(value: Date, { locale }: Pick<CompanyFormat, "locale">): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

/** A decimal string Intl.NumberFormat can format exactly (no conversion to a binary float). */
function isNumericLiteral(text: string): text is `${number}` {
  return /^-?\d+(\.\d+)?$/.test(text);
}

/** Money in the company's currency. The exact decimal string is formatted — never rounded through a JS number. */
export function formatMoney(
  value: { toString(): string } | null,
  { locale, currency }: Pick<CompanyFormat, "locale" | "currency">,
): string | null {
  if (value === null) return null;
  const text = value.toString();
  if (!isNumericLiteral(text)) throw new Error(`Not a decimal amount: ${text}`);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(text);
}

export function formatBytes(bytes: number, { locale }: CompanyFormat): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

export function countryName(code: string | null, locale: string): string | null {
  if (!code) return null;
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
}
