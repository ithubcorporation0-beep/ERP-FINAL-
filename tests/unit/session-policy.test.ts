import { describe, expect, it } from "vitest";
import {
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
  isSessionValid,
  nextSessionExpiry,
} from "@/lib/auth/session-policy";
import { generateToken, hashToken } from "@/lib/auth/tokens";

const now = new Date("2026-09-26T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

describe("session policy", () => {
  it("is valid only before both the idle and the absolute expiry", () => {
    expect(isSessionValid({ expiresAt: later(1000), absoluteExpiresAt: later(2000) }, now)).toBe(true);
    expect(isSessionValid({ expiresAt: later(-1), absoluteExpiresAt: later(2000) }, now)).toBe(false);
    expect(isSessionValid({ expiresAt: later(1000), absoluteExpiresAt: later(-1) }, now)).toBe(false);
  });

  it("extends the idle expiry at most once per interval and never past the absolute limit", () => {
    const absoluteExpiresAt = later(SESSION_IDLE_MS * 10);
    expect(nextSessionExpiry({ lastUsedAt: later(-1000), absoluteExpiresAt }, now)).toBeNull();
    expect(
      nextSessionExpiry({ lastUsedAt: later(-SESSION_TOUCH_INTERVAL_MS), absoluteExpiresAt }, now),
    ).toEqual(later(SESSION_IDLE_MS));
    expect(
      nextSessionExpiry(
        { lastUsedAt: later(-SESSION_TOUCH_INTERVAL_MS), absoluteExpiresAt: later(60_000) },
        now,
      ),
    ).toEqual(later(60_000));
  });
});

describe("tokens", () => {
  it("are 43-character random strings stored only as a SHA-256 hash", () => {
    const first = generateToken();
    const second = generateToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashToken(first.token));
    expect(first.hash).not.toContain(first.token);
  });
});
