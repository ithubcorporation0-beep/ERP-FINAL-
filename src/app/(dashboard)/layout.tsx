import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UnauthenticatedError } from "@/lib/errors";
import { requireTenant } from "@/lib/tenant";
import { shellService } from "@/server/services/shell.service";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant().catch((error: unknown) => {
    // Signed out or session expired → login. Any other failure surfaces in the error boundary.
    if (error instanceof UnauthenticatedError) redirect("/login");
    throw error;
  });
  const shell = await shellService.getContext(ctx);

  return <AppShell shell={shell}>{children}</AppShell>;
}
