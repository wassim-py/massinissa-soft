"use server";

import prisma from "@/lib/prisma";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { computeStudentCreditAndSessions, resolvePayerCredit } from "@/lib/studentBilling";
import { revalidatePath } from "next/cache";

export type BiometricScanStatus =
  | "SUCCESS"
  | "NO_CREDITS"
  | "NO_UPCOMING_GROUP"
  | "UNRECOGNIZED"
  | "DUPLICATE";

export interface BiometricScanResult {
  id: number;
  branchId: number;
  deviceId: number | null;
  globalNumber: number | null;
  studentId: string | null;
  studentName: string | null;
  lessonId: number | null;
  classId: number | null;
  className: string | null;
  classroomName: string | null;
  lessonStartsAt: string | null;
  lessonEndsAt: string | null;
  status: BiometricScanStatus;
  remainingCredits: number | null;
  nextLessonInfo: string | null;
  isResolved: boolean;
  alreadyPresent?: boolean;
  scannedAt: string;
}

interface BiometricFeedCacheEntry {
  allScans: BiometricScanResult[];
  pinnedAlerts: BiometricScanResult[];
  devices: Array<{
    id: number;
    name: string;
    ipAddress: string;
    port: number;
    lastSeenAt: string | null;
  }>;
  fetchedAt: number;
}

const globalForBiometricFeed = globalThis as unknown as {
  __biometricFeedCache?: Map<number, BiometricFeedCacheEntry>;
  __biometricLastCleanupAt?: number;
};

const BIOMETRIC_FEED_CACHE_TTL_MS = 30 * 1000; // 30s in-memory cache when idle (invalidated immediately on scan/action)
const BIOMETRIC_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Run stale log cleanup at most once every 10 minutes

function getBiometricFeedCacheMap(): Map<number, BiometricFeedCacheEntry> {
  if (!globalForBiometricFeed.__biometricFeedCache) {
    globalForBiometricFeed.__biometricFeedCache = new Map();
  }
  return globalForBiometricFeed.__biometricFeedCache;
}

function invalidateBiometricFeedCache(branchId?: number | null) {
  const map = getBiometricFeedCacheMap();
  if (branchId && !isNaN(Number(branchId))) {
    map.delete(Number(branchId));
  } else {
    map.clear();
  }
}

export async function invalidateBiometricFeedCacheAction(branchId?: number | null) {
  invalidateBiometricFeedCache(branchId);
}

/**
 * Helper to determine if a lesson L falls inside the Continuous Scan Window at `scanTime`:
 * - Window starts: L.startsAt - 30 minutes
 * - Window stays open all along the lesson for late arrivals
 * - Window ends: Exact moment the next group's scan window begins
 *   (nextLessonStartsAt - 30 minutes, or L.endsAt - 30 minutes if lesson >= 90m, or L.endsAt)
 */
function isLessonInContinuousScanWindow(
  lesson: { id: number; startsAt: Date; endsAt: Date },
  nextLessonStartsAt: Date | null,
  scanTime: Date,
  hasPrecedingLessonToday: boolean = false
): boolean {
  const THIRTY_MIN_MS = 30 * 60 * 1000;
  const SIXTY_MIN_MS = 60 * 60 * 1000;
  const startsAtMs = new Date(lesson.startsAt).getTime();
  const endsAtMs = new Date(lesson.endsAt).getTime();
  const scanMs = scanTime.getTime();

  // If the student has a preceding lesson earlier today, switch strictly 30 minutes before this lesson starts.
  // If this is the student's first/only lesson today, allow check-in up to 60 minutes before startsAt.
  const preWindowMs = hasPrecedingLessonToday ? THIRTY_MIN_MS : SIXTY_MIN_MS;
  const windowStartMs = startsAtMs - preWindowMs;

  let windowEndMs: number;
  if (nextLessonStartsAt) {
    // End exactly when the next lesson's 30-min pre-scan window begins
    const nextScanStartMs = new Date(nextLessonStartsAt).getTime() - THIRTY_MIN_MS;
    windowEndMs = Math.max(startsAtMs + 15 * 60 * 1000, Math.min(endsAtMs, nextScanStartMs));
  } else {
    // If lesson duration is >= 90 minutes (e.g. standard 2h slot 08:00-10:00),
    // the next slot's scan window begins at endsAt - 30 min (09:30).
    // However, if no subsequent lesson conflicts, we allow up to endsAt - 30m (or endsAt if < 90m).
    const durationMs = endsAtMs - startsAtMs;
    if (durationMs >= 90 * 60 * 1000) {
      windowEndMs = endsAtMs - THIRTY_MIN_MS;
    } else {
      windowEndMs = endsAtMs;
    }
  }

  return scanMs >= windowStartMs && scanMs < windowEndMs;
}

/**
 * Core high-speed biometric scan processor (Optimized for low-latency Cloud / NeonDB).
 * Collapses DB lookups into 2-3 pipelined round-trips:
 * 1. Student + Enrollments + Candidate Lessons fetched in a single query
 * 2. Vouchers + Attendances + CatchUps + PayerSibling fetched in a single Promise.all
 * 3. Attendance upsert + ScanLog creation executed in a single pipelined $transaction([...]) batch
 */
