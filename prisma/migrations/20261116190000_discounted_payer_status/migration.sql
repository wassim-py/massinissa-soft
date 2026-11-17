-- AlterTable: Enrollment discount columns
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(10, 2);
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "discountUpdatedBy" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "discountUpdatedAt" TIMESTAMP(3);

-- AlterTable: Voucher billing snapshot columns
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "appliedPayerStatus" TEXT;
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "baseCyclePrice" DECIMAL(10, 2);
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "effectiveCyclePrice" DECIMAL(10, 2);
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "effectiveSessionPrice" DECIMAL(10, 2);
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(10, 2);
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "teacherPayWeight" DECIMAL(6, 4);

-- CreateTable: EnrollmentPayerHistory
CREATE TABLE IF NOT EXISTS "EnrollmentPayerHistory" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "payerStatus" TEXT NOT NULL,
    "discountType" TEXT,
    "discountValue" DECIMAL(10, 2),
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "EnrollmentPayerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EnrollmentPayerHistory_enrollmentId_effectiveFrom_idx"
    ON "EnrollmentPayerHistory"("enrollmentId", "effectiveFrom");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'EnrollmentPayerHistory_enrollmentId_fkey'
    ) THEN
        ALTER TABLE "EnrollmentPayerHistory"
            ADD CONSTRAINT "EnrollmentPayerHistory_enrollmentId_fkey"
            FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill historical TUITION_4SESSION and FORMATION vouchers with billing snapshots
