import { handle, routeId } from "@/lib/api";
import { pdfResponse } from "@/lib/pdf/response";
import { requirePermission } from "@/lib/tenant";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/payroll/[id]/items/[itemId]/slip">;

/** The salary slip PDF (`?download=1` to save it). Never cached. */
export const GET = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:view");
  const { id, itemId } = await params;
  const { bytes, filename } = await payrollService.payslipPdf(
    ctx,
    routeId(id, "Payroll run"),
    routeId(itemId, "Payslip"),
  );
  return pdfResponse(bytes, filename, req);
});
