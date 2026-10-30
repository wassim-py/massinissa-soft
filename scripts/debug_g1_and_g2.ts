import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-11-30')
  );

  console.log('Class 56 (بوخزر BEM فوج 1):');
  let totalPresent56 = 0;
  let totalPaying56 = 0;
  for (const s of payroll?.sessionDetails || []) {
    if (s.className.includes('فوج 1')) {
      totalPresent56 += s.presentCount;
      totalPaying56 += (s.payingCount ?? 0);
      console.log(`  Lesson #${s.lessonId} (${new Date(s.startsAt).toISOString().slice(0, 10)}): presentCount=${s.presentCount}, payingCount=${s.payingCount}`);
    }
  }
  console.log(`Total G1: present=${totalPresent56}, paying=${totalPaying56}`);

  console.log('\nClass 57 (بوخزر BEM فوج 2):');
  let totalPresent57 = 0;
  let totalPaying57 = 0;
  for (const s of payroll?.sessionDetails || []) {
    if (s.className.includes('فوج 2')) {
      totalPresent57 += s.presentCount;
      totalPaying57 += (s.payingCount ?? 0);
      console.log(`  Lesson #${s.lessonId} (${new Date(s.startsAt).toISOString().slice(0, 10)}): presentCount=${s.presentCount}, payingCount=${s.payingCount}`);
    }
  }
  console.log(`Total G2: present=${totalPresent57}, paying=${totalPaying57}`);

  console.log(`\nSUM G1 + G2: present=${totalPresent56 + totalPresent57}, paying=${totalPaying56 + totalPaying57}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
