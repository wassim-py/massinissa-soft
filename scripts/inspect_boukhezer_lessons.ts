import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Let's inspect sessionDetails for each lesson of teacher بوخزر
  // We will run for a wide range: 2026-09-01 to 2026-11-30
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-11-30')
  );

  console.log('--- ALL SESSION DETAILS IN PAYROLL ---');
  let sumG1 = 0;
  let sumG2 = 0;
  for (const s of payroll?.sessionDetails || []) {
    if (s.className.includes('فوج 1')) {
      sumG1 += (s.payingCount ?? 0);
      console.log(`G1 | Lesson #${s.lessonId} | ${new Date(s.startsAt).toISOString().slice(0, 10)} | payingCount: ${s.payingCount} | presentCount: ${s.presentCount} | totalStudents: ${s.studentCount}`);
    } else if (s.className.includes('فوج 2')) {
      sumG2 += (s.payingCount ?? 0);
      console.log(`G2 | Lesson #${s.lessonId} | ${new Date(s.startsAt).toISOString().slice(0, 10)} | payingCount: ${s.payingCount} | presentCount: ${s.presentCount} | totalStudents: ${s.studentCount}`);
    }
  }
  console.log(`Total payingCount: G1=${sumG1}, G2=${sumG2}, Sum=${sumG1 + sumG2}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
