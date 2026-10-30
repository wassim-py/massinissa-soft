import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's check for ALL date ranges or see what the app currently displays
  const startOct = new Date(Date.UTC(2026, 9, 1));
  const endOct = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
  const payrollOct = await calculateTeacherPayroll(teacherId, startOct, endOct);

  console.log('October payroll groupBreakdown:');
  for (const g of payrollOct?.groupBreakdown || []) {
    console.log(`  ${g.className}: payableLessonsCount=${g.payableLessonsCount}, paidSessionsCount=${g.paidSessionsCount}, courseSessionsCount=${g.courseSessionsCount}`);
  }

  // What about from Sept 1 to Oct 31?
  const startAll = new Date(Date.UTC(2026, 8, 1));
  const endAll = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
  const payrollAll = await calculateTeacherPayroll(teacherId, startAll, endAll);

  console.log('\nSept-Oct payroll groupBreakdown:');
  for (const g of payrollAll?.groupBreakdown || []) {
    console.log(`  ${g.className}: payableLessonsCount=${g.payableLessonsCount}, paidSessionsCount=${g.paidSessionsCount}, courseSessionsCount=${g.courseSessionsCount}`);
  }

  // Are there retroactive sessions?
  const retroSessions = payrollAll?.sessionDetails.filter(s => s.isRetroactive);
  console.log(`\nRetroactive sessions in Sept-Oct: ${retroSessions?.length}`);
  for (const r of retroSessions || []) {
    console.log(`  Retro: ${r.className} | payingCount=${r.payingCount} | lessonAmount=${r.lessonAmount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
