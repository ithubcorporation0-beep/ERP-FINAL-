import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return <ModulePlaceholder href="/payroll" />;
}
