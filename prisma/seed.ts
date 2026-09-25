import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_ROLES } from "../src/lib/permissions";

const db = new PrismaClient();

const CHART_OF_ACCOUNTS = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Sales Tax Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "6000", name: "Salaries Expense", type: "EXPENSE" },
  { code: "6100", name: "General Expenses", type: "EXPENSE" },
] as const;

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed the admin user.");
  }
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");

  const org = await db.organization.upsert({
    where: { slug: "it-hub" },
    update: {},
    create: { name: "IT Hub", slug: "it-hub" },
  });

  for (const [name, permissions] of Object.entries(DEFAULT_ROLES)) {
    await db.role.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: { permissions },
      create: { organizationId: org.id, name, permissions, isSystem: true },
    });
  }

  for (const account of CHART_OF_ACCOUNTS) {
    await db.account.upsert({
      where: { organizationId_code: { organizationId: org.id, code: account.code } },
      update: {},
      create: { organizationId: org.id, ...account },
    });
  }

  const owner = await db.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId: org.id, name: "Owner" } } });
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Administrator", passwordHash: await hashPassword(password) },
  });
  await db.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { roleId: owner.id },
    create: { organizationId: org.id, userId: user.id, roleId: owner.id },
  });

  console.log(`Seeded organization "${org.name}" with admin ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
