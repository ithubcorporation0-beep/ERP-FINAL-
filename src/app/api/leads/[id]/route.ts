import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { leadSchema } from "@/lib/validation";
import { leadService } from "@/server/services/lead.service";

type Context = RouteContext<"/api/leads/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("leads:view");
  return NextResponse.json(await leadService.get(ctx, routeId((await params).id, "Lead")));
});

export const PATCH = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("leads:edit");
  const id = routeId((await params).id, "Lead");
  const input = leadSchema.partial().parse(await req.json());
  return NextResponse.json(await leadService.update(ctx, id, input));
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("leads:delete");
  await leadService.remove(ctx, routeId((await params).id, "Lead"));
  return new NextResponse(null, { status: 204 });
});
