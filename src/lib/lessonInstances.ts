import prisma from "@/lib/prisma";
import {
  getAlgiersDateInfo,
  projectLessonTimeToDateStr,
} from "@/lib/utils";
import {
  addDaysToDateStr,
  computeRetirementCutoff,
  doesSameRecurrenceSeriesMatch,
  getLessonSlotKey,
  isLessonRowFrozen,
  isRecurringOccurrenceActive,
} from "@/lib/lessonRecurrence";

/**
 * Resolves (or creates if needed) the specific Lesson row for a given target calendar date (YYYY-MM-DD in Africa/Algiers).
 * Guarantees that taking/editing attendance or marking teacher absence on a specific date only affects that date's Lesson record,
 * preserves recurrence lifecycle metadata ([recurrenceStartAt, recurrenceEndAt]), and never overwrites a previous or future
 * lesson date's attendance.
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
          vouchers: true,
        },
      },
    },
  });

  if (!baseLesson) {
    return lessonId;
  }

  // One-off lessons (extra, catch-up, free) and single-occurrence past edits are already tied to their exact date
  if (
    baseLesson.isExtra ||
    baseLesson.isCatchUp ||
    baseLesson.isFree ||
    baseLesson.isSingleOccurrence
  ) {
    return baseLesson.id;
  }

  const now = new Date();
  const baseInfo = getAlgiersDateInfo(baseLesson.startsAt);
  const baseEndInfo = getAlgiersDateInfo(baseLesson.endsAt);
  const todayInfo = getAlgiersDateInfo(now);

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
        isSingleOccurrence: false,
      },
      include: {
        _count: {
          select: {
            attendances: true,
            missedByCatchUps: true,
            catchUpVisitsHosted: true,
            vouchers: true,
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

    const exactSeriesMatch = candidatesOnDate.find((c) =>
      doesSameRecurrenceSeriesMatch(c, baseLesson)
    );
    if (exactSeriesMatch) {
      return exactSeriesMatch.id;
    }

    const exactSlotMatch = candidatesOnDate.find((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      const cEndInfo = getAlgiersDateInfo(c.endsAt);
      return (
        cInfo.timeStr === baseInfo.timeStr &&
        cEndInfo.timeStr === baseEndInfo.timeStr &&
        isRecurringOccurrenceActive(c.startsAt, c.endsAt, baseLesson)
      );
    });
    if (exactSlotMatch) {
      return exactSlotMatch.id;
    }

    // A group that runs several distinct active time slots must never inherit a dated row belonging to
    // another slot — that is exactly what marks a student present at the wrong session.
    const activeRecurringAtTarget = classRecurring.filter((c) =>
      isRecurringOccurrenceActive(targetStartsAt, targetEndsAt, c)
    );
    const hasOtherSlots = activeRecurringAtTarget.some((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      const cEndInfo = getAlgiersDateInfo(c.endsAt);
      return cInfo.timeStr !== baseInfo.timeStr || cEndInfo.timeStr !== baseEndInfo.timeStr;
    });

    // Legacy / renamed slot: safe only when this is the group's single recurring slot in this branch.
    if (candidatesOnDate.length === 1 && !hasOtherSlots) {
      return candidatesOnDate[0].id;
    }

    // 2. If baseLesson itself belongs to the same or a future date (>= targetDateStr)
    // and is NOT frozen (has not ended yet, no attendance, no catch-ups, no vouchers, teacher not absent),
    // move baseLesson to targetStartsAt/targetEndsAt.
    // CRITICAL: Past or frozen lesson rows must NEVER be mutated or shifted forward!
    const isBasePast = baseInfo.dateStr < targetDateStr;
    const isBaseUnused = !isBasePast && !isLessonRowFrozen(baseLesson, now);

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

    // 3. Check if there is any other unused upcoming recurring Lesson row in the exact same series
    // on or after targetDateStr (never steal a past/frozen record or a different series generation).
    const unusedSibling = classRecurring.find((c) => {
      const cInfo = getAlgiersDateInfo(c.startsAt);
      return (
        doesSameRecurrenceSeriesMatch(c, baseLesson) &&
        cInfo.dateStr >= targetDateStr &&
        !isLessonRowFrozen(c, now)
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
          recurrenceStartAt: baseLesson.recurrenceStartAt,
          recurrenceEndAt: baseLesson.recurrenceEndAt,
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

    // 4. Otherwise, create a new dedicated Lesson row for targetDateStr inheriting recurrence lifecycle bounds
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
        recurrenceStartAt: baseLesson.recurrenceStartAt,
        recurrenceEndAt: baseLesson.recurrenceEndAt,
        isSingleOccurrence: false,
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
 * Finds all Lesson IDs belonging to the same recurrence series cohort as `excludeId`
 * (excluding single-occurrence overrides and already-retired earlier schedule generations)
 * so conflict checks during updates don't falsely conflict with instances of the same active slot.
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
        isSingleOccurrence: true,
        recurrenceStartAt: true,
        recurrenceEndAt: true,
        lessonGroups: { select: { classId: true } },
      },
    });
    if (
      !base ||
      base.isExtra ||
      base.isCatchUp ||
      base.isFree ||
      base.isSingleOccurrence
    ) {
      return [excludeId];
    }

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
        isSingleOccurrence: false,
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        isExtra: true,
        isCatchUp: true,
        isFree: true,
        isSingleOccurrence: true,
        recurrenceStartAt: true,
        recurrenceEndAt: true,
      },
    });

    const ids = new Set<number>([excludeId]);
    for (const c of candidates) {
      if (doesSameRecurrenceSeriesMatch(c, base)) {
        ids.add(c.id);
      }
    }
    return Array.from(ids);
  } catch {
    return [excludeId];
  }
}

export interface SeriesLessonUsageRow {
  id: number;
  classId: number;
  teacherId: string;
  classroomId: number;
  branchId: number;
  startsAt: Date;
  endsAt: Date;
  isExtra: boolean;
  isCatchUp: boolean;
  isFree: boolean;
  isTeacherAbsent: boolean;
  recurrenceStartAt: Date | null;
  recurrenceEndAt: Date | null;
  isSingleOccurrence: boolean;
  overridesDate: string | null;
  overridesSlotKey: string | null;
  _count: {
    attendances: number;
    missedByCatchUps: number;
    catchUpVisitsHosted: number;
    vouchers: number;
  };
}

/**
 * Loads all rows belonging to the same recurrence series as `lessonId` with usage counts
 * and partitions them into frozen (past or used) vs. mutable upcoming rows.
 */
