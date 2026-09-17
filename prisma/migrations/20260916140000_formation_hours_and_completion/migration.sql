-- AlterTable FormationLevel: Drop hoursRequired
ALTER TABLE "FormationLevel" DROP COLUMN IF EXISTS "hoursRequired";

-- AlterTable Class: Add isCompleted and completedAt
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
