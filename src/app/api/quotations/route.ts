import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { quotationListQuerySchema, salesDocumentSchema } from "@/lib/validation";
import { quotationService } from "@/server/services/quotation.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("quotations:view");
  const query = quotationListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await quotationService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("quotations:create");
  const input = salesDocumentSchema.parse(await req.json());
  return NextResponse.json(await quotationService.create(ctx, input), { status: 201 });
});
