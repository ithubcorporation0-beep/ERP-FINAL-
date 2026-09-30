import "server-only";
import { formatRecordNumber } from "@/config/records";
import { MAX_MONEY } from "@/config/sales";
import { resolveDateRange, todayInZone, type DateRangePreset } from "@/lib/date-range";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { countryName, formatCalendarDate, formatMoney } from "@/lib/format";
import { calculateLine, calculateTotals, compareMoney, money } from "@/lib/money";
import type { SalesPdfData } from "@/lib/pdf/sales-document";
import type { TenantContext } from "@/lib/tenant";
import type { LineItemInput } from "@/lib/validation";
import { companyRepository } from "@/server/repositories/company.repository";
import { customerRepository } from "@/server/repositories/customer.repository";
import type { DbClient } from "@/server/repositories/helpers";
import type { DateBounds } from "@/server/repositories/journal.repository";
import type { PricedItem } from "@/server/repositories/sales-items";

/**
 * Helpers shared by quotations, invoices and payments: exact line pricing, checks that referenced records belong
 * to the current company, and the company/customer details printed on documents.
 */

/** Prices every line exactly (src/lib/money.ts) and totals the document. */
export function priceItems(items: readonly LineItemInput[]) {
  const priced: PricedItem[] = items.map((item, position) => ({
    position,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent,
    taxRate: item.taxRate,
    ...calculateLine(item),
  }));
  const totals = calculateTotals(priced);
  if (compareMoney(totals.subtotal, MAX_MONEY) > 0 || compareMoney(totals.total, MAX_MONEY) > 0) {
    throw new ValidationError("The document total is too large.", {
      items: ["The document total is too large."],
    });
  }
  return { items: priced, totals };
}

/** The customer must be an active customer of THIS company — ids from the request are never trusted. */
export async function assertActiveCustomer(ctx: TenantContext, customerId: string, client?: DbClient) {
  const customer = await customerRepository.findSummary(ctx.companyId, customerId, client);
  if (!customer || customer.deletedAt) {
    throw new ValidationError("Choose a customer.", { customerId: ["Choose a customer."] });
  }
  return customer;
}

/** Company settings needed by sales documents. Any member may read them. */
export async function salesContext(ctx: TenantContext) {
  const company = await companyRepository.findProfile(ctx.companyId);
  if (!company) throw new NotFoundError("Company");
  return {
    company,
    currency: company.baseCurrency,
    locale: company.locale,
    timeZone: company.timezone,
    today: todayInZone(company.timezone),
  };
}

export type SalesContext = Awaited<ReturnType<typeof salesContext>>;

/** Calendar bounds of a period preset in the company's time zone and fiscal year ("YYYY-MM-DD", end exclusive). */
export async function periodBounds(
  ctx: TenantContext,
  preset: DateRangePreset,
): Promise<Required<DateBounds> & { label: string }> {
  const { company, timeZone } = await salesContext(ctx);
  const range = resolveDateRange(preset, { timeZone, fiscalYearStartMonth: company.fiscalYearStartMonth });
  const first = range.months[0];
  const last = range.months.at(-1);
  if (!first || !last) throw new Error("Empty period");
  const next =
    last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 };
  return {
    from: `${first.key}-01`,
    to: `${next.year}-${String(next.month).padStart(2, "0")}-01`,
    label: `${first.key} to ${last.key}`,
  };
}

/** Items as returned by the repositories, back to form input (exact strings). */
export function itemsToInput(
  items: ReadonlyArray<{
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    discountPercent: { toString(): string };
    taxRate: { toString(): string };
  }>,
): LineItemInput[] {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity.toString(),
    unitPrice: money(item.unitPrice),
    discountPercent: item.discountPercent.toString(),
    taxRate: item.taxRate.toString(),
  }));
}

export type DocumentPresentation = Omit<SalesPdfData, "logo">;

interface DocumentForPdf {
  title: string;
  code: string;
  status?: string;
  currency: string;
  customer: {
    number: number;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    taxId: string | null;
  };
  facts: Array<{ label: string; value: Date | string }>;
  items: ReadonlyArray<{
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    discountPercent: { toString(): string };
    taxRate: { toString(): string };
    lineTotal: { toString(): string };
  }>;
  totals: Array<{ label: string; value: { toString(): string }; strong?: boolean }>;
  notes: string | null;
  terms: string | null;
}

function percent(value: { toString(): string }): string {
  const text = value.toString();
  return text === "0" || /^0(\.0+)?$/.test(text) ? "—" : `${text.replace(/\.?0+$/, "")}%`;
}

/** The company block printed on documents (quotations, invoices, salary slips). */
export function companyParty({ company, locale }: SalesContext): { name: string; lines: string[] } {
  return {
    name: company.legalName ?? company.name,
    lines: [
      company.address ?? "",
      countryName(company.country, locale) ?? "",
      [company.email, company.phone].filter(Boolean).join(" · "),
      company.taxId ? `Tax number: ${company.taxId}` : "",
    ],
  };
}

/** How a document is shown — on screen, printed and in the PDF — formatted in the company's locale. */
export function presentDocument(sales: SalesContext, doc: DocumentForPdf): DocumentPresentation {
  const { company, locale } = sales;
  const moneyText = (value: { toString(): string }) =>
    formatMoney(money(value), { locale, currency: doc.currency }) ?? "";
  return {
    title: doc.title,
    code: doc.code,
    status: doc.status,
    company: companyParty(sales),
    customer: {
      name: doc.customer.companyName ?? doc.customer.name,
      lines: [
        doc.customer.companyName ? `Attn: ${doc.customer.name}` : "",
        doc.customer.address ?? "",
        [doc.customer.city, countryName(doc.customer.country, locale)].filter(Boolean).join(", "),
        [doc.customer.email, doc.customer.phone].filter(Boolean).join(" · "),
        doc.customer.taxId ? `Tax number: ${doc.customer.taxId}` : "",
        `Customer ID: ${formatRecordNumber("customer", doc.customer.number)}`,
      ],
    },
    facts: doc.facts.map((fact) => ({
      label: fact.label,
      value: typeof fact.value === "string" ? fact.value : formatCalendarDate(fact.value, { locale }),
    })),
    items: doc.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString().replace(/\.?0+$/, "") || "0",
      unitPrice: moneyText(item.unitPrice),
      discount: percent(item.discountPercent),
      tax: percent(item.taxRate),
      total: moneyText(item.lineTotal),
    })),
    totals: doc.totals.map((total) => ({
      label: total.label,
      value: moneyText(total.value),
      strong: total.strong,
    })),
    notes: doc.notes,
    terms: doc.terms,
    footer: company.name,
  };
}
