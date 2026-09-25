import { unstable_rethrow } from "next/navigation";
import { toAppError, type ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Result shape for server actions called from forms (actions should not throw to the client). */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };

/** Runs server-action logic and converts failures into an `ActionResult` (logging unexpected ones). */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (thrown) {
    unstable_rethrow(thrown); // let Next.js redirect()/notFound() through
    const error = toAppError(thrown);
    if (error.code === "INTERNAL") logger.error("Unhandled error in server action", { error: thrown });
    const fieldErrors =
      error.code === "VALIDATION_FAILED" && error.details && typeof error.details === "object"
        ? Object.fromEntries(
            Object.entries(error.details).filter((entry): entry is [string, string[]] =>
              Array.isArray(entry[1]),
            ),
          )
        : undefined;
    return { ok: false, error: { code: error.code, message: error.message, fieldErrors } };
  }
}
