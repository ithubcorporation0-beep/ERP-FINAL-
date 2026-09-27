import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { leadListQuerySchema, leadSchema } from "@/lib/validation";
import { leadService } from "@/server/services/lead.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("leads:view");
  const query = leadListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await leadService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("leads:create");
  const input = leadSchema.parse(await req.json());
  return NextResponse.json(await leadService.create(ctx, input), { status: 201 });
});
