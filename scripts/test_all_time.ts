import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's inspect the entire payroll calculation for all time
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2020-01-01'),
    new Date('2030-01-01')
  );

  console.log('Group Breakdown:');
  for (const g of payroll?.groupBreakdown || []) {
    console.log(`  ${g.className}: payableLessonsCount=${g.payableLessonsCount}, paidSessionsCount=${g.paidSessionsCount}, courseSessionsCount=${g.courseSessionsCount}`);
  }

  // Let's check each session detail
  console.log('\nSession Details for بوخزر BEM:');
  for (const s of payroll?.sessionDetails || []) {
    if (s.className.includes('بوخزر BEM')) {
      console.log(`  ${s.className} | Lesson #${s.lessonId} (${new Date(s.startsAt).toISOString().slice(0, 10)}) | presentCount: ${s.presentCount} | payingCount: ${s.payingCount} | retro: ${s.isRetroactive}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
