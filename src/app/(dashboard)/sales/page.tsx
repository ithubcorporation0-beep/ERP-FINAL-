import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return <ModulePlaceholder href="/sales" />;
}
