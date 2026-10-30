import { prisma } from './lib/db';

async function main() {
  // Let's print the attendance for each student in Class 56 lesson by lesson
  const lessons56 = await prisma.lesson.findMany({
    where: { classId: 56 },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true }
  });

  const students56 = await prisma.student.findMany({
    where: { enrollments: { some: { classId: 56 } } },
    include: {
      attendances: {
        where: { lesson: { classId: 56 } }
      }
    },
    orderBy: { name: 'asc' }
  });

  console.log('CLASS 56 - LESSON DATES:', lessons56.map(l => l.startsAt.toISOString().slice(5, 10)).join(' | '));
  for (const s of students56) {
    const marks = lessons56.map(l => {
      const a = s.attendances.find(att => att.lessonId === l.id);
      return a ? (a.status === 'PRESENT' ? 'X' : a.status === 'ABSENT' ? 'A' : '?') : '-';
    });
    const presentCount = marks.filter(m => m === 'X').length;
    console.log(`${s.name.padEnd(25)}: ${marks.join(' ')} => ${presentCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
