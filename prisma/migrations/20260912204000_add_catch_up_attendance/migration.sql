-- CreateTable
CREATE TABLE IF NOT EXISTS "CatchUpAttendance" (
    "id" SERIAL NOT NULL,
    "studentId" TEXT NOT NULL,
    "missedLessonId" INTEGER NOT NULL,
    "catchUpLessonId" INTEGER NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatchUpAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CatchUpAttendance_studentId_missedLessonId_key" ON "CatchUpAttendance"("studentId", "missedLessonId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CatchUpAttendance_studentId_fkey'
    ) THEN
        ALTER TABLE "CatchUpAttendance" ADD CONSTRAINT "CatchUpAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CatchUpAttendance_missedLessonId_fkey'
    ) THEN
        ALTER TABLE "CatchUpAttendance" ADD CONSTRAINT "CatchUpAttendance_missedLessonId_fkey" FOREIGN KEY ("missedLessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CatchUpAttendance_catchUpLessonId_fkey'
    ) THEN
        ALTER TABLE "CatchUpAttendance" ADD CONSTRAINT "CatchUpAttendance_catchUpLessonId_fkey" FOREIGN KEY ("catchUpLessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;