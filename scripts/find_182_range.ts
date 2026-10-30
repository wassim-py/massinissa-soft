import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's test combinations of start dates and end dates
  const startDates = [
    '2026-09-01',
    '2026-09-15',
    '2026-09-20',
    '2026-09-25',
    '2026-10-01',
  ];

  const endDates = [
    '2026-10-23',
    '2026-10-24',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-05',
    '2026-11-30',
  ];

  for (const s of startDates) {
    for (const e of endDates) {
      const p = await calculateTeacherPayroll(teacherId, new Date(s), new Date(e + 'T23:59:59.999Z'));
      if (!p) continue;
      const g1 = p.groupBreakdown.find(g => g.className.includes('فوج 1'));
      const g2 = p.groupBreakdown.find(g => g.className.includes('فوج 2'));
      const p1 = g1 ? (g1.payableLessonsCount ?? g1.paidSessionsCount ?? 0) : 0;
      const p2 = g2 ? (g2.payableLessonsCount ?? g2.paidSessionsCount ?? 0) : 0;
      const total = p1 + p2;
      if (total >= 175 && total <= 185) {
        console.log(`Range [${s} to ${e}]: G1=${p1}, G2=${p2}, Total=${total}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
