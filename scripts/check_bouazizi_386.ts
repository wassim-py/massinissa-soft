import { prisma } from './lib/db';

async function main() {
  const l386 = await prisma.lesson.findUnique({
    where: { id: 386 },
    include: {
      attendances: {
        include: { student: true }
      }
    }
  });

  const bouazizi = l386?.attendances.find(a => a.student.name.includes('بوعزيزي'));
  console.log('Bouazizi in Lesson 386:', bouazizi ? `Found: ${bouazizi.status}` : 'NOT FOUND in Lesson 386 attendances');
}

main().catch(console.error).finally(() => prisma.$disconnect());
