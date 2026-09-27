import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { salesDocumentSchema } from "@/lib/validation";
import { quotationService } from "@/server/services/quotation.service";

type Context = RouteContext<"/api/quotations/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("quotations:view");
  return NextResponse.json(await quotationService.get(ctx, routeId((await params).id, "Quotation")));
});

/** Replaces the whole quotation (header and lines). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("quotations:edit");
  const id = routeId((await params).id, "Quotation");
  return NextResponse.json(
    await quotationService.update(ctx, id, salesDocumentSchema.parse(await req.json())),
  );
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("quotations:delete");
  await quotationService.remove(ctx, routeId((await params).id, "Quotation"));
  return new NextResponse(null, { status: 204 });
});
