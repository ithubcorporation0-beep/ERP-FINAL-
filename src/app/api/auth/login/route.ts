import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requestClientInfo } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation";
import { authService } from "@/server/services/auth.service";

export const POST = handle(async (req: Request) => {
  const info = await requestClientInfo();
  const outcome = await authService.verifyCredentials(loginSchema.parse(await req.json()), info);
  if (!outcome.ok) {
    throw new UnauthenticatedError(
      outcome.reason === "locked"
        ? "Too many failed attempts. Try again later."
        : outcome.reason === "unverified"
          ? "Verify your email address before signing in."
          : "Invalid email or password.",
    );
  }
  await createSession(outcome.user.id, info);
  return NextResponse.json(outcome.user);
});
