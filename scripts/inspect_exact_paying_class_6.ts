import { prisma } from './lib/db';
import { classifyStudentAttendanceHistory } from '../src/lib/studentBilling';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const startDate = new Date(Date.UTC(2026, 9, 1));
  const endDate = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  const lessons = await prisma.lesson.findMany({
    where: {
      classId: 6,
      startsAt: { gte: startDate, lte: endDate },
      attendances: { some: {} }
    },
    include: {
      attendances: true,
      class: {
        include: {
          enrollments: {
            include: {
              student: { include: { family: true } },
              transfersTo: true,
              transfersFrom: true,
            }
          }
        }
      }
    },
    orderBy: { startsAt: 'asc' }
  });

  const allLessons = await prisma.lesson.findMany({
    where: { classId: 6, startsAt: { lte: endDate } },
    orderBy: { startsAt: 'asc' }
  });

  const allAttendances = await prisma.attendance.findMany({
    where: { lesson: { classId: 6, startsAt: { lte: endDate } } }
  });

  const vouchers = await prisma.voucher.findMany({
    where: {
      OR: [{ classId: 6 }, { classId: null }],
      isVoided: false,
      isRefund: false,
      status: { not: "REFUNDED" },
      paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
      issuedAt: { lte: endDate },
    },
    include: { refunds: true }
  });

  // Calculate coverage for all students in class 6
  const studentPaidSessionAtEnd = new Map<string, boolean>();
  const studentStatusAtEnd = new Map<string, any>();
  const classInfo = lessons[0].class;
  const studentIds = Array.from(new Set(allAttendances.map(a => a.studentId)));

  for (const sid of studentIds) {
    const sAtts = allAttendances.filter(a => a.studentId === sid);
    const enrollment = classInfo.enrollments.find(e => e.studentId === sid);
    const creditResetOffset = Number(enrollment?.creditResetOffset || 0);

    const classifiedAtEnd = classifyStudentAttendanceHistory({
      lessons: allLessons,
      attendances: sAtts,
      referenceDate: endDate,
      creditResetOffset,
    });
    classifiedAtEnd.forEach((item) => {
      studentStatusAtEnd.set(`${sid}_${item.lessonId}`, item);
    });

    // computeAllowedPaidSessions
    const cyclePrice = Number(classInfo.pricePerCycle || 0);
    const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
    const fam = enrollment?.student?.family;
    const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== sid);
    const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;
    const effectiveLessonPrice = siblingDiscountPct > 0 ? baseLessonPrice * (1 - siblingDiscountPct / 100) : baseLessonPrice;

    const studentVouchers = vouchers.filter((v: any) => {
      if (v.studentId !== sid) return false;
      if (v.classId && v.classId !== 6) return false;
      return new Date(v.issuedAt) <= endDate;
    });

    let totalPaidTuition = 0;
    studentVouchers.forEach((v: any) => {
      const vAmount = Number(v.amount || 0);
      const refundsSum = (v.refunds || [])
        .filter((r: any) => new Date(r.createdAt || r.date || v.issuedAt) <= endDate)
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      totalPaidTuition += Math.max(0, vAmount - refundsSum);
    });

    const purchasedSessions = effectiveLessonPrice > 0 ? Math.floor(totalPaidTuition / effectiveLessonPrice) : 0;
    const tIn = (enrollment?.transfersTo || []).reduce((s: number, t: any) => s + Number(t.transferredSessions || 0), 0);
    const tOut = (enrollment?.transfersFrom || []).reduce((s: number, t: any) => s + Number(t.transferredSessions || 0), 0);
    const allowedAtEnd = Math.max(0, purchasedSessions + tIn - tOut);

    const consumingLessonsAtEnd = classifiedAtEnd
      .filter((h) => h.classification === "PRESENT" || h.classification === "INTERLEAVED_ABSENCE")
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    consumingLessonsAtEnd.forEach((item, idx) => {
      studentPaidSessionAtEnd.set(`${sid}_${item.lessonId}`, idx + 1 <= allowedAtEnd);
    });
  }

  // Now evaluate each lesson in October
  for (const lesson of lessons) {
    console.log(`\n=============================================================`);
    console.log(`Lesson #${lesson.id} | Date: ${new Date(lesson.startsAt).toISOString().slice(0, 10)}`);
    console.log(`=============================================================`);
    let payingWeight = 0;
    const countedStudentIds = new Set<string>();

    lesson.attendances.forEach((att) => {
      if (countedStudentIds.has(att.studentId)) return;
      const enrollment = lesson.class?.enrollments?.find((e) => e.studentId === att.studentId);
      const classification = studentStatusAtEnd.get(`${att.studentId}_${lesson.id}`);
      const isSessionPaid = studentPaidSessionAtEnd.get(`${att.studentId}_${lesson.id}`) ?? false;

      const fam = enrollment?.student?.family;
      const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== att.studentId);
      const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;
      const weight = isSiblingDiscount ? (1 - siblingDiscountPct / 100) : 1;

      console.log(`  Student #${enrollment?.student.globalNumber} ${enrollment?.student.name}: Status=${att.status}, isPayable=${classification?.isTeacherPayable}, isSessionPaid=${isSessionPaid}, weight=${weight}`);

      if (classification && classification.isTeacherPayable && isSessionPaid) {
        countedStudentIds.add(att.studentId);
        payingWeight += weight;
      }
    });

    console.log(`--> TOTAL PAYING WEIGHT FOR LESSON #${lesson.id}: ${payingWeight}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
