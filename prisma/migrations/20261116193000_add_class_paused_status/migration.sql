-- AlterTable Class: Add isPaused and pausedAt for non-destructive group pause/close lifecycle
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "isPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Class_isPaused_idx" ON "Class"("isPaused");
