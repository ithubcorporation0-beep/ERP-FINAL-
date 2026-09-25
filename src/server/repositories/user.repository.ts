import { db } from "@/lib/db";

export const userRepository = {
  findByEmail(email: string) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  touchLastLogin(id: string) {
    return db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },
};
