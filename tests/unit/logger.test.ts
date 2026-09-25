import { describe, expect, it } from "vitest";
import { sanitize } from "@/lib/logger";

describe("logger sanitize", () => {
  it("redacts secrets at any depth", () => {
    expect(
      sanitize({
        user: "ada",
        password: "p",
        nested: { apiKey: "k", authorization: "Bearer x", token: "t" },
      }),
    ).toEqual({
      user: "ada",
      password: "[redacted]",
      nested: { apiKey: "[redacted]", authorization: "[redacted]", token: "[redacted]" },
    });
  });

  it("flattens errors including their cause", () => {
    const result = sanitize(new Error("outer", { cause: new Error("inner") }));
    expect(result).toMatchObject({ name: "Error", message: "outer", cause: { message: "inner" } });
  });
});
