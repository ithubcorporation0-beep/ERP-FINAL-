import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";

/** /sales opens the part of Sales the user may see. */
export default async function SalesPage() {
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  if (can(ctx, "invoices:view")) redirect("/sales/invoices");
  if (can(ctx, "quotations:view")) redirect("/sales/quotations");
  if (can(ctx, "payments:view")) redirect("/sales/payments");
  return <AccessDenied />;
}
