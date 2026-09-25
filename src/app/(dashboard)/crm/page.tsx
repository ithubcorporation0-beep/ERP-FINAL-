import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "CRM" };

export default function CRMPage() {
  return <ModulePlaceholder href="/crm" />;
}
