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

/** Test-only key: 32 bytes, base64. */
const KEY = Buffer.alloc(32, 1).toString("base64");

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
      parseServerEnv({
        ...base,
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "console",
        STORAGE_DRIVER: "local",
        DATA_ENCRYPTION_KEY: KEY,
      }).STORAGE_DRIVER,
    ).toBe("local");
  });
});

describe("data encryption key", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };
  const production = { ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "console", STORAGE_DRIVER: "local" };

  it("is required in production and must be 32 bytes", () => {
    expect(() => parseServerEnv(production)).toThrow(/DATA_ENCRYPTION_KEY is required in production/);
    expect(() => parseServerEnv({ ...production, DATA_ENCRYPTION_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
    expect(parseServerEnv({ ...production, DATA_ENCRYPTION_KEY: KEY }).DATA_ENCRYPTION_KEY).toBe(KEY);
  });

  it("is optional in development", () => {
    expect(parseServerEnv(base).DATA_ENCRYPTION_KEY).toBeUndefined();
  });
});
