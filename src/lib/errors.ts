import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

/**
 * Typed application errors. Services throw these; `handle()` (API routes) and `toActionError()`
 * (server actions) turn them into consistent responses. Messages are safe to show to users.
 */
export type ErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED" | "CONFLICT" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.", details?: unknown) {
    super("FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super("NOT_FOUND", `${entity} not found.`);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Some fields are invalid.", details?: unknown) {
    super("VALIDATION_FAILED", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "This conflicts with existing data.", details?: unknown) {
    super("CONFLICT", message, details);
  }
}

/** Field-level messages from a ZodError, e.g. `{ email: ["Invalid email address"] }`. */
export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * Converts anything thrown into an AppError. Known database errors become user-facing errors;
 * everything else becomes INTERNAL (the original is kept as `cause` for logging, never shown).
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new ValidationError(undefined, zodFieldErrors(error));
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return new ConflictError("A record with these details already exists.", {
          fields: error.meta?.target,
        });
      case "P2003":
        return new ConflictError("This record is linked to other data that is missing or still in use.");
      case "P2025":
        return new NotFoundError();
    }
  }
  return new AppError("INTERNAL", "Something went wrong. Please try again.", undefined, { cause: error });
}
