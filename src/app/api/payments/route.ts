import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { paymentListQuerySchema, paymentSchema } from "@/lib/validation";
import { paymentService } from "@/server/services/payment.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("payments:view");
  const query = paymentListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await paymentService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("payments:create");
  return NextResponse.json(await paymentService.record(ctx, paymentSchema.parse(await req.json())), {
    status: 201,
  });
});
