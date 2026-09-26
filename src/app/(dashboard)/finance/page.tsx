import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { getNavItem } from "@/config/navigation";
import { authorizePage } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Finance" };

const HREF = "/finance";

export default async function FinancePage() {
  // Server-side check: hiding the menu link is not protection.
  if (!(await authorizePage(getNavItem(HREF).permission))) return <AccessDenied />;
  return <ModulePlaceholder href={HREF} />;
}
