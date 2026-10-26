import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';
import { classifyStudentAttendanceHistory } from '../src/lib/studentBilling';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  const class6 = await prisma.class.findUnique({
    where: { id: 6 },
    include: {
      enrollments: {
        include: {
          transfersTo: true,
          transfersFrom: true,
          student: { select: { id: true, family: true, globalNumber: true, name: true } },
        },
      },
    },
  });

  const vouchers = await prisma.voucher.findMany({
    where: {
      OR: [{ classId: 6 }, { classId: null }],
      isVoided: false,
      isRefund: false,
      status: { not: "REFUNDED" },
      paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
      issuedAt: { lte: end },
    },
    include: { refunds: true },
  });

  const attendances = await prisma.attendance.findMany({
    where: { lesson: { classId: 6, startsAt: { lte: end } } },
    include: { student: true, lesson: true }
  });

  const lessons = await prisma.lesson.findMany({
    where: { classId: 6, startsAt: { lte: end } },
    orderBy: { startsAt: 'asc' }
  });

  // Check student 534 (Belkheiri Maroua) and 529 (Belkheiri Safaa)
  const student534 = class6?.enrollments.find(e => e.student.globalNumber === 534);
  const student529 = class6?.enrollments.find(e => e.student.globalNumber === 529);

  console.log('=== LESSON 532 DETAILED ATTENDEE EVALUATION ===');
  const lesson532 = lessons.find(l => l.id === 532);
  const atts532 = attendances.filter(a => a.lessonId === 532);

  // Let's inspect each student attending lesson 532
  for (const a of atts532) {
    const sid = a.studentId;
    const enr = class6?.enrollments.find(e => e.studentId === sid);
    const sAtts = attendances.filter(att => att.studentId === sid);

    const classifiedAtEnd = classifyStudentAttendanceHistory({
      lessons,
      attendances: sAtts,
      referenceDate: end,
      creditResetOffset: enr?.creditResetOffset || 0
    });

    const item = classifiedAtEnd.find(h => h.lessonId === 532);

    // Calculate allowed sessions for this student
    const studentVouchers = vouchers.filter((v: any) => {
      if (v.studentId !== sid) return false;
      if (v.classId && v.classId !== 6) return false;
      return new Date(v.issuedAt) <= end;
    });

    const cyclePrice = 10000;
    const fam = enr?.student?.family;
    const isSibling = Boolean(fam?.payerStudentId && fam.payerStudentId !== sid);
    const discount = isSibling ? Number(fam?.discountPercentage ?? 50) : 0;
    const effPrice = (cyclePrice / 4) * (1 - discount / 100);
    const totalTuition = studentVouchers.reduce((s, v) => s + Number(v.amount), 0);
    const purchased = Math.floor(totalTuition / effPrice);

    const consuming = classifiedAtEnd
      .filter((h) => h.classification === "PRESENT" || h.classification === "INTERLEAVED_ABSENCE")
      .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());

    const lessonIdx = consuming.findIndex(h => h.lessonId === 532);
    const isPaid = lessonIdx !== -1 && lessonIdx + 1 <= purchased;

    console.log(`Student #${enr?.student.globalNumber} ${enr?.student.name}:`);
    console.log(`  Tuition: ${totalTuition} DZD | effPrice: ${effPrice} | purchased: ${purchased} sessions`);
    console.log(`  Consuming count: ${consuming.length} | lessonIdx of 532: ${lessonIdx + 1}`);
    console.log(`  isPaid in 532: ${isPaid} | isTeacherPayable: ${item?.isTeacherPayable}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
