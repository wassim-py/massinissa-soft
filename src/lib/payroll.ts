import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeDateToStartOfDay, upsertDailyLedger } from "./ledger";
import { classifyStudentAttendanceHistory } from "./studentBilling";

export interface TeacherPayrollCalculation {
  teacherId: string;
  teacherName: string;
  totalSessions: number;
  totalPaidSessions?: number;
  totalFreeSessions?: number;
  teacherAbsencesCount?: number;
  absentSessions?: Array<{
    lessonId: number;
    startsAt: Date;
    className: string;
    branchName: string;
  }>;
  totalPresentAttendances?: number;
  percentageOfSessionFee?: number | null;
  grossAmount: number;
  salaryAdvances: number;
  photocopyDeductions: number;
  netAmount: number;
  totalTuitionGross?: number;
  schoolGrossAmount?: number;
  schoolNetAmount?: number;
  branchBreakdown: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    freeSessionsCount: number;
    effectiveRate: number;
    amount: number;
    tuitionAmount?: number;
    schoolAmount?: number;
  }>;
  branchSchoolBreakdown?: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    tuitionAmount: number;
    teacherAmount: number;
    schoolAmount: number;
  }>;
  groupBreakdown?: Array<{
    className: string;
    branchName: string;
    courseSessionsCount: number;
    payableLessonsCount: number;
    paidSessionsCount?: number;
    freeSessionsCount: number;
    totalSessionsCount: number;
    amount: number;
    tuitionGross?: number;
    schoolAmount?: number;
    appliedPercentage?: number;
  }>;
  sessionDetails?: Array<{
    lessonId: number;
    startsAt: Date;
    className: string;
    branchName: string;
    presentCount: number;
    payingCount?: number;
    pricePerCycle: number;
    sessionPrice: number;
    teacherCut: number;
    schoolCut?: number;
    appliedPercentage?: number;
    lessonAmount: number;
    isFree: boolean;
    isExtra: boolean;
    isCatchUp: boolean;
    isTeacherAbsent?: boolean;
    isRetroactive?: boolean;
    retroactiveNote?: string;
    isFormation?: boolean;
  }>;
  formationStudentBreakdown?: Array<{
    classId: number;
    className: string;
    studentId: string;
    studentName: string;
    cycleNumber: number;
    totalLevelPrice: number;
    totalPaidToDate: number;
    cycleRecognizedBase: number;
    teacherPercentage: number;
    teacherAmount: number;
    schoolAmount: number;
    status: "FULL" | "PARTIAL" | "UNPAID";
  }>;
  bookRevenue?: number;
  bookRevenueDetails?: Array<{
    voucherId: number;
    bookTitle?: string;
    studentName?: string;
    amount: number;
    date: Date;
    branchName?: string;
  }>;
  salaryAdvanceDetails: Array<{
    id: number;
    amount: number;
    date: Date;
  }>;
  photocopyChargeDetails: Array<{
    id: number;
    branchId: number;
    branchName: string;
    pages: number;
    costAmount: number;
    date: Date;
    recordedBy: string;
  }>;
}

/**
 * Normalizes end date to include the entire day up to 23:59:59.999 UTC
 */
export function normalizeDateToEndOfDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Calculates the total number of paid sessions covered by vouchers/transfers for a student in a class as of a reference date.
 */
function computeAllowedPaidSessions(
  studentId: string,
  classInfo: any,
  vouchers: any[],
  referenceDate: Date
): number {
  const enrollment = classInfo?.enrollments?.find((e: any) => e.studentId === studentId);
  if (!enrollment) return 0;
  const payerStatus = enrollment.payerStatus || "NORMAL";
  if (payerStatus === "NON_PAYER" || payerStatus === "SCHOOL_FEES_ONLY") return 0;

  const cyclePrice = Number(classInfo?.pricePerCycle || 0);
  const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
  if (baseLessonPrice <= 0) return 999;

  const fam = enrollment.student?.family;
  const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== studentId);
  const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;
  if (siblingDiscountPct >= 100) return 0;

  const effectiveLessonPrice = siblingDiscountPct > 0
    ? baseLessonPrice * (1 - siblingDiscountPct / 100)
    : baseLessonPrice;

  // Filter valid vouchers matching this student and class (or general tuition) issued on or before referenceDate
  const studentVouchers = vouchers.filter((v: any) => {
    if (v.studentId !== studentId) return false;
    if (v.classId && v.classId !== classInfo.id) return false;
    return new Date(v.issuedAt) <= referenceDate;
  });

  let totalPaidTuition = 0;
  studentVouchers.forEach((v: any) => {
    const vAmount = Number(v.amount || 0);
    const refundsSum = (v.refunds || [])
      .filter((r: any) => new Date(r.createdAt || r.date || v.issuedAt) <= referenceDate)
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    totalPaidTuition += Math.max(0, vAmount - refundsSum);
  });

  const purchasedSessions = effectiveLessonPrice > 0
    ? Math.floor(totalPaidTuition / effectiveLessonPrice)
    : 0;

  const tIn = (enrollment.transfersTo || [])
    .filter((t: any) => !t.transferredAt || new Date(t.transferredAt) <= referenceDate)
    .reduce((s: number, t: any) => s + Number(t.transferredSessions || 0), 0);

  const tOut = (enrollment.transfersFrom || [])
    .filter((t: any) => !t.transferredAt || new Date(t.transferredAt) <= referenceDate)
    .reduce((s: number, t: any) => s + Number(t.transferredSessions || 0), 0);

  // Note: creditResetOffset is student debt forgiveness/clearance, NOT tuition received by the school.
  // Therefore, teacher payable sessions must strictly reflect paid tuition and transfers (no offset).
  return Math.max(0, purchasedSessions + tIn - tOut);
}

/**
 * Calculates payroll for a single teacher over a date range.
 * Consumes Attendance records to find lessons that ACTUALLY HAPPENED (including isFree = true).
 * Applies branch override rates if configured, otherwise falls back to active TeacherPayRate.
 * Sums SalaryAdvances and PhotocopyCharges in the period.
 */
