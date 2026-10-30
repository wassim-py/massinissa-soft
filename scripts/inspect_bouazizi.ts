import { prisma } from './lib/db';

async function main() {
  const student = await prisma.student.findFirst({
    where: { name: { contains: 'بوعزيزي' } },
    include: {
      enrollments: {
        include: {
          class: true,
          transfersTo: true,
          transfersFrom: true
        }
      },
      attendances: {
        include: {
          lesson: {
            include: { class: true }
          }
        },
        orderBy: { lesson: { startsAt: 'asc' } }
      },
      vouchers: {
        include: { class: true }
      }
    }
  });

  console.log('Student:', student?.name, student?.id);
  console.log('Enrollments:');
  for (const e of student?.enrollments || []) {
    console.log(`  Class #${e.classId} (${e.class.name}) | status: ${e.status} | offset: ${e.creditResetOffset}`);
    for (const tt of e.transfersTo) {
      console.log(`    Transfer TO here: from enroll #${tt.fromEnrollmentId}, sessions: ${tt.transferredSessions}, date: ${tt.transferredAt.toISOString()}`);
    }
    for (const tf of e.transfersFrom) {
      console.log(`    Transfer FROM here: to enroll #${tf.toEnrollmentId}, sessions: ${tf.transferredSessions}, date: ${tf.transferredAt.toISOString()}`);
    }
  }

  console.log('Attendances:');
  for (const a of student?.attendances || []) {
    console.log(`  Lesson #${a.lessonId} (${a.lesson.class.name}, ${a.lesson.startsAt.toISOString().slice(0, 10)}): status=${a.status}`);
  }

  console.log('Vouchers:');
  for (const v of student?.vouchers || []) {
    console.log(`  Voucher #${v.id} (${v.class.name}, ${v.issuedAt.toISOString().slice(0, 10)}): amount=${v.amount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
