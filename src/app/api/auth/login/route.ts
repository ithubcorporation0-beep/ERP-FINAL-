import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError } from "@/lib/tenant";
import { loginSchema } from "@/lib/validation";

export const POST = handle(async (req: Request) => {
  const { email, password } = loginSchema.parse(await req.json());
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }
  await createSession(user.id);
  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
});
