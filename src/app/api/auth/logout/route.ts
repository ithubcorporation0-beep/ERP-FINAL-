import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requestClientInfo } from "@/lib/auth/request";
import { destroySession } from "@/lib/auth/session";
import { authService } from "@/server/services/auth.service";

export const POST = handle(async () => {
  const info = await requestClientInfo();
  const userId = await destroySession();
  if (userId) await authService.recordLogout(userId, info);
  return new NextResponse(null, { status: 204 });
});
