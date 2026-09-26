import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const profile = {
  id: true,
  name: true,
  email: true,
  status: true,
  phone: true,
  jobTitle: true,
  emailVerifiedAt: true,
  passwordChangedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export const userRepository = {
  /** Full row including the password hash — only for credential checks. */
  findByEmail(email: string, client: DbClient = db) {
    return client.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findById(id: string, client: DbClient = db) {
    return client.user.findUnique({ where: { id } });
  },

  findProfile(id: string, client: DbClient = db) {
    return client.user.findUnique({ where: { id }, select: profile });
  },

  create(
    data: {
      email: string;
      name: string;
      passwordHash: string;
      status?: Prisma.UserCreateInput["status"];
      emailVerifiedAt?: Date | null;
    },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.user.create({
      data: { ...data, email: data.email.toLowerCase(), ...createdBy(actorId) },
      select: { id: true, name: true, email: true, status: true },
    });
  },

  update(
    id: string,
    data: Pick<
      Prisma.UserUncheckedUpdateInput,
      | "name"
      | "phone"
      | "jobTitle"
      | "status"
      | "passwordHash"
      | "passwordChangedAt"
      | "emailVerifiedAt"
      | "failedLoginAttempts"
      | "lockedUntil"
    >,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.user.update({ where: { id }, data: { ...data, ...updatedBy(actorId) }, select: profile });
  },

  recordSuccessfulLogin(id: string, client: DbClient = db) {
    return client.user.update({
      where: { id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true },
    });
  },

  /** Increments the failure counter atomically and returns the new count. */
  async recordFailedLogin(id: string, client: DbClient = db) {
    const user = await client.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return user.failedLoginAttempts;
  },
};
