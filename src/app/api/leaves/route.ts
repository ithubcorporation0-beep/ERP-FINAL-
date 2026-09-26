import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";

// TODO: implement following the customers module (repository → service → route).
export const GET = handle(async () => {
  await requirePermission("leaves:view");
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
});
