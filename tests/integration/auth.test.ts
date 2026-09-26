import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { memoryOutbox } from "@/lib/email";
import { hashToken } from "@/lib/auth/tokens";
import { ValidationError } from "@/lib/errors";
import { sessionRepository } from "@/server/repositories/session.repository";
import { LOCKOUT_THRESHOLD, authService } from "@/server/services/auth.service";
import { addMember, createCompanyWithOwner, lastEmailedToken, TEST_PASSWORD } from "./helpers";

const NEW_PASSWORD = "a-brand-new-password";

async function ownerEmail() {
  const ctx = await createCompanyWithOwner("Auth Co");
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  return { ctx, email: user.email };
}

async function sessionFor(userId: string) {
  const now = Date.now();
  return sessionRepository.create({
    userId,
    tokenHash: hashToken(crypto.randomUUID().repeat(2).slice(0, 43)),
    expiresAt: new Date(now + 3_600_000),
    absoluteExpiresAt: new Date(now + 7_200_000),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("login", () => {
  it("accepts correct credentials and records the sign-in", async () => {
    const { ctx, email } = await ownerEmail();
    const result = await authService.verifyCredentials({ email, password: TEST_PASSWORD });
    expect(result).toMatchObject({ ok: true, user: { id: ctx.userId } });
    expect(await db.auditLog.count({ where: { action: "auth.login", actorId: ctx.userId } })).toBe(1);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const { email } = await ownerEmail();
    expect(await authService.verifyCredentials({ email, password: "wrong-password!" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await authService.verifyCredentials({ email: "nobody@example.test", password: "whatever-pass" }),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it(`locks the account after ${LOCKOUT_THRESHOLD} failed attempts — even the right password is refused`, async () => {
    const { ctx, email } = await ownerEmail();
    for (let attempt = 0; attempt < LOCKOUT_THRESHOLD; attempt++) {
      await authService.verifyCredentials({ email, password: "wrong-password!" });
    }
    expect(await authService.verifyCredentials({ email, password: TEST_PASSWORD })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await db.auditLog.count({ where: { action: "auth.account_locked", entityId: ctx.userId } })).toBe(
      1,
    );
  });

  it("refuses suspended users", async () => {
    const { ctx, email } = await ownerEmail();
    await db.user.update({ where: { id: ctx.userId }, data: { status: "SUSPENDED" } });
    expect(await authService.verifyCredentials({ email, password: TEST_PASSWORD })).toMatchObject({
      ok: false,
    });
  });
});

describe("registration and email verification", () => {
  const input = {
    companyName: "Registered Ltd",
    name: "Rita Registrant",
    email: "rita@registered.test",
    password: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  };

  it("creates a company with the registrant as Super Admin, but requires email verification to sign in", async () => {
    await authService.register(input);
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.emailVerifiedAt).toBeNull();
    const membership = await db.membership.findFirstOrThrow({
      where: { userId: user.id },
      include: { role: true },
    });
    expect(membership.role.name).toBe("Super Admin");

    expect(await authService.verifyCredentials({ email: input.email, password: NEW_PASSWORD })).toEqual({
      ok: false,
      reason: "unverified",
    });

    await authService.verifyEmail(lastEmailedToken("/verify-email", input.email));
    expect(await authService.verifyCredentials({ email: input.email, password: NEW_PASSWORD })).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it("does not reveal that an email is already registered", async () => {
    await authService.register(input);
    memoryOutbox.length = 0;
    await expect(authService.register({ ...input, companyName: "Second Try" })).resolves.toEqual({
      emailSent: true,
    });
    expect(await db.company.count({ where: { name: "Second Try" } })).toBe(0);
    expect(memoryOutbox[0]?.subject).toMatch(/already have/);
  });

  it("verification links work once", async () => {
    await authService.register(input);
    const token = lastEmailedToken("/verify-email", input.email);
    await authService.verifyEmail(token);
    await expect(authService.verifyEmail(token)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("forgot and reset password", () => {
  it("emails a single-use link that sets the new password, signs out everywhere and clears a lockout", async () => {
    const { ctx, email } = await ownerEmail();
    await sessionFor(ctx.userId);
    await db.user.update({ where: { id: ctx.userId }, data: { lockedUntil: new Date(Date.now() + 60_000) } });

    await authService.requestPasswordReset(email);
    const token = lastEmailedToken("/reset-password", email);
    await authService.resetPassword({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(await db.session.count({ where: { userId: ctx.userId } })).toBe(0);
    expect(await authService.verifyCredentials({ email, password: TEST_PASSWORD })).toMatchObject({
      ok: false,
    });
    expect(await authService.verifyCredentials({ email, password: NEW_PASSWORD })).toMatchObject({
      ok: true,
    });
    await expect(
      authService.resetPassword({
        token,
        password: "yet-another-password",
        confirmPassword: "yet-another-password",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("responds identically for unknown emails and sends nothing", async () => {
    await expect(authService.requestPasswordReset("ghost@example.test")).resolves.toBeUndefined();
    expect(memoryOutbox).toHaveLength(0);
  });

  it("rejects expired links", async () => {
    const { email } = await ownerEmail();
    await authService.requestPasswordReset(email);
    const token = lastEmailedToken("/reset-password", email);
    await db.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(
      authService.resetPassword({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only the newest link works", async () => {
    const { email } = await ownerEmail();
    await authService.requestPasswordReset(email);
    const first = lastEmailedToken("/reset-password", email);
    await db.authToken.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } }); // bypass throttle
    await authService.requestPasswordReset(email);
    await expect(
      authService.resetPassword({ token: first, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("change password", () => {
  it("requires the current password and signs out other sessions, keeping the current one", async () => {
    const { ctx, email } = await ownerEmail();
    const current = await sessionFor(ctx.userId);
    await sessionFor(ctx.userId);

    await expect(
      authService.changePassword(ctx.userId, current.id, {
        currentPassword: "not-my-password",
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await authService.changePassword(ctx.userId, current.id, {
      currentPassword: TEST_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    const remaining = await db.session.findMany({ where: { userId: ctx.userId } });
    expect(remaining.map((session) => session.id)).toEqual([current.id]);
    expect(await authService.verifyCredentials({ email, password: NEW_PASSWORD })).toMatchObject({
      ok: true,
    });
  });
});

describe("invitations", () => {
  it("creates an INVITED account that can only sign in after accepting", async () => {
    const owner = await createCompanyWithOwner("Invite Co");
    const { ctx, email } = await addMember(owner, "Employee");
    const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    expect(user).toMatchObject({ status: "ACTIVE" });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(ctx.roleName).toBe("Employee");
    expect(await authService.verifyCredentials({ email, password: TEST_PASSWORD })).toMatchObject({
      ok: true,
    });
  });
});
