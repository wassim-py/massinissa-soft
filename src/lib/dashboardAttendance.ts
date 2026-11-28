import prisma from "@/lib/prisma";
import { getAlgiersDateInfo, resolveRecurringLessonsForDate } from "@/lib/utils";
import { ACTIVE_CLASS_WHERE, isLessonVisibleForClassStatus } from "@/lib/classStatus";

export interface TodayLessonAttendanceData {
  lessonId: number;
  className: string;
  timeSlot: string;
  present: number;
  regularPresent: number;
  catchUp: number;
  absent: number;
  excused: number;
  enrolled: number;
  total: number;
  rate: number;
  isTeacherAbsent?: boolean;
}

export interface TodayAttendanceSummary {
  branchId: number;
  dateStr: string;
  updatedAt: string;
  totalPresent: number;
  totalRegularPresent: number;
  totalCatchUp: number;
  totalAbsent: number;
  totalExcused: number;
  totalExpected: number;
  totalExpectedRecorded: number;
  overallRate: number;
  lessonsData: TodayLessonAttendanceData[];
}

export type LessonWithSourceDate<T extends { startsAt: Date | string }> = T & {
  _dbStartsAt?: Date | string;
};

export interface AttendanceLessonInput {
  id: number;
  startsAt: Date | string;
  _dbStartsAt?: Date | string;
  isTeacherAbsent?: boolean | null;
  class: {
    name: string;
    enrollments?: Array<{ status?: string | null }>;
  };
  attendances?: Array<{ studentId?: string | number | null; status: string }>;
  catchUpVisitsHosted?: Array<{ studentId: string | number }>;
}

/**
 * Snapshot each lesson's real DB `startsAt` before `resolveRecurringLessonsForDate`
 * mutates/clones template dates onto today. This allows downstream aggregators to distinguish
 * genuine today Lesson rows from recurring templates projected onto today (whose template
 * `catchUpVisitsHosted` belong to an earlier date).
 */
export function tagLessonSourceDates<T extends { startsAt: Date | string }>(
  lessons: T[]
): LessonWithSourceDate<T>[] {
  return lessons.map((lesson) => ({
    ...lesson,
    _dbStartsAt: lesson.startsAt,
  }));
}

export function buildTodayAttendanceSummary({
  lessons,
  branchId,
  now = new Date(),
}: {
  lessons: AttendanceLessonInput[];
  branchId: number;
  now?: Date;
}): TodayAttendanceSummary {
  const todayDateStr = getAlgiersDateInfo(now).dateStr;

  const sortedLessons = [...lessons].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const lessonsData: TodayLessonAttendanceData[] = sortedLessons.map((lesson) => {
    const sourceDateStr = getAlgiersDateInfo(lesson._dbStartsAt ?? lesson.startsAt).dateStr;
    const isRealTodayInstance = sourceDateStr === todayDateStr;

    const rawAttendances = isRealTodayInstance ? lesson.attendances ?? [] : [];
    const rawCatchUps = isRealTodayInstance ? lesson.catchUpVisitsHosted ?? [] : [];

    const allPresentIds = new Set<string>();
    const catchUpIds = new Set<string>();

    let unexcused = 0;
    let excused = 0;

    rawAttendances.forEach((att, idx) => {
      if (att.status === "PRESENT") {
        allPresentIds.add(att.studentId != null ? String(att.studentId) : `att-${idx}`);
      } else if (att.status === "ABSENT") {
        unexcused += 1;
      } else if (att.status === "NOT_DEFINED") {
        excused += 1;
      }
    });

    rawCatchUps.forEach((visit) => {
      if (visit.studentId != null) {
        const sid = String(visit.studentId);
        catchUpIds.add(sid);
        allPresentIds.add(sid);
      }
    });

    const present = allPresentIds.size;
    const catchUp = catchUpIds.size;
    const regularPresent = Math.max(0, present - catchUp);
    const absent = unexcused + excused;
    const total = present + absent;
    const rate = total > 0 ? (present / total) * 100 : 0;

    const enrolled = (lesson.class.enrollments ?? []).filter(
      (e) => e.status === "ACTIVE" || !e.status
    ).length;

    const timeSlot = new Date(lesson.startsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    });

    return {
      lessonId: lesson.id,
      className: lesson.class.name,
      timeSlot,
      present,
      regularPresent,
      catchUp,
      absent,
      excused,
      enrolled,
      total,
      rate,
      isTeacherAbsent: Boolean(lesson.isTeacherAbsent),
    };
  });

  const recordedLessons = lessonsData.filter((item) => item.total > 0);
  const totalPresent = lessonsData.reduce((sum, item) => sum + item.present, 0);
  const totalRegularPresent = lessonsData.reduce((sum, item) => sum + item.regularPresent, 0);
  const totalCatchUp = lessonsData.reduce((sum, item) => sum + item.catchUp, 0);
  const totalAbsent = lessonsData.reduce((sum, item) => sum + item.absent, 0);
  const totalExcused = lessonsData.reduce((sum, item) => sum + item.excused, 0);
  const totalExpected = lessonsData.reduce((sum, item) => sum + item.enrolled, 0);
  const totalExpectedRecorded = recordedLessons.reduce(
    (sum, item) => sum + (item.enrolled || item.total),
    0
  );

  const recordedTotal = totalPresent + totalAbsent;
  const overallRate = recordedTotal > 0 ? (totalPresent / recordedTotal) * 100 : 0;

  return {
    branchId,
    dateStr: todayDateStr,
    updatedAt: now.toISOString(),
    totalPresent,
    totalRegularPresent,
    totalCatchUp,
    totalAbsent,
    totalExcused,
    totalExpected,
    totalExpectedRecorded,
    overallRate,
    lessonsData,
  };
}

