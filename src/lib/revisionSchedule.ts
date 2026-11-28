import { getAlgiersDateInfo, formatAlgiersDate, type AlgiersWeekday } from "./algiersDate";
import {
  addDaysToDateStr,
  isActiveRecurringRow,
  isRecurringOccurrenceActive,
  getLessonSlotKey,
} from "./lessonRecurrence";
import { projectLessonTimeToDateStr } from "./utils";

export interface RevisionLessonLike {
  id: number;
  classId: number;
  branchId: number;
  branch?: { id?: number; name?: string | null } | null;
  branchName?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  isExtra?: boolean | null;
  isCatchUp?: boolean | null;
  isFree?: boolean | null;
  isTeacherAbsent?: boolean | null;
  isSingleOccurrence?: boolean | null;
  recurrenceStartAt?: Date | string | null;
  recurrenceEndAt?: Date | string | null;
}

export interface RevisionLessonOption {
  /** Deterministic unique key: "lesson:<id>" or "virtual:<templateId>:<YYYY-MM-DD>" */
  key: string;
  /** Materialized Lesson.id if a DB row already exists for this date/slot, otherwise null */
  lessonId: number | null;
  /** Base Lesson.id used for resolveOrCreateLessonForDate when lessonId is null */
  templateLessonId: number;
  /** Calendar date in Africa/Algiers ("YYYY-MM-DD") */
  targetDateStr: string;
  /** Formatted date in Africa/Algiers ("DD/MM/YYYY") */
  displayDate: string;
  /** Algiers weekday name */
  weekday: AlgiersWeekday;
  /** Local start time "HH:mm" */
  startTime: string;
  /** Local end time "HH:mm" */
  endTime: string;
  startsAt: string;
  endsAt: string;
  branchId: number;
  branchName: string;
  isExtra: boolean;
  isCatchUp: boolean;
  /** True when targetDateStr <= today (Algiers): defaults to immediate PRESENT check-in */
  isTodayOrPast: boolean;
  /** True if this option corresponds to the currently opened lessonId */
  isCurrentLesson: boolean;
  /** True if the currently selected student already has an active revision booking here */
  isAlreadyBookedByStudent: boolean;
}

/**
 * Builds a clean, deduplicated, chronologically sorted list of selectable revision sessions
 * for a group — combining already-materialized DB Lesson rows (recurring & extra) with
 * projected upcoming weekly recurring occurrences.
 */
