import { prisma } from './lib/db';
import { Prisma } from '@prisma/client';

function normalizeDateToStartOfDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function resolveLedgerType(paymentType: string, isFormation: boolean = false): string {
  if (isFormation || paymentType === 'WORKSHOP') {
    return 'ATELIER_FORMATION';
  }
  switch (paymentType) {
    case 'TUITION_4SESSION':
    case 'CATCHUP':
    case 'EXTRA_SESSION':
      return 'TUITION';
    case 'INSCRIPTION':
      return 'INSCRIPTION';
    case 'BOOK':
      return 'BOOK';
    default:
      return 'TUITION';
  }
}

async function syncDailyLedger() {
  console.log('\n--- Syncing DailyLedger from vouchers and refunds ---');
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

    const normalizedDate = normalizeDateToStartOfDay(v.issuedAt);
    const dateKey = normalizedDate.toISOString();
    const type = resolveLedgerType(v.paymentType, v.class?.isFormation ?? false);
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

    const normalizedDate = normalizeDateToStartOfDay(r.refundedAt);
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
    amount: new Prisma.Decimal(item.amount),
  }));

  await prisma.$transaction(async (tx) => {
    await tx.dailyLedger.deleteMany({});
    if (items.length > 0) {
      await tx.dailyLedger.createMany({
        data: items,
      });
    }
  });

  console.log(`✅ DailyLedger successfully refreshed with ${items.length} records.`);
}

