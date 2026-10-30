import { prisma } from './lib/db';

async function main() {
  const lessons57 = await prisma.lesson.findMany({
    where: { classId: 57 },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true }
  });

  const students57 = await prisma.student.findMany({
    where: { enrollments: { some: { classId: 57 } } },
    include: {
      attendances: {
        where: { lesson: { classId: 57 } }
      }
    },
    orderBy: { name: 'asc' }
  });

  console.log('CLASS 57 - LESSON DATES:', lessons57.map(l => l.startsAt.toISOString().slice(5, 10)).join(' | '));
  for (const s of students57) {
    const marks = lessons57.map(l => {
      const a = s.attendances.find(att => att.lessonId === l.id);
      return a ? (a.status === 'PRESENT' ? 'X' : a.status === 'ABSENT' ? 'A' : '?') : '-';
    });
    const presentCount = marks.filter(m => m === 'X').length;
    console.log(`${s.name.padEnd(25)}: ${marks.join(' ')} => ${presentCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
