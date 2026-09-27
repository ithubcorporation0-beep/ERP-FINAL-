import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/schema";
import { companyProfileSchema } from "@/lib/validation";

const valid = {
  name: "Acme Trading",
  legalName: "",
  taxId: "",
  email: "",
  phone: "+971 4 000 0000",
  address: "",
  country: "AE",
  baseCurrency: "AED",
  timezone: "Asia/Dubai",
  locale: "en-AE",
  fiscalYearStartMonth: 1,
};

describe("company profile validation", () => {
  it("accepts real ISO/IANA codes", () => {
    expect(companyProfileSchema.safeParse(valid).success).toBe(true);
    expect(companyProfileSchema.safeParse({ ...valid, timezone: "UTC", country: "" }).success).toBe(true);
  });

  it("rejects made-up currencies, time zones, countries, locales and months", () => {
    for (const change of [
      { baseCurrency: "XYZQ" },
      { timezone: "Mars/Olympus" },
      { country: "QQ" },
      { locale: "not a locale" },
      { fiscalYearStartMonth: 13 },
    ]) {
      expect(companyProfileSchema.safeParse({ ...valid, ...change }).success, JSON.stringify(change)).toBe(
        false,
      );
    }
  });
});

describe("storage configuration", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };

  it("defaults to local storage outside production and S3 in production", () => {
    expect(parseServerEnv(base).STORAGE_DRIVER).toBe("local");
    expect(() => parseServerEnv({ ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "console" })).toThrow(
      /STORAGE_BUCKET/,
    );
  });

  it("allows an explicit local driver in production (single server with a persistent disk)", () => {
    expect(
      parseServerEnv({ ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "console", STORAGE_DRIVER: "local" })
        .STORAGE_DRIVER,
    ).toBe("local");
  });
});
