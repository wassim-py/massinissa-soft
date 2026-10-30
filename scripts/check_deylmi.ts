import { prisma } from './lib/db';

async function main() {
  const att = await prisma.attendance.findFirst({
    where: {
      lessonId: 160,
      student: { name: { contains: 'ديلمي' } }
    },
    include: { student: true }
  });
  console.log('Deylmi in Lesson 160:', att?.status);
}

main().catch(console.error).finally(() => prisma.$disconnect());
