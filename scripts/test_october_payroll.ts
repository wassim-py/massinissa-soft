import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';
  
  // Test 1: Oct 1 to Oct 31
  console.log('=== OCTOBER 2026 (Oct 1 to Oct 31) ===');
  const pOct = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-10-01T00:00:00.000Z'),
    new Date('2026-10-31T23:59:59.999Z')
  );

  console.log('Total present attendances:', pOct.totalPresentAttendances);
  for (const g of pOct.groupBreakdown) {
    if (g.className.includes('بوخزر BEM')) {
      console.log(`Class: ${g.className}`);
      console.log(`  Course sessions: ${g.courseSessionsCount}, Total sessions: ${g.totalSessionsCount}`);
      console.log(`  payableLessonsCount: ${(g as any).payableLessonsCount}`);
      console.log(`  presentAttendances: ${(g as any).presentAttendances}`);
      console.log(`  paidSessionsCount: ${g.paidSessionsCount}`);
    }
  }

  // Let's check sessionDetails for Oct
  for (const s of pOct.sessionDetails) {
    if (s.className.includes('بوخزر BEM')) {
      console.log(`  Lesson ${s.lessonId} (${s.className}) ${s.startsAt.toISOString().split('T')[0]}: present=${s.presentCount}, paying=${s.payingCount}, teacherCut=${s.teacherCut}, amount=${s.lessonAmount}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
