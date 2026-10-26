import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  // Run payroll
  const payroll = await calculateTeacherPayroll(teacherId, start, end);
  const class6 = await prisma.class.findUnique({
    where: { id: 6 },
    include: {
      enrollments: { include: { student: { include: { family: true } } } },
      lessons: { where: { startsAt: { lte: end } }, orderBy: { startsAt: 'asc' } },
      vouchers: { where: { isVoided: false, isRefund: false } }
    }
  });

  const attendances = await prisma.attendance.findMany({
    where: { lesson: { classId: 6, startsAt: { lte: end } } },
    include: { student: { include: { family: true } }, lesson: true }
  });

  console.log('=== STUDENTS ATTENDING IN حموي فوج خاص ===');
  const specialLessons = payroll?.sessionDetails.filter((s: any) => s.className.includes('خاص'));

  for (const s of specialLessons || []) {
    console.log(`\n======================================================`);
    console.log(`Lesson #${s.lessonId} | Date: ${new Date(s.startsAt).toISOString().slice(0, 10)} | Total PayingCount: ${s.payingCount} | Retro: ${s.isRetroactive}`);
    console.log(`======================================================`);
    const atts = attendances.filter(a => a.lessonId === s.lessonId);
    for (const a of atts) {
      const fam = a.student.family;
      const isSibling = Boolean(fam?.payerStudentId && fam.payerStudentId !== a.student.id);
      const discount = isSibling ? Number(fam?.discountPercentage ?? 50) : 0;
      const weight = isSibling ? (1 - discount / 100) : 1;
      console.log(`  Student #${a.student.globalNumber} ${a.student.name} | Status: ${a.status} | isSibling: ${isSibling} (${weight})`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