export function buildRevisionLessonOptions(params: {
  lessons: RevisionLessonLike[];
  currentLessonId?: number | null;
  now?: Date;
  weeksAhead?: number;
  bookedLessonIds?: Iterable<number>;
  bookedDateSlotKeys?: Iterable<string>;
  allowedBranchIds?: Set<number> | null;
}): RevisionLessonOption[] {
  const now = params.now ?? new Date();
  const todayStr = getAlgiersDateInfo(now).dateStr;
  const weeksAhead = Math.max(1, Math.min(12, params.weeksAhead ?? 6));
  const maxDateStr = addDaysToDateStr(todayStr, weeksAhead * 7);

  const bookedLessonIdSet = new Set<number>(params.bookedLessonIds ?? []);
  const bookedSlotSet = new Set<string>(params.bookedDateSlotKeys ?? []);

  const currentLesson =
    params.currentLessonId != null
      ? params.lessons.find((l) => l.id === params.currentLessonId) ?? null
      : null;
  const currentLessonDateStr = currentLesson
    ? getAlgiersDateInfo(currentLesson.startsAt).dateStr
    : null;

  // Earliest date to include: today, or currentLesson's date if opened on a historical lesson
  const minDateStr =
    currentLessonDateStr && currentLessonDateStr < todayStr
      ? currentLessonDateStr
      : todayStr;

  const options: RevisionLessonOption[] = [];
  const seenDateSlotKeys = new Set<string>();
  const seenLessonIds = new Set<number>();

  const makeSlotKey = (
    dateStr: string,
    startTime: string,
    endTime: string,
    branchId: number
  ) => `${dateStr}|${startTime}|${endTime}|${branchId}`;

  // 1. Add already-materialized DB lessons (recurring, extra, catch-up) within [minDateStr, maxDateStr]
  const sortedMaterialized = [...params.lessons].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  for (const lesson of sortedMaterialized) {
    if (lesson.isFree || lesson.isTeacherAbsent) continue;
    if (
      params.allowedBranchIds &&
      !params.allowedBranchIds.has(lesson.branchId)
    ) {
      continue;
    }

    const sInfo = getAlgiersDateInfo(lesson.startsAt);
    const eInfo = getAlgiersDateInfo(lesson.endsAt);
    const isCurrent = params.currentLessonId != null && lesson.id === params.currentLessonId;

    // Include if it's the currently opened lesson OR within [minDateStr, maxDateStr]
    if (!isCurrent && (sInfo.dateStr < minDateStr || sInfo.dateStr > maxDateStr)) {
      continue;
    }

    const slotKey = makeSlotKey(sInfo.dateStr, sInfo.timeStr, eInfo.timeStr, lesson.branchId);
    if (seenLessonIds.has(lesson.id)) continue;
    // If two rows share the exact same date+time+branch, prefer the currently opened lesson or latest
    if (seenDateSlotKeys.has(slotKey) && !isCurrent) continue;

    seenLessonIds.add(lesson.id);
    seenDateSlotKeys.add(slotKey);

    const branchName =
      lesson.branch?.name ||
      lesson.branchName ||
      `Branch #${lesson.branchId}`;

    options.push({
      key: `lesson:${lesson.id}`,
      lessonId: lesson.id,
      templateLessonId: lesson.id,
      targetDateStr: sInfo.dateStr,
      displayDate: formatAlgiersDate(lesson.startsAt),
      weekday: sInfo.weekday,
      startTime: sInfo.timeStr,
      endTime: eInfo.timeStr,
      startsAt: new Date(lesson.startsAt).toISOString(),
      endsAt: new Date(lesson.endsAt).toISOString(),
      branchId: lesson.branchId,
      branchName,
      isExtra: Boolean(lesson.isExtra),
      isCatchUp: Boolean(lesson.isCatchUp),
      isTodayOrPast: sInfo.dateStr <= todayStr,
      isCurrentLesson: isCurrent,
      isAlreadyBookedByStudent:
        bookedLessonIdSet.has(lesson.id) || bookedSlotSet.has(slotKey),
    });
  }

  // 2. Project active recurring weekly series forward up to weeksAhead
  // Deduplicate recurring templates by (slotKey + branchId) keeping the latest row per series
  const activeRecurringTemplates = new Map<string, RevisionLessonLike>();
  for (const lesson of sortedMaterialized) {
    if (!isActiveRecurringRow(lesson, now)) continue;
    if (lesson.isFree) continue;
    if (
      params.allowedBranchIds &&
      !params.allowedBranchIds.has(lesson.branchId)
    ) {
      continue;
    }
    const templateKey = `${getLessonSlotKey(lesson)}|b:${lesson.branchId}`;
    activeRecurringTemplates.set(templateKey, lesson);
  }

  // Also collect dates where a teacher-absent materialized row exists so we never project over it
  const teacherAbsentSlots = new Set<string>();
  for (const lesson of params.lessons) {
    if (lesson.isTeacherAbsent) {
      const sInfo = getAlgiersDateInfo(lesson.startsAt);
      const eInfo = getAlgiersDateInfo(lesson.endsAt);
      teacherAbsentSlots.add(
        makeSlotKey(sInfo.dateStr, sInfo.timeStr, eInfo.timeStr, lesson.branchId)
      );
    }
  }

  for (const template of activeRecurringTemplates.values()) {
    const baseStart = getAlgiersDateInfo(template.startsAt);
    const baseEnd = getAlgiersDateInfo(template.endsAt);

    // Find the first occurrence on or after todayStr sharing the template's weekday
    const todayMidday = new Date(`${todayStr}T12:00:00Z`);
    const baseMidday = new Date(`${baseStart.dateStr}T12:00:00Z`);
    const diffDays = Math.round(
      (todayMidday.getTime() - baseMidday.getTime()) / 86400000
    );
    const remainder = ((diffDays % 7) + 7) % 7;
    const firstOnOrAfterToday =
      remainder === 0 ? todayStr : addDaysToDateStr(todayStr, 7 - remainder);

    for (let w = 0; w <= weeksAhead; w++) {
      const candidateDateStr = addDaysToDateStr(firstOnOrAfterToday, w * 7);
      if (candidateDateStr > maxDateStr) break;

      const slotKey = makeSlotKey(
        candidateDateStr,
        baseStart.timeStr,
        baseEnd.timeStr,
        template.branchId
      );
      if (seenDateSlotKeys.has(slotKey) || teacherAbsentSlots.has(slotKey)) {
        continue;
      }

      const projected = projectLessonTimeToDateStr(
        template.startsAt,
        template.endsAt,
        candidateDateStr
      );

      if (!isRecurringOccurrenceActive(projected.startsAt, projected.endsAt, template)) {
        continue;
      }

      seenDateSlotKeys.add(slotKey);
      const branchName =
        template.branch?.name ||
        template.branchName ||
        `Branch #${template.branchId}`;

      options.push({
        key: `virtual:${template.id}:${candidateDateStr}`,
        lessonId: null,
        templateLessonId: template.id,
        targetDateStr: candidateDateStr,
        displayDate: formatAlgiersDate(projected.startsAt),
        weekday: baseStart.weekday,
        startTime: baseStart.timeStr,
        endTime: baseEnd.timeStr,
        startsAt: projected.startsAt.toISOString(),
        endsAt: projected.endsAt.toISOString(),
        branchId: template.branchId,
        branchName,
        isExtra: false,
        isCatchUp: false,
        isTodayOrPast: candidateDateStr <= todayStr,
        isCurrentLesson: false,
        isAlreadyBookedByStudent: bookedSlotSet.has(slotKey),
      });
    }
  }

  options.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  return options;
}

/**
 * Splits a combined bundle total cleanly across `count` revision sessions,
 * putting any rounding remainder (e.g. 1 DZD) on the first session so the sum
 * matches `total` identically.
 */
export function splitTotalAcrossSessions(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total * 100) / 100);
  if (count === 1) return [safeTotal];

  const base = Math.floor((safeTotal / count) * 100) / 100;
  const amounts = Array<number>(count).fill(base);
  const sum = Math.round(base * count * 100) / 100;
  const remainder = Math.round((safeTotal - sum) * 100) / 100;
  amounts[0] = Math.round((amounts[0] + remainder) * 100) / 100;
  return amounts;
}
