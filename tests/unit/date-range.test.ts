import { describe, expect, it } from "vitest";
import { resolveDateRange, zonedMonthStart } from "@/lib/date-range";
import { dashboardQuerySchema } from "@/lib/validation";

const utc = { timeZone: "UTC", fiscalYearStartMonth: 1 };

describe("zonedMonthStart", () => {
  it("is local midnight on the 1st, not UTC midnight", () => {
    expect(zonedMonthStart(2026, 3, "UTC").toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(zonedMonthStart(2026, 3, "Asia/Dubai").toISOString()).toBe("2026-02-28T20:00:00.000Z");
    expect(zonedMonthStart(2026, 3, "America/New_York").toISOString()).toBe("2026-03-01T05:00:00.000Z");
  });

  it("follows daylight saving time", () => {
    // New York is on EDT (UTC−4) on 1 April, EST (UTC−5) on 1 March.
    expect(zonedMonthStart(2026, 4, "America/New_York").toISOString()).toBe("2026-04-01T04:00:00.000Z");
    // Santiago switches DST at local midnight; the month still starts at the first real instant of the 1st.
    const start = zonedMonthStart(2026, 9, "America/Santiago");
    expect(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", dateStyle: "short" }).format(start),
    ).toBe("2026-09-01");
  });

  it("normalises months outside 1–12", () => {
    expect(zonedMonthStart(2026, 13, "UTC").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("resolveDateRange", () => {
  const now = new Date("2026-09-27T12:00:00Z");

  it("covers whole months up to and including the current one", () => {
    const range = resolveDateRange("last-6-months", { ...utc, now });
    expect(range.months.map((month) => month.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(range.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("crosses year boundaries", () => {
    const range = resolveDateRange("last-12-months", { ...utc, now });
    expect(range.months[0]?.key).toBe("2025-10");
    expect(range.months).toHaveLength(12);
  });

  it("uses the company's fiscal year", () => {
    const april = { timeZone: "UTC", fiscalYearStartMonth: 4, now };
    const thisYear = resolveDateRange("this-fiscal-year", april);
    expect(thisYear.months.map((month) => month.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    const lastYear = resolveDateRange("last-fiscal-year", april);
    expect(lastYear.from.toISOString()).toBe("2025-04-01T00:00:00.000Z");
    expect(lastYear.to.toISOString()).toBe("2026-04-01T00:00:00.000Z");

    // Before the fiscal start month, the fiscal year began last calendar year.
    const october = resolveDateRange("this-fiscal-year", { timeZone: "UTC", fiscalYearStartMonth: 10, now });
    expect(october.months[0]?.key).toBe("2025-10");
    expect(october.months).toHaveLength(12);
  });

  it("decides the current month in the company's time zone", () => {
    // 22:00 UTC on 30 Sep is already 1 Oct in Dubai.
    const late = new Date("2026-09-30T22:00:00Z");
    expect(resolveDateRange("this-month", { ...utc, now: late }).months[0]?.key).toBe("2026-09");
    const dubai = resolveDateRange("this-month", {
      timeZone: "Asia/Dubai",
      fiscalYearStartMonth: 1,
      now: late,
    });
    expect(dubai.months[0]?.key).toBe("2026-10");
    expect(dubai.from.toISOString()).toBe("2026-09-30T20:00:00.000Z");
  });
});

describe("dashboard query", () => {
  it("accepts known ranges and falls back to the default for anything else", () => {
    expect(dashboardQuerySchema.parse({ range: "this-month" }).range).toBe("this-month");
    expect(dashboardQuerySchema.parse({}).range).toBe("last-6-months");
    expect(dashboardQuerySchema.parse({ range: "forever" }).range).toBe("last-6-months");
    expect(dashboardQuerySchema.parse({ range: ["this-month", "x"] }).range).toBe("last-6-months");
  });
});
