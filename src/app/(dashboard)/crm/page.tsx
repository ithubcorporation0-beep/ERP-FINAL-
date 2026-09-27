import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";

/** /crm opens the part of the CRM the user may see. */
export default async function CrmPage() {
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  if (can(ctx, "customers:view")) redirect("/crm/customers");
  if (can(ctx, "leads:view")) redirect("/crm/leads");
  return <AccessDenied />;
}
