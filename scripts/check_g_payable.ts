import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's check what calculateTeacherPayroll returns
  const calc = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-10-31T23:59:59.999Z')
  );

  console.log('Group Breakdown:');
  for (const g of calc?.groupBreakdown || []) {
    if (g.className.includes('بوخزر BEM')) {
      console.log(`  ${g.className}:`);
      console.log(`    courseSessionsCount: ${g.courseSessionsCount}`);
      console.log(`    payableLessonsCount: ${g.payableLessonsCount}`);
      console.log(`    paidSessionsCount: ${g.paidSessionsCount}`);
      console.log(`    totalSessionsCount: ${g.totalSessionsCount}`);
    }
  }

  // Also check if any report in actions.ts does something different
}

main().catch(console.error).finally(() => prisma.$disconnect());
