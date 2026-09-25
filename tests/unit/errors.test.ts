import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError, ConflictError, NotFoundError, ValidationError, toAppError } from "@/lib/errors";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test" });
}

describe("toAppError", () => {
  it("passes AppErrors through unchanged", () => {
    const error = new NotFoundError("Invoice");
    expect(toAppError(error)).toBe(error);
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404, message: "Invoice not found." });
  });

  it("turns Zod errors into field-level validation errors", () => {
    const result = z.object({ email: z.email("Bad email") }).safeParse({ email: "x" });
    if (result.success) throw new Error("expected failure");
    const error = toAppError(result.error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details).toEqual({ email: ["Bad email"] });
  });

  it("maps known database errors", () => {
    expect(toAppError(prismaError("P2002"))).toBeInstanceOf(ConflictError);
    expect(toAppError(prismaError("P2003"))).toBeInstanceOf(ConflictError);
    expect(toAppError(prismaError("P2025"))).toBeInstanceOf(NotFoundError);
  });

  it("hides unexpected errors behind a generic INTERNAL error but keeps the cause", () => {
    const original = new Error("connection refused at 10.0.0.5");
    const error = toAppError(original);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INTERNAL", status: 500 });
    expect(error.message).not.toContain("10.0.0.5");
    expect(error.cause).toBe(original);
  });
});
