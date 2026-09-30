import type { StockStatus, SupplierInvoiceStatusKey } from "@/config/inventory";
import { fromCents, fromScaled, MONEY_SCALE, QUANTITY_SCALE, rescale, toCents, toScaled } from "@/lib/money";

/**
 * Inventory rules (pure, no database), shared by services, pages and tests. Quantities are decimal strings with up
 * to 3 decimals, calculated exactly with BigInt (never JavaScript numbers). See docs/inventory.md.
 *
 * Stock is never stored: the stock of a product in a warehouse is the sum of its stock movements.
 */

/** Any decimal quantity (e.g. a Prisma Decimal "12.5") → canonical "12.500". */
export function quantity(value: { toString(): string } | string): string {
  return fromScaled(rescale(toScaled(value.toString(), 10), 10, QUANTITY_SCALE), QUANTITY_SCALE);
}

function scaled(value: string): bigint {
  return toScaled(quantity(value), QUANTITY_SCALE);
}

function text(value: bigint): string {
  return fromScaled(value, QUANTITY_SCALE);
}

export function sumQuantities(values: readonly string[]): string {
  return text(values.reduce((total, value) => total + scaled(value), 0n));
}

export function addQuantity(a: string, b: string): string {
  return text(scaled(a) + scaled(b));
}

export function subtractQuantity(a: string, b: string): string {
  return text(scaled(a) - scaled(b));
}

export function negateQuantity(value: string): string {
  return text(-scaled(value));
}

/** Negative, zero or positive like `a - b`. */
export function compareQuantity(a: string, b: string): number {
  const difference = scaled(a) - scaled(b);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

/** "12.500" → "12.5", "3.000" → "3" (for display). */
export function trimQuantity(value: string): string {
  const canonical = quantity(value);
  return canonical.includes(".") ? canonical.replace(/\.?0+$/, "") : canonical;
}

/** Stock on hand = the sum of the signed movement quantities. */
export function stockOnHand(movements: ReadonlyArray<{ quantity: string }>): string {
  return sumQuantities(movements.map((movement) => movement.quantity));
}

/**
 * Stock status against the minimum stock: "out" at or below zero; "low" at or below the minimum (only when a
 * minimum is set); otherwise "ok".
 */
export function stockStatus(onHand: string, minimum: string): StockStatus {
  if (compareQuantity(onHand, "0") <= 0) return "out";
  if (compareQuantity(minimum, "0") > 0 && compareQuantity(onHand, minimum) <= 0) return "low";
  return "ok";
}

/**
 * Low-stock alert: a product with a minimum stock set whose stock is at or below it (including out of stock).
 * Products without a minimum (0) never alert — set a minimum to be warned.
 */
export function isLowStock(onHand: string, minimum: string): boolean {
  return compareQuantity(minimum, "0") > 0 && compareQuantity(onHand, minimum) <= 0;
}

/** Quantity to reorder to get back to the minimum (0 when not low). */
export function shortfall(onHand: string, minimum: string): string {
  return isLowStock(onHand, minimum) ? subtractQuantity(minimum, onHand) : "0.000";
}

/** The movement an adjustment records: counted − on hand (null when the count matches). */
export function adjustmentDelta(onHand: string, counted: string): string | null {
  const delta = subtractQuantity(counted, onHand);
  return compareQuantity(delta, "0") === 0 ? null : delta;
}

/** quantity × unit price, rounded to cents (line totals, stock value). */
export function lineAmount(qty: string, unitPrice: string): string {
  const product = scaled(qty) * toCents(unitPrice);
  return fromCents(rescale(product, QUANTITY_SCALE + MONEY_SCALE, MONEY_SCALE));
}

/** What is still to be received on an order line. */
export function remainingToReceive(ordered: string, received: string): string {
  const remaining = subtractQuantity(ordered, received);
  return compareQuantity(remaining, "0") > 0 ? remaining : "0.000";
}

/** Order status from its lines after a receipt: everything received → RECEIVED, some → PARTIALLY_RECEIVED. */
export function receiptStatus(
  lines: ReadonlyArray<{ ordered: string; received: string }>,
): "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" {
  const anyReceived = lines.some((line) => compareQuantity(line.received, "0") > 0);
  const allReceived = lines.every((line) => compareQuantity(line.received, line.ordered) >= 0);
  return allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED";
}

/** Supplier invoice status from what was paid (money strings). */
export function supplierInvoiceStatus(
  total: string,
  paid: string,
): Exclude<SupplierInvoiceStatusKey, "CANCELLED"> {
  if (toCents(paid) <= 0n) return "UNPAID";
  return toCents(paid) >= toCents(total) ? "PAID" : "PARTIALLY_PAID";
}