export async function calculateTeacherPayroll(
  teacherId: string,
  startDate: Date,
  endDate: Date
): Promise<TeacherPayrollCalculation | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      TeacherBranch: {
        include: { Branch: true },
      },
      TeacherPayRate: {
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      },
      teacherClassRates: true,
    },
  });

  if (!teacher) return null;

  // Active general pay rate effective on or before endDate
  const activePayRate = teacher.TeacherPayRate.find(
    (r) => new Date(r.effectiveFrom) <= endDate
  ) || teacher.TeacherPayRate[0];

  const defaultSessionRate = activePayRate?.ratePerSession
    ? Number(activePayRate.ratePerSession)
    : 0;
  const fixedMonthly = activePayRate?.fixedMonthly
    ? Number(activePayRate.fixedMonthly)
    : 0;
  const percentageOfSessionFee = activePayRate?.percentageOfSessionFee
    ? Number(activePayRate.percentageOfSessionFee)
    : null;

  // Map of branchId -> branch override rate
  const branchRateMap = new Map<number, number>();
  teacher.TeacherBranch.forEach((tb) => {
    if (tb.payRate !== null && tb.payRate !== undefined) {
      branchRateMap.set(tb.branchId, Number(tb.payRate));
    }
  });

  // Map of classId -> group-specific percentage override
  const classRateMap = new Map<number, number>();
  teacher.teacherClassRates?.forEach((tcr) => {
    if (tcr.percentage !== null && tcr.percentage !== undefined) {
      classRateMap.set(tcr.classId, Number(tcr.percentage));
    }
  });

  // Find all lessons in the period that ACTUALLY HAPPENED (have attendance) OR where teacher was marked absent
  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.id,
      startsAt: {
        gte: startDate,
        lte: endDate,
      },
      OR: [
        { attendances: { some: {} } },
        { isTeacherAbsent: true },
      ],
    },
    include: {
      branch: true,
      class: {
        include: {
          enrollments: {
            select: {
              studentId: true,
              payerStatus: true,
              student: {
                select: {
                  family: {
                    select: {
                      payerStudentId: true,
                      discountPercentage: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      attendances: true,
    },
    orderBy: { startsAt: "asc" },
  });

  // Get all unique class IDs taught by this teacher in or before this period to compute attendance histories
  const classIds = Array.from(new Set(lessons.map((l) => l.classId)));

  // For each class, fetch all historical non-free lessons and attendances up to endDate
  const classHistoryMap = new Map<
    number,
    {
      lessons: Array<{ id: number; startsAt: Date; isFree: boolean; isTeacherAbsent?: boolean }>;
      attendances: Array<{ lessonId: number; studentId: string; status: string }>;
      catchUps: Array<{ studentId: string; missedLessonId: number; recordedAt: Date }>;
      classInfo: any;
      vouchers: any[];
    }
  >();

  for (const cid of classIds) {
    const [cLessons, cAttendances, cCatchUps, cClass, cVouchers] = await Promise.all([
      prisma.lesson.findMany({
        where: {
          classId: cid,
          startsAt: { lte: endDate },
          OR: [
            { attendances: { some: {} } },
            { isTeacherAbsent: true },
          ],
        },
        select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.attendance.findMany({
        where: {
          lesson: { classId: cid, startsAt: { lte: endDate } },
        },
        select: { lessonId: true, studentId: true, status: true },
      }),
      prisma.catchUpAttendance.findMany({
        where: {
          missedLesson: { classId: cid },
          recordedAt: { lte: endDate },
        },
        select: { studentId: true, missedLessonId: true, recordedAt: true },
      }),
      prisma.class.findUnique({
        where: { id: cid },
        select: {
          id: true,
          name: true,
          pricePerCycle: true,
          isFormation: true,
          enrollments: {
            include: {
              transfersTo: true,
              transfersFrom: true,
              student: { select: { id: true, family: true } },
            },
          },
        },
      }),
      prisma.voucher.findMany({
        where: {
          OR: [{ classId: cid }, { classId: null }],
          isVoided: false,
          isRefund: false,
          status: { not: "REFUNDED" },
          paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
          issuedAt: { lte: endDate },
        },
        include: { refunds: true },
      }),
    ]);

    classHistoryMap.set(cid, {
      lessons: cLessons,
      attendances: cAttendances,
      catchUps: cCatchUps,
      classInfo: cClass,
      vouchers: cVouchers,
    });
  }

  // Pre-calculate classification and voucher-payment status for all students in all classes as of endDate and startDate
  // studentClassStatusAtEnd: Map<`${studentId}_${lessonId}`, StudentAttendanceHistoryItem>
  const studentStatusAtEnd = new Map<string, any>();
  const studentStatusAtStart = new Map<string, any>();
  const studentPaidSessionAtEnd = new Map<string, boolean>();
  const studentPaidSessionAtStart = new Map<string, boolean>();

  for (const [cid, historyData] of classHistoryMap.entries()) {
    const studentIds = Array.from(new Set(historyData.attendances.map((a: any) => a.studentId))) as string[];

    for (const sid of studentIds) {
      const studentAtts = historyData.attendances.filter((a: any) => a.studentId === sid);
      const studentCatchUps = historyData.catchUps.filter((c: any) => c.studentId === sid);
      const enrollment = historyData.classInfo?.enrollments?.find((e: any) => e.studentId === sid);
      const creditResetOffset = Number(enrollment?.creditResetOffset || 0);

      // Classification as of endDate
      const classifiedAtEnd = classifyStudentAttendanceHistory({
        lessons: historyData.lessons,
        attendances: studentAtts,
        catchUps: studentCatchUps,
        referenceDate: endDate,
        creditResetOffset,
      });
      classifiedAtEnd.forEach((item) => {
        studentStatusAtEnd.set(`${sid}_${item.lessonId}`, item);
      });

      // Calculate paid session coverage as of endDate
      const allowedAtEnd = computeAllowedPaidSessions(sid, historyData.classInfo, historyData.vouchers, endDate);
      const consumingLessonsAtEnd = classifiedAtEnd
        .filter((h) => h.classification === "PRESENT" || h.classification === "INTERLEAVED_ABSENCE")
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      consumingLessonsAtEnd.forEach((item, idx) => {
        studentPaidSessionAtEnd.set(`${sid}_${item.lessonId}`, idx + 1 <= allowedAtEnd);
      });

      // Classification & paid status as of startDate (for retroactive payouts)
      const priorLessons = historyData.lessons.filter((l: any) => new Date(l.startsAt) < startDate);
      if (priorLessons.length > 0) {
        const classifiedAtStart = classifyStudentAttendanceHistory({
          lessons: priorLessons,
          attendances: studentAtts.filter((a: any) => priorLessons.some((pl: any) => pl.id === a.lessonId)),
          catchUps: studentCatchUps.filter((c: any) => priorLessons.some((pl: any) => pl.id === c.missedLessonId)),
          referenceDate: startDate,
          creditResetOffset,
        });
        classifiedAtStart.forEach((item) => {
          studentStatusAtStart.set(`${sid}_${item.lessonId}`, item);
        });

        const allowedAtStart = computeAllowedPaidSessions(sid, historyData.classInfo, historyData.vouchers, startDate);
        const consumingLessonsAtStart = classifiedAtStart
          .filter((h) => h.classification === "PRESENT" || h.classification === "INTERLEAVED_ABSENCE")
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

        consumingLessonsAtStart.forEach((item, idx) => {
          studentPaidSessionAtStart.set(`${sid}_${item.lessonId}`, idx + 1 <= allowedAtStart);
        });
      }
    }
  }

  // Aggregate sessions by branch and compute earnings per §2.9 & §7.18
  const branchSessionsMap = new Map<
    number,
    {
      branchName: string;
      totalSessions: number;
      freeSessions: number;
      amount: number;
      totalTuition: number;
      schoolAmount: number;
      totalPresentAttendances: number;
    }
  >();

  // Initialize with all branches the teacher is associated with
  teacher.TeacherBranch.forEach((tb) => {
    branchSessionsMap.set(tb.branchId, {
      branchName: tb.Branch.name,
      totalSessions: 0,
      freeSessions: 0,
      amount: 0,
      totalTuition: 0,
      schoolAmount: 0,
      totalPresentAttendances: 0,
    });
  });

  // Fetch Catch-Up visitors hosted in any lesson taught by this teacher in this period (Rule 8)
  const lessonIds = lessons.map((l) => l.id);
  const catchUpVisitors = lessonIds.length > 0
    ? await prisma.catchUpAttendance.findMany({
        where: { catchUpLessonId: { in: lessonIds } },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              family: {
                select: {
                  payerStudentId: true,
                  discountPercentage: true,
                },
              },
              enrollments: {
                where: { class: { teacherId: teacher.id } },
                select: { payerStatus: true },
              },
            },
          },
        },
      })
    : [];

  // Fetch all non-voided BOOK vouchers issued during [startDate, endDate] for this teacher (100% Teacher Revenue)
  const bookVouchers = await prisma.voucher.findMany({
    where: {
      paymentType: "BOOK",
      isVoided: false,
      issuedAt: {
        gte: startDate,
        lte: endDate,
      },
      OR: [
        { class: { teacherId: teacher.id } },
        { classId: { in: classIds } },
      ],
    },
    include: {
      class: { select: { id: true, name: true, branchId: true, isFormation: true } },
      student: { select: { id: true, name: true } },
      refunds: true,
    },
  });

  let totalSessions = 0;
  let teacherAbsencesCount = 0;
  let totalPresentAttendances = 0;
  let calculatedGross = 0;
  let totalTuitionGross = 0;
  let schoolGrossAmount = 0;
  const sessionDetails: NonNullable<TeacherPayrollCalculation["sessionDetails"]> = [];
  const absentSessions: NonNullable<TeacherPayrollCalculation["absentSessions"]> = [];

  // 1. Process current period lessons
  lessons.forEach((lesson) => {
    // If teacher was marked absent, record in payroll as unpaid absent session (0 DZD)
    if (lesson.isTeacherAbsent) {
      teacherAbsencesCount += 1;
      absentSessions.push({
        lessonId: lesson.id,
        startsAt: lesson.startsAt,
        className: lesson.class?.name || "فوج",
        branchName: lesson.branch.name,
      });
      sessionDetails.push({
        lessonId: lesson.id,
        startsAt: lesson.startsAt,
        className: lesson.class?.name || "فوج",
        branchName: lesson.branch.name,
        presentCount: 0,
        payingCount: 0,
        pricePerCycle: lesson.class?.pricePerCycle ? Number(lesson.class.pricePerCycle) : 0,
        sessionPrice: 0,
        teacherCut: 0,
        schoolCut: 0,
        lessonAmount: 0,
        isFree: lesson.isFree,
        isExtra: lesson.isExtra,
        isCatchUp: lesson.isCatchUp,
        isTeacherAbsent: true,
      });
      return;
    }

    const existing = branchSessionsMap.get(lesson.branchId) || {
      branchName: lesson.branch.name,
      totalSessions: 0,
      freeSessions: 0,
      amount: 0,
      totalTuition: 0,
      schoolAmount: 0,
      totalPresentAttendances: 0,
    };
    existing.totalSessions += 1;
    totalSessions += 1;
    if (lesson.isFree) {
      existing.freeSessions += 1;
    }

    // Actual student attendance (PRESENT regular attendees + catch-up visitors hosted)
    const visitorStudentIds = new Set(
      catchUpVisitors.filter((cv) => cv.catchUpLessonId === lesson.id).map((cv) => cv.studentId)
    );
    const visitorsInLesson = catchUpVisitors.filter((cv) => cv.catchUpLessonId === lesson.id);

    // Regular present count excludes any student already counted as a catch-up visitor to prevent double counting
    const regularPresentStudentIds = new Set(
      lesson.attendances
        .filter((a) => a.status === "PRESENT" && !visitorStudentIds.has(a.studentId))
        .map((a) => a.studentId)
    );
    const regularPresentCount = regularPresentStudentIds.size;
    const visitorCount = visitorsInLesson.length;
    const presentCount = regularPresentCount + visitorCount;

    existing.totalPresentAttendances += presentCount;
    totalPresentAttendances += presentCount;

    // Formation groups: Attendance is recorded above, but teacher is paid on the formation level fee
    // split over 2 monthly payroll cycles (not per individual lesson session fee).
    if (lesson.class?.isFormation) {
      const pricePerCycle = lesson.class?.pricePerCycle ? Number(lesson.class.pricePerCycle) : 0;
      const appliedGroupPercentage = classRateMap.has(lesson.classId)
        ? classRateMap.get(lesson.classId)!
        : (percentageOfSessionFee ?? null);

      sessionDetails.push({
        lessonId: lesson.id,
        startsAt: lesson.startsAt,
        className: lesson.class?.name || "فوج",
        branchName: lesson.branch.name,
        presentCount,
        payingCount: 0,
        pricePerCycle,
        sessionPrice: 0,
        teacherCut: 0,
        schoolCut: 0,
        appliedPercentage: appliedGroupPercentage !== null ? appliedGroupPercentage : undefined,
        lessonAmount: 0,
        isFree: lesson.isFree,
        isExtra: lesson.isExtra,
        isCatchUp: lesson.isCatchUp,
        isFormation: true,
        retroactiveNote: "فوج تكويني (الاشتراك يُدفع بنظام الدورة الشهرية)",
      });
      return;
    }

    // Filter students whose payer status entitles teacher to payment:
    // Paying attendees include PRESENT + INTERLEAVED_ABSENCE
    // (Excludes NOT_DEFINED, PRE_START_ABSENCE, TRAILING_ABSENCE_HELD, and FORFEITED_DROPOUT)
    // Rule 1: Sibling discount is split proportionally (Option 2)
    // Rule 2: 100% waived sibling earns teacher 0 DZD
    // Rules 3 & 4: NON_PAYER and SCHOOL_FEES_ONLY earn teacher 0 DZD
    let payingWeight = 0;
    if (!lesson.isFree) {
      const countedPayingStudentIds = new Set<string>();

      lesson.attendances.forEach((att) => {
        // If this student is hosted as a visitor in this lesson, skip here (handled in visitorsInLesson)
        if (visitorStudentIds.has(att.studentId)) return;
        // Skip duplicate student attendance records to guarantee accurate calculation
        if (countedPayingStudentIds.has(att.studentId)) return;

        const enrollment = lesson.class?.enrollments?.find((e) => e.studentId === att.studentId);
        const payerStatus = enrollment?.payerStatus || "NORMAL";
        if (payerStatus === "NON_PAYER" || payerStatus === "SCHOOL_FEES_ONLY") return;

        const classification = studentStatusAtEnd.get(`${att.studentId}_${lesson.id}`);
        if (classification && classification.isTeacherPayable) {
          // Rule: Teacher is paid ONLY if student session is covered by paid tuition vouchers
          const isSessionPaid = studentPaidSessionAtEnd.get(`${att.studentId}_${lesson.id}`) ?? false;
          if (!isSessionPaid) {
            // Unpaid by student (debt): teacher receives 0 DZD for this session until settled
            return;
          }

          countedPayingStudentIds.add(att.studentId);
          const fam = enrollment?.student?.family;
          const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== att.studentId);
          const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;

          if (siblingDiscountPct >= 100) {
            // 100% waived sibling -> teacher earns 0 DZD (Rule 2)
            return;
          }
          if (siblingDiscountPct > 0) {
            // Proportional split (Rule 1 / Option 2)
            payingWeight += (1 - siblingDiscountPct / 100);
          } else {
            payingWeight += 1;
          }
        }
      });

      // Catch-up visitors hosted in this lesson are paid as PRESENT (Rule 8)
      visitorsInLesson.forEach((cv) => {
        if (countedPayingStudentIds.has(cv.studentId)) return;
        countedPayingStudentIds.add(cv.studentId);

        const vPayerStatus = cv.student?.enrollments?.[0]?.payerStatus || "NORMAL";
        if (vPayerStatus === "NON_PAYER" || vPayerStatus === "SCHOOL_FEES_ONLY") return;

        const fam = cv.student?.family;
        const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== cv.student.id);
        const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;

        if (siblingDiscountPct >= 100) return;
        if (siblingDiscountPct > 0) {
          payingWeight += (1 - siblingDiscountPct / 100);
        } else {
          payingWeight += 1;
        }
      });
    }

    let lessonAmount = 0;
    let effectiveRateForSession = 0;
    const pricePerCycle = lesson.class?.pricePerCycle ? Number(lesson.class.pricePerCycle) : 0;
    const sessionPrice = pricePerCycle > 0 ? pricePerCycle / 4 : 0;

    // Resolve group-specific percentage override or fall back to teacher overall percentage
    const appliedGroupPercentage = classRateMap.has(lesson.classId)
      ? classRateMap.get(lesson.classId)!
      : (percentageOfSessionFee ?? null);

    if (!lesson.isFree) {
      if (branchRateMap.has(lesson.branchId)) {
        effectiveRateForSession = branchRateMap.get(lesson.branchId)!;
        lessonAmount = effectiveRateForSession;
      } else if (appliedGroupPercentage !== null && appliedGroupPercentage > 0) {
        effectiveRateForSession = (sessionPrice * appliedGroupPercentage) / 100;
        lessonAmount = payingWeight * effectiveRateForSession;
      } else if (defaultSessionRate > 0) {
        effectiveRateForSession = defaultSessionRate;
        lessonAmount = defaultSessionRate;
      }
    }

    let lessonTuition = 0;
    let lessonSchoolCut = 0;
    if (!lesson.isFree) {
      lessonTuition = Math.round(payingWeight * sessionPrice * 100) / 100;
      lessonSchoolCut = Math.max(0, lessonTuition - lessonAmount);
    }
    totalTuitionGross += lessonTuition;
    schoolGrossAmount += lessonSchoolCut;

    existing.totalTuition = (existing.totalTuition || 0) + lessonTuition;
    existing.schoolAmount = (existing.schoolAmount || 0) + lessonSchoolCut;
    existing.amount += lessonAmount;
    calculatedGross += lessonAmount;
    branchSessionsMap.set(lesson.branchId, existing);

    sessionDetails.push({
      lessonId: lesson.id,
      startsAt: lesson.startsAt,
      className: lesson.class?.name || "فوج",
      branchName: lesson.branch.name,
      presentCount,
      payingCount: Math.round(payingWeight * 100) / 100,
      pricePerCycle,
      sessionPrice,
      teacherCut: effectiveRateForSession,
      schoolCut: lessonSchoolCut,
      appliedPercentage: appliedGroupPercentage !== null ? appliedGroupPercentage : undefined,
      lessonAmount,
      isFree: lesson.isFree,
      isExtra: lesson.isExtra,
      isCatchUp: lesson.isCatchUp,
    });
  });

  // Process 100% Teacher Book Revenue (Rule: 100% for the teacher, 0% school cut)
  let totalBookRevenue = 0;
  const bookRevenueDetails: NonNullable<TeacherPayrollCalculation["bookRevenueDetails"]> = [];

  bookVouchers.forEach((bv) => {
    // Formation groups books are 100% school part (0% teacher part, same as inscription fees)
    if (bv.class?.isFormation) {
      return;
    }
    const refunded = bv.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
    const netBookAmount = Math.max(0, Number(bv.amount) - refunded);
    if (netBookAmount > 0) {
      totalBookRevenue += netBookAmount;
      calculatedGross += netBookAmount;

      const targetBranchId = bv.targetBranchId || bv.class?.branchId || teacher.TeacherBranch[0]?.branchId || 1;
      const resolvedBranchName =
        branchSessionsMap.get(targetBranchId)?.branchName ||
        teacher.TeacherBranch.find((tb) => tb.branchId === targetBranchId)?.Branch.name ||
        bv.class?.name ||
        "Siège";

      const bEntry = branchSessionsMap.get(targetBranchId) || {
        branchName: resolvedBranchName,
        totalSessions: 0,
        freeSessions: 0,
        amount: 0,
        totalTuition: 0,
        schoolAmount: 0,
        totalPresentAttendances: 0,
      };
      bEntry.amount += netBookAmount;
      branchSessionsMap.set(targetBranchId, bEntry);

      bookRevenueDetails.push({
        voucherId: bv.id,
        bookTitle: bv.class?.name || "Livre",
        studentName: bv.student?.name || "Élève",
        amount: netBookAmount,
        date: bv.issuedAt,
        branchName: resolvedBranchName,
      });
    }
  });

  // 2. Retroactive catch-up payouts: Prior trailing absences that were held back,
  // but now validated because the student returned and attended during [startDate, endDate],
  // or late tuition settlements for the immediately preceding month.
  // Per requirement: Retroactive settlements are strictly limited to the last month only (e.g. for October payroll, September only).
  const sDate = new Date(startDate);
  const previousMonthStart = new Date(Date.UTC(sDate.getUTCFullYear(), sDate.getUTCMonth() - 1, 1, 0, 0, 0, 0));

  for (const [cid, historyData] of classHistoryMap.entries()) {
    // Skip formation classes; their payments are handled via the 2-month cycle formation engine below
    if (historyData.classInfo?.isFormation) continue;

    const priorLessons = historyData.lessons.filter((l) => {
      const lDate = new Date(l.startsAt);
      return lDate >= previousMonthStart && lDate < startDate && !l.isFree;
    });

    for (const pl of priorLessons) {
      const plAttendances = historyData.attendances.filter((a) => a.lessonId === pl.id);
      let eligiblePayingWeight = 0;
      let lateTuitionSettlementCount = 0;
      let resolvedAbsenceCount = 0;

      for (const att of plAttendances) {
        const atStart = studentStatusAtStart.get(`${att.studentId}_${pl.id}`);
        const atEnd = studentStatusAtEnd.get(`${att.studentId}_${pl.id}`);

        const wasPaidAtStart = studentPaidSessionAtStart.get(`${att.studentId}_${pl.id}`) ?? false;
        const isPaidAtEnd = studentPaidSessionAtEnd.get(`${att.studentId}_${pl.id}`) ?? false;

        // Condition A: Trailing absence held at start that became interleaved at end (and student has paid)
        const isResolvedAbsence =
          Boolean(atStart &&
          atStart.classification === "TRAILING_ABSENCE_HELD" &&
          atEnd &&
          atEnd.classification === "INTERLEAVED_ABSENCE" &&
          isPaidAtEnd);

        // Condition B: Attended session was held UNPAID at start, but student purchased voucher during [startDate, endDate]
        const isLateTuitionSettlement =
          Boolean(atEnd &&
          (atEnd.classification === "PRESENT" || atEnd.classification === "INTERLEAVED_ABSENCE") &&
          !wasPaidAtStart &&
          isPaidAtEnd);

        if (isResolvedAbsence || isLateTuitionSettlement) {
          // Check eligibility
          let isEligible = isLateTuitionSettlement;
          if (isResolvedAbsence) {
            isEligible = historyData.attendances.some((a: any) => {
              if (a.studentId !== att.studentId || a.status !== "PRESENT") return false;
              const l = historyData.lessons.find((les: any) => les.id === a.lessonId);
              if (!l) return false;
              const lDate = new Date(l.startsAt);
              return lDate >= startDate && lDate <= endDate;
            });
          }

          if (isEligible) {
            const enrollment = historyData.classInfo?.enrollments?.find(
              (e: any) => e.studentId === att.studentId
            );
            const pStatus = enrollment?.payerStatus || "NORMAL";
            if (pStatus !== "NON_PAYER" && pStatus !== "SCHOOL_FEES_ONLY") {
              const fam = enrollment?.student?.family;
              const isSiblingDiscount = Boolean(fam?.payerStudentId && fam.payerStudentId !== att.studentId);
              const siblingDiscountPct = isSiblingDiscount ? Number(fam?.discountPercentage ?? 50) : 0;
              if (siblingDiscountPct < 100) {
                const weight = siblingDiscountPct > 0 ? (1 - siblingDiscountPct / 100) : 1;
                eligiblePayingWeight += weight;
                if (isLateTuitionSettlement) lateTuitionSettlementCount++;
                if (isResolvedAbsence) resolvedAbsenceCount++;
              }
            }
          }
        }
      }

      if (eligiblePayingWeight > 0) {
        const lessonRecord = await prisma.lesson.findUnique({
          where: { id: pl.id },
          include: { branch: true, class: true },
        });
        if (lessonRecord) {
          const pricePerCycle = lessonRecord.class?.pricePerCycle
            ? Number(lessonRecord.class.pricePerCycle)
            : 0;
          const sessionPrice = pricePerCycle > 0 ? pricePerCycle / 4 : 0;
          const retroGroupPercentage = classRateMap.has(lessonRecord.classId)
            ? classRateMap.get(lessonRecord.classId)!
            : (percentageOfSessionFee ?? null);

          const teacherRatePerStudent =
            retroGroupPercentage !== null && retroGroupPercentage > 0
              ? (sessionPrice * retroGroupPercentage) / 100
              : defaultSessionRate;

          const totalTeacherCut = Math.round(eligiblePayingWeight * teacherRatePerStudent * 100) / 100;
          const totalRetroTuition = Math.round(eligiblePayingWeight * sessionPrice * 100) / 100;
          const totalRetroSchoolCut = Math.max(0, totalRetroTuition - totalTeacherCut);

          if (totalTeacherCut > 0) {
            totalTuitionGross += totalRetroTuition;
            schoolGrossAmount += totalRetroSchoolCut;
            calculatedGross += totalTeacherCut;

            const bEntry = branchSessionsMap.get(lessonRecord.branchId) || {
              branchName: lessonRecord.branch.name,
              totalSessions: 0,
              freeSessions: 0,
              amount: 0,
              totalTuition: 0,
              schoolAmount: 0,
              totalPresentAttendances: 0,
            };
            bEntry.amount += totalTeacherCut;
            bEntry.totalTuition = (bEntry.totalTuition || 0) + totalRetroTuition;
            bEntry.schoolAmount = (bEntry.schoolAmount || 0) + totalRetroSchoolCut;
            branchSessionsMap.set(lessonRecord.branchId, bEntry);

            const noteParts: string[] = [];
            if (lateTuitionSettlementCount > 0) {
              noteParts.push(`تسوية متأخرة لمستحقات (${Math.round(eligiblePayingWeight * 100) / 100}) تلميذ لشهر سابق`);
            }
            if (resolvedAbsenceCount > 0) {
              noteParts.push(`تسوية غياب سابق مؤكد (${resolvedAbsenceCount})`);
            }

            sessionDetails.push({
              lessonId: pl.id,
              startsAt: new Date(pl.startsAt),
              className: lessonRecord.class?.name || "فوج",
              branchName: lessonRecord.branch.name,
              presentCount: 0,
              payingCount: Math.round(eligiblePayingWeight * 100) / 100,
              pricePerCycle,
              sessionPrice,
              teacherCut: teacherRatePerStudent,
              schoolCut: totalRetroSchoolCut,
              appliedPercentage: retroGroupPercentage !== null ? retroGroupPercentage : undefined,
              lessonAmount: totalTeacherCut,
              isFree: false,
              isExtra: false,
              isCatchUp: false,
              isRetroactive: true,
              retroactiveNote: noteParts.join(" + ") || "تسوية متأخرة لمستحقات سابقة",
            });
          }
        }
      }
    }
  }

  // 3. Process Formation Groups Teacher Payments (2-Month Cycle Split: 50% Cycle 1 / Remaining Cycle 2)
  // Per requirement: Formation books are 100% school revenue. The teacher is paid ONLY on the formation level fee
  // according to their configured percentage (TeacherClassRate or TeacherPayRate), split across 2 monthly payroll cycles.
  const formationStudentBreakdown: NonNullable<TeacherPayrollCalculation["formationStudentBreakdown"]> = [];
  const formationGroupSummaries: Array<{
    classId: number;
    className: string;
    branchId: number;
    branchName: string;
    courseSessionsCount: number;
    payingCount: number;
    teacherAmount: number;
    tuitionGross: number;
    schoolAmount: number;
    appliedPercentage: number;
    cycleNumber: number;
  }> = [];

  // Find all formation classes taught by this teacher or with lessons taught by this teacher
  const formationClasses = await prisma.class.findMany({
    where: {
      isFormation: true,
      OR: [
        { teacherId: teacher.id },
        { id: { in: classIds } },
      ],
    },
    include: {
      FormationLevel: true,
      branch: true,
      enrollments: {
        include: {
          student: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (formationClasses.length > 0) {
    const formationClassIds = formationClasses.map((fc) => fc.id);
    const [allFormationLessons, allFormationVouchers] = await Promise.all([
      prisma.lesson.findMany({
        where: { classId: { in: formationClassIds } },
        select: { id: true, classId: true, startsAt: true, isTeacherAbsent: true, isFree: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.voucher.findMany({
        where: {
          classId: { in: formationClassIds },
          paymentType: "FORMATION",
          isVoided: false,
          isRefund: false,
          status: { not: "REFUNDED" },
          issuedAt: { lte: endDate },
        },
        include: { refunds: true },
        orderBy: { issuedAt: "asc" },
      }),
    ]);

    for (const fClass of formationClasses) {
      const classLessons = allFormationLessons.filter((l) => l.classId === fClass.id);
      const firstLesson = classLessons[0];
      const classVouchers = allFormationVouchers.filter((v) => v.classId === fClass.id);

      // Determine group start date (earliest lesson startsAt, or earliest voucher, or fallback to current period startDate)
      let classStartDate: Date;
      if (firstLesson) {
        classStartDate = new Date(firstLesson.startsAt);
      } else if (classVouchers.length > 0) {
        classStartDate = new Date(classVouchers[0].issuedAt);
      } else {
        classStartDate = new Date(startDate);
      }

      // Calculate calendar month difference between group start date and current payroll period start
      const startYear = classStartDate.getUTCFullYear();
      const startMonth = classStartDate.getUTCMonth();
      const currentYear = startDate.getUTCFullYear();
      const currentMonth = startDate.getUTCMonth();
      const monthDiff = (currentYear - startYear) * 12 + (currentMonth - startMonth);

      // If this group starts in a future month relative to this payroll period, do not recognize payments yet
      if (monthDiff < 0) {
        continue;
      }

      const levelPrice = Number(fClass.FormationLevel?.lumpSumPrice ?? fClass.pricePerCycle ?? 4000);
      const halfPriceCap = levelPrice > 0 ? levelPrice / 2 : 2000;

      // Group percentage override or teacher default percentage
      const appliedGroupPercentage = classRateMap.has(fClass.id)
        ? classRateMap.get(fClass.id)!
        : (percentageOfSessionFee ?? null);
      const teacherRatePct = appliedGroupPercentage !== null && appliedGroupPercentage > 0
        ? appliedGroupPercentage
        : 0;

      let classTuitionGross = 0;
      let classTeacherGross = 0;
      let classSchoolGross = 0;
      let compensatedStudentsCount = 0;

      // Lessons of this formation class in this period
      const formationLessonsInPeriod = classLessons.filter((l) => {
        const d = new Date(l.startsAt);
        return d >= startDate && d <= endDate;
      });

      for (const enr of fClass.enrollments) {
        const pStatus = enr.payerStatus || "NORMAL";
        if (pStatus === "NON_PAYER" || pStatus === "SCHOOL_FEES_ONLY") {
          continue;
        }

        const studentVouchers = classVouchers.filter((v) => v.studentId === enr.studentId);
        let totalPaidToEnd = 0;
        let totalPaidToStart = 0;

        studentVouchers.forEach((v) => {
          const vAmount = Number(v.amount || 0);
          const refunded = (v.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0);
          const netPaid = Math.max(0, vAmount - refunded);

          if (new Date(v.issuedAt) <= endDate) {
            totalPaidToEnd += netPaid;
          }
          if (new Date(v.issuedAt) < startDate) {
            totalPaidToStart += netPaid;
          }
        });

        let cycleRecognizedBase = 0;

        if (monthDiff === 0) {
          // Month 1 (First Cycle): Capped at 50% of the level fee (e.g. max 2000 DZD out of 4000 DZD)
          cycleRecognizedBase = Math.min(totalPaidToEnd, halfPriceCap);
        } else if (monthDiff === 1) {
          // Month 2 (Second Cycle): Recognized base is what remains of total payment up to levelPrice
          const base1 = Math.min(totalPaidToStart, halfPriceCap);
          cycleRecognizedBase = Math.max(0, Math.min(totalPaidToEnd - base1, levelPrice - base1));
        } else {
          // Month 3+ (Post-Cycle settlements): Any delayed payments above prior recognized base
          const priorRecognized = Math.min(totalPaidToStart, levelPrice);
          cycleRecognizedBase = Math.max(0, Math.min(totalPaidToEnd - priorRecognized, levelPrice - priorRecognized));
        }

        const studentTeacherCut = Math.round(((cycleRecognizedBase * teacherRatePct) / 100) * 100) / 100;
        const studentSchoolCut = Math.max(0, Math.round((cycleRecognizedBase - studentTeacherCut) * 100) / 100);

        if (cycleRecognizedBase > 0) {
          compensatedStudentsCount += 1;
        }

        classTuitionGross += cycleRecognizedBase;
        classTeacherGross += studentTeacherCut;
        classSchoolGross += studentSchoolCut;

        formationStudentBreakdown.push({
          classId: fClass.id,
          className: fClass.name,
          studentId: enr.student.id,
          studentName: enr.student.name,
          cycleNumber: monthDiff <= 0 ? 1 : 2,
          totalLevelPrice: levelPrice,
          totalPaidToDate: totalPaidToEnd,
          cycleRecognizedBase,
          teacherPercentage: teacherRatePct,
          teacherAmount: studentTeacherCut,
          schoolAmount: studentSchoolCut,
          status: totalPaidToEnd >= levelPrice ? "FULL" : totalPaidToEnd > 0 ? "PARTIAL" : "UNPAID",
        });
      }

      classTuitionGross = Math.round(classTuitionGross * 100) / 100;
      classTeacherGross = Math.round(classTeacherGross * 100) / 100;
      classSchoolGross = Math.round(classSchoolGross * 100) / 100;

      formationGroupSummaries.push({
        classId: fClass.id,
        className: fClass.name,
        branchId: fClass.branchId,
        branchName: fClass.branch.name,
        courseSessionsCount: formationLessonsInPeriod.length,
        payingCount: compensatedStudentsCount,
        teacherAmount: classTeacherGross,
        tuitionGross: classTuitionGross,
        schoolAmount: classSchoolGross,
        appliedPercentage: teacherRatePct,
        cycleNumber: monthDiff <= 0 ? 1 : 2,
      });

      // Update gross totals
      calculatedGross += classTeacherGross;
      totalTuitionGross += classTuitionGross;
      schoolGrossAmount += classSchoolGross;

      // Update branch totals
      const bEntry = branchSessionsMap.get(fClass.branchId) || {
        branchName: fClass.branch.name,
        totalSessions: 0,
        freeSessions: 0,
        amount: 0,
        totalTuition: 0,
        schoolAmount: 0,
        totalPresentAttendances: 0,
      };
      bEntry.amount += classTeacherGross;
      bEntry.totalTuition = (bEntry.totalTuition || 0) + classTuitionGross;
      bEntry.schoolAmount = (bEntry.schoolAmount || 0) + classSchoolGross;
      branchSessionsMap.set(fClass.branchId, bEntry);
    }
  }

  const branchBreakdown: TeacherPayrollCalculation["branchBreakdown"] = [];

  for (const [branchId, data] of branchSessionsMap.entries()) {
    // Only include branches where lessons occurred, unless fixedMonthly applies and no lessons occurred anywhere
    if (data.totalSessions === 0 && fixedMonthly === 0) continue;

    const effectiveRate = branchRateMap.has(branchId)
      ? branchRateMap.get(branchId)!
      : (percentageOfSessionFee !== null && percentageOfSessionFee > 0)
        ? (data.totalSessions > 0 ? data.amount / data.totalSessions : 0)
        : defaultSessionRate;

    branchBreakdown.push({
      branchId,
      branchName: data.branchName,
      sessionsCount: data.totalSessions,
      freeSessionsCount: data.freeSessions,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      amount: Math.round(data.amount * 100) / 100,
      tuitionAmount: Math.round((data.totalTuition || 0) * 100) / 100,
      schoolAmount: Math.round((data.schoolAmount || 0) * 100) / 100,
    });
  }

  // If teacher is on fixedMonthly and no per-session rate is used, or fixed monthly base
  let grossAmount = Math.round(calculatedGross * 100) / 100;
  if (fixedMonthly > 0) {
    grossAmount = fixedMonthly;
    schoolGrossAmount = Math.max(0, totalTuitionGross - fixedMonthly);
    // Distribute informational branch breakdown proportionally if lessons occurred
    if (totalSessions > 0) {
      branchBreakdown.forEach((b) => {
        b.amount = Math.round((b.sessionsCount / totalSessions) * fixedMonthly * 100) / 100;
        b.schoolAmount = Math.max(0, (b.tuitionAmount || 0) - b.amount);
      });
    } else if (branchBreakdown.length > 0) {
      // Split evenly across assigned branches if no sessions
      const splitAmount = Math.round((fixedMonthly / branchBreakdown.length) * 100) / 100;
      branchBreakdown.forEach((b) => {
        b.amount = splitAmount;
        b.schoolAmount = Math.max(0, (b.tuitionAmount || 0) - splitAmount);
      });
    }
  } else {
    // schoolGrossAmount was accumulated per-lesson respecting individual group percentage variants.
    // If book sales occurred, grossAmount includes book revenue (100% teacher), which must NOT reduce tuition schoolGrossAmount.
    schoolGrossAmount = Math.round(schoolGrossAmount * 100) / 100;
  }

  // Fetch Salary Advances within or up to this period
  const salaryAdvancesList = await prisma.salaryAdvance.findMany({
    where: {
      personId: teacher.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: "asc" },
  });

  const totalAdvances = salaryAdvancesList.reduce(
    (sum, a) => sum + Number(a.amount),
    0
  );

  // Fetch Photocopy Charges for this teacher in this period (§2.5)
  const photocopyChargesList = await prisma.photocopyCharge.findMany({
    where: {
      teacherId: teacher.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      Branch: true,
    },
    orderBy: { date: "asc" },
  });

  const totalPhotocopyDeductions = photocopyChargesList.reduce(
    (sum, c) => sum + Number(c.costAmount),
    0
  );

  const netAmount = Math.max(0, grossAmount - totalAdvances - totalPhotocopyDeductions);
  const schoolNetAmount = Math.round((schoolGrossAmount + totalPhotocopyDeductions) * 100) / 100;

  const totalFreeSessions = sessionDetails.filter((s) => s.isFree && !s.isTeacherAbsent && !s.isRetroactive).length;
  const totalPaidSessions = sessionDetails.filter((s) => !s.isFree && !s.isTeacherAbsent && !s.isRetroactive).length;

  const groupBreakdownMap = new Map<
    string,
    {
      className: string;
      branchName: string;
      courseSessionsCount: number;
      payableLessonsCount: number;
      paidSessionsCount: number;
      freeSessionsCount: number;
      totalSessionsCount: number;
      amount: number;
      tuitionGross: number;
      schoolAmount: number;
      appliedPercentage?: number;
    }
  >();

  sessionDetails.forEach((s) => {
    if (s.isTeacherAbsent) return;
    const key = `${s.className}___${s.branchName}`;
    const g = groupBreakdownMap.get(key) || {
      className: s.className,
      branchName: s.branchName,
      courseSessionsCount: 0,
      payableLessonsCount: 0,
      paidSessionsCount: 0,
      freeSessionsCount: 0,
      totalSessionsCount: 0,
      amount: 0,
      tuitionGross: 0,
      schoolAmount: 0,
      appliedPercentage: s.appliedPercentage,
    };

    if (s.appliedPercentage !== undefined) {
      g.appliedPercentage = s.appliedPercentage;
    }

    if (s.isFormation) {
      // Formation session: track session counts only (amounts are computed at the group level below)
      g.totalSessionsCount += 1;
      if (s.isFree) {
        g.freeSessionsCount += 1;
      } else {
        g.courseSessionsCount += 1;
      }
      groupBreakdownMap.set(key, g);
      return;
    }

    if (s.isRetroactive) {
      // Retroactive settlements are adjustments for prior periods; do NOT count them as separated lessons in this period
      const payingCountForLesson = Number(s.payingCount ?? 1);
      const retroTuition = Math.round(payingCountForLesson * s.sessionPrice * 100) / 100;
      const retroTeacherCut = Number(s.lessonAmount || 0);
      const retroSchoolCut = s.schoolCut ?? Math.max(0, retroTuition - retroTeacherCut);

      g.payableLessonsCount += payingCountForLesson;
      g.paidSessionsCount = g.payableLessonsCount;
      g.amount += retroTeacherCut;
      g.tuitionGross += retroTuition;
      g.schoolAmount += retroSchoolCut;
    } else {
      g.totalSessionsCount += 1;
      if (s.isFree) {
        g.freeSessionsCount += 1;
      } else {
        g.courseSessionsCount += 1;
        const payingCountForLesson = Number(s.payingCount ?? s.presentCount ?? 1);
        const lessonTuition = Math.round(payingCountForLesson * s.sessionPrice * 100) / 100;
        const lessonTeacherCut = Number(s.lessonAmount || 0);
        const lessonSchoolCut = s.schoolCut ?? Math.max(0, lessonTuition - lessonTeacherCut);

        g.payableLessonsCount += payingCountForLesson;
        g.paidSessionsCount = g.payableLessonsCount;
        g.amount += lessonTeacherCut;
        g.tuitionGross += lessonTuition;
        g.schoolAmount += lessonSchoolCut;
      }
    }
    groupBreakdownMap.set(key, g);
  });

  // Apply formation group summaries into groupBreakdownMap
  formationGroupSummaries.forEach((fSum) => {
    const key = `${fSum.className}___${fSum.branchName}`;
    const g = groupBreakdownMap.get(key) || {
      className: fSum.className,
      branchName: fSum.branchName,
      courseSessionsCount: fSum.courseSessionsCount,
      payableLessonsCount: 0,
      paidSessionsCount: 0,
      freeSessionsCount: 0,
      totalSessionsCount: fSum.courseSessionsCount,
      amount: 0,
      tuitionGross: 0,
      schoolAmount: 0,
      appliedPercentage: fSum.appliedPercentage,
    };
    g.payableLessonsCount = fSum.payingCount;
    g.paidSessionsCount = fSum.payingCount;
    g.amount = fSum.teacherAmount;
    g.tuitionGross = fSum.tuitionGross;
    g.schoolAmount = fSum.schoolAmount;
    g.appliedPercentage = fSum.appliedPercentage;
    groupBreakdownMap.set(key, g);
  });

  const groupBreakdown = Array.from(groupBreakdownMap.values()).map((g) => ({
    ...g,
    payableLessonsCount: Math.round(g.payableLessonsCount * 100) / 100,
    paidSessionsCount: Math.round(g.payableLessonsCount * 100) / 100,
    amount: Math.round(g.amount * 100) / 100,
    tuitionGross: Math.round(g.tuitionGross * 100) / 100,
    schoolAmount: Math.round(g.schoolAmount * 100) / 100,
  })).sort((a, b) => a.className.localeCompare(b.className));

  const branchSchoolBreakdown: NonNullable<TeacherPayrollCalculation["branchSchoolBreakdown"]> = branchBreakdown.map((b) => ({
    branchId: b.branchId,
    branchName: b.branchName,
    sessionsCount: b.sessionsCount,
    tuitionAmount: b.tuitionAmount ?? 0,
    teacherAmount: b.amount,
    schoolAmount: b.schoolAmount ?? Math.max(0, (b.tuitionAmount ?? 0) - b.amount),
  }));

  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    totalSessions,
    totalPaidSessions,
    totalFreeSessions,
    groupBreakdown,
    teacherAbsencesCount,
    absentSessions,
    totalPresentAttendances,
    percentageOfSessionFee,
    sessionDetails,
    formationStudentBreakdown,
    grossAmount,
    salaryAdvances: totalAdvances,
    photocopyDeductions: totalPhotocopyDeductions,
    netAmount,
    totalTuitionGross: Math.round(totalTuitionGross * 100) / 100,
    schoolGrossAmount: Math.round(schoolGrossAmount * 100) / 100,
    schoolNetAmount,
    branchBreakdown,
    branchSchoolBreakdown,
    salaryAdvanceDetails: salaryAdvancesList.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      date: a.date,
    })),
    photocopyChargeDetails: photocopyChargesList.map((c) => ({
      id: c.id,
      branchId: c.branchId,
      branchName: c.Branch.name,
      pages: c.pages,
      costAmount: Number(c.costAmount),
      date: c.date,
      recordedBy: c.recordedBy,
    })),
    bookRevenue: totalBookRevenue,
    bookRevenueDetails,
  };
}

/**
 * Generates a complete PayrollRun across all teachers for a given period.
 * Creates ONE consolidated Payslip per teacher across all branches,
 * populated with informational PayslipBranchLine breakdown items.
 */
export async function generatePayrollRun(
  periodStart: Date | string,
  periodEnd: Date | string,
  targetTeacherId?: string
) {
  const startDate = normalizeDateToStartOfDay(periodStart);
  const endDate = normalizeDateToEndOfDay(periodEnd);

  // Get teachers (filtered if single teacher targeted)
  const teachers = await prisma.teacher.findMany({
    where: targetTeacherId ? { id: targetTeacherId } : undefined,
    select: { id: true, name: true },
  });

  const teacherCalculations: TeacherPayrollCalculation[] = [];

  for (const t of teachers) {
    const calc = await calculateTeacherPayroll(t.id, startDate, endDate);
    // Only include teachers who taught lessons, had absences, have fixed salary, or have deductions
    // If targetTeacherId is provided, always include the calculation
    if (
      calc &&
      (targetTeacherId ||
        calc.totalSessions > 0 ||
        (calc.teacherAbsencesCount && calc.teacherAbsencesCount > 0) ||
        calc.grossAmount > 0 ||
        calc.salaryAdvances > 0 ||
        calc.photocopyDeductions > 0)
    ) {
      teacherCalculations.push(calc);
    }
  }

  // Pre-calculate Real Net elements only for global runs (when !targetTeacherId)
  let totalRevenue = 0;
  let totalDailyExpenses = 0;
  let totalTeacherGrossPayroll = 0;
  let totalStaffPayroll = 0;
  let realNet = 0;
  let revenueEntries: any[] = [];
  let dailyExpenses: any[] = [];
  let staffPayrolls: any[] = [];
  let branches: { id: number }[] = [];

  if (!targetTeacherId) {
    // 1. Revenue
    revenueEntries = await prisma.dailyLedger.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        type: { not: "PAYROLL_OUT" },
      },
      include: { Branch: true },
    });
    totalRevenue = revenueEntries.reduce((sum, e) => sum + Number(e.amount), 0);

    // 2. Outcomes / Daily Expenses
    dailyExpenses = await prisma.dailyExpense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      include: { branch: true },
    });
    totalDailyExpenses = dailyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // 3. Teachers Payroll Total Gross
    totalTeacherGrossPayroll = teacherCalculations.reduce((sum, c) => sum + c.grossAmount, 0);

    // 4. Staffs Payroll
    staffPayrolls = await prisma.staffPayroll.findMany({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: "PAID",
      },
      include: { staffMember: { include: { branch: true } } },
    });
    totalStaffPayroll = staffPayrolls.reduce(
      (sum, s) => sum + Number(s.amount) + Number((s as any).bonus || 0),
      0
    );

    // 5. Real Net = Revenue - Outcomes - Teachers Payroll - Staffs Payrolls
    realNet = totalRevenue - totalDailyExpenses - totalTeacherGrossPayroll - totalStaffPayroll;

    // Branches pre-fetched outside transaction
    branches = await prisma.branch.findMany({ select: { id: true } });
  }

  // Atomically create the PayrollRun and all generated payroll parts:
  // Part 1: Teachers Payroll (personType: "TEACHER")
  // Part 2: School Part with Teachers Payroll (personType: "SCHOOL_SHARE")
  // Part 3: Real Net Payroll (personType: "REAL_NET") - only when !targetTeacherId
  return await prisma.$transaction(
    async (tx) => {
      const payrollRun = await tx.payrollRun.create({
        data: {
          periodStart: startDate,
          periodEnd: endDate,
          status: "DRAFT",
        },
      });

      // --- PART 1: TEACHERS PAYROLL ---
      for (const calc of teacherCalculations) {
        const branchLinesData = calc.branchBreakdown
          .filter((line) => line.sessionsCount > 0 || line.amount > 0)
          .map((line) => ({
            branchId: line.branchId,
            sessionsCount: line.sessionsCount,
            amount: new Prisma.Decimal(line.amount),
          }));

        await tx.payslip.create({
          data: {
            payrollRunId: payrollRun.id,
            personId: calc.teacherId,
            personType: "TEACHER",
            sessionsCount: calc.totalSessions,
            grossAmount: new Prisma.Decimal(calc.grossAmount),
            advances: new Prisma.Decimal(calc.salaryAdvances),
            photocopyDeductions: new Prisma.Decimal(calc.photocopyDeductions),
            netAmount: new Prisma.Decimal(calc.netAmount),
            ...(branchLinesData.length > 0 && {
              PayslipBranchLine: {
                create: branchLinesData,
              },
            }),
          },
        });
      }

      // --- PART 2: SCHOOL PART WITH TEACHERS PAYROLL ---
      for (const calc of teacherCalculations) {
        const schoolGross = calc.schoolGrossAmount ?? Math.max(0, (calc.totalTuitionGross ?? 0) - (calc.grossAmount - (calc.bookRevenue || 0)));
        const schoolNet = calc.schoolNetAmount ?? (schoolGross + calc.photocopyDeductions);

        const schoolBranchLines = calc.branchSchoolBreakdown || calc.branchBreakdown.map((b) => ({
          branchId: b.branchId,
          sessionsCount: b.sessionsCount,
          schoolAmount: b.schoolAmount ?? Math.max(0, (b.tuitionAmount ?? 0) - b.amount),
        }));

        const schoolBranchLinesData = schoolBranchLines
          .filter((bLine) => bLine.sessionsCount > 0 || (bLine.schoolAmount && bLine.schoolAmount > 0))
          .map((bLine) => ({
            branchId: bLine.branchId,
            sessionsCount: bLine.sessionsCount,
            amount: new Prisma.Decimal(bLine.schoolAmount || 0),
          }));

        await tx.payslip.create({
          data: {
            payrollRunId: payrollRun.id,
            personId: calc.teacherId,
            personType: "SCHOOL_SHARE",
            sessionsCount: calc.totalSessions,
            grossAmount: new Prisma.Decimal(schoolGross),
            advances: new Prisma.Decimal(0),
            photocopyDeductions: new Prisma.Decimal(calc.photocopyDeductions),
            netAmount: new Prisma.Decimal(schoolNet),
            ...(schoolBranchLinesData.length > 0 && {
              PayslipBranchLine: {
                create: schoolBranchLinesData,
              },
            }),
          },
        });
      }

      // --- PART 3: REAL NET PAYROLL (ONLY FOR GLOBAL SCHOOL-WIDE RUNS) ---
      if (!targetTeacherId) {
        const realNetBranchLinesData = branches.map((b) => {
          const bRev = revenueEntries.filter((e) => e.branchId === b.id).reduce((s, e) => s + Number(e.amount), 0);
          const bOut = dailyExpenses.filter((e) => e.branchId === b.id).reduce((s, e) => s + Number(e.amount), 0);
          let bTeacher = 0;
          teacherCalculations.forEach((calc) => {
            const line = calc.branchBreakdown.find((bl) => bl.branchId === b.id);
            if (line) bTeacher += line.amount;
          });
          const bStaff = staffPayrolls
            .filter((s) => s.staffMember.branchId === b.id)
            .reduce((sum, s) => sum + Number(s.amount) + Number((s as any).bonus || 0), 0);

          const bMargin = bRev - bOut - bTeacher - bStaff;

          return {
            branchId: b.id,
            sessionsCount: 0,
            amount: new Prisma.Decimal(bMargin),
          };
        });

        await tx.payslip.create({
          data: {
            payrollRunId: payrollRun.id,
            personId: "REAL_NET",
            personType: "REAL_NET",
            sessionsCount: teacherCalculations.reduce((s, c) => s + c.totalSessions, 0),
            grossAmount: new Prisma.Decimal(totalRevenue),
            advances: new Prisma.Decimal(totalDailyExpenses),
            photocopyDeductions: new Prisma.Decimal(totalStaffPayroll),
            netAmount: new Prisma.Decimal(realNet),
            ...(realNetBranchLinesData.length > 0 && {
              PayslipBranchLine: {
                create: realNetBranchLinesData,
              },
            }),
          },
        });
      }

      return payrollRun;
    },
    {
      maxWait: 15000,
      timeout: 60000,
    }
  );
}

