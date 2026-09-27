-- CreateEnum
CREATE TYPE "customer_type" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "communication_channel" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'SMS');

-- CreateEnum
CREATE TYPE "communication_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'PHONE', 'WALK_IN', 'EVENT', 'ADVERTISING', 'PARTNER', 'OTHER');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "city" TEXT,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "country" CHAR(2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" "customer_type" NOT NULL DEFAULT 'BUSINESS',
ADD COLUMN     "whatsapp" TEXT;

-- Backfill: existing customers get numbers 1, 2, 3… per company, oldest first.
UPDATE "customers" AS c
SET "number" = numbered.rn
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS rn
    FROM "customers"
) AS numbered
WHERE c."id" = numbered."id";

ALTER TABLE "customers" ALTER COLUMN "number" SET NOT NULL;

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_communications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" "communication_channel" NOT NULL,
    "direction" "communication_direction",
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "customer_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "source" "lead_source" NOT NULL DEFAULT 'OTHER',
    "assigned_to" UUID,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "expected_value" DECIMAL(18,2),
    "notes" TEXT,
    "follow_up_date" DATE,
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "company_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("company_id","key")
);

-- Continue each company's customer numbering after the backfilled ones.
INSERT INTO "number_sequences" ("company_id", "key", "last_value", "updated_at")
SELECT "company_id", 'customer', max("number"), CURRENT_TIMESTAMP
FROM "customers"
GROUP BY "company_id";

-- CreateIndex
CREATE UNIQUE INDEX "customer_documents_storage_key_key" ON "customer_documents"("storage_key");

-- CreateIndex
CREATE INDEX "customer_documents_company_id_customer_id_created_at_idx" ON "customer_documents"("company_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customer_communications_company_id_customer_id_occurred_at_idx" ON "customer_communications"("company_id", "customer_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "leads_company_id_deleted_at_status_idx" ON "leads"("company_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "leads_company_id_assigned_to_idx" ON "leads"("company_id", "assigned_to");

-- CreateIndex
CREATE UNIQUE INDEX "leads_company_id_number_key" ON "leads"("company_id", "number");

-- CreateIndex
CREATE INDEX "customers_company_id_status_idx" ON "customers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_number_key" ON "customers"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_company_id_key" ON "customers"("id", "company_id");

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

