import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { getNavItem } from "@/config/navigation";
import { authorizePage } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Notifications" };

const HREF = "/notifications";

export default async function NotificationsPage() {
  // Server-side check: hiding the menu link is not protection.
  if (!(await authorizePage(getNavItem(HREF).permission))) return <AccessDenied />;
  return <ModulePlaceholder href={HREF} />;
}
