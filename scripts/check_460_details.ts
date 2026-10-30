import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Run payroll for Oct 2026 and inspect every student in Lesson 460 and Lesson 386
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-11-30')
  );

  const s460 = payroll?.sessionDetails.find(s => s.lessonId === 460);
  console.log('Session 460 details:', s460);

  const s386 = payroll?.sessionDetails.find(s => s.lessonId === 386);
  console.log('Session 386 details:', s386);
}

main().catch(console.error).finally(() => prisma.$disconnect());
