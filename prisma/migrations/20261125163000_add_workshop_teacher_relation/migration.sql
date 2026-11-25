-- Link Dawarat (Workshop) to an existing Teacher so workshop payments can be split
-- between the school and the teacher using the teacher's configured percentage.

ALTER TABLE "Workshop" ADD COLUMN IF NOT EXISTS "teacherId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Workshop_teacherId_fkey'
  ) THEN
    ALTER TABLE "Workshop"
      ADD CONSTRAINT "Workshop_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Workshop_teacherId_idx" ON "Workshop"("teacherId");
CREATE INDEX IF NOT EXISTS "Workshop_branchId_idx" ON "Workshop"("branchId");

-- Backfill 1: exact (trimmed) name match
UPDATE "Workshop" w
SET "teacherId" = t.id
FROM "Teacher" t
WHERE w."teacherId" IS NULL
  AND w."guestTeacher" IS NOT NULL
  AND TRIM(w."guestTeacher") <> ''
  AND TRIM(w."guestTeacher") = TRIM(t.name);

-- Backfill 2: normalized match (ث/ت variants), only when unique
UPDATE "Workshop" w
SET "teacherId" = (
  SELECT t.id FROM "Teacher" t
  WHERE REPLACE(TRIM(t.name), 'ث', 'ت') = REPLACE(TRIM(w."guestTeacher"), 'ث', 'ت')
  LIMIT 1
)
WHERE w."teacherId" IS NULL
  AND w."guestTeacher" IS NOT NULL
  AND TRIM(w."guestTeacher") <> ''
  AND (
    SELECT COUNT(*) FROM "Teacher" t
    WHERE REPLACE(TRIM(t.name), 'ث', 'ت') = REPLACE(TRIM(w."guestTeacher"), 'ث', 'ت')
  ) = 1;

-- Backfill 3: prefix match restricted to teachers who teach a class in the workshop's branch, only when unique
UPDATE "Workshop" w
SET "teacherId" = (
  SELECT t.id FROM "Teacher" t
  WHERE TRIM(t.name) LIKE TRIM(w."guestTeacher") || '%'
    AND EXISTS (SELECT 1 FROM "Class" c WHERE c."teacherId" = t.id AND c."branchId" = w."branchId")
  LIMIT 1
)
WHERE w."teacherId" IS NULL
  AND w."guestTeacher" IS NOT NULL
  AND LENGTH(TRIM(w."guestTeacher")) >= 3
  AND (
    SELECT COUNT(*) FROM "Teacher" t
    WHERE TRIM(t.name) LIKE TRIM(w."guestTeacher") || '%'
      AND EXISTS (SELECT 1 FROM "Class" c WHERE c."teacherId" = t.id AND c."branchId" = w."branchId")
  ) = 1;

-- Backfill 4: global prefix match, only when unique
UPDATE "Workshop" w
SET "teacherId" = (
  SELECT t.id FROM "Teacher" t
  WHERE TRIM(t.name) LIKE TRIM(w."guestTeacher") || '%'
  LIMIT 1
)
WHERE w."teacherId" IS NULL
  AND w."guestTeacher" IS NOT NULL
  AND LENGTH(TRIM(w."guestTeacher")) >= 3
  AND (
    SELECT COUNT(*) FROM "Teacher" t
    WHERE TRIM(t.name) LIKE TRIM(w."guestTeacher") || '%'
  ) = 1;

-- Keep legacy display column in sync with the linked teacher's name
UPDATE "Workshop" w
SET "guestTeacher" = t.name
FROM "Teacher" t
WHERE w."teacherId" = t.id;
