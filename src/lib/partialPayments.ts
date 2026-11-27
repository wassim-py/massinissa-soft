import prisma from "./prisma";
import {
  computeStudentCreditAndSessions,
  computeStudentSessionFee,
  resolvePayerCredit,
} from "./studentBilling";
import { formatVoucherDisplay } from "./voucherUtils";
import { serializeForClient } from "./utils";

export interface PartialPaymentItem {
  key: string;
  category: "CLASS" | "FORMATION" | "WORKSHOP";
  studentId: string;
  studentGlobalNumber: number | null;
  studentName: string;
  studentPhone: string | null;
  targetId: number;
  targetName: string;
  targetHref: string;
  levelLabel: string | null;
  branchId: number;
  branchName: string;
  totalFee: number;
  paidAmount: number;
  remainingAmount: number;
  lastVoucherDisplay: string | null;
  lastPaymentDate: string | null;
  // Payloads for PaymentForm (CLASS / FORMATION) or WorkshopPaymentForm (WORKSHOP)
  studentPayload?: any;
  classPayload?: any;
  isBookPaid?: boolean;
  remainingSessions?: number;
  participantPayload?: any;
  workshopPayload?: any;
}

function isMultipleOfCycle(val: number, cycleFee: number): boolean {
  if (val <= 0 || cycleFee <= 0) return true;
  const mod = val % cycleFee;
  return mod < 1 || Math.abs(mod - cycleFee) < 1;
}