export async function findSeriesLessonsWithUsage(
  lessonId: number,
  now: Date = new Date()
): Promise<{
  base: SeriesLessonUsageRow | null;
  allRows: SeriesLessonUsageRow[];
  frozenRows: SeriesLessonUsageRow[];
  mutableFutureRows: SeriesLessonUsageRow[];
  frozenDates: Set<string>;
  allSeriesIds: number[];
}> {
  const base = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      classId: true,
      teacherId: true,
      classroomId: true,
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
      lessonGroups: { select: { classId: true } },
      _count: {
        select: {
          attendances: true,
          missedByCatchUps: true,
          catchUpVisitsHosted: true,
          vouchers: true,
        },
      },
    },
  });

  if (!base) {
    return {
      base: null,
      allRows: [],
      frozenRows: [],
      mutableFutureRows: [],
      frozenDates: new Set<string>(),
      allSeriesIds: [],
    };
  }

  if (base.isExtra || base.isCatchUp || base.isFree || base.isSingleOccurrence) {
    const frozen = isLessonRowFrozen(base, now);
    const frozenDates = new Set<string>();
    if (frozen) frozenDates.add(getAlgiersDateInfo(base.startsAt).dateStr);
    return {
      base,
      allRows: [base],
      frozenRows: frozen ? [base] : [],
      mutableFutureRows: frozen ? [] : [base],
      frozenDates,
      allSeriesIds: [base.id],
    };
  }

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
      isSingleOccurrence: false,
    },
    select: {
      id: true,
      classId: true,
      teacherId: true,
      classroomId: true,
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
      _count: {
        select: {
          attendances: true,
          missedByCatchUps: true,
          catchUpVisitsHosted: true,
          vouchers: true,
        },
      },
    },
  });

  const matchingMap = new Map<number, SeriesLessonUsageRow>();
  matchingMap.set(base.id, base);
  for (const c of candidates) {
    if (doesSameRecurrenceSeriesMatch(c, base)) {
      matchingMap.set(c.id, c);
    }
  }

  const allRows = Array.from(matchingMap.values());
  const frozenRows: SeriesLessonUsageRow[] = [];
  const mutableFutureRows: SeriesLessonUsageRow[] = [];
  const frozenDates = new Set<string>();

  for (const row of allRows) {
    if (isLessonRowFrozen(row, now)) {
      frozenRows.push(row);
      frozenDates.add(getAlgiersDateInfo(row.startsAt).dateStr);
    } else {
      mutableFutureRows.push(row);
    }
  }

  return {
    base,
    allRows,
    frozenRows,
    mutableFutureRows,
    frozenDates,
    allSeriesIds: allRows.map((r) => r.id),
  };
}

