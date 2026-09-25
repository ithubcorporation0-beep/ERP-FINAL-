import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export const POST = handle(async () => {
  await destroySession();
  return new NextResponse(null, { status: 204 });
});
