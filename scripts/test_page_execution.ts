import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const id = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // "This month" date boundary
  const thisMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
  const thisMonthEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));

  console.log('Date range in page.tsx:');
  console.log('thisMonthStart:', thisMonthStart.toISOString());
  console.log('thisMonthEnd:', thisMonthEnd.toISOString());

  const currentPayroll = await calculateTeacherPayroll(id, thisMonthStart, thisMonthEnd);

  console.log('\n--- Current Payroll (this month) ---');
  for (const g of currentPayroll?.groupBreakdown || []) {
    console.log(`Group: ${g.className} | courseSessions: ${g.courseSessionsCount} | payableLessons: ${g.payableLessonsCount} | paidSessions: ${g.paidSessionsCount}`);
  }

  // Also check calculateTeacherPayroll with different scope
  const normalScope = await calculateTeacherPayroll(id, thisMonthStart, thisMonthEnd, 'normal');
  console.log('\n--- Normal Scope ---');
  for (const g of normalScope?.groupBreakdown || []) {
    console.log(`Group: ${g.className} | courseSessions: ${g.courseSessionsCount} | payableLessons: ${g.payableLessonsCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
