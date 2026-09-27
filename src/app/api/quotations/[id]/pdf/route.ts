import { handle, routeId } from "@/lib/api";
import { pdfResponse } from "@/lib/pdf/response";
import { requirePermission } from "@/lib/tenant";
import { quotationService } from "@/server/services/quotation.service";

type Context = RouteContext<"/api/quotations/[id]/pdf">;

export const GET = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("quotations:view");
  const { bytes, filename } = await quotationService.pdf(ctx, routeId((await params).id, "Quotation"));
  return pdfResponse(bytes, filename, req);
});
