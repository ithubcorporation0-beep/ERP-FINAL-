/**
 * Month-based reporting periods, calculated in the company's time zone (a month starts at local midnight on the
 * 1st, not at UTC midnight). Used by the dashboard's date filter; reports can reuse it.
 */

export const DATE_RANGE_PRESETS = [
  "this-month",
  "last-3-months",
  "last-6-months",
  "last-12-months",
  "this-fiscal-year",
  "last-fiscal-year",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DEFAULT_DATE_RANGE: DateRangePreset = "last-6-months";

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  "this-month": "This month",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  "this-fiscal-year": "This fiscal year",
  "last-fiscal-year": "Last fiscal year",
};

export interface RangeMonth {
  /** "YYYY-MM" in the company's time zone. */
  key: string;
  year: number;
  /** 1 = January. */
  month: number;
  /** Instant the month starts (local midnight on the 1st). */
  start: Date;
}

export interface ResolvedDateRange {
  preset: DateRangePreset;
  /** Inclusive start. */
  from: Date;
  /** Exclusive end: the start of the month after the last month in the range. */
  to: Date;
  /** Every month in the range, oldest first. */
  months: RangeMonth[];
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock date and time of `instant` in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Normalises a year/month pair whose month may be outside 1–12 (e.g. month 0 = December of the year before). */
function normalize(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** The instant local midnight on the 1st of `year`/`month` happens in `timeZone`. Handles DST changes. */
export function zonedMonthStart(year: number, month: number, timeZone: string): Date {
  const wallClock = Date.UTC(year, month - 1, 1);
  const firstGuess = wallClock - offsetMs(wallClock, timeZone);
  // The offset can differ between the guess and the real instant when DST changes around midnight.
  return new Date(wallClock - offsetMs(firstGuess, timeZone));
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

interface RangeOptions {
  timeZone: string;
  /** 1 = January. */
  fiscalYearStartMonth: number;
  now?: Date;
}

/** Turns a preset into concrete instants and months for the company. */
export function resolveDateRange(preset: DateRangePreset, options: RangeOptions): ResolvedDateRange {
  const { timeZone, fiscalYearStartMonth } = options;
  const today = zonedParts(options.now ?? new Date(), timeZone);

  let startYear = today.year;
  let startMonth = today.month;
  let count = 1;
  switch (preset) {
    case "this-month":
      break;
    case "last-3-months":
    case "last-6-months":
    case "last-12-months":
      count = Number(preset.split("-")[1]);
      startMonth = today.month - count + 1;
      break;
    case "this-fiscal-year":
    case "last-fiscal-year": {
      startMonth = fiscalYearStartMonth;
      if (today.month < fiscalYearStartMonth) startYear -= 1;
      if (preset === "last-fiscal-year") {
        startYear -= 1;
        count = 12;
      } else {
        count = (today.year - startYear) * 12 + today.month - startMonth + 1;
      }
      break;
    }
  }

  const months: RangeMonth[] = Array.from({ length: count }, (_, index) => {
    const { year, month } = normalize(startYear, startMonth + index);
    return { key: monthKey(year, month), year, month, start: zonedMonthStart(year, month, timeZone) };
  });
  const first = normalize(startYear, startMonth);
  const after = normalize(startYear, startMonth + count);
  return {
    preset,
    from: zonedMonthStart(first.year, first.month, timeZone),
    to: zonedMonthStart(after.year, after.month, timeZone),
    months,
  };
}
