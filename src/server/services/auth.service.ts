import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import type { LoginInput } from "@/lib/validation";
import { userRepository } from "@/server/repositories/user.repository";

export const authService = {
  /** Verifies credentials and starts a session. Returns null on invalid credentials. */
  async login({ email, password }: LoginInput) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) return null;

    await userRepository.touchLastLogin(user.id);
    await createSession(user.id);
    return { id: user.id, email: user.email, name: user.name };
  },

  logout() {
    return destroySession();
  },
};
