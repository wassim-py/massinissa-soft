import prisma from "@/lib/prisma";
import {
  getAlgiersDateInfo,
  getAlgiersWeekBounds,
  projectLessonTimeToDateStr,
} from "@/lib/utils";

/**
 * Resolves (or creates if needed) the specific Lesson row for a given target calendar date (YYYY-MM-DD in Africa/Algiers).
 * Guarantees that taking/editing attendance or marking teacher absence on a specific date only affects that date's Lesson record,
 * and never overwrites a previous or future lesson date's attendance.
 */
export async function resolveOrCreateLessonForDate(
  lessonId: number,
  requestedDateStr?: string | null
): Promise<number> {
  const baseLesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      _count: {
        select: {
          attendances: true,
          missedByCatchUps: true,
          catchUpVisitsHosted: true,
        },
      },
    },
  });

  if (!baseLesson) {
    return lessonId;
  }

  // One-off lessons (extra, catch-up, free) are already tied to their exact date
  if (baseLesson.isExtra || baseLesson.isCatchUp || baseLesson.isFree) {
    return baseLesson.id;
  }

  const baseInfo = getAlgiersDateInfo(baseLesson.startsAt);
  const baseEndInfo = getAlgiersDateInfo(baseLesson.endsAt);
  const todayInfo = getAlgiersDateInfo(new Date());

  let targetDateStr: string;
  if (requestedDateStr && /^\d{4}-\d{2}-\d{2}$/.test(requestedDateStr.trim())) {
    targetDateStr = requestedDateStr.trim();
  } else if (
    baseInfo.weekday === todayInfo.weekday &&
    baseInfo.dateStr !== todayInfo.dateStr
  ) {
    // Fallback when opened without ?date= on the lesson's recurring weekday (e.g. from a direct link today)
    targetDateStr = todayInfo.dateStr;
  } else {
    targetDateStr = baseInfo.dateStr;
  }

  // If the base lesson already belongs to targetDateStr, return it directly
  if (baseInfo.dateStr === targetDateStr) {
    return baseLesson.id;
  }

  const { startsAt: targetStartsAt, endsAt: targetEndsAt } =
    projectLessonTimeToDateStr(
      baseLesson.startsAt,
      baseLesson.endsAt,
      targetDateStr
    );

  const [tYear, tMonth, tDay] = targetDateStr.split("-").map(Number);
  const targetDayStart = new Date(
    Date.UTC(tYear, tMonth - 1, tDay, -1, 0, 0, 0)
  );
  const targetDayEnd = new Date(
    Date.UTC(tYear, tMonth - 1, tDay, 22, 59, 59, 999)
  );

  // 1. Check if a recurring Lesson row for this class on targetDateStr at the same slot already exists
  const candidatesOnDate = await prisma.lesson.findMany({
    where: {
      classId: baseLesson.classId,
      isExtra: false,
      isCatchUp: false,
      isFree: false,
      startsAt: {
        gte: targetDayStart,
        lte: targetDayEnd,
      },
    },
    include: {
      _count: {
        select: {
          attendances: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  const exactSlotMatch = candidatesOnDate.find(
    (c) => getAlgiersDateInfo(c.startsAt).timeStr === baseInfo.timeStr
  );
  if (exactSlotMatch) {
    return exactSlotMatch.id;
  }
  if (candidatesOnDate.length === 1) {
    return candidatesOnDate[0].id;
  }

  // 2. If baseLesson itself is completely unused (no attendance, no catch-ups, teacher not marked absent),
  // move baseLesson to targetStartsAt/targetEndsAt so we don't leave empty placeholder rows behind.
  const isBaseUnused =
    baseLesson._count.attendances === 0 &&
    baseLesson._count.missedByCatchUps === 0 &&
    baseLesson._count.catchUpVisitsHosted === 0 &&
    !baseLesson.isTeacherAbsent;

  if (isBaseUnused) {
    await prisma.lesson.update({
      where: { id: baseLesson.id },
      data: {
        startsAt: targetStartsAt,
        endsAt: targetEndsAt,
      },
    });
    return baseLesson.id;
  }

  // 3. Check if there is any other unused recurring Lesson row for this exact slot (classId, weekday, timeStr)
  const allClassRecurring = await prisma.lesson.findMany({
    where: {
      classId: baseLesson.classId,
      isExtra: false,
      isCatchUp: false,
      isFree: false,
    },
    include: {
      _count: {
        select: {
          attendances: true,
          missedByCatchUps: true,
          catchUpVisitsHosted: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  const unusedSibling = allClassRecurring.find((c) => {
    const cInfo = getAlgiersDateInfo(c.startsAt);
    const cEndInfo = getAlgiersDateInfo(c.endsAt);
    return (
      cInfo.weekday === baseInfo.weekday &&
      cInfo.timeStr === baseInfo.timeStr &&
      cEndInfo.timeStr === baseEndInfo.timeStr &&
      c._count.attendances === 0 &&
      c._count.missedByCatchUps === 0 &&
      c._count.catchUpVisitsHosted === 0 &&
      !c.isTeacherAbsent
    );
  });

  if (unusedSibling) {
    await prisma.lesson.update({
      where: { id: unusedSibling.id },
      data: {
        teacherId: baseLesson.teacherId,
        classroomId: baseLesson.classroomId,
        branchId: baseLesson.branchId,
        startsAt: targetStartsAt,
        endsAt: targetEndsAt,
      },
    });
    return unusedSibling.id;
  }

  // 4. Otherwise, create a new dedicated Lesson row for targetDateStr
  const created = await prisma.lesson.create({
    data: {
      classId: baseLesson.classId,
      teacherId: baseLesson.teacherId,
      classroomId: baseLesson.classroomId,
      branchId: baseLesson.branchId,
      startsAt: targetStartsAt,
      endsAt: targetEndsAt,
      isExtra: false,
      isCatchUp: false,
      isFree: false,
      isTeacherAbsent: false,
      extraFee: null,
    },
  });

  return created.id;
}

/**
 * Finds all Lesson IDs belonging to the same recurring slot as `excludeId` so conflict checks
 * during lesson updates don't falsely conflict with past weeks' dated instances of the same slot.
 */
export async function findSiblingRecurringLessonIds(
  excludeId?: number
): Promise<number[]> {
  if (!excludeId || excludeId <= 0) return [];
  try {
    const base = await prisma.lesson.findUnique({
      where: { id: excludeId },
      select: {
        id: true,
        classId: true,
        startsAt: true,
        endsAt: true,
        isExtra: true,
        isCatchUp: true,
        isFree: true,
      },
    });
    if (!base || base.isExtra || base.isCatchUp || base.isFree) {
      return [excludeId];
    }

    const baseStart = getAlgiersDateInfo(base.startsAt);
    const baseEnd = getAlgiersDateInfo(base.endsAt);

    const candidates = await prisma.lesson.findMany({
      where: {
        classId: base.classId,
        isExtra: false,
        isCatchUp: false,
        isFree: false,
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const ids = new Set<number>([excludeId]);
    for (const c of candidates) {
      const cStart = getAlgiersDateInfo(c.startsAt);
      const cEnd = getAlgiersDateInfo(c.endsAt);
      if (
        cStart.weekday === baseStart.weekday &&
        cStart.timeStr === baseStart.timeStr &&
        cEnd.timeStr === baseEnd.timeStr
      ) {
        ids.add(c.id);
      }
    }
    return Array.from(ids);
  } catch {
    return [excludeId];
  }
}

/**
 * When a recurring lesson slot is updated (e.g. new time, classroom, or teacher),
 * keeps any sibling recurring rows of that slot in sync with the new time/classroom/teacher
 * while preserving each past row's own week date and attendance history.
 */
export async function syncSiblingRecurringLessons(params: {
  siblingIds: number[];
  updatedLessonId: number;
  classId: number;
  teacherId: string;
  classroomId: number;
  branchId: number;
  newStartsAt: Date;
  newEndsAt: Date;
}) {
  const otherIds = params.siblingIds.filter(
    (id) => id !== params.updatedLessonId
  );
  if (otherIds.length === 0) return;

  try {
    const newStartInfo = getAlgiersDateInfo(params.newStartsAt);
    const siblings = await prisma.lesson.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, startsAt: true },
    });

    for (const sib of siblings) {
      const sibWeek = getAlgiersWeekBounds(0, sib.startsAt);
      const targetDateStr =
        sibWeek.dayDates[newStartInfo.weekday] ||
        getAlgiersDateInfo(sib.startsAt).dateStr;
      const projected = projectLessonTimeToDateStr(
        params.newStartsAt,
        params.newEndsAt,
        targetDateStr
      );

      await prisma.lesson.update({
        where: { id: sib.id },
        data: {
          classId: params.classId,
          teacherId: params.teacherId,
          classroomId: params.classroomId,
          branchId: params.branchId,
          startsAt: projected.startsAt,
          endsAt: projected.endsAt,
        },
      });
    }
  } catch (err) {
    console.warn("Could not sync sibling recurring lessons:", err);
  }
}
