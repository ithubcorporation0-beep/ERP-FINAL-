import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ModulePlaceholder href="/reports" />;
}
