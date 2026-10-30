import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's inspect sessionDetails for each lesson of teacher بوخزر
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-11-30')
  );

  console.log('Group Breakdown:');
  for (const g of payroll?.groupBreakdown || []) {
    if (g.className.includes('بوخزر BEM')) {
      console.log(`  ${g.className}: courseSessions=${g.courseSessionsCount}, payableLessons=${g.payableLessonsCount}`);
    }
  }

  // Why did G2 have 49?
  // Let's check sessionDetails for G2
  for (const s of payroll?.sessionDetails || []) {
    if (s.className.includes('فوج 2')) {
      console.log(`  Lesson #${s.lessonId} (${new Date(s.startsAt).toISOString().slice(0, 10)}): presentCount=${s.presentCount}, payingCount=${s.payingCount}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
