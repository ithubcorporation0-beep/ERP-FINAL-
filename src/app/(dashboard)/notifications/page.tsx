import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <ModulePlaceholder href="/notifications" />;
}
