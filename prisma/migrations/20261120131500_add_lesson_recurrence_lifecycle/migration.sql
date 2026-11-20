-- AlterTable Lesson: Add non-destructive recurrence lifecycle and single-occurrence override fields
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "recurrenceStartAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "recurrenceEndAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "isSingleOccurrence" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "overridesDate" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "overridesSlotKey" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lesson_recurrenceEndAt_idx" ON "Lesson"("recurrenceEndAt");
CREATE INDEX IF NOT EXISTS "Lesson_isSingleOccurrence_idx" ON "Lesson"("isSingleOccurrence");
