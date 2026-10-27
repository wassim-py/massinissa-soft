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
      lessonGroups: true,
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
  } else {
    // When no explicit date is requested, always default to TODAY in Africa/Algiers
    targetDateStr = todayInfo.dateStr;
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

  // Recurring rows are scoped to the base lesson's OWN branch. A lesson that runs in a
  // different branch is a different session for the same group (e.g. 13:30–15:30 on branch A
  // followed by 15:30–17:30 on branch B) and its dated rows must never be reused here.
  return prisma.$transaction(async (tx) => {
    // Acquire a PostgreSQL transaction-level advisory lock to serialize concurrent resolutions
    // for this specific class, branch, date, and recurring time slot.
    const lockKey = `lesson_resolve_${baseLesson.classId}_${baseLesson.branchId}_${targetDateStr}_${baseInfo.timeStr}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const classRecurring = await tx.lesson.findMany({
      where: {
        classId: baseLesson.classId,
        branchId: baseLesson.branchId,
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

    // 1. Check if a recurring Lesson row for this class AND branch on targetDateStr at the same slot already exists
    const candidatesOnDate = classRecurring.filter((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      return cInfo.dateStr === targetDateStr;
    });

    const exactSlotMatch = candidatesOnDate.find((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      const cEndInfo = getAlgiersDateInfo(c.endsAt);
      return (
        cInfo.timeStr === baseInfo.timeStr && cEndInfo.timeStr === baseEndInfo.timeStr
      );
    });
    if (exactSlotMatch) {
      return exactSlotMatch.id;
    }

    // A group that runs several distinct time slots must never inherit a dated row belonging to
    // another slot — that is exactly what marks a student present at the wrong session.
    const hasOtherSlots = classRecurring.some((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      const cEndInfo = getAlgiersDateInfo(c.endsAt);
      return cInfo.timeStr !== baseInfo.timeStr || cEndInfo.timeStr !== baseEndInfo.timeStr;
    });

    // Legacy / renamed slot: safe only when this is the group's single recurring slot in this branch.
    if (candidatesOnDate.length === 1 && !hasOtherSlots) {
      return candidatesOnDate[0].id;
    }

    // 2. If baseLesson itself belongs to the same target date (or a future placeholder >= targetDateStr)
    // and is completely unused (no attendance, no catch-ups, teacher not marked absent),
    // move baseLesson to targetStartsAt/targetEndsAt.
    // CRITICAL: Past lesson rows (< targetDateStr) must NEVER be mutated or shifted forward!
    const isBasePast = baseInfo.dateStr < targetDateStr;
    const isBaseUnused =
      !isBasePast &&
      baseLesson._count.attendances === 0 &&
      baseLesson._count.missedByCatchUps === 0 &&
      baseLesson._count.catchUpVisitsHosted === 0 &&
      !baseLesson.isTeacherAbsent;

    if (isBaseUnused) {
      await tx.lesson.update({
        where: { id: baseLesson.id },
        data: {
          startsAt: targetStartsAt,
          endsAt: targetEndsAt,
        },
      });
      return baseLesson.id;
    }

    // 3. Check if there is any other unused recurring Lesson row for this exact slot
    // (classId, branchId, weekday, timeStr, endTimeStr)
    // only if that sibling is on or after targetDateStr (never steal an older date's record).
    // classRecurring is already scoped to this branch, so an unused row from another branch
    // can never be picked ("stolen") for this session.
    const unusedSibling = classRecurring.find((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      const cEndInfo = getAlgiersDateInfo(c.endsAt);
      return (
        cInfo.weekday === baseInfo.weekday &&
        cInfo.timeStr === baseInfo.timeStr &&
        cEndInfo.timeStr === baseEndInfo.timeStr &&
        cInfo.dateStr >= targetDateStr &&
        c._count.attendances === 0 &&
        c._count.missedByCatchUps === 0 &&
        c._count.catchUpVisitsHosted === 0 &&
        !c.isTeacherAbsent
      );
    });

    if (unusedSibling) {
      await tx.lesson.update({
        where: { id: unusedSibling.id },
        data: {
          teacherId: baseLesson.teacherId,
          classroomId: baseLesson.classroomId,
          branchId: baseLesson.branchId,
          startsAt: targetStartsAt,
          endsAt: targetEndsAt,
        },
      });

      if (baseLesson.lessonGroups && baseLesson.lessonGroups.length > 0) {
        try {
          await tx.lessonGroup.deleteMany({
            where: { lessonId: unusedSibling.id },
          });
          await tx.lessonGroup.createMany({
            data: baseLesson.lessonGroups.map((lg) => ({
              lessonId: unusedSibling.id,
              classId: lg.classId,
            })),
            skipDuplicates: true,
          });
        } catch (err) {
          console.warn("Could not sync lessonGroups to unusedSibling lesson instance:", err);
        }
      }

      return unusedSibling.id;
    }

    // 4. Otherwise, create a new dedicated Lesson row for targetDateStr
    const created = await tx.lesson.create({
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

    if (baseLesson.lessonGroups && baseLesson.lessonGroups.length > 0) {
      try {
        await tx.lessonGroup.createMany({
          data: baseLesson.lessonGroups.map((lg) => ({
            lessonId: created.id,
            classId: lg.classId,
          })),
          skipDuplicates: true,
        });
      } catch (err) {
        console.warn("Could not copy lessonGroups to new lesson instance:", err);
      }
    }

    return created.id;
  });
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
        lessonGroups: { select: { classId: true } },
      },
    });
    if (!base || base.isExtra || base.isCatchUp || base.isFree) {
      return [excludeId];
    }

    const baseStart = getAlgiersDateInfo(base.startsAt);
    const baseEnd = getAlgiersDateInfo(base.endsAt);

    const allClasses = [
      base.classId,
      ...(base.lessonGroups || []).map((lg) => lg.classId),
    ];

    const candidates = await prisma.lesson.findMany({
      where: {
        OR: [
          { classId: { in: allClasses } },
          { lessonGroups: { some: { classId: { in: allClasses } } } },
        ],
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
