-- CreateTable Branch
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "manager" TEXT,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_name_key" ON "Branch"("name");

-- Upsert the 3 real branches
INSERT INTO "Branch" ("id", "name", "address", "phone", "manager")
VALUES
  (1, 'ECOLE', 'Constantine - Centre, Algérie', '0550000001', 'Directeur ECOLE'),
  (2, 'ANNEX', 'Constantine - Annex, Algérie', '0550000002', 'Directeur ANNEX'),
  (3, 'AMPHI', 'Constantine - Amphi, Algérie', '0550000003', 'Directeur AMPHI')
ON CONFLICT ("id") DO UPDATE
  SET "name" = EXCLUDED."name",
      "address" = EXCLUDED."address",
      "phone" = EXCLUDED."phone",
      "manager" = EXCLUDED."manager";

-- Reset sequence to max id
SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), coalesce(max("id"), 1)) FROM "Branch";

-- Drop unique constraint on Classroom.name if it exists
DROP INDEX IF EXISTS "Classroom_name_key";

-- Add nullable columns first if they don't exist
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "registeredBranchId" INTEGER;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Classroom" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

-- Backfill existing rows with default branch 1 (ECOLE)
UPDATE "Student" SET "registeredBranchId" = 1 WHERE "registeredBranchId" IS NULL;
UPDATE "Class" SET "branchId" = 1 WHERE "branchId" IS NULL;
UPDATE "Classroom" SET "branchId" = 1 WHERE "branchId" IS NULL;
UPDATE "Lesson" SET "branchId" = 1 WHERE "branchId" IS NULL;

-- Make columns NOT NULL
ALTER TABLE "Student" ALTER COLUMN "registeredBranchId" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Classroom" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Lesson" ALTER COLUMN "branchId" SET NOT NULL;

-- Add Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Student_registeredBranchId_fkey'
    ) THEN
        ALTER TABLE "Student" ADD CONSTRAINT "Student_registeredBranchId_fkey" FOREIGN KEY ("registeredBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Class_branchId_fkey'
    ) THEN
        ALTER TABLE "Class" ADD CONSTRAINT "Class_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Classroom_branchId_fkey'
    ) THEN
        ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Lesson_branchId_fkey'
    ) THEN
        ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
