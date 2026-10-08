/**
 * scripts/empty-formation-data.ts
 * ═══════════════════════════════════════════════════════════════════
 * Deletes formation students, attendance, lessons, enrollments, and vouchers
 * from the database WITHOUT touching any Excel files.
 *
 * Safety rules:
 *   - Only targets classes where isFormation: true.
 *   - Students who are ALSO enrolled in regular school classes are preserved
 *     (only their formation enrollments/attendance/vouchers are removed).
 *   - Students created solely for formations (no other enrollments) are deleted.
 *   - DailyLedger is resynchronized to reflect remaining active vouchers.
 *   - Excel files in data/ and data/attendance/ are NOT modified or deleted.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Decimal } from 'decimal.js';
import { prisma } from './lib/db';

async function syncDailyLedger() {
  const [vouchers, refunds] = await Promise.all([
    prisma.voucher.findMany({
      where: { isVoided: false, isRefund: false },
      include: { class: true },
    }),
    prisma.refund.findMany({
      include: { voucher: true },
    }),
  ]);

  const ledgerMap = new Map<string, { branchId: number; date: Date; type: string; amount: number }>();

  for (const v of vouchers) {
    const amount = Number(v.amount);
    if (amount <= 0) continue;

    const d = new Date(v.issuedAt);
    const normalizedDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const dateKey = normalizedDate.toISOString();

    let type = 'TUITION';
    if (v.class?.isFormation || v.paymentType === 'WORKSHOP') {
      type = 'ATELIER_FORMATION';
    } else if (v.paymentType === 'INSCRIPTION') {
      type = 'INSCRIPTION';
    } else if (v.paymentType === 'BOOK') {
      type = 'BOOK';
    }

    const branchId = v.issuingBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  for (const r of refunds) {
    const amount = Number(r.amount);
    if (amount <= 0) continue;

    const d = new Date(r.refundedAt);
    const normalizedDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const dateKey = normalizedDate.toISOString();
    const type = 'REFUND';
    const branchId = r.voucher.issuingBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  const items = Array.from(ledgerMap.values()).map((item) => ({
    branchId: item.branchId,
    date: item.date,
    type: item.type,
    amount: new Decimal(item.amount).toString() as any,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.dailyLedger.deleteMany({});
    if (items.length > 0) {
      await tx.dailyLedger.createMany({
        data: items,
      });
    }
  });

  console.log(`    📊 Resynchronized DailyLedger: ${items.length} daily entries.`);
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  PURGING FORMATION STUDENTS & ATTENDANCE FROM DATABASE');
  console.log('  (Excel files will NOT be touched)');
  console.log('════════════════════════════════════════════════════════════\n');

  // 1. Find all formation classes
  const formationClasses = await prisma.class.findMany({
    where: { isFormation: true },
    select: { id: true, name: true },
  });
  const formationClassIds = formationClasses.map((c) => c.id);

  if (formationClassIds.length === 0) {
    console.log('No formation classes found in database.');
    await prisma.$disconnect();
    return;
  }

  console.log(`🔍 Found ${formationClassIds.length} formation class(es) in database.`);

  // 2. Find all lessons in formation classes
  const formationLessons = await prisma.lesson.findMany({
    where: { classId: { in: formationClassIds } },
    select: { id: true },
  });
  const formationLessonIds = formationLessons.map((l) => l.id);

  // 3. Delete attendances in formation lessons
  let deletedAttendances = 0;
  if (formationLessonIds.length > 0) {
    // Delete catch-up attendances if any
    await prisma.catchUpAttendance.deleteMany({
      where: {
        OR: [
          { missedLessonId: { in: formationLessonIds } },
          { catchUpLessonId: { in: formationLessonIds } },
        ],
      },
    });

    const attRes = await prisma.attendance.deleteMany({
      where: { lessonId: { in: formationLessonIds } },
    });
    deletedAttendances = attRes.count;
    console.log(`  🗑 Deleted ${deletedAttendances} attendance record(s) from formation lessons.`);

    // 4. Delete the formation lessons
    const lesRes = await prisma.lesson.deleteMany({
      where: { id: { in: formationLessonIds } },
    });
    console.log(`  🗑 Deleted ${lesRes.count} lesson(s) from formation classes.`);
  }

  // 5. Find vouchers for formation classes
  const formationVouchers = await prisma.voucher.findMany({
    where: { classId: { in: formationClassIds } },
    select: { id: true },
  });
  const formationVoucherIds = formationVouchers.map((v) => v.id);

  if (formationVoucherIds.length > 0) {
    // Delete refunds & edits for these vouchers
    await prisma.refund.deleteMany({
      where: { voucherId: { in: formationVoucherIds } },
    });
    await prisma.voucherEdit.deleteMany({
      where: { voucherId: { in: formationVoucherIds } },
    });
    const vouchRes = await prisma.voucher.deleteMany({
      where: { id: { in: formationVoucherIds } },
    });
    console.log(`  🗑 Deleted ${vouchRes.count} voucher(s) for formation classes.`);
  }

  // 6. Find enrollments in formation classes
  const formationEnrollments = await prisma.enrollment.findMany({
    where: { classId: { in: formationClassIds } },
    select: { id: true, studentId: true },
  });
  const candidateStudentIds = Array.from(new Set(formationEnrollments.map((e) => e.studentId)));

  const enrRes = await prisma.enrollment.deleteMany({
    where: { classId: { in: formationClassIds } },
  });
  console.log(`  🗑 Deleted ${enrRes.count} formation enrollment(s).`);

  // 7. Check candidate students: delete only if they have NO remaining data in other classes
  let deletedStudents = 0;
  let preservedStudents = 0;

  for (const studentId of candidateStudentIds) {
    const [otherEnrs, otherVouchers, otherAttendances] = await Promise.all([
      prisma.enrollment.count({ where: { studentId } }),
      prisma.voucher.count({ where: { studentId } }),
      prisma.attendance.count({ where: { studentId } }),
    ]);

    if (otherEnrs === 0 && otherVouchers === 0 && otherAttendances === 0) {
      // Safe to delete: student was created solely for formation
      await prisma.bookReceipt.deleteMany({ where: { studentId } });
      await prisma.parentPhoneNumber.deleteMany({ where: { studentId } });
      await prisma.student.delete({ where: { id: studentId } });
      deletedStudents++;
    } else {
      // Preserved: student belongs to regular school classes
      preservedStudents++;
    }
  }

  console.log(`  🗑 Deleted ${deletedStudents} formation-only student record(s).`);
  console.log(`  🛡 Preserved ${preservedStudents} student(s) who are also enrolled in regular school classes.`);

  // 8. Resync DailyLedger
  console.log('\n  Syncing DailyLedger...');
  await syncDailyLedger();

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('✅ CLEANUP COMPLETE:');
  console.log(`   - Formation attendances deleted: ${deletedAttendances}`);
  console.log(`   - Formation lessons deleted:     ${formationLessonIds.length}`);
  console.log(`   - Formation enrollments deleted: ${formationEnrollments.length}`);
  console.log(`   - Formation vouchers deleted:    ${formationVoucherIds.length}`);
  console.log(`   - Formation students deleted:    ${deletedStudents}`);
  console.log(`   - Cross-enrolled students kept:  ${preservedStudents}`);
  console.log('   - Excel files:                   UNTOUCHED (100% preserved)');
  console.log('════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error emptying formation data:', err);
  process.exit(1);
});
