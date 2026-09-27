import type { ApiErrorBody } from "@/lib/api";

/** The user-facing message of a failed API response (see `handle()` in src/lib/api.ts). */
export async function apiErrorMessage(response: Response, action = "The request"): Promise<string> {
  try {
    const body: Partial<ApiErrorBody> = await response.json();
    return body.error?.message ?? `${action} failed (${response.status}).`;
  } catch {
    // Not a JSON error body (e.g. a proxy error page).
    return `${action} failed (${response.status}).`;
  }
}
