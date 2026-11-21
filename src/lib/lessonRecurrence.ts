import { getAlgiersDateInfo, type AlgiersWeekday } from "./algiersDate";

export interface LessonRecurrenceLike {
  id?: number;
  classId?: number | null;
  branchId?: number | null;
  teacherId?: string | null;
  classroomId?: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
  isExtra?: boolean | null;
  isCatchUp?: boolean | null;
  isFree?: boolean | null;
  isWorkshop?: boolean | null;
  isTeacherAbsent?: boolean | null;
  recurrenceStartAt?: Date | string | null;
  recurrenceEndAt?: Date | string | null;
  isSingleOccurrence?: boolean | null;
  overridesDate?: string | null;
  overridesSlotKey?: string | null;
  attendances?: Array<any> | null;
  _count?: {
    attendances?: number;
    missedByCatchUps?: number;
    catchUpVisitsHosted?: number;
    vouchers?: number;
  } | null;
}

const ORDERED_WEEKDAYS: readonly AlgiersWeekday[] = [
  "SATURDAY",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

/**
 * Returns true if the lesson is a one-off special lesson (extra, catch-up, or free).
 */
export function isSpecialLesson(lesson: {
  isExtra?: boolean | null;
  isCatchUp?: boolean | null;
  isFree?: boolean | null;
}): boolean {
  return Boolean(lesson.isExtra || lesson.isCatchUp || lesson.isFree);
}

/**
 * Returns true if the lesson belongs to a recurring weekly normal series
 * (neither special, nor workshop, nor a single-occurrence past edit).
 */
export function isRecurringNormalLesson(lesson: {
  isExtra?: boolean | null;
  isCatchUp?: boolean | null;
  isFree?: boolean | null;
  isWorkshop?: boolean | null;
  isSingleOccurrence?: boolean | null;
}): boolean {
  return (
    !isSpecialLesson(lesson) &&
    !lesson.isWorkshop &&
    !lesson.isSingleOccurrence
  );
}

/**
 * Builds a deterministic UTC Date from an Africa/Algiers calendar date ("YYYY-MM-DD")
 * and local time ("HH:mm"). Algeria is strictly UTC+1 year-round with no DST.
 */
export function buildAlgiersTimestamp(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.trim().split("-").map(Number);
  const [hours, minutes] = (timeStr || "00:00").trim().split(":").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, (hours || 0) - 1, minutes || 0, 0, 0)
  );
}

/**
 * Adds a signed integer number of days to a "YYYY-MM-DD" calendar date string.
 */
export function addDaysToDateStr(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.trim().split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

/**
 * Returns the Saturday-to-Friday calendar date map ("YYYY-MM-DD") for the Algerian week
 * containing `referenceDate`.
 */
export function getAlgiersWeekDayDates(
  referenceDate: Date = new Date()
): Record<AlgiersWeekday, string> {
  const refInfo = getAlgiersDateInfo(referenceDate);
  const refMiddayUtc = new Date(
    Date.UTC(refInfo.year, refInfo.month - 1, refInfo.day, 12, 0, 0, 0)
  );
  const dow = refMiddayUtc.getUTCDay(); // 0 = Sun, ..., 6 = Sat
  const diffToSaturday = (dow + 1) % 7;
  const satMiddayUtc = new Date(
    refMiddayUtc.getTime() - diffToSaturday * 86400000
  );

  const satYear = satMiddayUtc.getUTCFullYear();
  const satMonth = satMiddayUtc.getUTCMonth();
  const satDay = satMiddayUtc.getUTCDate();

  const dayDates = {} as Record<AlgiersWeekday, string>;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(satYear, satMonth, satDay + i, 12, 0, 0, 0));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dayNum = String(d.getUTCDate()).padStart(2, "0");
    dayDates[ORDERED_WEEKDAYS[i]] = `${y}-${m}-${dayNum}`;
  }
  return dayDates;
}

/**
 * Canonical slot key for a lesson based on (classId, weekday, startTime, endTime) in Africa/Algiers.
 */
