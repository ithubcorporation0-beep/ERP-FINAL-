import { handle, routeId } from "@/lib/api";
import { pdfResponse } from "@/lib/pdf/response";
import { requirePermission } from "@/lib/tenant";
import { invoiceService } from "@/server/services/invoice.service";

type Context = RouteContext<"/api/invoices/[id]/pdf">;

export const GET = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("invoices:view");
  const { bytes, filename } = await invoiceService.pdf(ctx, routeId((await params).id, "Invoice"));
  return pdfResponse(bytes, filename, req);
});