/**
 * Non-destructively updates a normal recurring lesson going forward:
 * - Frozen rows (past `endsAt <= now` or having attendance/catch-ups/vouchers/teacher absence)
 *   are preserved 100% untouched (original date, time, classroom, branch, teacher, group) and
 *   retired by setting `recurrenceEndAt`.
 * - Upcoming unused rows of the old slot are deleted.
 * - A new active future Lesson row is created starting at `newStartsAt` (`recurrenceStartAt = newStartsAt`)
 *   so the new schedule never projects backwards into past weeks.
 * - If there are zero frozen rows (e.g. a newly created upcoming unused slot), updates in place.
 */
export async function applyNormalLessonFutureUpdate(params: {
  lessonId: number;
  classId: number;
  teacherId: string;
  classroomId: number;
  branchId: number;
  allAssociatedClassIds: number[];
  newStartsAt: Date;
  newEndsAt: Date;
  isExtra: boolean;
  isCatchUp: boolean;
  isFree: boolean;
  frozenRows: Array<{ id: number; endsAt: Date }>;
  mutableFutureRows: Array<{ id: number }>;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const isNewSpecial = Boolean(params.isExtra || params.isCatchUp || params.isFree);
  const newRecurrenceStartAt = isNewSpecial ? null : params.newStartsAt;

  return prisma.$transaction(async (tx) => {
    if (params.frozenRows.length > 0) {
      const retirementCutoff = computeRetirementCutoff(params.frozenRows, now);
      const frozenIds = params.frozenRows.map((r) => r.id);

      // 1. Conserve all frozen historical rows untouched — only seal their recurrenceEndAt
      await tx.lesson.updateMany({
        where: { id: { in: frozenIds } },
        data: { recurrenceEndAt: retirementCutoff },
      });

      // 2. Delete upcoming unused rows of the superseded slot
      const mutableIds = params.mutableFutureRows.map((r) => r.id);
      if (mutableIds.length > 0) {
        await tx.announcement.deleteMany({
          where: { lessonId: { in: mutableIds } },
        });
        await tx.lesson.deleteMany({
          where: { id: { in: mutableIds } },
        });
      }

      // 3. Create the new active future Lesson row starting at newStartsAt
      const created = await tx.lesson.create({
        data: {
          classId: params.classId,
          teacherId: params.teacherId,
          classroomId: params.classroomId,
          branchId: params.branchId,
          startsAt: params.newStartsAt,
          endsAt: params.newEndsAt,
          isExtra: params.isExtra,
          isCatchUp: params.isCatchUp,
          isFree: params.isFree,
          extraFee: null,
          recurrenceStartAt: newRecurrenceStartAt,
          recurrenceEndAt: null,
          isSingleOccurrence: false,
          lessonGroups: {
            create: params.allAssociatedClassIds.map((cid) => ({ classId: cid })),
          },
        },
        include: {
          branch: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          teacher: true,
        },
      });

      return {
        lesson: created,
        preservedHistoryCount: frozenIds.length,
        createdNewRow: true,
      };
    }

    // Zero frozen rows: safe to update the upcoming unused row in place
    const keepId = params.mutableFutureRows.some((r) => r.id === params.lessonId)
      ? params.lessonId
      : params.mutableFutureRows[0]?.id ?? params.lessonId;

    const redundantIds = params.mutableFutureRows
      .map((r) => r.id)
      .filter((id) => id !== keepId);

    if (redundantIds.length > 0) {
      await tx.announcement.deleteMany({
        where: { lessonId: { in: redundantIds } },
      });
      await tx.lesson.deleteMany({
        where: { id: { in: redundantIds } },
      });
    }

    const updated = await tx.lesson.update({
      where: { id: keepId },
      data: {
        classId: params.classId,
        teacherId: params.teacherId,
        classroomId: params.classroomId,
        branchId: params.branchId,
        startsAt: params.newStartsAt,
        endsAt: params.newEndsAt,
        isExtra: params.isExtra,
        isCatchUp: params.isCatchUp,
        isFree: params.isFree,
        extraFee: null,
        recurrenceStartAt: newRecurrenceStartAt,
        recurrenceEndAt: null,
        isSingleOccurrence: false,
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        teacher: true,
      },
    });

    await tx.lessonGroup.deleteMany({ where: { lessonId: keepId } });
    if (params.allAssociatedClassIds.length > 0) {
      await tx.lessonGroup.createMany({
        data: params.allAssociatedClassIds.map((cid) => ({
          lessonId: keepId,
          classId: cid,
        })),
        skipDuplicates: true,
      });
    }

    return {
      lesson: updated,
      preservedHistoryCount: 0,
      createdNewRow: false,
    };
  });
}

/**
 * Edits ONLY a single historical occurrence of a normal lesson (e.g. when viewing a past week
 * on the Timetable). Never modifies other past weeks, never modifies the active ongoing recurring
 * schedule, and never causes the edited past occurrence to repeat in future weeks.
 */
export async function applyNormalLessonSinglePastEdit(params: {
  lessonId: number;
  instanceDateStr: string;
  classId: number;
  teacherId: string;
  classroomId: number;
  branchId: number;
  targetStartsAt: Date;
  targetEndsAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.lesson.findUnique({
      where: { id: params.lessonId },
      include: {
        lessonGroups: { select: { classId: true } },
      },
    });
    if (!existing) {
      throw new Error("Lesson not found");
    }

    const originalSlotKey = existing.overridesSlotKey || getLessonSlotKey(existing);
    const originalDate = existing.overridesDate || params.instanceDateStr;

    // Case 1: Already a single-occurrence row -> update strictly in place
    if (existing.isSingleOccurrence) {
      const updated = await tx.lesson.update({
        where: { id: existing.id },
        data: {
          classId: params.classId,
          teacherId: params.teacherId,
          classroomId: params.classroomId,
          branchId: params.branchId,
          startsAt: params.targetStartsAt,
          endsAt: params.targetEndsAt,
          isSingleOccurrence: true,
          recurrenceStartAt: null,
          recurrenceEndAt: null,
          overridesDate: originalDate,
          overridesSlotKey: originalSlotKey,
        },
        include: {
          branch: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      });
      await tx.lessonGroup.deleteMany({ where: { lessonId: existing.id } });
      await tx.lessonGroup.createMany({
        data: [{ lessonId: existing.id, classId: params.classId }],
        skipDuplicates: true,
      });
      return updated;
    }

    const existingDateStr = getAlgiersDateInfo(existing.startsAt).dateStr;

    // Case 2: The clicked row IS the real DB row for this exact past date
    if (existingDateStr === params.instanceDateStr) {
      // Ensure the ongoing recurring series keeps at least one recurring anchor row
      // before we convert `existing` into a single-occurrence row.
      const otherCandidates = await tx.lesson.findMany({
        where: {
          id: { not: existing.id },
          classId: existing.classId,
          isExtra: false,
          isCatchUp: false,
          isFree: false,
          isSingleOccurrence: false,
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          isExtra: true,
          isCatchUp: true,
          isFree: true,
          isSingleOccurrence: true,
          recurrenceStartAt: true,
          recurrenceEndAt: true,
        },
      });

      const hasOtherSeriesAnchor = otherCandidates.some((c) =>
        doesSameRecurrenceSeriesMatch(c, existing)
      );

      if (!hasOtherSeriesAnchor) {
        const nextWeekDateStr = addDaysToDateStr(existingDateStr, 7);
        const prevWeekDateStr = addDaysToDateStr(existingDateStr, -7);
        const nextWeekProj = projectLessonTimeToDateStr(
          existing.startsAt,
          existing.endsAt,
          nextWeekDateStr
        );
        const prevWeekProj = projectLessonTimeToDateStr(
          existing.startsAt,
          existing.endsAt,
          prevWeekDateStr
        );

        let anchorProj: { startsAt: Date; endsAt: Date } | null = null;
        if (
          isRecurringOccurrenceActive(
            nextWeekProj.startsAt,
            nextWeekProj.endsAt,
            existing
          )
        ) {
          anchorProj = nextWeekProj;
        } else if (
          isRecurringOccurrenceActive(
            prevWeekProj.startsAt,
            prevWeekProj.endsAt,
            existing
          )
        ) {
          anchorProj = prevWeekProj;
        }

        if (anchorProj) {
          const anchor = await tx.lesson.create({
            data: {
              classId: existing.classId,
              teacherId: existing.teacherId,
              classroomId: existing.classroomId,
              branchId: existing.branchId,
              startsAt: anchorProj.startsAt,
              endsAt: anchorProj.endsAt,
              isExtra: false,
              isCatchUp: false,
              isFree: false,
              isTeacherAbsent: false,
              extraFee: null,
              recurrenceStartAt: existing.recurrenceStartAt,
              recurrenceEndAt: existing.recurrenceEndAt,
              isSingleOccurrence: false,
            },
          });
          if (existing.lessonGroups && existing.lessonGroups.length > 0) {
            await tx.lessonGroup.createMany({
              data: existing.lessonGroups.map((lg) => ({
                lessonId: anchor.id,
                classId: lg.classId,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      // Convert `existing` in place so all linked attendances/catch-ups/vouchers remain intact
      const updated = await tx.lesson.update({
        where: { id: existing.id },
        data: {
          classId: params.classId,
          teacherId: params.teacherId,
          classroomId: params.classroomId,
          branchId: params.branchId,
          startsAt: params.targetStartsAt,
          endsAt: params.targetEndsAt,
          isSingleOccurrence: true,
          recurrenceStartAt: null,
          recurrenceEndAt: null,
          overridesDate: originalDate,
          overridesSlotKey: originalSlotKey,
        },
        include: {
          branch: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      });
      await tx.lessonGroup.deleteMany({ where: { lessonId: existing.id } });
      await tx.lessonGroup.createMany({
        data: [{ lessonId: existing.id, classId: params.classId }],
        skipDuplicates: true,
      });
      return updated;
    }

    // Case 3: The clicked card on the past week was projected from another week's template row.
    // Leave the template row 100% untouched and create (or update) a single-occurrence override for this date.
    const existingOverride = await tx.lesson.findFirst({
      where: {
        isSingleOccurrence: true,
        overridesDate: originalDate,
        overridesSlotKey: originalSlotKey,
      },
      select: { id: true },
    });

    if (existingOverride) {
      const updated = await tx.lesson.update({
        where: { id: existingOverride.id },
        data: {
          classId: params.classId,
          teacherId: params.teacherId,
          classroomId: params.classroomId,
          branchId: params.branchId,
          startsAt: params.targetStartsAt,
          endsAt: params.targetEndsAt,
        },
        include: {
          branch: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      });
      await tx.lessonGroup.deleteMany({ where: { lessonId: existingOverride.id } });
      await tx.lessonGroup.createMany({
        data: [{ lessonId: existingOverride.id, classId: params.classId }],
        skipDuplicates: true,
      });
      return updated;
    }

    const created = await tx.lesson.create({
      data: {
        classId: params.classId,
        teacherId: params.teacherId,
        classroomId: params.classroomId,
        branchId: params.branchId,
        startsAt: params.targetStartsAt,
        endsAt: params.targetEndsAt,
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isTeacherAbsent: false,
        extraFee: null,
        recurrenceStartAt: null,
        recurrenceEndAt: null,
        isSingleOccurrence: true,
        overridesDate: originalDate,
        overridesSlotKey: originalSlotKey,
        lessonGroups: {
          create: [{ classId: params.classId }],
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });
    return created;
  });
}

/**
 * Non-destructively stops a normal recurring lesson from appearing in future weeks
 * while preserving all past/frozen dates, attendance records, catch-up links, and payroll history.
 * If the slot has zero frozen rows (upcoming & unused), cleanly deletes the unused row(s).
 */
export async function retireOrDeleteNormalLesson(
  lessonId: number,
  now: Date = new Date()
): Promise<{
  mode: "retired" | "deleted";
  preservedHistoryCount: number;
  deletedFutureCount: number;
}> {
  const { frozenRows, mutableFutureRows } = await findSeriesLessonsWithUsage(
    lessonId,
    now
  );

  return prisma.$transaction(async (tx) => {
    if (frozenRows.length > 0) {
      const retirementCutoff = computeRetirementCutoff(frozenRows, now);
      const frozenIds = frozenRows.map((r) => r.id);

      await tx.lesson.updateMany({
        where: { id: { in: frozenIds } },
        data: { recurrenceEndAt: retirementCutoff },
      });

      // Remove announcements for retired future projections (only upcoming non-expired ones)
      await tx.announcement.deleteMany({
        where: {
          lessonId: { in: frozenIds },
          expiresAt: { gt: now },
        },
      });

      const mutableIds = mutableFutureRows.map((r) => r.id);
      if (mutableIds.length > 0) {
        await tx.announcement.deleteMany({
          where: { lessonId: { in: mutableIds } },
        });
        await tx.lesson.deleteMany({
          where: { id: { in: mutableIds } },
        });
      }

      return {
        mode: "retired",
        preservedHistoryCount: frozenIds.length,
        deletedFutureCount: mutableIds.length,
      };
    }

    const deleteIds = mutableFutureRows.map((r) => r.id);
    if (deleteIds.length > 0) {
      await tx.announcement.deleteMany({
        where: { lessonId: { in: deleteIds } },
      });
      await tx.catchUpAttendance.deleteMany({
        where: {
          OR: [
            { missedLessonId: { in: deleteIds } },
            { catchUpLessonId: { in: deleteIds } },
          ],
        },
      });
      await tx.attendance.deleteMany({
        where: { lessonId: { in: deleteIds } },
      });
      await tx.lesson.deleteMany({
        where: { id: { in: deleteIds } },
      });
    }

    return {
      mode: "deleted",
      preservedHistoryCount: 0,
      deletedFutureCount: deleteIds.length,
    };
  });
}
