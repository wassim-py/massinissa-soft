import { prisma } from './lib/db';

async function main() {
  const attendances = await prisma.attendance.findMany({
    where: { lesson: { classId: 56 }, status: 'PRESENT' },
    include: { student: true, lesson: true }
  });

  const students = new Map<string, { name: string, count: number, dates: string[] }>();
  for (const a of attendances) {
    const s = students.get(a.studentId) || { name: a.student.name, count: 0, dates: [] };
    s.count++;
    s.dates.push(a.lesson.startsAt.toISOString().slice(5, 10));
    students.set(a.studentId, s);
  }

  console.log(`Class 56 students in DB with presences (${students.size}):`);
  let total = 0;
  for (const [id, s] of students.entries()) {
    console.log(`${s.name.padEnd(25)}: ${s.count} (${s.dates.join(', ')})`);
    total += s.count;
  }
  console.log('Total presences in DB for Class 56:', total);
}

main().catch(console.error).finally(() => prisma.$disconnect());
