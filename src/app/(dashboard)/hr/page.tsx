import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";

/** /hr opens the part of HR the user may see. */
export default async function HRPage() {
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  if (can(ctx, "employees:view")) redirect("/hr/employees");
  if (can(ctx, "attendance:view")) redirect("/hr/attendance");
  if (can(ctx, "leaves:view")) redirect("/hr/leave");
  return <AccessDenied />;
}
