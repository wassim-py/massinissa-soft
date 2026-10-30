import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Check all payslips in DB
  const payslips = await prisma.payslip.findMany({
    where: { personId: teacherId },
    include: {
      PayrollRun: true,
      PayslipBranchLine: true
    }
  });

  console.log(`Payslips count for teacher: ${payslips.length}`);
  for (const p of payslips) {
    console.log(`Payslip #${p.id} | Run #${p.payrollRunId} (${p.PayrollRun.periodStart.toISOString().slice(0, 10)} to ${p.PayrollRun.periodEnd.toISOString().slice(0, 10)}) | sessionsCount: ${p.sessionsCount} | gross: ${p.grossAmount} | net: ${p.netAmount}`);
  }

  // Let's check calculateTeacherPayroll with different start/end dates
  const ranges = [
    { name: 'Sep 1 to Oct 30, 2026', start: new Date('2026-09-01'), end: new Date('2026-10-30T23:59:59.999Z') },
    { name: 'Sep 1 to Oct 31, 2026', start: new Date('2026-09-01'), end: new Date('2026-10-31T23:59:59.999Z') },
    { name: 'Sep 15 to Oct 31, 2026', start: new Date('2026-09-15'), end: new Date('2026-10-31T23:59:59.999Z') },
    { name: 'Sep 1 to Nov 30, 2026', start: new Date('2026-09-01'), end: new Date('2026-11-30T23:59:59.999Z') },
    { name: 'All time', start: new Date('2020-01-01'), end: new Date('2030-01-01') },
  ];

  for (const r of ranges) {
    const calc = await calculateTeacherPayroll(teacherId, r.start, r.end);
    if (!calc) continue;
    const g1 = calc.groupBreakdown.find(g => g.className.includes('فوج 1'));
    const g2 = calc.groupBreakdown.find(g => g.className.includes('فوج 2'));
    const p1 = g1 ? (g1.payableLessonsCount ?? g1.paidSessionsCount ?? 0) : 0;
    const p2 = g2 ? (g2.payableLessonsCount ?? g2.paidSessionsCount ?? 0) : 0;
    console.log(`Range [${r.name}]: g1=${p1}, g2=${p2}, sum=${p1 + p2}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
