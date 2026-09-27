import { landingPath } from "@/config/navigation";
import { ForbiddenError } from "@/lib/errors";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { recordAuditEvent } from "./audit.service";

/** Which companies a user can work in, and switching between them. */
export const companyContextService = {
  /**
   * The tenant resolver: the company chosen with the switcher if the user still has an ACTIVE membership in that
   * active company; otherwise the user's oldest active membership; otherwise null (no company access).
   */
  async resolveAccess(userId: string, activeCompanyId: string | null) {
    return (
      (activeCompanyId ? await membershipRepository.findAccess(userId, activeCompanyId) : null) ??
      (await membershipRepository.findAccess(userId))
    );
  },

  listCompanies(userId: string) {
    return membershipRepository.listCompaniesForUser(userId);
  },

  /**
   * Makes `companyId` the active company of the user's current session. Only allowed with an ACTIVE membership
   * in an active company. Returns the page to open in that company (depends on the role there).
   */
  async switchCompany(userId: string, sessionId: string, companyId: string): Promise<{ landing: string }> {
    const access = await membershipRepository.findAccess(userId, companyId);
    if (!access) throw new ForbiddenError("You don't have access to that company.");
    const { count } = await sessionRepository.setActiveCompany(userId, sessionId, companyId);
    if (count !== 1) throw new ForbiddenError("Your session has ended. Please sign in again.");
    await recordAuditEvent({
      action: "company.switch",
      entityType: "Company",
      entityId: companyId,
      companyId,
      actorId: userId,
    });
    return { landing: landingPath(access.permissions) };
  },
};