/**
 * Updates a PayrollRun status (DRAFT -> VALIDATED -> PAID).
 * When marked PAID, writes PAYROLL_OUT entries to DailyLedger for each branch.
 */
export async function updatePayrollRunStatus(
  payrollRunId: number,
  newStatus: "DRAFT" | "VALIDATED" | "PAID"
) {
  return await prisma.$transaction(
    async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        Payslip: {
          include: {
            PayslipBranchLine: true,
          },
        },
      },
    });

    if (!run) {
      throw new Error(`Payroll run #${payrollRunId} not found`);
    }

    const updated = await tx.payrollRun.update({
      where: { id: payrollRunId },
      data: { status: newStatus },
    });

    // If marked as PAID, post ledger expense per branch from PayslipBranchLine
    // ONLY for TEACHER payslips (expenses paid out)
    if (newStatus === "PAID") {
      const branchTotals = new Map<number, number>();

      run.Payslip.forEach((slip) => {
        if (slip.personType === "TEACHER") {
          slip.PayslipBranchLine.forEach((line) => {
            const prev = branchTotals.get(line.branchId) || 0;
            branchTotals.set(line.branchId, prev + Number(line.amount));
          });
        }
      });

      for (const [branchId, totalBranchPayroll] of branchTotals.entries()) {
        if (totalBranchPayroll > 0) {
          await upsertDailyLedger(tx, {
            branchId,
            date: run.periodEnd,
            type: "PAYROLL_OUT" as any,
            amount: totalBranchPayroll,
          });
        }
      }
    }

    return updated;
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * Deletes a PayrollRun and safely rolls back all its associated records:
 * 1. PayslipBranchLine entries
 * 2. Payslip entries
 * 3. Any DailyLedger PAYROLL_OUT entries posted if the run was marked PAID
 * 4. The PayrollRun itself
 */
