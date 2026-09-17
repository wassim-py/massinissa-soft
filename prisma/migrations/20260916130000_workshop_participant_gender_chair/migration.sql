-- AlterTable
ALTER TABLE "WorkshopParticipant" ADD COLUMN IF NOT EXISTS "gender" TEXT NOT NULL DEFAULT 'MALE';
ALTER TABLE "WorkshopParticipant" ADD COLUMN IF NOT EXISTS "chairNumber" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkshopParticipant_workshopId_gender_idx" ON "WorkshopParticipant"("workshopId", "gender");

-- Backfill existing workshop participants with partitioned chair numbers starting at 1 per gender
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY "workshopId", "gender" ORDER BY id ASC) as rn
  FROM "WorkshopParticipant"
)
UPDATE "WorkshopParticipant" wp
SET "chairNumber" = ranked.rn
FROM ranked
WHERE wp.id = ranked.id AND wp."chairNumber" IS NULL;
