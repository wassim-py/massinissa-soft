import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeDateToStartOfDay, upsertDailyLedger } from "./ledger";
import { classifyStudentAttendanceHistory } from "./studentBilling";

export interface TeacherPayrollCalculation {
  teacherId: string;
  teacherName: string;
  totalSessions: number;
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
  branchBreakdown: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    freeSessionsCount: number;
    effectiveRate: number;
    amount: number;
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
    lessonAmount: number;
    isFree: boolean;
    isExtra: boolean;
    isCatchUp: boolean;
    isTeacherAbsent?: boolean;
    isRetroactive?: boolean;
    retroactiveNote?: string;
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
      lessons: Array<{ id: number; startsAt: Date; isFree: boolean }>;
      attendances: Array<{ lessonId: number; studentId: string; status: string }>;
      catchUps: Array<{ studentId: string; missedLessonId: number; recordedAt: Date }>;
    }
  >();

  for (const cid of classIds) {
    const [cLessons, cAttendances, cCatchUps] = await Promise.all([
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
    ]);

    classHistoryMap.set(cid, {
      lessons: cLessons,
      attendances: cAttendances,
      catchUps: cCatchUps,
    });
  }

  // Pre-calculate classification for all students in all classes as of endDate and as of startDate
  // studentClassStatusAtEnd: Map<`${studentId}_${lessonId}`, StudentAttendanceHistoryItem>
  const studentStatusAtEnd = new Map<string, any>();
  const studentStatusAtStart = new Map<string, any>();

  for (const [cid, historyData] of classHistoryMap.entries()) {
    const studentIds = Array.from(new Set(historyData.attendances.map((a) => a.studentId)));

    for (const sid of studentIds) {
      const studentAtts = historyData.attendances.filter((a) => a.studentId === sid);
      const studentCatchUps = historyData.catchUps.filter((c) => c.studentId === sid);

      // Classification as of endDate
      const classifiedAtEnd = classifyStudentAttendanceHistory({
        lessons: historyData.lessons,
        attendances: studentAtts,
        catchUps: studentCatchUps,
        referenceDate: endDate,
      });
      classifiedAtEnd.forEach((item) => {
        studentStatusAtEnd.set(`${sid}_${item.lessonId}`, item);
      });

      // Classification as of startDate (for prior lessons to identify trailing absences that got resolved in this month)
      const priorLessons = historyData.lessons.filter((l) => new Date(l.startsAt) < startDate);
      if (priorLessons.length > 0) {
        const classifiedAtStart = classifyStudentAttendanceHistory({
          lessons: priorLessons,
          attendances: studentAtts.filter((a) => priorLessons.some((pl) => pl.id === a.lessonId)),
          catchUps: studentCatchUps.filter((c) => priorLessons.some((pl) => pl.id === c.missedLessonId)),
          referenceDate: startDate,
        });
        classifiedAtStart.forEach((item) => {
          studentStatusAtStart.set(`${sid}_${item.lessonId}`, item);
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
      class: { select: { id: true, name: true, branchId: true } },
      student: { select: { id: true, name: true } },
      refunds: true,
    },
  });

  let totalSessions = 0;
  let teacherAbsencesCount = 0;
  let totalPresentAttendances = 0;
  let calculatedGross = 0;
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
      totalPresentAttendances: 0,
    };
    existing.totalSessions += 1;
    totalSessions += 1;
    if (lesson.isFree) {
      existing.freeSessions += 1;
    }

    // Actual student attendance (PRESENT regular attendees + catch-up visitors hosted)
    const presentAttendances = lesson.attendances.filter((a) => a.status === "PRESENT");
    const regularPresentCount = presentAttendances.length;
    const visitorsInLesson = catchUpVisitors.filter((cv) => cv.catchUpLessonId === lesson.id);
    const visitorCount = visitorsInLesson.length;
    const presentCount = regularPresentCount + visitorCount;

    existing.totalPresentAttendances += presentCount;
    totalPresentAttendances += presentCount;

    // Filter students whose payer status entitles teacher to payment:
    // Paying attendees include PRESENT + INTERLEAVED_ABSENCE
    // (Excludes NOT_DEFINED, PRE_START_ABSENCE, TRAILING_ABSENCE_HELD, and FORFEITED_DROPOUT)
    // Rule 1: Sibling discount is split proportionally (Option 2)
    // Rule 2: 100% waived sibling earns teacher 0 DZD
    // Rules 3 & 4: NON_PAYER and SCHOOL_FEES_ONLY earn teacher 0 DZD
    let payingWeight = 0;
    if (!lesson.isFree) {
      lesson.attendances.forEach((att) => {
        const enrollment = lesson.class?.enrollments?.find((e) => e.studentId === att.studentId);
        const payerStatus = enrollment?.payerStatus || "NORMAL";
        if (payerStatus === "NON_PAYER" || payerStatus === "SCHOOL_FEES_ONLY") return;

        const classification = studentStatusAtEnd.get(`${att.studentId}_${lesson.id}`);
        if (classification && classification.isTeacherPayable) {
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

    if (!lesson.isFree) {
      if (branchRateMap.has(lesson.branchId)) {
        effectiveRateForSession = branchRateMap.get(lesson.branchId)!;
        lessonAmount = effectiveRateForSession;
      } else if (percentageOfSessionFee !== null && percentageOfSessionFee > 0) {
        effectiveRateForSession = (sessionPrice * percentageOfSessionFee) / 100;
        lessonAmount = payingWeight * effectiveRateForSession;
      } else if (defaultSessionRate > 0) {
        effectiveRateForSession = defaultSessionRate;
        lessonAmount = defaultSessionRate;
      }
    }

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
  // but now validated because the student returned and attended during [startDate, endDate]
  for (const [cid, historyData] of classHistoryMap.entries()) {
    const priorLessons = historyData.lessons.filter(
      (l) => new Date(l.startsAt) < startDate && !l.isFree
    );

    for (const pl of priorLessons) {
      const plAttendances = historyData.attendances.filter((a) => a.lessonId === pl.id);

      for (const att of plAttendances) {
        const atStart = studentStatusAtStart.get(`${att.studentId}_${pl.id}`);
        const atEnd = studentStatusAtEnd.get(`${att.studentId}_${pl.id}`);

        // If it was held at the start of the period and became INTERLEAVED at the end of the period
        if (
          atStart &&
          atStart.classification === "TRAILING_ABSENCE_HELD" &&
          atEnd &&
          atEnd.classification === "INTERLEAVED_ABSENCE"
        ) {
          // Check that student attended at least one lesson in this period [startDate, endDate]
          const attendedInPeriod = historyData.attendances.some((a) => {
            if (a.studentId !== att.studentId || a.status !== "PRESENT") return false;
            const l = historyData.lessons.find((les) => les.id === a.lessonId);
            if (!l) return false;
            const lDate = new Date(l.startsAt);
            return lDate >= startDate && lDate <= endDate;
          });

          if (attendedInPeriod) {
            // Find lesson class and branch info
            const lessonRecord = await prisma.lesson.findUnique({
              where: { id: pl.id },
              include: { branch: true, class: { include: { enrollments: true } } },
            });
            if (lessonRecord) {
              const enrollment = lessonRecord.class?.enrollments?.find(
                (e) => e.studentId === att.studentId
              );
              if (enrollment && (enrollment.payerStatus || "NORMAL") === "NORMAL") {
                const pricePerCycle = lessonRecord.class?.pricePerCycle
                  ? Number(lessonRecord.class.pricePerCycle)
                  : 0;
                const sessionPrice = pricePerCycle > 0 ? pricePerCycle / 4 : 0;
                const teacherCut =
                  percentageOfSessionFee !== null && percentageOfSessionFee > 0
                    ? (sessionPrice * percentageOfSessionFee) / 100
                    : defaultSessionRate;

                if (teacherCut > 0) {
                  calculatedGross += teacherCut;
                  const bEntry = branchSessionsMap.get(lessonRecord.branchId) || {
                    branchName: lessonRecord.branch.name,
                    totalSessions: 0,
                    freeSessions: 0,
                    amount: 0,
                    totalPresentAttendances: 0,
                  };
                  bEntry.amount += teacherCut;
                  branchSessionsMap.set(lessonRecord.branchId, bEntry);

                  sessionDetails.push({
                    lessonId: pl.id,
                    startsAt: new Date(pl.startsAt),
                    className: lessonRecord.class?.name || "فوج",
                    branchName: lessonRecord.branch.name,
                    presentCount: 0,
                    payingCount: 1,
                    pricePerCycle,
                    sessionPrice,
                    teacherCut,
                    lessonAmount: teacherCut,
                    isFree: false,
                    isExtra: false,
                    isCatchUp: false,
                    isRetroactive: true,
                    retroactiveNote: "Rattrapage d'absence précédente validé par présence ce mois",
                  });
                }
              }
            }
          }
        }
      }
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
    });
  }

  // If teacher is on fixedMonthly and no per-session rate is used, or fixed monthly base
  let grossAmount = Math.round(calculatedGross * 100) / 100;
  if (fixedMonthly > 0) {
    grossAmount = fixedMonthly;
    // Distribute informational branch breakdown proportionally if lessons occurred
    if (totalSessions > 0) {
      branchBreakdown.forEach((b) => {
        b.amount = Math.round((b.sessionsCount / totalSessions) * fixedMonthly * 100) / 100;
      });
    } else if (branchBreakdown.length > 0) {
      // Split evenly across assigned branches if no sessions
      const splitAmount = Math.round((fixedMonthly / branchBreakdown.length) * 100) / 100;
      branchBreakdown.forEach((b) => {
        b.amount = splitAmount;
      });
    }
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

  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    totalSessions,
    teacherAbsencesCount,
    absentSessions,
    totalPresentAttendances,
    percentageOfSessionFee,
    sessionDetails,
    grossAmount,
    salaryAdvances: totalAdvances,
    photocopyDeductions: totalPhotocopyDeductions,
    netAmount,
    branchBreakdown,
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
  periodEnd: Date | string
) {
  const startDate = normalizeDateToStartOfDay(periodStart);
  const endDate = normalizeDateToEndOfDay(periodEnd);

  // Get all teachers
  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true },
  });

  const teacherCalculations: TeacherPayrollCalculation[] = [];

  for (const t of teachers) {
    const calc = await calculateTeacherPayroll(t.id, startDate, endDate);
    // Only include teachers who taught lessons, had absences, have fixed salary, or have deductions
    if (
      calc &&
      (calc.totalSessions > 0 ||
        (calc.teacherAbsencesCount && calc.teacherAbsencesCount > 0) ||
        calc.grossAmount > 0 ||
        calc.salaryAdvances > 0 ||
        calc.photocopyDeductions > 0)
    ) {
      teacherCalculations.push(calc);
    }
  }

  // Atomically create the PayrollRun and all consolidated Payslips + PayslipBranchLines
  return await prisma.$transaction(async (tx) => {
    const payrollRun = await tx.payrollRun.create({
      data: {
        periodStart: startDate,
        periodEnd: endDate,
        status: "DRAFT",
      },
    });

    for (const calc of teacherCalculations) {
      const payslip = await tx.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          personId: calc.teacherId,
          personType: "TEACHER",
          sessionsCount: calc.totalSessions,
          grossAmount: new Prisma.Decimal(calc.grossAmount),
          advances: new Prisma.Decimal(calc.salaryAdvances),
          photocopyDeductions: new Prisma.Decimal(calc.photocopyDeductions),
          netAmount: new Prisma.Decimal(calc.netAmount),
        },
      });

      // Create informational branch lines
      for (const line of calc.branchBreakdown) {
        if (line.sessionsCount > 0 || line.amount > 0) {
          await tx.payslipBranchLine.create({
            data: {
              payslipId: payslip.id,
              branchId: line.branchId,
              sessionsCount: line.sessionsCount,
              amount: new Prisma.Decimal(line.amount),
            },
          });
        }
      }
    }

    return payrollRun;
  });
}