export async function deletePayrollRun(payrollRunId: number) {
  return await prisma.$transaction(
    async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        Payslip: {
          select: { id: true },
        },
      },
    });

    if (!run) {
      throw new Error(`Payroll run #${payrollRunId} not found`);
    }

    const payslipIds = run.Payslip.map((p) => p.id);

    if (payslipIds.length > 0) {
      await tx.payslipBranchLine.deleteMany({
        where: { payslipId: { in: payslipIds } },
      });
      await tx.payslip.deleteMany({
        where: { id: { in: payslipIds } },
      });
    }

    // Delete any PAYROLL_OUT ledger entries written for this run period
    await tx.dailyLedger.deleteMany({
      where: {
        type: "PAYROLL_OUT" as any,
        date: run.periodEnd,
      },
    });

    return await tx.payrollRun.delete({
      where: { id: payrollRunId },
    });
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * Aggregates Owner View data: Total School Revenue vs. Total Payroll Cost.
 * Primary view is school-wide; secondary view breaks down by branch.
 */
export async function getOwnerPayrollOverview(startDate: Date, endDate: Date) {
  // 1. Total revenue from DailyLedger in period
  const revenueEntries = await prisma.dailyLedger.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        not: "PAYROLL_OUT",
      },
    },
    include: { Branch: true },
  });

  const totalRevenue = revenueEntries.reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  // 2. Total payroll cost from Payslips associated with runs in period
  const payslips = await prisma.payslip.findMany({
    where: {
      PayrollRun: {
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
      personType: "TEACHER",
    },
    include: {
      PayrollRun: true,
      PayslipBranchLine: {
        include: { Branch: true },
      },
    },
  });

  const totalGrossPayroll = payslips.reduce((s, p) => s + Number(p.grossAmount), 0);
  const totalAdvances = payslips.reduce((s, p) => s + Number(p.advances), 0);
  const totalPhotocopyDeductions = payslips.reduce((s, p) => s + Number(p.photocopyDeductions), 0);
  const totalNetPayroll = payslips.reduce((s, p) => s + Number(p.netAmount), 0);

  // 3. Total daily expenses in period
  const dailyExpenses = await prisma.dailyExpense.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  const totalDailyExpenses = dailyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // 4. Total staff payroll in period
  const staffPayrolls = await prisma.staffPayroll.findMany({
    where: {
      paidAt: {
        gte: startDate,
        lte: endDate,
      },
      status: "PAID",
    },
  });
  const totalStaffPayroll = staffPayrolls.reduce(
    (sum, s) => sum + Math.max(0, Number(s.amount) - Number(s.advance || 0) + Number(s.bonus || 0)),
    0
  );

  // Net operating margin for the school = Revenue - Teacher Payroll - Staff Payroll - Daily Expenses
  const totalExpenses = totalGrossPayroll + totalStaffPayroll + totalDailyExpenses;
  const operatingMargin = totalRevenue - totalExpenses;

  // Branch breakdown (Secondary view)
  const branches = await prisma.branch.findMany();
  const branchBreakdown = branches.map((branch) => {
    const branchRev = revenueEntries
      .filter((e) => e.branchId === branch.id)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    let branchPayroll = 0;
    payslips.forEach((slip) => {
      if (slip.personType === "TEACHER") {
        slip.PayslipBranchLine.forEach((line) => {
          if (line.branchId === branch.id) {
            branchPayroll += Number(line.amount);
          }
        });
      }
    });

    const branchExpenses = dailyExpenses
      .filter((e) => e.branchId === branch.id)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      branchId: branch.id,
      branchName: branch.name,
      revenue: branchRev,
      payrollCost: branchPayroll,
      dailyExpenses: branchExpenses,
      margin: branchRev - branchPayroll - branchExpenses,
    };
  });

  return {
    totalRevenue,
    totalGrossPayroll,
    totalAdvances,
    totalPhotocopyDeductions,
    totalNetPayroll,
    totalDailyExpenses,
    totalStaffPayroll,
    totalExpenses,
    operatingMargin,
    branchBreakdown,
  };
}

