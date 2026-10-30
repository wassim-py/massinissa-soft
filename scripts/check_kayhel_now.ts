import { prisma } from './lib/db';

async function main() {
  const kayhel = await prisma.student.findFirst({
    where: { name: { contains: 'كيحل ادم' } },
    include: {
      attendances: {
        include: { lesson: { include: { class: true } } },
        orderBy: { lesson: { startsAt: 'asc' } }
      },
      enrollments: {
        include: { class: true }
      },
      vouchers: {
        include: { class: true }
      }
    }
  });

  console.log('Student:', kayhel?.name, kayhel?.id);
  console.log('Enrollments:', kayhel?.enrollments.map(e => `${e.class.name} (${e.classId}) - status: ${e.status}, payerStatus: ${e.payerStatus}`));
  console.log('Attendances:');
  for (const a of kayhel?.attendances || []) {
    console.log(`  Attendance #${a.id} | Lesson #${a.lessonId} (${a.lesson.class.name}, ID: ${a.lesson.classId}) on ${a.lesson.startsAt.toISOString().slice(0, 10)}: status=${a.status}`);
  }
  console.log('Vouchers:');
  for (const v of kayhel?.vouchers || []) {
    console.log(`  Voucher #${v.id} (${v.class.name}, ID: ${v.classId}) on ${v.issuedAt.toISOString().slice(0, 10)}: amount=${v.amount}`);
  }

  // Also check Rebaj Amir
  const rebaj = await prisma.student.findFirst({
    where: { name: { contains: 'رباج' } },
    include: {
      attendances: {
        include: { lesson: { include: { class: true } } }
      },
      enrollments: {
        include: { class: true }
      },
      vouchers: {
        include: { class: true }
      }
    }
  });
  console.log('\n--- REBAJ AMIR ---');
  console.log('Enrollments:', rebaj?.enrollments.map(e => `${e.class.name} (${e.classId}) - status: ${e.status}, payerStatus: ${e.payerStatus}`));
  console.log('Attendances:');
  for (const a of rebaj?.attendances || []) {
    console.log(`  Attendance #${a.id} | Lesson #${a.lessonId} (${a.lesson.class.name}, ID: ${a.lesson.classId}) on ${a.lesson.startsAt.toISOString().slice(0, 10)}: status=${a.status}`);
  }
  console.log('Vouchers:', rebaj?.vouchers.map(v => `${v.class.name} (${v.classId}): ${v.amount}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
