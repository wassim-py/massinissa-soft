import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  // Find students with name بلخيري
  const students = await prisma.student.findMany({
    where: { name: { contains: 'بلخيري' } },
    include: {
      family: {
        include: {
          students: true,
          payerStudent: true,
        }
      },
      enrollments: {
        include: {
          class: true,
        }
      },
      vouchers: true,
      attendances: {
        include: {
          lesson: { include: { class: true } }
        },
        orderBy: { lesson: { startsAt: 'asc' } }
      }
    }
  });

  console.log(`Found ${students.length} students with name بلخيري:`);
  for (const s of students) {
    console.log(`\n--- Student #${s.globalNumber} ${s.name} (ID: ${s.id}) ---`);
    console.log('Family:', s.family ? `ID: ${s.family.id}, Name: ${s.family.name}, discountPercentage: ${s.family.discountPercentage}, payerStudentId: ${s.family.payerStudentId}` : 'none');
    console.log('Enrollments:', s.enrollments.map(e => `${e.class.name} (id: ${e.classId}, status: ${e.status}, payerStatus: ${e.payerStatus}, offset: ${e.creditResetOffset})`));
    console.log('Vouchers:', s.vouchers.map(v => `${v.issuedAt.toISOString().slice(0, 10)} | ${v.amount} DZD | type: ${v.paymentType} | class: ${v.classId}`));
    console.log('Attendances in Hamoui:');
    for (const a of s.attendances.filter(att => att.lesson.class.teacherId === teacherId)) {
      console.log(`  ${a.lesson.startsAt.toISOString().slice(0, 10)} | ${a.lesson.class.name} | Lesson #${a.lesson.id} | Status: ${a.status}`);
    }
  }

  // Check calculateTeacherPayroll for حموي فوج خاص
  const payroll = await calculateTeacherPayroll(teacherId, start, end);
  const specialSessions = payroll?.sessionDetails.filter((s: any) => s.className.includes('خاص'));
  console.log('\n--- Payroll Sessions for حموي فوج خاص ---');
  for (const s of specialSessions || []) {
    console.log(`Lesson #${s.lessonId} | ${new Date(s.startsAt).toISOString().slice(0, 10)} | Paying: ${s.payingCount} | Retro: ${s.isRetroactive} | Note: ${s.retroactiveNote}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