export function getLessonSlotKey(lesson: {
  classId?: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
}): string {
  const sInfo = getAlgiersDateInfo(lesson.startsAt);
  const eInfo = getAlgiersDateInfo(lesson.endsAt);
  return `${lesson.classId ?? 0}-${sInfo.weekday}-${sInfo.timeStr}-${eInfo.timeStr}`;
}

/**
 * Canonical series key distinguishing historical generations of the same slot via
 * recurrence lifecycle bounds while keeping legacy rows (both bounds null) collapsed identically.
 */
export function getRecurringSeriesKey(lesson: {
  classId?: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
  recurrenceStartAt?: Date | string | null;
  recurrenceEndAt?: Date | string | null;
}): string {
  const slotKey = getLessonSlotKey(lesson);
  const rsMs = lesson.recurrenceStartAt
    ? new Date(lesson.recurrenceStartAt).getTime()
    : NaN;
  const reMs = lesson.recurrenceEndAt
    ? new Date(lesson.recurrenceEndAt).getTime()
    : NaN;
  const rsPart = !isNaN(rsMs) ? String(rsMs) : "";
  const rePart = !isNaN(reMs) ? String(reMs) : "";
  return `${slotKey}|rs:${rsPart}|re:${rePart}`;
}

/**
 * Returns true if the lesson row has recorded attendance, catch-up links, vouchers, or teacher absence.
 */
