import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeDateToStartOfDay, upsertDailyLedger } from "./ledger";
import { normalizeOutcomeFundingSource } from "./financeConstants";
import { syncOutcomeWithCaisseNoire, cleanupCaisseNoireLinks } from "./caisseNoireSync";
import {
  classifyStudentAttendanceHistory,
  isLessonApplicableToEnrollment,
  extractSameTeacherHeldFromTransfers,
  buildPaidSessionSlotSchedule,
  computeStudentSessionFee,
  resolvePayerPeriodAtDate,
  PaidSessionSlotSchedule,
} from "./studentBilling";

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
    tuitionGross?: number;
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
  workshopStudentBreakdown?: Array<{
    workshopId: number;
    workshopTitle: string;
    branchName: string;
    studentId: string;
    studentName: string;
    workshopPrice: number;
    paidInPeriod: number;
    teacherPercentage: number;
    teacherAmount: number;
    schoolAmount: number;
  }>;
  bookRevenue?: number;
  bookRevenueDetails?: Array<{
    voucherId: number;
    bookTitle?: string;
    studentName?: string;
    amount: number;
    date: Date;
    branchId?: number;
    branchName?: string;
  }>;
  isFixedMonthly?: boolean;
  salaryAdvanceDetails: Array<{
    id: number;
    amount: number;
    date: Date;
    remarque?: string | null;
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
  calculationScope?: "all" | "normal" | "formation";
}

/**
 * Normalizes end date to include the entire day up to 23:59:59.999 UTC
 */
export function normalizeDateToEndOfDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Builds the snapshot-aware paid session slot schedule for a student in a class as of referenceDate.
 */
function computeStudentSlotScheduleForPayroll(
  studentId: string,
  classInfo: any,
  vouchers: any[],
  referenceDate: Date,
  teacherPercentage?: number | null
): PaidSessionSlotSchedule {
  const enrollment = classInfo?.enrollments?.find((e: any) => e.studentId === studentId);
  if (!enrollment) {
    return {
      slots: [],
      purchasedSlots: [],
      totalPaidTuition: 0,
      crossPriceTransferAmount: 0,
      samePriceTransferredSessions: 0,
      purchasedSessions: 0,
      transferredIn: 0,
      transferredOut: 0,
      unconvertedPartialCashDzd: 0,
      unlimitedFreeClass: false,
    };
  }

  const fam = enrollment.student?.family;
  const payerId = fam?.payerStudentId;
  const isPayerInClass = Boolean(
    payerId &&
      payerId !== studentId &&
      classInfo?.enrollments?.some(
        (e: any) =>
          (e.studentId === payerId || e.student?.id === payerId) &&
          (e.status === "ACTIVE" || !e.status)
      )
  );
  const siblingDiscountPct = isPayerInClass ? Number(fam?.discountPercentage ?? 50) : 0;

  const studentVouchers = vouchers.filter((v: any) => {
    if (v.studentId !== studentId) return false;
    if (v.classId && v.classId !== classInfo.id) return false;
    return true;
  });

  return buildPaidSessionSlotSchedule({
    pricePerCycle: Number(classInfo?.pricePerCycle || 0),
    isFormation: Boolean(classInfo?.isFormation),
    payerStatus: enrollment.payerStatus || "NORMAL",
    discountType: enrollment.discountType,
    discountValue: enrollment.discountValue,
    siblingDiscountPercentage: siblingDiscountPct,
    teacherPercentage,
    tuitionVouchers: studentVouchers,
    transfersIn: enrollment.transfersTo || [],
    transfersOut: enrollment.transfersFrom || [],
    referenceDate,
  });
}

export interface BatchPayrollRequestItem {
  teacherId: string;
  startDate: Date | string;
  endDate: Date | string;
  groupFilter?: "all" | "normal" | "formation";
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
  endDate: Date,
  groupFilter: "all" | "normal" | "formation" = "all"
): Promise<TeacherPayrollCalculation | null> {
  const results = await calculateTeachersPayrollBatch([
    { teacherId, startDate, endDate, groupFilter },
  ]);
  return results[0] ?? null;
}

/**
 * Calculates payroll for multiple teacher/period requests using shared bulk DB queries
 * (4 bounded round-trips regardless of batch size) to avoid Neon TLS latency and pool contention.
 */
