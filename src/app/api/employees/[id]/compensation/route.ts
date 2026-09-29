import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { compensationSchema } from "@/lib/validation";
import { compensationService } from "@/server/services/compensation.service";

type Context = RouteContext<"/api/employees/[id]/compensation">;

/**
 * Salary and bank details (`salaries:view`), bank numbers masked. `?reveal=1` returns the full account number
 * and IBAN instead — audited every time. Never cached.
 */
export const GET = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:view");
  const id = routeId((await params).id, "Employee");
  const reveal = new URL(req.url).searchParams.get("reveal") === "1";
  const body = reveal ? await compensationService.reveal(ctx, id) : await compensationService.get(ctx, id);
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
});

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:edit");
  const id = routeId((await params).id, "Employee");
  await compensationService.update(ctx, id, compensationSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});