export function hasLessonRecordedActivity(lesson: LessonRecurrenceLike): boolean {
  if (lesson.isTeacherAbsent) return true;
  if (Array.isArray(lesson.attendances) && lesson.attendances.length > 0) {
    return true;
  }
  if (lesson._count) {
    if ((lesson._count.attendances ?? 0) > 0) return true;
    if ((lesson._count.missedByCatchUps ?? 0) > 0) return true;
    if ((lesson._count.catchUpVisitsHosted ?? 0) > 0) return true;
    if ((lesson._count.vouchers ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Determines whether an existing Lesson row is frozen and must NEVER be mutated or deleted
 * when updating or deleting a normal recurring lesson.
 *
 * Rule: Any session that has already ended (`endsAt <= now`) OR already has recorded
 * attendance, catch-up links, vouchers, or teacher absence is frozen.
 */
export function isLessonRowFrozen(
  lesson: LessonRecurrenceLike,
  now: Date = new Date()
): boolean {
  const endMs = new Date(lesson.endsAt).getTime();
  if (!isNaN(endMs) && endMs <= now.getTime()) {
    return true;
  }
  return hasLessonRecordedActivity(lesson);
}

/**
 * Computes the retirement cutoff timestamp (`recurrenceEndAt`) when retiring a recurring slot
 * that has one or more frozen rows.
 *
 * Guarantees every frozen row's `endsAt <= cutoff` while any unrecorded future occurrence
 * (`endsAt > cutoff`) is immediately retired.
 */
export function computeRetirementCutoff(
  frozenRows: Array<{ endsAt: Date | string }>,
  now: Date = new Date()
): Date {
  let cutoffMs = now.getTime();
  for (const row of frozenRows) {
    const endMs = new Date(row.endsAt).getTime();
    if (!isNaN(endMs) && endMs > cutoffMs) {
      cutoffMs = endMs;
    }
  }
  return new Date(cutoffMs);
}

/**
 * Partitions frozen rows when retiring a recurring normal lesson series:
 * - Past and same-day frozen rows remain in the retired series with `recurrenceEndAt` capped
 *   so an already-earlier `recurrenceEndAt` is never extended forward (preventing resurrection).
 * - Strictly future-date frozen rows (e.g. anticipatory catch-ups or pre-marked absence on a
 *   later week) are detached into standalone `isSingleOccurrence` rows so their records stay
 *   intact without keeping unrecorded intermediate weeks alive.
 */
export function partitionFrozenRowsForRetirement<
  T extends {
    startsAt: Date | string;
    endsAt: Date | string;
    recurrenceEndAt?: Date | string | null;
  }
>(
  frozenRows: T[],
  now: Date = new Date()
): {
  seriesFrozenRows: T[];
  detachedFutureFrozenRows: T[];
  retirementCutoff: Date;
} {
  const todayDateStr = getAlgiersDateInfo(now).dateStr;
  const seriesFrozenRows: T[] = [];
  const detachedFutureFrozenRows: T[] = [];

  for (const row of frozenRows) {
    const endMs = new Date(row.endsAt).getTime();
    const rowDateStr = getAlgiersDateInfo(row.startsAt).dateStr;
    if ((!isNaN(endMs) && endMs <= now.getTime()) || rowDateStr <= todayDateStr) {
      seriesFrozenRows.push(row);
    } else {
      detachedFutureFrozenRows.push(row);
    }
  }

  let cutoffMs = computeRetirementCutoff(seriesFrozenRows, now).getTime();
  const existingCutoffs = seriesFrozenRows
    .map((r) => (r.recurrenceEndAt ? new Date(r.recurrenceEndAt).getTime() : NaN))
    .filter((ms) => !isNaN(ms));
  if (existingCutoffs.length > 0) {
    cutoffMs = Math.min(cutoffMs, ...existingCutoffs);
  }

  return {
    seriesFrozenRows,
    detachedFutureFrozenRows,
    retirementCutoff: new Date(cutoffMs),
  };
}

/**
 * Checks whether a recurring slot with optional `[recurrenceStartAt, recurrenceEndAt]` bounds
 * is active for an occurrence spanning `[occurrenceStartsAt, occurrenceEndsAt]`.
 */
export function isRecurringOccurrenceActive(
  occurrenceStartsAt: Date | string,
  occurrenceEndsAt: Date | string,
  series: {
    recurrenceStartAt?: Date | string | null;
    recurrenceEndAt?: Date | string | null;
  }
): boolean {
  const occStartMs = new Date(occurrenceStartsAt).getTime();
  const occEndMs = new Date(occurrenceEndsAt).getTime();
  if (isNaN(occStartMs) || isNaN(occEndMs)) return false;

  if (series.recurrenceStartAt != null) {
    const rsMs = new Date(series.recurrenceStartAt).getTime();
    if (!isNaN(rsMs) && occStartMs < rsMs) {
      return false;
    }
  }

  if (series.recurrenceEndAt != null) {
    const reMs = new Date(series.recurrenceEndAt).getTime();
    if (!isNaN(reMs) && occEndMs > reMs) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether a recurring lesson row is currently active going forward from `now`.
 */
export function isActiveRecurringRow(
  row: {
    isExtra?: boolean | null;
    isCatchUp?: boolean | null;
    isFree?: boolean | null;
    isSingleOccurrence?: boolean | null;
    recurrenceEndAt?: Date | string | null;
  },
  now: Date = new Date()
): boolean {
  if (!isRecurringNormalLesson(row)) return false;
  if (row.recurrenceEndAt == null) return true;
  const reMs = new Date(row.recurrenceEndAt).getTime();
  return !isNaN(reMs) && reMs > now.getTime();
}

/**
 * Determines whether `candidate` belongs to the same recurrence series cohort as `base`
 * (same weekday/startTime/endTime and compatible lifecycle state — never mixing an active
 * series with an already-retired historical generation).
 */
export function doesSameRecurrenceSeriesMatch(
  candidate: {
    startsAt: Date | string;
    endsAt: Date | string;
    isExtra?: boolean | null;
    isCatchUp?: boolean | null;
    isFree?: boolean | null;
    isSingleOccurrence?: boolean | null;
    recurrenceStartAt?: Date | string | null;
    recurrenceEndAt?: Date | string | null;
  },
  base: {
    startsAt: Date | string;
    endsAt: Date | string;
    isExtra?: boolean | null;
    isCatchUp?: boolean | null;
    isFree?: boolean | null;
    isSingleOccurrence?: boolean | null;
    recurrenceStartAt?: Date | string | null;
    recurrenceEndAt?: Date | string | null;
  }
): boolean {
  if (!isRecurringNormalLesson(candidate) || !isRecurringNormalLesson(base)) {
    return false;
  }

  const cStart = getAlgiersDateInfo(candidate.startsAt);
  const cEnd = getAlgiersDateInfo(candidate.endsAt);
  const bStart = getAlgiersDateInfo(base.startsAt);
  const bEnd = getAlgiersDateInfo(base.endsAt);

  if (
    cStart.weekday !== bStart.weekday ||
    cStart.timeStr !== bStart.timeStr ||
    cEnd.timeStr !== bEnd.timeStr
  ) {
    return false;
  }

  const baseReMs = base.recurrenceEndAt
    ? new Date(base.recurrenceEndAt).getTime()
    : null;
  const candReMs = candidate.recurrenceEndAt
    ? new Date(candidate.recurrenceEndAt).getTime()
    : null;

  // Active series only matches other active rows (never already-retired past generations)
  if (baseReMs === null) {
    return candReMs === null;
  }

  // Retired series only matches rows from the exact same retired generation
  if (candReMs !== baseReMs) return false;

  const baseRsMs = base.recurrenceStartAt
    ? new Date(base.recurrenceStartAt).getTime()
    : null;
  const candRsMs = candidate.recurrenceStartAt
    ? new Date(candidate.recurrenceStartAt).getTime()
    : null;
  return baseRsMs === candRsMs;
}

/**
 * Computes the very next upcoming occurrence of `(day, startTime, endTime)` from `now`
 * in Africa/Algiers, skipping any calendar dates in `skipDates` (e.g. a frozen same-day
 * session that already took attendance/absence).
 *
 * Examples (if `now` is Wednesday 12:00):
 * - Mon 10:00–12:00 → Thu 14:00–16:00: returns THIS Thursday 14:00–16:00.
 * - Thu 14:00–16:00 → Mon 10:00–12:00: returns NEXT Monday 10:00–12:00.
 * - Wed 14:00–16:00 (unused) → Wed 15:00–17:00: returns TODAY Wed 15:00–17:00.
 * - Wed 14:00–16:00 (frozen today) → Wed 15:00–17:00: skips today, returns NEXT Wed 15:00–17:00.
 */
export function getNextUpcomingOccurrence(params: {
  day: string;
  startTime: string;
  endTime: string;
  now?: Date;
  skipDates?: Set<string>;
}): { dateStr: string; startsAt: Date; endsAt: Date } {
  const now = params.now ?? new Date();
  const normalizedDay = (params.day || "SATURDAY").toUpperCase() as AlgiersWeekday;
  const weekDayDates = getAlgiersWeekDayDates(now);
  let candidateDateStr =
    weekDayDates[normalizedDay] ?? weekDayDates.SATURDAY;

  let startsAt = buildAlgiersTimestamp(candidateDateStr, params.startTime);
  let endsAt = buildAlgiersTimestamp(candidateDateStr, params.endTime);

  for (let i = 0; i < 104; i++) {
    const isAlreadyEnded = endsAt.getTime() <= now.getTime();
    const isSkippedDate = Boolean(params.skipDates?.has(candidateDateStr));
    if (!isAlreadyEnded && !isSkippedDate) {
      break;
    }
    candidateDateStr = addDaysToDateStr(candidateDateStr, 7);
    startsAt = buildAlgiersTimestamp(candidateDateStr, params.startTime);
    endsAt = buildAlgiersTimestamp(candidateDateStr, params.endTime);
  }

  return { dateStr: candidateDateStr, startsAt, endsAt };
}

/**
 * Computes the exact calendar date & timestamps for a single-occurrence edit within the
 * Algerian week containing `instanceDateStr`.
 */
export function buildSingleOccurrenceTargetInWeek(params: {
  instanceDateStr: string;
  day: string;
  startTime: string;
  endTime: string;
}): { dateStr: string; startsAt: Date; endsAt: Date } {
  const cleanDate = params.instanceDateStr.trim();
  const refMidday = new Date(`${cleanDate}T12:00:00Z`);
  const weekDayDates = !isNaN(refMidday.getTime())
    ? getAlgiersWeekDayDates(refMidday)
    : getAlgiersWeekDayDates(new Date());

  const normalizedDay = (params.day || "").toUpperCase() as AlgiersWeekday;
  const targetDateStr = weekDayDates[normalizedDay] || cleanDate;
  const startsAt = buildAlgiersTimestamp(targetDateStr, params.startTime);
  const endsAt = buildAlgiersTimestamp(targetDateStr, params.endTime);

  return { dateStr: targetDateStr, startsAt, endsAt };
}
