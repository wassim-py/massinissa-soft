import { prisma } from './lib/db';

async function main() {
  const g2Lessons = await prisma.lesson.findMany({
    where: { classId: 57 },
    include: {
      attendances: {
        include: { student: true }
      },
      catchUpVisitsHosted: {
        include: { student: true }
      }
    },
    orderBy: { startsAt: 'asc' }
  });

  console.log(`G2 has ${g2Lessons.length} lessons:`);
  for (const l of g2Lessons) {
    const present = l.attendances.filter(a => a.status === 'PRESENT');
    const absent = l.attendances.filter(a => a.status === 'ABSENT');
    const cu = l.catchUpVisitsHosted;
    console.log(`Lesson #${l.id} (${l.startsAt.toISOString().slice(0, 10)}): present=${present.length}, absent=${absent.length}, catchups=${cu.length}`);
    for (const p of present) {
      console.log(`   Present: ${p.student.name} (${p.student.globalNumber})`);
    }
    for (const c of cu) {
      console.log(`   CatchUp: ${c.student.name} (${c.student.globalNumber})`);
    }
    for (const a of absent) {
      console.log(`   Absent: ${a.student.name} (${a.student.globalNumber})`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