/**
 * Updates a PayrollRun status (DRAFT -> VALIDATED -> PAID).
 * When marked PAID, writes PAYROLL_OUT entries to DailyLedger for each branch.
 */
export async function updatePayrollRunStatus(
  payrollRunId: number,
  newStatus: "DRAFT" | "VALIDATED" | "PAID"
) {
  return await prisma.$transaction(async (tx) => {
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
    if (newStatus === "PAID") {
      const branchTotals = new Map<number, number>();

      run.Payslip.forEach((slip) => {
        slip.PayslipBranchLine.forEach((line) => {
          const prev = branchTotals.get(line.branchId) || 0;
          branchTotals.set(line.branchId, prev + Number(line.amount));
        });
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
  });
}

/**
 * Deletes a PayrollRun and safely rolls back all its associated records:
 * 1. PayslipBranchLine entries
 * 2. Payslip entries
 * 3. Any DailyLedger PAYROLL_OUT entries posted if the run was marked PAID
 * 4. The PayrollRun itself
 */
export async function deletePayrollRun(payrollRunId: number) {
  return await prisma.$transaction(async (tx) => {
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
  });
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
  const totalStaffPayroll = staffPayrolls.reduce((sum, s) => sum + Number(s.amount), 0);

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
      slip.PayslipBranchLine.forEach((line) => {
        if (line.branchId === branch.id) {
          branchPayroll += Number(line.amount);
        }
      });
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
