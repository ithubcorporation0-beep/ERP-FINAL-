/**
 * E2E fixture: makes sure the seeded company has one user per role under test, created through the real
 * invitation flow (invite → emailed link → accept). Idempotent. Run by tests/e2e/global-setup.ts.
 */
import "dotenv/config";
import { memoryOutbox } from "@/lib/email";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { db } from "@/lib/db";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { authService } from "@/server/services/auth.service";
import { memberService } from "@/server/services/member.service";
import { E2E_PASSWORD, E2E_USERS } from "../users";

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SEED_ADMIN_EMAIL is not set");
  const admin = await userRepository.findByEmail(adminEmail);
  if (!admin) throw new Error("Seeded admin not found — run `npm run db:seed` first");
  const access = await membershipRepository.findAccess(admin.id);
  if (!access || access.roleName !== SUPER_ADMIN_ROLE) throw new Error("Seeded admin is not a Super Admin");
  const ctx = { userId: admin.id, ...access };

  for (const user of Object.values(E2E_USERS)) {
    const existing = await userRepository.findByEmail(user.email);
    if (existing && (await membershipRepository.findByUser(ctx.companyId, existing.id))) continue;
    const role = await roleRepository.findByName(ctx.companyId, user.role);
    if (!role) throw new Error(`Role ${user.role} not found`);
    await memberService.invite(ctx, { name: user.name, email: user.email, roleId: role.id });
    const token = memoryOutbox.at(-1)?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error("Invitation email not captured");
    await authService.acceptInvitation({
      token,
      name: user.name,
      password: E2E_PASSWORD,
      confirmPassword: E2E_PASSWORD,
    });
    console.log(`e2e: created ${user.role} ${user.email}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
