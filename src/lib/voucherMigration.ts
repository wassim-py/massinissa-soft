import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Migration helper to migrate legacy Payment records into Voucher records.
 * Per instructions: Prepared safely; will only run upon explicit confirmation with real data.
 */
export async function migrateLegacyPaymentsToVouchers(options?: { dryRun?: boolean }) {
  const dryRun = options?.dryRun ?? true;

  console.log(`[Migration] Starting legacy payment migration (dryRun: ${dryRun})...`);

  // Check if legacy Payment table or raw records exist
  let legacyPayments: any[] = [];
  try {
    legacyPayments = await prisma.$queryRaw<any[]>`
      SELECT * FROM "Payment" ORDER BY id ASC
    `;
  } catch (err: any) {
    console.log("[Migration] No legacy 'Payment' table found or table already dropped.");
    return {
      success: true,
      migratedCount: 0,
      message: "No legacy Payment table found in the database. Schema already on Voucher system.",
    };
  }

  if (legacyPayments.length === 0) {
    return {
      success: true,
      migratedCount: 0,
      message: "Legacy Payment table is empty. 0 records to migrate.",
    };
  }

  console.log(`[Migration] Found ${legacyPayments.length} legacy payment records.`);

  if (dryRun) {
    return {
      success: true,
      migratedCount: legacyPayments.length,
      message: `Dry run complete. Found ${legacyPayments.length} records ready to migrate into Voucher.`,
      recordsSample: legacyPayments.slice(0, 5),
    };
  }

  // Execute migration in a transaction
  let migrated = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of legacyPayments) {
      // Find class and its branch
      const classRow = await tx.class.findUnique({
        where: { id: p.classId },
        select: { id: true, branchId: true },
      });
      const targetBranchId = classRow?.branchId || 1;

      // Find student home branch
      const studentRow = await tx.student.findUnique({
        where: { id: p.studentId },
        select: { registeredBranchId: true },
      });
      const issuingBranchId = studentRow?.registeredBranchId || targetBranchId;

      // Find or create series
      let series = await tx.voucherSeries.findFirst({
        where: {
          issuingBranchId: issuingBranchId,
          scope: issuingBranchId === targetBranchId ? "LOCAL_LEVEL" : "CROSS_BRANCH",
          ...(issuingBranchId !== targetBranchId ? { targetBranchId: targetBranchId } : {}),
        },
      });

      if (!series) {
        series = await tx.voucherSeries.create({
          data: {
            issuingBranchId: issuingBranchId,
            scope: issuingBranchId === targetBranchId ? "LOCAL_LEVEL" : "CROSS_BRANCH",
            targetBranchId: issuingBranchId === targetBranchId ? null : targetBranchId,
            currentNumber: 100,
          },
        });
      }

      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      });

      await tx.voucher.create({
        data: {
          seriesId: series.id,
          number: updatedSeries.currentNumber,
          studentId: p.studentId,
          classId: p.classId,
          issuingBranchId: issuingBranchId,
          targetBranchId: targetBranchId,
          paymentType: "TUITION_4SESSION",
          amount: new Prisma.Decimal(p.amount),
          isPartial: false,
          issuedBy: "system_migration",
          issuedAt: p.date ? new Date(p.date) : new Date(),
          isVoided: false,
        },
      });

      migrated++;
    }
  });

  return {
    success: true,
    migratedCount: migrated,
    message: `Successfully migrated ${migrated} legacy payment records to Voucher.`,
  };
}
