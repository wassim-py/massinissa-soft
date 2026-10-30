import { prisma } from './lib/db';

async function main() {
  const att460 = await prisma.attendance.findMany({
    where: { lessonId: 460 },
    include: { student: true }
  });

  console.log(`Lesson 460 Attendances (${att460.length}):`);
  for (const a of att460) {
    console.log(`  ${a.student.name} (${a.studentId}): status=${a.status}`);
  }

  const cu460 = await prisma.catchUpAttendance.findMany({
    where: { hostedLessonId: 460 },
    include: { student: true }
  });
  console.log(`Lesson 460 Catch-ups (${cu460.length}):`);
  for (const c of cu460) {
    console.log(`  ${c.student.name} (${c.studentId}): missedLessonId=${c.missedLessonId}, status=${c.status}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
