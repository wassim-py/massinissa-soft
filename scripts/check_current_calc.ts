import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's test all possible periods
  const pAll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-10-31T23:59:59.999Z')
  );

  console.log('--- ALL PERIODS (Sept 1 - Oct 31) ---');
  for (const g of pAll?.groupBreakdown || []) {
    console.log(`${g.className}: courseSessions=${g.courseSessionsCount}, payableLessons=${g.payableLessonsCount}, amount=${g.amount}`);
  }

  // Where does 182 come from?
  // Let's check sessionDetails presentCount and payingCount
  let totalPresent = 0;
  let totalPaying = 0;
  for (const s of pAll?.sessionDetails || []) {
    if (s.className.includes('بوخزر BEM')) {
      console.log(`Session #${s.lessonId} (${s.className}, ${new Date(s.startsAt).toISOString().slice(5, 10)}): present=${s.presentCount}, paying=${s.payingCount}`);
      totalPresent += s.presentCount;
      totalPaying += (s.payingCount ?? 0);
    }
  }
  console.log(`Total present for BEM: ${totalPresent}`);
  console.log(`Total paying for BEM: ${totalPaying}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
