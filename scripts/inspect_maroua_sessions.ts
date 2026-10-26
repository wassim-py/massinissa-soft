import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';
import { classifyStudentAttendanceHistory } from '../src/lib/studentBilling';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  const maroua = await prisma.student.findFirst({
    where: { globalNumber: 534 },
    include: {
      attendances: { where: { lesson: { classId: 6 } }, include: { lesson: true }, orderBy: { lesson: { startsAt: 'asc' } } },
      enrollments: { where: { classId: 6 }, include: { class: true } },
      vouchers: { where: { classId: 6 } }
    }
  });

  const lessons = await prisma.lesson.findMany({
    where: { classId: 6, startsAt: { lte: end } },
    orderBy: { startsAt: 'asc' }
  });

  const payroll = await calculateTeacherPayroll(teacherId, start, end);
  const class6Sessions = payroll?.sessionDetails.filter((s: any) => s.className.includes('خاص'));

  console.log('=== MAROUA ATTENDANCES AND PAYROLL STATUS ===');
  for (const s of class6Sessions || []) {
    // Check if maroua is in atts
    const att = maroua?.attendances.find(a => a.lessonId === s.lessonId);
    console.log(`Lesson #${s.lessonId} | Date: ${new Date(s.startsAt).toISOString().slice(0, 10)} | Maroua Att: ${att?.status || 'none'} | Total payingCount in lesson: ${s.payingCount} | Retro: ${s.isRetroactive}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
