import { prisma } from './lib/db';
import { computeStudentCreditAndSessions } from '../src/lib/studentBilling';
import { revalidateFinancialRoutes } from '../src/lib/revalidation';

/**
 * Reconciles student enrollments across the entire school:
 * 1. Finds enrollments mistakenly set to 'TRANSFERRED' when:
 *    - The student still has remaining sessions in that class (> 0), OR
 *    - The student is concurrently active in both groups (transfer was a credit top-up/adjustment).
 * 2. Can be run in dry-run mode (default) or execute mode (--apply).
 */
async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('='.repeat(80));
  console.log(`  MASSINISSA SCHOOL: ENROLLMENT & CREDIT RECONCILIATION`);
  console.log(`  Mode: ${isApply ? 'EXECUTE (Modifying Database)' : 'DRY RUN (Preview Only)'}`);
  console.log('='.repeat(80) + '\n');

  const transferredEnrollments = await prisma.enrollment.findMany({
    where: { status: 'TRANSFERRED' },
    include: {
      student: { include: { family: true } },
      class: { include: { branch: true } },
      transfersFrom: {
        include: {
          toEnrollment: { include: { class: true } }
        }
      },
      transfersTo: {
        include: {
          fromEnrollment: { include: { class: true } }
        }
      }
    }
  });

  const candidates: Array<{
    enrollmentId: number;
    studentId: string;
    globalNumber: number;
    studentName: string;
    classId: number;
    className: string;
    branchId: number;
    netSessions: number;
    transferredOutSessions: number;
    reason: string;
  }> = [];

  for (const enr of transferredEnrollments) {
    const vouchers = await prisma.voucher.findMany({
      where: {
        studentId: enr.studentId,
        classId: enr.classId,
        paymentType: 'TUITION_4SESSION',
        isVoided: false,
        isRefund: false
      },
      include: { refunds: true }
    });

    const classLessons = await prisma.lesson.findMany({
      where: { classId: enr.classId },
      orderBy: { startsAt: 'asc' }
    });

    const attendances = await prisma.attendance.findMany({
      where: {
        studentId: enr.studentId,
        lesson: { classId: enr.classId, isFree: false }
      },
      include: { lesson: true }
    });

    const metrics = computeStudentCreditAndSessions({
      pricePerCycle: Number(enr.class.pricePerCycle || 0),
      isFormation: Boolean(enr.class.isFormation),
      payerStatus: enr.payerStatus || enr.student.payerStatus,
      tuitionVouchers: vouchers,
      transfersIn: enr.transfersTo,
      transfersOut: enr.transfersFrom,
      creditResetOffset: enr.creditResetOffset,
      attendances,
      lessons: classLessons,
      enrolledAt: enr.enrolledAt
    });

    // Check if the student transferred to a group where they were already enrolled before the transfer
    const transferredToConcurrentGroup = enr.transfersFrom.some(tf => {
      const targetEnr = tf.toEnrollment;
      if (!targetEnr) return false;
      const targetEnrolledAt = new Date(targetEnr.enrolledAt).getTime();
      const transferTime = new Date(tf.transferredAt).getTime();
      return targetEnrolledAt < transferTime - 2 * 3600 * 1000;
    });

    const hasRemainingCredits = metrics.netSessions > 0;

    // Only restore if student has positive remaining sessions
    if (hasRemainingCredits) {
      candidates.push({
        enrollmentId: enr.id,
        studentId: enr.studentId,
        globalNumber: enr.student.globalNumber,
        studentName: enr.student.name,
        classId: enr.classId,
        className: enr.class.name,
        branchId: enr.class.branchId,
        netSessions: metrics.netSessions,
        transferredOutSessions: enr.transfersFrom.reduce((sum, t) => sum + t.transferredSessions, 0),
        reason: transferredToConcurrentGroup
          ? `Transferred credits to a concurrent group and still has ${metrics.netSessions} remaining sessions`
          : `Student has ${metrics.netSessions} remaining sessions in this class`
      });
    }
  }

  console.log(`Found ${candidates.length} enrollments mistakenly marked TRANSFERRED with remaining credits:\n`);

  for (const c of candidates) {
    console.log(`  [#${c.globalNumber}] ${c.studentName} | Class: "${c.className}" (ID: ${c.classId})`);
    console.log(`      Remaining Balance: ${c.netSessions} sessions | Reason: ${c.reason}`);
  }

  if (candidates.length === 0) {
    console.log('✓ All enrollments across the school are consistent and accurate. No changes needed.');
    return;
  }

  if (!isApply) {
    console.log('\n' + '-'.repeat(80));
    console.log('  To apply these fixes and restore these enrollments to ACTIVE status, run:');
    console.log('  npx tsx scripts/reconcile_transferred_students.ts --apply');
    console.log('-'.repeat(80));
    return;
  }

  console.log('\nApplying fixes to database...');
  for (const c of candidates) {
    await prisma.enrollment.update({
      where: { id: c.enrollmentId },
      data: { status: 'ACTIVE' }
    });
    console.log(`  ✓ Restored enrollment #${c.enrollmentId} ([#${c.globalNumber}] ${c.studentName}) to ACTIVE`);

    await revalidateFinancialRoutes({
      classId: c.classId,
      studentId: c.studentId,
      branchId: c.branchId
    });
  }

  console.log(`\n✓ Successfully reconciled ${candidates.length} enrollments and revalidated cache.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
