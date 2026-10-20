"use server";

import prisma from "@/lib/prisma";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { computeStudentCreditAndSessions, resolvePayerCredit } from "@/lib/studentBilling";
import { revalidatePath } from "next/cache";
import { recordCatchUpAttendanceAction, unsuspendEnrollmentWithDebtClearance } from "@/lib/actions";
import {
  getAlgiersDateInfo,
  getAlgiersWeekBounds,
  resolveRecurringLessonsForWeek,
  serializeForClient,
} from "@/lib/utils";
import { getFixedInscriptionFeeAction } from "@/lib/configurationActions";
import { resolveOrCreateLessonForDate } from "@/lib/lessonInstances";

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
  payerStatus?: "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY" | string;
  isNonPayer?: boolean;
  isSiblingWaived?: boolean;
  hasPayerSibling?: boolean;
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
  const FORTYFIVE_MIN_MS = 45 * 60 * 1000;
  const THREE_HOURS_MS = 180 * 60 * 1000;
  const startsAtMs = new Date(lesson.startsAt).getTime();
  const endsAtMs = new Date(lesson.endsAt).getTime();
  const scanMs = scanTime.getTime();

  // If the student has a preceding lesson earlier today, switch 45 minutes before this lesson starts.
  // If this is the student's first/only lesson today, allow early check-in up to 3 hours before startsAt.
  const preWindowMs = hasPrecedingLessonToday ? FORTYFIVE_MIN_MS : THREE_HOURS_MS;
  const windowStartMs = startsAtMs - preWindowMs;

  let windowEndMs: number;
  if (nextLessonStartsAt) {
    // End when the next lesson's 20-min pre-scan window begins
    const nextScanStartMs = new Date(nextLessonStartsAt).getTime() - 20 * 60 * 1000;
    windowEndMs = Math.max(startsAtMs + 15 * 60 * 1000, Math.min(endsAtMs + 15 * 60 * 1000, nextScanStartMs));
  } else {
    // Keep window open through the entire lesson duration plus 30 minutes grace buffer
    windowEndMs = endsAtMs + 30 * 60 * 1000;
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
  const scanDateInfo = getAlgiersDateInfo(scanTime);
  const [sYear, sMonth, sDay] = scanDateInfo.dateStr.split("-").map(Number);
  // Start of today in Algiers (UTC+1: midnight Algiers is 23:00 UTC previous day, so -2h buffer)
  const rangeStart = new Date(Date.UTC(sYear, sMonth - 1, sDay, -2, 0, 0, 0));
  const rangeEnd = new Date(scanTime.getTime() + 14 * 24 * 60 * 60 * 1000);

  // ROUND-TRIP 1: Fetch Student + Enrollments + Classes + Candidate Lessons in ONE query
  const student = await prisma.student.findUnique({
    where: { globalNumber },
    include: {
      family: true,
      attendances: {
        where: {
          lesson: {
            startsAt: { gte: rangeStart, lte: rangeEnd },
          },
        },
        select: {
          lessonId: true,
          status: true,
        },
      },
      enrollments: {
        include: {
          class: {
            select: {
              id: true,
              name: true,
              branchId: true,
              pricePerCycle: true,
              isFormation: true,
              isCompleted: true,
              teacherId: true,
              teacher: {
                include: {
                  TeacherPayRate: {
                    orderBy: { effectiveFrom: "desc" },
                    take: 1,
                  },
                },
              },
              teacherClassRates: true,
              lessons: {
                where: {
                  OR: [
                    { startsAt: { gte: rangeStart, lte: rangeEnd } },
                    {
                      isExtra: false,
                      isCatchUp: false,
                      isFree: false,
                      class: { isCompleted: false },
                    },
                    ...(openLessonIdNum ? [{ id: openLessonIdNum }] : []),
                  ],
                },
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
                where: {
                  OR: [
                    { lesson: { startsAt: { gte: rangeStart, lte: rangeEnd } } },
                    {
                      lesson: {
                        isExtra: false,
                        isCatchUp: false,
                        isFree: false,
                        class: { isCompleted: false },
                      },
                    },
                    ...(openLessonIdNum ? [{ lessonId: openLessonIdNum }] : []),
                  ],
                },
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

  // Filter candidate enrollments (exclude unenrolled/refunded/transferred or completed classes)
  const activeEnrollments = student.enrollments.filter(
    (e) =>
      !e.class.isCompleted &&
      (!e.status ||
        !["REFUNDED", "UNENROLLED", "TRANSFERRED", "INACTIVE"].includes(
          e.status.toUpperCase()
        ))
  );

  // Flatten raw lessons from active enrollments (both primary and multi-group lessons) and attach class metadata
  const rawStudentLessons = activeEnrollments
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
    .filter((lesson, index, self) => index === self.findIndex((l) => l.id === lesson.id));

  // Resolve recurring timetable lessons onto real calendar dates for the current week and next week
  const currentWeekBounds = getAlgiersWeekBounds(0, scanTime);
  const nextWeekBounds = getAlgiersWeekBounds(1, scanTime);
  const resolvedCurrentWeek = resolveRecurringLessonsForWeek(rawStudentLessons, currentWeekBounds);
  const resolvedNextWeek = resolveRecurringLessonsForWeek(rawStudentLessons, nextWeekBounds);

  const allCandidateLessons = [...resolvedCurrentWeek, ...resolvedNextWeek];

  // Also include any one-off or already-dated lesson instances falling in the range window
  for (const raw of rawStudentLessons) {
    const rawStart = new Date(raw.startsAt).getTime();
    if (rawStart >= rangeStart.getTime() && rawStart <= rangeEnd.getTime()) {
      const rawDateStr = getAlgiersDateInfo(raw.startsAt).dateStr;
      const alreadyInList = allCandidateLessons.some(
        (l) => l.id === raw.id && (l.instanceDate === rawDateStr || getAlgiersDateInfo(l.startsAt).dateStr === rawDateStr)
      );
      if (!alreadyInList) {
        allCandidateLessons.push({
          ...raw,
          instanceDate: rawDateStr,
        });
      }
    }
  }

  const studentLessons = allCandidateLessons
    .filter((lesson, index, self) => {
      const key = `${lesson.id}-${lesson.instanceDate || getAlgiersDateInfo(lesson.startsAt).dateStr}`;
      return index === self.findIndex((l) => `${l.id}-${l.instanceDate || getAlgiersDateInfo(l.startsAt).dateStr}` === key);
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Helper to test if a lesson matches the active scan branch
  const isBranchMatch = (l: any) =>
    !branchId ||
    l.branchId === branchId ||
    l.class?.branchId === branchId ||
    (l.classroom as any)?.branchId === branchId;

  // Match lesson: Priority to openLessonId, then today's lessons, then scan window
  let matchedLesson: (typeof studentLessons)[number] | null = null;

  // STEP 0: If admin/teacher currently has a specific lesson Attendance sheet open, match directly
  if (openLessonIdNum) {
    const directOpenMatch = studentLessons.find((l) => l.id === openLessonIdNum);
    if (directOpenMatch) {
      matchedLesson = directOpenMatch;
    }
  }

  // STEP 1: Today's lessons (any lesson scheduled for today in Africa/Algiers)
  if (!matchedLesson) {
    const todayDateStr = scanDateInfo.dateStr;
    const todayLessons = studentLessons.filter((l) => {
      const lDateStr = l.instanceDate || getAlgiersDateInfo(l.startsAt).dateStr;
      return lDateStr === todayDateStr;
    });

    const branchTodayLessons = todayLessons.filter(isBranchMatch);
    const candidateTodayLessons =
      branchTodayLessons.length > 0 ? branchTodayLessons : todayLessons;

    if (candidateTodayLessons.length > 0) {
      const presentLessonIds = new Set(
        ((student as any).attendances || [])
          .filter((a: any) => a.status === "PRESENT")
          .map((a: any) => a.lessonId)
      );

      const scanMs = scanTime.getTime();

      // 1A. Check for a lesson currently IN PROGRESS where student is NOT yet marked present
      const inProgressNotPresent = candidateTodayLessons.find((l) => {
        const sMs = new Date(l.startsAt).getTime();
        const eMs = new Date(l.endsAt).getTime();
        return (
          scanMs >= sMs - 20 * 60 * 1000 &&
          scanMs <= eMs + 20 * 60 * 1000 &&
          !presentLessonIds.has(l.id)
        );
      });

      if (inProgressNotPresent) {
        matchedLesson = inProgressNotPresent;
      }

      // 1B. Check for UPCOMING lessons starting LATER TODAY where student is NOT yet marked present
      if (!matchedLesson) {
        const upcomingNotPresent = candidateTodayLessons
          .filter((l) => {
            const sMs = new Date(l.startsAt).getTime();
            return sMs > scanMs && !presentLessonIds.has(l.id);
          })
          .sort(
            (a, b) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          );

        if (upcomingNotPresent.length > 0) {
          matchedLesson = upcomingNotPresent[0];
        }
      }

      // 1C. Check for any in-progress lesson (even if already present, to acknowledge "Déjà pointé")
      const inProgressAny = candidateTodayLessons.find((l) => {
        const sMs = new Date(l.startsAt).getTime();
        const eMs = new Date(l.endsAt).getTime();
        return (
          scanMs >= sMs - 20 * 60 * 1000 && scanMs <= eMs + 20 * 60 * 1000
        );
      });

      if (!matchedLesson && inProgressAny) {
        matchedLesson = inProgressAny;
      }

      // 1D. Use Continuous Scan Window rule on today's candidate lessons
      if (!matchedLesson) {
        for (let i = 0; i < candidateTodayLessons.length; i++) {
          const lesson = candidateTodayLessons[i];
          const hasPrecedingLessonToday = candidateTodayLessons
            .slice(0, i)
            .some((pl) => {
              const diffMs =
                new Date(lesson.startsAt).getTime() -
                new Date(pl.startsAt).getTime();
              return (
                diffMs >= 30 * 60 * 1000 && diffMs <= 8 * 60 * 60 * 1000
              );
            });
          const nextLesson = candidateTodayLessons.slice(i + 1).find((nl) => {
            const diffMs =
              new Date(nl.startsAt).getTime() -
              new Date(lesson.startsAt).getTime();
            return (
              diffMs >= 30 * 60 * 1000 && diffMs <= 6 * 60 * 60 * 1000
            );
          });

          if (
            isLessonInContinuousScanWindow(
              lesson as any,
              nextLesson ? nextLesson.startsAt : null,
              scanTime,
              hasPrecedingLessonToday
            )
          ) {
            matchedLesson = lesson;
            break;
          }
        }
      }

      // 1E. Check for late arrival or recently ended lesson today (ended within 45 min)
      if (!matchedLesson) {
        for (const lesson of candidateTodayLessons) {
          const startsAtMs = new Date(lesson.startsAt).getTime();
          const endsAtMs = new Date(lesson.endsAt).getTime();
          if (
            scanMs >= startsAtMs &&
            scanMs <= endsAtMs + 45 * 60 * 1000
          ) {
            matchedLesson = lesson;
            break;
          }
        }
      }

      // 1F. Any upcoming lesson today fallback (even if already present, to acknowledge scan)
      if (!matchedLesson) {
        const anyUpcomingToday = candidateTodayLessons.find(
          (l) => new Date(l.startsAt).getTime() > scanMs
        );
        if (anyUpcomingToday) {
          matchedLesson = anyUpcomingToday;
        }
      }

      // 1G. Single lesson today fallback
      if (!matchedLesson && candidateTodayLessons.length === 1) {
        matchedLesson = candidateTodayLessons[0];
      }
    }
  }

  // STEP 2: General scan window on all studentLessons (across all branches / days in window)
  if (!matchedLesson) {
    const candidateLessons = studentLessons.filter(isBranchMatch);
    const activeCandidates = candidateLessons.length > 0 ? candidateLessons : studentLessons;

    for (let i = 0; i < activeCandidates.length; i++) {
      const lesson = activeCandidates[i];
      const hasPrecedingLessonToday = activeCandidates.slice(0, i).some((pl) => {
        const diffMs = new Date(lesson.startsAt).getTime() - new Date(pl.startsAt).getTime();
        return diffMs >= 30 * 60 * 1000 && diffMs <= 8 * 60 * 60 * 1000;
      });
      const nextLesson = activeCandidates.slice(i + 1).find((nl) => {
        const diffMs = new Date(nl.startsAt).getTime() - new Date(lesson.startsAt).getTime();
        return diffMs >= 30 * 60 * 1000 && diffMs <= 6 * 60 * 60 * 1000;
      });

      if (
        isLessonInContinuousScanWindow(
          lesson as any,
          nextLesson ? nextLesson.startsAt : null,
          scanTime,
          hasPrecedingLessonToday
        )
      ) {
        matchedLesson = lesson;
        break;
      }
    }
  }

  // STATE 3: NO UPCOMING GROUP IN CURRENT SCAN WINDOW AT THIS BRANCH
  if (!matchedLesson) {
    const nextFutureLesson = studentLessons.find((l: any) => new Date(l.startsAt).getTime() > scanTime.getTime());
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

  // Synchronize branchId if matched lesson belongs to a specific branch
  if (matchedLesson && matchedLesson.branchId) {
    branchId = matchedLesson.branchId;
  }

  // Ensure the matched lesson has a persisted, dated Lesson instance for today's date in Africa/Algiers
  const targetDateStr =
    (matchedLesson as any).instanceDate ||
    getAlgiersDateInfo(matchedLesson.startsAt).dateStr;
  const persistedLessonId = await resolveOrCreateLessonForDate(
    matchedLesson.id,
    targetDateStr
  );
  matchedLesson.id = persistedLessonId;

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

  if (enrollment && enrollment.status === "SUSPENDED") {
    const unsuspendRes = await unsuspendEnrollmentWithDebtClearance(prisma, {
      studentId: student.id,
      classId: matchedLesson.studentEnrolledClassId,
      enrollmentId: enrollment.id,
      trigger: "ATTENDANCE",
      actorId: "biometric_bridge",
      actorName: "Pont Biométrique K50",
      excludeLessonIds: [matchedLesson.id],
      referenceDate: new Date(),
    });
    if (unsuspendRes.success) {
      (enrollment as any).status = "ACTIVE";
      (enrollment as any).creditResetOffset = unsuspendRes.creditResetOffset;
    }
  }

  const teacherId = (matchedLesson.class as any).teacherId || matchedLesson.class.teacher?.id;
  const teacherClassOverride = (matchedLesson.class as any)?.teacherClassRates?.find(
    (tcr: any) => tcr.teacherId === teacherId
  )?.percentage;
  const teacherPercentage = teacherClassOverride != null
    ? Number(teacherClassOverride)
    : (matchedLesson.class.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
      ? Number((matchedLesson.class.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
      : null;

  const creditMetricsBefore = computeStudentCreditAndSessions({
    pricePerCycle: Number(matchedLesson.class.pricePerCycle || 0),
    isFormation: Boolean(matchedLesson.class.isFormation),
    payerStatus: effectivePayerStatus,
    siblingDiscountPercentage: siblingDiscountPct,
    isSiblingWaived,
    isPayerSiblingPaid,
    payerRemainingCredit,
    teacherPercentage,
    tuitionVouchers,
    transfersIn: enrollment?.transfersTo || [],
    transfersOut: enrollment?.transfersFrom || [],
    creditResetOffset: (enrollment as any)?.creditResetOffset || 0,
    attendances: priorAttendances,
    catchUps,
  });

  const isNonPayerStudent = Boolean(
    creditMetricsBefore.isNonPayer ||
    effectivePayerStatus === "NON_PAYER"
  );
  const isSiblingStudent = Boolean(
    isSiblingWaived ||
    creditMetricsBefore.isSiblingWaived ||
    needsPayerSiblingCheck ||
    (student.family?.payerStudentId && student.family.payerStudentId !== student.id)
  );

  let hasAvailableCredit = false;
  if (matchedLesson.isFree || matchedLesson.isTeacherAbsent || isNonPayerStudent) {
    hasAvailableCredit = true;
  } else if (isSiblingStudent) {
    hasAvailableCredit = isPayerSiblingPaid;
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
      scan: {
        ...serializeScanLog(log),
        payerStatus: effectivePayerStatus,
        isNonPayer: isNonPayerStudent,
        isSiblingWaived: Boolean(isSiblingWaived || creditMetricsBefore.isSiblingWaived),
        hasPayerSibling: isSiblingStudent,
      },
    };
  }

  // ROUND-TRIP 3: STATE 1 SUCCESS — Single pipelined $transaction([...]) batch (Zero extra round-trips!)
  const alreadyMarkedPresent = primaryRow?.status === "PRESENT";
  const consumesOneCredit =
    !matchedLesson.isFree &&
    !matchedLesson.isTeacherAbsent &&
    !isNonPayerStudent &&
    !isSiblingStudent &&
    !matchedLesson.class.isFormation;

  const remainingCreditsAfter = (isNonPayerStudent || isSiblingStudent)
    ? null
    : consumesOneCredit
    ? Math.max(0, creditMetricsBefore.netSessions - 1)
    : creditMetricsBefore.netSessions;

  let scanMetadataTag: string | null = null;
  if (isNonPayerStudent) {
    scanMetadataTag = "WAIVED";
  } else if (isSiblingStudent) {
    scanMetadataTag = isSiblingWaived ? "SIBLING_WAIVED" : "PAYER_SIBLING";
  } else if (effectivePayerStatus === "SCHOOL_FEES_ONLY") {
    scanMetadataTag = "SCHOOL_FEES_ONLY";
  }

  const nextInfo = alreadyMarkedPresent
    ? (scanMetadataTag ? `ALREADY_PRESENT|${scanMetadataTag}` : "ALREADY_PRESENT")
    : scanMetadataTag;

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
        nextLessonInfo: nextInfo,
        isResolved: true,
        scannedAt: scanTime,
      },
    })
  );

  const txResults = await prisma.$transaction(writeOps);
  const log = txResults[txResults.length - 1];

  return {
    success: true,
    scan: {
      ...serializeScanLog(log),
      payerStatus: effectivePayerStatus,
      isNonPayer: isNonPayerStudent,
      isSiblingWaived: Boolean(isSiblingWaived || creditMetricsBefore.isSiblingWaived),
      hasPayerSibling: isSiblingStudent,
      remainingCredits: remainingCreditsAfter,
    },
  };
}

function serializeScanLog(log: any, index?: number): BiometricScanResult {
  if (typeof index !== "number") {
    invalidateBiometricFeedCache(log?.branchId);
  }
  const rawNext = log.nextLessonInfo || "";
  const isAlreadyPresent = rawNext === "ALREADY_PRESENT" || rawNext.startsWith("ALREADY_PRESENT");

  const hasWaivedTag = rawNext.includes("WAIVED") && !rawNext.includes("SIBLING_WAIVED");
  const hasSiblingWaivedTag = rawNext.includes("SIBLING_WAIVED");
  const hasPayerSiblingTag = rawNext.includes("PAYER_SIBLING");
  const hasSchoolFeesOnlyTag = rawNext.includes("SCHOOL_FEES_ONLY");

  const enr = log.student?.enrollments?.find((e: any) => e.classId === log.classId);
  const payerStatus = hasSchoolFeesOnlyTag
    ? "SCHOOL_FEES_ONLY"
    : hasWaivedTag
    ? "NON_PAYER"
    : log.payerStatus || enr?.payerStatus || log.student?.payerStatus || "NORMAL";

  const isNonPayer = Boolean(
    hasWaivedTag ||
    payerStatus === "NON_PAYER" ||
    log.isNonPayer
  );

  const isSiblingWaived = Boolean(
    hasSiblingWaivedTag ||
    enr?.isSiblingWaived ||
    log.isSiblingWaived
  );

  const hasPayerSibling = Boolean(
    hasPayerSiblingTag ||
    hasSiblingWaivedTag ||
    isSiblingWaived ||
    (log.student?.family?.payerStudentId && log.student.family.payerStudentId !== log.studentId) ||
    log.hasPayerSibling
  );

  let cleanNextLessonInfo: string | null = null;
  if (!isAlreadyPresent && rawNext) {
    if (!hasWaivedTag && !hasSiblingWaivedTag && !hasPayerSiblingTag && !hasSchoolFeesOnlyTag) {
      cleanNextLessonInfo = rawNext;
    }
  }

  const remainingCredits = (isNonPayer || isSiblingWaived || hasPayerSibling)
    ? null
    : (log.remainingCredits ?? null);

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
    remainingCredits,
    nextLessonInfo: cleanNextLessonInfo,
    isResolved: Boolean(log.isResolved),
    alreadyPresent: isAlreadyPresent,
    scannedAt: new Date(log.scannedAt).toISOString(),
    payerStatus,
    isNonPayer,
    isSiblingWaived,
    hasPayerSibling,
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

    const studentInclude = {
      student: {
        select: {
          payerStatus: true,
          family: {
            select: {
              payerStudentId: true,
            },
          },
          enrollments: {
            select: {
              classId: true,
              payerStatus: true,
              isSiblingWaived: true,
            },
          },
        },
      },
    };

    const [allScansRaw, pinnedAlertsRaw, devicesRaw] = await Promise.all([
      prisma.biometricScanLog.findMany({
        where: {
          branchId: activeBranchId,
          scannedAt: { gte: todayStart },
        },
        include: studentInclude,
        orderBy: { id: "desc" },
        take: 100,
      }),
      prisma.biometricScanLog.findMany({
        where: {
          branchId: activeBranchId,
          isResolved: false,
          status: { in: ["NO_CREDITS", "NO_UPCOMING_GROUP"] },
          scannedAt: { gte: todayStart },
        },
        include: studentInclude,
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

    if ((input.mode === "ALLOW_PRESENT" || input.mode === "RESOLVED_BY_PAYMENT") && scanLog.studentId && scanLog.lessonId) {
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
          : input.mode === "RESOLVED_BY_PAYMENT"
          ? "Paiement enregistré et présence confirmée / تم تسجيل الدفع وتأكيد الحضور"
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
 * Only returns lessons that match the same teacher and same level as student's missed lessons.
 */
export async function getBiometricCatchUpOptionsAction(studentId: string, branchId?: number) {
  try {
    const activeBranchId = branchId || (await getActiveBranchId()) || 1;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // 1. Missed lessons (ABSENT or NOT_DEFINED) of this student that haven't been caught up yet
    const missedAttendances = await prisma.attendance.findMany({
      where: {
        studentId,
        status: { in: ["ABSENT", "NOT_DEFINED"] },
      },
      include: {
        lesson: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                teacherId: true,
                levelId: true,
                formationLevelId: true,
                isFormation: true,
              },
            },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { lesson: { startsAt: "desc" } },
      take: 20,
    });

    const existingCatchUps = await prisma.catchUpAttendance.findMany({
      where: { studentId },
      select: { missedLessonId: true },
    });
    const caughtUpSet = new Set(existingCatchUps.map((c) => c.missedLessonId));

    const uncaughtMissedLessons = missedAttendances
      .filter((a) => !caughtUpSet.has(a.lessonId))
      .map((a) => {
        const cls = a.lesson.class;
        return {
          lessonId: a.lessonId,
          className: cls.name,
          teacherId: a.lesson.teacherId || cls.teacherId,
          teacherName: a.lesson.teacher.name,
          levelId: cls.levelId,
          formationLevelId: cls.formationLevelId,
          isFormation: Boolean(cls.isFormation),
          startsAt: a.lesson.startsAt.toISOString(),
        };
      });

    // 2. Currently active/upcoming lessons at this branch
    const allActiveBranchLessons = await prisma.lesson.findMany({
      where: {
        branchId: activeBranchId,
        startsAt: { lte: windowEnd },
        endsAt: { gte: windowStart },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            teacherId: true,
            levelId: true,
            formationLevelId: true,
            isFormation: true,
          },
        },
        teacher: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    // Filter activeBranchLessons so that only lessons matching the SAME TEACHER and SAME LEVEL
    // as at least one uncaught missed lesson are suggested
    const activeBranchLessons = allActiveBranchLessons.filter((l) => {
      const lTeacherId = l.teacherId || l.class.teacherId;
      const lIsFormation = Boolean(l.class.isFormation);
      return uncaughtMissedLessons.some((m) => {
        if (m.teacherId !== lTeacherId) return false;
        if (m.isFormation !== lIsFormation) return false;
        if (lIsFormation) {
          return m.formationLevelId === l.class.formationLevelId;
        } else {
          return m.levelId === l.class.levelId;
        }
      });
    });

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
      uncaughtMissedLessons: uncaughtMissedLessons.map((m) => ({
        lessonId: m.lessonId,
        className: m.className,
        teacherName: m.teacherName,
        startsAt: m.startsAt,
      })),
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
    const res = await recordCatchUpAttendanceAction({
      catchUpLessonId: Number(input.catchUpLessonId),
      studentId: input.studentId,
      missedLessonId: Number(input.missedLessonId),
    });

    if (!res.success) {
      return {
        success: false,
        message: res.message || "Erreur lors de l'enregistrement du rattrapage",
      };
    }

    await prisma.biometricScanLog.update({
      where: { id: Number(input.scanId) },
      data: {
        isResolved: true,
        lessonId: Number(input.catchUpLessonId),
        status: "SUCCESS",
      },
    });

    invalidateBiometricFeedCache();

    return {
      success: true,
      message: res.message || "Rattrapage enregistré avec succès / تم تسجيل حصة التعويض بنجاح",
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

export async function getBiometricPaymentDataAction(
  studentId: string,
  classId?: number | null
) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return {
        success: false,
        message: "Non autorisé / غير مصرح",
      };
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        registeredBranch: true,
        parentPhoneNumbers: true,
        family: {
          include: {
            payerStudent: true,
          },
        },
        enrollments: {
          include: {
            class: {
              include: {
                branch: true,
                level: true,
                FormationLevel: {
                  include: {
                    Language: true,
                  },
                },
                teacherClassRates: true,
                teacher: {
                  include: {
                    TeacherPayRate: {
                      orderBy: { effectiveFrom: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: "asc" },
        },
      },
    });

    if (!student) {
      return {
        success: false,
        message: "Étudiant introuvable / لم يتم العثور على التلميذ",
      };
    }

    let targetClass = null;
    if (classId) {
      const match = student.enrollments.find(
        (e) => e.classId === Number(classId)
      );
      if (match) {
        targetClass = match.class;
      } else {
        targetClass = await prisma.class.findUnique({
          where: { id: Number(classId) },
          include: {
            branch: true,
            level: true,
            FormationLevel: {
              include: {
                Language: true,
              },
            },
            teacherClassRates: true,
            teacher: {
              include: {
                TeacherPayRate: {
                  orderBy: { effectiveFrom: "desc" },
                  take: 1,
                },
              },
            },
          },
        });
      }
    }

    if (!targetClass && student.enrollments.length > 0) {
      targetClass = student.enrollments[0].class;
    }

    const defaultInscriptionFee = await getFixedInscriptionFeeAction();

    return {
      success: true,
      student: serializeForClient(student),
      classData: serializeForClient(targetClass),
      availableClasses: serializeForClient(
        student.enrollments.map((e) => e.class).filter(Boolean)
      ),
      defaultInscriptionFee,
    };
  } catch (err: any) {
    console.error("getBiometricPaymentDataAction error:", err);
    return {
      success: false,
      message:
        err?.message ||
        "Erreur lors de la récupération des données de paiement / فشل في تحميل بيانات الدفع",
    };
  }
}