export interface PayrollRunFinancialReport {
  periodStart: Date;
  periodEnd: Date;
  payrollRunId?: number;
  teachersPayroll: {
    totalSessions: number;
    totalGross: number;
    totalAdvances: number;
    totalPhotocopyDeductions: number;
    totalNet: number;
    items: Array<{
      payslipId?: number;
      teacherId: string;
      teacherName: string;
      phone?: string | null;
      sessionsCount: number;
      grossAmount: number;
      advances: number;
      photocopyDeductions: number;
      netAmount: number;
      branchLines: Array<{
        branchId: number;
        branchName: string;
        sessionsCount: number;
        amount: number;
      }>;
    }>;
  };
  schoolSharePayroll: {
    totalSessions: number;
    totalTuitionGross: number;
    totalTeacherGross: number;
    totalSchoolGross: number;
    totalPhotocopyRecovered: number;
    totalSchoolNet: number;
    items: Array<{
      payslipId?: number;
      teacherId: string;
      teacherName: string;
      phone?: string | null;
      sessionsCount: number;
      totalTuitionGross: number;
      teacherCut: number;
      schoolCut: number;
      photocopyRecovered: number;
      netSchoolCut: number;
      branchLines: Array<{
        branchId: number;
        branchName: string;
        sessionsCount: number;
        tuitionAmount: number;
        teacherAmount: number;
        schoolAmount: number;
      }>;
    }>;
  };
  realNetPayroll: {
    totalRevenue: number;
    totalOutcomes: number;
    totalTeacherPayroll: number;
    totalStaffPayroll: number;
    realNet: number;
    revenueBreakdown: Array<{
      branchId: number;
      branchName: string;
      amount: number;
    }>;
    outcomesByCategory: Array<{
      category: string;
      amount: number;
      count: number;
    }>;
    outcomesBreakdown: Array<{
      id: number;
      branchId: number | null;
      branchName: string;
      amount: number;
      category: string;
      description: string;
      date: string;
    }>;
    staffPayrollBreakdown: Array<{
      id: number;
      staffName: string;
      roleTitle: string;
      branchName: string;
      amount: number;
      bonus: number;
      total: number;
    }>;
    branchBreakdown: Array<{
      branchId: number;
      branchName: string;
      revenue: number;
      outcomes: number;
      teacherPayroll: number;
      staffPayroll: number;
      realNet: number;
    }>;
  };
}

