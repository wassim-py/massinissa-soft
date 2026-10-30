import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // We want to see how each lesson's paying students are determined
  // Let's modify payroll or write a script that mirrors payroll's student loop for G1 and G2
  // Or let's inspect each lesson of G1 and G2
  const lessons = await prisma.lesson.findMany({
    where: { classId: { in: [56, 57] } },
    include: {
      class: true,
      attendances: {
        include: { student: true }
      },
      catchUpVisitsHosted: {
        include: { student: true }
      }
    },
    orderBy: { startsAt: 'asc' }
  });

  for (const l of lessons) {
    console.log(`\n======================================================`);
    console.log(`Lesson #${l.id} | ${l.class.name} | ${l.startsAt.toISOString().slice(0, 10)}`);
    console.log(`Present attendances (${l.attendances.filter(a => a.status === 'PRESENT').length}):`);
    for (const a of l.attendances.filter(a => a.status === 'PRESENT')) {
      console.log(`  - ${a.student.name} (${a.studentId})`);
    }
    console.log(`Absent attendances (${l.attendances.filter(a => a.status === 'ABSENT').length}):`);
    for (const a of l.attendances.filter(a => a.status === 'ABSENT')) {
      console.log(`  - [ABSENT] ${a.student.name} (${a.studentId})`);
    }
    if (l.catchUpVisitsHosted.length > 0) {
      console.log(`Hosted catch-ups (${l.catchUpVisitsHosted.length}):`);
      for (const cu of l.catchUpVisitsHosted) {
        console.log(`  - [CATCH-UP] ${cu.student.name} (${cu.studentId}), missed: ${cu.missedLessonId}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
