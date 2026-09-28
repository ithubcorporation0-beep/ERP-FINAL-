import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";

/** /finance opens the part of Finance the user may see. */
export default async function FinancePage() {
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  if (can(ctx, "accounting:view")) redirect("/finance/reports");
  if (can(ctx, "expenses:view")) redirect("/finance/expenses");
  return <AccessDenied />;
}
