import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { UnauthenticatedError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation";
import { authService } from "@/server/services/auth.service";

export const POST = handle(async (req: Request) => {
  const user = await authService.login(loginSchema.parse(await req.json()));
  if (!user) throw new UnauthenticatedError("Invalid email or password.");
  return NextResponse.json(user);
});
