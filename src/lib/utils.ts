/**
 * Merges class names; later Tailwind classes override earlier conflicting ones.
 * shadcn/ui components import `cn` from the `cn` package directly; app code imports it from here.
 */
export { cn } from "cn";

export function formatCurrency(amount: number | string, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount));
}

/** Rounds to 2 decimal places using half-away-from-zero, avoiding float drift (e.g. 1.005). */
export function roundMoney(value: number): number {
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}
