import { z } from "zod";

/**
 * Every company setting: key → validation schema, default and description. The `settings` table
 * only stores values that differ from the default. Add new settings here (all three maps) —
 * never read or write raw rows without going through `settingsService`.
 */
/** "HH:MM", 24-hour clock. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00.");

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
  "hr.workdayStart": clockTime,
  "hr.workdayEnd": clockTime,
  "hr.lateGraceMinutes": z.number().int().min(0).max(240),
  "hr.halfDayMinutes": z.number().int().min(0).max(720),
  "hr.workDays": z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Each day once."),
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
  "hr.workdayStart": "09:00",
  "hr.workdayEnd": "17:00",
  "hr.lateGraceMinutes": 10,
  "hr.halfDayMinutes": 240,
  "hr.workDays": [1, 2, 3, 4, 5],
};

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  "general.dateFormat": "How dates are displayed.",
  "general.weekStartsOn": "First day of the week (0 = Sunday … 6 = Saturday).",
  "documents.invoiceNumberPrefix": "Prefix for new invoice numbers, e.g. INV-.",
  "sales.paymentTermsDays": "Default days until an invoice is due.",
  "sales.quotationValidityDays": "Default days a quotation stays valid.",
  "sales.documentTerms": "Default terms and conditions printed on quotations and invoices.",
  "hr.workdayStart": "Start of the working day (company time zone); later check-ins are late.",
  "hr.workdayEnd": "End of the working day; earlier check-outs are early departures.",
  "hr.lateGraceMinutes": "Minutes after the start before a check-in counts as late.",
  "hr.halfDayMinutes": "A day with fewer worked minutes than this is a half day.",
  "hr.workDays": "Working days of the week (0 = Sunday … 6 = Saturday).",
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