async function main() {
  console.log('================================================================');
  console.log('TARGET DELETION SCRIPT');
  console.log('Students: "نعيجة جيهان" & "طلحي مرام"');
  console.log('Class: "نذير علمي" (Class ID 17)');
  console.log('================================================================');

  const student1 = await prisma.student.findFirst({
    where: { name: 'نعيجة جيهان' }
  });
  const student2 = await prisma.student.findFirst({
    where: { name: 'طلحي مرام' }
  });

  if (!student1 || !student2) {
    throw new Error(`One or both students not found! s1: ${student1?.id}, s2: ${student2?.id}`);
  }

  const targetClass = await prisma.class.findUnique({
    where: { id: 17 },
    include: { teacher: true }
  });

  if (!targetClass || targetClass.name !== 'نذير علمي') {
    throw new Error(`Target class 17 unexpected: ${JSON.stringify(targetClass)}`);
  }

  console.log(`Found Student 1: ${student1.name} (${student1.id})`);
  console.log(`Found Student 2: ${student2.name} (${student2.id})`);
  console.log(`Found Class: ${targetClass.name} (ID: ${targetClass.id}, Teacher: ${targetClass.teacher?.name})`);

  // Target vouchers to delete
  const vouchersToDelete = await prisma.voucher.findMany({
    where: {
      studentId: { in: [student1.id, student2.id] },
      classId: targetClass.id
    },
    include: {
      student: true,
      class: true,
      series: true
    }
  });

  console.log(`\nVouchers found to delete: ${vouchersToDelete.length}`);
  for (const v of vouchersToDelete) {
    console.log(`- Voucher ID: ${v.id}, No: ${v.number}, Type: ${v.paymentType}, Amount: ${v.amount}, Student: ${v.student.name}, Class: ${v.class?.name}, SeriesId: ${v.seriesId}, IssuedAt: ${v.issuedAt.toISOString()}`);
  }

  const expectedIds = [2267, 2268, 2269, 2270, 2271, 2272, 2273];
  const foundIds = vouchersToDelete.map(v => v.id).sort();
  const sortedExpectedIds = [...expectedIds].sort();

  if (JSON.stringify(foundIds) !== JSON.stringify(sortedExpectedIds)) {
    throw new Error(`Mismatch in expected voucher IDs! Found: ${foundIds.join(', ')} vs Expected: ${sortedExpectedIds.join(', ')}`);
  }

  // Pre-deletion checks
  const [s1AttendancesBefore, s2AttendancesBefore, class17VouchersBefore] = await Promise.all([
    prisma.attendance.count({ where: { studentId: student1.id } }),
    prisma.attendance.count({ where: { studentId: student2.id } }),
    prisma.voucher.count({ where: { classId: targetClass.id } })
  ]);

  console.log(`\nBefore Deletion State:`);
  console.log(`- Student 1 (${student1.name}) total attendances: ${s1AttendancesBefore}`);
  console.log(`- Student 2 (${student2.name}) total attendances: ${s2AttendancesBefore}`);
  console.log(`- Class 17 total vouchers: ${class17VouchersBefore}`);

  // Delete transaction
  console.log('\nExecuting deletion transaction...');
  await prisma.$transaction(async (tx) => {
    const deleted = await tx.voucher.deleteMany({
      where: {
        id: { in: foundIds }
      }
    });
    console.log(`Deleted ${deleted.count} vouchers.`);

    // Recalculate series 1 currentNumber
    const series1Agg = await tx.voucher.aggregate({
      where: { seriesId: 1 },
      _max: { number: true }
    });
    const newMaxSeries1 = series1Agg._max.number ?? 0;
    await tx.voucherSeries.update({
      where: { id: 1 },
      data: { currentNumber: newMaxSeries1 }
    });
    console.log(`Updated VoucherSeries 1 currentNumber to: ${newMaxSeries1}`);
  });

  // Re-sync DailyLedger
  await syncDailyLedger();

  // Post-deletion verification
  console.log('\n--- Post-Deletion Verification ---');
  const [
    s1Class17VouchersAfter,
    s2Class17VouchersAfter,
    s1TotalVouchersAfter,
    s2TotalVouchersAfter,
    s1AttendancesAfter,
    s2AttendancesAfter,
    class17VouchersAfter,
    series1After
  ] = await Promise.all([
    prisma.voucher.count({ where: { studentId: student1.id, classId: targetClass.id } }),
    prisma.voucher.count({ where: { studentId: student2.id, classId: targetClass.id } }),
    prisma.voucher.count({ where: { studentId: student1.id } }),
    prisma.voucher.count({ where: { studentId: student2.id } }),
    prisma.attendance.count({ where: { studentId: student1.id } }),
    prisma.attendance.count({ where: { studentId: student2.id } }),
    prisma.voucher.count({ where: { classId: targetClass.id } }),
    prisma.voucherSeries.findUnique({ where: { id: 1 } })
  ]);

  console.log(`- Student 1 (${student1.name}) vouchers in Class 17: ${s1Class17VouchersAfter} (expected 0)`);
  console.log(`- Student 2 (${student2.name}) vouchers in Class 17: ${s2Class17VouchersAfter} (expected 0)`);
  console.log(`- Student 1 (${student1.name}) total vouchers: ${s1TotalVouchersAfter} (expected 4 in Class 6)`);
  console.log(`- Student 2 (${student2.name}) total vouchers: ${s2TotalVouchersAfter} (expected 4 in Class 2)`);
  console.log(`- Student 1 attendances: ${s1AttendancesAfter} (was ${s1AttendancesBefore}) - Untouched: ${s1AttendancesAfter === s1AttendancesBefore}`);
  console.log(`- Student 2 attendances: ${s2AttendancesAfter} (was ${s2AttendancesBefore}) - Untouched: ${s2AttendancesAfter === s2AttendancesBefore}`);
  console.log(`- Class 17 total vouchers: ${class17VouchersAfter} (was ${class17VouchersBefore}) - Difference: ${class17VouchersBefore - class17VouchersAfter}`);
  console.log(`- Series 1 currentNumber: ${series1After?.currentNumber}`);

  if (
    s1Class17VouchersAfter === 0 &&
    s2Class17VouchersAfter === 0 &&
    s1TotalVouchersAfter === 4 &&
    s2TotalVouchersAfter === 4 &&
    s1AttendancesAfter === s1AttendancesBefore &&
    s2AttendancesAfter === s2AttendancesBefore &&
    class17VouchersAfter === class17VouchersBefore - 7
  ) {
    console.log('\n🎉 ALL CHECKS PASSED SUCCESSFULLY!');
  } else {
    throw new Error('❌ Post-deletion verification failed!');
  }
}

main()
  .catch((e) => {
    console.error('Execution failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
