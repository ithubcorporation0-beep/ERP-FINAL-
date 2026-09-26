"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { verifyEmailAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

export function VerifyEmailButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-4">
      <FormStatus tone="error" message={error} />
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await verifyEmailAction(token);
            if (!result.ok) setError(result.error.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Verify my email
      </Button>
    </div>
  );
}
