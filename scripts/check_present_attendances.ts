import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // For Oct 1 to Oct 31
  const startOct = new Date(Date.UTC(2026, 9, 1));
  const endOct = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
  const payrollOct = await calculateTeacherPayroll(teacherId, startOct, endOct);

  console.log('October totalPresentAttendances:', payrollOct?.totalPresentAttendances);

  // For Sept 1 to Oct 31
  const startAll = new Date(Date.UTC(2026, 8, 1));
  const endAll = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
  const payrollAll = await calculateTeacherPayroll(teacherId, startAll, endAll);

  console.log('Sept-Oct totalPresentAttendances:', payrollAll?.totalPresentAttendances);
  let bemPresent = 0;
  for (const s of payrollAll?.sessionDetails || []) {
    if (s.className.includes('بوخزر BEM')) {
      bemPresent += s.presentCount;
    }
  }
  console.log('Sept-Oct BEM only present:', bemPresent);
}

main().catch(console.error).finally(() => prisma.$disconnect());
