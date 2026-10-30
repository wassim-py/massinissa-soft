import { prisma } from './lib/db';

async function main() {
  const g1Lessons = await prisma.lesson.findMany({
    where: { classId: 56 },
    include: {
      attendances: {
        where: { status: 'PRESENT' },
        include: { student: true }
      }
    },
    orderBy: { startsAt: 'asc' }
  });

  const g2Lessons = await prisma.lesson.findMany({
    where: { classId: 57 },
    include: {
      attendances: {
        where: { status: 'PRESENT' },
        include: { student: true }
      },
      catchUpVisitsHosted: {
        include: { student: true }
      }
    },
    orderBy: { startsAt: 'asc' }
  });

  console.log('--- GROUP 1 (بوخزر BEM فوج 1) ---');
  let sumG1 = 0;
  for (const l of g1Lessons) {
    console.log(`Lesson #${l.id} (${l.startsAt.toISOString().slice(0, 10)}): ${l.attendances.length} present`);
    sumG1 += l.attendances.length;
  }
  console.log(`Total Group 1 = ${sumG1}`);

  console.log('\n--- GROUP 2 (بوخزر BEM فوج 2) ---');
  let sumG2 = 0;
  let sumG2WithCatchup = 0;
  for (const l of g2Lessons) {
    const regular = l.attendances.length;
    const cu = l.catchUpVisitsHosted.length;
    console.log(`Lesson #${l.id} (${l.startsAt.toISOString().slice(0, 10)}): ${regular} regular present ${cu > 0 ? `+ ${cu} catch-up (${l.catchUpVisitsHosted.map(c => c.student.name).join(', ')})` : ''}`);
    sumG2 += regular;
    sumG2WithCatchup += (regular + cu);
  }
  console.log(`Total Group 2 (regular) = ${sumG2}`);
  console.log(`Total Group 2 (with catch-ups) = ${sumG2WithCatchup}`);

  console.log(`\nGrand Totals:`);
  console.log(`G1 + G2 (regular) = ${sumG1 + sumG2} (= 183)`);
  console.log(`G1 + G2 (with catch-ups) = ${sumG1 + sumG2WithCatchup} (= 185)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
