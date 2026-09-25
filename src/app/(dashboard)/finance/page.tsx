import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage() {
  return <ModulePlaceholder href="/finance" />;
}
