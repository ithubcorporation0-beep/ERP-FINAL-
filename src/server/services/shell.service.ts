import { allowedNavHrefs } from "@/config/navigation";
import { HttpError, type TenantContext } from "@/lib/tenant";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { userRepository } from "@/server/repositories/user.repository";

export interface ShellContext {
  user: { name: string; email: string };
  organization: { name: string };
  unreadNotifications: number;
  /** Navigation entries this user's role may see. */
  allowedHrefs: string[];
}

/** Everything the application shell (sidebar + header) needs, scoped to the signed-in user's company. */
export const shellService = {
  async getContext(ctx: TenantContext): Promise<ShellContext> {
    const [user, organization, unreadNotifications] = await Promise.all([
      userRepository.findProfile(ctx.userId),
      organizationRepository.findById(ctx.organizationId),
      notificationRepository.countUnread(ctx.organizationId, ctx.userId),
    ]);
    if (!user || !organization) throw new HttpError(404, "Account or company not found");

    return {
      user: { name: user.name, email: user.email },
      organization: { name: organization.name },
      unreadNotifications,
      allowedHrefs: allowedNavHrefs(ctx.permissions),
    };
  },
};
