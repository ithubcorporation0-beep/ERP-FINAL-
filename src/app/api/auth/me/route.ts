import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";

export const GET = handle(async () => {
  const ctx = await requireTenant();
  return NextResponse.json(ctx);
});
