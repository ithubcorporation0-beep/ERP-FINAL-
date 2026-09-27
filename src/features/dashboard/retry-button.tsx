"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reloads the dashboard's server data (used by widgets that failed to load). */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RotateCcw aria-hidden="true" />
      {pending ? "Retrying…" : "Try again"}
    </Button>
  );
}