/**
 * Builds the complete 3-in-1 financial report for any payroll run or period:
 * 1. Teachers Payroll (Masse salariale et fiches enseignants)
 * 2. School Share with Teachers (Part de l'école sur les cours et enseignants)
 * 3. Real Net Statement (Recettes - Dépenses - Paie Profs - Paie Staff)
 */
export async function getPayrollRunFinancialReport(
  startDate: Date,
  endDate: Date,
  payrollRunId?: number
): Promise<PayrollRunFinancialReport> {
  const normStart = normalizeDateToStartOfDay(startDate);
  const normEnd = normalizeDateToEndOfDay(endDate);

  const [teachers, branches, revenueEntries, dailyExpenses, staffPayrolls] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, name: true, phone: true } }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.dailyLedger.findMany({
      where: {
        date: { gte: normStart, lte: normEnd },
        type: { not: "PAYROLL_OUT" },
      },
      include: { Branch: true },
    }),
    prisma.dailyExpense.findMany({
      where: {
        date: { gte: normStart, lte: normEnd },
      },
      include: { branch: true },
      orderBy: { date: "desc" },
    }),
    prisma.staffPayroll.findMany({
      where: {
        paidAt: { gte: normStart, lte: normEnd },
        status: "PAID",
      },
      include: {
        staffMember: { include: { branch: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  // If a specific payrollRunId is provided, also load saved payslips
  let savedPayslips: any[] = [];
  if (payrollRunId) {
    savedPayslips = await prisma.payslip.findMany({
      where: { payrollRunId },
      include: {
        PayslipBranchLine: {
          include: { Branch: true },
        },
      },
    });
  }

  const teacherCalcs: TeacherPayrollCalculation[] = [];
  for (const t of teachers) {
    const calc = await calculateTeacherPayroll(t.id, normStart, normEnd);
    if (
      calc &&
      (calc.totalSessions > 0 ||
        (calc.teacherAbsencesCount && calc.teacherAbsencesCount > 0) ||
        calc.grossAmount > 0 ||
        calc.salaryAdvances > 0 ||
        calc.photocopyDeductions > 0)
    ) {
      teacherCalcs.push(calc);
    }
  }

  // Part 1: Teachers Payroll
  const teacherSlipMap = new Map(savedPayslips.filter((p) => p.personType === "TEACHER").map((p) => [p.personId, p]));
  const teachersPayrollItems = teacherCalcs.map((calc) => {
    const saved = teacherSlipMap.get(calc.teacherId);
    const teacherRecord = teachers.find((t) => t.id === calc.teacherId);
    return {
      payslipId: saved?.id,
      teacherId: calc.teacherId,
      teacherName: calc.teacherName,
      phone: teacherRecord?.phone || null,
      sessionsCount: calc.totalSessions,
      grossAmount: saved ? Number(saved.grossAmount) : calc.grossAmount,
      advances: saved ? Number(saved.advances) : calc.salaryAdvances,
      photocopyDeductions: saved ? Number(saved.photocopyDeductions) : calc.photocopyDeductions,
      netAmount: saved ? Number(saved.netAmount) : calc.netAmount,
      branchLines: calc.branchBreakdown.map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        sessionsCount: b.sessionsCount,
        amount: b.amount,
      })),
    };
  });

  const totalTeachersSessions = teachersPayrollItems.reduce((s, i) => s + i.sessionsCount, 0);
  const totalTeachersGross = teachersPayrollItems.reduce((s, i) => s + i.grossAmount, 0);
  const totalTeachersAdvances = teachersPayrollItems.reduce((s, i) => s + i.advances, 0);
  const totalTeachersPhotocopy = teachersPayrollItems.reduce((s, i) => s + i.photocopyDeductions, 0);
  const totalTeachersNet = teachersPayrollItems.reduce((s, i) => s + i.netAmount, 0);

  // Part 2: School Share Payroll
  const schoolSlipMap = new Map(savedPayslips.filter((p) => p.personType === "SCHOOL_SHARE").map((p) => [p.personId, p]));
  const schoolShareItems = teacherCalcs.map((calc) => {
    const saved = schoolSlipMap.get(calc.teacherId);
    const teacherRecord = teachers.find((t) => t.id === calc.teacherId);
    const tuition = calc.totalTuitionGross ?? 0;
    const teacherCut = calc.grossAmount;
    const tuitionTeacherCut = calc.grossAmount - (calc.bookRevenue || 0);
    const schoolCut = calc.schoolGrossAmount ?? Math.max(0, tuition - tuitionTeacherCut);
    const photoRecov = calc.photocopyDeductions;
    const netSchoolCut = calc.schoolNetAmount ?? (schoolCut + photoRecov);

    return {
      payslipId: saved?.id,
      teacherId: calc.teacherId,
      teacherName: calc.teacherName,
      phone: teacherRecord?.phone || null,
      sessionsCount: calc.totalSessions,
      totalTuitionGross: tuition,
      teacherCut,
      schoolCut: saved ? Number(saved.grossAmount) : schoolCut,
      photocopyRecovered: photoRecov,
      netSchoolCut: saved ? Number(saved.netAmount) : netSchoolCut,
      branchLines: (calc.branchSchoolBreakdown || []).map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        sessionsCount: b.sessionsCount,
        tuitionAmount: b.tuitionAmount,
        teacherAmount: b.teacherAmount,
        schoolAmount: b.schoolAmount,
      })),
    };
  });

  const totalSchoolSessions = totalTeachersSessions;
  const totalSchoolTuitionGross = schoolShareItems.reduce((s, i) => s + i.totalTuitionGross, 0);
  const totalSchoolTeacherGross = schoolShareItems.reduce((s, i) => s + i.teacherCut, 0);
  const totalSchoolGross = schoolShareItems.reduce((s, i) => s + i.schoolCut, 0);
  const totalSchoolPhotocopyRecovered = schoolShareItems.reduce((s, i) => s + i.photocopyRecovered, 0);
  const totalSchoolNet = schoolShareItems.reduce((s, i) => s + i.netSchoolCut, 0);

  // Part 3: Real Net Statement
  const totalRevenue = revenueEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalOutcomes = dailyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalTeacherPayroll = totalTeachersGross;
  const totalStaffPayroll = staffPayrolls.reduce(
    (sum, s) => sum + Number(s.amount) + Number((s as any).bonus || 0),
    0
  );
  const realNet = totalRevenue - totalOutcomes - totalTeacherPayroll - totalStaffPayroll;

  // Revenue breakdown by branch
  const revenueBreakdown = branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    amount: revenueEntries.filter((e) => e.branchId === b.id).reduce((s, e) => s + Number(e.amount), 0),
  }));

  // Outcomes by category
  const catMap = new Map<string, { amount: number; count: number }>();
  dailyExpenses.forEach((e) => {
    const cat = e.category || "Autre";
    const cur = catMap.get(cat) || { amount: 0, count: 0 };
    cur.amount += Number(e.amount);
    cur.count += 1;
    catMap.set(cat, cur);
  });
  const outcomesByCategory = Array.from(catMap.entries()).map(([category, val]) => ({
    category,
    amount: val.amount,
    count: val.count,
  }));

  const outcomesBreakdown = dailyExpenses.map((e) => ({
    id: e.id,
    branchId: e.branchId,
    branchName: e.branch?.name || "Siège",
    amount: Number(e.amount),
    category: e.category,
    description: e.description,
    date: e.date.toISOString(),
  }));

  const staffPayrollBreakdown = staffPayrolls.map((s) => ({
    id: s.id,
    staffName: s.staffMember.name,
    roleTitle: s.staffMember.roleTitle,
    branchName: s.staffMember.branch?.name || "Siège",
    amount: Number(s.amount),
    bonus: Number((s as any).bonus || 0),
    total: Number(s.amount) + Number((s as any).bonus || 0),
  }));

  const realNetBranchBreakdown = branches.map((branch) => {
    const bRev = revenueEntries.filter((e) => e.branchId === branch.id).reduce((s, e) => s + Number(e.amount), 0);
    const bOut = dailyExpenses.filter((e) => e.branchId === branch.id).reduce((s, e) => s + Number(e.amount), 0);
    let bTeacher = 0;
    teacherCalcs.forEach((c) => {
      const bl = c.branchBreakdown.find((l) => l.branchId === branch.id);
      if (bl) bTeacher += bl.amount;
    });
    const bStaff = staffPayrolls
      .filter((s) => s.staffMember.branchId === branch.id)
      .reduce((s, sp) => s + Number(sp.amount) + Number((sp as any).bonus || 0), 0);

    return {
      branchId: branch.id,
      branchName: branch.name,
      revenue: bRev,
      outcomes: bOut,
      teacherPayroll: bTeacher,
      staffPayroll: bStaff,
      realNet: bRev - bOut - bTeacher - bStaff,
    };
  });

  return {
    periodStart: normStart,
    periodEnd: normEnd,
    payrollRunId,
    teachersPayroll: {
      totalSessions: totalTeachersSessions,
      totalGross: totalTeachersGross,
      totalAdvances: totalTeachersAdvances,
      totalPhotocopyDeductions: totalTeachersPhotocopy,
      totalNet: totalTeachersNet,
      items: teachersPayrollItems,
    },
    schoolSharePayroll: {
      totalSessions: totalSchoolSessions,
      totalTuitionGross: totalSchoolTuitionGross,
      totalTeacherGross: totalSchoolTeacherGross,
      totalSchoolGross: totalSchoolGross,
      totalPhotocopyRecovered: totalSchoolPhotocopyRecovered,
      totalSchoolNet: totalSchoolNet,
      items: schoolShareItems,
    },
    realNetPayroll: {
      totalRevenue,
      totalOutcomes,
      totalTeacherPayroll,
      totalStaffPayroll,
      realNet,
      revenueBreakdown,
      outcomesByCategory,
      outcomesBreakdown,
      staffPayrollBreakdown,
      branchBreakdown: realNetBranchBreakdown,
    },
  };
}

