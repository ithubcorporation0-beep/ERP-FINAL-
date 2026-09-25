export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number | string, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount));
}

/** Rounds to 2 decimal places using half-away-from-zero, avoiding float drift (e.g. 1.005). */
export function roundMoney(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}
