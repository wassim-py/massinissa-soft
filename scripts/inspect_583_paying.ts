import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // Calculate payroll for Oct 2026
  const payroll = await calculateTeacherPayroll(
    teacherId,
    new Date('2026-09-01'),
    new Date('2026-10-31T23:59:59.999Z')
  );

  // Find Lesson 583
  const s583 = payroll?.sessionDetails.find(s => s.lessonId === 583);
  console.log('Session 583:', s583);

  // Let's check which students were counted as paying in Session 583
  // Let's inspect the attendance for Lesson 583
  const atts583 = await prisma.attendance.findMany({
    where: { lessonId: 583 },
    include: {
      student: {
        include: {
          vouchers: { where: { classId: 57 } },
          enrollments: { where: { classId: 57 } }
        }
      }
    }
  });

  console.log(`\nLesson 583 students (${atts583.length}):`);
  for (const a of atts583) {
    const vCount = a.student.vouchers.length;
    const vAmount = a.student.vouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const enroll = a.student.enrollments[0];
    console.log(`  ${a.student.name.padEnd(25)}: status=${a.status}, payerStatus=${enroll?.payerStatus}, vouchers=${vCount} (${vAmount} DZD)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
