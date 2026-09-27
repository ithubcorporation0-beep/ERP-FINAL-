"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * Reads and updates list state kept in the URL (`?search=…&status=…&page=2`), so filters survive reloads and
 * links can be shared. Changing anything but the page resets to page 1. `pending` is true while the server
 * renders the new result.
 */
export function useUrlQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (changes: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      if (!("page" in changes)) params.delete("page");
      const query = params.toString();
      // Nothing changed (e.g. a search box reporting its initial value): don't navigate, or a pending replace
      // could override a link the user clicked in the meantime.
      if (query === searchParams.toString()) return;
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  return {
    get,
    set,
    pending,
    hasAny: (keys: readonly string[]) => keys.some((key) => searchParams.has(key)),
  };
}
