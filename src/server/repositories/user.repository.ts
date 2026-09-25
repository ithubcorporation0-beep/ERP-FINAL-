import { db } from "@/lib/db";
import { createdBy, type ActorId, type DbClient } from "./helpers";

export const userRepository = {
  findByEmail(email: string, client: DbClient = db) {
    return client.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findProfile(id: string, client: DbClient = db) {
    return client.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, status: true },
    });
  },

  create(
    data: { email: string; name: string; passwordHash: string },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.user.create({
      data: { ...data, email: data.email.toLowerCase(), ...createdBy(actorId) },
      select: { id: true, name: true, email: true, status: true },
    });
  },

  touchLastLogin(id: string, client: DbClient = db) {
    return client.user.update({ where: { id }, data: { lastLoginAt: new Date() }, select: { id: true } });
  },
};
