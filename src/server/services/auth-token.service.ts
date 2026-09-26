import type { AuthTokenType } from "@/generated/prisma/client";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { authTokenRepository } from "@/server/repositories/auth-token.repository";
import type { DbClient } from "@/server/repositories/helpers";

const HOUR = 60 * 60 * 1000;
export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * HOUR,
  PASSWORD_RESET: 1 * HOUR,
  INVITATION: 7 * 24 * HOUR,
};

export const authTokenService = {
  /** Creates a single-use token (older open tokens of the same type are revoked) and returns the raw value. */
  async issue(
    userId: string,
    type: AuthTokenType,
    options: { companyId?: string | null; createdById?: string | null } = {},
    client?: DbClient,
  ): Promise<string> {
    await authTokenRepository.revokeOpen(userId, type, client);
    const { token, hash } = generateToken();
    await authTokenRepository.create(
      { userId, type, tokenHash: hash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]), ...options },
      client,
    );
    return token;
  },

  consume(token: string, type: AuthTokenType, client?: DbClient) {
    return authTokenRepository.consume(hashToken(token), type, client);
  },

  peek(token: string, type: AuthTokenType, client?: DbClient) {
    return authTokenRepository.findValid(hashToken(token), type, client);
  },

  /** True when a token of this type was issued within the last `withinMs` (simple per-user throttle). */
  async issuedRecently(userId: string, type: AuthTokenType, withinMs: number, client?: DbClient) {
    return (await authTokenRepository.countRecent(userId, type, new Date(Date.now() - withinMs), client)) > 0;
  },
};
