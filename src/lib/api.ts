import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { NotFoundError, toAppError, type ErrorCode } from "@/lib/errors";
import { idSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

/** JSON body of every API error response. */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
}

function requestIdFrom(args: unknown[]): string {
  const request = args[0];
  const incoming = request instanceof Request ? request.headers.get("x-request-id") : null;
  return incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
}

/**
 * Wraps a route handler: anything thrown becomes a consistent JSON error with the right status.
 * Unexpected errors are logged with a request id (returned to the client) and never leak details.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (thrown) {
      unstable_rethrow(thrown); // let Next.js redirect()/notFound() through
      const requestId = requestIdFrom(args);
      const error = toAppError(thrown);
      if (error.code === "INTERNAL") {
        logger.error("Unhandled error in API route", { requestId, error: thrown });
      }
      const body: ApiErrorBody = {
        error: { code: error.code, message: error.message, details: error.details, requestId },
      };
      return NextResponse.json(body, { status: error.status, headers: { "x-request-id": requestId } });
    }
  };
}

/** A record id from the URL. A malformed id can never match a record, so it is reported as "not found". */
export function routeId(value: string, entity: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
