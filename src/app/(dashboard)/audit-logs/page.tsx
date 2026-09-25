import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Audit Logs" };

export default function AuditLogsPage() {
  return <ModulePlaceholder href="/audit-logs" />;
}
