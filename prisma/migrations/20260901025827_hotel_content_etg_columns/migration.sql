-- AlterTable
ALTER TABLE "hotel_content" ADD COLUMN     "etg_content_seeded_at" TIMESTAMPTZ(6),
ADD COLUMN     "metapolicy_extra_info" TEXT,
ADD COLUMN     "metapolicy_struct" JSONB;
