import { prisma } from './lib/db';

async function main() {
  const c96 = await prisma.class.findUnique({
    where: { id: 96 },
    include: { branch: true, teacher: true, level: true, enrollments: true }
  });
  console.log('Class 96:', JSON.stringify(c96, null, 2));

  const c43 = await prisma.class.findUnique({
    where: { id: 43 },
    include: { branch: true, teacher: true, level: true, enrollments: true }
  });
  console.log('Class 43:', JSON.stringify(c43, null, 2));
  const s = await prisma.student.findUnique({
    where: { id: 'f9b90971-7d84-47f5-9075-e9d610a71431' }
  });
  console.log('Student:', s);
}

main().finally(() => prisma.$disconnect());