export async function processBiometricScan(input: {
  globalNumber?: number | null;
  branchId?: number | null;
  deviceId?: number | null;
  scanTime?: Date | string;
  isUnrecognizedFinger?: boolean;
  openLessonId?: number | null;
}): Promise<{ success: boolean; scan: BiometricScanResult }> {
  const scanTime = input.scanTime ? new Date(input.scanTime) : new Date();
  let branchId = input.branchId ? Number(input.branchId) : null;
  if (!branchId || isNaN(branchId)) {
    try {
      branchId = await getActiveBranchId();
    } catch {
      branchId = 1;
    }
  }
  if (!branchId) branchId = 1;

  // STATE 4: UNRECOGNIZED FINGERPRINT (Single pipelined round-trip)
  if (
    input.isUnrecognizedFinger ||
    input.globalNumber === undefined ||
    input.globalNumber === null ||
    isNaN(Number(input.globalNumber)) ||
    Number(input.globalNumber) <= 0
  ) {
    const [, log] = await prisma.$transaction([
      prisma.biometricScanLog.deleteMany({
        where: { branchId, status: "UNRECOGNIZED" },
      }),
      prisma.biometricScanLog.create({
        data: {
          branchId,
          deviceId: input.deviceId ? Number(input.deviceId) : null,
          globalNumber: input.globalNumber ? Number(input.globalNumber) : null,
          status: "UNRECOGNIZED",
          isResolved: true,
          scannedAt: scanTime,
        },
      }),
    ]);
    return {
      success: true,
      scan: serializeScanLog(log),
    };
  }

  const globalNumber = Number(input.globalNumber);
  const openLessonIdNum = input.openLessonId && !isNaN(Number(input.openLessonId)) ? Number(input.openLessonId) : null;
  const rangeStart = new Date(scanTime.getTime() - 6 * 60 * 60 * 1000);
  const rangeEnd = new Date(scanTime.getTime() + 36 * 60 * 60 * 1000);

  // ROUND-TRIP 1: Fetch Student + Enrollments + Classes + Candidate Lessons in ONE query
  const student = await prisma.student.findUnique({
    where: { globalNumber },
    include: {
      family: true,
      enrollments: {
        include: {
          class: {
            select: {
              id: true,
              name: true,
              branchId: true,
              pricePerCycle: true,
              isFormation: true,
              lessons: {
                where: openLessonIdNum
                  ? {
                      OR: [
                        { startsAt: { gte: rangeStart, lte: rangeEnd } },
                        { id: openLessonIdNum },
                      ],
                    }
                  : { startsAt: { gte: rangeStart, lte: rangeEnd } },
                include: {
                  classroom: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
                orderBy: { startsAt: "asc" },
              },
              lessonGroups: {
                where: openLessonIdNum
                  ? {
                      OR: [
                        { lesson: { startsAt: { gte: rangeStart, lte: rangeEnd } } },
                        { lessonId: openLessonIdNum },
                      ],
                    }
                  : { lesson: { startsAt: { gte: rangeStart, lte: rangeEnd } } },
                include: {
                  lesson: {
                    include: {
                      classroom: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          transfersFrom: true,
          transfersTo: true,
        },
      },
    },
  });

  // If no student found in DB with this globalNumber -> STATE 4: UNRECOGNIZED
  if (!student) {
    const [, log] = await prisma.$transaction([
      prisma.biometricScanLog.deleteMany({
        where: { branchId, status: "UNRECOGNIZED" },
      }),
      prisma.biometricScanLog.create({
        data: {
          branchId,
          deviceId: input.deviceId ? Number(input.deviceId) : null,
          globalNumber,
          status: "UNRECOGNIZED",
          isResolved: true,
          scannedAt: scanTime,
        },
      }),
    ]);
    return {
      success: true,
      scan: serializeScanLog(log),
    };
  }

  // Filter active enrollments (exclude suspended/unenrolled/transferred)
  const activeEnrollments = student.enrollments.filter(
    (e) =>
      !e.status ||
      !["SUSPENDED", "REFUNDED", "UNENROLLED", "TRANSFERRED", "INACTIVE"].includes(
        e.status.toUpperCase()
      )
  );

  // Flatten lessons from active enrollments (both primary and multi-group lessons) and attach class metadata
  const studentLessons = activeEnrollments
    .flatMap((e) => {
      const primaryLessons = (e.class.lessons || []).map((l) => ({
        ...l,
        studentEnrolledClassId: e.class.id,
        class: {
          id: e.class.id,
          name: e.class.name,
          branchId: e.class.branchId,
          pricePerCycle: e.class.pricePerCycle,
          isFormation: e.class.isFormation,
        },
      }));
      const additionalLessons = ((e.class as any).lessonGroups || []).map((lg: any) => ({
        ...lg.lesson,
        studentEnrolledClassId: e.class.id,
        class: {
          id: e.class.id,
          name: e.class.name,
          branchId: e.class.branchId,
          pricePerCycle: e.class.pricePerCycle,
          isFormation: e.class.isFormation,
        },
      }));
      return [...primaryLessons, ...additionalLessons];
    })
    .filter((lesson, index, self) => index === self.findIndex((l) => l.id === lesson.id))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // STRICTLY BRANCH-BASED: Only match lessons taking place at the current scan branch (`branchId`)!
  const candidateLessons = studentLessons.filter((l) => l.branchId === branchId);

  // Match lesson using Continuous Scan Window rule
  let matchedLesson: (typeof studentLessons)[number] | null = null;

  for (let i = 0; i < candidateLessons.length; i++) {
    const lesson = candidateLessons[i];
    const hasPrecedingLessonToday = candidateLessons.slice(0, i).some((pl) => {
      const diffMs = new Date(lesson.startsAt).getTime() - new Date(pl.startsAt).getTime();
      return diffMs >= 30 * 60 * 1000 && diffMs <= 8 * 60 * 60 * 1000;
    });
    const nextLesson = candidateLessons.slice(i + 1).find((nl) => {
      const diffMs = new Date(nl.startsAt).getTime() - new Date(lesson.startsAt).getTime();
      return diffMs >= 30 * 60 * 1000 && diffMs <= 6 * 60 * 60 * 1000;
    });

    if (
      isLessonInContinuousScanWindow(
        lesson,
        nextLesson ? nextLesson.startsAt : null,
        scanTime,
        hasPrecedingLessonToday
      )
    ) {
      matchedLesson = lesson;
      break;
    }
  }

  // Fallback check for late arrivals near the end of a lesson with no immediate next lesson
  if (!matchedLesson) {
    for (let i = 0; i < candidateLessons.length; i++) {
      const lesson = candidateLessons[i];
      const startsAtMs = new Date(lesson.startsAt).getTime();
      const endsAtMs = new Date(lesson.endsAt).getTime();
      const scanMs = scanTime.getTime();
      const hasNextStartingSoon = candidateLessons.slice(i + 1).some((nl) => {
        const nlScanStart = new Date(nl.startsAt).getTime() - 30 * 60 * 1000;
        return scanMs >= nlScanStart && scanMs <= new Date(nl.endsAt).getTime();
      });

      if (
        !hasNextStartingSoon &&
        scanMs >= startsAtMs - 60 * 60 * 1000 &&
        scanMs <= endsAtMs
      ) {
        matchedLesson = lesson;
        break;
      }
    }
  }

  // If the admin currently has a specific lesson's Attendance Taking page open on THIS branch (`openLessonId`),
  // and the scanned student is enrolled in that open lesson on this branch, match it!
  if (!matchedLesson && input.openLessonId) {
    const openMatch = candidateLessons.find(
      (l) => l.id === Number(input.openLessonId) && l.branchId === branchId
    );
    if (openMatch) {
      matchedLesson = openMatch;
    }
  }

  // STATE 3: NO UPCOMING GROUP IN CURRENT SCAN WINDOW AT THIS BRANCH
  if (!matchedLesson) {
    const nextFutureLesson =
      candidateLessons.find(
        (l) => new Date(l.startsAt).getTime() > scanTime.getTime()
      ) ||
      studentLessons.find(
        (l) => new Date(l.startsAt).getTime() > scanTime.getTime()
      );
    let nextLessonInfo: string | null = null;
    if (nextFutureLesson) {
      const timeStr = new Date(nextFutureLesson.startsAt).toLocaleTimeString("fr-DZ", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Africa/Algiers",
      });
      const dateStr = new Date(nextFutureLesson.startsAt).toLocaleDateString("fr-DZ", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        timeZone: "Africa/Algiers",
      });
      nextLessonInfo = `${dateStr} à ${timeStr} (${nextFutureLesson.class.name})`;
    }

    const [, log] = await prisma.$transaction([
      prisma.biometricScanLog.deleteMany({
        where: {
          branchId,
          studentId: student.id,
          status: "NO_UPCOMING_GROUP",
          isResolved: false,
        },
      }),
      prisma.biometricScanLog.create({
        data: {
          branchId,
          deviceId: input.deviceId ? Number(input.deviceId) : null,
          globalNumber: student.globalNumber,
          studentId: student.id,
          studentName: student.name,
          status: "NO_UPCOMING_GROUP",
          nextLessonInfo,
          isResolved: false,
          scannedAt: scanTime,
        },
      }),
    ]);

    return {
      success: true,
      scan: serializeScanLog(log),
    };
  }

  // ROUND-TRIP 2: Fetch Vouchers, Class Attendances, CatchUps, Current Lesson Attendance, and Payer Sibling in ONE Promise.all
  const enrolledClassId = (matchedLesson as any).studentEnrolledClassId || matchedLesson.classId;
  const enrollment = activeEnrollments.find((e) => e.classId === enrolledClassId) || activeEnrollments.find((e) => e.classId === matchedLesson.classId);
  const classId = enrollment ? enrollment.classId : enrolledClassId;
  const effectivePayerStatus =
    (enrollment as any)?.payerStatus || student.payerStatus || "NORMAL";
  const siblingDiscountPct = (enrollment as any)?.siblingDiscountPercentage ?? null;
  const isSiblingWaived = Boolean((enrollment as any)?.isSiblingWaived);
  const needsPayerSiblingCheck = Boolean(
    isSiblingWaived &&
      student.family?.payerStudentId &&
      student.family.payerStudentId !== student.id
  );

  const classLessonRows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT l.id FROM "Lesson" l
    WHERE l."classId" = ${classId}
       OR EXISTS (
         SELECT 1 FROM "LessonGroup" lg
         WHERE lg."lessonId" = l.id AND lg."classId" = ${classId}
       )
  `;
  const classLessonIds = classLessonRows.map((r) => r.id);

  const [vouchers, classAttendances, catchUps, existingRows, payerStudent] =
    await Promise.all([
      prisma.voucher.findMany({
        where: {
          studentId: student.id,
          classId,
          isVoided: false,
        },
        include: { refunds: true },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
          lessonId: { in: classLessonIds.length > 0 ? classLessonIds : [-1] },
          lesson: {
            isFree: false,
          },
        },
        include: {
          lesson: {
            select: {
              id: true,
              startsAt: true,
              isFree: true,
              isTeacherAbsent: true,
            },
          },
        },
      }),
      prisma.catchUpAttendance.findMany({
        where: {
          studentId: student.id,
          missedLessonId: { in: classLessonIds.length > 0 ? classLessonIds : [-1] },
        },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
          lessonId: matchedLesson.id,
        },
        orderBy: { id: "asc" },
      }),
      needsPayerSiblingCheck
        ? prisma.student.findUnique({
            where: { id: student.family!.payerStudentId! },
            include: {
              enrollments: {
                include: {
                  class: { select: { id: true, pricePerCycle: true, isFormation: true } },
                  transfersFrom: true,
                  transfersTo: true,
                },
              },
              vouchers: {
                where: { isVoided: false, isRefund: false },
                include: { refunds: true },
              },
              attendances: {
                where: { lesson: { isFree: false } },
                include: {
                  lesson: { select: { id: true, startsAt: true, isFree: true, classId: true } },
                },
              },
              catchUpAttendances: {
                include: {
                  missedLesson: {
                    select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);

  let payerRemainingCredit: number | null = null;
  if (payerStudent) {
    const resolvedPayer = resolvePayerCredit({
      payerStudent,
      classId,
      classPricePerCycle: Number(matchedLesson.class.pricePerCycle || 0),
      isFormation: Boolean(matchedLesson.class.isFormation),
    });
    if (resolvedPayer) {
      payerRemainingCredit = resolvedPayer.netSessions;
    }
  }

  const isPayerSiblingPaid = payerRemainingCredit !== null ? payerRemainingCredit > 0 : true;
  const primaryRow = existingRows[0] || null;

  const tuitionVouchers = vouchers.filter(
    (v) => v.paymentType !== "INSCRIPTION" && v.paymentType !== "BOOK"
  );

  // Exclude the current lesson from prior attendances so we know exact credits available for THIS lesson
  const priorAttendances = classAttendances.filter(
    (a) => a.lessonId !== matchedLesson!.id
  );

  const creditMetricsBefore = computeStudentCreditAndSessions({
    pricePerCycle: Number(matchedLesson.class.pricePerCycle || 0),
    isFormation: Boolean(matchedLesson.class.isFormation),
    payerStatus: effectivePayerStatus,
    siblingDiscountPercentage: siblingDiscountPct,
    isSiblingWaived,
    isPayerSiblingPaid,
    payerRemainingCredit,
    tuitionVouchers,
    transfersIn: enrollment?.transfersTo || [],
    transfersOut: enrollment?.transfersFrom || [],
    creditResetOffset: (enrollment as any)?.creditResetOffset || 0,
    attendances: priorAttendances,
    catchUps,
  });

  let hasAvailableCredit = false;
  if (matchedLesson.isFree || matchedLesson.isTeacherAbsent || creditMetricsBefore.isNonPayer) {
    hasAvailableCredit = true;
  } else if (matchedLesson.class.isFormation) {
    const totalPaidFormation = tuitionVouchers.reduce((sum, v) => {
      const refunded = (v.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      return sum + Math.max(0, Number(v.amount || 0) - refunded);
    }, 0);
    hasAvailableCredit = totalPaidFormation > 0;
  } else {
    hasAvailableCredit = creditMetricsBefore.netSessions > 0;
  }

  // STATE 2: NO CREDITS LEFT (0 SESSIONS) — Single pipelined round-trip
  if (!hasAvailableCredit && primaryRow?.status !== "PRESENT") {
    const [, log] = await prisma.$transaction([
      prisma.biometricScanLog.deleteMany({
        where: {
          studentId: student.id,
          lessonId: matchedLesson.id,
          status: "NO_CREDITS",
          isResolved: false,
        },
      }),
      prisma.biometricScanLog.create({
        data: {
          branchId: matchedLesson.branchId,
          deviceId: input.deviceId ? Number(input.deviceId) : null,
          globalNumber: student.globalNumber,
          studentId: student.id,
          studentName: student.name,
          lessonId: matchedLesson.id,
          classId: classId,
          className: matchedLesson.class.name,
          classroomName: matchedLesson.classroom?.name || null,
          lessonStartsAt: matchedLesson.startsAt,
          lessonEndsAt: matchedLesson.endsAt,
          status: "NO_CREDITS",
          remainingCredits: 0,
          isResolved: false,
          scannedAt: scanTime,
        },
      }),
    ]);

    return {
      success: true,
      scan: serializeScanLog(log),
    };
  }

  // ROUND-TRIP 3: STATE 1 SUCCESS — Single pipelined $transaction([...]) batch (Zero extra round-trips!)
  const alreadyMarkedPresent = primaryRow?.status === "PRESENT";
  const consumesOneCredit =
    !matchedLesson.isFree &&
    !matchedLesson.isTeacherAbsent &&
    !creditMetricsBefore.isNonPayer &&
    !matchedLesson.class.isFormation;

  const remainingCreditsAfter = consumesOneCredit
    ? Math.max(0, creditMetricsBefore.netSessions - 1)
    : creditMetricsBefore.netSessions;

  const writeOps: any[] = [];

  // Clean up any duplicate attendance rows if more than 1 ever existed
  if (existingRows.length > 1) {
    const extraIds = existingRows.slice(1).map((r) => r.id);
    writeOps.push(
      prisma.attendance.deleteMany({
        where: { id: { in: extraIds } },
      })
    );
  }

  if (primaryRow) {
    if (primaryRow.status !== "PRESENT") {
      writeOps.push(
        prisma.attendance.update({
          where: { id: primaryRow.id },
          data: { status: "PRESENT", justification: null },
        })
      );
    }
  } else {
    writeOps.push(
      prisma.attendance.create({
        data: {
          studentId: student.id,
          lessonId: matchedLesson.id,
          status: "PRESENT",
        },
      })
    );
  }

  // Clear any prior unresolved NO_CREDITS alert or duplicate SUCCESS scan log in one deleteMany
  writeOps.push(
    prisma.biometricScanLog.deleteMany({
      where: {
        studentId: student.id,
        lessonId: matchedLesson.id,
        OR: [
          { status: "NO_CREDITS", isResolved: false },
          ...(alreadyMarkedPresent ? [{ status: "SUCCESS" }] : []),
        ],
      },
    })
  );

  // Create the fresh SUCCESS scan log as the final operation in the batch
  writeOps.push(
    prisma.biometricScanLog.create({
      data: {
        branchId: matchedLesson.branchId,
        deviceId: input.deviceId ? Number(input.deviceId) : null,
        globalNumber: student.globalNumber,
        studentId: student.id,
        studentName: student.name,
        lessonId: matchedLesson.id,
        classId: classId,
        className: matchedLesson.class.name,
        classroomName: matchedLesson.classroom?.name || null,
        lessonStartsAt: matchedLesson.startsAt,
        lessonEndsAt: matchedLesson.endsAt,
        status: "SUCCESS",
        remainingCredits: remainingCreditsAfter,
        nextLessonInfo: alreadyMarkedPresent ? "ALREADY_PRESENT" : null,
        isResolved: true,
        scannedAt: scanTime,
      },
    })
  );

  const txResults = await prisma.$transaction(writeOps);
  const log = txResults[txResults.length - 1];

  return {
    success: true,
    scan: serializeScanLog(log),
  };
}

function serializeScanLog(log: any, index?: number): BiometricScanResult {
  if (typeof index !== "number") {
    invalidateBiometricFeedCache(log?.branchId);
  }
  const isAlreadyPresent = log.nextLessonInfo === "ALREADY_PRESENT";
  return {
    id: log.id,
    branchId: log.branchId,
    deviceId: log.deviceId ?? null,
    globalNumber: log.globalNumber ?? null,
    studentId: log.studentId ?? null,
    studentName: log.studentName ?? null,
    lessonId: log.lessonId ?? null,
    classId: log.classId ?? null,
    className: log.className ?? null,
    classroomName: log.classroomName ?? null,
    lessonStartsAt: log.lessonStartsAt ? new Date(log.lessonStartsAt).toISOString() : null,
    lessonEndsAt: log.lessonEndsAt ? new Date(log.lessonEndsAt).toISOString() : null,
    status: log.status as BiometricScanStatus,
    remainingCredits: log.remainingCredits ?? null,
    nextLessonInfo: isAlreadyPresent ? null : log.nextLessonInfo ?? null,
    isResolved: Boolean(log.isResolved),
    alreadyPresent: isAlreadyPresent,
    scannedAt: new Date(log.scannedAt).toISOString(),
  };
}

/**
 * Fetches live biometric feed & unresolved pinned alerts (State 2 & State 3) for the active branch.
 * Serves from a 15s in-memory cache when no new scan has arrived and throttles DB cleanup writes to once per 5 minutes.
 */
export async function getBiometricLiveFeedAction(params?: {
  branchId?: number;
  sinceId?: number;
}) {
  try {
    const activeBranchId = params?.branchId || (await getActiveBranchId()) || 1;
    const now = Date.now();
    const sinceId = params?.sinceId ? Number(params.sinceId) : 0;

    // 1. Serve from in-memory cache if valid (0 database queries when idle!)
    const cacheMap = getBiometricFeedCacheMap();
    const cached = cacheMap.get(activeBranchId);
    if (cached && now - cached.fetchedAt < BIOMETRIC_FEED_CACHE_TTL_MS) {
      const recentScans =
        sinceId > 0
          ? cached.allScans.filter((s) => s.id > sinceId)
          : cached.allScans;
      return {
        success: true,
        branchId: activeBranchId,
        recentScans,
        pinnedAlerts: cached.pinnedAlerts,
        devices: cached.devices,
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 2. Throttle stale log cleanup writes to run at most once every 5 minutes (prevents constant DB WAL writes)
    const lastCleanupAt = globalForBiometricFeed.__biometricLastCleanupAt || 0;
    if (now - lastCleanupAt > BIOMETRIC_CLEANUP_INTERVAL_MS) {
      globalForBiometricFeed.__biometricLastCleanupAt = now;
      const twoMinAgo = new Date(now - 2 * 60 * 1000);
      const thirtyMinAgo = new Date(now - 30 * 60 * 1000);

      await Promise.all([
        prisma.biometricScanLog.deleteMany({
          where: {
            OR: [
              { scannedAt: { lt: todayStart } },
              { status: "UNRECOGNIZED", scannedAt: { lt: twoMinAgo } },
            ],
          },
        }),
        prisma.biometricScanLog.updateMany({
          where: {
            isResolved: false,
            status: "NO_UPCOMING_GROUP",
            scannedAt: { lt: thirtyMinAgo },
          },
          data: { isResolved: true },
        }),
      ]).catch(() => {});
    }

    const [allScansRaw, pinnedAlertsRaw, devicesRaw] = await Promise.all([
      prisma.biometricScanLog.findMany({
        where: {
          branchId: activeBranchId,
          scannedAt: { gte: todayStart },
        },
        orderBy: { id: "desc" },
        take: 40,
      }),
      prisma.biometricScanLog.findMany({
        where: {
          branchId: activeBranchId,
          isResolved: false,
          status: { in: ["NO_CREDITS", "NO_UPCOMING_GROUP"] },
          scannedAt: { gte: todayStart },
        },
        orderBy: { scannedAt: "desc" },
        take: 20,
      }),
      prisma.biometricDevice.findMany({
        where: { branchId: activeBranchId, isActive: true },
        orderBy: { id: "asc" },
      }),
    ]);

    const allScans = allScansRaw.map(serializeScanLog);
    const pinnedAlerts = pinnedAlertsRaw.map(serializeScanLog);
    const devices = devicesRaw.map((d) => ({
      id: d.id,
      name: d.name,
      ipAddress: d.ipAddress,
      port: d.port,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    }));

    cacheMap.set(activeBranchId, {
      allScans,
      pinnedAlerts,
      devices,
      fetchedAt: now,
    });

    const recentScans =
      sinceId > 0 ? allScans.filter((s) => s.id > sinceId) : allScans;

    return {
      success: true,
      branchId: activeBranchId,
      recentScans,
      pinnedAlerts,
      devices,
    };
  } catch (err: any) {
    console.error("getBiometricLiveFeedAction error:", err);
    return {
      success: false,
      branchId: 1,
      recentScans: [] as BiometricScanResult[],
      pinnedAlerts: [] as BiometricScanResult[],
      devices: [],
    };
  }
}

/**
 * Resolves or dismisses a biometric scan log / pinned alert card.
 * - If mode === "DISMISS", deletes the entry from BiometricScanLog so it does not stay stuck in the journal.
 * - If mode === "ALLOW_PRESENT", marks the student PRESENT for that lesson and updates the log status to SUCCESS.
 */
export async function resolveBiometricAlertAction(input: {
  scanId: number;
  mode: "DISMISS" | "ALLOW_PRESENT" | "RESOLVED_BY_PAYMENT" | "RESOLVED_BY_CATCHUP";
}) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return {
        success: false,
        message: "Non autorisé / غير مصرح",
      };
    }

    const scanLog = await prisma.biometricScanLog.findUnique({
      where: { id: Number(input.scanId) },
    });

    if (!scanLog) {
      invalidateBiometricFeedCache();
      return {
        success: true,
        message: "Alerte traitée / تمت معالجة التنبيه",
      };
    }

    if (input.mode === "DISMISS") {
      await prisma.biometricScanLog.deleteMany({
        where: {
          OR: [
            { id: scanLog.id },
            ...(scanLog.studentId && scanLog.lessonId
              ? [
                  {
                    studentId: scanLog.studentId,
                    lessonId: scanLog.lessonId,
                    isResolved: false,
                  },
                ]
              : []),
          ],
        },
      });
      invalidateBiometricFeedCache(scanLog.branchId);
      return {
        success: true,
        message: "Entrée supprimée / تم حذف الإشعار",
      };
    }

    if (input.mode === "ALLOW_PRESENT" && scanLog.studentId && scanLog.lessonId) {
      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: scanLog.studentId,
          lessonId: scanLog.lessonId,
        },
      });
      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: { status: "PRESENT", justification: null },
        });
      } else {
        await prisma.attendance.create({
          data: {
            studentId: scanLog.studentId,
            lessonId: scanLog.lessonId,
            status: "PRESENT",
          },
        });
      }
      try {
        revalidatePath(`/list/attendance/take/${scanLog.lessonId}`);
      } catch {
        // ignore
      }
    }

    await prisma.biometricScanLog.updateMany({
      where: {
        OR: [
          { id: scanLog.id },
          ...(scanLog.studentId && scanLog.lessonId
            ? [
                {
                  studentId: scanLog.studentId,
                  lessonId: scanLog.lessonId,
                  isResolved: false,
                },
              ]
            : []),
        ],
      },
      data: {
        isResolved: true,
        ...(input.mode === "ALLOW_PRESENT" || input.mode === "RESOLVED_BY_PAYMENT"
          ? { status: "SUCCESS" }
          : {}),
      },
    });

    invalidateBiometricFeedCache(scanLog.branchId);

    return {
      success: true,
      message:
        input.mode === "ALLOW_PRESENT"
          ? "Présence autorisée et enregistrée / تم تسجيل الحضور استثنائياً"
          : "Alerte traitée / تمت معالجة التنبيه",
    };
  } catch (err: any) {
    console.error("resolveBiometricAlertAction error:", err);
    return {
      success: false,
      message: "Erreur lors du traitement / حدث خطأ أثناء المعالجة",
    };
  }
}

/**
 * Clears all biometric journal logs (and optionally active alerts) for the current branch.
 */
export async function clearBiometricJournalAction(params?: {
  onlyResolved?: boolean;
}) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, message: "Non autorisé / غير مصرح" };
    }
    const activeBranchId = (await getActiveBranchId()) || 1;
    await prisma.biometricScanLog.deleteMany({
      where: {
        branchId: activeBranchId,
        ...(params?.onlyResolved ? { isResolved: true } : {}),
      },
    });
    invalidateBiometricFeedCache(activeBranchId);
    return {
      success: true,
      message: "Journal vidé / تم مسح السجل",
    };
  } catch (err: any) {
    console.error("clearBiometricJournalAction error:", err);
    return {
      success: false,
      message: "Erreur lors du nettoyage / تعذر مسح السجل",
    };
  }
}

/**
 * Retrieves the biometric fingerprint enrollment status for a student.
 */
export async function getStudentFingerprintStatusAction(studentId: string) {
  try {
    if (!studentId) return { enrolled: false, fingerprints: [] };
    const fingerprints = await prisma.studentFingerprint.findMany({
      where: { studentId },
      orderBy: { updatedAt: "desc" },
    });
    return {
      enrolled: fingerprints.length > 0,
      fingerprints: fingerprints.map((f) => ({
        id: f.id,
        globalNumber: f.globalNumber,
        fingerIndex: f.fingerIndex,
        isSyncedAllBranches: f.isSyncedAllBranches,
        updatedAt: f.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getStudentFingerprintStatusAction error:", err);
    return { enrolled: false, fingerprints: [] };
  }
}

/**
 * Enrolls or updates a student's fingerprint in the central database (one-time registration for all branches)
 * and attempts to trigger/sync with the local K50 bridge if connected.
 */
export async function enrollStudentFingerprintAction(input: {
  studentId: string;
  globalNumber: number;
  fingerIndex?: number;
  templateData?: string | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return {
        success: false,
        message: "Non autorisé / غير مصرح",
      };
    }

    const branchId = (await getActiveBranchId()) || 1;
    const fingerIndex = input.fingerIndex ?? 0;

    const record = await prisma.studentFingerprint.upsert({
      where: {
        studentId_fingerIndex: {
          studentId: input.studentId,
          fingerIndex,
        },
      },
      create: {
        studentId: input.studentId,
        globalNumber: Number(input.globalNumber),
        fingerIndex,
        templateData:
          input.templateData ||
          `ZK_K50_TEMPLATE_UID_${input.globalNumber}_F_${fingerIndex}`,
        enrolledBranchId: branchId,
        isSyncedAllBranches: true,
      },
      update: {
        globalNumber: Number(input.globalNumber),
        templateData:
          input.templateData ||
          `ZK_K50_TEMPLATE_UID_${input.globalNumber}_F_${fingerIndex}_${Date.now()}`,
        enrolledBranchId: branchId,
        isSyncedAllBranches: true,
      },
    });

    return {
      success: true,
      message: `Empreinte enregistrée et synchronisée (ID #${input.globalNumber}) / تم تسجيل البصمة ومزامنتها لجميع الفروع (رقم #${input.globalNumber})`,
      fingerprint: {
        id: record.id,
        globalNumber: record.globalNumber,
        fingerIndex: record.fingerIndex,
        isSyncedAllBranches: record.isSyncedAllBranches,
        updatedAt: record.updatedAt.toISOString(),
      },
    };
  } catch (err: any) {
    console.error("enrollStudentFingerprintAction error:", err);
    return {
      success: false,
      message:
        "Échec de l'enregistrement de l'empreinte / فشل في تسجيل البصمة",
    };
  }
}

/**
 * Deletes a student's fingerprint record.
 */
export async function deleteStudentFingerprintAction(studentId: string) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return {
        success: false,
        message: "Non autorisé / غير مصرح",
      };
    }

    await prisma.studentFingerprint.deleteMany({
      where: { studentId },
    });

    return {
      success: true,
      message: "Empreinte supprimée / تم حذف البصمة بنجاح",
    };
  } catch (err: any) {
    console.error("deleteStudentFingerprintAction error:", err);
    return {
      success: false,
      message: "Échec de la suppression / فشل في حذف البصمة",
    };
  }
}

/**
 * Fetches active lessons at the current branch for one-click Catch-Up (Rattrapage) assignment
 * when a student scans in State 3 (NO_UPCOMING_GROUP).
 */
export async function getBiometricCatchUpOptionsAction(studentId: string, branchId?: number) {
  try {
    const activeBranchId = branchId || (await getActiveBranchId()) || 1;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // 1. Currently active/upcoming lessons at this branch that the student can attend as a catch-up visitor
    const activeBranchLessons = await prisma.lesson.findMany({
      where: {
        branchId: activeBranchId,
        startsAt: { lte: windowEnd },
        endsAt: { gte: windowStart },
      },
      include: {
        class: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    // 2. Missed lessons (ABSENT) of this student that haven't been caught up yet
    const missedAttendances = await prisma.attendance.findMany({
      where: {
        studentId,
        status: "ABSENT",
      },
      include: {
        lesson: {
          include: {
            class: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { lesson: { startsAt: "desc" } },
      take: 15,
    });

    const existingCatchUps = await prisma.catchUpAttendance.findMany({
      where: { studentId },
      select: { missedLessonId: true },
    });
    const caughtUpSet = new Set(existingCatchUps.map((c) => c.missedLessonId));

    const uncaughtMissedLessons = missedAttendances
      .filter((a) => !caughtUpSet.has(a.lessonId))
      .map((a) => ({
        lessonId: a.lessonId,
        className: a.lesson.class.name,
        teacherName: a.lesson.teacher.name,
        startsAt: a.lesson.startsAt.toISOString(),
      }));

    return {
      success: true,
      activeBranchLessons: activeBranchLessons.map((l) => ({
        id: l.id,
        classId: l.classId,
        className: l.class.name,
        teacherName: l.teacher.name,
        classroomName: l.classroom?.name || "",
        startsAt: l.startsAt.toISOString(),
        endsAt: l.endsAt.toISOString(),
      })),
      uncaughtMissedLessons,
    };
  } catch (err) {
    console.error("getBiometricCatchUpOptionsAction error:", err);
    return {
      success: false,
      activeBranchLessons: [],
      uncaughtMissedLessons: [],
    };
  }
}

/**
 * Records a Catch-Up (Rattrapage) attendance directly from a State 3 Biometric Card
 * and marks the biometric alert as resolved.
 */
export async function recordBiometricCatchUpAction(input: {
  scanId: number;
  studentId: string;
  missedLessonId: number;
  catchUpLessonId: number;
}) {
  try {
    const session = await getAuthSession();
    const recordedBy = session.userId || session.rawRole || "admin";

    await prisma.catchUpAttendance.upsert({
      where: {
        studentId_missedLessonId: {
          studentId: input.studentId,
          missedLessonId: Number(input.missedLessonId),
        },
      },
      create: {
        studentId: input.studentId,
        missedLessonId: Number(input.missedLessonId),
        catchUpLessonId: Number(input.catchUpLessonId),
        recordedBy,
      },
      update: {
        catchUpLessonId: Number(input.catchUpLessonId),
        recordedBy,
        recordedAt: new Date(),
      },
    });

    await prisma.biometricScanLog.update({
      where: { id: Number(input.scanId) },
      data: {
        isResolved: true,
        lessonId: Number(input.catchUpLessonId),
        status: "SUCCESS",
      },
    });

    invalidateBiometricFeedCache();

    try {
      revalidatePath(`/list/attendance/take/${input.catchUpLessonId}`);
    } catch {
      // ignore
    }

    return {
      success: true,
      message:
        "Rattrapage enregistré avec succès / تم تسجيل حصة التعويض بنجاح",
    };
  } catch (err: any) {
    console.error("recordBiometricCatchUpAction error:", err);
    return {
      success: false,
      message:
        "Erreur lors de l'enregistrement du rattrapage / فشل في تسجيل حصة التعويض",
    };
  }
}
