import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/schema";

const valid = { DATABASE_URL: "postgresql://user:pass@localhost:5432/db" };

describe("parseServerEnv", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SMTP_PORT).toBe(587);
  });

  it("treats empty optional values as unset", () => {
    expect(parseServerEnv({ ...valid, SMTP_HOST: "" }).SMTP_HOST).toBeUndefined();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_URL: DATABASE_URL is required");
  });

  it("rejects a non-PostgreSQL DATABASE_URL without echoing the value", () => {
    const secret = "mysql://root:hunter2@db/app";
    expect(() => parseServerEnv({ DATABASE_URL: secret })).toThrow(/postgresql:\/\//);
    expect(() => parseServerEnv({ DATABASE_URL: secret })).not.toThrow(/hunter2/);
  });

  it("accepts a known LOG_LEVEL, treats empty as unset and rejects unknown levels", () => {
    expect(parseServerEnv({ ...valid, LOG_LEVEL: "warn" }).LOG_LEVEL).toBe("warn");
    expect(parseServerEnv({ ...valid, LOG_LEVEL: "" }).LOG_LEVEL).toBeUndefined();
    expect(() => parseServerEnv({ ...valid, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});
