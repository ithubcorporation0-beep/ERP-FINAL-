import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requestClientInfo } from "@/lib/auth/request";
import { destroySession } from "@/lib/auth/session";
import { authService } from "@/server/services/auth.service";

export const POST = handle(async () => {
  const info = await requestClientInfo();
  const ended = await destroySession();
  if (ended) await authService.recordLogout(ended.userId, info, ended.activeCompanyId);
  return new NextResponse(null, { status: 204 });
});
