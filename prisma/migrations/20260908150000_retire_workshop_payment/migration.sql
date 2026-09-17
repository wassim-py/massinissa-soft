-- AlterTable Voucher: Make classId nullable and add workshopId
ALTER TABLE "Voucher" ALTER COLUMN "classId" DROP NOT NULL;
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "workshopId" INTEGER;

-- Add Foreign Key for Voucher.workshopId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Voucher_workshopId_fkey'
    ) THEN
        ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Migrate existing WorkshopPayment records into Voucher if table exists, then drop table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'WorkshopPayment'
    ) THEN
        -- Ensure at least one series exists for each branch
        INSERT INTO "VoucherSeries" ("issuingBranchId", "scope", "currentNumber")
        SELECT b."id", 'LOCAL_LEVEL', 0
        FROM "Branch" b
        WHERE NOT EXISTS (
            SELECT 1 FROM "VoucherSeries" vs WHERE vs."issuingBranchId" = b."id"
        );

        -- Migrate payments
        INSERT INTO "Voucher" ("seriesId", "number", "studentId", "workshopId", "issuingBranchId", "targetBranchId", "paymentType", "amount", "issuedBy", "issuedAt", "isVoided", "status")
        SELECT 
            (SELECT id FROM "VoucherSeries" vs WHERE vs."issuingBranchId" = w."branchId" LIMIT 1) as "seriesId",
            wp."id" as "number",
            part."studentId",
            wp."workshopId",
            w."branchId" as "issuingBranchId",
            w."branchId" as "targetBranchId",
            'WORKSHOP' as "paymentType",
            wp."amount"::numeric,
            'legacy_migration' as "issuedBy",
            wp."date" as "issuedAt",
            false as "isVoided",
            'ACTIVE' as "status"
        FROM "WorkshopPayment" wp
        JOIN "Workshop" w ON w."id" = wp."workshopId"
        JOIN "WorkshopParticipant" part ON part."id" = wp."participantId";

        -- Drop legacy table
        DROP TABLE "WorkshopPayment" CASCADE;
    END IF;
END $$;

-- Final safety drop of table
DROP TABLE IF EXISTS "WorkshopPayment" CASCADE;
