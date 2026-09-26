-- CreateEnum
CREATE TYPE "auth_token_type" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (now() + '30 days'::interval);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "auth_token_type" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "company_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Data migration (phase 03) ───────────────────────────────────────────────
-- Permission vocabulary: "read" → "view", "update" → "edit". Role grants reference permission ids,
-- so they follow automatically. Keys no longer in the catalogue are removed by `npm run db:seed`.
UPDATE "permissions" SET "key" = regexp_replace("key", ':read$', ':view'), "action" = 'view' WHERE "action" = 'read';
UPDATE "permissions" SET "key" = regexp_replace("key", ':update$', ':edit'), "action" = 'edit' WHERE "action" = 'update';

-- Built-in roles: "Owner" is now "Super Admin"; "Sales Rep" is retired as a built-in role but kept as a
-- custom role so nobody loses access. Their permissions are refreshed by `npm run db:seed`.
UPDATE "roles" SET "name" = 'Super Admin' WHERE "is_system" AND "name" = 'Owner';
UPDATE "roles" SET "is_system" = false WHERE "is_system" AND "name" = 'Sales Rep';

-- Accounts that existed before email verification were created by the seed or an administrator.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
