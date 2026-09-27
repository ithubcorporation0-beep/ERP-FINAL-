-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "logo_content_type" TEXT,
ADD COLUMN     "logo_key" TEXT,
ADD COLUMN     "logo_updated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "active_company_id" UUID;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_company_id_fkey" FOREIGN KEY ("active_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
