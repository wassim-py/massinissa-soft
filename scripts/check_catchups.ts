import { prisma } from './lib/db';

async function main() {
  const cu460 = await prisma.catchUpAttendance.findMany({
    where: { catchUpLessonId: 460 },
    include: { student: true, missedLesson: { include: { class: true } } }
  });
  console.log(`Lesson 460 Catch-ups (${cu460.length}):`);
  for (const c of cu460) {
    console.log(`  ${c.student.name} (${c.studentId}): missedLessonId=${c.missedLessonId} (${c.missedLesson?.class.name})`);
  }

  // Also check all catch-ups for Class 56 and Class 57
  const allCatchUps = await prisma.catchUpAttendance.findMany({
    where: {
      OR: [
        { catchUpLesson: { classId: { in: [56, 57] } } },
        { missedLesson: { classId: { in: [56, 57] } } }
      ]
    },
    include: {
      student: true,
      catchUpLesson: { include: { class: true } },
      missedLesson: { include: { class: true } }
    }
  });

  console.log(`\nAll catch-ups involving 56/57: ${allCatchUps.length}`);
  for (const c of allCatchUps) {
    console.log(`CatchUp #${c.id} | Student: ${c.student.name} | Missed: Lesson #${c.missedLessonId} (${c.missedLesson?.class.name}, ${c.missedLesson?.startsAt.toISOString().slice(0, 10)}) -> Attended: Lesson #${c.catchUpLessonId} (${c.catchUpLesson?.class.name}, ${c.catchUpLesson?.startsAt.toISOString().slice(0, 10)})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