export async function getPartialPaymentsData(
  branchFilter?: number
): Promise<PartialPaymentItem[]> {
  // Stage 1: Lightweight flat queries (no deep N+1 / lateral joins on every student)
  const [enrollments, classVouchers, workshopParticipants] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        ...(branchFilter ? { class: { branchId: branchFilter } } : {}),
      },
      select: {
        id: true,
        studentId: true,
        classId: true,
        status: true,
        enrolledAt: true,
        payerStatus: true,
        discountType: true,
        discountValue: true,
        discountReason: true,
        creditResetOffset: true,
        transfersFrom: true,
        transfersTo: true,
        payerHistory: { orderBy: { effectiveFrom: "asc" } },
        student: {
          select: {
            id: true,
            globalNumber: true,
            name: true,
            phone: true,
            registeredBranchId: true,
            payerStatus: true,
            family: {
              select: {
                id: true,
                payerStudentId: true,
                discountPercentage: true,
              },
            },
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            branchId: true,
            pricePerCycle: true,
            inscriptionFee: true,
            bookFee: true,
            hasBooks: true,
            isFormation: true,
            formationLevelId: true,
            teacherId: true,
            branch: { select: { id: true, name: true } },
            level: { select: { id: true, name: true } },
            FormationLevel: {
              select: {
                id: true,
                name: true,
                lumpSumPrice: true,
                Language: { select: { id: true, name: true } },
              },
            },
            teacherClassRates: true,
            teacher: {
              select: {
                id: true,
                name: true,
                TeacherPayRate: {
                  orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    prisma.voucher.findMany({
      where: {
        isVoided: false,
        isRefund: false,
        status: { not: "REFUNDED" },
        paymentType: { in: ["TUITION_4SESSION", "FORMATION", "BOOK"] },
        ...(branchFilter
          ? { class: { branchId: branchFilter } }
          : { classId: { not: null } }),
      },
      include: {
        refunds: true,
        series: {
          select: {
            id: true,
            scope: true,
            issuingBranch: { select: { id: true, name: true } },
            targetBranch: { select: { id: true, name: true } },
            level: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.workshopParticipant.findMany({
      where: {
        status: { notIn: ["SUSPENDED", "REFUNDED", "INACTIVE"] },
        ...(branchFilter ? { workshop: { branchId: branchFilter } } : {}),
      },
      include: {
        Student: {
          select: { id: true, globalNumber: true, name: true, phone: true },
        },
        workshop: {
          include: {
            Branch: { select: { id: true, name: true } },
            vouchers: {
              where: {
                paymentType: "WORKSHOP",
                isVoided: false,
                isRefund: false,
                status: { not: "REFUNDED" },
              },
              include: {
                series: {
                  select: {
                    id: true,
                    scope: true,
                    issuingBranch: { select: { id: true, name: true } },
                    targetBranch: { select: { id: true, name: true } },
                  },
                },
              },
              orderBy: { issuedAt: "desc" },
            },
          },
        },
      },
      orderBy: { id: "desc" },
    }),
  ]);

  // Index vouchers by `${studentId}:::${classId}` and active enrollments by `${studentId}:::${classId}`
  const vouchersByEnrollmentKey = new Map<string, typeof classVouchers>();
  for (const v of classVouchers) {
    if (!v.classId) continue;
    const k = `${v.studentId}:::${v.classId}`;
    const arr = vouchersByEnrollmentKey.get(k) || [];
    arr.push(v);
    vouchersByEnrollmentKey.set(k, arr);
  }

  const activeEnrollmentKeys = new Set<string>();
  for (const enr of enrollments) {
    activeEnrollmentKeys.add(`${enr.studentId}:::${enr.classId}`);
  }

  // Pre-filter regular-class enrollments to ONLY candidates that could possibly have a partial cycle balance!
  const candidateRegularEnrollments: typeof enrollments = [];
  const candidateClassIds = new Set<number>();
  const candidateStudentIds = new Set<string>();
  const neededPayerStudentIds = new Set<string>();

  for (const enr of enrollments) {
    const cls = enr.class;
    const isFormation = Boolean(
      cls.isFormation || cls.formationLevelId != null || cls.FormationLevel != null
    );
    if (isFormation) {
      const payerId = enr.student.family?.payerStudentId;
      if (
        payerId &&
        payerId !== enr.studentId &&
        activeEnrollmentKeys.has(`${payerId}:::${cls.id}`)
      ) {
        neededPayerStudentIds.add(payerId);
      }
      continue;
    }

    const enrPayerStatus = enr.payerStatus || enr.student.payerStatus || "NORMAL";
    if (enrPayerStatus === "NON_PAYER") continue;

    const enrKey = `${enr.studentId}:::${cls.id}`;
    const enrVouchers = vouchersByEnrollmentKey.get(enrKey) || [];
    const tuitionVouchers = enrVouchers.filter(
      (v) => v.paymentType === "TUITION_4SESSION"
    );
    if (tuitionVouchers.length === 0 && enr.transfersTo.length === 0) continue;

    const payerId = enr.student.family?.payerStudentId;
    const isPayerInClass = Boolean(
      payerId &&
        payerId !== enr.studentId &&
        activeEnrollmentKeys.has(`${payerId}:::${cls.id}`)
    );
    const siblingDiscountPct = isPayerInClass
      ? Number(enr.student.family?.discountPercentage ?? 50)
      : 0;
    const teacherClassOverride = cls.teacherClassRates?.find(
      (tcr) => tcr.teacherId === cls.teacherId
    )?.percentage;
    const teacherPercentage =
      teacherClassOverride != null
        ? Number(teacherClassOverride)
        : cls.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee != null
        ? Number(cls.teacher.TeacherPayRate[0].percentageOfSessionFee)
        : null;

    const feeCalc = computeStudentSessionFee({
      pricePerCycle: Number(cls.pricePerCycle || 0),
      isFormation: false,
      payerStatus: enrPayerStatus,
      discountType: enr.discountType,
      discountValue: enr.discountValue != null ? Number(enr.discountValue) : null,
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: false,
      teacherPercentage,
    });

    const cycleFee = feeCalc.studentCycleFee;
    if (cycleFee <= 0 && enr.payerHistory.length === 0) continue;

    const netCash = tuitionVouchers.reduce((sum, v) => {
      const ref = (v.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      return sum + Math.max(0, Number(v.amount || 0) - ref);
    }, 0);

    const hasSameSnapshotRate = tuitionVouchers.every(
      (v) =>
        v.effectiveSessionPrice == null ||
        Math.abs(Number(v.effectiveSessionPrice) - feeCalc.studentSessionFee) < 0.01
    );

    // Fast skip: if no transfers, no payer history, no sibling discount, single rate tier, no explicit partial flag, and cash is an exact multiple of cycleFee -> cycleRemainingFee is 0!
    if (
      enr.transfersTo.length === 0 &&
      enr.transfersFrom.length === 0 &&
      enr.payerHistory.length === 0 &&
      !isPayerInClass &&
      hasSameSnapshotRate &&
      !tuitionVouchers.some((v) => v.isPartial) &&
      cycleFee > 0 &&
      isMultipleOfCycle(netCash, cycleFee)
    ) {
      continue;
    }

    candidateRegularEnrollments.push(enr);
    candidateClassIds.add(cls.id);
    candidateStudentIds.add(enr.studentId);
    if (isPayerInClass && payerId) {
      neededPayerStudentIds.add(payerId);
    }
  }

  // Stage 2: Fetch lessons, attendances, catchUps & payerStudents ONLY for candidate enrollments!
  const [regularLessons, candidateAttendances, candidateCatchUps, payerStudentsList] =
    await Promise.all([
      candidateClassIds.size > 0
        ? prisma.lesson.findMany({
            where: {
              isFree: false,
              OR: [
                { classId: { in: Array.from(candidateClassIds) } },
                {
                  lessonGroups: {
                    some: { classId: { in: Array.from(candidateClassIds) } },
                  },
                },
              ],
            },
            select: {
              id: true,
              classId: true,
              startsAt: true,
              isFree: true,
              isTeacherAbsent: true,
              lessonGroups: { select: { classId: true } },
            },
            orderBy: { startsAt: "asc" },
          })
        : Promise.resolve([]),
      candidateStudentIds.size > 0 && candidateClassIds.size > 0
        ? prisma.attendance.findMany({
            where: {
              studentId: { in: Array.from(candidateStudentIds) },
              isRevisionVisitor: false,
              lesson: {
                isFree: false,
                OR: [
                  { classId: { in: Array.from(candidateClassIds) } },
                  {
                    lessonGroups: {
                      some: { classId: { in: Array.from(candidateClassIds) } },
                    },
                  },
                ],
              },
            },
            select: {
              lessonId: true,
              studentId: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      candidateStudentIds.size > 0
        ? prisma.catchUpAttendance.findMany({
            where: {
              studentId: { in: Array.from(candidateStudentIds) },
            },
            include: {
              missedLesson: {
                select: {
                  id: true,
                  classId: true,
                  startsAt: true,
                  isFree: true,
                  isTeacherAbsent: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      neededPayerStudentIds.size > 0
        ? prisma.student.findMany({
            where: { id: { in: Array.from(neededPayerStudentIds) } },
            include: {
              enrollments: {
                include: {
                  class: {
                    select: { id: true, pricePerCycle: true, isFormation: true },
                  },
                  transfersFrom: true,
                  transfersTo: true,
                  payerHistory: { orderBy: { effectiveFrom: "asc" } },
                },
              },
              vouchers: {
                where: { isVoided: false, isRefund: false },
                include: { refunds: true },
              },
              attendances: {
                where: { lesson: { isFree: false } },
                include: {
                  lesson: {
                    select: {
                      id: true,
                      startsAt: true,
                      isFree: true,
                      classId: true,
                      lessonGroups: { select: { classId: true } },
                    },
                  },
                },
              },
              catchUpAttendances: {
                include: {
                  missedLesson: {
                    select: {
                      id: true,
                      startsAt: true,
                      isFree: true,
                      isTeacherAbsent: true,
                      classId: true,
                      lessonGroups: { select: { classId: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const lessonsByClassId = new Map<number, typeof regularLessons>();
  for (const l of regularLessons) {
    const targetIds = new Set<number>([l.classId]);
    for (const lg of l.lessonGroups || []) {
      targetIds.add(lg.classId);
    }
    for (const cid of targetIds) {
      if (!candidateClassIds.has(cid)) continue;
      const list = lessonsByClassId.get(cid) || [];
      list.push(l);
      lessonsByClassId.set(cid, list);
    }
  }

  const attendancesByStudentId = new Map<
    string,
    Array<{ lessonId: number; status: string }>
  >();
  for (const a of candidateAttendances) {
    const list = attendancesByStudentId.get(a.studentId) || [];
    list.push({ lessonId: a.lessonId, status: a.status });
    attendancesByStudentId.set(a.studentId, list);
  }

  const catchUpsByStudentId = new Map<string, typeof candidateCatchUps>();
  for (const cu of candidateCatchUps) {
    const list = catchUpsByStudentId.get(cu.studentId) || [];
    list.push(cu);
    catchUpsByStudentId.set(cu.studentId, list);
  }

  const payerStudentMap = new Map<string, (typeof payerStudentsList)[0]>();
  for (const ps of payerStudentsList) {
    payerStudentMap.set(ps.id, ps);
  }

  const items: PartialPaymentItem[] = [];

  // 1. Process Formations
  for (const enr of enrollments) {
    const cls = enr.class;
    const isFormation = Boolean(
      cls.isFormation || cls.formationLevelId != null || cls.FormationLevel != null
    );
    if (!isFormation) continue;

    const student = enr.student;
    const enrPayerStatus = enr.payerStatus || student.payerStatus || "NORMAL";
    if (enrPayerStatus === "NON_PAYER") continue;

    const enrKey = `${student.id}:::${cls.id}`;
    const enrVouchers = vouchersByEnrollmentKey.get(enrKey) || [];
    const formationVouchers = enrVouchers.filter(
      (v) => v.paymentType === "FORMATION"
    );
    if (formationVouchers.length === 0) continue;

    const enrDiscountType = enr.discountType || null;
    const enrDiscountValue =
      enr.discountValue != null ? Number(enr.discountValue) : null;

    const teacherClassOverride = cls.teacherClassRates?.find(
      (tcr) => tcr.teacherId === cls.teacherId
    )?.percentage;
    const teacherPercentage =
      teacherClassOverride != null
        ? Number(teacherClassOverride)
        : cls.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee != null
        ? Number(cls.teacher.TeacherPayRate[0].percentageOfSessionFee)
        : null;

    const payerId = student.family?.payerStudentId;
    const isPayerInThisClass = Boolean(
      payerId &&
        payerId !== student.id &&
        activeEnrollmentKeys.has(`${payerId}:::${cls.id}`)
    );
    const payerStudentObj =
      isPayerInThisClass && payerId ? payerStudentMap.get(payerId) : null;
    const payerCredit = payerStudentObj
      ? resolvePayerCredit({
          payerStudent: payerStudentObj,
          classId: cls.id,
          classPricePerCycle: Number(cls.pricePerCycle || 0),
          isFormation: true,
        })
      : null;

    const siblingDiscountPct = isPayerInThisClass
      ? Number(student.family?.discountPercentage ?? 50)
      : 0;
    const isSiblingWaived100 = isPayerInThisClass && siblingDiscountPct >= 100;
    if (isSiblingWaived100) continue;

    const baseFormationPrice = Number(
      cls.FormationLevel?.lumpSumPrice ?? cls.pricePerCycle ?? 0
    );
    const feeCalc = computeStudentSessionFee({
      pricePerCycle: baseFormationPrice,
      isFormation: true,
      payerStatus: enrPayerStatus,
      discountType: enrDiscountType,
      discountValue: enrDiscountValue,
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: false,
      isPayerActiveAndPaid: Boolean(payerCredit?.isPayerActiveAndPaid),
      teacherPercentage,
    });

    const effectiveLevelPrice = feeCalc.studentCycleFee;
    if (effectiveLevelPrice <= 0) continue;

    const totalPaidFormation = formationVouchers.reduce((sum, v) => {
      const paid = Number(v.amount || 0);
      const refunded = (v.refunds || []).reduce(
        (rSum, r) => rSum + Number(r.amount || 0),
        0
      );
      return sum + Math.max(0, paid - refunded);
    }, 0);

    const remaining =
      Math.round((effectiveLevelPrice - totalPaidFormation) * 100) / 100;
    if (totalPaidFormation <= 0 || remaining < 1) continue;

    const isBookPaid = enrVouchers.some((v) => v.paymentType === "BOOK");
    const latestV = formationVouchers[0];
    const langId = cls.FormationLevel?.Language?.id;
    const langName = cls.FormationLevel?.Language?.name;
    const lvlName = cls.FormationLevel?.name;

    items.push({
      key: `formation-${student.id}-${cls.id}`,
      category: "FORMATION",
      studentId: student.id,
      studentGlobalNumber: student.globalNumber,
      studentName: student.name,
      studentPhone: student.phone,
      targetId: cls.id,
      targetName: cls.name,
      targetHref: langId
        ? `/list/formations/${langId}?lang=1&group=${cls.id}#level-details`
        : `/list/payments/class/${cls.id}`,
      levelLabel: [langName, lvlName].filter(Boolean).join(" • ") || null,
      branchId: cls.branchId,
      branchName: cls.branch.name,
      totalFee: Math.round(effectiveLevelPrice),
      paidAmount: Math.round(totalPaidFormation),
      remainingAmount: Math.round(remaining),
      lastVoucherDisplay: latestV
        ? formatVoucherDisplay(latestV as any, {
            branchName: cls.branch.name,
          })
        : null,
      lastPaymentDate: latestV ? latestV.issuedAt.toISOString() : null,
      isBookPaid,
      studentPayload: {
        id: student.id,
        globalNumber: student.globalNumber,
        name: student.name,
        phone: student.phone,
        registeredBranchId: student.registeredBranchId,
        payerStatus: student.payerStatus,
        enrollments: [
          {
            id: enr.id,
            classId: cls.id,
            payerStatus: enrPayerStatus,
            discountType: enrDiscountType,
            discountValue: enrDiscountValue,
            discountReason: enr.discountReason || null,
          },
        ],
        family: student.family
          ? {
              payerStudentId: student.family.payerStudentId,
              discountPercentage: siblingDiscountPct,
            }
          : null,
      },
      classPayload: {
        id: cls.id,
        name: cls.name,
        branchId: cls.branchId,
        branch: cls.branch,
        pricePerCycle: Number(cls.pricePerCycle || 0),
        inscriptionFee: Number(cls.inscriptionFee || 0),
        bookFee: cls.bookFee ? Number(cls.bookFee) : 0,
        hasBooks: cls.hasBooks,
        isFormation: true,
        formationLevelId: cls.formationLevelId,
        FormationLevel: cls.FormationLevel
          ? {
              id: cls.FormationLevel.id,
              name: cls.FormationLevel.name,
              lumpSumPrice: Number(cls.FormationLevel.lumpSumPrice || 0),
            }
          : null,
        teacherId: cls.teacherId,
        teacherClassRates: cls.teacherClassRates,
        teacher: cls.teacher,
      },
    });
  }

  // 2. Process Candidate Regular Classes
  for (const enr of candidateRegularEnrollments) {
    const cls = enr.class;
    const student = enr.student;
    const enrKey = `${student.id}:::${cls.id}`;
    const enrVouchers = vouchersByEnrollmentKey.get(enrKey) || [];
    const tuitionVouchers = enrVouchers.filter(
      (v) => v.paymentType === "TUITION_4SESSION"
    );

    const enrPayerStatus = enr.payerStatus || student.payerStatus || "NORMAL";
    const enrDiscountType = enr.discountType || null;
    const enrDiscountValue =
      enr.discountValue != null ? Number(enr.discountValue) : null;

    const teacherClassOverride = cls.teacherClassRates?.find(
      (tcr) => tcr.teacherId === cls.teacherId
    )?.percentage;
    const teacherPercentage =
      teacherClassOverride != null
        ? Number(teacherClassOverride)
        : cls.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee != null
        ? Number(cls.teacher.TeacherPayRate[0].percentageOfSessionFee)
        : null;

    const payerId = student.family?.payerStudentId;
    const isPayerInThisClass = Boolean(
      payerId &&
        payerId !== student.id &&
        activeEnrollmentKeys.has(`${payerId}:::${cls.id}`)
    );
    const payerStudentObj =
      isPayerInThisClass && payerId ? payerStudentMap.get(payerId) : null;
    const payerCredit = payerStudentObj
      ? resolvePayerCredit({
          payerStudent: payerStudentObj,
          classId: cls.id,
          classPricePerCycle: Number(cls.pricePerCycle || 0),
          isFormation: false,
        })
      : null;

    const siblingDiscountPct = isPayerInThisClass
      ? Number(student.family?.discountPercentage ?? 50)
      : 0;
    const isSiblingWaived100 = isPayerInThisClass && siblingDiscountPct >= 100;
    if (isSiblingWaived100 && payerCredit?.isPayerActiveAndPaid) continue;

    const clsLessons = lessonsByClassId.get(cls.id) || [];
    const clsLessonIdSet = new Set<number>(clsLessons.map((l) => l.id));
    const allStudentAtts = attendancesByStudentId.get(student.id) || [];
    const studentAtts = allStudentAtts.filter((a) =>
      clsLessonIdSet.has(a.lessonId)
    );

    const allStudentCatchUps = catchUpsByStudentId.get(student.id) || [];
    const classCatchUps = allStudentCatchUps.filter(
      (cu) =>
        cu.recordedBy !== "transfer" &&
        (cu.missedLesson?.classId === cls.id ||
          clsLessonIdSet.has(cu.missedLessonId))
    );

    const creditMetrics = computeStudentCreditAndSessions({
      pricePerCycle: Number(cls.pricePerCycle || 0),
      isFormation: false,
      payerStatus: enrPayerStatus,
      discountType: enrDiscountType,
      discountValue: enrDiscountValue,
      payerHistory: enr.payerHistory || [],
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: isSiblingWaived100,
      isPayerActiveAndPaid: Boolean(payerCredit?.isPayerActiveAndPaid),
      tuitionVouchers,
      transfersIn: enr.transfersTo,
      transfersOut: enr.transfersFrom,
      creditResetOffset: enr.creditResetOffset || 0,
      attendances: studentAtts,
      catchUps: classCatchUps,
      lessons: clsLessons as any,
      teacherPercentage,
      enrolledAt: enr.enrolledAt,
      enrollmentStatus: enr.status,
    });

    const cycleRemaining = Math.round(creditMetrics.cycleRemainingFee || 0);
    const hasPaidSomething =
      creditMetrics.totalPaidTuition > 0 ||
      (creditMetrics.partialTransferPaidDzd || 0) > 0;

    if (
      creditMetrics.isNonPayer ||
      creditMetrics.isSiblingWaived ||
      cycleRemaining < 1 ||
      !hasPaidSomething ||
      creditMetrics.effectiveCycleFee <= 0
    ) {
      continue;
    }

    const paidInCurrentCycle = Math.max(
      0,
      Math.round(creditMetrics.effectiveCycleFee - cycleRemaining)
    );
    const isBookPaid = enrVouchers.some((v) => v.paymentType === "BOOK");
    const latestV = tuitionVouchers[0];

    items.push({
      key: `class-${student.id}-${cls.id}`,
      category: "CLASS",
      studentId: student.id,
      studentGlobalNumber: student.globalNumber,
      studentName: student.name,
      studentPhone: student.phone,
      targetId: cls.id,
      targetName: cls.name,
      targetHref: `/list/payments/class/${cls.id}`,
      levelLabel: cls.level?.name || null,
      branchId: cls.branchId,
      branchName: cls.branch.name,
      totalFee: Math.round(creditMetrics.effectiveCycleFee),
      paidAmount:
        paidInCurrentCycle > 0
          ? paidInCurrentCycle
          : Math.round(creditMetrics.totalPaidTuition),
      remainingAmount: cycleRemaining,
      lastVoucherDisplay: latestV
        ? formatVoucherDisplay(latestV as any, {
            branchName: cls.branch.name,
            levelName: cls.level?.name,
          })
        : null,
      lastPaymentDate: latestV ? latestV.issuedAt.toISOString() : null,
      isBookPaid,
      remainingSessions: creditMetrics.netSessions,
      studentPayload: {
        id: student.id,
        globalNumber: student.globalNumber,
        name: student.name,
        phone: student.phone,
        registeredBranchId: student.registeredBranchId,
        payerStatus: student.payerStatus,
        enrollments: [
          {
            id: enr.id,
            classId: cls.id,
            payerStatus: enrPayerStatus,
            discountType: enrDiscountType,
            discountValue: enrDiscountValue,
            discountReason: enr.discountReason || null,
          },
        ],
        family: student.family
          ? {
              payerStudentId: student.family.payerStudentId,
              discountPercentage: siblingDiscountPct,
            }
          : null,
      },
      classPayload: {
        id: cls.id,
        name: cls.name,
        branchId: cls.branchId,
        branch: cls.branch,
        level: cls.level,
        pricePerCycle: Number(cls.pricePerCycle || 0),
        inscriptionFee: Number(cls.inscriptionFee || 0),
        bookFee: cls.bookFee ? Number(cls.bookFee) : 0,
        hasBooks: cls.hasBooks,
        isFormation: false,
        teacherId: cls.teacherId,
        teacherClassRates: cls.teacherClassRates,
        teacher: cls.teacher,
      },
    });
  }

  // 3. Process Dawarat (Workshops) with partial payments (netPaid > 0 && remaining > 0)
  for (const p of workshopParticipants) {
    const ws = p.workshop;
    const workshopPrice = Number(ws.totalPrice || 0);
    const netPaid = Math.max(
      0,
      Number(p.totalPaid || 0) - Number(p.totalRefunded || 0)
    );
    const remaining = Math.round((workshopPrice - netPaid) * 100) / 100;

    if (netPaid <= 0 || remaining < 1) continue;

    const studentVouchers = (ws.vouchers || []).filter(
      (v) => v.studentId === p.studentId
    );
    const latestV = studentVouchers[0];
    const branchName = ws.Branch?.name || `Siège #${ws.branchId}`;

    items.push({
      key: `workshop-${p.id}`,
      category: "WORKSHOP",
      studentId: p.studentId,
      studentGlobalNumber: p.Student?.globalNumber ?? null,
      studentName: p.Student?.name || `#${p.studentId}`,
      studentPhone: p.Student?.phone || null,
      targetId: ws.id,
      targetName: ws.title,
      targetHref: `/list/workshops/${ws.id}`,
      levelLabel: null,
      branchId: ws.branchId,
      branchName,
      totalFee: Math.round(workshopPrice),
      paidAmount: Math.round(netPaid),
      remainingAmount: Math.round(remaining),
      lastVoucherDisplay: latestV
        ? formatVoucherDisplay(latestV as any, {
            branchName,
            isWorkshop: true,
          })
        : null,
      lastPaymentDate: latestV ? latestV.issuedAt.toISOString() : null,
      participantPayload: {
        id: p.id,
        workshopId: ws.id,
        studentId: p.studentId,
        gender: p.gender,
        chairNumber: p.chairNumber,
        status: p.status,
        totalPaid: netPaid,
        totalRefunded: 0,
        Student: {
          name: p.Student?.name || `#${p.studentId}`,
          phone: p.Student?.phone || null,
        },
      },
      workshopPayload: {
        id: ws.id,
        title: ws.title,
        branchId: ws.branchId,
        totalPrice: workshopPrice,
        Branch: ws.Branch ? { id: ws.Branch.id, name: ws.Branch.name } : null,
      },
    });
  }

  // Sort by most recent partial payment date descending, then remaining amount descending
  items.sort((a, b) => {
    const tA = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
    const tB = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
    if (tB !== tA) return tB - tA;
    return b.remainingAmount - a.remainingAmount;
  });

  return serializeForClient(items);
}
