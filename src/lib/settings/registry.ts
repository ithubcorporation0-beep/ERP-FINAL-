import { z } from "zod";

/**
 * Every company setting: key → validation schema, default and description. The `settings` table
 * only stores values that differ from the default. Add new settings here (all three maps) —
 * never read or write raw rows without going through `settingsService`.
 */
const schemas = {
  "general.dateFormat": z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]),
  "general.weekStartsOn": z.number().int().min(0).max(6),
  "documents.invoiceNumberPrefix": z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9-]+$/, "Use capital letters, digits and dashes only."),
  "sales.paymentTermsDays": z.number().int().min(0).max(365),
  "sales.quotationValidityDays": z.number().int().min(1).max(365),
  "sales.documentTerms": z.string().trim().max(2000),
};

export type SettingKey = keyof typeof schemas;
export type SettingValues = { [K in SettingKey]: z.infer<(typeof schemas)[K]> };
export type SettingValue<K extends SettingKey> = SettingValues[K];

// Typed as a mapped type so `SETTING_SCHEMAS[key]` keeps the link between a key and its value type.
const SETTING_SCHEMAS: { [K in SettingKey]: z.ZodType<SettingValues[K]> } = schemas;

const SETTING_DEFAULTS: SettingValues = {
  "general.dateFormat": "yyyy-MM-dd",
  "general.weekStartsOn": 1,
  "documents.invoiceNumberPrefix": "INV-",
  "sales.paymentTermsDays": 30,
  "sales.quotationValidityDays": 30,
  "sales.documentTerms": "",
};

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  "general.dateFormat": "How dates are displayed.",
  "general.weekStartsOn": "First day of the week (0 = Sunday … 6 = Saturday).",
  "documents.invoiceNumberPrefix": "Prefix for new invoice numbers, e.g. INV-.",
  "sales.paymentTermsDays": "Default days until an invoice is due.",
  "sales.quotationValidityDays": "Default days a quotation stays valid.",
  "sales.documentTerms": "Default terms and conditions printed on quotations and invoices.",
};

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(schemas, value);
}

export const SETTING_KEYS: readonly SettingKey[] = Object.keys(schemas).filter(isSettingKey);

export function settingSchema<K extends SettingKey>(key: K): z.ZodType<SettingValue<K>> {
  return SETTING_SCHEMAS[key];
}

export function defaultSettings(): SettingValues {
  return { ...SETTING_DEFAULTS };
}
