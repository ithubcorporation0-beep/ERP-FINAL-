"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

/** Catches errors outside a more specific boundary (e.g. while loading the app shell). */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <ErrorState
          title="We couldn't load this page"
          message="Please try again. If the problem continues, contact your administrator."
          onRetry={reset}
        />
      </div>
    </main>
  );
}
