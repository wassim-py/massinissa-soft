import { prisma } from './lib/db';

async function main() {
  // Let's print each student and their exact marks in DB for both classes
  console.log('=== CLASS 56 (G1) ===');
  const g1Atts = await prisma.attendance.findMany({
    where: { lesson: { classId: 56 } },
    include: { student: true, lesson: true },
    orderBy: [{ student: { name: 'asc' } }, { lesson: { startsAt: 'asc' } }]
  });

  const studentsG1 = new Map<string, any[]>();
  for (const a of g1Atts) {
    const list = studentsG1.get(a.student.name) || [];
    list.push(a);
    studentsG1.set(a.student.name, list);
  }

  for (const [name, list] of studentsG1.entries()) {
    const p = list.filter(a => a.status === 'PRESENT').length;
    const ab = list.filter(a => a.status === 'ABSENT').length;
    console.log(`${name.padEnd(25)}: PRESENT=${p}, ABSENT=${ab}`);
  }

  console.log('\n=== CLASS 57 (G2) ===');
  const g2Atts = await prisma.attendance.findMany({
    where: { lesson: { classId: 57 } },
    include: { student: true, lesson: true },
    orderBy: [{ student: { name: 'asc' } }, { lesson: { startsAt: 'asc' } }]
  });

  const studentsG2 = new Map<string, any[]>();
  for (const a of g2Atts) {
    const list = studentsG2.get(a.student.name) || [];
    list.push(a);
    studentsG2.set(a.student.name, list);
  }

  for (const [name, list] of studentsG2.entries()) {
    const p = list.filter(a => a.status === 'PRESENT').length;
    const ab = list.filter(a => a.status === 'ABSENT').length;
    console.log(`${name.padEnd(25)}: PRESENT=${p}, ABSENT=${ab}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
