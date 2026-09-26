import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { appUrl, sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { assertCanGrant, authorize, type TenantContext } from "@/lib/tenant";
import type { InviteMemberInput } from "@/lib/validation";
import type { DbClient, PageQuery } from "@/server/repositories/helpers";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { companyRepository } from "@/server/repositories/company.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { writeAuditLog } from "./audit.service";
import { authTokenService } from "./auth-token.service";

type Member = NonNullable<Awaited<ReturnType<typeof membershipRepository.findById>>>;

async function getMember(ctx: TenantContext, membershipId: string, client?: DbClient): Promise<Member> {
  const member = await membershipRepository.findById(ctx.companyId, membershipId, client);
  if (!member) throw new NotFoundError("Member");
  return member;
}

async function getRole(ctx: TenantContext, roleId: string, client?: DbClient) {
  const role = await roleRepository.findById(ctx.companyId, roleId, client);
  if (!role) throw new ValidationError("Choose a valid role.", { roleId: ["Unknown role."] });
  return role;
}

/**
 * Guards shared by every change to someone else's membership:
 * - never yourself (prevents locking yourself out or self-promotion),
 * - only members whose current role you could have granted (an Admin can't touch a Super Admin),
 * - the company always keeps at least one active Super Admin.
 */
async function assertCanManage(
  ctx: TenantContext,
  member: Member,
  change: "role" | "suspend" | "remove",
  client?: DbClient,
) {
  if (member.user.id === ctx.userId)
    throw new ForbiddenError("You can't change your own access. Ask another administrator.");
  const currentRole = await getRole(ctx, member.roleId, client);
  assertCanGrant(ctx, currentRole.permissions);
  const isActiveSuperAdmin =
    member.status === "ACTIVE" && member.role.isSystem && member.role.name === SUPER_ADMIN_ROLE;
  if (isActiveSuperAdmin && (await membershipRepository.countActiveSuperAdmins(ctx.companyId, client)) <= 1) {
    throw new ConflictError(
      `The company must keep at least one active ${SUPER_ADMIN_ROLE} (${change} not allowed).`,
    );
  }
}

async function trySend(message: Parameters<typeof sendEmail>[0], context: Record<string, unknown>) {
  try {
    await sendEmail(message);
    return true;
  } catch (error) {
    logger.error("Email could not be sent", { ...context, error });
    return false;
  }
}

/** Company users (memberships). Every function re-checks the permission — never rely on the caller. */
export const memberService = {
  async list(ctx: TenantContext, query: PageQuery & { search?: string }) {
    authorize(ctx, "users:view");
    return membershipRepository.list(ctx.companyId, query);
  },

  /**
   * Invites a person with a role. New people get an INVITED account and a 7-day invitation link; existing
   * accounts are added directly and notified. Returns whether the email could be sent.
   */
  async invite(
    ctx: TenantContext,
    input: InviteMemberInput,
  ): Promise<{ membershipId: string; emailSent: boolean }> {
    authorize(ctx, "users:manage");
    const role = await getRole(ctx, input.roleId);
    assertCanGrant(ctx, role.permissions);

    const company = await companyRepository.findById(ctx.companyId);
    const inviter = await userRepository.findProfile(ctx.userId);
    if (!company || !inviter) throw new NotFoundError("Company");

    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser && (await membershipRepository.findByUser(ctx.companyId, existingUser.id))) {
      throw new ConflictError("This person is already a member of the company.", {
        email: ["Already a member."],
      });
    }

    // Invited accounts get a random password nobody knows; they choose their own when accepting.
    const placeholderHash = await hashPassword(randomBytes(32).toString("base64url"));
    const { membershipId, token } = await db.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await userRepository.create(
          { email: input.email, name: input.name, passwordHash: placeholderHash, status: "INVITED" },
          ctx.userId,
          tx,
        ));
      const pending = user.status === "INVITED";
      const membership = await membershipRepository.create(
        ctx.companyId,
        { userId: user.id, roleId: role.id, status: pending ? "INVITED" : "ACTIVE" },
        ctx.userId,
        tx,
      );
      const invitationToken = pending
        ? await authTokenService.issue(
            user.id,
            "INVITATION",
            { companyId: ctx.companyId, createdById: ctx.userId },
            tx,
          )
        : null;
      await writeAuditLog(
        ctx,
        {
          action: "user.invite",
          entityType: "Membership",
          entityId: membership.id,
          after: { email: input.email, role: role.name, status: membership.status },
        },
        tx,
      );
      return { membershipId: membership.id, token: invitationToken };
    });

    const emailSent = await trySend(
      token
        ? emailTemplates.invitation(
            input.email,
            inviter.name,
            company.name,
            appUrl("/accept-invite", { token }),
          )
        : emailTemplates.addedToCompany(input.email, inviter.name, company.name, appUrl("/login")),
      { membershipId, kind: "invitation" },
    );
    return { membershipId, emailSent };
  },

  async resendInvitation(ctx: TenantContext, membershipId: string): Promise<{ emailSent: boolean }> {
    authorize(ctx, "users:manage");
    const member = await getMember(ctx, membershipId);
    if (member.status !== "INVITED" || member.user.status !== "INVITED") {
      throw new ConflictError("Only pending invitations can be resent.");
    }
    const company = await companyRepository.findById(ctx.companyId);
    const inviter = await userRepository.findProfile(ctx.userId);
    if (!company || !inviter) throw new NotFoundError("Company");
    const token = await authTokenService.issue(member.user.id, "INVITATION", {
      companyId: ctx.companyId,
      createdById: ctx.userId,
    });
    await writeAuditLog(ctx, { action: "user.invite_resent", entityType: "Membership", entityId: member.id });
    const emailSent = await trySend(
      emailTemplates.invitation(
        member.user.email,
        inviter.name,
        company.name,
        appUrl("/accept-invite", { token }),
      ),
      { membershipId, kind: "invitation" },
    );
    return { emailSent };
  },

  async changeRole(ctx: TenantContext, membershipId: string, roleId: string) {
    authorize(ctx, "users:manage");
    return db.$transaction(async (tx) => {
      const member = await getMember(ctx, membershipId, tx);
      const role = await getRole(ctx, roleId, tx);
      assertCanGrant(ctx, role.permissions);
      if (member.roleId === role.id) return;
      await assertCanManage(ctx, member, "role", tx);
      await membershipRepository.update(ctx.companyId, member.id, { roleId: role.id }, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "user.role_change",
          entityType: "Membership",
          entityId: member.id,
          before: { role: member.role.name },
          after: { role: role.name },
        },
        tx,
      );
    });
  },

  async setSuspended(ctx: TenantContext, membershipId: string, suspended: boolean) {
    authorize(ctx, "users:manage");
    return db.$transaction(async (tx) => {
      const member = await getMember(ctx, membershipId, tx);
      if (member.status === "INVITED")
        throw new ConflictError("Pending invitations can be removed, not suspended.");
      if (suspended === (member.status === "SUSPENDED")) return;
      if (suspended) await assertCanManage(ctx, member, "suspend", tx);
      else assertCanGrant(ctx, (await getRole(ctx, member.roleId, tx)).permissions);
      await membershipRepository.update(
        ctx.companyId,
        member.id,
        { status: suspended ? "SUSPENDED" : "ACTIVE" },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: suspended ? "user.suspend" : "user.reactivate",
          entityType: "Membership",
          entityId: member.id,
          before: { status: member.status },
          after: { status: suspended ? "SUSPENDED" : "ACTIVE" },
        },
        tx,
      );
    });
  },

  /** Removes the person from this company (their account and other companies are untouched). */
  async remove(ctx: TenantContext, membershipId: string) {
    authorize(ctx, "users:manage");
    return db.$transaction(async (tx) => {
      const member = await getMember(ctx, membershipId, tx);
      await assertCanManage(ctx, member, "remove", tx);
      await membershipRepository.delete(ctx.companyId, member.id, tx);
      await writeAuditLog(
        ctx,
        {
          action: "user.remove",
          entityType: "Membership",
          entityId: member.id,
          before: { email: member.user.email, role: member.role.name, status: member.status },
        },
        tx,
      );
    });
  },
};
