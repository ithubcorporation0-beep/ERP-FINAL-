import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { idSchema } from "@/lib/validation";

/**
 * Helpers for pages that show one record. A malformed id in the URL or a record that doesn't exist in the
 * current company both render the 404 page (never a generic error, and never another company's record).
 */
export function recordIdOrNotFound(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}

export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
