import { allowedNavHrefs } from "@/config/navigation";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { companyRepository } from "@/server/repositories/company.repository";
import { userRepository } from "@/server/repositories/user.repository";

export interface ShellContext {
  user: { name: string; email: string };
  company: { name: string };
  unreadNotifications: number;
  /** Navigation entries this user's role may see. */
  allowedHrefs: string[];
}

/** Everything the application shell (sidebar + header) needs, scoped to the signed-in user's company. */
export const shellService = {
  async getContext(ctx: TenantContext): Promise<ShellContext> {
    const [user, company, unreadNotifications] = await Promise.all([
      userRepository.findProfile(ctx.userId),
      companyRepository.findById(ctx.companyId),
      notificationRepository.countUnread(ctx.companyId, ctx.userId),
    ]);
    if (!user || !company) throw new NotFoundError("Account or company");

    return {
      user: { name: user.name, email: user.email },
      company: { name: company.name },
      unreadNotifications,
      allowedHrefs: allowedNavHrefs(ctx.permissions),
    };
  },
};
