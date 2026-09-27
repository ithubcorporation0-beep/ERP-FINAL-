/**
 * Country, currency, time-zone and locale lists from the runtime's built-in Intl data (ISO 3166, ISO 4217, IANA,
 * BCP 47). Used both for the Settings dropdowns and for server-side validation, so they always agree.
 */
export interface Option {
  value: string;
  label: string;
}

const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AA"]);

let countries: Option[] | undefined;
export function countryOptions(): Option[] {
  if (countries) return countries;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const result: Option[] = [];
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second);
      const name = NOT_COUNTRIES.has(code) ? undefined : names.of(code);
      if (name && name !== code) result.push({ value: code, label: name });
    }
  }
  countries = result.sort((a, b) => a.label.localeCompare(b.label));
  return countries;
}

export function isCountryCode(code: string): boolean {
  return countryOptions().some((option) => option.value === code);
}

export function currencyOptions(): Option[] {
  const names = new Intl.DisplayNames(["en"], { type: "currency", fallback: "code" });
  return Intl.supportedValuesOf("currency").map((code) => ({
    value: code,
    label: `${code} — ${names.of(code) ?? code}`,
  }));
}

export function isCurrencyCode(code: string): boolean {
  return Intl.supportedValuesOf("currency").includes(code);
}

export function timeZoneOptions(): Option[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")].map((zone) => ({
    value: zone,
    label: zone.replaceAll("_", " "),
  }));
}

export function isTimeZone(zone: string): boolean {
  return zone === "UTC" || Intl.supportedValuesOf("timeZone").includes(zone);
}

const COMMON_LOCALES = [
  "en-US",
  "en-GB",
  "en-AE",
  "en-IN",
  "en-AU",
  "en-CA",
  "ar-AE",
  "ar-SA",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "nl-NL",
  "pt-BR",
  "hi-IN",
  "ur-PK",
  "zh-CN",
  "ja-JP",
];

/** Common locales (formats numbers and dates); the current value is always included. */
export function localeOptions(current?: string): Option[] {
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const tags = current && !COMMON_LOCALES.includes(current) ? [current, ...COMMON_LOCALES] : COMMON_LOCALES;
  return tags.map((tag) => ({ value: tag, label: `${names.of(tag) ?? tag} (${tag})` }));
}

export function isLocale(tag: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0;
  } catch {
    // RangeError: not a syntactically valid BCP 47 language tag.
    return false;
  }
}

export const MONTH_OPTIONS: Option[] = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Date.UTC(2026, index, 1))),
}));
