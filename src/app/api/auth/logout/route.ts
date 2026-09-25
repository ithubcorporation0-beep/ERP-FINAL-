import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { authService } from "@/server/services/auth.service";

export const POST = handle(async () => {
  await authService.logout();
  return new NextResponse(null, { status: 204 });
});
