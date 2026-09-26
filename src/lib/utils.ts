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

/** "Ada Lovelace" → "AL", "admin" → "AD". Used for avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  const letters = last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** "IT Hub Ltd." → "it-hub-ltd". URL-safe identifier for companies. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
