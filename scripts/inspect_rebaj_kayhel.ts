import { prisma } from './lib/db';

async function main() {
  const rebaj = await prisma.student.findFirst({
    where: { name: { contains: 'رباج' } },
    include: {
      enrollments: { include: { class: true } },
      attendances: { include: { lesson: true } },
      vouchers: true
    }
  });

  console.log('--- REBAJ AMIR ---');
  console.log('ID:', rebaj?.id, 'Name:', rebaj?.name);
  console.log('Enrollments:', rebaj?.enrollments.map(e => `${e.class.name} (${e.status})`));
  console.log('Attendances:', rebaj?.attendances.map(a => `Lesson #${a.lessonId} (${a.lesson.classId}) on ${a.lesson.startsAt.toISOString().slice(0, 10)}: ${a.status}`));
  console.log('Vouchers:', rebaj?.vouchers);

  const kayhel = await prisma.student.findFirst({
    where: { name: { contains: 'كيحل' } },
    include: {
      enrollments: { include: { class: true } },
      attendances: { include: { lesson: true } },
      vouchers: true
    }
  });

  console.log('\n--- KAYHEL ADAM ---');
  console.log('ID:', kayhel?.id, 'Name:', kayhel?.name);
  console.log('Enrollments:', kayhel?.enrollments.map(e => `${e.class.name} (${e.status})`));
  console.log('Attendances in 57:', kayhel?.attendances.filter(a => a.lesson.classId === 57).map(a => `Lesson #${a.lessonId} on ${a.lesson.startsAt.toISOString().slice(0, 10)}: ${a.status}`));
  console.log('Vouchers:', kayhel?.vouchers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
