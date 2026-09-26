"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { changeMemberRoleSchema, idSchema, inviteMemberSchema } from "@/lib/validation";
import { memberService } from "@/server/services/member.service";

// Every action checks `users:manage` on the server; the services check it again.

export async function inviteMemberAction(input: unknown): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => {
    const ctx = await requirePermission("users:manage");
    const result = await memberService.invite(ctx, inviteMemberSchema.parse(input));
    revalidatePath("/users");
    return { emailSent: result.emailSent };
  });
}

export async function resendInvitationAction(
  membershipId: unknown,
): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => {
    const ctx = await requirePermission("users:manage");
    return memberService.resendInvitation(ctx, idSchema.parse(membershipId));
  });
}

export async function changeMemberRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("users:manage");
    const { membershipId, roleId } = changeMemberRoleSchema.parse(input);
    await memberService.changeRole(ctx, membershipId, roleId);
    revalidatePath("/users");
  });
}

export async function setMemberSuspendedAction(
  membershipId: unknown,
  suspended: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("users:manage");
    await memberService.setSuspended(ctx, idSchema.parse(membershipId), z.boolean().parse(suspended));
    revalidatePath("/users");
  });
}

export async function removeMemberAction(membershipId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("users:manage");
    await memberService.remove(ctx, idSchema.parse(membershipId));
    revalidatePath("/users");
  });
}