const TODAY_SUMMARY_CACHE_TTL_MS = 10_000;

function getTodaySummaryCache(): Map<
  string,
  { data: TodayAttendanceSummary; expiresAt: number }
> {
  const g = globalThis as unknown as {
    __todayAttendanceSummaryCache?: Map<
      string,
      { data: TodayAttendanceSummary; expiresAt: number }
    >;
  };
  if (!g.__todayAttendanceSummaryCache) {
    g.__todayAttendanceSummaryCache = new Map();
  }
  return g.__todayAttendanceSummaryCache;
}

/**
 * Fetches today's branch-scoped attendance summary using a 2-stage lean Prisma projection
 * (branch-filtered metadata first, then enrollments/attendances/catch-ups ONLY for today's
 * resolved lessons) with a short 10s server cache (bypassed via `force: true` on live events).
 */
export async function getTodayAttendanceSummary(
  activeBranchId: number,
  now: Date = new Date(),
  options?: { force?: boolean }
): Promise<TodayAttendanceSummary> {
  const todayInfo = getAlgiersDateInfo(now);
  const cacheKey = `${activeBranchId}:${todayInfo.dateStr}`;
  const cache = getTodaySummaryCache();
  const cached = cache.get(cacheKey);
  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const startOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
  );
  const endOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
  );

  // Stage 1: Fetch lightweight lesson metadata filtered to this branch (+ today's single-occurrence overrides)
  const candidateLessons = await prisma.lesson.findMany({
    where: {
      AND: [
        {
          OR: [
            { branchId: activeBranchId },
            { classroom: { branchId: activeBranchId } },
            { isSingleOccurrence: true, overridesDate: todayInfo.dateStr },
          ],
        },
        {
          OR: [
            {
              startsAt: {
                gte: startOfToday,
                lte: endOfToday,
              },
            },
            {
              isExtra: false,
              isCatchUp: false,
              isFree: false,
              isSingleOccurrence: false,
              class: ACTIVE_CLASS_WHERE,
            },
            {
              isSingleOccurrence: true,
              overridesDate: todayInfo.dateStr,
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      startsAt: true,
      endsAt: true,
      isExtra: true,
      isCatchUp: true,
      isFree: true,
      isTeacherAbsent: true,
      recurrenceStartAt: true,
      recurrenceEndAt: true,
      isSingleOccurrence: true,
      overridesDate: true,
      overridesSlotKey: true,
      classId: true,
      classroom: {
        select: { branchId: true },
      },
      class: {
        select: {
          name: true,
          isCompleted: true,
          completedAt: true,
          isPaused: true,
          pausedAt: true,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const taggedLessons = tagLessonSourceDates(candidateLessons);
  const allTodaysLessons = resolveRecurringLessonsForDate(taggedLessons, now).filter((l) =>
    isLessonVisibleForClassStatus(l.endsAt, l.class)
  );
  const thisBranchTodaysLessons = allTodaysLessons.filter(
    (l) => l.branchId === activeBranchId || l.classroom?.branchId === activeBranchId
  );

  if (thisBranchTodaysLessons.length === 0) {
    const emptySummary = buildTodayAttendanceSummary({
      lessons: [],
      branchId: activeBranchId,
      now,
    });
    cache.set(cacheKey, {
      data: emptySummary,
      expiresAt: Date.now() + TODAY_SUMMARY_CACHE_TTL_MS,
    });
    return emptySummary;
  }

  // Stage 2: Fetch active enrollment counts + attendances + catch-ups ONLY for today's resolved lessons
  const classIds = Array.from(
    new Set(thisBranchTodaysLessons.map((l) => l.classId).filter((id): id is number => id != null))
  );
  const realTodayLessonIds = Array.from(
    new Set(
      thisBranchTodaysLessons
        .filter(
          (l) => getAlgiersDateInfo(l._dbStartsAt ?? l.startsAt).dateStr === todayInfo.dateStr
        )
        .map((l) => l.id)
    )
  );

  const [activeEnrollmentCounts, todayAttendances, todayCatchUps] = await Promise.all([
    classIds.length > 0
      ? prisma.enrollment.groupBy({
          by: ["classId"],
          where: {
            classId: { in: classIds },
            status: "ACTIVE",
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    realTodayLessonIds.length > 0
      ? prisma.attendance.findMany({
          where: { lessonId: { in: realTodayLessonIds } },
          select: { lessonId: true, studentId: true, status: true },
        })
      : Promise.resolve([]),
    realTodayLessonIds.length > 0
      ? prisma.catchUpAttendance.findMany({
          where: { catchUpLessonId: { in: realTodayLessonIds } },
          select: { catchUpLessonId: true, studentId: true },
        })
      : Promise.resolve([]),
  ]);

  const enrolledCountByClass = new Map<number, number>();
  for (const row of activeEnrollmentCounts) {
    enrolledCountByClass.set(row.classId, row._count._all);
  }

  const attendancesByLesson = new Map<number, Array<{ studentId: string; status: string }>>();
  for (const att of todayAttendances) {
    const arr = attendancesByLesson.get(att.lessonId);
    if (arr) {
      arr.push({ studentId: att.studentId, status: att.status });
    } else {
      attendancesByLesson.set(att.lessonId, [{ studentId: att.studentId, status: att.status }]);
    }
  }

  const catchUpsByLesson = new Map<number, Array<{ studentId: string }>>();
  for (const visit of todayCatchUps) {
    const arr = catchUpsByLesson.get(visit.catchUpLessonId);
    if (arr) {
      arr.push({ studentId: visit.studentId });
    } else {
      catchUpsByLesson.set(visit.catchUpLessonId, [{ studentId: visit.studentId }]);
    }
  }

  const hydratedLessons: AttendanceLessonInput[] = thisBranchTodaysLessons.map((l) => {
    const activeCount = l.classId != null ? enrolledCountByClass.get(l.classId) ?? 0 : 0;
    return {
      id: l.id,
      startsAt: l.startsAt,
      _dbStartsAt: l._dbStartsAt,
      isTeacherAbsent: l.isTeacherAbsent,
      class: {
        name: l.class.name,
        enrollments: Array.from({ length: activeCount }, () => ({ status: "ACTIVE" })),
      },
      attendances: attendancesByLesson.get(l.id) ?? [],
      catchUpVisitsHosted: catchUpsByLesson.get(l.id) ?? [],
    };
  });

  const summary = buildTodayAttendanceSummary({
    lessons: hydratedLessons,
    branchId: activeBranchId,
    now,
  });

  cache.set(cacheKey, {
    data: summary,
    expiresAt: Date.now() + TODAY_SUMMARY_CACHE_TTL_MS,
  });

  return summary;
}
