import { createHash, randomBytes } from "node:crypto";

/** A random 256-bit token (43 base64url characters) plus the SHA-256 hash that is stored instead of it. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
