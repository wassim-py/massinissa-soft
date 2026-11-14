import prisma from "@/lib/prisma";
import { getAlgiersDateInfo, resolveRecurringLessonsForDate } from "@/lib/utils";

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

/**
 * Fetches today's branch-scoped attendance summary using a lean Prisma projection
 * for real-time dashboard polling/event refreshes.
 */
export async function getTodayAttendanceSummary(
  activeBranchId: number,
  now: Date = new Date()
): Promise<TodayAttendanceSummary> {
  const todayInfo = getAlgiersDateInfo(now);
  const startOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
  );
  const endOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
  );

  const candidateLessons = await prisma.lesson.findMany({
    where: {
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
          class: {
            isCompleted: false,
          },
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
      classId: true,
      classroom: {
        select: { branchId: true },
      },
      class: {
        select: {
          name: true,
          enrollments: {
            select: { status: true },
          },
        },
      },
      attendances: {
        select: {
          studentId: true,
          status: true,
        },
      },
      catchUpVisitsHosted: {
        select: {
          studentId: true,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const taggedLessons = tagLessonSourceDates(candidateLessons);
  const allTodaysLessons = resolveRecurringLessonsForDate(taggedLessons, now);
  const thisBranchTodaysLessons = allTodaysLessons.filter(
    (l) => l.branchId === activeBranchId || l.classroom?.branchId === activeBranchId
  );

  return buildTodayAttendanceSummary({
    lessons: thisBranchTodaysLessons,
    branchId: activeBranchId,
    now,
  });
}
