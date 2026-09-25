import { db } from "@/lib/db";

export const organizationRepository = {
  findById(id: string) {
    return db.organization.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  },
};
