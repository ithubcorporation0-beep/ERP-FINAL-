import { allowedNavHrefs } from "@/config/navigation";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import { companyRepository } from "@/server/repositories/company.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { userRepository } from "@/server/repositories/user.repository";

export interface ShellCompany {
  id: string;
  name: string;
  roleName: string;
}

export interface ShellContext {
  user: { name: string; email: string };
  company: ShellCompany & { logoUrl: string | null };
  /** Every company the user can switch to (including the current one). */
  companies: ShellCompany[];
  unreadNotifications: number;
  /** Navigation entries this user's role may see. */
  allowedHrefs: string[];
}

/** Everything the application shell (sidebar + header) needs, scoped to the signed-in user's company. */
export const shellService = {
  async getContext(ctx: TenantContext): Promise<ShellContext> {
    const [user, company, memberships, unreadNotifications] = await Promise.all([
      userRepository.findProfile(ctx.userId),
      companyRepository.findProfile(ctx.companyId),
      membershipRepository.listCompaniesForUser(ctx.userId),
      notificationRepository.countUnread(ctx.companyId, ctx.userId),
    ]);
    if (!user || !company) throw new NotFoundError("Account or company");

    return {
      user: { name: user.name, email: user.email },
      company: {
        id: company.id,
        name: company.name,
        roleName: ctx.roleName,
        // The version parameter changes when the logo changes, so browsers fetch the new image.
        logoUrl: company.logoKey ? `/api/company/logo?v=${company.logoUpdatedAt?.getTime() ?? 0}` : null,
      },
      companies: memberships.map((membership) => ({
        id: membership.company.id,
        name: membership.company.name,
        roleName: membership.role.name,
      })),
      unreadNotifications,
      allowedHrefs: allowedNavHrefs(ctx.permissions),
    };
  },
};
