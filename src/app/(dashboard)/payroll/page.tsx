import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { authorizePage } from "@/lib/auth/page";

/** /payroll opens the payroll runs. */
export default async function PayrollPage() {
  if (!(await authorizePage("payroll:view"))) return <AccessDenied />;
  redirect("/payroll/runs");
}
