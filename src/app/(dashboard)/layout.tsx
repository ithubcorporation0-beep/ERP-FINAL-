import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NoCompanyAccess } from "@/features/auth/no-company-access";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { requireTenant, type TenantContext } from "@/lib/tenant";
import { shellService } from "@/server/services/shell.service";

/**
 * Every signed-in page renders inside this layout. It verifies the session on the server (the proxy only
 * checks that a cookie exists). Each page additionally checks its own permission with `authorizePage()`.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let ctx: TenantContext;
  try {
    ctx = await requireTenant();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) return <NoCompanyAccess />;
    throw error;
  }
  const shell = await shellService.getContext(ctx);
  return <AppShell shell={shell}>{children}</AppShell>;
}
