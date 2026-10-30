import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Test Oct 2026
  const startOct = new Date(Date.UTC(2026, 9, 1));
  const endOct = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  console.log('Calculating payroll for October 2026...');
  const payrollOct = await calculateTeacherPayroll(teacherId, startOct, endOct);

  if (payrollOct) {
    console.log('\n--- October 2026 Groups ---');
    for (const g of payrollOct.groupBreakdown) {
      console.log(`Group: ${g.className} (${g.branchName}) | courseSessions: ${g.courseSessionsCount} | payableLessons: ${g.payableLessonsCount} | paidSessions: ${g.paidSessionsCount} | amount: ${g.amount}`);
    }
  }

  // Also check September 2026 just in case
  const startSep = new Date(Date.UTC(2026, 8, 1));
  const endSep = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
  const payrollSep = await calculateTeacherPayroll(teacherId, startSep, endSep);
  if (payrollSep) {
    console.log('\n--- September 2026 Groups ---');
    for (const g of payrollSep.groupBreakdown) {
      console.log(`Group: ${g.className} (${g.branchName}) | courseSessions: ${g.courseSessionsCount} | payableLessons: ${g.payableLessonsCount} | paidSessions: ${g.paidSessionsCount} | amount: ${g.amount}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
