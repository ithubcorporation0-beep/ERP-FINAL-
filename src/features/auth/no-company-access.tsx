import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth.actions";

/** Signed in, but without an active membership in any active company (removed, suspended or archived). */
export function NoCompanyAccess() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <EmptyState
        icon={Building2}
        title="No company access"
        description="Your account isn't active in any company right now. Ask your administrator to invite or reactivate you."
        action={
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        }
        className="w-full max-w-md"
      />
    </main>
  );
}