export async function calculateTeachersPayrollBatch(
  items: BatchPayrollRequestItem[]
): Promise<Array<TeacherPayrollCalculation | null>> {
  if (items.length === 0) return [];

  const normalizedItems = items.map((item) => ({
    teacherId: item.teacherId,
    startDate: normalizeDateToStartOfDay(item.startDate),
    endDate: normalizeDateToEndOfDay(item.endDate),
    groupFilter: item.groupFilter ?? ("all" as const),
  }));

  const uniqueTeacherIds = Array.from(new Set(normalizedItems.map((i) => i.teacherId)));
  const minStartDate = new Date(Math.min(...normalizedItems.map((i) => i.startDate.getTime())));
  const maxEndDate = new Date(Math.max(...normalizedItems.map((i) => i.endDate.getTime())));
  const maxEndMs = maxEndDate.getTime();
  const teacherWhere: any = uniqueTeacherIds.length === 1 ? uniqueTeacherIds[0] : { in: uniqueTeacherIds };

  const [teachers, allRawLessons, allTeacherClasses, allSalaryAdvances, allPhotocopyCharges] =
    await Promise.all([
      prisma.teacher.findMany({
        where: { id: teacherWhere },
        include: {
          TeacherBranch: {
            include: { Branch: true },
          },
          TeacherPayRate: {
            orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
          },
          teacherClassRates: true,
        },
      }),
      // Find all lessons in the spanned period that ACTUALLY HAPPENED (have attendance) OR where teacher was marked absent
      prisma.lesson.findMany({
        where: {
          teacherId: teacherWhere,
          startsAt: {
            gte: minStartDate,
            lte: maxEndDate,
          },
          OR: [{ attendances: { some: {} } }, { isTeacherAbsent: true }],
        },
        include: {
          branch: true,
          class: {
            include: {
              enrollments: {
                select: {
                  studentId: true,
                  payerStatus: true,
                  discountType: true,
                  discountValue: true,
                  status: true,
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
          lessonGroups: {
            include: {
              class: {
                include: {
                  enrollments: {
                    select: {
                      studentId: true,
                      payerStatus: true,
                      discountType: true,
                      discountValue: true,
                      status: true,
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
            },
          },
          attendances: true,
          vouchers: {
            where: {
              paymentType: "REVISION_SESSION",
              isVoided: false,
            },
            include: {
              refunds: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.class.findMany({
        where: { teacherId: teacherWhere },
        select: { id: true, teacherId: true, isFormation: true },
      }),
      prisma.salaryAdvance.findMany({
        where: {
          personId: teacherWhere,
          date: {
            gte: minStartDate,
            lte: maxEndDate,
          },
        },
        orderBy: { date: "asc" },
      }),
      prisma.photocopyCharge.findMany({
        where: {
          teacherId: teacherWhere,
          date: {
            gte: minStartDate,
            lte: maxEndDate,
          },
        },
        include: {
          Branch: true,
          class: { select: { isFormation: true } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const rawLessonsByTeacher = new Map<string, typeof allRawLessons>();
  for (const l of allRawLessons) {
    let list = rawLessonsByTeacher.get(l.teacherId);
    if (!list) {
      list = [];
      rawLessonsByTeacher.set(l.teacherId, list);
    }
    list.push(l);
  }
  const teacherClassesByTeacher = new Map<string, typeof allTeacherClasses>();
  for (const tc of allTeacherClasses) {
    if (!tc.teacherId) continue;
    let list = teacherClassesByTeacher.get(tc.teacherId);
    if (!list) {
      list = [];
      teacherClassesByTeacher.set(tc.teacherId, list);
    }
    list.push(tc);
  }
  const advancesByTeacher = new Map<string, typeof allSalaryAdvances>();
  for (const adv of allSalaryAdvances) {
    let list = advancesByTeacher.get(adv.personId);
    if (!list) {
      list = [];
      advancesByTeacher.set(adv.personId, list);
    }
    list.push(adv);
  }
  const photocopyByTeacher = new Map<string, typeof allPhotocopyCharges>();
  for (const pc of allPhotocopyCharges) {
    let list = photocopyByTeacher.get(pc.teacherId);
    if (!list) {
      list = [];
      photocopyByTeacher.set(pc.teacherId, list);
    }
    list.push(pc);
  }

  const allLessonIdsSet = new Set<number>();
  const stage1PerItem = normalizedItems.map((item) => {
    const teacher = teacherMap.get(item.teacherId);
    if (!teacher) return null;

    const itemStartMs = item.startDate.getTime();
    const itemEndMs = item.endDate.getTime();

    const lessons = (rawLessonsByTeacher.get(item.teacherId) || []).filter((l) => {
      const t = new Date(l.startsAt).getTime();
      if (t < itemStartMs || t > itemEndMs) return false;
      if (item.groupFilter === "normal") return l.class?.isFormation !== true;
      if (item.groupFilter === "formation") return l.class?.isFormation === true;
      return true;
    });

    for (const l of lessons) {
      allLessonIdsSet.add(l.id);
    }

    const teacherClasses = teacherClassesByTeacher.get(item.teacherId) || [];
    const salaryAdvancesList = (advancesByTeacher.get(item.teacherId) || []).filter((a) => {
      const t = new Date(a.date).getTime();
      return t >= itemStartMs && t <= itemEndMs;
    });
    const photocopyChargesList = (photocopyByTeacher.get(item.teacherId) || []).filter((c) => {
      const t = new Date(c.date).getTime();
      if (t < itemStartMs || t > itemEndMs) return false;
      if (item.groupFilter === "normal") return c.classId === null || c.class?.isFormation === false;
      if (item.groupFilter === "formation") return c.class?.isFormation === true;
      return true;
    });

    return {
      item,
      teacher,
      lessons,
      teacherClasses,
      salaryAdvancesList,
      photocopyChargesList,
    };
  });

  const allLessonIds = Array.from(allLessonIdsSet);
  const [allCatchUpVisitors, allCatchUpsForMissedLessons] =
    allLessonIds.length > 0
      ? await Promise.all([
          prisma.catchUpAttendance.findMany({
            where: {
              catchUpLessonId: { in: allLessonIds },
              NOT: { recordedBy: "transfer" },
            },
            include: {
              missedLesson: {
                select: {
                  id: true,
                  classId: true,
                  startsAt: true,
                },
              },
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
                    where: { class: { teacherId: teacherWhere } },
                    select: {
                      classId: true,
                      status: true,
                      payerStatus: true,
                      discountType: true,
                      discountValue: true,
                      class: { select: { teacherId: true } },
                    },
                  },
                },
              },
            },
          }),
          prisma.catchUpAttendance.findMany({
            where: {
              missedLessonId: { in: allLessonIds },
              NOT: { recordedBy: "transfer" },
            },
            select: { studentId: true, missedLessonId: true },
          }),
        ])
      : [[], []];

  const visitorsByCatchUpLessonId = new Map<number, typeof allCatchUpVisitors>();
  for (const cv of allCatchUpVisitors) {
    if (!cv.catchUpLessonId) continue;
    let list = visitorsByCatchUpLessonId.get(cv.catchUpLessonId);
    if (!list) {
      list = [];
      visitorsByCatchUpLessonId.set(cv.catchUpLessonId, list);
    }
    list.push(cv);
  }
  const missedCatchUpsByLessonId = new Map<number, typeof allCatchUpsForMissedLessons>();
  for (const cm of allCatchUpsForMissedLessons) {
    let list = missedCatchUpsByLessonId.get(cm.missedLessonId);
    if (!list) {
      list = [];
      missedCatchUpsByLessonId.set(cm.missedLessonId, list);
    }
    list.push(cm);
  }

  const allClassIdsSet = new Set<number>();
  const stage2PerItem = stage1PerItem.map((s1) => {
    if (!s1) return null;
    const { item, teacher, lessons, teacherClasses } = s1;

    const catchUpVisitors: any[] = [];
    const catchUpsForMissedLessons: Array<{ studentId: string; missedLessonId: number }> = [];
    for (const l of lessons) {
      for (const cv of visitorsByCatchUpLessonId.get(l.id) || []) {
        catchUpVisitors.push({
          ...cv,
          student: {
            ...cv.student,
            enrollments: (cv.student.enrollments || [])
              .filter((e: any) => e.class?.teacherId === teacher.id)
              .map(({ classId, status, payerStatus, discountType, discountValue }: any) => ({
                classId,
                status,
                payerStatus,
                discountType,
                discountValue,
              })),
          },
        });
      }
      for (const cm of missedCatchUpsByLessonId.get(l.id) || []) {
        catchUpsForMissedLessons.push(cm);
      }
    }

    const filteredTeacherClassIds = teacherClasses
      .filter((tc) => {
        if (item.groupFilter === "normal") return tc.isFormation !== true;
        if (item.groupFilter === "formation") return tc.isFormation === true;
        return true;
      })
      .map((tc) => tc.id);

    const classIds = Array.from(
      new Set(
        [
          ...lessons.map((l) => l.classId),
          ...lessons.flatMap((l) => (l as any).lessonGroups?.map((lg: any) => lg.classId) || []),
          ...catchUpVisitors.map((cv) => cv.missedLesson?.classId),
          ...filteredTeacherClassIds,
        ].filter(Boolean)
      )
    ) as number[];

    for (const cid of classIds) {
      allClassIdsSet.add(cid);
    }

    return {
      ...s1,
      catchUpVisitors,
      catchUpsForMissedLessons,
      classIds,
    };
  });

  const allClassIds = Array.from(allClassIdsSet);
  const needsFormation = stage2PerItem.some((s2) => s2 !== null && s2.item.groupFilter !== "normal");

  const [allBookVouchers, allFormationClasses, classHistoryTuple, allTeacherWorkshops] = await Promise.all([
    prisma.voucher.findMany({
      where: {
        paymentType: "BOOK",
        isVoided: false,
        issuedAt: {
          gte: minStartDate,
          lte: maxEndDate,
        },
        OR: [
          { class: { teacherId: teacherWhere } },
          ...(allClassIds.length > 0 ? [{ classId: { in: allClassIds } }] : []),
        ],
      },
      include: {
        class: { select: { id: true, name: true, branchId: true, isFormation: true, teacherId: true } },
        student: { select: { id: true, name: true } },
        refunds: true,
      },
    }),
    needsFormation
      ? prisma.class.findMany({
          where: {
            isFormation: true,
            OR: [
              { teacherId: teacherWhere },
              ...(allClassIds.length > 0 ? [{ id: { in: allClassIds } }] : []),
            ],
          },
          include: {
            FormationLevel: true,
            branch: true,
            enrollments: {
              include: {
                student: { select: { id: true, name: true } },
                payerHistory: { orderBy: { effectiveFrom: "asc" } },
              },
            },
          },
        })
      : Promise.resolve([]),
    allClassIds.length > 0
      ? Promise.all([
          prisma.lesson.findMany({
            where: {
              AND: [
                {
                  OR: [
                    { classId: { in: allClassIds } },
                    { lessonGroups: { some: { classId: { in: allClassIds } } } },
                  ],
                },
                {
                  OR: [{ attendances: { some: {} } }, { isTeacherAbsent: true }],
                },
              ],
              startsAt: { lte: maxEndDate },
            },
            select: {
              id: true,
              classId: true,
              branchId: true,
              startsAt: true,
              isFree: true,
              isTeacherAbsent: true,
              lessonGroups: { select: { classId: true } },
              branch: { select: { name: true } },
              class: { select: { id: true, name: true, pricePerCycle: true } },
            },
            orderBy: { startsAt: "asc" },
          }),
          prisma.attendance.findMany({
            where: {
              lesson: {
                OR: [
                  { classId: { in: allClassIds } },
                  { lessonGroups: { some: { classId: { in: allClassIds } } } },
                ],
                startsAt: { lte: maxEndDate },
              },
            },
            select: {
              lessonId: true,
              studentId: true,
              status: true,
              isRevisionVisitor: true,
              lesson: {
                select: {
                  classId: true,
                  startsAt: true,
                  lessonGroups: { select: { classId: true } },
                },
              },
            },
          }),
          prisma.catchUpAttendance.findMany({
            where: {
              missedLesson: {
                OR: [
                  { classId: { in: allClassIds } },
                  { lessonGroups: { some: { classId: { in: allClassIds } } } },
                ],
              },
              recordedAt: { lte: maxEndDate },
            },
            select: {
              studentId: true,
              missedLessonId: true,
              catchUpLessonId: true,
              recordedAt: true,
              recordedBy: true,
              catchUpLesson: { select: { id: true, startsAt: true, classId: true } },
              missedLesson: {
                select: {
                  classId: true,
                  lessonGroups: { select: { classId: true } },
                },
              },
            },
          }),
          prisma.class.findMany({
            where: { id: { in: allClassIds } },
            select: {
              id: true,
              name: true,
              branchId: true,
              pricePerCycle: true,
              isFormation: true,
              enrollments: {
                include: {
                  transfersTo: {
                    include: {
                      fromEnrollment: {
                        select: {
                          payerStatus: true,
                          discountType: true,
                          discountValue: true,
                          class: { select: { id: true, pricePerCycle: true } },
                        },
                      },
                    },
                  },
                  transfersFrom: true,
                  payerHistory: { orderBy: { effectiveFrom: "asc" } },
                  student: { select: { id: true, family: true } },
                },
              },
            },
          }),
          prisma.voucher.findMany({
            where: {
              OR: [{ classId: { in: allClassIds } }, { classId: null }],
              isVoided: false,
              isRefund: false,
              status: { not: "REFUNDED" },
              paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
              issuedAt: { lte: maxEndDate },
            },
            include: { refunds: true },
          }),
        ])
      : Promise.resolve(null),
    // Dawarat (Workshops) taught by these teachers, with their WORKSHOP payments in the period
    needsFormation
      ? prisma.workshop.findMany({
          where: { teacherId: teacherWhere },
          include: {
            Branch: { select: { id: true, name: true } },
            sessions: { select: { id: true, startsAt: true } },
            vouchers: {
              where: {
                paymentType: "WORKSHOP",
                isVoided: false,
                isRefund: false,
                status: { not: "REFUNDED" },
                issuedAt: { gte: minStartDate, lte: maxEndDate },
              },
              include: {
                refunds: true,
                student: { select: { id: true, name: true } },
              },
              orderBy: { issuedAt: "asc" },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const allFormationClassIds = allFormationClasses.map((fc) => fc.id);
  const [allFormationLessons, allFormationVouchers] =
    allFormationClassIds.length > 0
      ? await Promise.all([
          prisma.lesson.findMany({
            where: { classId: { in: allFormationClassIds } },
            select: { id: true, classId: true, startsAt: true, isTeacherAbsent: true, isFree: true },
            orderBy: { startsAt: "asc" },
          }),
          prisma.voucher.findMany({
            where: {
              classId: { in: allFormationClassIds },
              paymentType: "FORMATION",
              isVoided: false,
              isRefund: false,
              status: { not: "REFUNDED" },
              issuedAt: { lte: maxEndDate },
            },
            include: { refunds: true },
            orderBy: { issuedAt: "asc" },
          }),
        ])
      : [[], []];

  // Index global class history & formation records by classId once for fast per-item slicing
  const globalLessonByIdMap = new Map<number, any>();
  const globalClassByIdMap = new Map<number, any>();
  const globalLessonsByClass = new Map<number, any[]>();
  const globalAttendancesWithDateByClass = new Map<
    number,
    Array<{ lessonId: number; studentId: string; status: string; isRevisionVisitor?: boolean; startsAtMs: number }>
  >();
  const globalAttendancesByClass = new Map<
    number,
    Array<{ lessonId: number; studentId: string; status: string; isRevisionVisitor?: boolean }>
  >();
  const globalCatchUpsByClass = new Map<number, any[]>();
  const globalVouchersByClass = new Map<number, any[]>();
  const globalNullVouchers: any[] = [];

  for (const cid of allClassIds) {
    globalLessonsByClass.set(cid, []);
    globalAttendancesWithDateByClass.set(cid, []);
    globalAttendancesByClass.set(cid, []);
    globalCatchUpsByClass.set(cid, []);
    globalVouchersByClass.set(cid, []);
  }

  if (classHistoryTuple) {
    const [allClassLessons, allClassAttendances, allClassCatchUps, allClasses, allClassVouchers] =
      classHistoryTuple;

    for (const l of allClassLessons) {
      globalLessonByIdMap.set(l.id, l);
      globalLessonsByClass.get(l.classId)?.push(l);
      for (const lg of l.lessonGroups || []) {
        if (lg.classId !== l.classId) {
          globalLessonsByClass.get(lg.classId)?.push(l);
        }
      }
    }

    for (const c of allClasses) {
      globalClassByIdMap.set(c.id, c);
    }

    for (const a of allClassAttendances) {
      const targetClassIds = new Set<number>([a.lesson.classId]);
      for (const lg of a.lesson.lessonGroups || []) {
        targetClassIds.add(lg.classId);
      }
      const startsAtMs = new Date(a.lesson.startsAt).getTime();
      const stripped = {
        lessonId: a.lessonId,
        studentId: a.studentId,
        status: a.status,
        isRevisionVisitor: Boolean(a.isRevisionVisitor),
      };
      const withDate = { ...stripped, startsAtMs };
      for (const targetCid of targetClassIds) {
        globalAttendancesByClass.get(targetCid)?.push(stripped);
        globalAttendancesWithDateByClass.get(targetCid)?.push(withDate);
      }
    }

    for (const c of allClassCatchUps) {
      const targetClassIds = new Set<number>([c.missedLesson.classId]);
      for (const lg of c.missedLesson.lessonGroups || []) {
        targetClassIds.add(lg.classId);
      }
      const entry = {
        studentId: c.studentId,
        missedLessonId: c.missedLessonId,
        catchUpLessonId: c.catchUpLessonId,
        recordedAt: c.recordedAt,
        recordedBy: c.recordedBy,
        catchUpLesson: c.catchUpLesson,
      };
      for (const targetCid of targetClassIds) {
        globalCatchUpsByClass.get(targetCid)?.push(entry);
      }
    }

    for (const v of allClassVouchers) {
      if (v.classId === null) {
        globalNullVouchers.push(v);
      } else {
        globalVouchersByClass.get(v.classId)?.push(v);
      }
    }
  }

  const formationLessonsByClass = new Map<number, any[]>();
  for (const fl of allFormationLessons) {
    let list = formationLessonsByClass.get(fl.classId);
    if (!list) {
      list = [];
      formationLessonsByClass.set(fl.classId, list);
    }
    list.push(fl);
  }
  const formationVouchersByClass = new Map<number, any[]>();
  for (const fv of allFormationVouchers) {
    if (fv.classId === null) continue;
    let list = formationVouchersByClass.get(fv.classId);
    if (!list) {
      list = [];
      formationVouchersByClass.set(fv.classId, list);
    }
    list.push(fv);
  }

  const results: Array<TeacherPayrollCalculation | null> = [];
  for (const s2 of stage2PerItem) {
    if (!s2) {
      results.push(null);
      continue;
    }

    const { item, teacher, lessons, teacherClasses, salaryAdvancesList, photocopyChargesList, catchUpVisitors, catchUpsForMissedLessons, classIds } = s2;
    const itemStartMs = item.startDate.getTime();
    const itemEndMs = item.endDate.getTime();
    const needsEndDateFilter = itemEndMs < maxEndMs;
    const itemClassIdSet = new Set<number>(classIds);

    const bookVouchers = allBookVouchers.filter((bv) => {
      const issuedMs = new Date(bv.issuedAt).getTime();
      if (issuedMs < itemStartMs || issuedMs > itemEndMs) return false;
      return bv.class?.teacherId === teacher.id || (bv.classId !== null && itemClassIdSet.has(bv.classId));
    });

    const formationClasses =
      item.groupFilter === "normal"
        ? []
        : allFormationClasses.filter(
            (fc) => fc.teacherId === teacher.id || itemClassIdSet.has(fc.id)
          );

    const itemFormationLessons = formationClasses.flatMap(
      (fc) => formationLessonsByClass.get(fc.id) || []
    );
    const itemFormationVouchers = formationClasses.flatMap((fc) => {
      const list = formationVouchersByClass.get(fc.id) || [];
      return needsEndDateFilter
        ? list.filter((v) => new Date(v.issuedAt).getTime() <= itemEndMs)
        : list;
    });

    const classHistoryMap = new Map<number, any>();
    const lessonByIdMap = new Map<number, any>();

    if (classHistoryTuple) {
      const itemNullVouchers = needsEndDateFilter
        ? globalNullVouchers.filter((v) => new Date(v.issuedAt).getTime() <= itemEndMs)
        : globalNullVouchers;

      for (const cid of classIds) {
        const rawLessonsForClass = globalLessonsByClass.get(cid) || [];
        const cidLessons = needsEndDateFilter
          ? rawLessonsForClass.filter((l) => new Date(l.startsAt).getTime() <= itemEndMs)
          : rawLessonsForClass;

        for (const l of cidLessons) {
          lessonByIdMap.set(l.id, l);
        }

        const cidAttendances = needsEndDateFilter
          ? (globalAttendancesWithDateByClass.get(cid) || [])
              .filter((a) => a.startsAtMs <= itemEndMs)
              .map(({ lessonId, studentId, status, isRevisionVisitor }) => ({
                lessonId,
                studentId,
                status,
                isRevisionVisitor,
              }))
          : globalAttendancesByClass.get(cid) || [];

        const rawCatchUps = globalCatchUpsByClass.get(cid) || [];
        const cidCatchUps = needsEndDateFilter
          ? rawCatchUps.filter((c) => new Date(c.recordedAt).getTime() <= itemEndMs)
          : rawCatchUps;

        const rawCidVouchers = globalVouchersByClass.get(cid) || [];
        const cidVouchers = needsEndDateFilter
          ? rawCidVouchers.filter((v) => new Date(v.issuedAt).getTime() <= itemEndMs)
          : rawCidVouchers;

        classHistoryMap.set(cid, {
          lessons: cidLessons,
          attendances: cidAttendances,
          catchUps: cidCatchUps,
          classInfo: globalClassByIdMap.get(cid) ?? null,
          vouchers: [...cidVouchers, ...itemNullVouchers],
        });
      }
    }

    results.push(
      await computeTeacherPayrollFromData({
        startDate: item.startDate,
        endDate: item.endDate,
        groupFilter: item.groupFilter,
        teacher,
        lessons,
        teacherClasses,
        salaryAdvancesList,
        photocopyChargesList,
        catchUpVisitors,
        catchUpsForMissedLessons,
        bookVouchers,
        formationClasses,
        prefetchedFormationData: [itemFormationLessons, itemFormationVouchers],
        classHistoryMap,
        lessonByIdMap,
        workshops:
          item.groupFilter === "normal"
            ? []
            : allTeacherWorkshops.filter((ws) => ws.teacherId === teacher.id),
      })
    );
  }

  return results;
}

export async function computeTeacherPayrollFromData(params: {
  startDate: Date;
  endDate: Date;
  groupFilter: "all" | "normal" | "formation";
  teacher: any;
  lessons: any[];
  teacherClasses: Array<{ id: number; isFormation: boolean }>;
  salaryAdvancesList: any[];
  photocopyChargesList: any[];
  catchUpVisitors: any[];
  catchUpsForMissedLessons: Array<{ studentId: string; missedLessonId: number }>;
  bookVouchers: any[];
  formationClasses: any[];
  prefetchedFormationData: [any[], any[]];
  classHistoryMap: Map<
    number,
    {
      lessons: Array<{
        id: number;
        classId: number;
        branchId: number;
        startsAt: Date;
        isFree: boolean;
        isTeacherAbsent?: boolean;
        lessonGroups?: Array<{ classId: number }>;
        branch?: { name: string } | null;
        class?: { id: number; name: string; pricePerCycle: any } | null;
      }>;
      attendances: Array<{ lessonId: number; studentId: string; status: string; isRevisionVisitor?: boolean }>;
      catchUps: Array<{
        studentId: string;
        missedLessonId: number;
        catchUpLessonId?: number;
        recordedAt: Date;
        recordedBy?: string | null;
        catchUpLesson?: { id: number; startsAt: Date; classId: number } | null;
      }>;
      classInfo: any;
      vouchers: any[];
    }
  >;
  lessonByIdMap: Map<number, any>;
  workshops?: any[];
}): Promise<TeacherPayrollCalculation | null> {
  const {
    startDate,
    endDate,
    groupFilter,
    teacher,
    lessons,
    teacherClasses,
    salaryAdvancesList,
    photocopyChargesList,
    catchUpVisitors,
    catchUpsForMissedLessons,
    bookVouchers,
    formationClasses,
    prefetchedFormationData,
    classHistoryMap,
    lessonByIdMap,
    workshops = [],
  } = params;

  if (!teacher) return null;

  // Active general pay rate effective on or before endDate
  const activePayRate = teacher.TeacherPayRate.find(
    (r: any) => new Date(r.effectiveFrom) <= endDate
  ) || teacher.TeacherPayRate[0];

  const defaultSessionRate = activePayRate?.ratePerSession
    ? Number(activePayRate.ratePerSession)
    : 0;
  const fixedMonthly = (groupFilter === "formation")
    ? 0
    : (activePayRate?.fixedMonthly ? Number(activePayRate.fixedMonthly) : 0);
  const percentageOfSessionFee = activePayRate?.percentageOfSessionFee
    ? Number(activePayRate.percentageOfSessionFee)
    : null;

  // Map of branchId -> branch override rate
  const branchRateMap = new Map<number, number>();
  teacher.TeacherBranch.forEach((tb: any) => {
    if (tb.payRate !== null && tb.payRate !== undefined) {
      branchRateMap.set(tb.branchId, Number(tb.payRate));
    }
  });

  // Map of classId -> group-specific percentage override
  const classRateMap = new Map<number, number>();
  teacher.teacherClassRates?.forEach((tcr: any) => {
    if (tcr.percentage !== null && tcr.percentage !== undefined) {
      classRateMap.set(tcr.classId, Number(tcr.percentage));
    }
  });

  // Pre-calculate classification and voucher-payment weights for all students in all classes as of endDate and startDate
  const studentStatusAtEnd = new Map<string, any>();
  const studentStatusAtStart = new Map<string, any>();
  const studentSessionWeightAtEnd = new Map<string, number>();
  const studentSessionWeightAtStart = new Map<string, number>();
  const studentResolvedTransferHeldWeightAtEnd = new Map<string, number>();
  const studentResolvedTransferHeldWeightAtStart = new Map<string, number>();

  for (const [cid, historyData] of classHistoryMap.entries()) {
    const enrolledStudents = historyData.classInfo?.enrollments || [];
    const enrolledStudentIds = new Set(enrolledStudents.map((e: any) => e.studentId));
    const classTeacherPct = classRateMap.has(cid) ? classRateMap.get(cid)! : percentageOfSessionFee;

    const studentIds = Array.from(
      new Set([
        ...historyData.attendances.map((a: any) => a.studentId),
        ...historyData.catchUps.map((c: any) => c.studentId),
        ...enrolledStudents.map((e: any) => e.studentId),
      ].filter((sid: string) => enrolledStudentIds.has(sid)))
    ) as string[];

    for (const sid of studentIds) {
      const enrollment = enrolledStudents.find((e: any) => e.studentId === sid);
      const creditResetOffset = Number(enrollment?.creditResetOffset || 0);
      const payerHistory = enrollment?.payerHistory || null;

      const resolveSlotWeight = (
        slotIndexOneBased: number,
        schedule: PaidSessionSlotSchedule,
        lessonDate?: Date | string
      ): number => {
        if (schedule.unlimitedFreeClass) {
          if (lessonDate) {
            const period = resolvePayerPeriodAtDate(
              lessonDate,
              payerHistory,
              enrollment?.payerStatus,
              enrollment?.discountType,
              enrollment?.discountValue
            );
            if (period.payerStatus === "NON_PAYER" || period.payerStatus === "SCHOOL_FEES_ONLY") {
              return 0;
            }
          }
          return 1;
        }
        const slot = schedule.slots[slotIndexOneBased - 1];
        return slot ? slot.teacherPayWeight : 0;
      };

      const studentAttMap = new Map<number, string>(
        historyData.attendances
          .filter((a: any) => a.studentId === sid && !a.isRevisionVisitor)
          .map((a: any) => [a.lessonId, a.status])
      );
      const studentLessons = historyData.lessons.filter((l: any) => {
        const attStatus = studentAttMap.get(l.id);
        return isLessonApplicableToEnrollment(
          { ...l, hasExplicitAttendance: attStatus === "PRESENT", status: attStatus },
          cid,
          enrollment
        );
      });
      const studentLessonIds = new Set(studentLessons.map((l: any) => l.id));
      const historyLessonDateMap = new Map<number, Date>(
        historyData.lessons.map((l: any) => [l.id, new Date(l.startsAt)])
      );
      const studentRevisionStartsAt: Date[] = historyData.attendances
        .filter((a: any) => a.studentId === sid && a.isRevisionVisitor)
        .map((a: any) => historyLessonDateMap.get(a.lessonId))
        .filter((d): d is Date => Boolean(d));
      const studentAtts = historyData.attendances.filter(
        (a: any) => a.studentId === sid && studentLessonIds.has(a.lessonId)
      );
      const studentCatchUps = historyData.catchUps.filter(
        (c: any) => c.studentId === sid && c.recordedBy !== "transfer" && studentLessonIds.has(c.missedLessonId)
      );

      const validTransfersInAtEnd = (enrollment?.transfersTo || []).filter(
        (t: any) => !t.transferredAt || new Date(t.transferredAt) <= endDate
      );
      const latestTransferInTimeAtEnd =
        validTransfersInAtEnd.length > 0
          ? Math.max(...validTransfersInAtEnd.map((t: any) => new Date(t.transferredAt).getTime()))
          : null;

      // Classification as of endDate
      const classifiedAtEnd = classifyStudentAttendanceHistory({
        lessons: studentLessons,
        attendances: studentAtts,
        catchUps: studentCatchUps,
        referenceDate: endDate,
        creditResetOffset,
        postTransferStartAfter: latestTransferInTimeAtEnd ? new Date(latestTransferInTimeAtEnd) : null,
        payerHistory,
        enrolledAt: enrollment?.enrolledAt,
        revisionLessonStartsAt: studentRevisionStartsAt,
      });
      classifiedAtEnd.forEach((item) => {
        studentStatusAtEnd.set(`${sid}_${cid}_${item.lessonId}`, item);
        studentStatusAtEnd.set(`${sid}_${item.lessonId}`, item);
      });

      const sameTeacherHeldAtEnd = extractSameTeacherHeldFromTransfers(validTransfersInAtEnd);
      const postTransferStartBoundAtEnd =
        latestTransferInTimeAtEnd !== null ? latestTransferInTimeAtEnd - 2 * 60 * 60 * 1000 : null;
      const hasPostTransferPresenceAtEnd =
        postTransferStartBoundAtEnd !== null &&
        classifiedAtEnd.some(
          (h) =>
            new Date(h.startsAt).getTime() >= postTransferStartBoundAtEnd &&
            (h.classification === "PRESENT" || h.classification === "CAUGHT_UP_ABSENCE")
        );

      // Calculate paid session slot schedule & per-session weights as of endDate
      const scheduleAtEnd = computeStudentSlotScheduleForPayroll(
        sid,
        historyData.classInfo,
        historyData.vouchers,
        endDate,
        classTeacherPct
      );
      let consumedSlotAtEnd = 0;
      let paidTransferHeldWeightAtEnd = 0;
      if (sameTeacherHeldAtEnd > 0 && hasPostTransferPresenceAtEnd) {
        for (let k = 0; k < sameTeacherHeldAtEnd; k++) {
          consumedSlotAtEnd += 1;
          paidTransferHeldWeightAtEnd += resolveSlotWeight(consumedSlotAtEnd, scheduleAtEnd);
        }
      }
      studentResolvedTransferHeldWeightAtEnd.set(`${sid}_${cid}`, paidTransferHeldWeightAtEnd);

      const consumingLessonsAtEnd = classifiedAtEnd
        .filter(
          (h) =>
            h.classification === "PRESENT" ||
            h.classification === "INTERLEAVED_ABSENCE" ||
            (h.classification === "CAUGHT_UP_ABSENCE" && h.isConsumedCredit)
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      consumingLessonsAtEnd.forEach((item) => {
        consumedSlotAtEnd += 1;
        const primaryWeight = resolveSlotWeight(consumedSlotAtEnd, scheduleAtEnd, item.startsAt);
        studentSessionWeightAtEnd.set(`${sid}_${cid}_${item.lessonId}`, primaryWeight);
        studentSessionWeightAtEnd.set(`${sid}_${item.lessonId}`, primaryWeight);

        if (item.bothPresentAndCaughtUp) {
          consumedSlotAtEnd += 1;
          const extraCatchUpWeight = resolveSlotWeight(consumedSlotAtEnd, scheduleAtEnd, item.startsAt);
          studentSessionWeightAtEnd.set(`${sid}_${cid}_${item.lessonId}_catchup`, extraCatchUpWeight);
          studentSessionWeightAtEnd.set(`${sid}_${item.lessonId}_catchup`, extraCatchUpWeight);
        } else if (item.classification === "CAUGHT_UP_ABSENCE") {
          studentSessionWeightAtEnd.set(`${sid}_${cid}_${item.lessonId}_catchup`, primaryWeight);
          studentSessionWeightAtEnd.set(`${sid}_${item.lessonId}_catchup`, primaryWeight);
        }
      });

      // Classification & paid slot weights as of startDate (for retroactive payouts)
      const priorLessons = studentLessons.filter((l: any) => new Date(l.startsAt) < startDate);
      const validTransfersInAtStart = (enrollment?.transfersTo || []).filter(
        (t: any) => !t.transferredAt || new Date(t.transferredAt) < startDate
      );
      const latestTransferInTimeAtStart =
        validTransfersInAtStart.length > 0
          ? Math.max(...validTransfersInAtStart.map((t: any) => new Date(t.transferredAt).getTime()))
          : null;

      if (priorLessons.length > 0 || validTransfersInAtStart.length > 0) {
        const classifiedAtStart = classifyStudentAttendanceHistory({
          lessons: priorLessons,
          attendances: studentAtts.filter((a: any) => priorLessons.some((pl: any) => pl.id === a.lessonId)),
          catchUps: studentCatchUps.filter(
            (c: any) =>
              priorLessons.some((pl: any) => pl.id === c.missedLessonId) &&
              new Date(c.recordedAt) < startDate
          ),
          referenceDate: startDate,
          creditResetOffset,
          postTransferStartAfter: latestTransferInTimeAtStart ? new Date(latestTransferInTimeAtStart) : null,
          payerHistory,
          enrolledAt: enrollment?.enrolledAt,
          revisionLessonStartsAt: studentRevisionStartsAt.filter((d) => d < startDate),
        });
        classifiedAtStart.forEach((item) => {
          studentStatusAtStart.set(`${sid}_${cid}_${item.lessonId}`, item);
          studentStatusAtStart.set(`${sid}_${item.lessonId}`, item);
        });

        const sameTeacherHeldAtStart = extractSameTeacherHeldFromTransfers(validTransfersInAtStart);
        const postTransferStartBoundAtStart =
          latestTransferInTimeAtStart !== null ? latestTransferInTimeAtStart - 2 * 60 * 60 * 1000 : null;
        const hasPostTransferPresenceAtStart =
          postTransferStartBoundAtStart !== null &&
          classifiedAtStart.some(
            (h) =>
              new Date(h.startsAt).getTime() >= postTransferStartBoundAtStart &&
              (h.classification === "PRESENT" || h.classification === "CAUGHT_UP_ABSENCE")
          );

        const scheduleAtStart = computeStudentSlotScheduleForPayroll(
          sid,
          historyData.classInfo,
          historyData.vouchers,
          startDate,
          classTeacherPct
        );
        let consumedSlotAtStart = 0;
        let paidTransferHeldWeightAtStart = 0;
        if (sameTeacherHeldAtStart > 0 && hasPostTransferPresenceAtStart) {
          for (let k = 0; k < sameTeacherHeldAtStart; k++) {
            consumedSlotAtStart += 1;
            paidTransferHeldWeightAtStart += resolveSlotWeight(consumedSlotAtStart, scheduleAtStart);
          }
        }
        studentResolvedTransferHeldWeightAtStart.set(`${sid}_${cid}`, paidTransferHeldWeightAtStart);

        const consumingLessonsAtStart = classifiedAtStart
          .filter(
            (h) =>
              h.classification === "PRESENT" ||
              h.classification === "INTERLEAVED_ABSENCE" ||
              (h.classification === "CAUGHT_UP_ABSENCE" && h.isConsumedCredit)
          )
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

        consumingLessonsAtStart.forEach((item) => {
          consumedSlotAtStart += 1;
          const primaryWeight = resolveSlotWeight(consumedSlotAtStart, scheduleAtStart, item.startsAt);
          studentSessionWeightAtStart.set(`${sid}_${cid}_${item.lessonId}`, primaryWeight);
          studentSessionWeightAtStart.set(`${sid}_${item.lessonId}`, primaryWeight);

          if (item.bothPresentAndCaughtUp) {
            consumedSlotAtStart += 1;
            const extraCatchUpWeight = resolveSlotWeight(consumedSlotAtStart, scheduleAtStart, item.startsAt);
            studentSessionWeightAtStart.set(`${sid}_${cid}_${item.lessonId}_catchup`, extraCatchUpWeight);
            studentSessionWeightAtStart.set(`${sid}_${item.lessonId}_catchup`, extraCatchUpWeight);
          } else if (item.classification === "CAUGHT_UP_ABSENCE") {
            studentSessionWeightAtStart.set(`${sid}_${cid}_${item.lessonId}_catchup`, primaryWeight);
            studentSessionWeightAtStart.set(`${sid}_${item.lessonId}_catchup`, primaryWeight);
          }
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
  teacher.TeacherBranch.forEach((tb: any) => {
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

  // Track catch-up records where lessons taught in this period were the MISSED lessons.
  // If a student already caught up for lesson X in another group (as a visitor) AND was not also PRESENT in lesson X,
  // they must NOT be counted as paying or present in lesson X to prevent double compensation.
  const missedLessonCatchUpMap = new Map<number, Set<string>>();
  for (const c of catchUpsForMissedLessons) {
    if (!missedLessonCatchUpMap.has(c.missedLessonId)) {
      missedLessonCatchUpMap.set(c.missedLessonId, new Set<string>());
    }
    missedLessonCatchUpMap.get(c.missedLessonId)!.add(c.studentId);
  }

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

    // Actual student attendance (PRESENT regular attendees + catch-up visitors hosted + revision visitors)
    const visitorStudentIds = new Set(
      catchUpVisitors.filter((cv) => cv.catchUpLessonId === lesson.id).map((cv) => cv.studentId)
    );
    const visitorsInLesson = catchUpVisitors.filter((cv) => cv.catchUpLessonId === lesson.id);
    const caughtUpElsewhereStudents = missedLessonCatchUpMap.get(lesson.id);

    // Revision visitors
    const revisionVisitorAttendances = lesson.attendances.filter(
      (a: any) => a.status === "PRESENT" && (a as any).isRevisionVisitor
    );
    const revisionVisitorStudentIds = new Set(revisionVisitorAttendances.map((a: any) => a.studentId));

    // Regular present count excludes any student already counted as a catch-up visitor or revision visitor in this same lesson
    const regularPresentStudentIds = new Set(
      lesson.attendances
        .filter(
          (a: any) =>
            a.status === "PRESENT" &&
            !visitorStudentIds.has(a.studentId) &&
            !revisionVisitorStudentIds.has(a.studentId)
        )
        .map((a: any) => a.studentId)
    );
    const regularPresentCount = regularPresentStudentIds.size;
    const visitorCount = visitorsInLesson.length;
    const revisionVisitorCount = revisionVisitorStudentIds.size;
    const presentCount = regularPresentCount + visitorCount + revisionVisitorCount;

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

      lesson.attendances.forEach((att: any) => {
        // If this student is hosted as a visitor in this lesson, skip here (handled in visitorsInLesson)
        if (visitorStudentIds.has(att.studentId)) return;
        // If this student is a revision visitor, skip here (handled in revision visitors calculation below)
        if ((att as any).isRevisionVisitor || revisionVisitorStudentIds.has(att.studentId)) return;
        // If this student already caught up for this missed lesson elsewhere AND was not PRESENT in this lesson, skip here (paid in host lesson)
        if (caughtUpElsewhereStudents?.has(att.studentId) && att.status !== "PRESENT") return;
        // Skip duplicate student attendance records to guarantee accurate calculation
        if (countedPayingStudentIds.has(att.studentId)) return;

        // Resolve student enrollment across primary group and secondary merged groups
        let enrollment = lesson.class?.enrollments?.find((e: any) => e.studentId === att.studentId);
        let enrolledClassId = lesson.classId;

        if (!enrollment || enrollment.status === "TRANSFERRED") {
          const secondaryGroups = (lesson as any).lessonGroups || [];
          for (const lg of secondaryGroups) {
            const lgEnr = lg.class?.enrollments?.find((e: any) => e.studentId === att.studentId);
            if (lgEnr && (lgEnr.status === "ACTIVE" || !enrollment)) {
              enrollment = lgEnr;
              enrolledClassId = lg.classId;
              if (lgEnr.status === "ACTIVE") break;
            }
          }
        }

        const classification =
          studentStatusAtEnd.get(`${att.studentId}_${enrolledClassId}_${lesson.id}`) ||
          studentStatusAtEnd.get(`${att.studentId}_${lesson.id}`);

        if (classification && classification.isTeacherPayable) {
          // Rule: Teacher is paid ONLY if student session is covered by paid tuition vouchers,
          // weighted by the exact snapshotted payer weight of the covering voucher slot (0..1).
          let sessionWeight =
            studentSessionWeightAtEnd.get(`${att.studentId}_${enrolledClassId}_${lesson.id}`) ??
            studentSessionWeightAtEnd.get(`${att.studentId}_${lesson.id}`) ??
            0;

          if (sessionWeight <= 0 && (lesson as any).lessonGroups) {
            for (const lg of (lesson as any).lessonGroups) {
              const lgWeight = studentSessionWeightAtEnd.get(`${att.studentId}_${lg.classId}_${lesson.id}`) ?? 0;
              if (lgWeight > 0) {
                sessionWeight = lgWeight;
                break;
              }
            }
          }

          if (sessionWeight <= 0) {
            // Unpaid / NON_PAYER / SCHOOL_FEES_ONLY / 100%-waived session: teacher receives 0 DZD
            return;
          }

          countedPayingStudentIds.add(att.studentId);
          payingWeight += sessionWeight;
        }
      });

      // Catch-up visitors hosted in this lesson are paid as PRESENT ONLY if covered by paid credits in their home group (Rule 8)
      visitorsInLesson.forEach((cv) => {
        if (countedPayingStudentIds.has(cv.studentId)) return;

        const missedClassId = cv.missedLesson?.classId || lesson.classId;
        const isSameGroupCatchUp = missedClassId === lesson.classId;
        const catchUpWeight = isSameGroupCatchUp
          ? (studentSessionWeightAtEnd.get(`${cv.studentId}_${lesson.classId}_${lesson.id}`) ??
             studentSessionWeightAtEnd.get(`${cv.studentId}_${lesson.id}`) ??
             0)
          : (studentSessionWeightAtEnd.get(`${cv.studentId}_${missedClassId}_${cv.missedLessonId}_catchup`) ??
             studentSessionWeightAtEnd.get(`${cv.studentId}_${cv.missedLessonId}_catchup`) ??
             studentSessionWeightAtEnd.get(`${cv.studentId}_${missedClassId}_${cv.missedLessonId}`) ??
             0);

        if (catchUpWeight <= 0) {
          // Unpaid catch-up or zero-weight payer status: held until paid or 0 DZD
          return;
        }

        countedPayingStudentIds.add(cv.studentId);
        payingWeight += catchUpWeight;
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

    // Process Revision Visitors: Teacher is paid on the full entered value (following the percentage)
    let revisionVisitorsGross = 0;
    let revisionVisitorsTeacherCut = 0;
    let revisionVisitorsSchoolCut = 0;
    let revisionVisitorsPayingCount = 0;

    if (!lesson.isFree && !lesson.class?.isFormation && revisionVisitorAttendances.length > 0) {
      const lessonVouchers = (lesson as any).vouchers || [];
      const teacherPct =
        appliedGroupPercentage !== null && appliedGroupPercentage > 0
          ? appliedGroupPercentage
          : (percentageOfSessionFee ?? 0);

      revisionVisitorAttendances.forEach((rAtt: any) => {
        // Find matching REVISION_SESSION voucher for this student & lesson
        const v = lessonVouchers.find(
          (voucher: any) =>
            voucher.studentId === rAtt.studentId &&
            voucher.paymentType === "REVISION_SESSION" &&
            !voucher.isVoided
        );
        if (v) {
          const refunded = (v.refunds || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          const netPaid = Math.max(0, Number(v.amount || 0) - refunded);
          if (netPaid > 0) {
            const vTeacherCut = Math.round(((netPaid * teacherPct) / 100) * 100) / 100;
            const vSchoolCut = Math.max(0, netPaid - vTeacherCut);

            revisionVisitorsGross += netPaid;
            revisionVisitorsTeacherCut += vTeacherCut;
            revisionVisitorsSchoolCut += vSchoolCut;
            revisionVisitorsPayingCount += 1;
          }
        }
      });
    }

    lessonAmount += revisionVisitorsTeacherCut;
    lessonTuition += revisionVisitorsGross;
    lessonSchoolCut += revisionVisitorsSchoolCut;

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
      payingCount: Math.round((payingWeight + revisionVisitorsPayingCount) * 100) / 100,
      pricePerCycle,
      sessionPrice,
      teacherCut: effectiveRateForSession,
      schoolCut: lessonSchoolCut,
      appliedPercentage: appliedGroupPercentage !== null ? appliedGroupPercentage : undefined,
      lessonAmount,
      isFree: lesson.isFree,
      isExtra: lesson.isExtra,
      isCatchUp: lesson.isCatchUp,
      tuitionGross: lessonTuition,
    });
  });

  // Process 100% Teacher Book Revenue (Rule: 100% for the teacher, 0% school cut)
  let totalBookRevenue = 0;
  const bookRevenueDetails: NonNullable<TeacherPayrollCalculation["bookRevenueDetails"]> = [];

  bookVouchers.forEach((bv) => {
    // If calculating formation groups only, skip normal book vouchers
    if (groupFilter === "formation") {
      return;
    }
    // Formation groups books are 100% school part (0% teacher part, same as inscription fees)
    if (bv.class?.isFormation) {
      return;
    }
    const refunded = bv.refunds?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;
    const netBookAmount = Math.max(0, Number(bv.amount) - refunded);
    if (netBookAmount > 0) {
      totalBookRevenue += netBookAmount;
      calculatedGross += netBookAmount;

      const targetBranchId = bv.targetBranchId || bv.class?.branchId || teacher.TeacherBranch[0]?.branchId || 1;
      const resolvedBranchName =
        branchSessionsMap.get(targetBranchId)?.branchName ||
        teacher.TeacherBranch.find((tb: any) => tb.branchId === targetBranchId)?.Branch.name ||
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
        branchId: targetBranchId,
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
      const plAttendances = historyData.attendances.filter((a) => a.lessonId === pl.id && !a.isRevisionVisitor);
      let eligiblePayingWeight = 0;
      let lateTuitionSettlementCount = 0;
      let resolvedAbsenceCount = 0;

      for (const att of plAttendances) {
        const atStart =
          studentStatusAtStart.get(`${att.studentId}_${cid}_${pl.id}`) ||
          studentStatusAtStart.get(`${att.studentId}_${pl.id}`);
        const atEnd =
          studentStatusAtEnd.get(`${att.studentId}_${cid}_${pl.id}`) ||
          studentStatusAtEnd.get(`${att.studentId}_${pl.id}`);

        const weightAtStart =
          studentSessionWeightAtStart.get(`${att.studentId}_${cid}_${pl.id}`) ??
          studentSessionWeightAtStart.get(`${att.studentId}_${pl.id}`) ??
          0;
        const weightAtEnd =
          studentSessionWeightAtEnd.get(`${att.studentId}_${cid}_${pl.id}`) ??
          studentSessionWeightAtEnd.get(`${att.studentId}_${pl.id}`) ??
          0;

        const wasPaidAtStart = weightAtStart > 0;
        const isPaidAtEnd = weightAtEnd > 0;

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
              if (a.studentId !== att.studentId || a.status !== "PRESENT" || a.isRevisionVisitor) return false;
              const l = historyData.lessons.find((les: any) => les.id === a.lessonId);
              if (!l) return false;
              const lDate = new Date(l.startsAt);
              return lDate >= startDate && lDate <= endDate;
            });
          }

          if (isEligible && weightAtEnd > 0) {
            eligiblePayingWeight += weightAtEnd;
            if (isLateTuitionSettlement) lateTuitionSettlementCount++;
            if (isResolvedAbsence) resolvedAbsenceCount++;
          }
        }
      }

      // Condition C: Late tuition settlement for cross-group catch-up visits that occurred before startDate
      const plCatchUps = historyData.catchUps.filter(
        (c) =>
          c.missedLessonId === pl.id &&
          c.recordedBy !== "transfer" &&
          c.catchUpLesson &&
          c.catchUpLesson.classId !== cid &&
          new Date(c.catchUpLesson.startsAt) >= previousMonthStart &&
          new Date(c.catchUpLesson.startsAt) < startDate
      );
      for (const cu of plCatchUps) {
        const catchUpWeightAtStart =
          studentSessionWeightAtStart.get(`${cu.studentId}_${cid}_${pl.id}_catchup`) ??
          studentSessionWeightAtStart.get(`${cu.studentId}_${pl.id}_catchup`) ??
          0;
        const catchUpWeightAtEnd =
          studentSessionWeightAtEnd.get(`${cu.studentId}_${cid}_${pl.id}_catchup`) ??
          studentSessionWeightAtEnd.get(`${cu.studentId}_${pl.id}_catchup`) ??
          0;

        if (catchUpWeightAtStart <= 0 && catchUpWeightAtEnd > 0) {
          eligiblePayingWeight += catchUpWeightAtEnd;
          lateTuitionSettlementCount++;
        }
      }

      if (eligiblePayingWeight > 0) {
        const lessonRecord =
          lessonByIdMap.get(pl.id) ??
          (await prisma.lesson.findUnique({
            where: { id: pl.id },
            include: { branch: true, class: true },
          }));
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

    // Condition D: Same-teacher transfer held absences ([SAME_TEACHER_HELD:N]) that resolved and became paid during [startDate, endDate]
    let newlyResolvedTransferWeight = 0;
    let newlyResolvedTransferCount = 0;
    for (const enr of historyData.classInfo?.enrollments || []) {
      const paidHeldWeightAtStart = studentResolvedTransferHeldWeightAtStart.get(`${enr.studentId}_${cid}`) || 0;
      const paidHeldWeightAtEnd = studentResolvedTransferHeldWeightAtEnd.get(`${enr.studentId}_${cid}`) || 0;
      const deltaWeight = Math.max(0, Math.round((paidHeldWeightAtEnd - paidHeldWeightAtStart) * 10000) / 10000);
      if (deltaWeight > 0) {
        newlyResolvedTransferWeight += deltaWeight;
        newlyResolvedTransferCount += 1;
      }
    }

    if (newlyResolvedTransferWeight > 0) {
      const pricePerCycle = historyData.classInfo?.pricePerCycle
        ? Number(historyData.classInfo.pricePerCycle)
        : 0;
      const sessionPrice = pricePerCycle > 0 ? pricePerCycle / 4 : 0;
      const retroGroupPercentage = classRateMap.has(cid)
        ? classRateMap.get(cid)!
        : (percentageOfSessionFee ?? null);
      const teacherRatePerStudent =
        retroGroupPercentage !== null && retroGroupPercentage > 0
          ? (sessionPrice * retroGroupPercentage) / 100
          : defaultSessionRate;

      const totalTeacherCut = Math.round(newlyResolvedTransferWeight * teacherRatePerStudent * 100) / 100;
      const totalRetroTuition = Math.round(newlyResolvedTransferWeight * sessionPrice * 100) / 100;
      const totalRetroSchoolCut = Math.max(0, totalRetroTuition - totalTeacherCut);

      if (totalTeacherCut > 0) {
        totalTuitionGross += totalRetroTuition;
        schoolGrossAmount += totalRetroSchoolCut;
        calculatedGross += totalTeacherCut;

        const targetBranchId = historyData.classInfo?.branchId || teacher.TeacherBranch[0]?.branchId || 1;
        const resolvedBranchName =
          branchSessionsMap.get(targetBranchId)?.branchName ||
          teacher.TeacherBranch.find((tb: any) => tb.branchId === targetBranchId)?.Branch.name ||
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
        bEntry.amount += totalTeacherCut;
        bEntry.totalTuition = (bEntry.totalTuition || 0) + totalRetroTuition;
        bEntry.schoolAmount = (bEntry.schoolAmount || 0) + totalRetroSchoolCut;
        branchSessionsMap.set(targetBranchId, bEntry);

        const refLesson = historyData.lessons[historyData.lessons.length - 1];
        sessionDetails.push({
          lessonId: refLesson?.id || 0,
          startsAt: refLesson ? new Date(refLesson.startsAt) : new Date(endDate),
          className: historyData.classInfo?.name || "فوج",
          branchName: resolvedBranchName,
          presentCount: 0,
          payingCount: Math.round(newlyResolvedTransferWeight * 100) / 100,
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
          retroactiveNote: `تسوية غياب محول من فوج سابق لنفس الأستاذ (${newlyResolvedTransferCount})`,
        });
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

  if (formationClasses.length > 0) {
    const formationClassIds = formationClasses.map((fc) => fc.id);
    const [allFormationLessons, allFormationVouchers] =
      prefetchedFormationData ??
      (await Promise.all([
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
      ]));

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
        const studentVouchers = classVouchers.filter((v) => v.studentId === enr.studentId);

        if ((enr.status === "TRANSFERRED" || enr.status === "UNENROLLED") && studentVouchers.length === 0) {
          continue;
        }

        let totalPaidToEnd = 0;
        let totalPaidToStart = 0;

        studentVouchers.forEach((v) => {
          const vAmount = Number(v.amount || 0);
          const refunded = (v.refunds || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
          const netPaid = Math.max(0, vAmount - refunded);

          if (new Date(v.issuedAt) <= endDate) {
            totalPaidToEnd += netPaid;
          }
          if (new Date(v.issuedAt) < startDate) {
            totalPaidToStart += netPaid;
          }
        });

        // Skip NON_PAYER and SCHOOL_FEES_ONLY enrollments unless they had an already-paid historical voucher before switching
        const hasTeacherPayableSnapshot = studentVouchers.some(
          (v) => v.appliedPayerStatus && v.appliedPayerStatus !== "NON_PAYER" && v.appliedPayerStatus !== "SCHOOL_FEES_ONLY"
        );
        if ((pStatus === "NON_PAYER" || pStatus === "SCHOOL_FEES_ONLY") && (!hasTeacherPayableSnapshot || totalPaidToEnd <= 0)) {
          continue;
        }

        const currentDiscFee =
          pStatus === "DISCOUNTED"
            ? computeStudentSessionFee({
                payerStatus: "DISCOUNTED",
                discountType: (enr as any).discountType,
                discountValue: (enr as any).discountValue,
                pricePerCycle: levelPrice,
                teacherPercentage: teacherRatePct,
                isFormation: true,
              }).studentCycleFee
            : levelPrice;

        const latestSnapVoucher = [...studentVouchers]
          .reverse()
          .find((v) => v.effectiveCyclePrice !== undefined && v.effectiveCyclePrice !== null);

        const studentLevelPrice =
          pStatus === "DISCOUNTED"
            ? latestSnapVoucher && totalPaidToEnd > currentDiscFee
              ? Math.max(currentDiscFee, Number(latestSnapVoucher.effectiveCyclePrice))
              : currentDiscFee
            : latestSnapVoucher && totalPaidToEnd > 0
            ? Number(latestSnapVoucher.effectiveCyclePrice)
            : levelPrice;

        const studentHalfPriceCap = studentLevelPrice > 0 ? studentLevelPrice / 2 : 0;

        let cycleRecognizedBase = 0;

        if (monthDiff === 0) {
          // Month 1 (First Cycle): Capped at 50% of the student's effective formation level fee
          cycleRecognizedBase = Math.min(totalPaidToEnd, studentHalfPriceCap);
        } else if (monthDiff === 1) {
          // Month 2 (Second Cycle): Recognized base is what remains of total payment up to studentLevelPrice
          const base1 = Math.min(totalPaidToStart, studentHalfPriceCap);
          cycleRecognizedBase = Math.max(0, Math.min(totalPaidToEnd - base1, studentLevelPrice - base1));
        } else {
          // Month 3+ (Post-Cycle settlements): Any delayed payments above prior recognized base
          const priorRecognized = Math.min(totalPaidToStart, studentLevelPrice);
          cycleRecognizedBase = Math.max(0, Math.min(totalPaidToEnd - priorRecognized, studentLevelPrice - priorRecognized));
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
          totalLevelPrice: studentLevelPrice,
          totalPaidToDate: totalPaidToEnd,
          cycleRecognizedBase,
          teacherPercentage: teacherRatePct,
          teacherAmount: studentTeacherCut,
          schoolAmount: studentSchoolCut,
          status:
            studentLevelPrice <= 0
              ? "FULL"
              : totalPaidToEnd >= studentLevelPrice
              ? "FULL"
              : totalPaidToEnd > 0
              ? "PARTIAL"
              : "UNPAID",
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

  // 3b. Process Dawarat (Workshops) — every WORKSHOP payment received in this period (net of refunds)
  // is split between the assigned teacher (configured percentage) and the school (remainder).
  // Applies equally to existing school students and walk-in (non-registered) participants.
  const workshopStudentBreakdown: NonNullable<TeacherPayrollCalculation["workshopStudentBreakdown"]> = [];
  const workshopGroupSummaries: Array<{
    className: string;
    branchName: string;
    courseSessionsCount: number;
    payingCount: number;
    teacherAmount: number;
    tuitionGross: number;
    schoolAmount: number;
    appliedPercentage: number;
  }> = [];

  if (groupFilter !== "normal" && workshops.length > 0) {
    const hasNoPayConfig =
      (teacher.TeacherPayRate?.length ?? 0) === 0 && defaultSessionRate === 0 && fixedMonthly === 0;
    const rawWorkshopPct = activePayRate?.percentageOfSessionFee;
    const workshopTeacherPct =
      rawWorkshopPct !== null && rawWorkshopPct !== undefined
        ? Math.min(100, Math.max(0, Number(rawWorkshopPct)))
        : hasNoPayConfig
        ? 40
        : 0;

    for (const ws of workshops) {
      const branchName = ws.Branch?.name || `Siège ${ws.branchId}`;
      const wsVouchers = (ws.vouchers || []).filter((v: any) => {
        const d = new Date(v.issuedAt);
        return d >= startDate && d <= endDate;
      });
      const wsSessionsInPeriod = (ws.sessions || []).filter((s: any) => {
        const d = new Date(s.startsAt);
        return d >= startDate && d <= endDate;
      });

      const paidByStudent = new Map<string, { name: string; paid: number }>();
      for (const v of wsVouchers) {
        const refunded = (v.refunds || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const netPaid = Math.max(0, Number(v.amount || 0) - refunded);
        if (netPaid <= 0) continue;
        const entry = paidByStudent.get(v.studentId) || { name: v.student?.name || v.studentId, paid: 0 };
        entry.paid += netPaid;
        paidByStudent.set(v.studentId, entry);
      }

      let wsTuitionGross = 0;
      let wsTeacherGross = 0;
      let wsSchoolGross = 0;

      for (const [studentId, info] of paidByStudent.entries()) {
        const paid = Math.round(info.paid * 100) / 100;
        const teacherCut = Math.round(((paid * workshopTeacherPct) / 100) * 100) / 100;
        const schoolCut = Math.max(0, Math.round((paid - teacherCut) * 100) / 100);
        wsTuitionGross += paid;
        wsTeacherGross += teacherCut;
        wsSchoolGross += schoolCut;
        workshopStudentBreakdown.push({
          workshopId: ws.id,
          workshopTitle: ws.title,
          branchName,
          studentId,
          studentName: info.name,
          workshopPrice: Number(ws.totalPrice || 0),
          paidInPeriod: paid,
          teacherPercentage: workshopTeacherPct,
          teacherAmount: teacherCut,
          schoolAmount: schoolCut,
        });
      }

      if (wsTuitionGross <= 0 && wsSessionsInPeriod.length === 0) continue;

      wsTuitionGross = Math.round(wsTuitionGross * 100) / 100;
      wsTeacherGross = Math.round(wsTeacherGross * 100) / 100;
      wsSchoolGross = Math.round(wsSchoolGross * 100) / 100;

      workshopGroupSummaries.push({
        className: `${ws.title} (Dawarat)`,
        branchName,
        courseSessionsCount: wsSessionsInPeriod.length,
        payingCount: paidByStudent.size,
        teacherAmount: wsTeacherGross,
        tuitionGross: wsTuitionGross,
        schoolAmount: wsSchoolGross,
        appliedPercentage: workshopTeacherPct,
      });

      totalSessions += wsSessionsInPeriod.length;
      calculatedGross += wsTeacherGross;
      totalTuitionGross += wsTuitionGross;
      schoolGrossAmount += wsSchoolGross;

      const bEntry = branchSessionsMap.get(ws.branchId) || {
        branchName,
        totalSessions: 0,
        freeSessions: 0,
        amount: 0,
        totalTuition: 0,
        schoolAmount: 0,
        totalPresentAttendances: 0,
      };
      bEntry.totalSessions += wsSessionsInPeriod.length;
      bEntry.amount += wsTeacherGross;
      bEntry.totalTuition = (bEntry.totalTuition || 0) + wsTuitionGross;
      bEntry.schoolAmount = (bEntry.schoolAmount || 0) + wsSchoolGross;
      branchSessionsMap.set(ws.branchId, bEntry);
    }
  }

  const branchBreakdown: TeacherPayrollCalculation["branchBreakdown"] = [];

  for (const [branchId, data] of branchSessionsMap.entries()) {
    // Only include branches with activity (lessons, teacher/school amounts or tuition), unless fixedMonthly applies
    if (
      data.totalSessions === 0 &&
      data.amount === 0 &&
      (data.schoolAmount || 0) === 0 &&
      (data.totalTuition || 0) === 0 &&
      fixedMonthly === 0
    ) continue;

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

  let totalAdvances = salaryAdvancesList.reduce(
    (sum, a) => sum + Number(a.amount),
    0
  );

  // If calculating formation groups only and the teacher also has normal groups, reserve advances for the normal/consolidated run
  if (groupFilter === "formation") {
    const normalClassesCount = teacherClasses.filter((tc) => !tc.isFormation).length;
    if (normalClassesCount > 0) {
      totalAdvances = 0;
    }
  }

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
        const lessonTuition = s.tuitionGross ?? Math.round(payingCountForLesson * s.sessionPrice * 100) / 100;
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

  // Apply Dawarat (workshop) summaries into groupBreakdownMap
  workshopGroupSummaries.forEach((wSum) => {
    const key = `${wSum.className}___${wSum.branchName}`;
    const g = groupBreakdownMap.get(key) || {
      className: wSum.className,
      branchName: wSum.branchName,
      courseSessionsCount: 0,
      payableLessonsCount: 0,
      paidSessionsCount: 0,
      freeSessionsCount: 0,
      totalSessionsCount: 0,
      amount: 0,
      tuitionGross: 0,
      schoolAmount: 0,
      appliedPercentage: wSum.appliedPercentage,
    };
    g.courseSessionsCount += wSum.courseSessionsCount;
    g.totalSessionsCount += wSum.courseSessionsCount;
    g.payableLessonsCount += wSum.payingCount;
    g.paidSessionsCount = g.payableLessonsCount;
    g.amount += wSum.teacherAmount;
    g.tuitionGross += wSum.tuitionGross;
    g.schoolAmount += wSum.schoolAmount;
    g.appliedPercentage = wSum.appliedPercentage;
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
    calculationScope: groupFilter,
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
    workshopStudentBreakdown,
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
      remarque: a.remarque || null,
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
    isFixedMonthly: fixedMonthly > 0,
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
  targetTeacherId?: string,
  groupFilter: "all" | "normal" | "formation" = "all",
  targetBonus: number = 0
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
    const calc = await calculateTeacherPayroll(t.id, startDate, endDate, groupFilter);
    // Only include teachers who taught lessons, had absences, have fixed salary, or have deductions
    // If targetTeacherId is provided, always include the calculation
    if (
      calc &&
      (targetTeacherId ||
        calc.totalSessions > 0 ||
        (calc.teacherAbsencesCount && calc.teacherAbsencesCount > 0) ||
        calc.grossAmount > 0 ||
        (calc.schoolGrossAmount ?? 0) > 0 ||
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

        const isTarget = targetTeacherId && calc.teacherId === targetTeacherId;
        const teacherBonus = isTarget ? (Number(targetBonus) || 0) : 0;
        const netAfterBonus = Math.max(0, calc.netAmount + teacherBonus);

        await tx.payslip.create({
          data: {
            payrollRunId: payrollRun.id,
            personId: calc.teacherId,
            personType: "TEACHER",
            sessionsCount: calc.totalSessions,
            grossAmount: new Prisma.Decimal(calc.grossAmount),
            bonus: new Prisma.Decimal(teacherBonus),
            advances: new Prisma.Decimal(calc.salaryAdvances),
            photocopyDeductions: new Prisma.Decimal(calc.photocopyDeductions),
            netAmount: new Prisma.Decimal(netAfterBonus),
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
            bonus: new Prisma.Decimal(0),
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
 * Updates a PayrollRun status (DRAFT -> VALIDATED -> PAID) and keeps Caisse Noire synced.
 */
export async function updatePayrollRunStatus(
  payrollRunId: number,
  newStatus: "DRAFT" | "VALIDATED" | "PAID",
  opts?: {
    fundingSource?: string | null;
    targetPayslipId?: number;
    recordedBy?: string;
  }
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

    const teacherSlips = run.Payslip.filter((p) => p.personType === "TEACHER");
    const targetedSlips = opts?.targetPayslipId
      ? teacherSlips.filter((p) => p.id === opts.targetPayslipId)
      : teacherSlips;

    if (newStatus === "PAID") {
      const teacherIds = Array.from(new Set(targetedSlips.map((p) => p.personId)));
      const teachers = teacherIds.length > 0
        ? await tx.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
        : [];
      const teacherNameMap = new Map(teachers.map((t) => [t.id, t.name]));

      for (const slip of targetedSlips) {
        const slipFunding = opts?.fundingSource
          ? normalizeOutcomeFundingSource(opts.fundingSource)
          : normalizeOutcomeFundingSource((slip as any).fundingSource);
        const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
          existingTxId: (slip as any).caisseNoireTxId,
          fundingSource: slipFunding,
          isDisbursed: true,
          amount: Number(slip.netAmount),
          description: `[Paie Enseignant] ${teacherNameMap.get(slip.personId) || slip.personId} (Cycle #${payrollRunId})`,
          date: new Date(),
          recordedBy: opts?.recordedBy || "owner",
        });

        await tx.payslip.update({
          where: { id: slip.id },
          data: {
            fundingSource: slipFunding,
            caisseNoireTxId: cnTxId,
          },
        });
      }
    }

    // If unmarking from PAID back to DRAFT/VALIDATED, clean up any legacy ledger entries & Caisse Noire links
    if (run.status === "PAID" && newStatus !== "PAID") {
      await tx.dailyLedger.deleteMany({
        where: {
          type: "PAYROLL_OUT" as any,
          date: run.periodEnd,
        },
      });
      await cleanupCaisseNoireLinks(
        tx,
        teacherSlips.map((p) => (p as any).caisseNoireTxId)
      );
      if (teacherSlips.length > 0) {
        await tx.payslip.updateMany({
          where: { id: { in: teacherSlips.map((p) => p.id) } },
          data: { caisseNoireTxId: null },
        });
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
 * 2. Linked CaisseNoireTransaction withdrawals
 * 3. Payslip entries
 * 4. Any DailyLedger PAYROLL_OUT entries posted if the run was marked PAID
 * 5. The PayrollRun itself
 */
export async function deletePayrollRun(payrollRunId: number) {
  return await prisma.$transaction(
    async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        Payslip: {
          select: { id: true, caisseNoireTxId: true },
        },
      },
    });

    if (!run) {
      throw new Error(`Payroll run #${payrollRunId} not found`);
    }

    const payslipIds = run.Payslip.map((p) => p.id);
    await cleanupCaisseNoireLinks(
      tx,
      run.Payslip.map((p) => p.caisseNoireTxId)
    );

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
  const normStartDate = normalizeDateToStartOfDay(startDate);
  const normEndDate = normalizeDateToEndOfDay(endDate);
  startDate = normStartDate;
  endDate = normEndDate;

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
        periodStart: { lte: endDate },
        periodEnd: { gte: startDate },
        status: { in: ["PAID", "VALIDATED", "CONFIRMED"] },
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
      bonus?: number;
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
        (calc.schoolGrossAmount ?? 0) > 0 ||
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
      bonus: saved ? Number((saved as any).bonus || 0) : 0,
      advances: saved ? Number(saved.advances) : calc.salaryAdvances,
      advanceDetails: calc.salaryAdvanceDetails?.map((a) => ({
        id: a.id,
        amount: a.amount,
        date: a.date,
        remarque: a.remarque || null,
      })),
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

export interface TeacherMonthlySalaryPoint {
  year: number;
  month: number; // 1-12
  monthKey: string; // "YYYY-MM"
  label: string; // e.g. "Novembre 2026"
  shortLabel: string; // e.g. "Nov. 2026"
  sessionsCount: number;
  grossAmount: number;
  netAmount: number;
  growthRate: number | null; // % change vs previous month (1 decimal place), null on baseline or 0 prev
  growthDelta: number | null; // DZD change vs previous month, null on baseline
  isCurrentPeriod?: boolean;
}

function parseUtcYearMonth(dateInput: Date | string): { year: number; month0: number } {
  if (typeof dateInput === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
    if (m) {
      return { year: Number(m[1]), month0: Number(m[2]) - 1 };
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return { year: now.getUTCFullYear(), month0: now.getUTCMonth() };
  }
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
}

function capitalizeFrenchLabel(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Computes the last 3 calendar months of consolidated salary & month-over-month growth
 * for a teacher, anchored to `referenceDate` (typically the payslip's `periodEnd`).
 * Uses a single batched payroll pass (`calculateTeachersPayrollBatch`) plus finalized
 * `Payslip` records so both confirmed and unsaved months are accurately represented.
 */
export async function getTeacherThreeMonthSalaryGrowth(params: {
  teacherId: string;
  referenceDate: Date | string;
  groupFilter?: "all" | "normal" | "formation";
  currentPeriodOverride?: {
    periodStart?: Date | string;
    periodEnd?: Date | string;
    grossAmount: number;
    netAmount: number;
    sessionsCount?: number;
  };
}): Promise<TeacherMonthlySalaryPoint[]> {
  const { teacherId, referenceDate, groupFilter = "all", currentPeriodOverride } = params;
  const { year: refYear, month0: refMonth0 } = parseUtcYearMonth(referenceDate);

  const longFmt = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortFmt = new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const windows = [-2, -1, 0].map((offset) => {
    const start = new Date(Date.UTC(refYear, refMonth0 + offset, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(refYear, refMonth0 + offset + 1, 0, 23, 59, 59, 999));
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;
    return {
      offset,
      start,
      end,
      year,
      month,
      monthKey: `${year}-${String(month).padStart(2, "0")}`,
      label: capitalizeFrenchLabel(longFmt.format(start)),
      shortLabel: capitalizeFrenchLabel(shortFmt.format(start)),
    };
  });

  const [batchCalcs, savedPayslips] = await Promise.all([
    calculateTeachersPayrollBatch(
      windows.map((w) => ({
        teacherId,
        startDate: w.start,
        endDate: w.end,
        groupFilter,
      }))
    ),
    prisma.payslip.findMany({
      where: {
        personId: teacherId,
        personType: "TEACHER",
        PayrollRun: {
          periodEnd: { gte: windows[0].start },
          periodStart: { lte: windows[2].end },
        },
      },
      include: {
        PayrollRun: {
          select: { periodStart: true, periodEnd: true, status: true },
        },
      },
      orderBy: { id: "desc" },
    }),
  ]);

  const DAY_MS = 86_400_000;
  const CONFIRMED_STATUSES = new Set(["PAID", "VALIDATED", "CONFIRMED"]);

  const rawPoints = windows.map((w, idx) => {
    const calc = batchCalcs[idx] ?? null;
    const wStartMs = w.start.getTime();
    const wEndMs = w.end.getTime();

    // Match monthly payslips whose midpoint falls within this calendar month
    const matchingSlips = savedPayslips.filter((s) => {
      const pStart = new Date(s.PayrollRun.periodStart).getTime();
      const pEnd = new Date(s.PayrollRun.periodEnd).getTime();
      const spanDays = (pEnd - pStart) / DAY_MS;
      if (spanDays < 20) return false;
      const mid = (pStart + pEnd) / 2;
      return mid >= wStartMs && mid <= wEndMs;
    });

    const confirmedSlip = matchingSlips.find((s) => CONFIRMED_STATUSES.has(s.PayrollRun.status));
    const bestSlip = confirmedSlip || matchingSlips[0] || null;

    let grossAmount = 0;
    let netAmount = 0;
    let sessionsCount = 0;

    if (groupFilter === "all" && confirmedSlip) {
      grossAmount = Math.max(
        0,
        Number(confirmedSlip.grossAmount) + Number((confirmedSlip as any).bonus || 0)
      );
      netAmount = Math.max(0, Number(confirmedSlip.netAmount));
      sessionsCount = Number(confirmedSlip.sessionsCount ?? calc?.totalSessions ?? 0);
    } else if (
      calc &&
      (calc.grossAmount > 0 ||
        calc.totalSessions > 0 ||
        calc.salaryAdvances > 0 ||
        calc.photocopyDeductions > 0)
    ) {
      const draftBonus =
        groupFilter === "all" && bestSlip ? Number((bestSlip as any).bonus || 0) : 0;
      grossAmount = Math.max(0, Math.round((calc.grossAmount + draftBonus) * 100) / 100);
      netAmount = Math.max(0, Math.round((calc.netAmount + draftBonus) * 100) / 100);
      sessionsCount = calc.totalSessions;
    } else if (groupFilter === "all" && bestSlip) {
      grossAmount = Math.max(
        0,
        Number(bestSlip.grossAmount) + Number((bestSlip as any).bonus || 0)
      );
      netAmount = Math.max(0, Number(bestSlip.netAmount));
      sessionsCount = Number(bestSlip.sessionsCount || 0);
    }

    // Reconcile the 3rd column (current payslip month) with the payslip's exact totals when full-month
    if (w.offset === 0 && currentPeriodOverride) {
      let isFullMonthOverride = true;
      if (currentPeriodOverride.periodStart && currentPeriodOverride.periodEnd) {
        const oStart = normalizeDateToStartOfDay(currentPeriodOverride.periodStart).getTime();
        const oEnd = normalizeDateToEndOfDay(currentPeriodOverride.periodEnd).getTime();
        const spanDays = (oEnd - oStart) / DAY_MS;
        isFullMonthOverride = spanDays >= 20;
      }
      if (isFullMonthOverride) {
        grossAmount = Math.max(0, Math.round(Number(currentPeriodOverride.grossAmount || 0) * 100) / 100);
        netAmount = Math.max(0, Math.round(Number(currentPeriodOverride.netAmount || 0) * 100) / 100);
        if (currentPeriodOverride.sessionsCount !== undefined) {
          sessionsCount = Number(currentPeriodOverride.sessionsCount || 0);
        }
      }
    }

    return {
      year: w.year,
      month: w.month,
      monthKey: w.monthKey,
      label: w.label,
      shortLabel: w.shortLabel,
      sessionsCount,
      grossAmount: Math.round(grossAmount * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      isCurrentPeriod: w.offset === 0,
    };
  });

  return rawPoints.map((pt, idx) => {
    if (idx === 0) {
      return {
        ...pt,
        growthRate: null,
        growthDelta: null,
      };
    }
    const prevGross = rawPoints[idx - 1].grossAmount;
    const delta = Math.round((pt.grossAmount - prevGross) * 100) / 100;
    const rate =
      prevGross > 0 ? Math.round(((pt.grossAmount - prevGross) / prevGross) * 1000) / 10 : null;
    return {
      ...pt,
      growthRate: rate,
      growthDelta: delta,
    };
  });
}


