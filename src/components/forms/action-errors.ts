import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/action";

/**
 * Shows a failed server action on a React Hook Form: field errors under their inputs (when the field
 * exists in the form), and the overall message as the form's root error.
 */
export function applyActionError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  result: Extract<ActionResult<unknown>, { ok: false }>,
  fields: readonly FieldPath<T>[],
) {
  const fieldErrors = result.error.fieldErrors ?? {};
  let matched = false;
  for (const field of fields) {
    const message = fieldErrors[field]?.[0];
    if (message) {
      setError(field, { message });
      matched = true;
    }
  }
  if (!matched || result.error.code !== "VALIDATION_FAILED")
    setError("root", { message: result.error.message });
}
