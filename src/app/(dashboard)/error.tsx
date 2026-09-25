"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message="Something went wrong loading this page." onRetry={reset} />;
}
