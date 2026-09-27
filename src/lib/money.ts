/**
 * Exact decimal arithmetic for money. JavaScript numbers are binary floating point (0.1 + 0.2 !== 0.3), so amounts
 * are handled as decimal strings and calculated with BigInt integers of a fixed scale (e.g. cents). The same code
 * runs in the browser (live form totals) and on the server (the stored figures), so both always agree.
 *
 * Scales: money 2 decimals, quantity 3 decimals, percentages 2 decimals. Rounding is "half away from zero"
 * (1.005 → 1.01, -1.005 → -1.01), applied per line — the usual invoicing convention.
 */

export const MONEY_SCALE = 2;
export const QUANTITY_SCALE = 3;
export const PERCENT_SCALE = 2;

/** A decimal string such as "1500", "1500.5" or "-3.25" with at most `scale` decimals. */
function decimalPattern(scale: number): RegExp {
  return new RegExp(`^-?\\d{1,24}(\\.\\d{1,${scale}})?$`);
}

/** "12.5" at scale 2 → 1250n. Throws on anything that is not a plain decimal with at most `scale` decimals. */
export function toScaled(text: string, scale: number): bigint {
  const value = text.trim();
  if (!decimalPattern(scale).test(value))
    throw new Error(`Invalid decimal "${text}" (max ${scale} decimals)`);
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const scaled = BigInt(whole + fraction.padEnd(scale, "0"));
  return negative ? -scaled : scaled;
}

/** 1250n at scale 2 → "12.50". */
export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  const text = scale > 0 ? `${whole}.${fraction}` : whole;
  return negative ? `-${text}` : text;
}

/** Re-expresses a scaled value at a smaller scale, rounding half away from zero. */
export function rescale(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale >= fromScale) return value * 10n ** BigInt(toScale - fromScale);
  const divisor = 10n ** BigInt(fromScale - toScale);
  const magnitude = value < 0n ? -value : value;
  let quotient = magnitude / divisor;
  if ((magnitude % divisor) * 2n >= divisor) quotient += 1n;
  return value < 0n ? -quotient : quotient;
}

/** Money string → cents. */
export function toCents(text: string): bigint {
  return toScaled(text, MONEY_SCALE);
}

/** Cents → money string ("1234.50"). */
export function fromCents(cents: bigint): string {
  return fromScaled(cents, MONEY_SCALE);
}

/** Sum of money strings, exact. */
export function sumMoney(values: readonly string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

/** Normalises any decimal-like value (string, Prisma Decimal) to a 2-decimal money string. */
export function money(value: { toString(): string } | string): string {
  const text = value.toString();
  // Prisma Decimals of NUMERIC(18,2) columns print without trailing zeros ("12.5"); the pattern allows that.
  return fromCents(rescale(toScaled(text, 10), 10, MONEY_SCALE));
}

export interface LineInput {
  /** Up to 3 decimals, > 0. */
  quantity: string;
  /** Up to 2 decimals, ≥ 0. */
  unitPrice: string;
  /** Percent of the line amount, 0–100, up to 2 decimals. */
  discountPercent: string;
  /** Percent applied after the discount, 0–100, up to 2 decimals. */
  taxRate: string;
}

export interface LineAmounts {
  /** quantity × unit price, rounded to cents. */
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  /** subtotal − discount + tax. */
  lineTotal: string;
}

export interface DocumentTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

/** Amounts of one line. Each step is rounded to cents, so the stored figures add up exactly. */
export function calculateLine(line: LineInput): LineAmounts {
  const quantity = toScaled(line.quantity, QUANTITY_SCALE);
  const unitPrice = toScaled(line.unitPrice, MONEY_SCALE);
  const discountPercent = toScaled(line.discountPercent, PERCENT_SCALE);
  const taxRate = toScaled(line.taxRate, PERCENT_SCALE);

  const subtotal = rescale(quantity * unitPrice, QUANTITY_SCALE + MONEY_SCALE, MONEY_SCALE);
  // amount × percent / 100: the "/ 100" adds two more decimal places to the scale.
  const discount = rescale(subtotal * discountPercent, MONEY_SCALE + PERCENT_SCALE + 2, MONEY_SCALE);
  const taxable = subtotal - discount;
  const tax = rescale(taxable * taxRate, MONEY_SCALE + PERCENT_SCALE + 2, MONEY_SCALE);
  return {
    lineSubtotal: fromCents(subtotal),
    discountAmount: fromCents(discount),
    taxAmount: fromCents(tax),
    lineTotal: fromCents(taxable + tax),
  };
}

/** Document totals: the sums of the (already rounded) line amounts. */
export function calculateTotals(lines: readonly LineAmounts[]): DocumentTotals {
  return {
    subtotal: sumMoney(lines.map((line) => line.lineSubtotal)),
    discountTotal: sumMoney(lines.map((line) => line.discountAmount)),
    taxTotal: sumMoney(lines.map((line) => line.taxAmount)),
    total: sumMoney(lines.map((line) => line.lineTotal)),
  };
}

/** Compares two money strings: negative, zero or positive like `a - b`. */
export function compareMoney(a: string, b: string): number {
  const difference = toCents(a) - toCents(b);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

export function subtractMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}