WITH voucher_ctx AS (
    SELECT
        v.id AS voucher_id,
        v."paymentType" AS payment_type,
        COALESCE(v.amount, 0)::numeric AS voucher_amount,
        COALESCE(c."isFormation", false) AS is_formation,
        CASE
            WHEN COALESCE(c."isFormation", false) THEN COALESCE(fl."lumpSumPrice", c."pricePerCycle", 0)::numeric
            ELSE COALESCE(c."pricePerCycle", 0)::numeric
        END AS base_cycle_price,
        CASE
            WHEN e."payerStatus" IN ('NON_PAYER', 'SCHOOL_FEES_ONLY', 'DISCOUNTED') THEN e."payerStatus"
            WHEN s."payerStatus" IN ('NON_PAYER', 'SCHOOL_FEES_ONLY') AND e.id IS NULL THEN s."payerStatus"
            ELSE 'NORMAL'
        END AS resolved_payer_status,
        LEAST(
            100::numeric,
            GREATEST(
                0::numeric,
                COALESCE(
                    (SELECT tcr.percentage::numeric
                     FROM "TeacherClassRate" tcr
                     WHERE tcr."teacherId" = c."teacherId" AND tcr."classId" = c.id
                     LIMIT 1),
                    (SELECT tpr."percentageOfSessionFee"::numeric
                     FROM "TeacherPayRate" tpr
                     WHERE tpr."teacherId" = c."teacherId"
                     ORDER BY tpr."effectiveFrom" DESC
                     LIMIT 1),
                    0::numeric
                )
            )
        ) AS t_pct,
        CASE
            WHEN COALESCE(c."isFormation", false) = false
                 AND f.id IS NOT NULL
                 AND f."payerStudentId" IS NOT NULL
                 AND f."payerStudentId" <> s.id
                 AND COALESCE(f."discountPercentage", 0) > 0
                 AND EXISTS (
                     SELECT 1 FROM "Enrollment" pe
                     WHERE pe."studentId" = f."payerStudentId"
                       AND pe."classId" = c.id
                       AND COALESCE(pe.status, 'ACTIVE') = 'ACTIVE'
                 )
            THEN COALESCE(f."discountPercentage", 0)::numeric
            ELSE 0::numeric
        END AS sibling_pct
    FROM "Voucher" v
    JOIN "Student" s ON s.id = v."studentId"
    LEFT JOIN "Family" f ON f.id = s."familyId"
    LEFT JOIN "Class" c ON c.id = v."classId"
    LEFT JOIN "FormationLevel" fl ON fl.id = c."formationLevelId"
    LEFT JOIN "Enrollment" e ON e."studentId" = v."studentId" AND e."classId" = v."classId"
    WHERE v."paymentType" IN ('TUITION_4SESSION', 'FORMATION')
      AND v."appliedPayerStatus" IS NULL
),
computed AS (
    SELECT
        voucher_id,
        ROUND(base_cycle_price, 2) AS base_cycle_price,
        resolved_payer_status,
        is_formation,
        CASE
            WHEN resolved_payer_status = 'NON_PAYER' THEN 0::numeric
            WHEN resolved_payer_status = 'SCHOOL_FEES_ONLY' THEN
                ROUND(base_cycle_price * (100 - t_pct) / 100.0, 2)
            WHEN sibling_pct > 0 AND sibling_pct < 100 AND base_cycle_price > 0
                 AND voucher_amount <= ROUND(base_cycle_price * (1 - sibling_pct / 100.0), 2) + 1 THEN
                ROUND(base_cycle_price * (1 - sibling_pct / 100.0), 2)
            ELSE ROUND(base_cycle_price, 2)
        END AS effective_cycle_price,
        CASE
            WHEN resolved_payer_status IN ('NON_PAYER', 'SCHOOL_FEES_ONLY') THEN 0::numeric
            WHEN sibling_pct > 0 AND sibling_pct < 100 AND base_cycle_price > 0
                 AND voucher_amount <= ROUND(base_cycle_price * (1 - sibling_pct / 100.0), 2) + 1 THEN
                ROUND(1 - sibling_pct / 100.0, 4)
            ELSE 1.0000::numeric
        END AS teacher_pay_weight,
        CASE
            WHEN resolved_payer_status = 'NORMAL'
                 AND sibling_pct > 0 AND sibling_pct < 100 AND base_cycle_price > 0
                 AND voucher_amount <= ROUND(base_cycle_price * (1 - sibling_pct / 100.0), 2) + 1 THEN 'SIBLING'
            ELSE NULL
        END AS discount_type,
        CASE
            WHEN resolved_payer_status = 'NORMAL'
                 AND sibling_pct > 0 AND sibling_pct < 100 AND base_cycle_price > 0
                 AND voucher_amount <= ROUND(base_cycle_price * (1 - sibling_pct / 100.0), 2) + 1 THEN sibling_pct
            ELSE NULL
        END AS discount_value
    FROM voucher_ctx
)
UPDATE "Voucher" v
SET
    "appliedPayerStatus" = comp.resolved_payer_status,
    "baseCyclePrice" = comp.base_cycle_price,
    "effectiveCyclePrice" = comp.effective_cycle_price,
    "effectiveSessionPrice" = CASE
        WHEN comp.is_formation THEN comp.effective_cycle_price
        ELSE ROUND(comp.effective_cycle_price / 4.0, 2)
    END,
    "discountType" = comp.discount_type,
    "discountValue" = comp.discount_value,
    "teacherPayWeight" = comp.teacher_pay_weight
FROM computed comp
WHERE v.id = comp.voucher_id;

-- Seed baseline EnrollmentPayerHistory rows for existing enrollments
INSERT INTO "EnrollmentPayerHistory" ("enrollmentId", "payerStatus", "discountType", "discountValue", "reason", "changedBy", "effectiveFrom", "effectiveTo")
SELECT
    e.id,
    CASE WHEN e."payerStatus" IN ('NORMAL', 'NON_PAYER', 'SCHOOL_FEES_ONLY', 'DISCOUNTED') THEN e."payerStatus" ELSE 'NORMAL' END,
    e."discountType",
    e."discountValue",
    COALESCE(e."discountReason", 'Initial baseline migration'),
    COALESCE(e."discountUpdatedBy", 'SYSTEM_MIGRATION'),
    e."enrolledAt",
    NULL
FROM "Enrollment" e
WHERE NOT EXISTS (
    SELECT 1 FROM "EnrollmentPayerHistory" h WHERE h."enrollmentId" = e.id
);
