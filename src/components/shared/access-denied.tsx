import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

/** Shown when a signed-in user opens a page their role does not allow. */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      description={
        message ??
        "Your role doesn't include permission to view this. Ask an administrator if you need access."
      }
      action={
        <Button asChild variant="outline">
          <Link href="/profile">Go to your profile</Link>
        </Button>
      }
    />
  );
}
