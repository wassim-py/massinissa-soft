import { prisma } from '../src/lib/prisma';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01T00:00:00.000Z'),
    new Date('2026-10-31T23:59:59.999Z')
  );
  
  console.log('--- PAYROLL SUMMARY ---');
  console.log('Total present attendances:', payroll.totalPresentAttendances);
  console.log('Total paid sessions count:', payroll.totalPaidSessionsCount);
  console.log('Total amount:', payroll.totalAmount);
  console.log('\n--- GROUP BREAKDOWN ---');
  for (const g of payroll.groupBreakdown) {
    if (g.className.includes('بوخزر BEM')) {
      console.log(`Class: ${g.className}`);
      console.log(`  Course sessions count: ${g.courseSessionsCount}`);
      console.log(`  Total sessions count: ${g.totalSessionsCount}`);
      console.log(`  Payable lessons count: ${(g as any).payableLessonsCount}`);
      console.log(`  Paid sessions count: ${g.paidSessionsCount}`);
      console.log(`  Tuition gross: ${g.tuitionGross}`);
      console.log(`  Amount: ${g.amount}`);
    }
  }

  console.log('\n--- SESSION DETAILS FOR CLASS 56 & 57 ---');
  const relevantSessions = payroll.sessionDetails.filter(s => s.className.includes('بوخزر BEM'));
  for (const s of relevantSessions) {
    console.log(`Lesson ${s.lessonId} (${s.className}) on ${s.startsAt.toISOString().split('T')[0]}: present=${s.presentCount}, paying=${s.payingCount}, isFree=${s.isFree}, amount=${s.lessonAmount}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
