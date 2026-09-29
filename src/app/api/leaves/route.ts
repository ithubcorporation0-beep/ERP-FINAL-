import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { leaveListQuerySchema, leaveSchema } from "@/lib/validation";
import { leaveService } from "@/server/services/leave.service";

/** Leave requests. People without approval rights only ever get their own (enforced in the service). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("leaves:view");
  const query = leaveListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await leaveService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("leaves:create");
  return NextResponse.json(await leaveService.create(ctx, leaveSchema.parse(await req.json())), {
    status: 201,
  });
});
